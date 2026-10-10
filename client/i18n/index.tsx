import { Fragment, isValidElement, type ReactNode } from "react";
import { readStoredLocale } from "@nocobase/app-client";
import { nocobaseClient } from "#lib/nocoreach-api";

// The language this browser shows (NocoBase 3 keeps the visitor's choice in storage; classic read it from the portal SDK).
const getCurrentLocale = (): string => readStoredLocale() || document.documentElement.lang || "zh-CN";

// NocoReach's own UI text (2026-10-07). The Chinese text in the source is the key: $t("洞察") shows 洞察 in Chinese and
// the English from en.json in English. Placeholders are {0}, {1}… filled from `vars`. The locale is fixed for the life
// of the page (changing language reloads it), so prepareLocale() runs once before the app is imported and $t stays
// synchronous; tests and fixtures that never call it get Chinese. A text without an English entry falls back to Chinese.
//
// The server keeps answering in Chinese (the Portal reads numbers out of its sentences). Its texts are in en.json as
// patterns, so $t(serverText) also translates "278 个页面标题重复" through "{0} 个页面标题重复"; a sentence built from
// several parts is translated part by part. Error messages from the server are translated where requests fail.
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

export async function prepareLocale(locale: string = getCurrentLocale()): Promise<void> {
  if (!locale || locale.toLowerCase().startsWith("zh")) {
    setDictionary(null);
    return;
  }
  setDictionary((await import("./en.json")).default as Record<string, string>);
}

// Synchronous form, for test pages that load the English text themselves; null means Chinese.
export function setDictionary(next: Record<string, string> | null): void {
  cache.clear();
  patterns = null;
  shortPatterns = null;
  dictionary = next;
  if (next) translateRequestErrors();
}

let errorsTranslated = false;
function translateRequestErrors() {
  if (errorsTranslated) return;
  errorsTranslated = true;
  nocobaseClient.wrapRequests(async (run) => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Error && CJK.test(error.message)) error.message = $t(error.message);
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
