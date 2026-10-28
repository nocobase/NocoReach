import type { TaskData } from '../task-execution-types';

/**
 * What the task page hands its child pages (the article's reading page) through its Outlet: the task as the page has
 * it, the same command function, and the draft scope of the step being reviewed, so an edit started on one page is there
 * on the other.
 */
export type TaskPageContext = {
  data: TaskData;
  update: (command: string, body?: object) => Promise<TaskData | undefined>;
  busy: boolean;
  error: string;
  allowed: boolean;
  /** The current step's draft scope, as the step's card uses it. */
  draftScope: string;
  /** The task's short name for the trail: T-39, else its title. */
  crumb: string;
  heading: string;
  /** Focus the task page's message box, where changes are asked for, once this page has gone back to it. */
  requestChanges: () => void;
};
