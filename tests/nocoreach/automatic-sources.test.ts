// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { describe, it, expect, vi, onTestFinished } from 'vitest';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database';
import { AutomaticSources } from '../../server/nocoreach/automatic-sources';
import { adaptContent } from '../../server/nocoreach/automatic-content';
import { AnalysisRules } from '../../server/nocoreach/analysis-rules';
import { SignalEngine, computeAll } from '../../server/nocoreach/signals';
import { requireAccess } from '../../server/nocoreach/policy';
const batch = () => ({
  channelId: `channel-${randomUUID().slice(0, 8)}`,
  name: '未适配内容社区',
  collectedAt: new Date(Date.now() - 1000).toISOString(),
  records: [
    {
      article: {
        headline: 'Integration research',
        permalink: 'https://example.org/post/42',
      },
      stats: { total_likes: 340, total_views: 23000 },
    },
  ],
});
async function setup(
  suggest?: (system: string, prompt: string) => Promise<string>,
) {
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
  const host = {
    db: legacy,
    app: { resourceManager: { define: vi.fn() }, acl: { allow: vi.fn() } },
    project: async () => ({}),
  };
  const sources = new AutomaticSources(host as never, suggest);
  const rules = new AnalysisRules({ ...host, automaticSources: sources });
  const signals = new SignalEngine({
    ...host,
    automaticSources: sources,
    analysisRules: rules,
  });
  return { sources, rules, signals, host };
}
describe('automatic channel onboarding', () => {
  it('persists an unfamiliar nested schema and automatically exposes editable rules and daily signals', async () => {
    const { sources, rules, signals } = await setup();
    const raw = batch();
    const first = await sources.ingest('1', raw);
    expect(first.mapping).toEqual({
      title: 'article.headline',
      url: 'article.permalink',
      likes: 'stats.total_likes',
      views: 'stats.total_views',
    });
    const view = await rules.view('1');
    expect(
      view.rules.filter((r) => r.source === first.definition.id),
    ).toHaveLength(3);
    expect(
      view.rules.find((r) => r.source === first.definition.id).sourceName,
    ).toBe(raw.name);
    const current = await signals.current('1');
    expect(
      current.items.filter((s) => s.source === first.definition.id),
    ).toHaveLength(3);
    expect(
      (await rules.view('2')).rules.some(
        (r) => r.source === first.definition.id,
      ),
    ).toBe(false);
    expect((await signals.current('2')).items).toHaveLength(0);
    const disabled = `${first.definition.id}-likes`;
    await rules.save('1', {
      expectedRevision: view.revision,
      rules: { [disabled]: { enabled: false } },
    });
    const again = await sources.ingest('1', {
      ...raw,
      collectedAt: new Date().toISOString(),
    });
    expect(again.input.items[0].firstSeenAt).toBe(
      first.input.items[0].firstSeenAt,
    );
    expect((await signals.current('1')).items).toHaveLength(2);
    await expect(sources.ingest('1', raw)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      sources.ingest('1', {
        ...raw,
        collectedAt: new Date().toISOString(),
        records: [{ nonsense: 42 }],
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect((await sources.state('1'))[0].input.items).toHaveLength(1);
    await sources.disconnect('1', raw.channelId);
    expect((await signals.current('1')).items).toHaveLength(0);
    expect(
      (await rules.view('1')).rules.find((r) => r.id === disabled).enabled,
    ).toBe(false);
  });
  it('uses schema evidence for unfamiliar names and rejects model-invented or incremental metrics', async () => {
    const suggest = vi.fn(async () =>
      JSON.stringify([
        {
          target: 'title',
          path: 'a',
          semantics: 'text',
          evidence: 'Post headline',
        },
        {
          target: 'url',
          path: 'b',
          semantics: 'url',
          evidence: 'Canonical post URL',
        },
        {
          target: 'likes',
          path: 'c',
          semantics: 'cumulative',
          evidence: 'Cumulative public likes',
        },
        {
          target: 'views',
          path: 'd',
          semantics: 'cumulative',
          evidence: 'Daily views',
        },
      ]),
    );
    const { sources } = await setup(suggest);
    const value = await sources.ingest('1', {
      ...batch(),
      fieldDescriptions: {
        a: 'Post headline',
        b: 'Canonical post URL',
        c: 'Cumulative public likes',
        d: 'Daily views',
      },
      records: [
        { a: 'Topic', b: 'https://example.org/topic', c: 200, d: 20000 },
      ],
    });
    expect(value.definition.capabilities.metrics).toEqual(['likes']);
    expect(suggest).toHaveBeenCalledOnce();
    expect(suggest.mock.calls[0][1]).not.toContain('https://example.org/topic');
  });
  it('does not confuse ambiguity, abbreviated counts, future times or old data with valid evidence', () => {
    const raw = batch();
    const adapted = adaptContent({
      ...raw,
      records: [
        { title: 'Topic', url: 'javascript:alert(1)', likes: 900 },
        {
          title: 'Valid',
          url: 'https://example.org/valid',
          likes: '1.2万',
          daily: { views: 50000 },
        },
      ],
    });
    expect(adapted.rejected).toBe(1);
    expect(adapted.definition.capabilities.metrics).toEqual([]);
    const ambiguous = adaptContent({
      ...raw,
      records: [
        {
          title: 'Topic',
          url: 'https://example.org/valid',
          likes: 100,
          total_likes: 200,
        },
      ],
    });
    expect(ambiguous.mapping.likes).toBeUndefined();
    expect(() =>
      adaptContent({ ...raw, collectedAt: '2099-01-01T00:00:00Z' }),
    ).toThrow();
    const old = adaptContent({ ...raw, collectedAt: '2020-01-01T00:00:00Z' });
    expect(
      computeAll({
        automaticDefinitions: [old.definition],
        contentSources: [old.input],
      }).ranked,
    ).toHaveLength(0);
  });
  it('requires an administrator for ingestion', async () => {
    const context = (user: unknown, roles: string[]) => ({
      auth: { user },
      state: { currentRoles: roles },
      action: { resourceName: 'nrAutomaticSources', actionName: 'ingest' },
      throw: (status: number) => {
        throw Object.assign(new Error(), { status });
      },
    });
    await expect(requireAccess(context(null, []))).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      requireAccess({
        ...context({ id: '2' }, []),
        db: {
          getRepository: (name: string) => ({
            findOne: async () =>
              name === 'users'
                ? { id: '2', roles: [] }
                : { get: () => ({ users: { '2': 'member' } }) },
          }),
        },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await requireAccess(context({ id: '1' }, ['root']))).toBe('admin');
  });
});

it('retains discovery history across an intervening batch and revalidates schema drift', () => {
  const raw = batch();
  const first = adaptContent(raw);
  const second = adaptContent(
    { ...raw, records: [{ title: 'Other', url: 'https://example.org/other' }] },
    Date.now(),
    first,
  );
  const third = adaptContent(
    { ...raw, collectedAt: new Date().toISOString() },
    Date.now(),
    second,
  );
  expect(third.input.items[0].firstSeenAt).toBe(
    first.input.items[0].firstSeenAt,
  );
  expect(second.definition.capabilities.metrics).toEqual([]);
  const invented = adaptContent(
    { ...raw, fieldDescriptions: { absent: 'Cumulative public likes' } },
    Date.now(),
    undefined,
    [
      {
        target: 'likes',
        path: 'absent',
        semantics: 'cumulative',
        evidence: 'Cumulative public likes',
      },
    ],
  );
  expect(invented.mapping.likes).toBe('stats.total_likes');
});
