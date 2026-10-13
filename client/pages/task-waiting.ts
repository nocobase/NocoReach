import { taskOwner } from './me';
import { isClosed, workState, type Work } from './task-execution-types';

export const WAITING_TASKS_URL = '/actions?scope=waiting&view=list';

type WaitingTask = {
  status: string;
  evidence?: { work?: Work; createdBy?: { id?: string } };
};

// Keep the insights count and task-list scope on the same ownership/lifecycle rule.
// `mine` comes from the authenticated member boundary, including unassigned admin work.
export function isWaitingTask(
  task: WaitingTask,
  mine: (ownerId?: string | null) => boolean,
): boolean {
  return (
    mine(taskOwner(task)) &&
    !isClosed(task.evidence?.work) &&
    ['todo', 'review'].includes(workState(task.evidence?.work, task.status))
  );
}
