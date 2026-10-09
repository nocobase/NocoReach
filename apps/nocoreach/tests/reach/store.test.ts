import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sqlite from '@nocobase/db-sqlite';
import { createDatabaseManager, type DatabaseManager } from '@nocobase/db';
import migration from '../../database/main/migrations/202610090001_create_nocoreach';
import { ReachStore } from '../../server/providers/reach/store.cjs';
import { Projects } from '../../server/providers/reach/domain/projects.cjs';
let database: DatabaseManager;
let store: InstanceType<typeof ReachStore>;
beforeEach(async () => {
  database = createDatabaseManager({
    connections: { main: sqlite({ filename: ':memory:' }) },
  });
  await database.connect();
  await migration.up({ builder: database.builder() } as never);
  store = new ReachStore(database, {}, {});
});
afterEach(async () => {
  await database.destroy();
});
describe('NocoReach native SQLite persistence', () => {
  it('creates isolated projects, rejects duplicate domains, and reads after writes', async () => {
    const projects = new Projects({ store });
    expect(await projects.list()).toEqual([]);
    const first = await projects.create({
      name: 'Test One',
      domain: 'one.example.com',
    });
    const second = await projects.create({
      name: 'Test Two',
      domain: 'two.example.com',
    });
    expect(first.id).not.toBe(second.id);
    expect(await projects.list()).toHaveLength(2);
    await expect(
      projects.create({ name: 'Duplicate', domain: 'one.example.com' }),
    ).rejects.toThrow('已有项目');
  });
  it('rolls back nested repository writes on transaction failure', async () => {
    const snapshots = store.repository('nrSnapshots');
    await expect(
      store.transaction(async () => {
        await snapshots.create({
          values: { key: 'transaction-test', payload: { x: 1 } },
        });
        throw Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      await snapshots.find({ filter: { key: 'transaction-test' } }),
    ).toEqual([]);
  });
  it('serializes simultaneous project creation', async () => {
    const projects = new Projects({ store });
    const rows = await Promise.all(
      ['one', 'two', 'three'].map((n) =>
        projects.create({ name: n, domain: `${n}.example.org` }),
      ),
    );
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
  });
});
