import { ApiError } from '@nocobase/app-server/router';
import type { NocoBaseDriveManager } from '@nocobase/drive';

import { PROJECT_TABLES, PROJECT_VARIABLES } from './clear.js';
import type { DemoHost } from './host.js';

/** Installation markers and global skill definitions are configuration, not project content. */
export const RETAINED_SNAPSHOTS = [
  'nr-migrations',
  'mock-demo',
  'nr-skill',
] as const;

const TERMINAL_RUNS = ['completed', 'failed', 'cancelled'];
const EXECUTION_TABLES = [
  'agConversationMessages',
  'agConversations',
  'agJobEvents',
  'agJobs',
  'agRunBriefs',
  'agRunEvents',
  'agRunInputs',
  'agRunRepos',
  'agRunTokens',
  'agRunUsage',
  'agRunRequests',
  'agSessions',
  'agWorkspaceResets',
  'agModelUsage',
  'agRuns',
] as const;

/**
 * Explicit demo-only instance cleanup. The lifecycle service checks demo mode and owns its durable lease.
 * Failed imports use clearProjects instead; they must never enter this function.
 */
export async function clearAllBusinessData(
  host: DemoHost,
  drive: NocoBaseDriveManager,
  clearCache: () => void,
): Promise<void> {
  const database = host.db.access!.database;
  const activeRun = await database
    .query()
    .selectFrom('agRuns')
    .select(['id'])
    .where('status', 'not in', TERMINAL_RUNS)
    .executeTakeFirst();
  const activeJob = await database
    .query()
    .selectFrom('agJobs')
    .select(['id'])
    .where('status', 'not in', TERMINAL_RUNS)
    .executeTakeFirst();
  const activeChat = await database
    .query()
    .selectFrom('nrOnlineAgentRecords')
    .select(['id'])
    .where('kind', '=', 'run')
    .where('status', 'in', ['queued', 'running'])
    .executeTakeFirst();
  if (
    activeRun ||
    activeJob ||
    activeChat ||
    host.sync.inFlight ||
    host.sync.freshFlights.size
  ) {
    throw new ApiError({
      status: 'FAILED_PRECONDITION',
      reason: 'DEMO_DATA_WORK_RUNNING',
      domain: 'nocoreach',
      message:
        'Stop active tasks and conversations before clearing application business data.',
    });
  }

  const projects = (await host.projects.all()) as { id: string | number }[];
  // Retiring a project makes queued outbound calls fail closed before they reach a real service.
  for (const project of projects) host.demoProjects.remove(String(project.id));

  // Keep metadata until its blob is removed, so partial filesystem failures remain retryable.
  for (const table of ['nrTaskMedia', 'agChatAttachments']) {
    const media = await database
      .query()
      .selectFrom(table)
      .select(['id', 'disk', 'key'])
      .execute<{ id: string; disk: string; key: string }>();
    for (const file of media) {
      await drive.use(file.disk).delete(file.key);
      await database
        .query()
        .deleteFrom(table)
        .where('id', '=', file.id)
        .execute();
    }
  }

  const variables = await database
    .query()
    .selectFrom('nrVariables')
    .select(['name'])
    .execute<{ name: string }>();
  for (const { name } of variables)
    if (PROJECT_VARIABLES.some((prefix) => name.startsWith(prefix)))
      await host.variables.set(name, null);

  // These are set-based deletions, including rows whose old project no longer exists.
  // Keep framework identities, global Agent/Runner/model/network configuration and migration history.
  await database.transaction(async (connection) => {
    for (const table of [...PROJECT_TABLES, 'nrProjectMembers'])
      await connection.query.deleteFrom(table).allowAllRows().execute();
    await connection.query
      .deleteFrom('nrOnlineAgentRecords')
      .where('kind', 'in', ['conversation', 'run'])
      .execute();
    for (const table of EXECUTION_TABLES)
      await connection.query.deleteFrom(table).allowAllRows().execute();
    let snapshots = connection.query.deleteFrom('nrSnapshots');
    for (const namespace of RETAINED_SNAPSHOTS)
      snapshots = snapshots
        .where('key', '!=', namespace)
        .where('key', 'not like', `${namespace}:%`);
    await snapshots.execute();
  });
  host.sync.resetCache();
  clearCache();
}
