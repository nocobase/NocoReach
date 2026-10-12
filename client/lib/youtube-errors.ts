// Exact application-owned messages; upstream text must remain literal.
export const youtubeSystemErrors = [
  '请填写 YouTube 视频链接，或每行一个搜索词',
  '服务器尚未安装 yt-dlp，请管理员按 YouTube 接入文档安装后重试',
  'YouTube 要求登录、验证或限制了请求，本次已停止；请稍后手动重试',
  'YouTube 视频不可公开读取，可能已删除、设为私有或限制访问',
  'YouTube 网络请求未完成，请检查所选网络出口后重试',
  'YouTube 读取工具或网络出口配置不可用，请管理员检查后手动重试',
  'YouTube 读取失败，自动读取已暂停；请检查工具版本后手动重试',
  'YouTube 读取超时，已停止本次请求，请缩小范围后重试',
  'YouTube 返回内容超过大小限制，本次读取已停止',
  'YouTube 返回的数据无法读取，请稍后重试',
  'YouTube 读取已取消',
  'YouTube 配置已被修改，请重新打开后重试',
  '部分 YouTube 字幕读取失败，视频信息已保留；可手动重试',
] as const;
