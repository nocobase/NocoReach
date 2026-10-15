// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, test, vi, onTestFinished } from 'vitest';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database';
import { AnalysisRules } from '../../server/nocoreach/analysis-rules';
import {
  evaluateCustomRules,
  newCustomRule,
} from '../../server/nocoreach/custom-analysis-rules';
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('../../server/nocoreach/execution/provider', () => ({
  OnlineProvider: class {
    complete = complete;
  },
}));
async function setup() {
  const db = await createTestDatabase({
    migrations: [
      {
        packageName: 'nocoreach',
        directory: fileURLToPath(
          new URL('../../database/main/migrations', import.meta.url),
        ),
      },
    ],
  });
  onTestFinished(() => db.destroy());
  const legacy = new LegacyDatabase(
    db.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  return { rules: new AnalysisRules({ db: legacy }), db: legacy };
}
const input = {
  name: 'Useful conversations',
  source: 'gsc',
  condition: 'Find documented customer demand',
  evidence: 'Cite saved evidence; otherwise insufficient',
};
test('legacy migration preserves settings; copy is independent and inactive; snapshots remain immutable', async () => {
  const { rules, db } = await setup();
  await db.getRepository('nrSnapshots').create({
    values: {
      key: 'analysis-rules:1',
      payload: {
        focus: 'Enterprise',
        watchDays: 21,
        rules: { 'site-thin': { enabled: false } },
      },
    },
  });
  const original = await rules.snapshot('1');
  const copied = await rules.create('1', {
    name: 'Copy',
    copyFrom: 'default',
    storeRevision: 0,
  });
  expect(copied.activeSchemeId).toBe('default');
  expect(copied.focus).toBe('Enterprise');
  expect(copied.watchDays).toBe(21);
  expect(copied.revision).not.toBe(original.revision);
  await rules.save('1', {
    schemeId: copied.schemeId,
    expectedRevision: copied.revision,
    focus: 'Community',
  });
  expect((await rules.config('1')).focus).toBe('Enterprise');
  const current = await rules.view('1', copied.schemeId);
  await rules.activate('1', {
    schemeId: copied.schemeId,
    storeRevision: current.storeRevision,
  });
  expect((await rules.config('1')).focus).toBe('Community');
  expect(original.config.focus).toBe('Enterprise');
  expect((await rules.view('2')).schemes).toHaveLength(1);
  await expect(rules.view('2', copied.schemeId)).rejects.toMatchObject({
    status: 404,
  });
});
test('concurrent creates and activations use store revisions and never exceed five schemes', async () => {
  const { rules } = await setup();
  for (let i = 1; i < 4; i++) {
    const view = await rules.view('1');
    await rules.create('1', {
      name: `Scheme ${i}`,
      storeRevision: view.storeRevision,
    });
  }
  const view = await rules.view('1');
  const results = await Promise.allSettled(
    ['Last A', 'Last B'].map((name) =>
      rules.create('1', { name, storeRevision: view.storeRevision }),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const full = await rules.view('1');
  expect(full.schemes).toHaveLength(5);
  await expect(
    rules.create('1', { name: 'Too many', storeRevision: full.storeRevision }),
  ).rejects.toMatchObject({ status: 400 });
  const switches = await Promise.allSettled(
    full.schemes.slice(1, 3).map((s) =>
      rules.activate('1', {
        schemeId: s.id,
        storeRevision: full.storeRevision,
      }),
    ),
  );
  expect(switches.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    full.schemes.some(
      (s) =>
        s.id ===
        (
          switches.find(
            (r) => r.status === 'fulfilled',
          ) as PromiseFulfilledResult<any>
        ).value.activeSchemeId,
    ),
  ).toBe(true);
});
test('real provider drafts never save; validated confirmation targets only selected scheme and rejects stale or invalid drafts', async () => {
  const { rules } = await setup();
  const copy = await rules.create('1', { name: 'Plan B', storeRevision: 0 });
  complete.mockResolvedValue('```json\n' + JSON.stringify(input) + '\n```');
  const drafted = await rules.draft(
    '1',
    { schemeId: copy.schemeId, instruction: 'Help organize demand rule' },
    'en-US',
  );
  expect(complete.mock.calls.at(-1)?.[2]).toBe('analysis-rule-draft');
  expect((await rules.snapshot('1', copy.schemeId)).customRules).toHaveLength(
    0,
  );
  const added = await rules.addRule('1', {
    schemeId: copy.schemeId,
    expectedRevision: drafted.revision,
    rule: drafted.draft,
  });
  expect(added.rules.find((r) => r.id === added.addedRuleId).custom).toBe(true);
  expect((await rules.snapshot('1')).customRules).toHaveLength(0);
  await expect(
    rules.addRule('1', {
      schemeId: copy.schemeId,
      expectedRevision: drafted.revision,
      rule: input,
    }),
  ).rejects.toMatchObject({ status: 409 });
  complete.mockResolvedValue(
    JSON.stringify({ ...input, source: 'unknown-channel' }),
  );
  await expect(
    rules.draft('1', { instruction: 'new rule' }, 'en-US'),
  ).rejects.toMatchObject({ status: 502 });
});
test('custom execution requires citations from the selected source, distinguishes missing data and model errors', async () => {
  const rule = newCustomRule(input),
    sample = {
      id: 'one',
      source: 'gsc',
      title: 'Customer question',
      facts: ['A saved fact'],
    };
  const model = vi.fn().mockResolvedValue(
    JSON.stringify({
      results: [
        {
          ruleId: rule.id,
          status: 'matched',
          reason: 'Matching evidence',
          evidenceIds: ['one'],
        },
      ],
    }),
  );
  const matched = await evaluateCustomRules([rule], [sample], model);
  expect(matched.signals).toHaveLength(1);
  expect(matched.runs[0].status).toBe('matched');
  const missing = await evaluateCustomRules([rule], [], model);
  expect(missing.runs[0].status).toBe('insufficient');
  expect(model).toHaveBeenCalledTimes(1);
  model.mockResolvedValue(
    JSON.stringify({
      results: [
        {
          ruleId: rule.id,
          status: 'matched',
          reason: 'Invented evidence',
          evidenceIds: ['other'],
        },
      ],
    }),
  );
  const invalid = await evaluateCustomRules([rule], [sample], model);
  expect(invalid.signals).toHaveLength(0);
  expect(invalid.runs[0].status).toBe('error');
  model.mockRejectedValue(new Error('provider offline'));
  expect(
    (await evaluateCustomRules([rule], [sample], model)).runs[0].status,
  ).toBe('error');
});

test('custom rules inspect saved facts independently of builtin thresholds', async () => {
  const { savedRuleEvidence } =
    await import('../../server/nocoreach/custom-analysis-rules');
  const evidence = savedRuleEvidence({
    end: '2026-10-15',
    queries: [{ page: 'https://example.org', impressions: 400, clicks: 4 }],
    searchHistory: [],
  });
  expect(
    evidence.some(
      (e) => e.source === 'gsc' && e.facts.join('').includes('400'),
    ),
  ).toBe(true);
  const rule = newCustomRule({
    ...input,
    condition: 'impressions >=300 and CTR<2%',
  });
  const model = vi.fn().mockResolvedValue(
    JSON.stringify({
      results: [
        {
          ruleId: rule.id,
          status: 'matched',
          reason: '400 impressions, 1% CTR',
          evidenceIds: [evidence[0].id],
        },
      ],
    }),
  );
  expect(
    (await evaluateCustomRules([rule], evidence, model)).signals,
  ).toHaveLength(1);
});

test('content readiness does not turn missing or stale metrics into no match', async () => {
  const { contentRuleReady, contentRuleCatalog } =
    await import('../../server/nocoreach/content-rules');
  const { resolver } = await import('../../server/nocoreach/analysis-rules');
  const now = Date.now(),
    rule = contentRuleCatalog().find((r) => r.id === 'youtube-views')!;
  const sample = {
    id: '1',
    title: 'Video',
    url: 'https://example.org',
    firstSeenAt: new Date(now).toISOString(),
    collectedAt: new Date(now).toISOString(),
    metrics: {},
  };
  const input = [{ source: 'youtube', items: [sample] }];
  expect(contentRuleReady(rule, input, resolver({}), now)).toBe(false);
  Object.assign(sample.metrics, {
    views: { value: 5, at: new Date(now - 20 * 86400000).toISOString() },
  });
  expect(contentRuleReady(rule, input, resolver({}), now)).toBe(false);
  Object.assign(sample.metrics, {
    views: { value: 5, at: new Date(now).toISOString() },
  });
  expect(contentRuleReady(rule, input, resolver({}), now)).toBe(true);
});

test('large saved fields preserve bounded evidence and strip connector secrets', async () => {
  const { savedRuleEvidence } =
    await import('../../server/nocoreach/custom-analysis-rules');
  const items = Array.from({ length: 30 }, (_, i) => ({
    title: 'Post ' + i,
    text: 'x'.repeat(1200),
    apiKey: 'SECRET',
  }));
  const evidence = savedRuleEvidence({ site: { pages: items } });
  expect(evidence.length).toBeGreaterThan(0);
  expect(evidence[0].facts.join('')).toContain('Post 0');
  expect(evidence[0].facts.join('')).not.toContain('SECRET');
  expect(JSON.stringify(evidence).length).toBeLessThan(6500);
});

test('rename persists names without changing rules or activation and rejects invalid or stale writes', async () => {
  const { rules } = await setup();
  const copied = await rules.create('1', {
    name: 'Copy',
    copyFrom: 'default',
    storeRevision: 0,
  });
  const result = await rules.rename('1', {
    schemeId: copied.schemeId,
    name: '  Marketing  ',
    storeRevision: copied.storeRevision,
    selectedSchemeId: 'default',
  });
  expect(result.schemeId).toBe('default');
  expect(result.activeSchemeId).toBe('default');
  const saved = await rules.view('1', copied.schemeId);
  expect(saved.schemeName).toBe('Marketing');
  expect(saved.rules).toEqual(copied.rules);
  expect(saved.revision).toBe(copied.revision);
  await expect(
    rules.rename('1', {
      schemeId: copied.schemeId,
      name: 'Stale',
      storeRevision: copied.storeRevision,
    }),
  ).rejects.toMatchObject({ status: 409 });
  for (const name of ['', ' '.repeat(3), 'x'.repeat(41), result.schemeName]) {
    await expect(
      rules.rename('1', {
        schemeId: copied.schemeId,
        name,
        storeRevision: saved.storeRevision,
      }),
    ).rejects.toThrow();
  }
  await expect(
    rules.rename('2', {
      schemeId: copied.schemeId,
      name: 'Other project',
      storeRevision: 0,
    }),
  ).rejects.toMatchObject({ status: 404 });
});
