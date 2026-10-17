import { $t } from '#i18n';
import { Tag, stateToneOf, type Tone } from '#components/reach/tag';
import type { ResultPhase } from './types.js';

const STATUS_TONE: Record<string, Tone> = {
  up: 'green',
  down: 'red',
  waiting: 'blue',
};
// One tag for a result on the dashboard and the full list. Work that is not live says so: 待上线 takes its task's
// hue (violet while it waits for a person's review, blue while in progress), 已交付 stays grey; live work shows its
// comparison status.
export function ResultTag({
  phase,
  status,
  taskState,
}: {
  phase?: ResultPhase;
  status: string;
  taskState?: string;
}) {
  if (phase === 'pendingLive')
    return (
      <Tag tone={stateToneOf(taskState ?? 'todo')}>
        {$t('results.phase.pendingLive')}
      </Tag>
    );
  if (phase === 'delivered')
    return <Tag tone='grey'>{$t('results.phase.delivered')}</Tag>;
  return (
    <Tag tone={STATUS_TONE[status] ?? 'grey'}>
      {$t(`results.status.${status}`)}
    </Tag>
  );
}
