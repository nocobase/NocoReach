// @ts-nocheck
// 下载量 page (server/nocoreach/downloads-view.ts) and what the package source keeps about releases (2026-10-14).
import { describe, expect, it } from 'vitest';
import { downloadsView, gains } from '../../server/nocoreach/downloads-view.js';
import { windowFor, netChange } from '../../server/nocoreach/data-views.js';
import { PackagesSource, channelOf, versionGroups } from '../../server/nocoreach/packages-source.js';

const DAY = 86_400_000;
const END = '2026-10-13';
const d = (n: number) => new Date(Date.parse(`${END}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);

function state() {
  const npm = {},
    pulls = {};
  for (let i = 0; i < 20; i++) {
    npm[d(i)] = i < 7 ? 200 : 100;
    pulls[d(i)] = 10_000 - i * 50;
  }
  return {
    packages: [
      { id: 'npm:app', registry: 'npm', name: 'app', title: 'app' },
      { id: 'docker:o/app', registry: 'docker', name: 'o/app', title: 'o/app' },
    ],
    daily: { 'npm:app': npm },
    samples: { 'docker:o/app': pulls },
    lastSync: { at: `${END}T02:00:00Z`, ok: true, errors: [] },
    meta: {
      'npm:app': {
        tags: { latest: '2.1.0', beta: '2.2.0-beta.1' },
        versions: [
          { version: '2.2.0-beta.1', published: `${d(2)}T08:00:00Z`, tags: ['beta'], lastWeek: 30 },
          { version: '2.1.0', published: `${d(5)}T08:00:00Z`, tags: ['latest'], lastWeek: 900 },
          { version: '2.0.0', published: `${d(40)}T08:00:00Z`, tags: [], lastWeek: 70 },
        ],
        week: { at: END, total: 1000, groups: [{ label: '2.1', count: 900 }, { label: '2.0', count: 70 }, { label: '2.2 beta', count: 30 }] },
      },
      'docker:o/app': {
        total: 3,
        tags: [
          { tag: 'latest', pushed: `${d(5)}T09:00:00Z`, pulled: `${END}T01:00:00Z`, size: 300, digest: 'sha256:1', platforms: [{ os: 'linux', arch: 'amd64' }, { os: 'linux', arch: 'arm64' }] },
          { tag: '2.1.0', pushed: `${d(5)}T09:00:00Z`, pulled: `${d(1)}T01:00:00Z`, size: 300, digest: 'sha256:2', platforms: [{ os: 'linux', arch: 'amd64' }, { os: 'linux', arch: 'arm64' }] },
          { tag: '2.0.0', pushed: `${d(40)}T09:00:00Z`, pulled: null, size: 280, digest: 'sha256:3', platforms: [{ os: 'linux', arch: 'amd64' }] },
        ],
      },
    },
  };
}
const github = () => ({
  repo: 'o/app',
  daily: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [d(i), { stars: 1, releaseDownloads: 500 - i * 5 }])),
});
const activity = () => ({
  repo: 'o/app',
  releases: [
    { tag: 'v2.1.0', name: '2.1.0', date: d(5), url: 'https://github.com/o/app/releases/v2.1.0', downloads: 40, assets: [{ name: 'app.zip', downloads: 30, size: 1024 }, { name: 'app.tar.gz', downloads: 10, size: 900 }] },
    { tag: 'v2.0.0', name: '2.0.0', date: d(40), url: 'https://github.com/o/app/releases/v2.0.0', downloads: 9, assets: [{ name: 'app.zip', downloads: 9, size: 1000 }] },
  ],
});
const view = (range = '7', gh = github(), act = activity()) => downloadsView(state(), gh, act, { range }, { windowFor, netChange, end: END });

describe('下载量 view', () => {
  it('has a figure per package and for the release files, each with its days and the period before', () => {
    const v = view();
    expect(v.items.map((x) => [x.id, x.kind])).toEqual([
      ['npm:app', 'downloads'],
      ['docker:o/app', 'pulls'],
      ['github:releases', 'assets'],
    ]);
    const [npm, docker, files] = v.items;
    expect([npm.value, npm.previous, npm.change, npm.average]).toEqual([1400, 700, 1, 200]);
    expect(npm.latest).toEqual({ version: '2.1.0', published: `${d(5)}T08:00:00Z` });
    expect([docker.value, docker.previous, docker.total]).toEqual([350, 350, 10_000]);
    expect(docker.latest.version).toBe('latest');
    expect([files.value, files.total, files.latest.version]).toEqual([35, 500, 'v2.1.0']);
    expect(v.daily).toHaveLength(7);
    expect(v.daily.at(-1)).toEqual({ date: END, 'npm:app': 200, 'docker:o/app': 50, 'github:releases': 5 });
    expect(v.previousDaily[0]['npm:app']).toBe(100);
    expect(v.cutoff).toBe(END);
  });

  it('says what was released, last week by version, and the platforms', () => {
    const v = view();
    expect(v.releases.tags.map((t) => [t.tag, t.version])).toEqual([
      ['latest', '2.1.0'],
      ['beta', '2.2.0-beta.1'],
    ]);
    expect(v.releases.published).toEqual({ npm: 2, pypi: null, docker: 2, github: 1 });
    expect(v.versions[0].rows.map((r) => [r.name, r.share])).toEqual([
      ['2.1', 0.9],
      ['2.0', 0.07],
      ['2.2 beta', 0.03],
    ]);
    expect(v.environment.platforms[0].rows).toEqual([
      { name: 'linux/amd64', count: 3, share: 1 },
      { name: 'linux/arm64', count: 2, share: 2 / 3 },
    ]);
    expect(v.environment.platforms[0].latest).toEqual({ tag: 'latest', size: 300 });
    // Docker 发布覆盖: the tags of each release line, their builds and CPUs, the largest image and the latest push.
    expect(v.coverage[0].rows).toEqual([
      { channel: 'latest', tags: 1, builds: 2, archs: [{ name: 'amd64', count: 1 }, { name: 'arm64', count: 1 }], maxSize: 300, pushed: `${d(5)}T09:00:00Z` },
      { channel: 'release', tags: 2, builds: 3, archs: [{ name: 'amd64', count: 2 }, { name: 'arm64', count: 1 }], maxSize: 300, pushed: `${d(5)}T09:00:00Z` },
    ]);
    expect([v.coverage[0].read, v.coverage[0].total]).toEqual([3, 3]);
  });

  it('lists versions, image tags and release files', () => {
    const t = view().tables;
    expect(t.versions.map((x) => [x.version, x.channel, x.lastWeek])).toEqual([
      ['2.2.0-beta.1', 'beta', 30],
      ['2.1.0', 'release', 900],
      ['2.0.0', 'release', 70],
    ]);
    expect(t.tags.map((x) => [x.tag, x.channel, x.platforms.join(',')])).toEqual([
      ['latest', 'latest', 'amd64,arm64'],
      ['2.1.0', 'release', 'amd64,arm64'],
      ['2.0.0', 'release', 'amd64'],
    ]);
    expect(t.assets.map((x) => [x.release, x.name, x.downloads])).toEqual([
      ['2.1.0', 'app.zip', 30],
      ['2.1.0', 'app.tar.gz', 10],
      ['2.0.0', 'app.zip', 9],
    ]);
  });

  it('leaves the release files out without a GitHub repository, and gains are never negative', () => {
    expect(view('7', null, null).items.map((x) => x.id)).toEqual(['npm:app', 'docker:o/app']);
    expect(gains({ [d(2)]: 10, [d(1)]: 8, [d(0)]: 12 })).toEqual({ [d(1)]: 0, [d(0)]: 4 });
  });
});

describe('release channels', () => {
  it('reads npm, PyPI and image tag names', () => {
    expect(['latest-full', '2.2-full', '2.2.24-full-no-nginx', '2.4.0-alpha.10', '2.3.0-beta.14', '2.2.0-test.16', '3.0.0rc1', '1.0a1', 'sha-1a2b3c'].map(channelOf)).toEqual([
      'latest', 'line', 'release', 'alpha', 'beta', 'pre', 'rc', 'alpha', 'other',
    ]);
    expect(versionGroups({ '2.2.1': 5, '2.2.0': 5, '2.3.0-beta.2': 4, junk: 9 })).toEqual([
      { label: '2.2', count: 10 },
      { label: '2.3 beta', count: 4 },
    ]);
  });
});

describe('package releases', () => {
  const clock = Date.parse('2026-10-14T00:00:00Z');
  const source = (pages: Record<string, unknown>) =>
    new PackagesSource({ mock: { enabled: true, clock: () => new Date(clock).toISOString() } }, async (url: string) => {
      const hit = Object.entries(pages).find(([k]) => url.startsWith(k));
      if (!hit) throw new Error(`返回 404 ${url}`);
      if (hit[1] instanceof Error) throw hit[1];
      return { text: JSON.stringify(hit[1]) };
    });

  it('keeps npm dist-tags, versions with publish times and last week by version', async () => {
    const s = source({
      'https://registry.npmjs.org/@o/app': {
        'dist-tags': { latest: '1.1.0', beta: '1.2.0-beta.1' },
        versions: { '1.0.0': {}, '1.1.0': {}, '1.2.0-beta.1': {} },
        time: { created: '2025-01-01T00:00:00Z', '1.0.0': '2025-01-01T00:00:00Z', '1.1.0': '2026-09-01T00:00:00Z', '1.2.0-beta.1': '2026-10-01T00:00:00Z' },
      },
      'https://api.npmjs.org/versions/@o%2Fapp/last-week': { downloads: { '1.1.0': 80, '1.0.0': 20 } },
    });
    const m = await s.meta({ registry: 'npm', name: '@o/app' }, null, clock);
    expect(m.tags).toEqual({ latest: '1.1.0', beta: '1.2.0-beta.1' });
    expect(m.versions.map((v) => [v.version, v.tags, v.lastWeek])).toEqual([
      ['1.2.0-beta.1', ['beta'], 0],
      ['1.1.0', ['latest'], 80],
      ['1.0.0', [], 20],
    ]);
    expect(m.week.groups).toEqual([{ label: '1.1', count: 80 }, { label: '1.0', count: 20 }]);
  });

  it('keeps last week from the previous read when the by-version endpoint fails', async () => {
    const s = source({
      'https://registry.npmjs.org/app': { 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {} }, time: { '1.0.0': '2026-09-01T00:00:00Z' } },
      'https://api.npmjs.org/versions/': new Error('504'),
    });
    const old = { week: { at: '2026-10-10', counts: { '1.0.0': 5 } } };
    expect((await s.meta({ registry: 'npm', name: 'app' }, old, clock)).week.total).toBe(5);
    expect((await s.meta({ registry: 'npm', name: 'app' }, { week: { at: '2026-09-01', counts: {} } }, clock)).week).toBeNull();
  });

  it('keeps PyPI versions and the last 30 days by Python version and system', async () => {
    const rows = (kind: string, names: string[]) => ({
      data: Array.from({ length: 40 }, (_, i) => new Date(clock - (i + 1) * DAY).toISOString().slice(0, 10)).flatMap((date) => names.map((category) => ({ category, date, downloads: kind === 'system' ? 2 : 1 }))),
    });
    const s = source({
      'https://pypi.org/pypi/app/json': { info: { version: '1.1' }, releases: { '1.0': [{ upload_time_iso_8601: '2026-01-01T00:00:00Z', size: 10 }], '1.1': [{ upload_time_iso_8601: '2026-10-01T00:00:00Z', size: 12 }, { upload_time_iso_8601: '2026-10-01T00:01:00Z', size: 13 }] } },
      'https://pypistats.org/api/packages/app/python_minor': rows('python', ['3.12', '3.11']),
      'https://pypistats.org/api/packages/app/system': rows('system', ['Linux']),
    });
    const m = await s.meta({ registry: 'pypi', name: 'app' }, null, clock);
    expect(m.versions.map((v) => [v.version, v.files, v.size, v.tags])).toEqual([
      ['1.1', 2, 25, ['latest']],
      ['1.0', 1, 10, []],
    ]);
    expect(m.python.rows).toEqual([{ name: '3.12', count: 30 }, { name: '3.11', count: 30 }]);
    expect(m.systems.rows).toEqual([{ name: 'Linux', count: 60 }]);
  });

  it('reads Docker tags page by page and leaves attestation manifests out', async () => {
    const tag = (name: string) => ({ name, tag_last_pushed: '2026-10-01T00:00:00Z', tag_last_pulled: '2026-10-13T00:00:00Z', full_size: 5, digest: 'sha256:abcdef0123456789abcdef', images: [{ architecture: 'amd64', os: 'linux' }, { architecture: 'arm64', os: 'linux', variant: 'v8' }, { architecture: 'unknown', os: 'unknown' }] });
    const s = source({
      'https://hub.docker.com/v2/repositories/o/app/tags?page_size=100&page=1': { count: 2, next: 'more', results: [tag('latest')] },
      'https://hub.docker.com/v2/repositories/o/app/tags?page_size=100&page=2': { count: 2, next: null, results: [tag('1.0.0')] },
    });
    const m = await s.meta({ registry: 'docker', name: 'o/app' }, null, clock);
    expect(m.total).toBe(2);
    expect(m.tags.map((t) => [t.tag, t.platforms.map((p) => p.arch).join(','), t.digest])).toEqual([
      ['latest', 'amd64,arm64/v8', 'sha256:abcdef012345'],
      ['1.0.0', 'amd64,arm64/v8', 'sha256:abcdef012345'],
    ]);
  });
});

it('all time covers the saved daily history without a previous period', () => {
 const v=downloadsView(state(),null,null,{range:'all'},{windowFor,netChange,end:END});
 expect(v.window.start).toBe(d(19));expect(v.window.all).toBe(true);
 expect(v.items.every(x=>x.previous===null&&x.change===null)).toBe(true);
 expect(v.previousDaily).toEqual([]);
});
