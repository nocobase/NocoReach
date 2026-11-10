import { $t } from '#i18n';
import { useSearchParams } from 'react-router';
import { joinList } from '#lib/format';

// What the source pages say about the followed topics they search, kept apart from the components in
// followed-topics.tsx so that file only exports components.

/** The Memory edit dialog, opened at the Followed topics field. */
export const TOPICS_EDIT_PATH = '/project/memory/edit?field=topics';

export type Cadence = 'daily' | 'weekly' | 'monthly' | 'topicsWeekly';

/**
 * What the source searches: the product name when it has one, the number of followed topics, and how often (left out
 * where the page says that itself, as YouTube does when it is read by hand).
 */
export function topicScopeText({
  terms,
  topics,
  cadence,
}: {
  terms?: readonly string[];
  topics: number;
  cadence?: Cadence;
}): string {
  const often = cadence ? $t(`followedTopics.cadence.${cadence}`) : '';
  const text = terms?.length
    ? $t('followedTopics.scope', { 0: joinList(terms), 1: topics, 2: often })
    : $t('followedTopics.scopeTopicsOnly', { 0: topics, 1: often });
  return often ? text : text.replace(/\s*·\s*$/, '');
}

export type TopicGroup = 'topics' | 'mentions';

/**
 * The open group, kept in the URL (`group`): Topic discussions by default once the project follows topics, since the
 * mentions of the product are what the page showed before.
 */
export function useTopicGroup(
  hasTopics: boolean,
): [TopicGroup, (group: TopicGroup) => void] {
  const [params, setParams] = useSearchParams();
  const asked = params.get('group');
  const group: TopicGroup =
    asked === 'topics' || asked === 'mentions'
      ? asked
      : hasTopics
        ? 'topics'
        : 'mentions';
  return [
    group,
    (next) =>
      setParams(
        (cur) => {
          const out = new URLSearchParams(cur);
          out.set('group', next);
          return out;
        },
        { replace: true },
      ),
  ];
}

/** The topics an item came up under, for its meta line. */
export const topicMarks = (topics: readonly string[]) => joinList(topics);
