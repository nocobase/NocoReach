import { $t } from '#i18n';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { lineTabClass, lineTabListClass } from '#components/reach/line-tabs';
import {
  TOPICS_EDIT_PATH,
  topicScopeText,
  type TopicGroup,
} from './followed-topics-scope';

// Followed topics on the source pages (2026-11-10): one line says what the source searches — the product name, how
// many followed topics, how often — with a link to change the topics in Project knowledge › Memory, and the page
// splits what it found into Topic discussions and Mentions of us.

export function EditTopicsLink(): ReactElement {
  return (
    <Link className='nr-link' to={TOPICS_EDIT_PATH} data-edit-topics>
      {$t('followedTopics.editInMemory')}
    </Link>
  );
}

/** The scope line on its own, for pages without a status line of their own to put it in. */
export function TopicScope(props: Parameters<typeof topicScopeText>[0]) {
  return (
    <p
      className='nr-footnote flex flex-wrap items-center gap-x-1.5'
      data-topic-scope
    >
      <span>{topicScopeText(props)}</span>
      <EditTopicsLink />
    </p>
  );
}

export function TopicGroupTabs({
  group,
  onChange,
  topics,
  mentions,
}: {
  group: TopicGroup;
  onChange: (group: TopicGroup) => void;
  topics: number;
  mentions: number;
}): ReactElement {
  const tab = (key: TopicGroup, label: string, count: number) => (
    <button
      key={key}
      type='button'
      role='tab'
      className={lineTabClass}
      aria-selected={group === key}
      data-topic-group={key}
      onClick={() => onChange(key)}
    >
      {label}
      <span className='text-muted-foreground'>{count}</span>
    </button>
  );
  return (
    <div role='tablist' className={lineTabListClass}>
      {tab('topics', $t('followedTopics.topicDiscussions'), topics)}
      {tab('mentions', $t('followedTopics.mentions'), mentions)}
    </div>
  );
}
