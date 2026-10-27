// @vitest-environment node
import { expect, test } from 'vitest';
import { runNotes } from '../../server/nocoreach/execution/flow';

const comment = (at: string, text: string) => ({
  at,
  action: 'comment',
  comment: text,
});

// 2026-10-24: the start card's optional note was removed; instructions left in the activity before the start take
// its place and must not fall out of what the runs read as later messages pile up.
test('messages left before the start stay, with the latest five, oldest first', () => {
  const history = [
    comment('2026-10-24T08:00:00Z', 'Only change the English version'),
    { at: '2026-10-24T08:05:00Z', action: 'startTask' },
    ...Array.from({ length: 8 }, (_, i) =>
      comment(`2026-10-24T09:0${i}:00Z`, `Later ${i + 1}`),
    ),
  ];
  expect(runNotes(history)).toEqual([
    'Only change the English version',
    'Later 4',
    'Later 5',
    'Later 6',
    'Later 7',
    'Later 8',
  ]);
});

test('before the start every message counts as an instruction, up to five', () => {
  const history = Array.from({ length: 7 }, (_, i) =>
    comment(`2026-10-24T08:0${i}:00Z`, `Note ${i + 1}`),
  );
  // Not started: the first five are the start's instructions, and the latest are added after them.
  expect(runNotes(history)).toEqual([
    'Note 1',
    'Note 2',
    'Note 3',
    'Note 4',
    'Note 5',
    'Note 6',
    'Note 7',
  ]);
});

test('within the budget the instruction stays and the older of the latest are left out', () => {
  const long = 'x'.repeat(2500);
  const history = [
    comment('2026-10-24T08:00:00Z', 'Keep the technical tone'),
    { at: '2026-10-24T08:05:00Z', action: 'startTask' },
    comment('2026-10-24T09:00:00Z', `a${long}`),
    comment('2026-10-24T09:01:00Z', `b${long}`),
    comment('2026-10-24T09:02:00Z', `c${long}`),
  ];
  expect(runNotes(history).map((n) => n.slice(0, 1))).toEqual(['K', 'b', 'c']);
});
