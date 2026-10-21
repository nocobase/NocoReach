import type { DemoHost } from './host.js';

/** Tables of the classic layer that hold one project's rows in a `projectId` column. */
export const PROJECT_TABLES = [
  'nrTasks',
  'nrGoogleLinks',
  'nrSyncJobs',
  'nrSyncPartitions',
  'nrKeywordRuns',
  'nrKeywordCandidates',
  'nrYouTubeVideos',
] as const;

/** NocoBase 3 tables, outside the classic layer, with a `projectId` column. */
export const PROJECT_COLLECTIONS = ['nrProjectMembers', 'nrTaskMedia'] as const;

/**
 * Snapshot namespaces keyed `<namespace>:<project id>[:…]`. Only these are cleared with a demo project: a namespace
 * whose second segment is something else, such as a skill or run id, would otherwise lose another record that happens
 * to share the number. `tests/nocoreach/demo-data-app.test.ts` checks that an import leaves nothing outside the list.
 */
export const PROJECT_SNAPSHOTS = new Set([
  'project',
  'project-icon',
  'ai-questions',
  'ai-search',
  'analysis-rules',
  'automatic-content',
  'bilibili',
  'chat',
  'community',
  'competitor-research',
  'competitors',
  'daily-analysis',
  'demo-backup',
  'demo-edition',
  'ga4-reports',
  'github',
  'github-activity',
  'github-trends',
  'google-fresh',
  'gsc-reports',
  'gsc-sitemaps',
  'google-local-reports',
  'hackernews',
  'keyword-suggest',
  'keyword-tags',
  'knowledge',
  'knowledge-draft',
  'knowledge-item',
  'memory-updates',
  'mock-demo-knowledge',
  'nocoreach-knowledge',
  'nocoreach-memory',
  'nocoreach-strategy',
  'nocoreach-taskno',
  'nr-analysis',
  'nr-analysis-rules',
  'nr-playbooks',
  'nr-site-preview',
  'nr-skills-enabled',
  'nr-source-preview',
  'nr-task',
  'nr-task-agent',
  'nr-task-article',
  'nr-task-artifact',
  'nr-task-board',
  'nr-task-content',
  'nr-task-content-create',
  'nr-task-draft',
  'nr-task-legacy',
  'nr-task-op',
  'nr-task-plan',
  'nr-task-review',
  'nr-task-result',
  'nr-task-run',
  'nr-task-sources',
  'packages',
  'rank-tracking',
  'reddit',
  'search-index',
  'signals',
  'site-content',
  'sources',
  'strategy',
  'task-numbers',
  'trends',
  'x',
  'xiaohongshu',
  'youtube',
]);

/** Sealed settings named `<prefix><project id>`. */
export const PROJECT_VARIABLES = [
  'NOREACH_ARTICLE_TARGETS_',
  'NOREACH_DATAFORSEO_',
  'NOREACH_DISCORD_TOKEN_',
  'NOREACH_GITHUB_TOKEN_',
  'NOREACH_GOOGLE_REFRESH_',
  'NOREACH_SLACK_TOKEN_',
  'NOREACH_X_TOKEN_',
  'NOREACH_COLLECTOR_bilibili_',
  'NOREACH_COLLECTOR_xiaohongshu_',
  'NOREACH_COLLECTOR_youtube_',
] as const;

export const isProjectSnapshot = (key: string, id: string): boolean => {
  const [namespace, project] = key.split(':');
  return project === id && PROJECT_SNAPSHOTS.has(namespace);
};

/**
 * Deletes everything a demo project holds, whoever added it — the import, or visitors working in the demo since. The
 * project's own record goes last, so a clear that stops halfway can run again and find the project.
 */
export async function clearProjects(
  host: DemoHost,
  ids: readonly string[],
): Promise<void> {
  if (!ids.length) return;
  for (const id of ids) host.demoProjects.remove(id);
  const repo = host.db.getRepository('nrSnapshots');
  await host.db.sequelize.transaction(async (transaction: unknown) => {
    for (const table of PROJECT_TABLES)
      await host.db
        .getRepository(table)
        .destroy({ filter: { projectId: { $in: [...ids] } }, transaction });
    const doomed: { id: unknown; key: unknown }[] = [];
    for (const id of ids)
      for (const pattern of [`%:${id}`, `%:${id}:%`])
        for (const row of (await repo.find({
          filter: { key: { $like: pattern } },
          transaction,
        })) as unknown as {
          id: unknown;
          key: unknown;
        }[])
          if (
            isProjectSnapshot(String(row.key), id) &&
            !doomed.some((seen) => seen.id === row.id)
          )
            doomed.push(row);
    const projectRows = doomed.filter((row) =>
      String(row.key).startsWith('project:'),
    );
    for (const row of [
      ...doomed.filter((row) => !projectRows.includes(row)),
      ...projectRows,
    ])
      await repo.destroy({ filterByTk: row.id, transaction });
  });
  // After the classic transaction: SQLite has one connection, which that transaction holds while it runs.
  const database = host.db.access!.database;
  for (const collection of PROJECT_COLLECTIONS)
    await database
      .query()
      .deleteFrom(collection)
      .where('projectId', 'in', [...ids])
      .execute();
  // Conversations and turns store the project in their JSON payload, not a projectId column. Keep global Agent
  // definitions and other projects' conversations. A running turn uses revision-checked updates and cannot recreate
  // its row after deletion.
  const online = database.connection().repository<{
    id: string;
    kind: string;
    payload: string;
  }>('nrOnlineAgentRecords');
  for (const kind of ['conversation', 'run']) {
    // Materialize the read before deleting: a streaming iterator holds SQLite's only connection.
    const rows = await online.findMany({ filter: { kind } });
    for (const row of rows) {
      const payload = JSON.parse(row.payload) as { projectId?: string | null };
      if (payload.projectId && ids.includes(String(payload.projectId)))
        await online.deleteMany({ filter: { id: row.id, kind: row.kind } });
    }
  }
  for (const id of ids)
    for (const prefix of PROJECT_VARIABLES)
      if (
        host.variables.get(`${prefix}${id}`) !== undefined ||
        host.variables.cannotRead(`${prefix}${id}`)
      )
        await host.variables.set(`${prefix}${id}`, null);
}
