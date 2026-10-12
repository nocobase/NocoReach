import { $t } from '#i18n';

// Only exact application-owned errors are translatable; upstream text stays intact.
const knownErrors = new Set([
  '无法连接小红书采集器，请检查采集器是否运行。',
  '小红书采集器认证失败，请管理员核对部署令牌。',
  '采集器尚未安装 OpenCLI，请管理员完成安装。',
  '采集器无法连接浏览器，请打开已授权的 Chrome 和 OpenCLI 扩展。',
  '请在采集器的浏览器中自行登录小红书，再重新搜索。',
  '小红书要求安全验证或限制了访问，采集已停止，请在浏览器中处理。',
  '小红书采集超时，保留上次成功结果，请稍后手动重试。',
  '采集器返回的数据格式不完整，未覆盖上次成功结果。',
  '采集器正在处理其他请求，请稍后再试。',
  '本次未返回可确认的笔记，未验证当前登录状态；这不代表全网没有提及。',
  '采集已取消，上次成功结果保留。',
  '此项目没有可用的指定小红书采集器，请联系管理员。',
  '小红书连接已变更，请刷新后重试。',
  '请填写 2–60 个字符的小红书搜索词。',
  '请确认有权使用采集器中的小红书浏览器会话。',
  '请先保存小红书连接。',
  '小红书连接已变更，本次结果未保存。',
  '这次小红书采集已经结束，请刷新查看结果。',
  '采集结果正在保存，已无法取消，请稍后查看结果。',
]);

export function xiaohongshuErrorMessage(error: Error): string {
  // The shared request wrapper localizes message; retain the original payload for locale changes.
  const payload = (
    error as Error & { payload?: { error?: { message?: string } } }
  ).payload;
  const message = payload?.error?.message ?? error.message;
  return knownErrors.has(message) ? $t(message) : message;
}
