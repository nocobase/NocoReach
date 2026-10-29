import { randomUUID } from 'node:crypto';
import { DEMO_PRODUCT } from './demo-content.js';
import { installEditorialDemo } from './demo-install.js';
import {
  FIXTURE_PRODUCT,
  fixtureCatalog,
} from '../../app-plugins/nocoreach-mock/server/fixtures.js';
import { MOCK_DATASET_MARKER } from '../../app-plugins/nocoreach-mock/server/engine.js';
import type { Connections } from './plugin.js';
import { DomainService } from './domain-service.js';
import { Lighthouse } from './lighthouse.js';
import type { AiQuestions } from './ai-questions.js';
import { secretKey } from './policy.js';
import { projectWork, type BoardState } from './execution/model.js';

import type { LegacyDatabase } from './legacy/database.js';
import type { LegacyVariables } from './legacy/variables.js';
import type { LegacyApp } from './legacy/app.js';
import type { SyncService } from './sync-service.js';
import type { SiteContent } from './site-content.js';
import type { GitHubSource } from './github-source.js';
import type { CommunitySource } from './community-source.js';
import type { PackagesSource } from './packages-source.js';
import type { HackerNewsSource } from './hackernews-source.js';
import type { XSource } from './x-source.js';
import type { ChatSource } from './chat-source.js';
import type { KeywordService } from './keyword-service.js';
import type { RankTracking } from './rank-tracking.js';
import type { RedditSource } from './reddit-source.js';
import type { TrendsSource } from './trends-source.js';
import type { CompetitorWatch } from './competitor-watch.js';
import type { CompetitorResearch } from './competitor-research.js';
import type { TaskService } from './execution/service.js';
import type { Knowledge } from './knowledge.js';
import type { AiSearch } from './ai-search.js';

// The classic host assigns these services during load(); its legacy class does not declare them.
type DemoHost = Connections & {
  db: LegacyDatabase;
  variables: LegacyVariables;
  app: LegacyApp;
  sync: SyncService;
  siteContent: SiteContent;
  github: GitHubSource;
  community: CommunitySource;
  packages: PackagesSource;
  hackernews: HackerNewsSource;
  xSource: XSource;
  chat: ChatSource;
  keywordService: KeywordService;
  rankTracking: RankTracking;
  reddit: RedditSource;
  trends: TrendsSource;
  competitors: CompetitorWatch & { checking?: Promise<unknown> };
  competitorResearch: CompetitorResearch;
  taskExecution: TaskService;
  aiSearch: AiSearch;
  knowledge: Knowledge;
  aiQuestions: AiQuestions;
};

export const MOCK_DEMO_KEY = 'mock-demo:v1';
interface Progress {
  projectId: string;
  completed: string[];
  clock: string;
}

/** Application-owned persisted examples, after the plugin has verified and marked the isolated database. */
export async function initializeMockDemo(host: Connections): Promise<void> {
  const p = host as DemoHost;
  if (!p.mock?.enabled) return;
  if (!p.variables.all()[MOCK_DATASET_MARKER])
    throw new Error('NR_MOCK_DEMO_REQUIRES_MARKED_DATASET');
  const product =
    p.mock.environment === 'demo' ? DEMO_PRODUCT : FIXTURE_PRODUCT;
  const repo = p.db.getRepository('nrSnapshots');
  let progress: Progress = (
    await repo.findOne({ filter: { key: MOCK_DEMO_KEY } })
  )?.get('payload') as Progress;
  if (
    progress?.completed.includes('complete') &&
    progress.completed.includes('connection-defaults') &&
    progress.completed.includes('docs-repository')
  ) {
    await installEditorialDemo(host, progress.projectId, progress.clock);
    return;
  }
  if (!progress) {
    // Project and ownership marker commit together, so a failed start cannot orphan a second demo project.
    await p.db.sequelize.transaction(async (transaction) => {
      const projects = (await p.projects.list()) as { id: number }[];
      const id = String(
        Math.max(0, ...projects.map((project) => Number(project.id))) + 1,
      );
      if (projects.length >= 50) throw new Error('NR_MOCK_DEMO_PROJECT_LIMIT');
      const clock = p.mock!.status(id).clock;
      progress = { projectId: id, completed: [], clock };
      await repo.create({
        values: {
          key: `project:${id}`,
          payload: {
            id: Number(id),
            name:
              p.mock!.environment === 'demo'
                ? product.domain
                : 'NocoBloom 演示项目',
            domains: [product.domain],
            language: 'zh-CN',
            description:
              '虚构的开源低代码协作平台；所有指标、任务与讨论均为演示数据。',
            audience: '中小团队、开发者与运营人员',
            market: '全球',
            analyticsPropertyId: '',
            searchConsoleProperty: '',
            createdAt: clock,
          },
        },
        transaction,
      });
      await repo.create({
        values: { key: MOCK_DEMO_KEY, payload: progress },
        transaction,
      });
    });
  }
  const id = progress.projectId;
  // Never use a completed phase to repair user edits or reconnect a deliberately disconnected source.
  const phase = async (name: string, fn: () => Promise<unknown>) => {
    if (progress.completed.includes(name)) return;
    p.app.logger.info('Initializing simulated demo data', {
      projectId: id,
      phase: name,
    });
    await fn();
    await verifyPhase(p, id, name);
    progress = { ...progress, completed: [...progress.completed, name] };
    await repo.update({
      filter: { key: MOCK_DEMO_KEY },
      values: { payload: progress },
    });
  };
  // Also fill the missing defaults of previously initialized demo projects, without recollecting data.
  await phase('connection-defaults', async () => {
    const doc = await p.taskExecution.agents.doc(id);
    // A nonzero revision records an explicit choice, including removing a repository.
    if (!doc.repos.length && doc.revision === 0)
      await p.taskExecution.agents.saveRepo(id, {
        revision: doc.revision,
        repo: product.repository,
        baseBranch: 'main',
        allowedPaths: ['docs', 'website'],
        contentCheck: true,
        urls: [new URL(product.origin).host],
      });
    const link = await p.db
      .getRepository('nrGoogleLinks')
      .findOne({ filter: { projectId: id } });
    if (link?.status === 'active' && link.ga4PropertyId && link.gscSiteUrl)
      await p.metadata(id, { status: 'ready_for_sync' });
  });
  // Website source in two repositories (2026-10-29): the docs have their own, so a task on a /docs page goes there and
  // any other page to the website's. Added only beside the repository the demo connected, never over a person's choice.
  await phase('docs-repository', async () => {
    const doc = await p.taskExecution.agents.doc(id);
    if (doc.repos.length !== 1 || doc.repos[0].repo !== product.repository)
      return;
    await p.taskExecution.agents.saveRepo(id, {
      revision: doc.revision,
      repo: `${product.repository.split('/')[0]}/docs`,
      baseBranch: 'main',
      allowedPaths: [],
      contentCheck: true,
      urls: [`${new URL(product.origin).host}/docs`],
    });
  });
  if (progress.completed.includes('complete')) {
    await installEditorialDemo(host, id, progress.clock);
    return;
  }
  // An explicit Profile is required even when an interrupted older initializer completed its settings phase.
  await p.proxyProfiles.initializeMockProject(id, {
    scenario: 'pagination',
    seed: `nocobloom-demo-${id}`,
    clock: progress.clock,
  });
  await phase('settings', async () => {});
  await p.network.runProject(id, async () => {
    await phase('google', async () => {
      const catalog = fixtureCatalog(p.mock!.context(id));
      await p.variable(secretKey(id), 'mock-only-demo-refresh-token', true);
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
        authorizedAt: progress.clock,
        scheduleEnabled: false,
      });
      const queued = (await p.sync.enqueue(id, 56, 'manual')) as {
        jobs: { id: string }[];
      };
      for (let batch = 0; batch < 20; batch++) {
        const jobs = await p.db.getRepository('nrSyncJobs').find({
          filter: {
            projectId: id,
            id: { $in: queued.jobs.map((job: { id: string }) => job.id) },
          },
        });
        if (jobs.every((job) => job.status === 'succeeded')) return;
        if (
          jobs.some((job) => ['failed', 'paused'].includes(String(job.status)))
        )
          throw new Error('NR_MOCK_DEMO_GOOGLE_FAILED');
        await p.sync.step(id);
      }
      throw new Error('NR_MOCK_DEMO_GOOGLE_INCOMPLETE');
    });
    await phase('website', async () => {
      const discovery = await p.siteContent.discover(product.origin);
      await p.siteContent.confirm(id, discovery, ['blog', 'docs', 'page']);
      for (
        let batch = 0;
        batch < 30 && (await p.siteContent.enrich(id));
        batch++
      ) {
        /* bounded production batches */
      }
    });
    await phase('github', async () => {
      await p.github.connect(id, `https://github.com/${product.repository}`);
      await p.github.setToken(id, 'ghp_FictionalMockOnlyNeverLive1234567890');
      await p.github.backfill(id);
    });
    await phase('community', async () => {
      await p.community.connect(id, product.community);
      await p.community.runs.wait(id);
    });
    await phase('packages', async () => {
      for (const [registry, name] of [
        ['npm', product.npm],
        ['pypi', product.domain.split('.')[0]],
        ['docker', product.repository],
      ]) {
        await p.packages.add(id, { registry, name });
        await p.packages.runs.wait(id);
      }
    });
    await phase('hackernews', async () => {
      await p.hackernews.connect(id, { terms: [product.name] });
      await p.hackernews.runs.wait(id);
    });
    await phase('x', async () => {
      await p.xSource.connect(id, {
        terms: [product.name],
        token: 'FictionalMockOnlyNeverLiveToken01234567890123456789',
        cap: 5,
      });
      await p.xSource.runs.wait(id);
    });
    for (const platform of ['slack', 'discord'])
      await phase(platform, async () => {
        const token =
          platform === 'slack'
            ? 'xoxb-FictionalMockOnlyNeverLive1234567890'
            : 'FictionalMockOnlyNeverLive1234567890.fake.FictionalMockOnlyNeverLive1234567890';
        const inspected = (await p.chat.inspect(id, { platform, token })) as {
          guildId?: string;
          channels: { id: string }[];
        };
        await p.chat.connect(id, {
          platform,
          token,
          guildId: inspected.guildId,
          channels: inspected.channels.map(
            (channel: { id: string }) => channel.id,
          ),
        });
        await p.chat.runs.wait(id);
      });
    await phase('youtube', async () => {
      const state = await p.youtube.state(id);
      await p.youtube.connect(id, {
        terms: [product.name],
        videoUrls: ['https://www.youtube.com/watch?v=NocoBloom01'],
        revision: state?.revision ?? null,
        autoSync: false,
      });
      await p.youtube.settled(id);
    });
    await phase('bilibili', async () => {
      const state = await p.bilibili!.state(id);
      await p.bilibili!.connect(id, {
        collectorId: 'nocoreach-mock',
        terms: [product.name],
        bvids: ['BV1NB411c7m1'],
        revision: state?.revision ?? null,
      });
      await p.bilibili!.sync(id);
    });
    await phase('xiaohongshu', async () => {
      const state = await p.xiaohongshu!.state(id);
      await p.xiaohongshu!.connect(id, {
        collectorId: 'nocoreach-mock',
        query: product.name,
        revision: state?.revision ?? 0,
      });
      await p.xiaohongshu!.search(id, {
        revision: (await p.xiaohongshu!.state(id))!.revision,
      });
    });
    await phase('seo-connection', async () => {
      await p.keywordService.configure(
        id,
        Buffer.from(
          JSON.stringify({
            login: 'fictional@nocobloom.example',
            password: 'fake-credential-never-live',
          }),
        ).toString('base64'),
        10,
      );
      await p.keywordService.check(id);
    });
    await phase('keywords', async () => {
      for (const target of [
        'internal tools',
        'workflow automation',
        product.name,
      ]) {
        const run = (await p.keywordService.run(id, {
          view: 'related',
          target,
          locationCode: 2840,
          language: 'en',
          limit: 100,
          requestKey: randomUUID(),
        })) as {
          id: string;
          status: string;
          result: { items: { id: string }[] };
        };
        if (run.status !== 'completed')
          throw new Error('NR_MOCK_DEMO_KEYWORDS_FAILED');
        await p.keywordService.saveFromRun(id, {
          runId: String(run.id),
          itemIds: run.result.items.map((item: { id: string }) => item.id),
        });
      }
      await p.rankTracking.add(id, {
        keywords: [
          'internal tools',
          'workflow automation',
          product.name,
          'low code platform',
          'team dashboard',
        ].map((keyword) => ({ keyword, locationCode: 2840, language: 'en' })),
      });
      await p.rankTracking.check(id);
    });
    await phase('domain-and-performance', async () => {
      for (const view of ['keywords', 'pages']) {
        const run = (await new DomainService(p).run(id, {
          target: product.domain,
          view,
          locationCode: 2840,
          language: 'en',
          requestKey: randomUUID(),
        })) as {
          id: string;
          status: string;
          result: { items: { id: string }[] };
        };
        if (run.status !== 'completed')
          throw new Error('NR_MOCK_DEMO_DOMAIN_FAILED');
      }
      for (const strategy of ['mobile', 'desktop']) {
        const run = (await new Lighthouse(p).run(id, {
          url: product.origin,
          strategy,
          requestKey: randomUUID(),
        })) as {
          id: string;
          status: string;
          result: { items: { id: string }[] };
        };
        if (run.status !== 'completed')
          throw new Error('NR_MOCK_DEMO_LIGHTHOUSE_FAILED');
      }
    });
    await phase('reddit', async () => {
      await p.reddit.connect(id, { terms: [product.name] });
      await p.reddit.runs.wait(id);
    });
    await phase('trends', async () => {
      await p.trends.connect(id, { product: product.name, locationCode: 0 });
      await p.trends.runs.wait(id);
    });
    await phase('competitors', async () => {
      await p.competitors.add(id, {
        name: 'FlowGrove',
        site: 'https://flowgrove.example',
      });
      await p.competitors.checking;
      await p.competitorResearch.refresh(id);
    });
    await phase('ai-search', async () => {
      await p.aiSearch.brand(id, {
        target: product.name,
        platform: 'chat_gpt',
        competitors: ['FlowGrove'],
        requestKey: randomUUID(),
      });
      await p.aiSearch.gap(id, {
        target: product.name,
        platform: 'chat_gpt',
        competitor: 'FlowGrove',
        requestKey: randomUUID(),
      });
      for (const model of ['chat_gpt', 'claude', 'gemini', 'perplexity'])
        await p.aiSearch.ask(id, {
          question: `How does ${product.name} help teams build internal tools?`,
          model,
          requestKey: randomUUID(),
        });
    });
    await phase('ai-questions', async () => {
      await p.aiQuestions.setTopics(id, {
        topics: ['internal tools', 'workflow automation', product.name],
      });
      await p.aiQuestions.refresh(id);
    });
    await phase('knowledge', async () => {
      if (p.mock!.environment === 'demo') return;
      // The phase marker shares the transaction with documents, avoiding duplicates after a failed commit.
      await p.db.sequelize.transaction(async (transaction) => {
        const key = `mock-demo-knowledge:${id}`;
        if (await repo.findOne({ filter: { key }, transaction })) return;
        for (const title of [
          '产品定位',
          '目标用户',
          '品牌语气',
          '内容策略',
          '社区回复规范',
          '发布审核清单',
        ])
          await p.knowledge.add(
            id,
            {
              title: `${product.name} ${title}（演示）`,
              category: 'other',
              text: `# ${title}\n\n本资料属于虚构的 ${product.name} 演示项目。\n\n${product.name} 帮助小团队构建内部工具、数据报表和审批工作流。内容应提供清晰的使用场景、操作步骤和权限说明。面向开发者与运营人员，用简洁、友好的语言解释功能。\n\n所有指标和引用均为模拟数据，不代表真实客户评价。回复社区问题前先核对原帖，明确不确定之处；任何对外发布均需负责人确认。`,
            },
            'mock-demo',
          );
        await repo.create({
          values: { key, payload: { version: 1 } },
          transaction,
        });
      });
    });
    await phase('tasks', async () => {
      if (p.mock!.environment !== 'demo')
        await seedTasks(p, id, progress.clock);
    });
    await phase('analysis', async () => {
      const result = await p.analysis.run(id, 'manual');
      if (!result.ok)
        throw new Error(
          `NR_MOCK_DEMO_ANALYSIS_FAILED: ${'error' in result ? result.error : 'unknown'}`,
        );
    });
    await phase('complete', async () => {});
  });
  await installEditorialDemo(host, id, progress.clock);
}

/** Collectors often persist an error instead of rejecting; never mark such a phase as initialized. */
async function verifyPhase(
  p: DemoHost,
  id: string,
  phase: string,
): Promise<void> {
  const succeeded = (
    value: unknown,
    field: 'lastSync' | 'lastRun' = 'lastSync',
    platform?: string,
  ) => {
    const state = value as {
      lastSync?: { ok?: boolean };
      lastRun?: { ok?: boolean };
      lastRuns?: Record<string, { ok?: boolean }>;
    } | null;
    return (
      (platform ? state?.lastRuns?.[platform] : state?.[field])?.ok === true
    );
  };
  const checks: Record<string, () => Promise<unknown>> = {
    website: async () => (await p.siteContent.summary(id)).enriched > 0,
    github: async () => succeeded(await p.github.state(id)),
    community: async () => succeeded(await p.community.state(id)),
    packages: async () => succeeded(await p.packages.state(id)),
    hackernews: async () => succeeded(await p.hackernews.state(id)),
    x: async () => succeeded(await p.xSource.state(id), 'lastRun'),
    slack: async () => succeeded(await p.chat.state(id), 'lastSync', 'slack'),
    discord: async () =>
      succeeded(await p.chat.state(id), 'lastSync', 'discord'),
    youtube: async () => succeeded(await p.youtube.status(id)),
    bilibili: async () => succeeded(await p.bilibili!.state(id), 'lastRun'),
    xiaohongshu: async () =>
      succeeded(await p.xiaohongshu!.state(id), 'lastRun'),
    reddit: async () => succeeded(await p.reddit.state(id), 'lastRun'),
    trends: async () => succeeded(await p.trends.state(id), 'lastRun'),
  };
  if (checks[phase] && !(await checks[phase]()))
    throw new Error(`NR_MOCK_DEMO_PHASE_FAILED: ${phase}`);
}

const TOPICS = [
  ['优化首页产品定位与搜索摘要', '/'],
  ['补充新手接入指南', '/docs/getting-started'],
  ['整理团队权限常见问题', '/docs/getting-started'],
  ['优化报表使用说明', '/docs/reporting'],
  ['撰写自动化工作流案例', '/blog/workflow-checklist'],
  ['整理社区回复草稿', '/docs/getting-started'],
  ['分析 GitHub 新用户反馈', '/'],
  ['完善 Slack 接入说明', '/docs/workflows'],
  ['研究竞品内容缺口', '/'],
  ['复盘关键词点击率变化', '/blog/template-onboarding'],
  ['设计视频教程选题', '/docs/getting-started'],
  ['汇总开源包使用反馈', '/'],
];

async function seedTasks(p: DemoHost, id: string, clock: string) {
  const states: BoardState[] = ['todo', 'doing', 'review', 'done'];
  await p.db.sequelize.transaction(async (transaction) => {
    for (let index = 0; index < 36; index++) {
      const taskKey = `mock-demo:${id}:${index}`;
      if (
        await p.db
          .getRepository('nrTasks')
          .findOne({ filter: { taskKey }, transaction })
      )
        continue;
      const [topic, path] = TOPICS[index % TOPICS.length];
      const title = `${topic}${index >= 12 ? `（第 ${Math.floor(index / 12) + 1} 期）` : ''}`;
      const state = states[index % states.length];
      const at = new Date(
        Date.parse(clock) - (36 - index) * 86400000,
      ).toISOString();
      const work = projectWork({});
      Object.assign(work, {
        simple: state === 'todo',
        boardState: state,
        stage: state === 'done' ? 'done' : state === 'todo' ? 'plan' : 'flow',
        kind: 'research',
        page: { url: FIXTURE_PRODUCT.origin + path, title: topic },
      });
      if (state !== 'todo') {
        work.flow = {
          id: 'mock-demo-research',
          name: '演示调研与复核',
          version: 1,
          stages: [
            {
              key: 'demo',
              name: '整理资料与建议',
              kind: 'agent',
              mode: 'analyze',
              instruction: '根据项目中已保存的模拟资料整理观察和建议。',
            },
            {
              key: 'review',
              name: '人工复核',
              kind: 'review',
              checklist: [
                { key: 'sources', label: '核对引用来源与结论', required: true },
              ],
            },
          ],
        };
        work.stageIndex = state === 'doing' ? 0 : 1;
      }
      work.history = [
        {
          at,
          actor: '演示数据',
          actorName: '演示数据',
          action: 'comment',
          comment: `这是一条虚构的演示任务。目标：${topic}。请结合搜索表现、社区反馈及网站内容查看上下文。`,
        },
        {
          at: new Date(Date.parse(at) + 3600000).toISOString(),
          actor: '演示数据',
          actorName: '演示数据',
          action: 'comment',
          comment:
            '讨论示例：先核对数据周期和样本，再列出建议；所有结论需要人工复核。',
        },
        {
          at: new Date(Date.parse(at) + 7200000).toISOString(),
          actor: '演示数据',
          actorName: '演示数据',
          action: 'comment',
          comment:
            state === 'review'
              ? '已附上示例交付物，请检查事实依据、措辞和下一步安排。'
              : state === 'done'
                ? '本条展示已完成状态，仅为演示，不代表真实发布或外部执行。'
                : '验收标准：问题清晰、引用来源可追溯、行动项可以逐条检查。',
        },
      ];
      if (state === 'review' || state === 'done')
        work.results = [
          {
            id: `mock-demo-artifact-${index}`,
            planVersion: 0,
            stepId: 'demo',
            version: 1,
            createdAt: at,
            createdBy: 'mock-demo',
            manual: true,
            content: `# ${title}\n\n> 虚构演示交付物，未运行模型或 Runner。\n\n## 观察\n用户希望缩短上手时间，并找到权限、报表和工作流的具体案例。\n\n## 建议\n1. 在页面开头给出适用场景与预期结果。\n2. 补充可复现的配置步骤与常见问题。\n3. 对比调整前后 28 天的搜索点击和访问数据。\n\n## 待核对\n- 检查文档与产品行为一致。\n- 核对引用的数据范围。\n\n来源：[演示页面](${FIXTURE_PRODUCT.origin + path})`,
          },
        ];
      const row = await p.db.getRepository('nrTasks').create({
        values: {
          projectId: id,
          taskKey,
          title,
          brief: `【模拟数据】${title}。综合已有数据提出可审核的建议，不进行真实发布。`,
          status: {
            todo: '待处理',
            doing: '进行中',
            review: '待确认',
            done: '已完成',
          }[state],
          evidence: { simulated: true, work },
          createdAt: at,
          updatedAt: at,
        },
        transaction,
      });
      for (const artifact of work.results)
        if (artifact)
          await p.taskExecution.put(
            p.taskExecution.key('artifact', id, String(row.id), artifact.id),
            artifact,
            transaction,
          );
    }
  });
}
