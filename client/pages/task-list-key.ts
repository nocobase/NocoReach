/**
 * The project's task list in the workspace cache, shared by Insights, Opportunities, Tasks and Pages: a page opened
 * after another shows the list that one read while it reads it again.
 */
export const taskListKey = (projectId: number) => `tasks:${projectId}`;
