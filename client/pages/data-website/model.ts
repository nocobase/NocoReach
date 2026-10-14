import { $t, isChinese } from "@/i18n";
// 访问 (GA4): the shapes the server answers with (server/nocoreach/website-report.ts), the metrics as GA4 names and
// computes them, and how dimension values read in the page's language.

export type Values = { users?: number; newUsers?: number; sessions?: number; engaged?: number; duration?: number; views?: number; events?: number; keyEvents?: number; keyEventRate?: number };
export type Query = { keyword: string; clicks: number; impressions: number; position: number };
export type Row = Values & { key: string; dims: Record<string, string>; title?: string; ai?: string; queries?: Query[] };
export type TableName = "channel" | "sourceMedium" | "campaign" | "landing" | "page" | "event" | "newVsReturning" | "device" | "country" | "city" | "language" | "browser" | "os";
export type Window = { start: string; end: string; days: number; previousStart: string; previousEnd: string };
export type Day = Values & { date: string };
export type Report = {
  connected: boolean; cutoff?: string | null; window?: Window; notes?: string[];
  totals?: { current: Values | null; previous: Values | null }; daily?: Day[]; previousDaily?: Day[];
  tables?: Partial<Record<TableName, Row[]>>; missing?: TableName[]; ai?: { sessions: number; sources: number };
};
export type RowDetail = { connected: boolean; window?: Window; daily?: Day[]; previousDaily?: Day[]; totals?: { current: Values | null; previous: Values | null } };
export type TodayTotals = { users: number; views: number; sessions: number; keyEvents: number };
export type Today = {
  connected: boolean; timeZone: string; date: string; lastWeekDate: string; time: string; through: number;
  hours: { hour: number; today: number | null; yesterday: number; lastWeek: number }[];
  totals: { today: TodayTotals | null; yesterday: TodayTotals | null; lastWeek: TodayTotals | null };
  fullDay: { yesterday: number; lastWeek: number };
  sources: { source: string; medium: string; sessions: number; users: number; ai: string | null }[];
};
export type Realtime = {
  connected: boolean; fetchedAt: string; users: number; views: number; eventCount: number; keyEvents: number; perMinute: number[];
  pages: { title: string; users: number; views: number }[]; countries: { id: string; name: string; users: number }[];
  cities: { name: string; countryId: string; users: number }[]; devices: { name: string; users: number }[];
  events: { name: string; count: number; users: number }[];
};

const ratio = (a?: number | null, b?: number | null) => (a == null || !b ? null : a / b);
export type Format = "count" | "percent" | "duration" | "decimal";
export type MetricKey = "users" | "newUsers" | "sessions" | "views" | "engagementRate" | "engagementTime" | "sessionTime" | "keyEvents" | "keyEventRate" | "eventsPerSession" | "events" | "viewsPerUser" | "eventsPerUser";
// Labels are the Chinese keys of $t, translated where they are shown.
export const METRICS: Record<MetricKey, { label: string; of: (v: Values) => number | null; format: Format }> = {
  users: { label: "活跃用户", of: (v) => v.users ?? null, format: "count" },
  newUsers: { label: "新用户", of: (v) => v.newUsers ?? null, format: "count" },
  sessions: { label: "会话", of: (v) => v.sessions ?? null, format: "count" },
  views: { label: "浏览量", of: (v) => v.views ?? null, format: "count" },
  engagementRate: { label: "互动率", of: (v) => ratio(v.engaged, v.sessions), format: "percent" },
  engagementTime: { label: "平均互动时长", of: (v) => ratio(v.duration, v.users), format: "duration" },
  sessionTime: { label: "每次会话互动时长", of: (v) => ratio(v.duration, v.sessions), format: "duration" },
  keyEvents: { label: "关键事件", of: (v) => v.keyEvents ?? null, format: "count" },
  keyEventRate: { label: "关键事件率", of: (v) => v.keyEventRate ?? null, format: "percent" },
  eventsPerSession: { label: "每次会话事件数", of: (v) => ratio(v.events, v.sessions), format: "decimal" },
  events: { label: "事件数", of: (v) => v.events ?? null, format: "count" },
  viewsPerUser: { label: "人均浏览", of: (v) => ratio(v.views, v.users), format: "decimal" },
  eventsPerUser: { label: "人均次数", of: (v) => ratio(v.events, v.users), format: "decimal" },
};
// GA4's home: the eight figures above the line, each one switching the line to itself.
export const KPI_KEYS: MetricKey[] = ["users", "newUsers", "sessions", "views", "engagementRate", "engagementTime", "keyEvents", "keyEventRate"];

export function duration(seconds: number): string {
  const s = Math.round(seconds);
  return s >= 60 ? $t("{0} 分 {1} 秒", { 0: Math.floor(s / 60), 1: s % 60 }) : $t("{0} 秒", { 0: s });
}
export function show(v: number | null | undefined, format: Format): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (format === "percent") return `${(v * 100).toFixed(1)}%`;
  if (format === "duration") return duration(v);
  if (format === "decimal") return v.toFixed(2);
  return Math.round(v).toLocaleString();
}
export const change = (now: number | null, before: number | null) => (now == null || before == null || before === 0 ? null : (now - before) / before);

// GA4's default channel groups, as GA4's Chinese interface names them.
const CHANNELS: Record<string, string> = {
  "Organic Search": "自然搜索", Direct: "直接访问", Referral: "引荐", "Organic Social": "自然社交", "Organic Video": "自然视频", "Organic Shopping": "自然购物",
  Email: "电子邮件", "Paid Search": "付费搜索", "Paid Social": "付费社交", "Paid Video": "付费视频", "Paid Shopping": "付费购物", "Paid Other": "其他付费",
  Display: "展示广告", "Cross-network": "跨网络", Affiliates: "联属网络", SMS: "短信", "Mobile Push Notifications": "移动推送通知", Audio: "音频", Unassigned: "未分配",
};
const DEVICES: Record<string, string> = { desktop: "桌面", mobile: "手机", tablet: "平板", "smart tv": "智能电视" };
const SPECIAL: Record<string, string> = { "(not set)": "（未设置）", "(direct)": "（直接）", "(none)": "（无）", "(organic)": "（自然）", "(referral)": "（引荐）", "(other)": "（其他）", "(data deleted)": "（数据已删除）" };
export const channelName = (v: string) => (CHANNELS[v] ? $t(CHANNELS[v]) : special(v));
export const deviceName = (v: string) => (DEVICES[v] ? $t(DEVICES[v]) : special(v));
export const visitorName = (v: string) => (v === "new" ? $t("新访客") : v === "returning" ? $t("回访") : special(v));
export const special = (v: string) => (SPECIAL[v] ? $t(SPECIAL[v]) : v || $t("（未设置）"));
const display = (type: "region" | "language") => { try { return new Intl.DisplayNames([isChinese() ? "zh-CN" : "en"], { type }); } catch { return null; } };
export function regionName(id: string | undefined, fallback: string): string {
  if (!id || id === "(not set)") return special(fallback);
  try { return display("region")?.of(id) || fallback; } catch { return fallback; }
}
export function languageName(code: string | undefined, fallback: string): string {
  if (!code || code === "(not set)") return special(fallback);
  try { return display("language")?.of(code) || fallback; } catch { return fallback; }
}
