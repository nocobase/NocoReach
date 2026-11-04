import { describe, expect, it } from 'vitest';
import { $t } from '../../client/i18n';
import {
  boardState,
  projectWork,
  taskStanding,
} from '../../server/nocoreach/execution/model.js';
import {
  awaitingRestart,
  taskState,
  taskWaiting,
} from '../../shared/task-pending.js';
import {
  restartOf,
  workState,
  type Work,
} from '../../client/pages/task-execution-types';
import { isWaitingTask } from '../../client/pages/task-waiting';
import { stepOf } from '../../client/pages/task-list-model';
import { placeOf } from '../../client/pages/task-agents';

// An Agent step whose run failed, or that waits to be started again after a reopen, needs a person as a failed merge
// does (2026-11-04 user decision): Needs you on the board, in the list's status, in Tasks › Waiting for me, the Tasks
// badge and the Insights waiting strip, on the server and in the pages alike.
const stages = [
  { key: 'build', name: 'Edit the page', kind: 'agent' },
  { key: 'review', name: 'Review the change', kind: 'review' },
  { key: 'release', name: 'Go live', kind: 'release' },
];
const flow = (extra: Record<string, unknown> = {}) =>
  ({
    ...projectWork({}),
    stage: 'flow',
    flow: { stages },
    stageIndex: 0,
    humanOwnerId: 'me',
    ...extra,
  }) as ReturnType<typeof projectWork>;
const reopened = (note: 'stopped' | 'withdrawn', later: object[] = []) => [
  { at: '2026-11-03T09:00:00Z', actor: 'me', action: 'cancelTask' },
  {
    at: '2026-11-03T09:10:00Z',
    actor: 'me',
    action: 'unarchiveTask',
    stageKey: 'build',
    note,
  },
  ...later,
];
const mine = (owner?: string | null) => owner === 'me';
const task = (w: object) => ({
  status: 'In progress',
  evidence: { work: w as Work },
});

describe.each<[string, object, 'doing' | 'review']>([
  ['an Agent at work', { latestRun: { id: 'r1', status: 'running' } }, 'doing'],
  [
    'an Agent run waiting to be picked up',
    { latestRun: { id: 'r1', status: 'queued' } },
    'doing',
  ],
  [
    'a failed Agent run',
    { latestRun: { id: 'r1', status: 'failed' } },
    'review',
  ],
  [
    'a failed run tried again',
    {
      latestRun: { id: 'r2', status: 'queued' },
      history: [{ at: 'x', actor: 'me', action: 'runQueued', runId: 'r2' }],
    },
    'doing',
  ],
  [
    'a step the closing stopped, reopened',
    {
      latestRun: { id: 'r1', status: 'failed' },
      history: reopened('stopped'),
    },
    'review',
  ],
  [
    'a step whose change the closing withdrew, reopened',
    {
      results: [{ id: 'a1', pr: { number: 12 } }],
      latestRun: { id: 'close-1', status: 'succeeded' },
      history: reopened('withdrawn'),
    },
    'review',
  ],
  [
    'a reopened step started again',
    {
      latestRun: { id: 'r2', status: 'running' },
      history: reopened('stopped', [
        { at: 'y', actor: 'me', action: 'runQueued', runId: 'r2' },
      ]),
    },
    'doing',
  ],
  [
    'a failed run moved to In progress by hand',
    { latestRun: { id: 'r1', status: 'failed' }, boardState: 'doing' },
    'doing',
  ],
  [
    'a failed merge',
    { stageIndex: 2, release: { state: 'merge_failed', note: '', pages: [] } },
    'review',
  ],
  [
    'an article that could not be published',
    {
      stageIndex: 2,
      release: { state: 'publish_failed', note: '', pages: [] },
    },
    'review',
  ],
  [
    'a merge under way',
    { stageIndex: 2, release: { state: 'merging', note: '', pages: [] } },
    'doing',
  ],
])('%s', (_name, extra, expected) => {
  const w = flow(extra);
  it('has the same state on the server and in the pages', () => {
    expect(taskState(w)).toBe(expected);
    expect(workState(w as Work, 'In progress')).toBe(expected);
    expect(boardState(w)).toBe(expected);
    expect(taskStanding(w)).toBe(expected);
  });
  it(`${expected === 'review' ? 'is' : 'is not'} in Waiting for me`, () => {
    expect(taskWaiting(w)).toBe(expected === 'review');
    expect(isWaitingTask(task(w), mine)).toBe(expected === 'review');
  });
});

describe('a failed or reopened Agent step', () => {
  const failed = flow({ latestRun: { id: 'r1', status: 'failed' } }),
    stopped = flow({
      latestRun: { id: 'r1', status: 'failed' },
      history: reopened('stopped'),
    }),
    withdrawn = flow({
      latestRun: { id: 'close-1', status: 'succeeded' },
      history: reopened('withdrawn'),
    });
  it('keeps its own Current step label', () => {
    expect(stepOf(failed as Work)).toEqual({
      text: $t('taskList.runFailed', { 0: 'Agent' }),
      tone: 'red',
    });
    for (const w of [stopped, withdrawn])
      expect(stepOf(w as Work)).toEqual({
        text: $t('taskList.waitingRestart'),
        tone: 'amber',
      });
  });
  it('waits for a person in By Agent, with the same label as the list', () => {
    expect(placeOf(failed as Work, true)).toEqual({
      lane: 'waiting',
      ask: { text: $t('taskAgents.runFailed'), tone: 'red' },
    });
    for (const w of [stopped, withdrawn])
      expect(placeOf(w as Work, true)).toEqual({
        lane: 'waiting',
        ask: { text: $t('taskList.waitingRestart'), tone: 'amber' },
      });
  });
  it('reads the restart marker the same way on the server and in the pages', () => {
    expect(awaitingRestart(stopped)).toBe('stopped');
    expect(restartOf(stopped as Work)).toBe('stopped');
    expect(awaitingRestart(withdrawn)).toBe('withdrawn');
    expect(awaitingRestart(failed)).toBeUndefined();
    // A reopen marker for another step does not hold once the task moved on.
    expect(
      awaitingRestart(flow({ stageIndex: 1, history: reopened('stopped') })),
    ).toBeUndefined();
  });
  it('is not waiting for anyone once closed or snoozed', () => {
    const closed = flow({
      latestRun: { id: 'r1', status: 'failed' },
      cancelledAt: '2026-11-03T09:00:00Z',
    });
    expect(taskStanding(closed)).toBe('closed');
    expect(taskWaiting(closed)).toBe(false);
    expect(isWaitingTask(task(closed), mine)).toBe(false);
    const snoozed = flow({
      latestRun: { id: 'r1', status: 'failed' },
      snooze: {
        until: '2099-01-01T01:00:00Z',
        day: '2099-01-01',
        at: 'x',
        by: 'me',
      },
    });
    expect(taskStanding(snoozed)).toBe('snoozed');
    expect(taskWaiting(snoozed)).toBe(false);
    expect(isWaitingTask(task(snoozed), mine)).toBe(false);
  });
  it('is someone else’s to handle when another person owns it', () => {
    expect(
      isWaitingTask(task({ ...failed, humanOwnerId: 'other' }), mine),
    ).toBe(false);
  });
});
