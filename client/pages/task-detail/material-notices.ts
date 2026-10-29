import { $t } from '#i18n';
import { formatDate, formatDateTime } from '#lib/format';

export interface MaterialNotice {
  code: string;
  params?: Record<string, number>;
  message: string;
}

export function materialNoticeText(notice: MaterialNotice): string {
  const params = notice.params || {};
  switch (notice.code) {
    case 'replies_unavailable':
      return $t('taskDetail.someExistingRepliesNotRead');
    case 'post_truncated':
      return $t('taskDetail.postTooLongTruncated', { 0: params.post });
    case 'posts_incomplete':
      return $t('taskDetail.postsIncluded', {
        0: params.expected,
        1: params.provided,
      });
    case 'original_unavailable':
      return $t('taskDetail.originalPostNotRead');
    case 'forum_unavailable':
      return $t('taskDetail.forumContentNotReadCheck');
    case 'metrics_unavailable':
      return $t('taskDetail.someProjectMetricsNotRead');
    case 'topics_limit':
      return $t('taskDetail.taskReferencesMoreTopicsFirst', {
        0: params.limit,
      });
    case 'budget_exceeded':
      return $t('taskDetail.postExceedsTaskSSource', { 0: params.post });
    case 'topic_link_missing':
      return $t('taskDetail.noTopicLinkProjectS');
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
  return value.length === 10
    ? formatDate(value, { withYear: true })
    : formatDateTime(value, { withYear: true });
}
