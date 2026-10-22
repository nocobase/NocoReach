import { $t } from '#i18n';
import type { Tone } from '#components/reach/tag';
import {
  taskClosed,
  taskState,
  type TaskState,
  type TaskWork,
} from '../../../shared/task-pending.js';

// Where the task an opportunity became stands now, told the same way on Insights and Opportunities (2026-10-22 user
// feedback: a finished task still read "Handed off to agent").

/** Where the task an opportunity became stands now. */
export type TaskStanding = TaskState | 'closed';
export const taskStanding = (task: {
  work?: TaskWork | null;
  status?: string;
}): TaskStanding =>
  taskClosed(task.work) ? 'closed' : taskState(task.work, task.status);
/** Its tag: tone and label, in board order. */
export const TASK_TAG: Record<TaskStanding, [Tone, () => string]> = {
  todo: ['blue', () => $t('strategy.handedOffAgent')],
  doing: ['blue', () => $t('results.taskState.doing')],
  review: ['violet', () => $t('results.taskState.review')],
  done: ['green', () => $t('common.completed')],
  closed: ['slate', () => $t('common.closed')],
};
