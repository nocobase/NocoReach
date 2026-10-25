import {
  Fragment,
  isValidElement,
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { I18nRuntime } from '@nocobase/i18n';
import english from '../../shared/i18n/en.json';
import { resolveLocale, type SupportedLocale } from '../../shared/i18n/locales';
import chinese from '../../shared/i18n/zh.json';
import legacyKeys from '../../shared/i18n/legacy-keys.json';
import { systemMessageKey } from '../../shared/i18n/messages';
import { readStoredLocale } from '@nocobase/app-client';
import { nocobaseClient } from '#lib/nocoreach-api';
import { findNetworkFailure, HOST_PATTERN } from '#lib/network-failure';
import { networkFailureEntries } from '../../shared/network-failures';

// Business copy uses semantic keys and explicit language resources. The application runtime
// owns the resolved locale; this synchronous adapter also supports deferred messages and JSX slots.
// Legacy text recognition is confined to the explicitly named compatibility readers below.
import { youtubeSystemErrors } from '#lib/youtube-errors';
type Vars = Record<string | number, unknown>;
type Pattern = { re: RegExp; en: string };
let dictionary: Record<string, string> | null = null;
let currentLocale: SupportedLocale = 'zh-CN';
let patterns: Pattern[] | null = null;
let shortPatterns: Pattern[] | null = null;
const cache = new Map<string, string>();
const CJK = /[一-鿿]/;

export function isChinese(): boolean {
  return currentLocale.startsWith('zh');
}

const listeners = new Set<() => void>();
export const getCurrentLocale = (): SupportedLocale => currentLocale;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Subscribe at a NocoReach page boundary; updates preserve the page's component and form state. */
export function useNocoReachLocale(): string {
  return useSyncExternalStore(subscribe, getCurrentLocale, getCurrentLocale);
}

/** Store messages as raw text or a render-time getter, never as a translated snapshot.
 * Getters preserve interpolation values without translating user-authored variables. */
export type Message = string | (() => string);
export const renderMessage = (message: Message): string =>
  typeof message === 'function' ? message() : $legacyText(message);
export function useMessageState(
  initial = '',
): [string, (message: Message) => void] {
  useNocoReachLocale();
  const [storedMessage, setStoredMessage] = useState<Message>(initial);
  const setMessage = useCallback(
    (next: Message) => setStoredMessage(() => next),
    [],
  );
  return [renderMessage(storedMessage), setMessage];
}

/** The application's existing i18n runtime owns startup defaults, persistence and language changes. */
export function connectLocale(runtime: I18nRuntime): () => void {
  const apply = (locale: string) => {
    const resolved = resolveLocale(locale);
    const resource: unknown = runtime.i18n.getResourceBundle(
      resolved,
      'nocoreach',
    );
    const values =
      resource && typeof resource === 'object'
        ? Object.fromEntries(
            Object.entries(resource).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === 'string',
            ),
          )
        : english;
    setDictionary(resolved === 'zh-CN' ? null : values, resolved);
  };
  apply(runtime.getLocale());
  runtime.i18n.on('languageChanged', apply);
  return () => {
    runtime.i18n.off('languageChanged', apply);
  };
}

export async function prepareLocale(
  locale: string = readStoredLocale() ||
    (typeof document === 'undefined' ? '' : document.documentElement.lang) ||
    'zh-CN',
): Promise<void> {
  const resolved = resolveLocale(locale || 'zh-CN');
  const { default: loaders } = await import('../locales/index');
  const resource = await loaders[resolved]();
  const values = 'default' in resource ? resource.default : resource;
  setDictionary(
    resolved === 'zh-CN' ? null : (values as Record<string, string>),
    resolved,
  );
}

// Kept for isolated compatibility tests; production receives the runtime's resolved locale.
export function setDictionary(
  next: Record<string, string> | null,
  locale: SupportedLocale = next === null ? 'zh-CN' : 'en-US',
): void {
  const changed = dictionary !== next || currentLocale !== locale;
  cache.clear();
  patterns = null;
  shortPatterns = null;
  dictionary = next;
  currentLocale = locale;
  translateRequestErrors();
  if (changed) listeners.forEach((listener) => listener());
}

let errorsTranslated = false;
function translateRequestErrors() {
  if (errorsTranslated) return;
  errorsTranslated = true;
  nocobaseClient.wrapRequests(async (run) => {
    try {
      return await run();
    } catch (error) {
      const metadata = (
        error as {
          payload?: { error?: { metadata?: { ns?: string; key?: string } } };
        }
      )?.payload?.error?.metadata;
      const metadataKey =
        metadata?.ns === 'nocoreach' ? metadata.key : undefined;
      if (
        error instanceof Error &&
        (metadataKey ||
          CJK.test(error.message) ||
          Object.hasOwn(chinese, error.message)) &&
        Object.getOwnPropertyDescriptor(error, 'message')?.configurable !==
          false
      ) {
        const originalMessage =
          metadataKey && Object.hasOwn(chinese, metadataKey)
            ? metadataKey
            : error.message;
        Object.defineProperty(error, 'message', {
          configurable: true,
          get: () => $legacyText(originalMessage),
        });
      }
      throw error;
    }
  });
}

// Where two placeholders touch, what the second one can be (otherwise "全站搜索曝光上升" splits after one character).
const SLOTS: Record<string, Record<string, string>> = {
  'analysis.siteMetricChange': { '1': '上升|下降' },
  // A network failure's {0} is a host, so the part that failed in front of it ("仓库：") is not taken for the host.
  ...Object.fromEntries(
    networkFailureEntries.map(({ key }) => [key, { '0': HOST_PATTERN }]),
  ),
};

function compile(minimum: number): Pattern[] {
  const out: Array<Pattern & { weight: number }> = [];
  for (const [key, zh] of Object.entries(chinese)) {
    const en = dictionary?.[key];
    if (en === undefined) continue;
    if (!/\{\d+\}/.test(zh)) continue;
    const literal = zh.replace(/\{\d+\}/g, '');
    const chars = (literal.match(/[一-鿿]/g) || []).length;
    if (chars < minimum) continue; // too little text to recognize safely
    // Open at both ends ("{0} 个主题{1}") matches half of any sentence; keep only long ones.
    if (/^\{\d+\}/.test(zh) && /\{\d+\}$/.test(zh) && chars < 4) continue;
    const order: string[] = [];
    const source = zh
      .split(/(\{\d+\})/)
      .map((part) => {
        const m = part.match(/^\{(\d+)\}$/);
        if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        order.push(m[1]);
        return `(${SLOTS[key]?.[m[1]] ?? '[\\s\\S]+?'})`;
      })
      .join('');
    out.push({
      re: new RegExp(`^${source}$`),
      en: en.replace(/\{(\d+)\}/g, (_, k: string) => `{${order.indexOf(k)}}`),
      weight: literal.length,
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

const SEPARATORS: Array<[string, string]> = [
  ['\n', '\n'],
  ['；', '; '],
  ['。', '. '],
  ['，', ', '],
];
// Words that sit inside a server sentence ("访问下降 32%"): lower case there, unlike the same word as a label.
const INLINE: Record<string, string> = {
  上升: 'up',
  下降: 'down',
  增加: 'up',
  减少: 'down',
  增长: 'up',
};

function translateDynamic(text: string, depth: number): string {
  // Inside a sentence (depth > 0) the parts are short, like "2.4 倍", so shorter patterns are allowed there.
  const list =
    depth > 0 ? (shortPatterns ||= compile(1)) : (patterns ||= compile(2));
  for (const p of list) {
    const m = text.match(p.re);
    if (m)
      return p.en.replace(/\{(\d+)\}/g, (_, i: string) => {
        const part = (m[Number(i) + 1] ?? '').trim();
        return (
          (currentLocale === 'en-US' ? INLINE[part] : undefined) ??
          resolve(part, depth + 1)
        );
      });
  }
  // A network failure behind the part that failed ("仓库：…"): the sentence, and the text around it, translated apart.
  const failure = findNetworkFailure(text);
  if (failure?.chinese)
    return [
      resolve(failure.before.trim(), depth + 1).replace(/：$/, ':'),
      $t(failure.key, { 0: failure.host }),
      resolve(failure.after.trim(), depth + 1),
    ]
      .filter(Boolean)
      .join(' ');
  for (const [zh, en] of SEPARATORS) {
    const parts = text.split(zh);
    if (parts.length < 2) continue;
    return parts
      .map((part) => resolve(part.trim(), depth + 1))
      .filter(Boolean)
      .join(en)
      .trim();
  }
  return text;
}

function resolve(text: string, depth = 0): string {
  const key = systemMessageKey(text);
  if (key) return $t(key);
  if (!dictionary || !CJK.test(text)) return text;
  // An entry may be empty on purpose: a Chinese measure word like " 位" has no English counterpart.

  if (depth > 3) return text;
  // A whole text and a fragment of one use different pattern lists, so they are cached apart.
  const cacheKey = depth > 0 ? `\u0000${text}` : text;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;
  const out = translateDynamic(text, depth);
  if (cache.size > 5000) cache.clear();
  cache.set(cacheKey, out);
  return out;
}

function fill(text: string, vars?: Vars, jsx = false): string {
  if (!vars) return text;
  // In JSX, like {value} itself, nothing shows for null, undefined and booleans.
  const show = (v: unknown) =>
    jsx && (v == null || typeof v === 'boolean') ? '' : String(v);
  return text.replace(/\{(\d+)\}/g, (all, k: string) =>
    k in vars ? show(vars[k]) : all,
  );
}

// Only errors emitted verbatim by the analysis/sync services are trusted. A UI label that
// happens to be a dictionary key is not enough to identify an upstream error as system copy.
const systemErrors = new Set([
  'taskExecution.defaultModelRequired',
  'errors.unknownReason',
  'errors.networkTimeout',
  'errors.networkUnavailable',
  'google.apiError',
  'google.resourceChanged',
  'google.authorizationExpired',
  'analysis.signalsUnavailable',
  'analysis.invalidModelResult',
  'analysis.modelTimedOut',
  'analysis.failed',
  'errors.networkRetryScheduled',
  ...youtubeSystemErrors,
]);
/** Translate recognized system errors without splitting unknown errors or their user values. */
export function translateSystemError(
  message: string | null | undefined,
): string {
  if (message == null) return '';
  const key = systemMessageKey(message);
  return key && systemErrors.has(key) ? $t(key) : message;
}

const sourceSystemErrors = new Set([
  'publicSources.readingSourceTimedOutTry',
  'publicSources.sourceRestrictedRateLimitedTry',
  'publicSources.tooManyRedirects',
  'publicSources.pageRedirectsAnotherDomainProvide',
  'publicSources.singleReadExceeded2Mb',
  'publicSources.publicInternetAddressesAllowed',
  'chatSource.caNotReachDiscordTry',
  'chatSource.discordBotTokenInvalidCopy',
  'chatSource.botCannotReadChannelGive',
  'chatSource.caNotFindServerChannel',
  'chatSource.caNotReachSlackTry',
  'chatSource.tooManySlackRequestsTries',
  'chatSource.slackTokenInvalidCopyApp',
  'chatSource.botNotChannelTypeInvite',
  'chatSource.slackNeedsBotUserOauth',
  'chatSource.notLookLikeDiscordBot',
  'xSource.caNotReachXApi',
  'xSource.xBearerTokenInvalidRevoked',
  'xSource.tooManyXApiRequests',
  'xSource.xAccountOutCreditsTop',
  'hackernewsSource.hackerNewsSearchNotReturn',
]);

// Source snapshots contain legacy text plus channel/query context. Recognize only the
// service-owned grammar; upstream details and user-authored names are opaque values.
export function translateSourceError(
  message: string | null | undefined,
): string {
  if (!message || !dictionary) return message ?? '';
  // A request that got no answer is the server's own sentence; what stands in front of it stays as it was.
  const failure = findNetworkFailure(message);
  if (failure?.chinese)
    return [
      failure.before.trim().replace(/：$/, ':'),
      $t(failure.key, { 0: failure.host }),
      failure.after.trim(),
    ]
      .filter(Boolean)
      .join(' ');
  const missingScope = message.match(
    /^Slack 应用缺少权限：([\s\S]*)，请在 OAuth & Permissions 里加上后重新安装$/,
  );
  if (missingScope)
    return $t('messages.slackAppMissingPermissionsAdd', { 0: missingScope[1] });
  const rejection = message.match(
    /^(Slack 拒绝了请求：|Discord 拒绝了请求|X 接口拒绝了请求)(：?[\s\S]*)$/,
  );
  if (
    rejection &&
    (rejection[1].endsWith('：') ||
      !rejection[2] ||
      rejection[2].startsWith('：'))
  ) {
    const keys: Record<string, string> = {
      'Slack 拒绝了请求：': 'messages.slackRejectedRequest',
      'Discord 拒绝了请求': 'messages.discordRejectedRequest',
      'X 接口拒绝了请求': 'messages.xApiRejectedRequest',
    };
    const key = keys[rejection[1]];
    const detail = rejection[1].endsWith('：')
      ? rejection[2]
      : rejection[2].replace(/^：/, ': ');
    return $t(key, { 0: detail });
  }
  const status = message.match(/^来源返回 (\d{3})$/);
  if (status) return $t('messages.sourceReturned', { 0: status[1] });
  const invalidData = message.match(/^([^\r\n]+)：(返回的不是有效数据)$/);
  if (invalidData) {
    const translated = $t('communitySource.returnedDataNotValid');
    return translated === invalidData[2]
      ? message
      : `${invalidData[1]}: ${translated}`;
  }
  const context = message.match(
    /^(Slack|(?:Slack|Discord) #[^：\r\n]+|「[^\r\n]*」)：([\s\S]+)$/,
  );
  if (context) {
    const translated = translateSourceError(context[2]);
    return translated === context[2] ? message : `${context[1]}: ${translated}`;
  }
  const key = Object.hasOwn(legacyKeys, message)
    ? (legacyKeys as Record<string, string>)[message]
    : message;
  return sourceSystemErrors.has(key) ? $t(key) : translateSystemError(message);
}

/** Translate current application copy. Unknown text is left intact; Chinese aliases are
 * intentionally NOT resolved here, so new callers cannot depend on the retired key format. */
export function $t(key: string | null | undefined, vars?: Vars): string {
  if (key == null) return '';
  const values: Record<string, string> = dictionary ?? chinese;
  return fill(Object.hasOwn(values, key) ? values[key] : key, vars);
}

/** Read old API text, persisted system snapshots and historical message templates.
 * Call only at trusted system-text boundaries; never on custom labels or user values. */
export function $legacyText(
  text: string | null | undefined,
  vars?: Vars,
): string {
  return text == null ? '' : fill(resolve(text), vars);
}

/** Read a short server fragment such as a change's chip ("16 页", "42 分"). Its templates are too
 * short to recognize in arbitrary text, so call this only where the whole value is system-owned. */
export function $legacyFragment(text: string | null | undefined): string {
  return text == null ? '' : resolve(text, 1);
}

/** JSX compatibility for historical insight templates; interpolation values stay untouched. */
export function $legacyJsx(text: string, vars: Vars): ReactNode {
  return renderJsx(resolve(text), vars);
}

// Text inside JSX whose placeholders may be elements (a tag, a link): returns parts React can render.
export function $tj(key: string, vars: Vars): ReactNode {
  return renderJsx($t(key), vars);
}

function renderJsx(text: string, vars: Vars): ReactNode {
  if (
    !Object.values(vars).some(
      (v) => isValidElement(v) || (typeof v === 'object' && v !== null),
    )
  )
    return fill(text, vars, true);
  return text.split(/(\{\d+\})/).map((part, i) => {
    const m = part.match(/^\{(\d+)\}$/);
    return (
      // eslint-disable-next-line @eslint-react/no-array-index-key -- Static translated text can repeat placeholders; fragments have positional identity.
      <Fragment key={i}>
        {m && m[1] in vars ? (vars[m[1]] as ReactNode) : part}
      </Fragment>
    );
  });
}
