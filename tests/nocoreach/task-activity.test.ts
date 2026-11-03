import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { eventText } from '../../client/pages/playbook-model';
import { effectChip } from '../../client/pages/task-list-model';
import { effectSummary } from '../../client/pages/effect-model';
import type { EffectResult } from '../../client/pages/effect-model';
import english from '../../shared/i18n/en.json';
import {
  ACTIVITY_EVENTS,
  QUIET_EVENTS,
  lastActivityAt,
  latestActivityFirst,
  shownInActivity,
} from '../../shared/task-activity';

// A task's latest activity (2026-11-02 user decision): the time of the last line the task page's Activity shows, which
// the board's cards, the Tasks list and every column's order read.

afterEach(() => setDictionary(null));

const effect = (extra: Partial<EffectResult>) =>
  ({
    day: 7,
    conclusion: 'insufficient',
    primary: null,
    change: null,
    computedAt: '2026-11-01T09:10:01.077Z',
    notes: [],
    ...extra,
  }) as unknown as EffectResult;

it('Activity has words for exactly the events it shows, plus the run bookkeeping it leaves out', () => {
  // Every case eventText words, read from its source, is either shown or quiet: a new event needs both.
  const source = fs.readFileSync(
    path.resolve(import.meta.dirname, '../../client/pages/playbook-model.ts'),
    'utf8',
  );
  const body = source.slice(source.indexOf('export function eventText'));
  const cases = new Set(
    [...body.matchAll(/case '([A-Za-z]+)':/gu)].map((m) => m[1]),
  );
  expect([...cases].sort()).toEqual(
    [...ACTIVITY_EVENTS, ...QUIET_EVENTS].sort(),
  );
  for (const action of ACTIVITY_EVENTS) {
    expect(QUIET_EVENTS.has(action)).toBe(false);
    expect(
      eventText({ action, note: '7' }, () => 'Step', 'Agent'),
    ).not.toBeNull();
  }
});

it('the effect reading is a line in Activity, in the words of the status chip', () => {
  setDictionary(english);
  const day7 = effect({});
  const day28 = effect({
    day: 28,
    conclusion: 'up',
    primary: 'clicks',
    change: 0.26,
  });
  const line = (note: string) =>
    eventText(
      { at: day7.computedAt, action: 'effect', note },
      () => '',
      'Agent',
      null,
      [day7, day28],
    );
  expect(line('7')).toEqual({
    who: 'System',
    text: 'recorded the day 7 result: not enough data',
  });
  expect(line('28')?.text).toBe('recorded the day 28 result: Clicks ↑ 26%');
  expect(effectChip(day7).text).toBe('Day 7: not enough data');
  expect(effectChip(day28)).toEqual({
    text: 'Day 28: Clicks ↑ 26%',
    tone: 'green',
  });
  expect(
    effectSummary(effect({ conclusion: 'flat', primary: 'views', change: 0 })),
  ).toBe('no clear change');
  expect(
    effectChip(
      effect({ conclusion: 'down', primary: 'views', change: -0.104 }),
    ),
  ).toEqual({ text: 'Day 7: Views ↓ 10%', tone: 'red' });
  setDictionary(null);
  expect(line('7')?.text).toBe('记录了第 7 天结果：数据不足');
  expect(effectChip(day28).text).toBe('第 28 天：点击 ↑ 26%');
});

it('the latest activity is the last line Activity shows, not the last write', () => {
  // T-33 on Studio: the day-7 reading at 17:10 (UTC+8) is its last line.
  const t33 = {
    id: 33,
    createdAt: '2026-10-21T09:39:13.887Z',
    updatedAt: '2026-11-01T09:10:00.789Z',
    evidence: {
      work: {
        history: [
          { at: '2026-10-22T10:51:11.572Z', action: 'approveStage' },
          { at: '2026-10-22T11:01:36.800Z', action: 'live' },
          { at: '2026-11-01T09:09:59.451Z', action: 'effect' },
        ],
      },
    },
  };
  expect(lastActivityAt(t33)).toBe('2026-11-01T09:09:59.451Z');
  // Run bookkeeping and writes Activity has no line for do not count, however late; the order of entries does not
  // matter, nor does how the time is written.
  const quiet = {
    id: 2,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-11-02T00:00:00Z',
    evidence: {
      work: {
        history: [
          { at: '2026-10-29T22:44:47.656+08:00', action: 'setAgent' },
          { at: '2026-10-27T15:50:04.544Z', action: 'startTask' },
          { at: '2026-11-02T00:00:00Z', action: 'runQueued' },
          { at: '2026-11-02T00:00:00Z', action: 'runStarted' },
          { at: '2026-11-02T00:00:00Z', action: 'runFailed' },
          { at: '2026-11-02T00:00:00Z', action: 'flowWaiting' },
          { at: '2026-11-02T00:00:00Z', action: 'cancelRun' },
          { at: '2026-11-02T00:00:00Z', action: 'recoverResult' },
        ],
      },
    },
  };
  expect(lastActivityAt(quiet)).toBe('2026-10-29T14:44:47.656Z');
  expect(shownInActivity({ action: 'runStarted' })).toBe(false);
  // Nothing in Activity yet: when the task was created, else its stored update time.
  expect(
    lastActivityAt({
      id: 3,
      createdAt: '2026-10-30T08:00:00+08:00',
      updatedAt: '2026-11-02T00:00:00Z',
      evidence: { work: { history: [] } },
    }),
  ).toBe('2026-10-30T00:00:00.000Z');
  expect(lastActivityAt({ updatedAt: '2026-11-02T00:00:00Z' })).toBe(
    '2026-11-02T00:00:00.000Z',
  );
  expect(lastActivityAt({ updatedAt: 'not a time' })).toBeUndefined();
});

it('the board runs newest activity first, as Studio’s Done column should', () => {
  const task = (no: number, history: { at: string; action: string }[]) => ({
    id: 1000 + no,
    no,
    // Every one was written by something later, which no longer moves it.
    updatedAt: '2026-11-02T08:00:00Z',
    evidence: { work: { history } },
  });
  const done = [
    task(46, [{ at: '2026-10-27T07:17:57.231Z', action: 'approveStage' }]),
    task(33, [
      { at: '2026-10-22T11:01:36.800Z', action: 'live' },
      { at: '2026-11-01T09:09:59.451Z', action: 'effect' },
    ]),
    task(49, [
      { at: '2026-10-29T14:44:50.819Z', action: 'approveStage' },
      { at: '2026-10-29T14:45:00.000Z', action: 'runQueued' },
    ]),
    task(52, [
      { at: '2026-11-02T06:35:58.968Z', action: 'live' },
      { at: '2026-11-02T06:35:58.968Z', action: 'confirmLive' },
    ]),
    task(34, [
      { at: '2026-10-22T10:03:36.435Z', action: 'live' },
      { at: '2026-11-01T09:10:01.077Z', action: 'effect' },
    ]),
    { id: 1, no: 1, evidence: { work: { history: [] } } },
  ];
  expect(latestActivityFirst(done).map((t) => t.no)).toEqual([
    52, 34, 33, 49, 46, 1,
  ]);
  // The same time: the newer task first.
  const same = [task(5, []), task(6, [])].map((t) => ({
    ...t,
    createdAt: '2026-11-01T00:00:00Z',
  }));
  expect(latestActivityFirst(same).map((t) => t.no)).toEqual([6, 5]);
});
