import { $t } from '#i18n';
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
) {
  return api.action<T>('nrBilibili', action, {
    method: 'POST',
    body: { projectId: String(projectId), ...body },
    unwrap: 'data',
  });
}
export function bilibiliMessage(code: string) {
  const messages: Record<string, string> = {
    collector_unreachable: $t(
      '无法连接 Bilibili 采集器，请检查采集器是否运行。',
    ),
    collector_unauthorized: $t(
      'Bilibili 采集器认证失败，请管理员核对部署令牌。',
    ),
    tool_missing: $t('采集器尚未安装 OpenCLI，请管理员完成安装。'),
    browser_unavailable: $t('采集器无法连接浏览器，请打开已授权的浏览器连接。'),
    login_required: $t('请在采集器浏览器中自行登录 Bilibili，再手动重试。'),
    security_block: $t('Bilibili 要求验证或拒绝了访问，本次读取已停止。'),
    rate_limited: $t('Bilibili 请求过于频繁，请等待冷却时间结束。'),
    not_found: $t('Bilibili 视频不存在、已删除或不可读取，请检查 BV 号。'),
    invalid_response: $t('Bilibili 返回的数据无法确认，本次未当作成功结果。'),
    timeout: $t('Bilibili 读取超时，已保存数据保持不变。'),
    unsupported: $t('此采集器尚未启用 Bilibili 的所选读取功能。'),
    unconfirmed_empty: $t('本次未取得可确认的结果，不能据此判断没有相关视频。'),
    busy: $t('采集器正在处理其他请求，请稍后再试。'),
    cancelled: $t('Bilibili 读取已停止，已保存数据保持不变。'),
  };
  return (
    messages[code] || $t('Bilibili 返回的数据无法确认，本次未当作成功结果。')
  );
}
