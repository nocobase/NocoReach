// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { YouTubeError } from '../../server/nocoreach/youtube-provider.js';
import { migrated } from '../../server/nocoreach/youtube-source.js';
import {
  details,
  found,
  videoKey,
  youtubeFixture,
} from './fixtures/youtube.js';

const nextMonth = () => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();
};
const yesterday = () => new Date(Date.now() - 86400000 * 1.5).toISOString();

describe('YouTube through DataForSEO', () => {
  it('needs a verified DataForSEO connection before saving terms or reading', async () => {
    const f = await youtubeFixture();
    f.reader.ready.mockReturnValue(false);
    await expect(
      f.source.connect('1', { terms: 'NocoBase' }),
    ).rejects.toMatchObject({ code: 'dataforseo_missing', status: 409 });
    expect(await f.source.status('1')).toMatchObject({
      configured: false,
      dataforseo: false,
      spend: null,
      total: 0,
    });
    await f.source.tick();
    expect(f.reader.search).not.toHaveBeenCalled();
  });

  it('searches each term, reads likes and comments once per new video, and keeps daily reading on', async () => {
    const f = await youtubeFixture();
    f.reader.search.mockImplementation(async (_id, term) => ({
      ok: true,
      videos:
        term === 'NocoBase'
          ? [found(1), found(2)]
          : [found(2), found(3, { title: '' })],
      costUsd: 0.002,
    }));
    const first = await f.connect('1', 'NocoBase\nAirtable alternative');
    expect(f.reader.search.mock.calls.map((c) => c.slice(1))).toEqual([
      ['NocoBase', true],
      ['Airtable alternative', true],
    ]);
    expect(f.reader.details.mock.calls.map((c) => c[1])).toEqual([
      videoKey(1),
      videoKey(2),
      videoKey(3),
    ]);
    expect(first).toMatchObject({
      configured: true,
      connected: true,
      dataforseo: true,
      autoSync: true,
      terms: ['NocoBase', 'Airtable alternative'],
      total: 3,
      pendingDetails: 0,
      pausedUntil: null,
      spend: { monthUsd: 0.5, budgetUsd: 10 },
      lastSync: {
        ok: true,
        missed: [],
        found: 3,
        added: 3,
        costUsd: 0.022,
      },
    });
    expect(first.recent).toHaveLength(3);
    expect(first.nextSyncAt).not.toBeNull();
    // Two terms a day, and before a week of history one new video a term a day.
    expect(first.estimate).toMatchObject({ monthlyUsd: 0.48, readUsd: 0.004 });
    const saved = await f.videos();
    expect(saved.find((v) => v.id === videoKey(3))).toMatchObject({
      title: 'Video 3',
      likes: 30,
      comments: 3,
      provider: 'dataforseo',
    });
    // The next read searches again but does not read known videos' details again.
    f.reader.details.mockClear();
    f.reader.search.mockResolvedValue({
      ok: true,
      videos: [found(1, { views: 999, title: '' })],
      costUsd: 0.002,
    });
    const second = await f.sync();
    expect(f.reader.details).not.toHaveBeenCalled();
    expect(second.lastSync).toMatchObject({
      found: 1,
      added: 0,
      costUsd: 0.004,
    });
    expect((await f.videos()).find((v) => v.id === videoKey(1))).toMatchObject({
      title: 'Video 1',
      views: 999,
      likes: 10,
      firstSeenAt: saved.find((v) => v.id === videoKey(1))!.firstSeenAt,
    });
  });

  it('reads tracked videos on every read and counts them in the estimate', async () => {
    const f = await youtubeFixture();
    const status = await f.connect('1', 'NocoBase', {
      videoUrls: `https://youtu.be/${videoKey(9)}`,
    });
    expect(status.videoUrls).toEqual([
      `https://www.youtube.com/watch?v=${videoKey(9)}`,
    ]);
    expect(f.reader.details.mock.calls[0][1]).toBe(videoKey(9));
    f.reader.details.mockClear();
    const again = await f.sync();
    expect(f.reader.details.mock.calls.map((c) => c[1])).toEqual([videoKey(9)]);
    expect(again.total).toBe(3);
    expect(again.estimate.readUsd).toBe(0.008);
    expect(again.estimate.monthlyUsd).toBe(0.42);
  });

  it('keeps the other terms when one times out, and says which one', async () => {
    const f = await youtubeFixture();
    f.reader.search.mockImplementation(async (_id, term) =>
      term === 'Slow term'
        ? { ok: false, missed: 'timeout', costUsd: 0 }
        : { ok: true, videos: [found(1)], costUsd: 0.002 },
    );
    const status = await f.connect('1', 'NocoBase\nSlow term');
    expect(status.lastSync).toMatchObject({
      ok: true,
      missed: [{ term: 'Slow term', reason: 'timeout' }],
    });
    expect(status.total).toBe(1);
    // A read where no term gets through fails, and keeps what was saved.
    f.reader.search.mockResolvedValue({
      ok: false,
      missed: 'timeout',
      costUsd: 0,
    });
    const failed = await f.sync();
    expect(failed.lastSync).toMatchObject({
      ok: false,
      code: 'timeout',
      errors: [new YouTubeError('timeout').message],
    });
    expect(failed.total).toBe(1);
  });

  it('stops at the month’s budget, keeps what it read, and resumes next month or when the budget is raised', async () => {
    const f = await youtubeFixture();
    f.reader.search.mockImplementation(async (_id, term) => {
      if (term === 'Second') throw new YouTubeError('budget_exceeded');
      return { ok: true, videos: [found(1), found(2)], costUsd: 0.002 };
    });
    const status = await f.connect('1', 'First\nSecond');
    expect(f.reader.search).toHaveBeenCalledTimes(2);
    expect(f.reader.details).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      total: 2,
      pendingDetails: 2,
      pausedUntil: nextMonth(),
      nextSyncAt: nextMonth(),
      lastSync: { ok: true, found: 2, added: 2 },
    });
    // A day later the budget is still used up: the daily read waits.
    await f.store('1', {
      ...(await f.stored()),
      lastSync: { ...status.lastSync, at: yesterday() },
    });
    f.reader.search.mockClear();
    f.reader.spend.mockResolvedValue({ monthUsd: 10, budgetUsd: 10 });
    await f.source.tick();
    expect(f.reader.search).not.toHaveBeenCalled();
    // Raised: the daily read runs, reads the waiting videos and lifts the pause.
    f.reader.spend.mockResolvedValue({ monthUsd: 10, budgetUsd: 20 });
    f.reader.search.mockResolvedValue({ ok: true, videos: [], costUsd: 0.002 });
    await f.source.tick();
    expect(f.reader.search.mock.calls.map((c) => c[2])).toEqual([false, false]);
    expect(f.reader.details.mock.calls.map((c) => c[1])).toEqual([
      videoKey(1),
      videoKey(2),
    ]);
    expect(await f.source.status('1')).toMatchObject({
      pendingDetails: 0,
      pausedUntil: null,
      lastSync: { ok: true },
    });
    // A read the budget refuses outright fails and pauses as well.
    f.reader.search.mockRejectedValue(new YouTubeError('budget_exceeded'));
    expect(await f.sync()).toMatchObject({
      pausedUntil: nextMonth(),
      lastSync: { ok: false, code: 'budget_exceeded' },
    });
  });

  it('counts a term DataForSEO refused against that term only', async () => {
    const f = await youtubeFixture();
    f.reader.search.mockImplementation(async (_id, term) =>
      term === 'Refused'
        ? { ok: false, missed: 'failed', costUsd: 0 }
        : { ok: true, videos: [found(1)], costUsd: 0.002 },
    );
    f.reader.details.mockResolvedValue({ ok: false, costUsd: 0 });
    const status = await f.connect('1', 'Refused\nNocoBase');
    expect(status.lastSync).toMatchObject({
      ok: true,
      missed: [{ term: 'Refused', reason: 'failed' }],
    });
    // The video whose details were not read waits for the next read.
    expect(status.pendingDetails).toBe(1);
    expect((await f.videos())[0]).toMatchObject({ views: 100, likes: null });
  });

  it('turns daily reading off and on without reading again', async () => {
    const f = await youtubeFixture();
    const first = await f.connect();
    f.reader.search.mockClear();
    const off = await f.connect('1', 'NocoBase', { autoSync: false });
    expect(f.reader.search).not.toHaveBeenCalled();
    expect(off).toMatchObject({ autoSync: false, nextSyncAt: null });
    expect(off.lastSync).toEqual(first.lastSync);
    await f.store('1', {
      ...(await f.stored()),
      lastSync: { ...first.lastSync, at: yesterday() },
    });
    await f.source.tick();
    expect(f.reader.search).not.toHaveBeenCalled();
    expect(
      (await f.connect('1', 'NocoBase', { autoSync: true })).autoSync,
    ).toBe(true);
    expect(f.reader.search).not.toHaveBeenCalled();
    await f.source.tick();
    expect(f.reader.search).toHaveBeenCalledTimes(1);
  });

  it('carries over terms, tracked videos and saved videos from the Collector reader', async () => {
    const f = await youtubeFixture();
    await f.library.save('1', [
      {
        ...details(1, { views: 5, likes: 4, comments: 3 }),
        fetchedAt: '2026-10-20T00:00:00.000Z',
        provider: 'yt-dlp',
        transcript: {
          status: 'manual',
          language: 'en',
          text: 'Caption the Collector read',
          truncated: false,
        },
      },
    ]);
    await f.store('1', {
      revision: 'legacy',
      configured: true,
      terms: ['NocoBase'],
      videoIds: [videoKey(7)],
      autoSync: false,
      verifiedAt: '2026-10-20T00:00:00.000Z',
      fetchedAt: '2026-10-28T00:00:00.000Z',
      analysisVideoIds: [videoKey(1)],
      lastSync: {
        at: '2026-10-29T00:00:00.000Z',
        ok: false,
        errors: ['Collector could not read YouTube'],
        attempts: 3,
        lastSuccessAt: '2026-10-28T00:00:00.000Z',
        code: 'collector_unreachable',
        needsAttention: true,
      },
    });
    expect(await f.source.status('1')).toMatchObject({
      configured: true,
      connected: true,
      autoSync: true,
      terms: ['NocoBase'],
      videoUrls: [`https://www.youtube.com/watch?v=${videoKey(7)}`],
      lastSync: null,
      total: 1,
    });
    // Saved terms make YouTube connected only while DataForSEO is verified.
    f.reader.ready.mockReturnValueOnce(false);
    expect((await f.source.status('1')).connected).toBe(false);
    await f.source.tick();
    expect(f.reader.search).toHaveBeenCalledWith('1', 'NocoBase', false);
    expect(f.reader.details.mock.calls.map((c) => c[1])).toEqual([
      videoKey(7),
      videoKey(2),
    ]);
    const saved = await f.videos();
    expect(saved.map((v) => v.id)).toEqual([
      videoKey(1),
      videoKey(2),
      videoKey(7),
    ]);
    expect(saved[0]).toMatchObject({
      provider: 'dataforseo',
      views: 100,
      likes: 4,
      comments: 3,
      firstSeenAt: '2026-10-20T00:00:00.000Z',
      transcript: { text: 'Caption the Collector read' },
    });
    expect((await f.stored())?.engine).toBe('dataforseo');
    // A disconnected Collector state stays off.
    expect(
      migrated({
        revision: 'r',
        configured: false,
        terms: [],
        videoIds: [],
        autoSync: true,
        verifiedAt: null,
        fetchedAt: null,
        lastSync: null,
      }),
    ).toMatchObject({ autoSync: false, engine: 'dataforseo' });
  });

  it('rejects stale saves, disconnects and clears, and keeps saved videos on disconnect', async () => {
    const f = await youtubeFixture();
    const status = await f.connect();
    await expect(
      f.source.connect('1', { terms: 'Other', revision: 'stale' }),
    ).rejects.toMatchObject({ code: 'config_changed' });
    await expect(
      f.source.clear('1', { revision: 'stale' }),
    ).rejects.toMatchObject({ code: 'config_changed' });
    const off = await f.source.disconnect('1', { revision: status.revision });
    expect(off).toMatchObject({
      configured: false,
      terms: [],
      autoSync: false,
      total: 2,
      nextSyncAt: null,
    });
    await expect(f.source.sync('1')).rejects.toMatchObject({
      code: 'invalid_input',
    });
    expect(await f.source.analysisData('1')).toEqual([]);
  });

  it('registers the actions for signed-in project members only', async () => {
    const f = await youtubeFixture();
    const actions: Record<
      string,
      (ctx: unknown, next: () => Promise<void>) => Promise<void>
    > = {};
    Object.assign(f.host.app, {
      resourceManager: {
        define: ({ actions: registered }: { actions: typeof actions }) =>
          Object.assign(actions, registered),
      },
      acl: { allow: vi.fn() },
    });
    f.source.register(vi.fn());
    expect(Object.keys(actions).sort()).toEqual([
      'cancel',
      'clear',
      'connect',
      'disconnect',
      'report',
      'status',
      'sync',
    ]);
    await expect(
      actions.status(
        {
          state: { currentRoles: ['root'] },
          action: { params: { values: { projectId: '1' } } },
          db: f.db,
          set: vi.fn(),
          throw: (status: number, message: string) => {
            throw Object.assign(new Error(message), { status });
          },
        },
        async () => {},
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});
