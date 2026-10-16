// @vitest-environment node
import { createMigrator } from '@nocobase/db';
import { createTestDatabase } from '@nocobase/app-testing/server';
import {
  AGENTS_MIGRATIONS,
  AGENTS_PACKAGE,
} from '@nocobase/app-plugin-agents/testing';
import { expect, it } from 'vitest';

it('retires configured agents without losing run history and does not restore them on rollback', async () => {
  const testDb = await createTestDatabase();
  try {
    const { connection, database } = testDb;
    const migrator = createMigrator({
      database,
      directory: AGENTS_MIGRATIONS,
      packageName: AGENTS_PACKAGE,
    });
    await migrator.upTo('202610110001_ag_add_fresh_sessions');
    const now = new Date().toISOString();
    for (const type of ['online', 'runner']) {
      await connection.query
        .insertInto('agAgents')
        .values({
          id: `old-${type}`,
          name: `Old ${type}`,
          type,
          ownerUserId: 'owner',
          access: 'everyone',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
      for (const status of ['queued', 'completed'])
        await connection.query
          .insertInto('agRuns')
          .values({
            id: `${type}-${status}`,
            agentId: `old-${type}`,
            agentType: type,
            status,
            subjectKind: 'nocoreachTask',
            subjectId: `project:task:${status}`,
            threadScope: 'default',
            actorUserId: 'owner',
            summary: status === 'completed' ? 'Historical result' : null,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
    }
    await migrator.upTo('202610240020_ag_runner_agents');
    const agents = await connection.query
      .selectFrom('agAgents')
      .selectAll()
      .execute();
    expect(agents).toHaveLength(2);
    for (const agent of agents) {
      expect(agent.status).toBe('disabled');
      expect(agent.deletedAt).toBeTruthy();
    }
    const runs = await connection.query
      .selectFrom('agRuns')
      .selectAll()
      .execute();
    expect(runs.filter((run) => run.status === 'cancelled')).toHaveLength(2);
    expect(
      runs
        .filter((run) => run.status === 'completed')
        .map((run) => run.summary),
    ).toEqual(['Historical result', 'Historical result']);
    // A package downgrade cannot undo the data migration; deployment rollback needs its database backup.
    await migrator.rollback();
    expect(
      (
        await connection.query.selectFrom('agAgents').selectAll().execute()
      ).every((agent) => agent.archivedAt),
    ).toBe(true);
    expect(
      (
        await connection.query.selectFrom('agRuns').selectAll().execute()
      ).filter((run) => run.status === 'cancelled'),
    ).toHaveLength(2);
  } finally {
    await testDb.destroy();
  }
});
