import { Fragment, isValidElement, useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import type { I18nRuntime } from "@nocobase/i18n";
import english from "./en.json";
import { readStoredLocale } from "@nocobase/app-client";
import { nocobaseClient } from "#lib/nocoreach-api";

// Keep the classic Chinese-key dictionary, but follow the application's resolved locale rather than
// localStorage. The runtime includes the configured default and changes without reloading the page.
// Helpers and request failures use the same synchronous dictionary as the rendered pages.
type Vars = Record<string | number, unknown>;
type Pattern = { re: RegExp; en: string };
let dictionary: Record<string, string> | null = null;
let patterns: Pattern[] | null = null;
let shortPatterns: Pattern[] | null = null;
const cache = new Map<string, string>();
const CJK = /[一-鿿]/;

export function isChinese(): boolean {
  return dictionary === null;
}

const listeners = new Set<() => void>();
export const getCurrentLocale = (): string => dictionary === null ? "zh-CN" : "en-US";
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Subscribe at a NocoReach page boundary; updates preserve the page's component and form state. */
export function useNocoReachLocale(): string {
  return useSyncExternalStore(subscribe, getCurrentLocale, getCurrentLocale);
}

/** Store messages as raw text or a render-time getter, never as a translated snapshot.
 * Getters preserve interpolation values without translating user-authored variables. */
export type Message = string | (() => string);
export const renderMessage = (message: Message): string => typeof message === "function" ? message() : $t(message);
export function useMessageState(initial = ""): [string, (message: Message) => void] {
  useNocoReachLocale();
  const [storedMessage, setStoredMessage] = useState<Message>(initial);
  const setMessage = useCallback((next: Message) => setStoredMessage(() => next), []);
  return [renderMessage(storedMessage), setMessage];
}

/** The application's existing i18n runtime owns startup defaults, persistence and language changes. */
export function connectLocale(runtime: I18nRuntime): () => void {
  const apply = (locale: string) => setDictionary(locale.toLowerCase().startsWith("zh") ? null : english);
  apply(runtime.getLocale());
  runtime.i18n.on("languageChanged", apply);
  return () => { runtime.i18n.off("languageChanged", apply); };
}

export async function prepareLocale(locale: string = readStoredLocale() || (typeof document === "undefined" ? "" : document.documentElement.lang) || "zh-CN"): Promise<void> {
  if (!locale || locale.toLowerCase().startsWith("zh")) {
    setDictionary(null);
    return;
  }
  setDictionary(english);
}

// Synchronous form, for test pages that load the English text themselves; null means Chinese.
export function setDictionary(next: Record<string, string> | null): void {
  const previous = dictionary;
  cache.clear();
  patterns = null;
  shortPatterns = null;
  dictionary = next;
  translateRequestErrors();
  if (previous !== next) listeners.forEach((listener) => listener());
}

let errorsTranslated = false;
function translateRequestErrors() {
  if (errorsTranslated) return;
  errorsTranslated = true;
  nocobaseClient.wrapRequests(async (run) => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Error && CJK.test(error.message) && Object.getOwnPropertyDescriptor(error, "message")?.configurable !== false) {
        const originalMessage = error.message;
        Object.defineProperty(error, "message", { configurable: true, get: () => $t(originalMessage) });
      }
      throw error;
    }
  });
}

// Where two placeholders touch, what the second one can be (otherwise "全站搜索曝光上升" splits after one character).
const SLOTS: Record<string, Record<string, string>> = { "全站{0}{1} {2}": { "1": "上升|下降" } };

function compile(minimum: number): Pattern[] {
  const out: Array<Pattern & { weight: number }> = [];
  for (const [zh, en] of Object.entries(dictionary || {})) {
    if (!/\{\d+\}/.test(zh)) continue;
    const literal = zh.replace(/\{\d+\}/g, "");
    const chars = (literal.match(/[一-鿿]/g) || []).length;
    if (chars < minimum) continue; // too little text to recognize safely
    // Open at both ends ("{0} 个主题{1}") matches half of any sentence; keep only long ones.
    if (/^\{\d+\}/.test(zh) && /\{\d+\}$/.test(zh) && chars < 4) continue;
    const order: string[] = [];
    const source = zh
      .split(/(\{\d+\})/)
      .map((part) => {
        const m = part.match(/^\{(\d+)\}$/);
        if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        order.push(m[1]);
        return `(${SLOTS[zh]?.[m[1]] ?? "[\\s\\S]+?"})`;
      })
      .join("");
    out.push({
      re: new RegExp(`^${source}$`),
      en: en.replace(/\{(\d+)\}/g, (_, k: string) => `{${order.indexOf(k)}}`),
      weight: literal.length,
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

const SEPARATORS: Array<[string, string]> = [["\n", "\n"], ["；", "; "], ["。", ". "], ["，", ", "]];
// Words that sit inside a server sentence ("访问下降 32%"): lower case there, unlike the same word as a label.
const INLINE: Record<string, string> = { 上升: "up", 下降: "down", 增加: "up", 减少: "down", 增长: "up" };

function translateDynamic(text: string, depth: number): string {
  // Inside a sentence (depth > 0) the parts are short, like "2.4 倍", so shorter patterns are allowed there.
  const list = depth > 0 ? (shortPatterns ||= compile(1)) : (patterns ||= compile(2));
  for (const p of list) {
    const m = text.match(p.re);
    if (m) return p.en.replace(/\{(\d+)\}/g, (_, i: string) => { const part = (m[Number(i) + 1] ?? "").trim(); return INLINE[part] ?? resolve(part, depth + 1); });
  }
  for (const [zh, en] of SEPARATORS) {
    const parts = text.split(zh);
    if (parts.length < 2) continue;
    return parts.map((part) => resolve(part.trim(), depth + 1)).filter(Boolean).join(en).trim();
  }
  return text;
}

function resolve(text: string, depth = 0): string {
  if (!dictionary || !CJK.test(text)) return text;
  // An entry may be empty on purpose: a Chinese measure word like " 位" has no English counterpart.
  const exact = dictionary[text];
  if (exact !== undefined) return exact;
  if (depth > 3) return text;
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  const out = translateDynamic(text, depth);
  if (cache.size > 5000) cache.clear();
  cache.set(text, out);
  return out;
}

function fill(text: string, vars?: Vars, jsx = false): string {
  if (!vars) return text;
  // In JSX, like {value} itself, nothing shows for null, undefined and booleans.
  const show = (v: unknown) => (jsx && (v == null || typeof v === "boolean") ? "" : String(v));
  return text.replace(/\{(\d+)\}/g, (all, k: string) => (k in vars ? show(vars[k]) : all));
}

// Only errors emitted verbatim by the analysis/sync services are trusted. A UI label that
// happens to be a dictionary key is not enough to identify an upstream error as system copy.
const systemErrors = new Set([
  "请先在“AI 团队 → 模型”配置默认模型", "原因未知", "网络超时", "网络不可用",
  "Google 接口错误", "所选资源已更换", "Google 授权已失效，请重新授权",
  "信号计算暂不可用", "模型没有返回可解析的结果", "分析失败", "网络不可用，稍后会自动重试",
]);
/** Translate recognized system errors without splitting unknown errors or their user values. */
export function translateSystemError(message: string | null | undefined): string {
  if (message == null) return "";
  return systemErrors.has(message) ? dictionary?.[message] ?? message : message;
}

// Text for attributes, strings and messages; also any Chinese text that comes from the server.
// `context` picks a wording for one use when English needs it, like plural menu titles: $t("机会", undefined, "title")
// reads "机会#title" before "机会".
export function $t(zh: string | null | undefined, vars?: Vars, context?: string): string {
  if (zh == null) return "";
  const own = context ? dictionary?.[`${zh}#${context}`] : undefined;
  return fill(own ?? resolve(zh), vars);
}

// Text inside JSX whose placeholders may be elements (a tag, a link): returns parts React can render.
export function $tj(zh: string, vars: Vars): ReactNode {
  const text = resolve(zh);
  if (!Object.values(vars).some((v) => isValidElement(v) || (typeof v === "object" && v !== null))) return fill(text, vars, true);
  return text.split(/(\{\d+\})/).map((part, i) => {
    const m = part.match(/^\{(\d+)\}$/);
    return <Fragment key={i}>{m && m[1] in vars ? (vars[m[1]] as ReactNode) : part}</Fragment>;
  });
}
