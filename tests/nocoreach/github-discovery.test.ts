// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GitHubDiscovery,
  discoveryKey,
  discoveryTokenKey,
} from '../../server/nocoreach/github-discovery/service.js';
import {
  parseRule,
  verifyRule,
} from '../../server/nocoreach/github-discovery/rules.js';
import { newDiscoveryRule } from '../../shared/github-discovery.js';
import { githubDiscoveryFixture } from '../../app-plugins/nocoreach-mock/server/github-discovery.js';
import { fixtureResponse } from '../../app-plugins/nocoreach-mock/server/fixtures.js';

const token = 'github_pat_testOnlyNeverLive1234567890';
const response = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => new Response(JSON.stringify(data), { status, headers });
function harness(
  request?: (url: string, init: RequestInit, id: string) => Promise<Response>,
) {
  const rows = new Map<string, unknown>(),
    secrets = new Map<string, string>();
  const save = async (
    { values }: { values: { key?: string; payload: unknown } },
    key?: string,
  ) => {
    rows.set(values.key || key!, structuredClone(values.payload));
  };
  const repo = {
    findOne: async ({ filter }: { filter: { key: string } }) =>
      rows.has(filter.key)
        ? { id: filter.key, get: () => structuredClone(rows.get(filter.key)) }
        : null,
    create: save,
    update: async (v: { filterByTk: string; values: { payload: unknown } }) =>
      save(v, v.filterByTk),
  };
  let actions: Record<
    string,
    (ctx: unknown, next: () => Promise<void>) => Promise<unknown>
  > = {};
  const host = {
    db: {
      getRepository: () => repo,
      sequelize: {
        transaction: (fn: (t: object) => unknown) => fn({}),
        query: async () => undefined,
      },
    },
    env: (key: string) => secrets.get(key) || '',
    variable: vi.fn(async (key: string, value: string | null) => {
      if (value === null) secrets.delete(key);
      else secrets.set(key, value);
    }),
    project: async (id: string) => {
      if (id !== '1' && id !== '2')
        throw Object.assign(new Error('No project'), { status: 404 });
    },
    projectIds: async () => ['1', '2'],
    github: { token: () => token },
    mock: { enabled: true },
    network: { bind: vi.fn(), inDemoProject: async () => false },
    app: {
      importHold: { track: <T>(promise: Promise<T>) => promise },
      logger: { warn: vi.fn() },
      acl: { allow: vi.fn() },
      resourceManager: {
        define: (v: { actions: typeof actions }) => {
          actions = v.actions;
        },
      },
    },
  };
  const asked: string[] = [];
  const service = new GitHubDiscovery(
    host as unknown as ConstructorParameters<typeof GitHubDiscovery>[0],
    async (url, init, id) => {
      asked.push(url);
      return request
        ? request(url, init, id)
        : githubDiscoveryFixture(new URL(url)) || response({}, 404);
    },
  );
  return { service, host, rows, secrets, asked, actions: () => actions };
}
async function add(service: GitHubDiscovery, name = 'NocoBase 3') {
  const rule = newDiscoveryRule(true);
  rule.name = name;
  return service.saveRule('1', rule, (await service.status('1')).revision);
}
afterEach(() => vi.restoreAllMocks());

describe('discovery verification', () => {
  it('requires actual dependency, runtime and application evidence, and pins every link to a commit', async () => {
    const rule = newDiscoveryRule(true),
      sha = 'a'.repeat(40);
    const files: Record<string, string> = {
      'apps/help/package.json': JSON.stringify({
        nocobase: { templateKind: 'app' },
        devDependencies: { '@nocobase/app-server': '^3.0.0-beta.3' },
      }),
      'apps/help/server/runtime.ts': '@nocobase/app-server/runtime',
      'apps/help/client/runtime.ts': '@nocobase/app-client/runtime',
    };
    const result = await verifyRule(
      rule,
      'team/help',
      sha,
      async (path) => files[path] || null,
      '2026-10-28',
      'apps/help/',
    );
    expect(result.status).toBe('verified');
    expect(result.evidence).toHaveLength(4);
    expect(
      result.evidence.every((e) => e.url.includes(`/blob/${sha}/apps/help/`)),
    ).toBe(true);
    files['apps/help/package.json'] = JSON.stringify({
      nocobase: { templateKind: 'app' },
      dependencies: { '@nocobase/app-server': '>=2' },
    });
    expect(
      (
        await verifyRule(
          rule,
          'team/help',
          sha,
          async (path) => files[path] || null,
          'now',
          'apps/help/',
        )
      ).status,
    ).toBe('candidate');
    rule.dependencies = [];
    rule.files = [];
    rule.json = [];
    expect(
      (await verifyRule(rule, 'team/help', sha, async () => null, 'now'))
        .status,
    ).toBe('mention');
  });
  it('rejects unsafe paths, prototype fields, invalid versions and unbounded rule inputs', () => {
    expect(() =>
      parseRule({
        ...newDiscoveryRule(true),
        files: [{ path: '../secret', contains: '' }],
      }),
    ).toThrow();
    expect(() =>
      parseRule({
        ...newDiscoveryRule(true),
        json: [{ path: 'package.json', field: '__proto__.name', equals: 'x' }],
      }),
    ).toThrow();
    expect(() =>
      parseRule({
        ...newDiscoveryRule(true),
        dependencies: [{ name: 'sdk', range: 'not-a-version' }],
      }),
    ).toThrow();
    expect(() =>
      parseRule({ ...newDiscoveryRule(true), batchSize: 5000 }),
    ).toThrow();
  });
});

describe('project discovery lifecycle', () => {
  it('scans without Traffic, deduplicates repositories, and keeps separate evidence for multiple rules', async () => {
    const { service, asked } = harness();
    await add(service);
    await add(service, 'Second rule');
    await service.scan('1');
    await service.idle('1');
    const all = await service.list('1', {});
    expect(all.total).toBe(3);
    expect(all.items.every((r) => r.matches.length === 2)).toBe(true);
    expect(
      all.items.find((r) => r.name.endsWith('support-desk'))?.matches[0]
        ?.status,
    ).toBe('verified');
    expect(
      all.items.find((r) => r.name.endsWith('framework-notes'))?.matches[0]
        ?.status,
    ).toBe('candidate');
    expect(asked.every((url) => !url.includes('/traffic/'))).toBe(true);
    expect((await service.list('2', {})).total).toBe(0);
    expect((await service.status('1')).running).toBe(false);
    expect((await service.status('1')).lastRun?.ok).toBe(true);
  });
  it('previews without persisting and keeps findings and human decisions across rescans', async () => {
    const { service, rows } = harness();
    const preview = await service.preview('1', newDiscoveryRule(true));
    expect(preview.items).toHaveLength(3);
    expect(rows.size).toBe(0);
    await add(service);
    await service.scan('1');
    await service.idle('1');
    const repo = (await service.list('1', {})).items[0]!;
    await service.review('1', {
      repositoryId: repo.id,
      revision: repo.revision,
      review: 'confirmed',
      favorite: true,
    });
    await service.scan('1');
    await service.idle('1');
    const next = await service.get('1', repo.id);
    expect(next.review).toBe('confirmed');
    expect(next.favorite).toBe(true);
    expect(next.firstDiscoveredAt).toBe(repo.firstDiscoveredAt);
    expect((await service.list('1', { status: 'favorite' })).total).toBe(1);
    expect(
      (
        await service.list('1', {
          sort: 'stars',
          order: 'asc',
          page: 2,
          pageSize: 1,
        })
      ).items[0]?.stars,
    ).toBe(30);
  });
  it('rejects stale settings and reviews, invalidates edited conclusions, and removes only one rule’s matches', async () => {
    const { service } = harness();
    const first = await add(service);
    await add(service, 'Other');
    await expect(
      service.saveRule('1', first.rules[0], first.revision),
    ).rejects.toMatchObject({ status: 409 });
    await service.scan('1');
    await service.idle('1');
    const before = (await service.list('1', {})).items[0]!;
    await service.review('1', {
      repositoryId: before.id,
      revision: before.revision,
      review: 'ignored',
      favorite: false,
    });
    await expect(
      service.review('1', {
        repositoryId: before.id,
        revision: before.revision,
        review: 'confirmed',
        favorite: false,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const status = await service.status('1');
    await service.saveRule(
      '1',
      { ...status.rules[0], name: 'Edited' },
      status.revision,
    );
    expect((await service.get('1', before.id)).matches[0]?.status).toBe(
      'candidate',
    );
    await service.changeRule(
      '1',
      status.rules[0]!.id,
      (await service.status('1')).revision,
    );
    expect((await service.get('1', before.id)).matches).toHaveLength(1);
  });
  it('seals independent credentials, never returns their value, and rechecks access after verification', async () => {
    const { service, secrets, host } = harness();
    host.github.token = () => '';
    expect((await service.status('1')).credential).toBe('missing');
    await service.setToken('1', token, 0);
    expect(host.variable).toHaveBeenCalledWith(
      discoveryTokenKey('1'),
      token,
      true,
    );
    expect((await service.status('1')).credential).toBe('dedicated');
    expect(JSON.stringify(await service.status('1'))).not.toContain(token);
    await expect(
      service.setToken('2', token, 0, async () => {
        throw Object.assign(new Error('Denied'), { status: 403 });
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(secrets.has(discoveryTokenKey('2'))).toBe(false);
    await service.removeToken('1', 1);
    expect((await service.status('1')).credential).toBe('missing');
  });
  it('does not read private repository files or persist their metadata', async () => {
    const { service, asked } = harness(async (url) => {
      const u = new URL(url),
        result = githubDiscoveryFixture(u)!;
      if (u.pathname === '/repos/demo-ecosystem/support-desk')
        return response({ ...(await result.json()), private: true });
      return result;
    });
    await add(service);
    await service.scan('1');
    await service.idle('1');
    expect((await service.list('1', {})).total).toBe(2);
    expect(asked.some((url) => url.includes('/support-desk/contents/'))).toBe(
      false,
    );
  });
  it('preserves successful items and resumes the failed cursor after rate limiting', async () => {
    let blocked = true;
    const { service, rows } = harness(async (url) =>
      url.endsWith('/repos/demo-ecosystem/inventory') && blocked
        ? response({}, 429, { 'retry-after': '60' })
        : githubDiscoveryFixture(new URL(url))!,
    );
    await add(service);
    await service.scan('1');
    await service.idle('1');
    expect((await service.list('1', {})).total).toBe(1);
    expect((await service.status('1')).lastRun).toMatchObject({
      ok: false,
      partial: true,
    });
    await expect(service.scan('1')).rejects.toMatchObject({ status: 429 });
    const state = rows.get(discoveryKey('1')) as {
      lastRun: { retryAt?: string };
    };
    delete state.lastRun.retryAt;
    blocked = false;
    await service.scan('1');
    await service.idle('1');
    expect((await service.list('1', {})).total).toBe(3);
  });
  it('fences an in-flight scan when a rule is paused', async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((r) => {
        release = r;
      }),
      entered = new Promise<void>((r) => {
        started = r;
      });
    const { service } = harness(async (url) => {
      if (url.includes('/search/')) {
        started();
        await gate;
      }
      return githubDiscoveryFixture(new URL(url))!;
    });
    const status = await add(service);
    await service.scan('1');
    await entered;
    await service.changeRule('1', status.rules[0]!.id, status.revision, false);
    release();
    await service.idle('1');
    expect((await service.list('1', {})).total).toBe(0);
    expect((await service.status('1')).lastRun).toBeNull();
  });
  it('scheduled scans honor intervals and shutdown stops further work', async () => {
    const { service, asked } = harness();
    await add(service);
    await service.tick();
    const count = asked.length;
    await service.tick();
    expect(asked).toHaveLength(count);
    await service.close();
    await service.tick();
    expect(asked).toHaveLength(count);
  });
  it('routes require project access before reading or making upstream requests', async () => {
    const { service, host, asked, actions } = harness();
    service.register();
    const access = {
      require: vi.fn(async () => {
        throw Object.assign(new Error('Forbidden'), { status: 403 });
      }),
      role: async () => 'member',
    };
    Object.assign(host.db, { access });
    const ctx = {
      method: 'POST',
      auth: { user: { id: '9' } },
      db: host.db,
      app: host.app,
      state: {},
      action: {
        resourceName: 'nrGitHubDiscovery',
        actionName: 'scan',
        params: { values: { projectId: '2' } },
      },
      throw: (status: number, message: string) => {
        throw Object.assign(new Error(message), { status });
      },
    };
    await expect(
      actions().scan!(ctx, async () => undefined),
    ).rejects.toMatchObject({ status: 403 });
    expect(access.require).toHaveBeenCalledWith(
      'nrGitHubDiscovery',
      'scan',
      '2',
    );
    expect(asked).toHaveLength(0);
  });
  it('mock provider answers every discovery request with no live fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Real network forbidden'),
    );
    const context = {
      projectId: '1',
      seed: 'nocobloom-demo',
      clock: '2026-10-28T00:00:00.000Z',
      scenario: 'normal' as const,
      revision: 1,
      runId: '00000000-0000-4000-8000-000000000001',
    };
    const { service } = harness((url, init) =>
      fixtureResponse(url, init, context),
    );
    await add(service);
    await service.scan('1');
    await service.idle('1');
    expect((await service.status('1')).lastRun?.errors).toEqual([]);
    expect((await service.list('1', {})).total).toBe(3);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

it('verifies multiple application roots and does not let a root-level mention replace a verified nested app', async () => {
  const name = 'demo-ecosystem/support-desk';
  const { service } = harness(async (url) => {
    const u = new URL(url);
    if (u.pathname.startsWith('/search/'))
      return response({
        total_count: 3,
        items: [
          { repository: { full_name: name }, path: 'package.json' },
          { repository: { full_name: name }, path: 'apps/help/package.json' },
          { repository: { full_name: name }, path: 'docs/package.json' },
        ],
      });
    if (u.pathname.includes('/contents/apps/help/'))
      u.pathname = u.pathname.replace('/contents/apps/help/', '/contents/');
    else if (u.pathname.includes('/contents/')) return response({}, 404);
    return githubDiscoveryFixture(u)!;
  });
  const rule = newDiscoveryRule(true);
  rule.queries = rule.queries.slice(0, 1);
  await service.saveRule('1', rule, 0);
  await service.scan('1');
  await service.idle('1');
  const saved = (await service.list('1', {})).items;
  expect(saved).toHaveLength(1);
  expect(saved[0]?.matches[0]).toMatchObject({
    base: 'apps/help/',
    status: 'verified',
  });
});
it('removes all matches after a repository becomes private, and rejects non-record identifiers', async () => {
  let privateNow = false;
  const { service } = harness(async (url) => {
    const u = new URL(url),
      result = githubDiscoveryFixture(u)!;
    if (privateNow && u.pathname === '/repos/demo-ecosystem/support-desk')
      return response({ ...(await result.json()), private: true });
    return result;
  });
  await add(service);
  await add(service, 'Other');
  await service.scan('1');
  await service.idle('1');
  expect((await service.get('1', '880001')).matches).toHaveLength(2);
  privateNow = true;
  await service.scan('1');
  await service.idle('1');
  await expect(service.get('1', '880001')).rejects.toMatchObject({
    status: 404,
  });
  await expect(service.get('1', '__proto__')).rejects.toMatchObject({
    status: 404,
  });
});

it('skips private or disappeared preview candidates and continues with public repositories', async () => {
  const { service, asked } = harness(async (url) => {
    const u = new URL(url),
      result = githubDiscoveryFixture(u)!;
    if (u.pathname === '/repos/demo-ecosystem/support-desk')
      return response({ ...(await result.json()), private: true });
    if (u.pathname === '/repos/demo-ecosystem/inventory')
      return response({}, 404);
    return result;
  });
  const preview = await service.preview('1', newDiscoveryRule(true));
  expect(preview.items.map((r) => r.name)).toEqual([
    'demo-ecosystem/framework-notes',
  ]);
  expect(asked.some((url) => url.includes('/support-desk/contents/'))).toBe(
    false,
  );
  expect((await service.list('1', {})).total).toBe(0);
});

it('reports independent discovery health using the configured cadence and a paused state', async () => {
  const { DataHealth } = await import('../../server/nocoreach/data-health.js');
  const old = new Date(Date.now() - 4 * 86400000).toISOString();
  const discovery = {
    connected: true,
    rules: [{ ...newDiscoveryRule(true), intervalHours: 168 }],
    lastSuccessAt: old,
    lastRun: { at: old, ok: true, errors: [] },
    nextScanAt: new Date(Date.now() + 3 * 86400000).toISOString(),
  };
  const health = new DataHealth({
    link: async () => null,
    githubDiscovery: {
      status: async () => discovery,
      state: async () => ({ rules: discovery.rules }),
    },
  });
  expect((await health.connected('1')).github).toBe(true);
  expect((await health.list('1')).items[0]).toMatchObject({
    state: 'healthy',
    cadence: 'weekly',
  });
  discovery.rules[0]!.enabled = false;
  expect((await health.list('1')).items[0]).toMatchObject({
    state: 'pending',
    cadence: 'manual',
    retry: null,
  });
});
