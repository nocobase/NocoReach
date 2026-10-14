// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureResponse } from '../../app-plugins/nocoreach-mock/server/fixtures.js';
import type { MockRunContext } from '../../app-plugins/nocoreach-mock/server/types.js';
import { DataViews } from '../../server/nocoreach/data-views.js';
import { GitHubSource } from '../../server/nocoreach/github-source.js';

type PopularPath = {
  path: string;
  title: string;
  count: number;
  uniques: number;
};
type GitHubSnapshot = {
  traffic: { paths: Record<string, PopularPath[]> };
  lastSync: { errors: string[] };
};

const context: MockRunContext = {
  projectId: '41',
  seed: 'nocobloom-demo',
  clock: '2026-10-12T09:00:00.000Z',
  scenario: 'normal',
  revision: 1,
  runId: '00000000-0000-4000-8000-000000000041',
};
const repositories = [
  'nocobloom/nocobloom',
  'flowgrove/flowgrove',
  'stackmeadow/stackmeadow',
];
const scenarios = ['normal', 'newdata', 'pagination'] as const;
const read = async <T>(url: string, c = context): Promise<T> =>
  (await fixtureResponse(url, {}, c)).json() as Promise<T>;
const readPaths = (repo: string, c = context) =>
  read<PopularPath[]>(
    `https://api.github.com/repos/${repo}/traffic/popular/paths`,
    c,
  );

// Use the real upstream parser, snapshot writes and page projection. Only the
// repository persistence surface is replaced; no business response is stubbed.
async function synchronize(repo: string, c: MockRunContext) {
  let stored: GitHubSnapshot | null = null;
  const save = async ({ values }: { values: { payload: GitHubSnapshot } }) => {
    stored = structuredClone(values.payload);
  };
  const repository = {
    findOne: async () =>
      stored ? { id: 1, get: () => structuredClone(stored) } : null,
    update: save,
    create: save,
  };
  const plugin = {
    mock: { enabled: true, clock: () => c.clock },
    env: () => 'github_pat_FictionalMockOnlyNeverLive1234567890',
    db: {
      getRepository: () => repository,
      sequelize: {
        transaction: (fn: (transaction: object) => Promise<unknown>) => fn({}),
        query: async () => undefined,
      },
    },
    github: undefined as GitHubSource | undefined,
  };
  const request = vi.fn((url: string, init: RequestInit) =>
    fixtureResponse(url, init, c),
  );
  plugin.github = new GitHubSource(plugin, request);
  await plugin.github.connect(c.projectId, `https://github.com/${repo}`);
  const snapshot = (await plugin.github.state(c.projectId)) as GitHubSnapshot;
  const view = (await new DataViews(plugin).github(c.projectId, {
    range: '28',
  })) as {
    paths: {
      latest: {
        date: string;
        items: (PopularPath & { area: string; share: number | null })[];
      };
    };
  };
  expect(request).toHaveBeenCalledWith(
    `https://api.github.com/repos/${repo}/traffic/popular/paths`,
    expect.any(Object),
  );
  expect(snapshot.lastSync.errors).toEqual([]);
  return { snapshot, view };
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('Real upstream requests are forbidden in mock path regression'),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(repositories)('GitHub popular paths for %s', (repo) => {
  it.each(scenarios)(
    '%s keeps four coherent, stable keys through storage and the production view',
    async (scenario) => {
      const c = { ...context, scenario };
      const rows = await readPaths(repo, c);
      expect(rows.map(({ path, title }) => ({ path, title }))).toEqual([
        { path: `/${repo}`, title: repo },
        { path: `/${repo}/blob/main/README.md`, title: 'README.md' },
        { path: `/${repo}/blob/main/SKILL.md`, title: 'SKILL.md' },
        { path: `/${repo}/issues`, title: 'Issues' },
      ]);
      expect(new Set(rows.map((row) => row.path)).size).toBe(4);
      expect(await readPaths(repo, c)).toEqual(rows);
      expect(
        await readPaths(repo, { ...c, revision: 99, runId: 'another-run' }),
      ).toEqual(rows);

      const { snapshot, view } = await synchronize(repo, c);
      expect(snapshot.traffic.paths[c.clock.slice(0, 10)]).toEqual(rows);
      // The latest snapshot as the 热门页面 table: GitHub's rows with the part of the repository and the share added.
      expect(view.tables.paths.date).toBe(c.clock.slice(0, 10));
      expect(
        view.tables.paths.items.map(({ path, title, count, uniques }) => ({
          path,
          title,
          count,
          uniques,
        })),
      ).toEqual(rows);
      // The UI selects by path and filters all rows with the selected key.
      // Each key must match exactly one row; all keys must represent all rows.
      for (const selected of view.tables.paths.items) {
        expect(
          view.tables.paths.items.filter((row) => row.path === selected.path),
        ).toEqual([selected]);
      }
      expect(new Set(view.tables.paths.items.map((row) => row.path)).size).toBe(
        view.tables.paths.items.length,
      );
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it('matches file paths to the same contents, tree and raw-file catalog', async () => {
    const rows = await readPaths(repo);
    const tree = await read<{ tree: { path: string }[] }>(
      `https://api.github.com/repos/${repo}/git/trees/main`,
    );
    for (const row of rows.filter((item) =>
      item.path.includes('/blob/main/'),
    )) {
      const filename = row.path.split('/blob/main/')[1];
      const file = await read<{
        path: string;
        html_url: string;
        download_url: string;
        content: string;
      }>(`https://api.github.com/repos/${repo}/contents/${filename}`);
      expect(tree.tree.map((entry) => entry.path)).toContain(filename);
      expect(file.path).toBe(filename);
      expect(file.html_url).toBe(`https://github.com${row.path}`);
      const raw = await fixtureResponse(file.download_url, {}, context);
      expect(await raw.text()).toBe(
        Buffer.from(file.content, 'base64').toString('utf8'),
      );
    }
    const repository = await read<{ html_url: string }>(
      `https://api.github.com/repos/${repo}`,
    );
    expect(repository.html_url).toBe(`https://github.com${rows[0].path}`);
    const issues = await read<{ html_url: string }[]>(
      `https://api.github.com/repos/${repo}/issues`,
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(
      issues.every((issue) =>
        issue.html_url.startsWith(`https://github.com${rows[3].path}/`),
      ),
    ).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('keeps the empty scenario empty through storage and the production view', async () => {
    const c = { ...context, scenario: 'empty' } as const;
    expect(await readPaths(repo, c)).toEqual([]);
    const { snapshot, view } = await synchronize(repo, c);
    expect(snapshot.traffic.paths[c.clock.slice(0, 10)]).toEqual([]);
    expect(view.tables.paths.items).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
