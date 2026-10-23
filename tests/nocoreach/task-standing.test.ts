import { expect, it } from 'vitest';
import {
  projectWork,
  taskStanding,
} from '../../server/nocoreach/execution/model.js';
import { taskStanding as shownStanding } from '../../shared/task-pending.js';

// Where a task stands, the same on the server (Results, the online agent) and in the pages (Insights, Opportunities):
// a cancelled task, or one archived before it finished, is closed; one archived after it finished stays done.
const work = (w: object) => ({ ...projectWork({}), ...w });
it.each([
  [
    'cancelled while in progress',
    { stage: 'work', cancelledAt: 'x' },
    'closed',
  ],
  ['cancelled after finishing', { stage: 'done', cancelledAt: 'x' }, 'closed'],
  ['archived before finishing', { stage: 'work', archivedAt: 'x' }, 'closed'],
  ['archived after finishing', { stage: 'done', archivedAt: 'x' }, 'done'],
  ['finished', { stage: 'done' }, 'done'],
])('%s', (_name, w, expected) => {
  expect(taskStanding(work(w))).toBe(expected);
  expect(shownStanding({ work: work(w) })).toBe(expected);
});
