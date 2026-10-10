import { $t, isChinese } from '#i18n';

export interface MaterialNotice {
  code: string;
  params?: Record<string, number>;
  message: string;
}

export function materialNoticeText(notice: MaterialNotice): string {
  const params = notice.params || {};
  switch (notice.code) {
    case 'replies_unavailable':
      return $t('部分已有回复读取失败');
    case 'post_truncated':
      return $t('第 {0} 楼正文过长，已截断', { 0: params.post });
    case 'posts_incomplete':
      return $t('共 {0} 楼，本次仅提供 {1} 楼', {
        0: params.expected,
        1: params.provided,
      });
    case 'original_unavailable':
      return $t('未取得原帖正文');
    case 'forum_unavailable':
      return $t('论坛正文读取失败，请检查论坛连接及出站网络后重试');
    case 'metrics_unavailable':
      return $t('部分项目指标未能读取，可使用任务中已有的数据摘要');
    case 'topics_limit':
      return $t('任务引用超过 {0} 个主题；请拆分任务，本次只读取前 {0} 个', {
        0: params.limit,
      });
    case 'budget_exceeded':
      return $t('第 {0} 楼超过本次任务资料预算，已截断', { 0: params.post });
    case 'topic_link_missing':
      return $t(
        '未找到属于当前项目论坛的原帖链接，请补充原帖链接并检查论坛连接',
      );
    default:
      return $t(notice.message);
  }
}

/** A report may describe a time range in prose; only format unambiguous ISO dates. */
export function reportDate(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      value,
    )
  )
    return value || '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const locale = isChinese() ? 'zh-CN' : 'en-US';
  return value.length === 10
    ? date.toLocaleDateString(locale, { timeZone: 'UTC' })
    : date.toLocaleString(locale);
}
