// @vitest-environment node
import { expect, test } from 'vitest';
import { DemoProjects } from '../../server/nocoreach/demo-data/upstream';
import {
  invalidateWorlds,
  World,
  worldFor,
} from '../../server/nocoreach/demo-data/world/world';

const now = Date.parse('2026-10-29T08:00:00Z');
const project = {
  id: 'cache-test',
  name: 'Acme',
  domain: 'acme.example',
  language: 'en-US',
};

test('retiring and replacing projects releases their worlds without flushing other projects', async () => {
  const registry = new DemoProjects();
  registry.add(project);
  const first = worldFor(project, now);
  const other = { ...project, id: 'other-cache-test' };
  const unrelated = worldFor(other, now);
  registry.remove(project.id);
  expect(worldFor(other, now)).toBe(unrelated);
  expect(worldFor(project, now)).not.toBe(first);
  await expect(
    registry.worldRequest(project.id, 'https://acme.example/'),
  ).rejects.toMatchObject({ code: 'NR_DEMO_OFFLINE' });
  registry.add(project);
  const added = worldFor(project, now);
  registry.replace([]);
  expect(worldFor(project, now)).not.toBe(added);
  invalidateWorlds(project.id);
  invalidateWorlds(other.id);
});

test('recomputes evicted days identically and replaces expired project editions', () => {
  const world = new World(project, now);
  const first = world.visitsOn('2026-10-28');
  world.visitsOn('2026-10-27');
  const again = world.visitsOn('2026-10-28');
  expect(again).not.toBe(first);
  expect(again).toEqual(first);
  const before = worldFor(project, now);
  expect(worldFor(project, now + 1000)).toBe(before);
  const later = worldFor(project, now + 3600000);
  expect(later).not.toBe(before);
  expect(worldFor(project, now)).not.toBe(before);
  invalidateWorlds(project.id);
});

test('evicts the least recently read world without clearing all active worlds', () => {
  const projects = Array.from({ length: 9 }, (_, index) => ({
    ...project,
    id: `lru-${index}`,
  }));
  const first = worldFor(projects[0], now);
  const second = worldFor(projects[1], now);
  for (const item of projects.slice(2, 8)) worldFor(item, now);
  worldFor(projects[0], now);
  worldFor(projects[8], now);
  expect(worldFor(projects[0], now)).toBe(first);
  expect(worldFor(projects[1], now)).not.toBe(second);
  for (const item of projects) invalidateWorlds(item.id);
});
