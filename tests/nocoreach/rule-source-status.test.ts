import { describe, expect, it } from 'vitest';
import { sourceStatuses } from '../../server/nocoreach/rule-source-status.js';

const snapshot = {
  catalog: [
    { id: 'bilibili-new', source: 'bilibili', params: [] },
    { id: 'xiaohongshu-new', source: 'xiaohongshu', params: [] },
  ],
  config: { rules: {} },
};

function host(lastRun: { ok: boolean; errorCode?: string } | null) {
  const at = new Date().toISOString();
  const bilibili = {
    connected: true,
    revision: 'r1',
    lastRun: lastRun && { at, ...lastRun },
    videos: {
      BV1: {
        id: 'BV1',
        bvid: 'BV1',
        title: 'A video',
        url: 'https://www.bilibili.com/video/BV1',
        firstSeenAt: at,
        collectedAt: at,
        configRevision: 'r1',
        views: 10,
        likes: 1,
        comments: 0,
      },
    },
  };
  const xiaohongshu = {
    connected: true,
    configured: true,
    lastRun: lastRun && { at, ...lastRun },
    notes: [],
  };
  return {
    bilibili: { state: () => Promise.resolve(bilibili) },
    xiaohongshu: { state: () => Promise.resolve(xiaohongshu) },
  } as unknown as Parameters<typeof sourceStatuses>[0];
}

describe('analysis rule source status', () => {
  it('reports a failed collector read as an error', async () => {
    const out = await sourceStatuses(
      host({ ok: false, errorCode: 'timeout' }),
      '1',
      snapshot,
    );
    expect(out.bilibili.state).toBe('error');
    expect(out.xiaohongshu.state).toBe('error');
  });

  it('does not count a read the busy collector turned away as an error', async () => {
    const out = await sourceStatuses(
      host({ ok: false, errorCode: 'busy' }),
      '1',
      snapshot,
    );
    expect(out.bilibili).toMatchObject({ state: 'ready', sampleCount: 1 });
    expect(out.xiaohongshu.state).toBe('waiting');
  });
});
