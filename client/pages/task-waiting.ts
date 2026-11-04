import { taskOwner } from './me';
import { taskWaiting } from '../../shared/task-pending.js';
import type { Work } from './task-execution-types';

export const WAITING_TASKS_URL = '/actions?scope=waiting&view=list';

type WaitingTask = {
  status: string;
  evidence?: { work?: Work; createdBy?: { id?: string } };
};

// Keep the insights count and task-list scope on the same ownership/lifecycle rule as the server's Tasks badge
// (shared/task-pending.ts `taskWaiting`). `mine` comes from the authenticated member boundary, including unassigned
// admin work.
export function isWaitingTask(
  task: WaitingTask,
  mine: (ownerId?: string | null) => boolean,
): boolean {
  return mine(taskOwner(task)) && taskWaiting(task.evidence?.work, task.status);
}
