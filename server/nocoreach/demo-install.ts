import { installDemoOpportunities } from './demo-opportunities.js';
import { MOCK_DATASET_MARKER } from '../../app-plugins/nocoreach-mock/server/engine.js';
import type { LegacyVariables } from './legacy/variables.js';
import type { LegacyApp } from './legacy/app.js';
import type { Connections } from './plugin.js';
import type { LegacyDatabase, LegacyRecord } from './legacy/database.js';
import { projectWork, type Artifact } from './execution/model.js';
import { windows, type EffectResult } from './execution/effect.js';
import { DEMO_DOCUMENTS, DEMO_PRODUCT, DEMO_STORIES } from './demo-content.js';

export const DEMO_EDITION = 'nocobase-editorial-v1';
export const demoEditionKey = (id: string) =>
  `demo-edition:${id}:${DEMO_EDITION}`;
type Host = Connections & {
  db: LegacyDatabase;
  variables: LegacyVariables;
  app: LegacyApp;
};
const DAY = 86400000;
const NOTICE =
  '> 人工编写的虚构演示资料；人物、讨论、指标和历史成果不代表真实客户、Agent 执行或线上发布。\n\n';

// Only known project-owned business snapshots; never credentials, official runs or global settings.
const SNAPSHOTS = new Set([
  'project',
  'site-content',
  'github',
  'github-activity',
  'community',
  'packages',
  'hackernews',
  'x',
  'chat',
  'youtube',
  'bilibili',
  'xiaohongshu',
  'reddit',
  'trends',
  'competitors',
  'competitor-research',
  'ai-search',
  'ai-questions',
  'rank-tracking',
  'strategy',
  'daily-analysis',
  'google-fresh',
  'ga4-reports',
  'knowledge',
  'knowledge-item',
  'nr-task-agent',
]);
function rename(value: unknown): unknown {
  if (typeof value === 'string')
    return value
      .replaceAll('NocoBloom 演示项目', DEMO_PRODUCT.domain)
      .replaceAll('NocoBloom', DEMO_PRODUCT.name)
      .replaceAll('nocobloom.example', DEMO_PRODUCT.domain)
      .replaceAll('nocobloom/nocobloom', DEMO_PRODUCT.repository)
      .replaceAll('@nocobloom/core', DEMO_PRODUCT.npm);
  if (Array.isArray(value)) return value.map(rename);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, rename(entry)]),
    );
  return value;
}

/** Startup-only, atomic installation. This is deliberately unavailable to HTTP callers. */
export async function installEditorialDemo(
  host: Connections,
  id: string,
  clock: string,
) {
  const p = host as Host;
  // The stricter demo-only gate deliberately leaves test and live deployments alone.
  if (!p.mock?.enabled || p.mock.environment !== 'demo') return;
  if (!p.variables.all()[MOCK_DATASET_MARKER])
    throw new Error('NR_DEMO_DATASET_REQUIRED');
  const repo = p.db.getRepository('nrSnapshots');
  await p.db.sequelize.transaction(async (transaction) => {
    if (
      await repo.findOne({ filter: { key: demoEditionKey(id) }, transaction })
    ) {
      const tasks = await p.db.getRepository('nrTasks').find({
        filter: {
          projectId: id,
          taskKey: { $startsWith: `${DEMO_EDITION}:${id}:` },
        },
        transaction,
      });
      const project = (
        await repo.findOne({ filter: { key: `project:${id}` }, transaction })
      )?.get('payload') as { name?: string; domains?: string[] } | undefined;
      transaction.afterCommit(() =>
        p.app.logger.info('Verified editorial demo dataset', {
          projectId: id,
          edition: DEMO_EDITION,
          projectName: project?.name,
          domains: project?.domains,
          tasks: tasks.length,
          boardStates: [
            ...new Set(
              tasks.map((task) => projectWork(task.toJSON()).boardState),
            ),
          ],
        }),
      );
      return;
    }
    const owner = await repo.findOne({
      filter: { key: 'mock-demo:v1' },
      transaction,
    });
    if (
      String(
        (owner?.get('payload') as { projectId?: unknown } | undefined)
          ?.projectId,
      ) !== id
    )
      throw new Error('NR_DEMO_PROJECT_MISMATCH');
    const project = await repo.findOne({
      filter: { key: `project:${id}` },
      transaction,
    });
    const domains = (
      project?.get('payload') as { domains?: unknown } | undefined
    )?.domains;
    if (
      !Array.isArray(domains) ||
      domains.length !== 1 ||
      !['nocobloom.example', DEMO_PRODUCT.domain].includes(String(domains[0]))
    )
      throw new Error('NR_DEMO_PROJECT_CUSTOMIZED');
    // Never rewrite an in-flight task or its captured upstream identity during an upgrade.
    const activeJobs = await p.db.getRepository('nrSyncJobs').find({
      filter: {
        projectId: id,
        status: { $in: ['pending', 'queued', 'running'] },
      },
      transaction,
    });
    const runs = await repo.find({
      filter: { key: { $startsWith: `nr-task-run:${id}:` } },
      transaction,
    });
    if (
      activeJobs.length ||
      runs.some((row) =>
        ['queued', 'running'].includes(
          String(
            (row.get('payload') as { status?: unknown } | undefined)?.status,
          ),
        ),
      )
    )
      throw new Error('NR_DEMO_ACTIVE_WORK');

    const backup = async (table: string, row: LegacyRecord) => {
      const key = `demo-backup:${id}:${DEMO_EDITION}:${table}:${String(row.id)}`;
      if (await repo.findOne({ filter: { key }, transaction })) return;
      await repo.create({
        values: {
          key: `demo-backup:${id}:${DEMO_EDITION}:${table}:${String(row.id)}`,
          payload: { table, row: row.toJSON(), edition: DEMO_EDITION },
        },
        transaction,
      });
    };
    let renamed = 0;
    for (const row of await repo.find({ transaction })) {
      const [namespace, projectId] = String(row.key).split(':');
      if (projectId !== id || !SNAPSHOTS.has(namespace)) continue;
      const before: unknown = row.get('payload');
      const after = rename(before);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      await backup('nrSnapshots', row);
      await repo.update({
        filterByTk: row.id,
        values: { payload: after },
        transaction,
      });
      renamed++;
    }
    for (const table of [
      'nrGoogleLinks',
      'nrSyncPartitions',
      'nrKeywordRuns',
      'nrKeywordCandidates',
      'nrYouTubeVideos',
    ]) {
      for (const row of await p.db
        .getRepository(table)
        .find({ filter: { projectId: id }, transaction })) {
        const before = row.toJSON();
        const after = rename(before) as Record<string, unknown>;
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        await backup(table, row);
        const {
          id: _rowId,
          createdAt: _created,
          updatedAt: _updated,
          ...values
        } = after;
        await p.db
          .getRepository(table)
          .update({ filterByTk: row.id, values, transaction });
        renamed++;
      }
    }
    // Retain edited legacy examples. Untouched repetitive fixtures leave the active board, but remain recoverable.
    let archived = 0;
    for (const row of await p.db
      .getRepository('nrTasks')
      .find({ filter: { projectId: id }, transaction })) {
      const work = projectWork(row.toJSON());
      const evidence = row.get('evidence') as
        Record<string, unknown> | undefined;
      if (
        !String(row.taskKey).startsWith(`mock-demo:${id}:`) ||
        !evidence?.simulated ||
        work.revision !== 0 ||
        work.archivedAt ||
        work.cancelledAt ||
        work.latestRun ||
        work.humanOwnerId
      )
        continue;
      await backup('nrTasks', row);
      work.archivedAt = clock;
      work.archivedBy = 'demo-editor';
      work.revision++;
      await p.db.getRepository('nrTasks').update({
        filterByTk: row.id,
        values: { evidence: { ...evidence, work } },
        transaction,
      });
      archived++;
    }
    const at = (days: number, hours = 0) =>
      new Date(Date.parse(clock) - days * DAY + hours * 3600000).toISOString();
    for (const [index, story] of DEMO_STORIES.entries()) {
      const work = projectWork({});
      const createdAt = at(45 - index);
      Object.assign(work, {
        kind: story.kind,
        simple: story.state === 'todo',
        boardState: story.state,
        stage:
          story.state === 'done'
            ? 'done'
            : story.state === 'todo'
              ? 'plan'
              : 'flow',
        page: { url: DEMO_PRODUCT.origin + story.path, title: story.title },
        note: '人工编写的演示情景。未指派真实 Agent，未执行模型、Runner 或对外发布。',
      });
      if (story.state !== 'todo') {
        work.flow = {
          id: `editorial-${story.kind}`,
          name:
            story.kind === 'content'
              ? '内容起草与人工复核'
              : '问题研究与人工复核',
          version: 1,
          stages: [
            {
              key: 'draft',
              name: story.kind === 'content' ? '准备内容稿' : '整理研究资料',
              kind: 'agent',
              mode: 'analyze',
              instruction: story.brief,
            },
            {
              key: 'review',
              name: '核对事实与适用边界',
              kind: 'review',
              checklist: [
                {
                  key: 'facts',
                  label: '核对引用、权限与不确定项',
                  required: true,
                },
              ],
            },
          ],
        };
        work.stageIndex = story.state === 'doing' ? 0 : 1;
      }
      work.history = story.comments.map((comment, i) => ({
        at: at(44 - index, i + 1),
        actor: 'demo-editor',
        actorName: `${comment.split('：')[0]}（虚构）`,
        action: 'comment',
        comment: comment.split('：').slice(1).join('：'),
      }));
      if (story.draft) {
        const artifact: Artifact = {
          id: `editorial-${story.key}`,
          planVersion: 0,
          stepId: 'draft',
          version: 1,
          createdAt: at(43 - index),
          createdBy: 'demo-editor',
          manual: true,
          content: NOTICE + story.draft,
          report: {
            kind: story.kind,
            sources: [
              { title: '演示项目页面', url: DEMO_PRODUCT.origin + story.path },
            ],
            asOf: clock,
            uncertainties: [
              '全部资料为手工编写的合成样例，未验证真实产品或流量。',
            ],
          },
          ...(story.rejected ? { rejectedAt: at(42 - index) } : {}),
        };
        work.results = [artifact];
      }
      if (story.cancelled) {
        work.cancelledAt = at(42 - index);
        work.cancelledBy = 'demo-editor';
      }
      if (story.archived) {
        work.archivedAt = at(42 - index);
        work.archivedBy = 'demo-editor';
      }
      if (story.outcome) {
        // Historical, manual teaching snapshots: never a live release or scheduled observation.
        work.observeFrom = at(story.outcome === 'waiting' ? 2 : 12).slice(
          0,
          10,
        );
        if (story.outcome !== 'waiting') {
          const pairs = {
            up: [126, 181],
            down: [164, 119],
            flat: [98, 102],
            insufficient: [12, 7],
          } as const;
          const [before, after] = pairs[story.outcome];
          const impressions: [number, number] =
            story.outcome === 'down' ? [4200, 4850] : [3600, 4100];
          const result: EffectResult = {
            day: 7,
            ...windows(work.observeFrom, 7),
            pages: [DEMO_PRODUCT.origin + story.path],
            primary: 'clicks',
            conclusion: story.outcome,
            change:
              story.outcome === 'insufficient'
                ? null
                : Math.round(((after - before) / before) * 1000) / 1000,
            gsc: {
              clicks: [before, after],
              impressions,
              ctr: [
                (before / impressions[0]) * 100,
                (after / impressions[1]) * 100,
              ],
              position: [9.8, 9.4],
            },
            coverage: {
              gsc: {
                baselineDays: 7,
                afterDays: story.outcome === 'insufficient' ? 3 : 7,
              },
              ga4: { baselineDays: 0, afterDays: 0 },
            },
            computedAt: at(4),
            notes: [
              '人工编写的历史观察样例，不是实际发布效果，不据此推断因果。',
            ],
          };
          work.observation = { results: [result] };
        }
      }
      const row = await p.db.getRepository('nrTasks').create({
        values: {
          projectId: id,
          taskKey: `${DEMO_EDITION}:${id}:${story.key}`,
          title: story.title,
          brief: `${NOTICE}${story.brief}`,
          status: {
            todo: '待处理',
            doing: '进行中',
            review: '待确认',
            done: '已完成',
          }[story.state],
          evidence: { simulated: true, demoEdition: DEMO_EDITION, work },
          createdAt,
          updatedAt: at(1, -index),
        },
        transaction,
      });
      for (const artifact of work.results)
        if (artifact)
          await repo.create({
            values: {
              key: `nr-task-artifact:${id}:${String(row.id)}:${artifact.id}`,
              payload: artifact,
            },
            transaction,
          });
    }
    const knowledgeRow = await repo.findOne({
      filter: { key: `knowledge:${id}` },
      transaction,
    });
    const knowledge = (knowledgeRow?.get('payload') as
      { revision: number; items: Record<string, unknown>[] } | undefined) || {
      revision: 0,
      items: [],
    };
    if (knowledgeRow) await backup('nrSnapshots', knowledgeRow);
    for (const doc of DEMO_DOCUMENTS) {
      const text = NOTICE + doc.text;
      const itemId = `editorial-${doc.key}`;
      await repo.create({
        values: { key: `knowledge-item:${id}:${itemId}`, payload: { text } },
        transaction,
      });
      knowledge.items.push({
        id: itemId,
        title: doc.title,
        category: doc.category,
        kind: 'text',
        chars: text.length,
        summary: doc.text.replace(/\s+/g, ' ').slice(0, 120),
        addedAt: clock,
        addedBy: 'demo-editor',
      });
    }
    knowledge.revision++;
    if (knowledgeRow)
      await repo.update({
        filterByTk: knowledgeRow.id,
        values: { payload: knowledge },
        transaction,
      });
    else
      await repo.create({
        values: { key: `knowledge:${id}`, payload: knowledge },
        transaction,
      });
    await repo.create({
      values: {
        key: demoEditionKey(id),
        payload: {
          version: 1,
          projectId: id,
          domain: DEMO_PRODUCT.domain,
          edition: DEMO_EDITION,
          installedAt: new Date().toISOString(),
          clock,
          tasks: DEMO_STORIES.length,
          documents: DEMO_DOCUMENTS.length,
          renamed,
          archived,
        },
      },
      transaction,
    });
    transaction.afterCommit(() =>
      p.app.logger.info('Installed editorial demo dataset', {
        projectId: id,
        edition: DEMO_EDITION,
        tasks: DEMO_STORIES.length,
        documents: DEMO_DOCUMENTS.length,
        renamed,
        archived,
      }),
    );
  });
  await installDemoOpportunities(host, id);
}
