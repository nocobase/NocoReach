// @ts-nocheck
// Demo GitHub hot topics: a month of daily star records, so Gainers has a day, a week and a month to compare.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { backdateGitHubStars } from '../../server/nocoreach/demo-data/github-history.js';
import { gained } from '../../server/nocoreach/github-trends.js';

const TODAY = '2026-11-10';

function store(state) {
  return {
    state,
    mutate: async (_id, fn) => {
      state = fn(structuredClone(state));
      return state;
    },
    get current() {
      return state;
    },
  };
}

test('a month of daily records: Trending repositories gained what Trending says, a new one is recorded from the day after it was created', async () => {
  const s = store({
    lastRun: { day: TODAY },
    stars: {
      'nimbus/tasks': { [TODAY]: 9400 },
      'example-team/importer': { [TODAY]: 3100, '2026-11-09': 3095 },
      'openboard/openboard': { [TODAY]: 1240 },
    },
    repos: {
      'nimbus/tasks': { createdAt: '2024-11-30T00:00:00.000Z' },
      'example-team/importer': { createdAt: '2025-09-16T00:00:00.000Z' },
      'openboard/openboard': { createdAt: '2026-11-04T08:00:00.000Z' },
    },
    trending: {
      [TODAY]: {
        daily: [{ repo: 'nimbus/tasks', gained: 120 }],
        weekly: [{ repo: 'nimbus/tasks', gained: 700 }],
        monthly: [{ repo: 'nimbus/tasks', gained: 2600 }],
      },
    },
  });
  await backdateGitHubStars(s, '1');
  const stars = s.current.stars;
  assert.equal(gained(stars['nimbus/tasks'], TODAY, 1), 120);
  assert.equal(gained(stars['nimbus/tasks'], TODAY, 7), 700);
  assert.equal(gained(stars['nimbus/tasks'], TODAY, 30), 2600);
  assert.equal(
    stars['example-team/importer']['2026-11-09'],
    3095,
    'a record a read made stays',
  );
  assert.ok(gained(stars['example-team/importer'], TODAY, 30) > 0);
  const days = Object.keys(stars['openboard/openboard']).sort();
  assert.equal(days[0], '2026-11-05', 'from the day after it was created');
  assert.ok(gained(stars['openboard/openboard'], TODAY, 1) > 0);
  assert.equal(
    gained(stars['openboard/openboard'], TODAY, 7),
    null,
    'not a week old: under New and popular, not this week’s gainers',
  );
  for (const samples of Object.values(stars)) {
    const counts = Object.entries(samples)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, n]) => n);
    assert.deepEqual(
      counts,
      [...counts].sort((a, b) => a - b),
      'never fewer stars later',
    );
  }
  const once = structuredClone(s.current);
  await backdateGitHubStars(s, '1');
  assert.deepEqual(s.current, once, 'running it again changes nothing');
});

test('nothing to backdate before the first read', async () => {
  const s = store(null);
  await backdateGitHubStars(s, '1');
  assert.equal(s.current, null);
});
