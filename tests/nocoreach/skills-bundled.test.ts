// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { Skills, parseSkillMd } from '../../server/nocoreach/skills.js';
import {
  BUILT_IN_SKILLS,
  BUILT_IN_VERSION,
} from '../../server/nocoreach/skills-builtin.js';
import bundled from '../../server/nocoreach/skills-bundled.json' with { type: 'json' };
import { SYSTEM_PLAYBOOKS } from '../../shared/playbook-catalog';

// A stand-in for the nrSnapshots repository (synthetic data only).
function harness(seed: Record<string, unknown> = {}) {
  const rows = Object.entries(seed).map(([key, payload], i) => ({
    id: i + 1,
    key,
    payload: structuredClone(payload),
  }));
  let seq = rows.length + 1;
  const find = (key: string) => rows.find((r) => r.key === key);
  const repo = {
    findOne: async ({ filter }: any) => {
      const r = find(filter.key);
      return r
        ? { id: r.id, get: (k: 'payload') => structuredClone(r[k]) }
        : null;
    },
    create: async ({ values }: any) => {
      rows.push({ id: seq++, ...structuredClone(values) });
    },
    update: async ({ filterByTk, values }: any) => {
      Object.assign(
        rows.find((r) => r.id === filterByTk)!,
        structuredClone(values),
      );
    },
    destroy: async ({ filter }: any) => {
      const i = rows.findIndex((r) => r.key === filter.key);
      if (i >= 0) rows.splice(i, 1);
    },
  };
  const on = vi.fn();
  const s = new Skills({
    app: {
      on,
      logger: { warn: vi.fn() },
      resourceManager: { define: vi.fn() },
      acl: { allow: vi.fn() },
    },
    db: {
      getRepository: () => repo,
      sequelize: { transaction: (fn: any) => fn({}), query: async () => {} },
    },
  });
  return { s, rows, on, payload: (key: string) => find(key)?.payload as any };
}
const marketing = BUILT_IN_SKILLS.filter((b: any) => b.since === 2);
const own = BUILT_IN_SKILLS.filter((b: any) => b.since === 1);

it('bundles the chosen marketing Skills at one pinned commit, within the library limits and with their license', () => {
  expect(bundled.commit).toMatch(/^[0-9a-f]{40}$/);
  expect(marketing.map((b: any) => b.name)).toEqual(
    bundled.skills.map((s) => s.name),
  );
  expect(marketing).toHaveLength(15);
  for (const b of marketing as any[]) {
    expect(b.id).toBe(b.name);
    expect(b.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(b.description.length).toBeGreaterThan(0);
    expect(b.description.length).toBeLessThanOrEqual(1024);
    expect(b.body.length).toBeLessThanOrEqual(50000);
    expect(b.files.length).toBeLessThanOrEqual(20);
    expect(b.files.some((f: any) => f.path.startsWith('evals/'))).toBe(false);
    const license = b.files.find((f: any) => f.path === 'LICENSE.md');
    expect(license.text).toContain('MIT License');
    expect(license.text).toContain(`commit ${bundled.commit}`);
    expect(b.source).toBe(
      `https://github.com/coreyhaines31/marketingskills/tree/${bundled.commit}/skills/${b.name}`,
    );
    // The body is the upstream SKILL.md without its frontmatter.
    expect(parseSkillMd(b.body).name).toBe('');
  }
});

it('starts a fresh library with every built-in at the current version', async () => {
  const { s, payload } = harness();
  const list = await s.list('1');
  expect(list.skills).toHaveLength(BUILT_IN_SKILLS.length);
  expect(list.skills.every((x: any) => x.builtIn && !x.enabled)).toBe(true);
  expect(list.skills.find((x: any) => x.name === 'seo-audit')).toMatchObject({
    source: expect.stringContaining('/skills/seo-audit'),
  });
  expect(payload('nr-skills')).toMatchObject({
    revision: 1,
    builtIns: BUILT_IN_VERSION,
  });
});

it('adds the newer built-ins to an existing library once, never over a Skill of the same name or a deleted one', async () => {
  // A library from before the marketing Skills: one own built-in was deleted, and seo-audit was imported by hand.
  const at = '2026-10-01T00:00:00.000Z';
  const { s, rows, payload } = harness({
    'nr-skills': {
      revision: 7,
      skills: [
        {
          id: 'docs-page-writing',
          name: 'docs-page-writing',
          description: 'x',
          builtIn: true,
          createdAt: at,
          updatedAt: at,
          files: [],
          chars: 1,
        },
        {
          id: 'sk-imported',
          name: 'seo-audit',
          description: 'mine',
          source: 'https://github.com/x',
          createdAt: at,
          updatedAt: at,
          files: [],
          chars: 1,
        },
      ],
    },
    'nr-skill:docs-page-writing': { body: 'b', files: [] },
    'nr-skill:sk-imported': { body: 'mine', files: [] },
  });
  const names = (await s.list('1')).skills.map((x: any) => x.name);
  expect(names).toHaveLength(2 + marketing.length - 1);
  // The own built-ins deleted before (research-report, seo-title-description) do not come back.
  expect(names).not.toContain('research-report');
  expect(names).not.toContain('seo-title-description');
  expect(names.filter((n: string) => n === 'seo-audit')).toHaveLength(1);
  expect(payload('nr-skill:sk-imported').body).toBe('mine');
  expect(rows.some((r) => r.key === 'nr-skill:seo-audit')).toBe(false);
  expect(payload('nr-skills')).toMatchObject({
    revision: 8,
    builtIns: BUILT_IN_VERSION,
  });
  // Later writes keep the version, so a deleted marketing Skill is not added again.
  await s.remove({ skillId: 'ai-seo' });
  await s.setEnabled('1', { skillId: 'schema', enabled: true });
  await s.update({ skillId: 'schema', description: 'edited' });
  expect(payload('nr-skills').builtIns).toBe(BUILT_IN_VERSION);
  expect((await s.list('1')).skills.map((x: any) => x.name)).not.toContain(
    'ai-seo',
  );
  expect(own.map((b: any) => b.name)).toContain('research-report');
});

it('upgrades an existing library when the application starts, and leaves a fresh one empty', async () => {
  const fresh = harness();
  await fresh.s.upgrade();
  expect(fresh.rows).toEqual([]);

  const old = harness({
    'nr-skills': { revision: 1, skills: [] },
  });
  old.s.register();
  const [event, start] = old.on.mock.calls[0];
  expect(event).toBe('afterStart');
  await start();
  await vi.waitFor(() =>
    expect(old.payload('nr-skills').builtIns).toBe(BUILT_IN_VERSION),
  );
  expect(old.payload('nr-skills').builtIns).toBe(BUILT_IN_VERSION);
  expect(old.payload('nr-skills').skills).toHaveLength(marketing.length);
});

it('lets a step name a built-in that was imported under the same name, once', async () => {
  const at = '2026-10-01T00:00:00.000Z';
  const { s } = harness({
    'nr-skills': {
      revision: 3,
      builtIns: BUILT_IN_VERSION,
      skills: [
        {
          id: 'sk-imported',
          name: 'seo-audit',
          description: 'mine',
          createdAt: at,
          updatedAt: at,
          files: [],
          chars: 4,
        },
      ],
    },
    'nr-skill:sk-imported': { body: 'mine', files: [] },
    'nr-skills-enabled:1': { ids: ['sk-imported'] },
  });
  const out = await s.forAgent('1', ['seo-audit', 'gone']);
  expect(out).toEqual([
    {
      name: 'seo-audit',
      description: 'mine',
      required: true,
      body: 'mine',
      files: [],
    },
  ]);
});

it('names only built-in Skills in the built-in playbook steps, at most five each', () => {
  const ids = new Set(BUILT_IN_SKILLS.map((b: any) => b.id));
  const used = new Set<string>();
  for (const p of SYSTEM_PLAYBOOKS)
    for (const step of p.steps) {
      expect((step.skills ?? []).length).toBeLessThanOrEqual(5);
      for (const id of step.skills ?? []) {
        expect(ids.has(id)).toBe(true);
        used.add(id);
      }
    }
  // Every bundled marketing Skill is used by at least one built-in playbook.
  for (const b of marketing as any[]) expect(used.has(b.id)).toBe(true);
  const step = (id: string) =>
    SYSTEM_PLAYBOOKS.find((p) => p.id === id)!.steps.find(
      (s) => s.kind !== 'review',
    )!;
  expect(step('tech-fix').skills).toEqual([
    'seo-audit',
    'schema',
    'site-architecture',
  ]);
  expect(step('release-notes').skills).toEqual(['launch']);
});

it('marks product Skills that keep their original description with a short summary key, and nothing else', async () => {
  const at = '2026-10-01T00:00:00.000Z';
  const row = (id: string, name: string, description: string) => ({
    id,
    name,
    description,
    createdAt: at,
    updatedAt: at,
    files: [],
    chars: 1,
  });
  const original = (name: string) =>
    bundled.skills.find((s) => s.name === name)!.description;
  const community = original('community-marketing');
  const { s } = harness({
    'nr-skills': {
      revision: 2,
      builtIns: BUILT_IN_VERSION,
      skills: [
        // A copy imported under a built-in name, with the upstream text.
        row('sk-1', 'seo-audit', original('seo-audit')),
        // The first bundle kept escaped quotes in this one description.
        row(
          'community-marketing',
          'community-marketing',
          community.replace(/"/g, '\\"'),
        ),
        // Edited, so it shows as written.
        row('sk-2', 'cro', 'Our own conversion checklist'),
        // NocoReach's own built-in, stored in Chinese when the library was made.
        row(
          'research-report',
          'research-report',
          own.find((b: any) => b.name === 'research-report')!.description,
        ),
        row('sk-3', 'my-skill', 'Mine'),
      ],
    },
    'nr-skill:sk-1': { body: 'audit body', files: [] },
  });
  const keys = Object.fromEntries(
    (await s.list('1')).skills.map((x: any) => [x.name, x.summaryKey]),
  );
  expect(keys).toEqual({
    'seo-audit': 'skillSummaries.seoAudit',
    'community-marketing': 'skillSummaries.communityMarketing',
    cro: undefined,
    'research-report': 'skillsBuiltin.useWhenWritingResearchReports',
    'my-skill': undefined,
  });
  expect((await s.get('1', { skillId: 'sk-1' })).skill.summaryKey).toBe(
    'skillSummaries.seoAudit',
  );
  // The Agent always gets the stored description.
  expect(await s.forAgent('1', ['seo-audit'])).toEqual([
    expect.objectContaining({ description: original('seo-audit') }),
  ]);
  // The regenerated bundle keeps no escaped quotes.
  expect(bundled.skills.some((x) => x.description.includes('\\"'))).toBe(false);
  expect(community).toContain('"build a community,"');
});
