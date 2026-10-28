import { DAY, daysBetween, json, notFound } from './kit.js';
import { growth, level, weekday } from './series.js';
import type { World } from './world.js';

const iso = (t: number) => new Date(t).toISOString();
const NPM = /^(@[a-z0-9~][a-z0-9-._~]*\/)?[a-z0-9~][a-z0-9-._~]*$/;
const PYPI = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/** Downloads on a day for a registry, following the release spikes. */
function downloads(
  world: World,
  registry: 'npm' | 'pypi',
  name: string,
  date: string,
): number {
  const ago = Math.round((world.now - Date.parse(date)) / DAY);
  if (ago < 1) return 0;
  const base = registry === 'npm' ? world.packages.npm : world.packages.pypi;
  // Package downloads come from CI as much as from people, so weekends dip less than visits.
  return Math.round(
    base *
      weekday(date) ** 0.5 *
      growth(ago) *
      level(world.packages.changes, ago) *
      world.seeded.jitter(`${registry}:${name}:${date}`, 0.14),
  );
}

const versionTime = (world: World, age: number) =>
  iso(world.now - age * DAY - 7 * 3_600_000);

export function packages(world: World, u: URL): Response | undefined {
  let p: string;
  try {
    p = decodeURIComponent(u.pathname);
  } catch {
    return undefined;
  }
  const versions = world.packages.versions;
  const stable = versions.find(([v]) => !v.includes('-'))![0];
  if (u.hostname === 'registry.npmjs.org') {
    const name = p.replace(/^\//, '').replace(/\/latest$/, '');
    if (!NPM.test(name)) return notFound();
    if (p.endsWith('/latest'))
      return json({
        name,
        version: stable,
        description: `${world.site.name} ${world.lang === 'zh' ? '核心包' : 'core package'}`,
        homepage: world.origin,
        repository: {
          type: 'git',
          url: `git+https://github.com/${world.repository.owner}/${world.repository.name}.git`,
        },
        license: 'AGPL-3.0',
      });
    return json({
      name,
      'dist-tags': { latest: stable, beta: versions[0][0] },
      versions: Object.fromEntries(
        versions.map(([v]) => [v, { name, version: v }]),
      ),
      time: {
        created: iso(world.now - 1100 * DAY),
        modified: versionTime(world, versions[0][1]),
        ...Object.fromEntries(
          versions.map(([v, age]) => [v, versionTime(world, age)]),
        ),
      },
    });
  }
  if (u.hostname === 'api.npmjs.org') {
    const lastWeek = p.match(/^\/versions\/(.+)\/last-week$/);
    if (lastWeek) {
      const weekly = Array.from({ length: 7 }, (_, i) =>
        downloads(
          world,
          'npm',
          lastWeek[1],
          iso(world.now - (i + 1) * DAY).slice(0, 10),
        ),
      ).reduce((a, b) => a + b, 0);
      // Most installs take the newest stable release; older ones fade as projects upgrade.
      const shares = versions.map(([v, age], i) =>
        v.includes('-')
          ? 0.015
          : Math.max(0.01, 0.55 / (i + 1) ** 1.3 / (1 + age / 60)),
      );
      const total = shares.reduce((a, b) => a + b, 0);
      return json({
        package: lastWeek[1],
        downloads: Object.fromEntries(
          versions.map(([v], i) => [
            v,
            Math.round((weekly * shares[i]) / total),
          ]),
        ),
      });
    }
    const range = p.match(
      /^\/downloads\/range\/(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})\/(.+)$/,
    );
    if (!range || !NPM.test(range[3])) return notFound();
    return json({
      start: range[1],
      end: range[2],
      package: range[3],
      downloads: daysBetween(range[1], range[2]).map((day) => ({
        day,
        downloads: downloads(world, 'npm', range[3], day),
      })),
    });
  }
  if (u.hostname === 'pypi.org') {
    const match = p.match(/^\/pypi\/([^/]+)\/json$/);
    if (!match || !PYPI.test(match[1])) return notFound();
    return json({
      info: {
        name: match[1],
        version: stable,
        summary:
          world.lang === 'zh'
            ? `${world.site.name} 的 Python SDK`
            : `The Python SDK for ${world.site.name}`,
        home_page: world.origin,
        project_urls: {
          Source: `https://github.com/${world.repository.owner}/${world.repository.name}`,
        },
      },
      releases: Object.fromEntries(
        versions
          .filter(([v]) => !v.includes('-'))
          .map(([v, age]) => [
            v,
            ['sdist', 'bdist_wheel'].map((packagetype, i) => ({
              packagetype,
              size: 52_000 + i * 6_000,
              upload_time_iso_8601: versionTime(world, age),
              yanked: false,
            })),
          ]),
      ),
    });
  }
  if (u.hostname === 'pypistats.org') {
    const today = iso(world.now).slice(0, 10);
    const days = daysBetween(
      iso(world.now - 180 * DAY).slice(0, 10),
      iso(world.now - DAY).slice(0, 10),
    ).filter((d) => d < today);
    const split = p.match(/^\/api\/packages\/([^/]+)\/(python_minor|system)$/);
    if (split) {
      const categories: [string, number][] =
        split[2] === 'system'
          ? [
              ['Linux', 0.78],
              ['Darwin', 0.13],
              ['Windows', 0.07],
              ['null', 0.02],
            ]
          : [
              ['3.12', 0.38],
              ['3.11', 0.31],
              ['3.10', 0.19],
              ['3.13', 0.08],
              ['3.9', 0.04],
            ];
      return json({
        package: split[1],
        type: `${split[2]}_downloads`,
        data: days.flatMap((date) =>
          categories.map(([category, share]) => ({
            category,
            date,
            downloads: Math.round(
              downloads(world, 'pypi', split[1], date) * share,
            ),
          })),
        ),
      });
    }
    const overall = p.match(/^\/api\/packages\/([^/]+)\/overall$/);
    if (!overall) return notFound();
    return json({
      package: overall[1],
      type: 'overall_downloads',
      data: days.flatMap((date) => {
        const n = downloads(world, 'pypi', overall[1], date);
        return [
          { category: 'without_mirrors', date, downloads: n },
          { category: 'with_mirrors', date, downloads: Math.round(n * 1.6) },
        ];
      }),
    });
  }
  if (u.hostname === 'hub.docker.com') {
    const tags = p.match(/^\/v2\/repositories\/([^/]+\/[^/]+)\/tags\/?$/);
    if (tags) {
      const names = versions.flatMap(([v], i) => [
        ...(v === stable ? ['latest'] : []),
        ...(i === 0 ? ['beta'] : []),
        v,
        `${v}-full`,
      ]);
      const page = Math.max(1, Number(u.searchParams.get('page')) || 1);
      const size = Math.min(
        100,
        Math.max(1, Number(u.searchParams.get('page_size')) || 10),
      );
      const pushed = (name: string) =>
        versionTime(
          world,
          versions.find(([v]) => name.startsWith(v))?.[1] ??
            versions.find(([v]) => v === stable)![1],
        );
      return json({
        count: names.length,
        next:
          page * size < names.length
            ? `https://hub.docker.com/v2/repositories/${tags[1]}/tags?page=${page + 1}&page_size=${size}`
            : null,
        previous: null,
        results: names.slice((page - 1) * size, page * size).map((name) => ({
          name,
          full_size: name.endsWith('-full') ? 498_000_000 : 312_000_000,
          digest: `sha256:${world.seeded.hash(`docker:${name}`)}`,
          last_updated: pushed(name),
          tag_last_pushed: pushed(name),
          tag_last_pulled: iso(
            world.now - world.seeded.int(`pulled:${name}`, 50) * 60_000,
          ),
          tag_status: 'active',
          images: [
            ...['amd64', 'arm64'].map((architecture) => ({
              architecture,
              os: 'linux',
              variant: null,
              size: name.endsWith('-full') ? 248_000_000 : 156_000_000,
            })),
            {
              architecture: 'unknown',
              os: 'unknown',
              variant: null,
              size: 14_000,
            },
          ],
        })),
      });
    }
    const repo = p.match(/^\/v2\/repositories\/([^/]+)\/([^/]+)\/?$/);
    if (!repo) return notFound();
    // A running total that keeps growing from day to day, so daily samples show pulls.
    const elapsed = (world.now - Date.parse('2026-10-01T00:00:00Z')) / DAY;
    return json({
      namespace: repo[1],
      name: repo[2],
      description:
        world.lang === 'zh'
          ? `${world.site.name} 演示镜像`
          : `${world.site.name} demo image`,
      pull_count: Math.round(world.packages.docker + elapsed * 2_150),
      star_count: 214,
      last_updated: versionTime(world, versions[1][1]),
      is_private: false,
    });
  }
  return undefined;
}
