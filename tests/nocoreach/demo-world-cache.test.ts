// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoContent } from '../../server/nocoreach/demo-data/content';
import { DemoProjects } from '../../server/nocoreach/demo-data/upstream';
import {
  worldGoogle,
  worldResponse,
} from '../../server/nocoreach/demo-data/world';
import {
  World,
  invalidateWorlds,
  worldFor,
} from '../../server/nocoreach/demo-data/world/world';

const now = Date.parse('2026-10-28T12:00:00Z');
const HOUR = 3_600_000;
const { main, second } = demoContent('en-US').projects;
const project = (site = main) => ({
  id: randomUUID(),
  ...site,
  language: 'en-US',
});
const ga4 = (a: ReturnType<typeof project>) => {
  const property = worldGoogle(a, now).ga4PropertyId;
  return (body: unknown) =>
    worldResponse(
      a,
      `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
      { method: 'POST', body: JSON.stringify(body) },
      now,
    ).then((response) => response.json());
};

afterEach(() => vi.restoreAllMocks());

describe('demo world caches', () => {
  it('shares one world per project and hour and retires it on demand', () => {
    const a = project();
    const world = worldFor(a, now);
    expect(worldFor(a, now + 60_000)).toBe(world);
    expect(world.now).toBe(now + 60_000);

    // The next hour replaces the project's edition.
    const next = worldFor(a, now + HOUR);
    expect(next).not.toBe(world);
    expect(worldFor(a, now + HOUR)).toBe(next);

    invalidateWorlds(a.id);
    expect(worldFor(a, now + HOUR)).not.toBe(next);
  });

  it('evicts the least recently used project, not every project', () => {
    const kept = project();
    const first = worldFor(kept, now);
    const others = Array.from({ length: 7 }, () => project());
    const evicted = worldFor(others[0], now);
    for (const other of others.slice(1)) worldFor(other, now);
    // A hit moves the world to the newest end, so the next project evicts the oldest other one.
    expect(worldFor(kept, now)).toBe(first);
    worldFor(project(), now);
    expect(worldFor(kept, now)).toBe(first);
    expect(worldFor(others[0], now)).not.toBe(evicted);
  });

  it('retires worlds when demo projects are added, replaced or removed', () => {
    const projects = new DemoProjects();
    const [a, b] = [project(), project()];
    const before = worldFor(a, now);
    projects.add(a);
    const added = worldFor(a, now);
    expect(added).not.toBe(before);

    const other = worldFor(b, now);
    projects.replace([b]);
    expect(worldFor(a, now)).not.toBe(added);
    expect(worldFor(b, now)).not.toBe(other);

    const replaced = worldFor(b, now);
    projects.remove(b.id);
    expect(worldFor(b, now)).not.toBe(replaced);
  });

  it('keeps two years of drawn visits by date, so a long report does not evict recent days', async () => {
    const report = ga4(project(second));
    const allocated = vi.spyOn(World.prototype, 'visitsOn');
    const recent = {
      dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }],
    };
    const first = await report(recent);
    expect(allocated).toHaveBeenCalledTimes(28);

    // A comparison reaching past the kept history allocates each day it has not kept, then the recent month is
    // still kept for another report.
    await report({
      dateRanges: [
        { startDate: '400daysAgo', endDate: 'yesterday', name: 'current' },
        { startDate: '800daysAgo', endDate: '401daysAgo', name: 'previous' },
      ],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'sessions' }],
    });
    expect(allocated).toHaveBeenCalledTimes(800);
    const countries = await report({
      ...recent,
      dimensions: [{ name: 'country' }],
      metricAggregations: ['TOTAL'],
    });
    expect(allocated).toHaveBeenCalledTimes(800);
    expect(countries.totals[0].metricValues[0].value).toBe(
      String(
        first.rows.reduce(
          (sum: number, row: { metricValues: { value: string }[] }) =>
            sum + Number(row.metricValues[0].value),
          0,
        ),
      ),
    );

    // Older than two years, a day is allocated again on each read.
    await report({
      ...recent,
      dateRanges: [{ startDate: '790daysAgo', endDate: '781daysAgo' }],
    });
    expect(allocated).toHaveBeenCalledTimes(810);
  });

  it('answers a repeated GA4 report within the hour without recomputing it', async () => {
    const report = ga4(project());
    const request = {
      dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }],
      metricAggregations: ['TOTAL'],
    };
    const days = vi.spyOn(World.prototype, 'daily');
    const first = await report(request);
    expect(first.rows).toHaveLength(90);
    const computed = days.mock.calls.length;
    expect(computed).toBeGreaterThanOrEqual(90);

    expect(await report(request)).toEqual(first);
    expect(days.mock.calls.length).toBe(computed);

    // A different request is its own answer.
    const pages = await report({
      ...request,
      dimensions: [{ name: 'pagePath' }],
    });
    expect(days.mock.calls.length).toBeGreaterThan(computed);
    expect(pages.totals).toEqual(first.totals);
  });

  it('computes a large GA4 report once for all its pages and releases it after the last one', async () => {
    const report = ga4(project());
    const request = {
      dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }],
      dimensions: [{ name: 'date' }, { name: 'pagePath' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    };
    const days = vi.spyOn(World.prototype, 'daily');
    const whole = await report({ ...request, limit: '100000' });
    const rowCount = Number(whole.rowCount);
    expect(rowCount).toBeGreaterThan(2_000);
    const computed = days.mock.calls.length;

    const limit = Math.ceil(rowCount / 3);
    const paged = [];
    for (let offset = 0; offset < rowCount; offset += limit) {
      const page = await report({
        ...request,
        limit: String(limit),
        offset: String(offset),
      });
      expect(Number(page.rowCount)).toBe(rowCount);
      paged.push(...page.rows);
    }
    // The first request read the whole table, so it was released; the pages compute it once more.
    expect(days.mock.calls.length).toBe(computed * 2);
    expect(paged).toEqual(whole.rows);

    // The last page released it.
    await report({ ...request, limit: String(limit) });
    expect(days.mock.calls.length).toBe(computed * 3);
  });
});
