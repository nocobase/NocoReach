import { $t } from '#i18n';
import { transportErrorMessage } from '#lib/transport-error';
import { nocobaseClient as api } from '#lib/nocoreach-api';
export interface BilibiliVideo {
  id: string;
  title: string | null;
  url: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  publishedAt: string | null;
  publishedAtPrecision: 'minute' | null;
  collectedAt: string;
  completeness: 'search_summary' | 'video_metadata';
  fromEarlierConfig: boolean;
  sources: { kind: 'search' | 'video'; value: string; url: string }[];
}
export interface BilibiliStatus {
  connected: boolean;
  configured: boolean;
  revision: string | null;
  collectors: { id: string; name: string }[];
  collectorId: string | null;
  terms: string[];
  bvids: string[];
  verifiedAt: string | null;
  checking: boolean;
  requestId: string | null;
  total: number;
  recent: BilibiliVideo[];
  lastRun: {
    at: string;
    ok: boolean;
    errorCode: string | null;
    retryAt: string | null;
    found: number;
    added: number;
    capped: boolean;
    partial: boolean;
  } | null;
}
export function bilibiliRequest<T>(
  projectId: number,
  action: string,
  body: object = {},
  confirmationSessionId?: string,
) {
  return api.action<T>('nrBilibili', action, {
    method: 'POST',
    body: { projectId: String(projectId), ...body },
    unwrap: 'data',
    headers: confirmationSessionId
      ? { 'X-NocoReach-Confirmation-Session': confirmationSessionId }
      : undefined,
  });
}
const messages: Record<string, string> = {
  collector_unreachable: '无法连接 Bilibili 采集器，请检查采集器是否运行。',
  collector_unauthorized: 'Bilibili 采集器认证失败，请管理员核对部署令牌。',
  tool_missing: '采集器尚未安装 OpenCLI，请管理员完成安装。',
  browser_unavailable: '采集器无法连接浏览器，请打开已授权的浏览器连接。',
  login_required:
    'Bilibili 要求登录，本次读取已停止。请管理员检查采集器所选模式。',
  security_block: 'Bilibili 要求验证或拒绝了访问，本次读取已停止。',
  rate_limited: 'Bilibili 请求过于频繁，请等待冷却时间结束。',
  not_found: 'Bilibili 视频不存在、已删除或不可读取，请检查 BV 号。',
  invalid_response: 'Bilibili 返回的数据无法确认，本次未当作成功结果。',
  timeout: 'Bilibili 读取超时，已保存数据保持不变。',
  unsupported: '此采集器尚未启用 Bilibili 的所选读取功能。',
  unconfirmed_empty: '本次未取得可确认的结果，不能据此判断没有相关视频。',
  busy: '采集器正在处理其他请求，请稍后再试。',
  invalid_input:
    '请选择可用的采集器，并填写最多 3 个搜索词（各 1–80 字）或 5 个有效 BV 号。',
  conflict: 'Bilibili 配置已变更，请重新载入后再保存。',
  not_connected: '请先保存可用的 Bilibili 采集器配置。',
  cancelled: 'Bilibili 读取已停止，已保存数据保持不变。',
};

export function bilibiliMessage(code: string) {
  return messages[code] ? $t(messages[code]) : code;
}

const knownErrors = new Set(Object.values(messages));
export function isBilibiliCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const response = error as Error & {
    status?: number;
    payload?: { error?: { message?: string } };
  };
  // The legacy API shares a generic 409 reason; only this exact server message
  // identifies a cancelled read, independently of the current UI locale.
  return (
    response.status === 409 &&
    response.payload?.error?.message === messages.cancelled
  );
}

export function bilibiliErrorMessage(error: Error): string {
  const transportMessage = transportErrorMessage(error);
  if (transportMessage) return transportMessage;
  // Preserve the server payload across locale changes; unknown upstream text is literal.
  const payload = (
    error as Error & { payload?: { error?: { message?: string } } }
  ).payload;
  const message = payload?.error?.message ?? error.message;
  return knownErrors.has(message) ? $t(message) : message;
}
