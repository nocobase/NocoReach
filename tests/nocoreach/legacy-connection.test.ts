// @vitest-environment node
import { fileURLToPath } from 'node:url';

import { createTestDatabase } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import { expect, it, onTestFinished, vi } from 'vitest';

import { LegacyDatabase } from '../../server/nocoreach/legacy/database.js';

async function fixture() {
  const testDb = await createTestDatabase({
    migrations: [
      {
        packageName: 'nocoreach',
        directory: fileURLToPath(
          new URL('../../database/main/migrations', import.meta.url),
        ),
      },
    ],
  });
  onTestFinished(() => testDb.destroy());
  const legacy = new LegacyDatabase(
    testDb.database,
    new SnowflakeIdGenerator({ workerId: 0 }),
  );
  return { ...testDb, legacy };
}

const lock = "SELECT pg_advisory_xact_lock(hashtext('bridge-test'))";
const tryLock = "SELECT pg_try_advisory_xact_lock(hashtext('bridge-test'))";

it('gives a root connection real rollback semantics and releases its acquired locks', async () => {
  const f = await fixture();
  const committed = vi.fn();
  await expect(
    f.legacy.withConnection(f.connection, () =>
      f.legacy.sequelize.transaction(async (transaction) => {
        await f.legacy.sequelize.query(lock, { transaction });
        await f.legacy.getRepository('nrSnapshots').create({
          values: { key: 'bridge-test:root', payload: { created: true } },
          transaction,
        });
        transaction.afterCommit(committed);
        throw new Error('Business write failed');
      }),
    ),
  ).rejects.toThrow('Business write failed');

  expect(await f.database.repository('nrSnapshots').count()).toBe(0);
  expect(committed).not.toHaveBeenCalled();
  expect(await f.legacy.sequelize.query(tryLock)).toEqual([[{ locked: true }]]);
});

it('keeps locks and callbacks attached to an external outer transaction after the bridge callback returns', async () => {
  const f = await fixture();
  const committed = vi.fn();
  await f.database.transaction(async (connection) => {
    await f.legacy.withConnection(connection, () =>
      f.legacy.sequelize.transaction(async (transaction) => {
        await f.legacy.sequelize.query(lock, { transaction });
        await f.legacy.getRepository('nrSnapshots').create({
          values: { key: 'bridge-test:outer', payload: { created: true } },
          transaction,
        });
        transaction.afterCommit(committed);
      }),
    );

    expect(committed).not.toHaveBeenCalled();
    expect(await f.legacy.sequelize.query(tryLock)).toEqual([
      [{ locked: false }],
    ]);
    expect(await connection.repository('nrSnapshots').count()).toBe(1);
  });

  expect(committed).toHaveBeenCalledTimes(1);
  expect(await f.database.repository('nrSnapshots').count()).toBe(1);
  expect(await f.legacy.sequelize.query(tryLock)).toEqual([[{ locked: true }]]);
});

it('rolls back a failed bridge savepoint and releases its locks while allowing the outer transaction to continue', async () => {
  const f = await fixture();
  const committed = vi.fn();
  await f.database.transaction(async (connection) => {
    await expect(
      f.legacy.withConnection(connection, () =>
        f.legacy.sequelize.transaction(async (transaction) => {
          await f.legacy.sequelize.query(lock, { transaction });
          await f.legacy.getRepository('nrSnapshots').create({
            values: {
              key: 'bridge-test:savepoint',
              payload: { created: true },
            },
            transaction,
          });
          transaction.afterCommit(committed);
          throw new Error('Savepoint failed');
        }),
      ),
    ).rejects.toThrow('Savepoint failed');

    expect(await connection.repository('nrSnapshots').count()).toBe(0);
    expect(await f.legacy.sequelize.query(tryLock)).toEqual([
      [{ locked: true }],
    ]);
    await connection.repository('nrSnapshots').createOne({
      values: {
        id: '1',
        key: 'bridge-test:surviving-outer',
        payload: { survived: true },
      },
    });
  });

  expect(committed).not.toHaveBeenCalled();
  expect(await f.database.repository('nrSnapshots').count()).toBe(1);
});

it('re-enters a task lock across separate callbacks of the same external transaction', async () => {
  const f = await fixture();
  let second: Promise<void> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await f.database.transaction(async (connection) => {
      const acquire = () =>
        f.legacy.withConnection(connection, async () => {
          await f.legacy.sequelize.query(lock);
        });
      await acquire();
      second = acquire();
      const completed = await Promise.race([
        second.then(() => true),
        new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), 500);
        }),
      ]);
      expect(completed).toBe(true);
      expect(await f.legacy.sequelize.query(tryLock)).toEqual([
        [{ locked: false }],
      ]);
    });
  } finally {
    clearTimeout(timeout);
    // If the regression returns, the outer rollback releases the first lock
    // and lets the pending callback finish before fixture cleanup.
    await second?.catch(() => undefined);
  }
  expect(await f.legacy.sequelize.query(tryLock)).toEqual([[{ locked: true }]]);
});
