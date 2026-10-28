import { $t } from '#i18n';
import type { Tone } from '#components/reach/tag';
import type { TaskStanding } from '../../../shared/task-pending.js';

// Where the task an opportunity or a change became stands now, told the same way on Insights and Opportunities
// (2026-10-22 user feedback: a finished task still read "Handed off to agent"). The state itself is
// shared/task-pending.ts's taskStanding, which the online agent reads too.
export {
  taskStanding,
  type TaskStanding,
} from '../../../shared/task-pending.js';
/** Its tag: tone and label, in board order. */
export const TASK_TAG: Record<TaskStanding, [Tone, () => string]> = {
  todo: ['blue', () => $t('strategy.handedOffAgent')],
  doing: ['blue', () => $t('results.taskState.doing')],
  review: ['violet', () => $t('results.taskState.review')],
  done: ['green', () => $t('common.completed')],
  closed: ['slate', () => $t('common.closed')],
  // Put aside until a day (Snooze, 2026-10-28): nothing waits on anyone until then.
  snoozed: ['slate', () => $t('common.snoozed')],
};
