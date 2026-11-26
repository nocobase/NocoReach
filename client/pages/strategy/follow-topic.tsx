import { $t, $legacyText } from '#i18n';
import { useState, type ReactElement } from 'react';
import { useBusinessAccess } from '#hooks/use-business-access';
import { topicKey } from '../../../shared/followed-topics.js';
import type { GrowthTopic } from '../../../shared/growth.js';
import { request } from '../project-knowledge/model';

// A new topic the AI found (2026-11-10 step 2b) says which followed topic's discussions it came from and that it is not
// followed yet, with Add to followed topics beside it: one click adds it to Memory's followed topics (at most ten),
// so the sources start collecting it. Only those who may edit Memory see the button.

type State = 'idle' | 'busy' | 'added' | { error: string };

export function NewTopicNote({
  projectId,
  topic,
  followed,
}: {
  projectId: number;
  topic: GrowthTopic;
  followed: readonly string[];
}): ReactElement | null {
  const { can } = useBusinessAccess('nrKnowledge.followTopic', projectId);
  const [state, setState] = useState<State>(() =>
    followed.some((t) => topicKey(t) === topicKey(topic.name))
      ? 'added'
      : 'idle',
  );
  if (topic.followed) return null;
  const follow = async () => {
    setState('busy');
    try {
      await request('followTopic', projectId, { topic: topic.name });
      setState('added');
    } catch (e) {
      setState({
        error:
          e instanceof Error
            ? $legacyText(e.message)
            : $t('growth.topic.followFailed'),
      });
    }
  };
  return (
    <span data-new-topic={topic.name}>
      {topic.from
        ? $t('growth.topic.foundIn', { 0: topic.from })
        : $t('growth.topic.notFollowed')}
      {state === 'added' ? (
        <> · {$t('growth.topic.added')}</>
      ) : can ? (
        <>
          {' · '}
          <button
            type='button'
            className='nr-link disabled:opacity-50'
            disabled={state === 'busy'}
            onClick={() => void follow()}
          >
            {$t('growth.topic.follow')}
          </button>
        </>
      ) : null}
      {typeof state === 'object' ? (
        <span className='ml-1 text-destructive'>{state.error}</span>
      ) : null}
    </span>
  );
}
