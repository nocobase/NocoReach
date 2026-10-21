import english from './en.json' with { type: 'json' };
import { resolveLocale, type SupportedLocale } from './locales.js';
import { youtubeSystemErrors } from '../youtube-errors.js';
import chinese from './zh.json' with { type: 'json' };
import legacyKeys from './legacy-keys.json' with { type: 'json' };

export type MessageKey = keyof typeof chinese;
export type MessageParams = Record<string | number, unknown>;
export interface SystemMessage {
  key: string;
  params?: MessageParams;
}

// Current server-owned copy also occurs as Chinese display text at compatibility boundaries.
// Recognize only these explicit messages; never reverse-map arbitrary UI or user text.
const currentSystemText = new Map<string, MessageKey>(
  [
    ...youtubeSystemErrors,
    // These server-owned strings changed while their historical aliases stayed fixed.
    'playbooks.communityReplyInstruction',
    'publicSources.issuesIncludeNonPrItems',
  ].map((key) => [chinese[key as MessageKey], key as MessageKey]),
);

/** Compatibility is for old persisted system text, never for user-authored values. */
export function systemMessageKey(value: string): MessageKey | undefined {
  if (Object.hasOwn(chinese, value)) return value as MessageKey;
  return Object.hasOwn(legacyKeys, value)
    ? (legacyKeys[value as keyof typeof legacyKeys] as MessageKey)
    : currentSystemText.get(value);
}

const loadedResources = new Map<SupportedLocale, Record<string, string>>([
  ['en-US', english],
  ['zh-CN', chinese],
]);

/** Locale modules register their own dictionary as the framework loads them. */
export function registerBusinessLocale(
  locale: SupportedLocale,
  values: Record<string, string>,
): void {
  loadedResources.set(locale, values);
}

const stringifyParameter = (value: unknown): string => String(value);

/** Keep the legacy Chinese display fields while emitting semantic presentation metadata. */
export function systemMessageText(
  key: string,
  params: MessageParams = {},
  locale = 'zh-CN',
): string {
  const resolved = systemMessageKey(key);
  const values = loadedResources.get(resolveLocale(locale)) ?? english;
  const template = resolved ? (values[resolved] ?? english[resolved]) : key;
  return template.replace(/\{(\d+)\}/g, (slot, id: string) => {
    const value = params[id];
    if (value === undefined) return slot;
    if (value && typeof value === 'object') {
      if ('systemError' in value) return String(value.systemError);
      if ('key' in value) {
        const nested = value as SystemMessage;
        return systemMessageText(nested.key, nested.params, locale);
      }
    }
    return stringifyParameter(value);
  });
}
