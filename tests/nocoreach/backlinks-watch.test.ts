// The monthly backlinks check and what the daily analysis reads from it: the check runs only while switched on, with
// DataForSEO verified, for a view with no saved lookup; the signals come from saved lookups only; and the analysis
// rules page shows the source as disconnected, waiting or ready.
import { describe, expect, it, vi } from 'vitest';
import { BacklinksService } from '../../server/nocoreach/backlinks-service.js';
import {
  backlinksSignals,
  computeAll,
} from '../../server/nocoreach/signals.js';
import { sourceStatuses } from '../../server/nocoreach/rule-source-status.js';
import { RULES } from '../../server/nocoreach/analysis-rules.js';

const month = (date: string, over: Partial<Record<string, number>> = {}) => ({
  date,
  backlinks: 1000,
  referringDomains: 100,
  rank: 40,
  newBacklinks: 50,
  lostBacklinks: 40,
  newReferringDomains: 8,
  lostReferringDomains: 6,
  ...over,
});
const data = (history: unknown[], broken: unknown[] = []) => ({
  target: 'acme.example',
  enabled: true,
  overview: { completedAt: '2026-11-01T00:00:00Z', result: { history } },
  broken: { completedAt: '2026-11-01T00:00:00Z', result: { items: broken } },
});
const page = (path: string, backlinks: number) => ({
  url: `https://acme.example${path}`,
  status: 404,
  backlinks,
  referringDomains: 3,
});

describe('backlinks signals', () => {
  it('say nothing while the site gains, and flag a net loss of referring domains or a clear drop', () => {
    expect(
      backlinksSignals({
        bl: data([month('2026-09-30'), month('2026-10-31')]),
      }),
    ).toEqual([]);
    const lost = computeAll({
      bl: data([
        month('2026-09-30'),
        month('2026-10-31', {
          newReferringDomains: 2,
          lostReferringDomains: 20,
        }),
      ]),
    }).ranked;
    expect(lost.map((s: { key: string }) => s.key)).toEqual(['backlinks-lost']);
    expect(lost[0]).toMatchObject({
      type: 'change',
      source: 'backlinks',
      url: 'https://acme.example',
    });
    const dropped = backlinksSignals({
      bl: data([
        month('2026-09-30', { backlinks: 1000 }),
        month('2026-10-31', { backlinks: 600 }),
      ]),
    });
    expect(dropped.map((s: { key: string }) => s.key)).toEqual([
      'backlinks-lost',
    ]);
  });

  it('flag the five most linked broken pages above the threshold, each a fix to hand off', () => {
    const signals = backlinksSignals({
      bl: data(
        [],
        [
          page('/a', 90),
          page('/b', 50),
          page('/c', 40),
          page('/d', 30),
          page('/e', 20),
          page('/f', 10),
          page('/few', 2),
        ],
      ),
    });
    expect(signals.map((s: { key: string }) => s.key)).toEqual([
      'backlinks-broken:/a',
      'backlinks-broken:/b',
      'backlinks-broken:/c',
      'backlinks-broken:/d',
      'backlinks-broken:/e',
    ]);
    expect(signals[0]).toMatchObject({
      type: 'page',
      url: 'https://acme.example/a',
      actionable: true,
      action: 'technical',
    });
    // Switched off in the rules, they are not passed on.
    const off = computeAll(
      { bl: data([], [page('/a', 90)]) },
      { rules: { 'backlinks-broken': { enabled: false } } },
    ).ranked;
    expect(off).toEqual([]);
  });

  it('are two rules on the backlinks source', () => {
    expect(
      RULES.filter((r: { source: string }) => r.source === 'backlinks').map(
        (r: { id: string }) => r.id,
      ),
    ).toEqual(['backlinks-lost', 'backlinks-broken']);
  });
});

function service(
  options: { watch?: unknown; verified?: boolean; saved?: string[] } = {},
) {
  const rows = new Map<string, Record<string, unknown>>();
  if (options.watch)
    rows.set('backlinks-watch:1', {
      id: 1,
      key: 'backlinks-watch:1',
      payload: options.watch,
    });
  const wrap = (r?: Record<string, unknown>) =>
    r && { ...r, get: (k: string) => r[k] };
  const snapshots = {
    findOne: async (o: { filter: { key: string } }) =>
      wrap(rows.get(o.filter.key)),
    update: async (o: { values: { payload: unknown } }) => {
      rows.get('backlinks-watch:1')!.payload = o.values.payload;
    },
    create: async (o: { values: { key: string; payload: unknown } }) => {
      rows.set(o.values.key, { id: 2, ...o.values });
    },
  };
  const s = new BacklinksService({
    env: () => null,
    db: { getRepository: () => snapshots },
    project: async () => ({ domains: ['https://www.acme.example'] }),
    projectIds: async () => ['1', '2'],
    competitors: { state: async () => null },
    app: { logger: { warn: vi.fn() } },
  });
  s.d4s.config = () =>
    options.verified === false ? null : { verifiedAt: '2026-10-01' };
  s.saved = vi.fn(async (_id: string, v: { view: string }) =>
    (options.saved ?? []).includes(v.view) ? { id: 9 } : null,
  );
  s.run = vi.fn(async () => ({ id: 10, status: 'completed' }));
  return { s, rows };
}

describe('monthly check', () => {
  it('runs nothing while off or without a verified connection', async () => {
    for (const options of [{}, { watch: { enabled: true }, verified: false }]) {
      const { s } = service(options);
      expect(await s.check('1')).toEqual({ checked: 0 });
      expect(s.run).not.toHaveBeenCalled();
    }
  });

  it('looks up only the views without a saved lookup, for our own bare domain', async () => {
    const { s } = service({ watch: { enabled: true }, saved: ['overview'] });
    expect(await s.check('1')).toEqual({ checked: 1 });
    expect(s.run).toHaveBeenCalledTimes(1);
    expect((s.run as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({
      view: 'broken',
      target: 'acme.example',
      requestKey: expect.stringMatching(/^[a-f0-9]{32}$/),
    });
  });

  it('is switched on and off per project, with its monthly cost', async () => {
    const { s, rows } = service();
    expect(await s.watch('1')).toMatchObject({
      enabled: false,
      target: 'acme.example',
      verified: true,
    });
    const on = await s.setWatch('1', { enabled: true });
    expect(on).toMatchObject({ enabled: true, since: expect.any(String) });
    expect(on.monthlyUsd).toBeGreaterThan(0.04);
    expect(rows.get('backlinks-watch:1')).toBeTruthy();
    expect((await s.setWatch('1', { enabled: false })).enabled).toBe(false);
  });

  it('keeps going through the other projects when one check fails', async () => {
    const { s, rows } = service({ watch: { enabled: true } });
    rows.set('backlinks-watch:2', {
      id: 3,
      key: 'backlinks-watch:2',
      payload: { enabled: true },
    });
    (s.run as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('budget'),
    );
    await s.tick();
    // Project 1 stops at its failed overview; project 2 still looks up both views.
    expect(
      (s.run as ReturnType<typeof vi.fn>).mock.calls.map(([id]) => id),
    ).toEqual(['1', '2', '2']);
  });
});

describe('backlinks source status', () => {
  const snapshot = { catalog: RULES, config: { rules: {} } };
  const host = (bl: unknown) =>
    ({ backlinks: { analysisData: async () => bl } }) as never;
  it('is disconnected while off, waiting once on, ready with a saved lookup', async () => {
    expect(
      (
        await sourceStatuses(
          host({ enabled: false, overview: null }),
          '1',
          snapshot,
        )
      ).backlinks,
    ).toEqual({ state: 'disconnected' });
    expect(
      (
        await sourceStatuses(
          host({ enabled: true, overview: null }),
          '1',
          snapshot,
        )
      ).backlinks,
    ).toEqual({ state: 'waiting' });
    expect(
      (
        await sourceStatuses(
          host({
            enabled: false,
            overview: { createdAt: '2026-11-01T00:00:00Z' },
          }),
          '1',
          snapshot,
        )
      ).backlinks,
    ).toEqual({ state: 'ready', collectedAt: '2026-11-01T00:00:00Z' });
  });
});
