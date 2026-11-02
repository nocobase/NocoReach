// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { backdateYouTube } from '../../server/nocoreach/demo-data/youtube-history.js';
import { found, videoKey, youtubeFixture } from './fixtures/youtube.js';

const DAY = 86400000;
const day = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);

describe('demo YouTube history', () => {
  it('first saves each video a little after it was published, within four weeks and never later than really saved', async () => {
    const f = await youtubeFixture();
    const now = new Date().toISOString();
    const published = { 1: day(60), 2: day(10), 3: day(0) } as const;
    await f.library.save('1', [
      ...Object.entries(published).map(([n, publishedAt]) => ({
        ...found(Number(n), { publishedAt }),
        likes: null,
        comments: null,
        fetchedAt: now,
        provider: 'dataforseo' as const,
      })),
      {
        ...found(4, { publishedAt: null }),
        likes: null,
        comments: null,
        fetchedAt: now,
        provider: 'dataforseo' as const,
      },
    ]);
    await backdateYouTube(f.db, '1');
    // Running it again changes nothing.
    await backdateYouTube(f.db, '1');
    const saved = Object.fromEntries(
      (await f.videos()).map((v) => [v.id, Date.parse(v.firstSeenAt)]),
    );
    const real = Date.parse(now);
    // Published two months ago: found by the first read, four weeks ago.
    expect(saved[videoKey(1)]).toBeGreaterThan(real - 28 * DAY);
    expect(saved[videoKey(1)]).toBeLessThan(real - 27 * DAY);
    // Published ten days ago: the next day, a few hours in.
    const ten = Date.parse(`${published[2]}T00:00:00.000Z`);
    expect(saved[videoKey(2)]).toBeGreaterThan(ten + DAY);
    expect(saved[videoKey(2)]).toBeLessThanOrEqual(ten + DAY + 10 * 3600000);
    // Published today, or with no date: saved when it really was.
    expect(saved[videoKey(3)]).toBe(real);
    expect(saved[videoKey(4)]).toBe(real);
    for (const at of Object.values(saved)) expect(at).toBeLessThanOrEqual(real);
    // Recording starts with the earliest, and the newest finds are the latest published.
    const status = await f.source.status('1');
    expect(status.recordingSince).toBe(
      new Date(saved[videoKey(1)]).toISOString(),
    );
    expect(status.recent.map((v) => v.id).slice(-1)).toEqual([videoKey(2)]);
  });
});
