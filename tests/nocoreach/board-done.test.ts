import { expect, it } from 'vitest';
import { finishedAt, isWatching, onBoard } from '../../client/pages/board-done';
import type { Work } from '../../client/pages/task-execution-types';

const DAY = 86_400_000;
const now = Date.parse('2026-10-28T12:00:00Z');
const ago = (days: number) => new Date(now - days * DAY).toISOString();
const work = (extra: Partial<Work>) =>
  ({ stage: 'done', results: [], history: [], ...extra }) as unknown as Work;

// 2026-10-28 user request: the board's Done column keeps what is watched and what finished in the last 7 days.
it('a finished task stays on the board for a week after it finished, a comment does not bring it back', () => {
  const recent = work({
    history: [{ at: ago(3), action: 'approveStage' }],
  });
  expect(onBoard(recent, ago(3), now)).toBe(true);
  const old = work({
    history: [
      { at: ago(20), action: 'approveStage' },
      // Touched since, without finishing it again.
      { at: ago(1), action: 'comment', comment: 'nice' },
      { at: ago(1), action: 'moveWork', previous: 'done', note: 'done' },
    ],
  });
  expect(finishedAt(old, ago(1))).toBe(ago(20));
  expect(onBoard(old, ago(1), now)).toBe(false);
  // Dragged to Done today: finished today.
  const dragged = work({
    history: [
      { at: ago(30), action: 'startTask' },
      { at: ago(0), action: 'moveWork', previous: 'review', note: 'done' },
    ],
  });
  expect(onBoard(dragged, ago(0), now)).toBe(true);
  // Without any history, the last update.
  expect(onBoard(work({}), ago(8), now)).toBe(false);
  expect(onBoard(work({}), ago(6), now)).toBe(true);
});

it('a live task is watched until its last checkpoint, then counts from that reading', () => {
  const live = (results: { day: number; computedAt: string }[] = []) =>
    work({
      observeFrom: ago(40),
      release: { state: 'live', pages: ['https://example.com/a'] },
      observation: { results },
    } as Partial<Work>);
  expect(isWatching(live())).toBe(true);
  expect(onBoard(live(), ago(40), now)).toBe(true);
  expect(isWatching(live([{ day: 7, computedAt: ago(30) }]))).toBe(true);
  const read = live([
    { day: 7, computedAt: ago(30) },
    { day: 28, computedAt: ago(2) },
  ]);
  expect(isWatching(read)).toBe(false);
  expect(finishedAt(read, ago(40))).toBe(ago(2));
  expect(onBoard(read, ago(40), now)).toBe(true);
  expect(
    onBoard(
      live([
        { day: 7, computedAt: ago(30) },
        { day: 28, computedAt: ago(9) },
      ]),
      ago(9),
      now,
    ),
  ).toBe(false);
  // No page to watch: finished the day it went live.
  const unwatched = work({ observeFrom: ago(10) } as Partial<Work>);
  expect(isWatching(unwatched)).toBe(false);
  expect(onBoard(unwatched, ago(1), now)).toBe(false);
});
