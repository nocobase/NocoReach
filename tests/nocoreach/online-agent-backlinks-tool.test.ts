// The online agent's backlinks tool: it reads saved lookups for free, runs a lookup only with lookUp and the user's
// run permission, fills the gap's competitors from Competitors, and refuses without the page's read permission.
import { describe, expect, it, vi } from 'vitest';
import { backlinksTool } from '../../server/nocoreach/online-agent/backlinks-tool.js';

const sites = {
  own: ['acme.example'],
  competitors: [
    { name: 'A', domain: 'a.example' },
    { name: 'B', domain: 'b.example' },
  ],
};
const run = (view: string, extra = {}) => ({
  id: 7,
  status: 'completed',
  createdAt: '2026-11-01T00:00:00Z',
  completedAt: '2026-11-01T00:00:00Z',
  costUsd: 0.03,
  spec: { kind: 'backlinks', view, target: 'acme.example', ...extra },
  result: {
    items: Array.from({ length: 60 }, (_, i) => ({
      id: String(i),
      domain: `s${i}.example`,
    })),
    summary: null,
    totalCount: 600,
  },
});
function tool(
  allowed: (r: string, a: string) => boolean,
  source: Record<string, unknown> = {},
) {
  const s = {
    sites: vi.fn(async () => sites),
    saved: vi.fn(async () => null),
    run: vi.fn(async (_id: string, v: { view: string }) => run(v.view)),
    ...source,
  };
  const t = backlinksTool(
    s as never,
    '1',
    async () => undefined,
    async (r, a) => allowed(r, a),
    (path) => `/app${path}`,
  );
  return { t, s };
}

describe('backlinks tool', () => {
  it('reads nothing new without lookUp and says what a lookup would cost', async () => {
    const { t, s } = tool(() => true);
    const out = (await t.execute({ view: 'links' })) as Record<string, unknown>;
    expect(out).toMatchObject({ saved: false, target: 'acme.example' });
    expect(out.estimatedUsd).toBeGreaterThan(0);
    expect(s.run).not.toHaveBeenCalled();
  });

  it('returns a saved lookup in pages of 50 rows with a link that opens its tab beside the saved overview', async () => {
    const saved = vi.fn(async (_id: string, v: { view: string }) =>
      v.view === 'overview' ? { ...run('overview'), id: 3 } : run('domains'),
    );
    const { t } = tool(() => true, { saved });
    const out = (await t.execute({ view: 'domains' })) as Record<
      string,
      unknown
    >;
    expect(out.rows).toHaveLength(50);
    expect(out.nextOffset).toBe(50);
    expect(out.url).toBe('/app/backlinks?t=acme.example&r=7&bt=domains&o=3');
    const overview = (await t.execute({ view: 'overview' })) as Record<
      string,
      unknown
    >;
    expect(overview.url).toBe('/app/backlinks?t=acme.example&o=3');
  });

  it('runs a gap lookup against the listed competitors only with lookUp and the run permission', async () => {
    const denied = tool((_r, a) => a !== 'run');
    expect(await denied.t.execute({ view: 'gap', lookUp: true })).toEqual({
      accessDenied: true,
    });
    expect(denied.s.run).not.toHaveBeenCalled();
    const { t, s } = tool(() => true);
    const out = (await t.execute({ view: 'gap', lookUp: true })) as Record<
      string,
      unknown
    >;
    expect(s.run).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({
        view: 'gap',
        target: 'acme.example',
        competitors: ['a.example', 'b.example'],
      }),
    );
    expect(String(out.url)).toContain('view=gap');
  });

  it('refuses without the read permission', async () => {
    const { t, s } = tool(() => false);
    expect(await t.execute({})).toEqual({ accessDenied: true });
    expect(s.sites).not.toHaveBeenCalled();
  });
});
