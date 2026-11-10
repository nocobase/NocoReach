// The online agent's backlinks tool: it reads saved lookups for free and never runs one; without a saved lookup it
// proposes one (with its cost and this month's spending) for the user to confirm on a card, fills the gap's
// competitors from Competitors, and refuses without the page's read permission.
import { describe, expect, it, vi } from 'vitest';
import { backlinksTool } from '../../server/nocoreach/online-agent/backlinks-tool.js';
import { isBacklinksLookupProposal } from '../../shared/backlinks.js';

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
    spend: vi.fn(async () => ({ monthUsd: 1.2, budgetUsd: 5 })),
    run: vi.fn(),
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
  it('proposes a lookup with its cost and the month spending instead of running one', async () => {
    const { t, s } = tool(() => true);
    const out = (await t.execute({ view: 'links' })) as Record<string, unknown>;
    expect(out.saved).toBe(false);
    expect(isBacklinksLookupProposal(out)).toBe(true);
    expect(out.proposal).toMatchObject({
      projectId: '1',
      view: 'links',
      target: 'acme.example',
      competitors: null,
      monthUsd: 1.2,
      budgetUsd: 5,
      withinBudget: true,
    });
    expect(
      (out.proposal as { estimatedUsd: number }).estimatedUsd,
    ).toBeGreaterThan(0);
    expect(s.run).not.toHaveBeenCalled();
    // Asking for a lookup does not make it run: the input has no such switch.
    await expect(t.execute({ view: 'links', lookUp: true })).rejects.toThrow();
    expect(s.run).not.toHaveBeenCalled();
  });

  it('proposes a gap against the listed competitors and says when the budget is short', async () => {
    const { t } = tool(() => true, {
      spend: vi.fn(async () => ({ monthUsd: 4.99, budgetUsd: 5 })),
    });
    const out = (await t.execute({ view: 'gap' })) as {
      proposal: Record<string, unknown>;
    };
    expect(out.proposal).toMatchObject({
      view: 'gap',
      competitors: ['a.example', 'b.example'],
      withinBudget: false,
    });
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
    expect(out.proposal).toBeUndefined();
    expect(out.url).toBe('/app/backlinks?t=acme.example&r=7&bt=domains&o=3');
    const overview = (await t.execute({ view: 'overview' })) as Record<
      string,
      unknown
    >;
    expect(overview.url).toBe('/app/backlinks?t=acme.example&o=3');
  });

  it('refuses without the read permission', async () => {
    const { t, s } = tool(() => false);
    expect(await t.execute({})).toEqual({ accessDenied: true });
    expect(s.sites).not.toHaveBeenCalled();
  });
});
