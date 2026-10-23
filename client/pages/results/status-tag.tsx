import { $t } from '#i18n';
import { Tag, type Tone } from '#components/reach/tag';
import type { ResultPhase } from './types.js';

const STATUS_TONE: Record<string, Tone> = {
  up: 'green',
  down: 'red',
  waiting: 'blue',
};
// One tag for a result on the dashboard and the full list: a finished delivery reads Delivered in grey; live work
// shows its comparison status. Work still waiting to go live is not in Results (2026-10-23).
export function ResultTag({
  phase,
  status,
}: {
  phase?: ResultPhase;
  status: string;
}) {
  if (phase === 'delivered')
    return <Tag tone='grey'>{$t('results.phase.delivered')}</Tag>;
  return (
    <Tag tone={STATUS_TONE[status] ?? 'grey'}>
      {$t(`results.status.${status}`)}
    </Tag>
  );
}
