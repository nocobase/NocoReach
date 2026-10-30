import { randomUUID } from 'node:crypto';

import type {
  DemoImportContext,
  DemoStep,
} from '@nocobase/app-plugin-demo-mode/server/tokens';

import {
  completedAgo as storyCompletedAgo,
  type DemoTaskStory,
} from './editorial.js';
import { historyBounds } from '../search-history.js';
import { DomainService } from '../domain-service.js';
import { Lighthouse } from '../lighthouse.js';
import { secretKey } from '../policy.js';
import { projectWork, type Artifact } from '../execution/model.js';
import { compare, type Partition } from '../execution/effect.js';
import { opportunityHistory } from './opportunities.js';
import { taskHistory } from './task-history.js';
import { BUSINESS_MEMBER } from '../../access/service.js';
import type { RoleAccess } from '../../../shared/access-capabilities.js';
import {
  CAPABILITIES,
  siteCapability,
} from '../../../shared/access-capabilities.js';
import {
  commentAuthor,
  demoContent,
  type DemoContent,
  type DemoPerson,
} from './content.js';
import { writeActivity } from './activity.js';
import type { DemoHost } from './host.js';
import {
  COLLECTOR_TOKEN,
  collectorUrl,
  followedVideos,
} from './world/index.js';

const DAY = 86_400_000;

/** What the import records about itself, for later steps and for clearing. */
export interface DemoData {
  projects?: { main: string; second: string };
  people?: Partial<Record<DemoPerson, string>>;
  skipped?: string[];
}

const data = (context: DemoImportContext) => context.data as DemoData;

const ROLE_KEYS = {
  growth: 'nr.demo-growth',
  editor: 'nr.demo-editor',
  community: 'nr.demo-community',
  viewer: 'nr.demo-viewer',
} as const;

const ROLES: Record<keyof typeof ROLE_KEYS, RoleAccess> = {
  // Demo passwords are public: even the growth lead is restricted to the demo projects they joined.
  growth: {
    scope: 'member',
    capabilities: CAPABILITIES.filter(
      (capability) =>
        !['app.members', 'app.keys', 'app.settings'].includes(capability),
    ),
  },
  editor: {
    scope: 'member',
    capabilities: [
      'view',
      'analyze',
      'tasks',
      'knowledge',
      ...(
        [
          'google',
          'website',
          'keywords',
          'competitors',
          'community',
          'web',
        ] as const
      ).map(siteCapability),
    ],
  },
  community: {
    scope: 'member',
    capabilities: [
      'view',
      'tasks',
      ...(
        [
          'github',
          'community',
          'packages',
          'hackernews',
          'reddit',
          'x',
          'chat',
          'youtube',
          'bilibili',
          'xiaohongshu',
        ] as const
      ).map(siteCapability),
    ],
  },
  viewer: { scope: 'member', capabilities: ['view'] },
};

/** Who signs in, with which roles, and which demo projects they belong to. */
const PEOPLE: readonly {
  person: DemoPerson;
  roles: readonly string[];
  projects: readonly ('main' | 'second')[];
}[] = [
  { person: 'growth', roles: [ROLE_KEYS.growth], projects: ['main', 'second'] },
  { person: 'editor', roles: [ROLE_KEYS.editor], projects: ['main', 'second'] },
  { person: 'content', roles: [BUSINESS_MEMBER], projects: ['main', 'second'] },
  { person: 'devrel', roles: [ROLE_KEYS.community], projects: ['main'] },
  { person: 'consultant', roles: [ROLE_KEYS.viewer], projects: ['main'] },
];

const demoPassword = (username: string) => `${username}123`;

export const demoEmail = (username: string) => `${username}@acme.example`;

/** The accounts the demo page lists before and after an import. */
export function demoAccounts(language: string) {
  const content = demoContent(language);
  return PEOPLE.map(({ person }) => ({
    username: content.people[person].username,
    name: content.people[person].name,
    role: content.people[person].title,
    password: demoPassword(content.people[person].username),
  }));
}

export function demoSteps(host: DemoHost, language: string): DemoStep[] {
  const content = demoContent(language);
  return [
    {
      key: 'projects',
      run: (context) => createProjects(host, content, context),
    },
    { key: 'people', run: (context) => createPeople(host, content, context) },
    {
      key: 'sources',
      weight: 8,
      run: (context) =>
        connectSources(host, data(context).projects!.main, context, 'main'),
    },
    {
      key: 'second-project',
      weight: 8,
      run: (context) =>
        connectSources(host, data(context).projects!.second, context, 'second'),
    },
    {
      key: 'knowledge',
      run: (context) => writeKnowledge(host, content, context),
    },
    {
      key: 'tasks',
      weight: 2,
      run: (context) => writeTasks(host, content, context),
    },
    {
      key: 'opportunities',
      run: (context) => writeOpportunities(host, content, context),
    },
    {
      key: 'activity',
      run: async (context) => {
        for (const which of ['main', 'second'] as const)
          await writeActivity(
            host,
            context,
            data(context).projects![which],
            content.projects[which].domain,
            data(context).people ?? {},
            which,
          );
      },
    },
  ];
}

async function createProjects(
  host: DemoHost,
  content: DemoContent,
  context: DemoImportContext,
) {
  const ids: Record<'main' | 'second', string> = { main: '', second: '' };
  for (const key of ['main', 'second'] as const) {
    const spec = content.projects[key];
    const project = (await host.projects.create({
      name: spec.name,
      domain: spec.domain,
      language: context.language,
    })) as { id: number };
    const id = String(project.id);
    ids[key] = id;
    // Recorded at once, so a failure later in the import still clears this project.
    await context.setData({ projects: { ...ids } });
    await host.projects.update(
      id,
      (payload: Record<string, unknown>) => ({
        ...payload,
        description: spec.description,
        audience: spec.audience,
        market: spec.market,
        createdAt: context.clock.isoAgo(key === 'main' ? 180 : 120),
        demo: { dataset: 'nocoreach', language: context.language },
      }),
      undefined,
    );
    host.demoProjects.add({
      id,
      name: spec.name,
      domain: spec.domain,
      language: context.language,
    });
  }
}

async function createPeople(
  host: DemoHost,
  content: DemoContent,
  context: DemoImportContext,
) {
  const access = host.db.access!;
  for (const key of Object.keys(ROLE_KEYS) as (keyof typeof ROLE_KEYS)[])
    await context.createPermissionSet({
      key: ROLE_KEYS[key],
      title: content.roles[key],
      grants: access.roleGrants(ROLES[key]),
    });
  const projects = data(context).projects!;
  const people: Partial<Record<DemoPerson, string>> = {};
  for (const { person, roles, projects: joined } of PEOPLE) {
    const spec = content.people[person];
    const id = await context.createAccount({
      username: spec.username,
      name: spec.name,
      email: demoEmail(spec.username),
      password: demoPassword(spec.username),
      permissionSets: roles,
    });
    people[person] = id;
    await access.database.transaction(async (connection) => {
      await access.joinProjects(
        connection,
        id,
        joined.map((key) => projects[key]),
      );
      await access.authorization.permissionSets
        .withTransaction(connection)
        .notifyAssignmentsChanged({ type: 'user', id });
    });
  }
  await context.setData({ people });
}

/**
 * Where the demo team researches search: the Chinese team reads the Chinese-language results of a market DataForSEO
 * covers, the English team the United States. Seeds, tracked keywords and the AI question are the team's own.
 */
const MARKETS = {
  'zh-CN': {
    locationCode: 2702,
    language: 'zh-CN',
    seeds: ['项目管理', '团队协作', 'Acme'],
    tracked: [
      '项目管理软件',
      'Excel 导入任务',
      '项目看板',
      '团队排期',
      'Acme vs Nimbus',
      'acme',
    ],
    question: 'Acme 如何管理任务、排期和客户协作？',
  },
  'en-US': {
    locationCode: 2840,
    language: 'en',
    seeds: ['project management', 'team collaboration', 'Acme'],
    tracked: [
      'project management software',
      'import tasks from Excel',
      'kanban boards',
      'team scheduling',
      'Acme vs Nimbus',
      'acme',
    ],
    question: 'How does Acme manage tasks, schedules and client collaboration?',
  },
} as const;

/** Runs the real connection and collection flows; the demo upstream answers every request in process. */
async function connectSources(
  host: DemoHost,
  id: string,
  context: DemoImportContext,
  which: 'main' | 'second',
) {
  const p = host;
  const content = demoContent(context.language);
  const spec = content.projects[which];
  const origin = `https://${spec.domain}`;
  const slug = spec.domain.split('.')[0];
  const repository = which === 'main' ? 'acme/acme' : 'acme/crm';
  const skipped: string[] = [...(data(context).skipped ?? [])];
  const en = context.language === 'en-US';
  const market =
    which === 'main'
      ? MARKETS[en ? 'en-US' : 'zh-CN']
      : {
          ...MARKETS[en ? 'en-US' : 'zh-CN'],
          seeds: en
            ? ['sales pipeline', 'crm import', 'Acme CRM']
            : ['销售漏斗', 'CRM 导入', 'Acme CRM'],
          tracked: en
            ? [
                'acme crm',
                'open source crm',
                'sales pipeline management',
                'import contacts from excel crm',
                'crm for small sales team',
                'quote approval workflow',
              ]
            : [
                'acme crm',
                '开源crm',
                '销售漏斗 管理',
                'crm 导入 excel',
                '小团队 crm',
                '报价单 审批',
              ],
          question: en
            ? 'How does Acme CRM handle account imports and sales handovers?'
            : 'Acme CRM 如何处理客户导入与销售交接？',
        };
  const phases: [string, () => Promise<unknown>][] = [
    [
      'google',
      async () => {
        const catalog = p.demoProjects.catalog(id);
        await p.variable(secretKey(id), 'demo-only-refresh-token', true);
        await p.projects.update(
          id,
          (project: Record<string, unknown>) => ({
            ...project,
            analyticsPropertyId: catalog.ga4PropertyId,
            searchConsoleProperty: catalog.gscSiteUrl,
          }),
          undefined,
        );
        await p.metadata(id, {
          accountEmail: catalog.googleEmail,
          ga4PropertyId: catalog.ga4PropertyId,
          gscSiteUrl: catalog.gscSiteUrl,
          status: 'ready_for_sync',
          authorizedAt: context.clock.isoAgo(540),
          scheduleEnabled: false,
        });
        const queued = (await p.sync.enqueue(id, 56, 'manual')) as {
          jobs: { id: string }[];
        };
        // Seed the full supported history through the normal collectors and partition writer.
        // This affects only these new demo jobs, not the public sync range or provider retention rules.
        const { earliest } = historyBounds(p, id);
        await p.db.getRepository('nrSyncJobs').update({
          filter: {
            projectId: id,
            id: { $in: queued.jobs.map((job) => job.id) },
          },
          values: { startDate: earliest, cursor: earliest },
        });
        for (let batch = 0; batch < 160; batch++) {
          const jobs = await p.db.getRepository('nrSyncJobs').find({
            filter: {
              projectId: id,
              id: { $in: queued.jobs.map((job) => job.id) },
            },
          });
          if (jobs.every((job) => job.status === 'succeeded')) return;
          if (
            jobs.some((job) =>
              ['failed', 'paused'].includes(String(job.status)),
            )
          )
            throw new Error('Google sync failed');
          await p.sync.step(id);
        }
        throw new Error('Google sync did not finish');
      },
    ],
    [
      'website',
      async () => {
        const discovery = await p.siteContent.discover(origin);
        await p.siteContent.confirm(id, discovery, ['blog', 'docs', 'page']);
        for (
          let batch = 0;
          batch < 30 && (await p.siteContent.enrich(id));
          batch++
        ) {
          /* bounded production batches */
        }
      },
    ],
  ];
  phases.push(
    [
      'github',
      async () => {
        await p.github.connect(id, `https://github.com/${repository}`);
        await p.github.setToken(
          id,
          'ghp_DemoOnlyNeverLive000000000000000000000',
        );
        await p.github.backfill(id);
      },
    ],
    [
      'community',
      async () => {
        await p.community.connect(id, `https://community.${spec.domain}`);
        await p.community.runs.wait(id);
      },
    ],
    [
      'packages',
      async () => {
        for (const [registry, name] of [
          ['npm', which === 'main' ? '@acme/core' : '@acme/crm'],
          ['pypi', slug],
          ['docker', repository],
        ]) {
          await p.packages.add(id, { registry, name });
          await p.packages.runs.wait(id);
        }
      },
    ],
    [
      'hackernews',
      async () => {
        await p.hackernews.connect(id, { terms: [spec.name] });
        await p.hackernews.runs.wait(id);
      },
    ],
    [
      'x',
      async () => {
        await p.xSource.connect(id, {
          terms: [spec.name],
          token: 'DemoOnlyNeverLiveToken000000000000000000000000000000',
          cap: 5,
        });
        await p.xSource.runs.wait(id);
      },
    ],
    ...(['slack', 'discord'] as const).map(
      (platform): [string, () => Promise<unknown>] => [
        platform,
        async () => {
          const token =
            platform === 'slack'
              ? 'xoxb-DemoOnlyNeverLive0000000000000000'
              : 'DemoOnlyNeverLive0000000000000000000.demo.DemoOnlyNeverLive0000000000000000000';
          const inspected = (await p.chat.inspect(id, {
            platform,
            token,
          })) as {
            guildId?: string;
            channels: { id: string }[];
          };
          await p.chat.connect(id, {
            platform,
            token,
            guildId: inspected.guildId,
            channels: inspected.channels.map((channel) => channel.id),
          });
          await p.chat.runs.wait(id);
        },
      ],
    ),
    [
      'keywords',
      async () => {
        await p.keywordService.configure(
          id,
          Buffer.from(
            JSON.stringify({
              login: `seo@${spec.domain}`,
              password: 'demo-only-never-live',
            }),
          ).toString('base64'),
          10,
        );
        await p.keywordService.check(id);
        for (const target of market.seeds) {
          const run = (await p.keywordService.run(id, {
            view: 'related',
            target,
            locationCode: market.locationCode,
            language: market.language,
            limit: 100,
            requestKey: randomUUID(),
          })) as {
            id: string;
            status: string;
            result: { items: { id: string }[] };
          };
          if (run.status !== 'completed')
            throw new Error('Keyword research failed');
          await p.keywordService.saveFromRun(id, {
            runId: String(run.id),
            itemIds: run.result.items.slice(0, 40).map((item) => item.id),
          });
        }
        await p.rankTracking.add(id, {
          keywords: market.tracked.map((keyword) => ({
            keyword,
            locationCode: market.locationCode,
            language: market.language,
          })),
        });
        await p.rankTracking.check(id);
      },
    ],
    [
      'domain',
      async () => {
        for (const view of ['keywords', 'pages'])
          await new DomainService(p).run(id, {
            target: spec.domain,
            view,
            locationCode: market.locationCode,
            language: market.language,
            requestKey: randomUUID(),
          });
        for (const strategy of ['mobile', 'desktop'])
          await new Lighthouse(p).run(id, {
            url: origin,
            strategy,
            requestKey: randomUUID(),
          });
      },
    ],
    [
      'media',
      async () => {
        // The demo's browser collector answers for the three media platforms.
        for (const platform of ['bilibili', 'xiaohongshu', 'youtube'] as const)
          await p.collectors.save(id, platform, {
            revision: 0,
            url: collectorUrl(spec.domain),
            token: COLLECTOR_TOKEN,
          });
        await p.bilibili.connect(id, {
          collectorId: `project-bilibili-${id}`,
          terms: [spec.name],
          revision: null,
        });
        await p.bilibili.sync(id);
        await p.xiaohongshu.connect(id, {
          collectorId: `project-xiaohongshu-${id}`,
          query: spec.name,
          revision: 0,
        });
        await p.xiaohongshu.search(id, { revision: 1 });
        await p.youtube.connect(id, {
          terms: [spec.name],
          videoUrls: followedVideos({
            id,
            name: spec.name,
            domain: spec.domain,
            language: context.language,
          }),
          revision: null,
        });
        await p.youtube.settled(id);
      },
    ],
    [
      'reddit',
      async () => {
        await p.reddit.connect(id, { terms: [spec.name] });
        await p.reddit.runs.wait(id);
      },
    ],
    [
      'trends',
      async () => {
        await p.trends.connect(id, { product: spec.name, locationCode: 0 });
        await p.trends.runs.wait(id);
      },
    ],
    [
      'competitors',
      async () => {
        // One call keeps the competitor check scoped to this product.
        await p.competitors.add(id, {
          items:
            which === 'main'
              ? [
                  { name: 'Nimbus', site: 'https://nimbus.example' },
                  { name: 'Example Tasks', site: 'https://tasks.example' },
                ]
              : [{ name: 'Example Sales', site: 'https://sales.example' }],
        });
        await p.competitors.checking;
        // The Chinese team compares in the Chinese market, which competitor research covers.
        if (market.language === 'zh-CN')
          await p.competitorResearch.setMarket(id, {
            locationCode: 2156,
            language: 'zh-CN',
          });
        await p.competitorResearch.refresh(id);
      },
    ],
    [
      'ai-search',
      async () => {
        await p.aiSearch.brand(id, {
          target: spec.name,
          platform: 'chat_gpt',
          competitors:
            which === 'main' ? ['Nimbus', 'Example Tasks'] : ['Example Sales'],
          requestKey: randomUUID(),
        });
        await p.aiSearch.gap(id, {
          target: spec.name,
          platform: 'chat_gpt',
          competitor: which === 'main' ? 'Nimbus' : 'Example Sales',
          requestKey: randomUUID(),
        });
        for (const model of ['chat_gpt', 'claude', 'gemini', 'perplexity'])
          await p.aiSearch.ask(id, {
            question: market.question,
            model,
            requestKey: randomUUID(),
          });
        await p.aiQuestions.setTopics(id, {
          topics:
            which === 'main'
              ? ['project management', 'team collaboration', 'task management']
              : ['sales pipeline', 'open source crm', 'workflow automation'],
        });
        await p.aiQuestions.refresh(id);
      },
    ],
  );
  await p.network.runProject(id, async () => {
    for (const [index, [name, run]] of phases.entries()) {
      try {
        await run();
      } catch (error) {
        // One source failing leaves the rest of the demo usable; the page shows that source as not connected.
        skipped.push(`${which}:${name}`);
        p.app.logger.warn('Demo source was not connected', {
          projectId: id,
          source: name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await context.progress((index + 1) / phases.length);
    }
  });
  await context.setData({ skipped });
}

async function writeKnowledge(
  host: DemoHost,
  content: DemoContent,
  context: DemoImportContext,
) {
  for (const which of ['main', 'second'] as const)
    for (const document of which === 'main'
      ? content.documents
      : (content.secondDocuments ?? []))
      await host.knowledge.add(
        data(context).projects![which],
        {
          title: document.title,
          category: document.category,
          text: content.notice + document.text,
        },
        data(context).people?.editor ?? context.actorId,
      );
}

function storyTask(
  content: DemoContent,
  context: DemoImportContext,
  origin: string,
  story: DemoTaskStory,
  index: number,
  partitions: Partition[],
  adminName: string,
) {
  const people = data(context).people ?? {};
  const at = (days: number, hours = 0) =>
    new Date(
      context.clock.now.getTime() - days * DAY + hours * 3_600_000,
    ).toISOString();
  const flow = content.flows[story.kind];
  const work = projectWork({});
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
    page: { url: origin + story.path, title: story.title },
    note: content.taskNote,
  });
  const comments = story.comments.map((comment) =>
    commentAuthor(content, comment),
  );
  const owner =
    story.owner ??
    (story.state === 'review'
      ? 'editor'
      : comments.find(
          (comment) => comment.person && comment.person !== 'editor',
        )?.person);
  const ownerId = owner === 'admin' ? context.actorId : owner && people[owner];
  if (ownerId) {
    work.humanOwnerId = ownerId;
    work.humanOwnerName =
      owner === 'admin'
        ? adminName
        : owner
          ? content.people[owner].name
          : undefined;
  }
  const completedAgo = storyCompletedAgo(story, index);
  const age =
    story.age ?? (story.state === 'done' ? completedAgo + 8 : 3 + (index % 12));
  const draftAgo = age - 1;
  const lastAgo =
    story.state === 'done' ? completedAgo : Math.max(0.25, age - 3);

  if (story.state !== 'todo') {
    work.flow = {
      id: `editorial-${story.kind}`,
      name: flow.name,
      version: 1,
      stages: [
        {
          key: 'draft',
          name: flow.draft,
          kind: 'agent',
          mode: 'analyze',
          instruction: story.brief,
        },
        {
          key: 'review',
          name: flow.review,
          kind: 'review',
          checklist: [{ key: 'facts', label: flow.checklist, required: true }],
        },
      ],
    };
    work.stageIndex = 1;
  }
  work.history = comments.map((comment, i) => ({
    at: at(age - 2, i + 1),
    actor: (comment.person && people[comment.person]) || 'demo-editor',
    actorName: comment.name,
    action: 'comment',
    comment: comment.text,
  }));
  if (story.state === 'done')
    work.history.push({
      at: at(completedAgo),
      actor: people.editor,
      actorName: content.people.editor.name,
      action: 'comment',
      comment:
        context.language === 'en-US'
          ? 'Review complete. The approved copy and source checks are saved with this task.'
          : '审核完成，确认稿与来源检查已保存在本任务中。',
    });
  if (story.draft) {
    const artifact: Artifact = {
      id: `editorial-${story.key}`,
      planVersion: 0,
      stepId: 'draft',
      version: 1,
      createdAt: at(draftAgo),
      createdBy: ownerId || people.content || 'demo-editor',
      manual: true,
      content: content.notice + story.draft,
      report: {
        kind: story.kind,
        sources: [{ title: content.sourcePage, url: origin + story.path }],
        asOf: at(draftAgo),
        uncertainties: [content.uncertainty],
      },
      ...(story.rejected ? { rejectedAt: at(lastAgo) } : {}),
    };
    work.results = [artifact];
  }
  if (story.cancelled) {
    work.cancelledAt = at(lastAgo);
    work.cancelledBy = people.editor ?? 'demo-editor';
  }
  if (story.archived) {
    work.archivedAt = at(lastAgo);
    work.archivedBy = people.editor ?? 'demo-editor';
  }
  if (story.outcome) {
    // Historical observations use the same collected page partitions as the data views.
    work.observeFrom = context.clock.dateAgo(completedAgo);
    if (story.outcome !== 'waiting') {
      const result = compare(
        7,
        work.observeFrom,
        [origin + story.path],
        partitions,
        at(completedAgo - 10),
      );
      result.notes.push(content.observationNote);
      work.observation = { results: [result] };
    }
  }
  return {
    work,
    createdAt: at(age),
    updatedAt: at(
      story.outcome && story.outcome !== 'waiting'
        ? completedAgo - 10
        : lastAgo,
    ),
  };
}

async function writeTasks(
  host: DemoHost,
  content: DemoContent,
  context: DemoImportContext,
) {
  const actor = await host.db
    .access!.database.repository('user')
    .findOne({ filter: { id: context.actorId } });
  const adminName =
    typeof actor?.name === 'string' && actor.name
      ? actor.name
      : typeof actor?.username === 'string'
        ? actor.username
        : 'Administrator';
  const projects = data(context).projects!;
  const repo = host.db.getRepository('nrSnapshots');
  for (const [which, stories] of [
    ['main', content.stories],
    ['second', content.secondTasks],
  ] as const) {
    const id = projects[which];
    const origin = `https://${content.projects[which].domain}`;
    const partitions = (
      await host.db.getRepository('nrSyncPartitions').find({
        filter: { projectId: id, grain: { $in: ['page', 'query_page'] } },
        fields: ['source', 'grain', 'date', 'payload'],
      })
    ).map((row) => row.toJSON()) as Partition[];
    await host.db.sequelize.transaction(async (transaction: unknown) => {
      for (const [index, story] of stories.entries()) {
        const { work, createdAt, updatedAt } = storyTask(
          content,
          context,
          origin,
          story,
          index,
          partitions,
          adminName,
        );
        const history = taskHistory(
          context,
          content,
          id,
          story,
          work,
          createdAt,
          updatedAt,
        );
        const row = await host.db.getRepository('nrTasks').create({
          values: {
            projectId: id,
            taskKey: `nocoreach-demo:${id}:${story.key}`,
            title: story.title,
            brief: `${content.notice}${story.brief}`,
            // Stored status values stay the classic Chinese ones in every language.
            status: {
              todo: '待处理',
              doing: '进行中',
              review: '待确认',
              done: '已完成',
            }[story.state],
            evidence: { simulated: true, demoEdition: 'nocoreach-demo', work },
            createdAt,
            updatedAt,
          },
          transaction,
        });
        for (const artifact of history.artifacts)
          if (artifact)
            await repo.create({
              values: {
                key: `nr-task-artifact:${id}:${String(row.id)}:${artifact.id}`,
                payload: artifact,
              },
              transaction,
            });
        for (const run of history.runs)
          await repo.create({
            values: {
              key: `nr-task-run:${id}:${String(row.id)}:${run.id}`,
              payload: { ...run, taskId: String(row.id) },
            },
            transaction,
          });
        for (const review of history.reviews)
          await repo.create({
            values: {
              key: `nr-task-review:${id}:${String(row.id)}:${randomUUID()}`,
              payload: review,
            },
            transaction,
          });
      }
    });
    await context.progress(which === 'main' ? 0.8 : 1);
  }
}

async function writeOpportunities(
  host: DemoHost,
  content: DemoContent,
  context: DemoImportContext,
) {
  for (const which of ['main', 'second'] as const) {
    const id = data(context).projects![which];
    const repo = host.db.getRepository('nrSnapshots');
    const partitions = (
      await host.db.getRepository('nrSyncPartitions').find({
        filter: { projectId: id, grain: { $in: ['page', 'query_page'] } },
      })
    ).map((row) => row.toJSON()) as Partition[];
    await host.db.sequelize.transaction(async (transaction: unknown) => {
      const tasks = await host.db
        .getRepository('nrTasks')
        .find({ filter: { projectId: id }, transaction });
      const state = opportunityHistory(
        context,
        content,
        which,
        tasks.map((task) => ({
          id: String(task.id),
          key: String(task.taskKey).replace(`nocoreach-demo:${id}:`, ''),
          title: String(task.title),
          createdAt: new Date(task.get('createdAt') as string).toISOString(),
          no: (task.get('evidence') as { no?: number } | undefined)?.no,
        })),
        partitions,
      );
      const row = await repo.findOne({
        filter: { key: `strategy:${id}` },
        transaction,
      });
      if (row)
        await repo.update({
          filterByTk: row.id,
          values: { payload: state },
          transaction,
        });
      else
        await repo.create({
          values: { key: `strategy:${id}`, payload: state },
          transaction,
        });
    });
  }
}
