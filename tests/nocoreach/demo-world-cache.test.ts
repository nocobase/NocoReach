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
const DAY = 24 * HOUR;
const { main } = demoContent('en-US').projects;
const project = () => ({ id: randomUUID(), ...main, language: 'en-US' });
const day = (ago: number) =>
  new Date(now - ago * DAY).toISOString().slice(0, 10);

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
    const others = Array.from({ length: 7 }, project);
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

  it('keeps the most recent month of daily visits', () => {
    const world = new World(project(), now);
    const first = world.visitsOn(day(1));
    expect(world.visitsOn(day(1))).toBe(first);
    for (let ago = 2; ago <= 31; ago++) world.visitsOn(day(ago));
    // Read again above, so 31 days later it is still the most recent of those retained.
    expect(world.visitsOn(day(1))).toBe(first);
    for (let ago = 32; ago <= 62; ago++) world.visitsOn(day(ago));
    const recomputed = world.visitsOn(day(1));
    expect(recomputed).not.toBe(first);
    expect(recomputed).toEqual(first);
  });

  it('answers a repeated GA4 report within the hour without recomputing it', async () => {
    const a = project();
    const property = worldGoogle(a, now).ga4PropertyId;
    const report = (body: unknown) =>
      worldResponse(
        a,
        `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
        { method: 'POST', body: JSON.stringify(body) },
        now,
      ).then((response) => response.json());
    const request = {
      dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }],
      metricAggregations: ['TOTAL'],
    };
    const visits = vi.spyOn(World.prototype, 'visitsOn');
    const first = await report(request);
    expect(first.rows).toHaveLength(90);
    const computed = visits.mock.calls.length;
    expect(computed).toBeGreaterThanOrEqual(90);

    expect(await report(request)).toEqual(first);
    expect(visits.mock.calls.length).toBe(computed);

    // A different request is its own answer.
    const pages = await report({
      ...request,
      dimensions: [{ name: 'pagePath' }],
    });
    expect(visits.mock.calls.length).toBeGreaterThan(computed);
    expect(pages.totals).toEqual(first.totals);
  });

  it('computes a large GA4 report once for all its pages and releases it after the last one', async () => {
    const a = project();
    const property = worldGoogle(a, now).ga4PropertyId;
    const report = (body: unknown) =>
      worldResponse(
        a,
        `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
        { method: 'POST', body: JSON.stringify(body) },
        now,
      ).then((response) => response.json());
    const request = {
      dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }],
      dimensions: [{ name: 'date' }, { name: 'pagePath' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    };
    const visits = vi.spyOn(World.prototype, 'visitsOn');
    const whole = await report({ ...request, limit: '100000' });
    const rowCount = Number(whole.rowCount);
    expect(rowCount).toBeGreaterThan(2_000);
    const computed = visits.mock.calls.length;

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
    expect(visits.mock.calls.length).toBe(computed * 2);
    expect(paged).toEqual(whole.rows);

    // The last page released it.
    await report({ ...request, limit: String(limit) });
    expect(visits.mock.calls.length).toBe(computed * 3);
  });
});
