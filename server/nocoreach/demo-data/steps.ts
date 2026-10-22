import { randomUUID } from 'node:crypto';

import type {
  DemoImportContext,
  DemoStep,
} from '@nocobase/app-plugin-demo-mode/server/tokens';

import type { DemoStory } from '../demo-content.js';
import { DomainService } from '../domain-service.js';
import { Lighthouse } from '../lighthouse.js';
import { secretKey } from '../policy.js';
import { number as numberOpportunities } from '../opportunity-board.js';
import { projectWork, type Artifact } from '../execution/model.js';
import { windows, type EffectResult } from '../execution/effect.js';
import type {
  StrategyState,
  Opportunity,
  Signal,
} from '../../../shared/strategy-model.js';
import { ADMIN_ROLE, BUSINESS_MEMBER } from '../../access/service.js';
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
import type { DemoHost } from './host.js';

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
  admin: 'nr.demo-admin',
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
  // Everything NocoReach's own administrator holds, settings and the demo's management included, as a role the
  // demo owns: the built-in administrator role keeps its last assignment, so clearing could not disable this account.
  admin: ADMIN_ROLE,
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
  { person: 'admin', roles: [ROLE_KEYS.admin], projects: ['main', 'second'] },
];

export const demoEmail = (username: string) => `${username}@nocobase.example`;

/** The accounts the demo page lists before and after an import. */
export function demoAccounts(language: string) {
  const content = demoContent(language);
  return PEOPLE.map(({ person }) => ({
    username: content.people[person].username,
    name: content.people[person].name,
    role: content.people[person].title,
    password: `${content.people[person].username}123`,
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
      weight: 2,
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
        createdAt: context.clock.isoAgo(key === 'main' ? 120 : 9),
        demo: { dataset: 'nocoreach', language: context.language },
      }),
      undefined,
    );
    host.demoProjects.add({ id, name: spec.name, domain: spec.domain });
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
  const repository = `${slug}/${slug}`;
  const skipped: string[] = [...(data(context).skipped ?? [])];
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
          authorizedAt: context.clock.isoAgo(60),
          scheduleEnabled: false,
        });
        const queued = (await p.sync.enqueue(
          id,
          which === 'main' ? 56 : 28,
          'manual',
        )) as {
          jobs: { id: string }[];
        };
        for (let batch = 0; batch < 30; batch++) {
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
  if (which === 'main')
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
            ['npm', `@${slug}/core`],
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
                login: `demo@${spec.domain}`,
                password: 'demo-only-never-live',
              }),
            ).toString('base64'),
            10,
          );
          await p.keywordService.check(id);
          for (const target of [
            'internal tools',
            'workflow automation',
            spec.name,
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
              throw new Error('Keyword research failed');
            await p.keywordService.saveFromRun(id, {
              runId: String(run.id),
              itemIds: run.result.items.slice(0, 40).map((item) => item.id),
            });
          }
          await p.rankTracking.add(id, {
            keywords: [
              'internal tools',
              'workflow automation',
              spec.name,
              'low code platform',
              'team dashboard',
            ].map((keyword) => ({
              keyword,
              locationCode: 2840,
              language: 'en',
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
              locationCode: 2840,
              language: 'en',
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
          await p.competitors.add(id, {
            name: 'FlowGrove',
            site: 'https://flowgrove.example',
          });
          await p.competitors.checking;
          await p.competitorResearch.refresh(id);
        },
      ],
      [
        'ai-search',
        async () => {
          await p.aiSearch.brand(id, {
            target: spec.name,
            platform: 'chat_gpt',
            competitors: ['FlowGrove'],
            requestKey: randomUUID(),
          });
          await p.aiSearch.gap(id, {
            target: spec.name,
            platform: 'chat_gpt',
            competitor: 'FlowGrove',
            requestKey: randomUUID(),
          });
          for (const model of ['chat_gpt', 'claude', 'gemini', 'perplexity'])
            await p.aiSearch.ask(id, {
              question: `How does ${spec.name} help teams build internal tools?`,
              model,
              requestKey: randomUUID(),
            });
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
  if (which === 'second') {
    // The demo's problem record: this project's Google sign-in has expired since its first sync.
    await p.projects.update(
      id,
      (project: Record<string, unknown>) => ({
        ...project,
        demo: { ...(project.demo as object), expired: ['google'] },
      }),
      undefined,
    );
    p.demoProjects.expire(id, 'google');
  }
  await context.setData({ skipped });
}

async function writeKnowledge(
  host: DemoHost,
  content: DemoContent,
  context: DemoImportContext,
) {
  const { main } = data(context).projects!;
  for (const document of content.documents)
    await host.knowledge.add(
      main,
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
  story: DemoStory,
  index: number,
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
  const owner = comments.find(
    (comment) => comment.person && comment.person !== 'editor',
  )?.person;
  if (owner && people[owner]) {
    work.humanOwnerId = people[owner];
    work.humanOwnerName = content.people[owner].name;
  }
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
    work.stageIndex = story.state === 'doing' ? 0 : 1;
  }
  work.history = comments.map((comment, i) => ({
    at: at(44 - index, i + 1),
    actor: (comment.person && people[comment.person]) || 'demo-editor',
    actorName: comment.name,
    action: 'comment',
    comment: comment.text,
  }));
  if (story.draft) {
    const artifact: Artifact = {
      id: `editorial-${story.key}`,
      planVersion: 0,
      stepId: 'draft',
      version: 1,
      createdAt: at(43 - index),
      createdBy: (owner && people[owner]) || 'demo-editor',
      manual: true,
      content: content.notice + story.draft,
      report: {
        kind: story.kind,
        sources: [{ title: content.sourcePage, url: origin + story.path }],
        asOf: context.clock.now.toISOString(),
        uncertainties: [content.uncertainty],
      },
      ...(story.rejected ? { rejectedAt: at(42 - index) } : {}),
    };
    work.results = [artifact];
  }
  if (story.cancelled) {
    work.cancelledAt = at(42 - index);
    work.cancelledBy = people.editor ?? 'demo-editor';
  }
  if (story.archived) {
    work.archivedAt = at(42 - index);
    work.archivedBy = people.editor ?? 'demo-editor';
  }
  if (story.outcome) {
    // Past, hand-written observations: never a live release or a scheduled observation.
    work.observeFrom = context.clock.dateAgo(
      story.outcome === 'waiting' ? 2 : 12,
    );
    if (story.outcome !== 'waiting') {
      const pairs = {
        up: [126, 181],
        down: [164, 119],
        flat: [98, 102],
        insufficient: [12, 7],
      } as const;
      const factor =
        0.92 +
        context.clock.sample(`effect:${story.path}:${story.outcome}`) * 0.16;
      const [before, after] = pairs[story.outcome].map((value) =>
        Math.round(value * factor),
      );
      const impressions: [number, number] =
        story.outcome === 'down' ? [4200, 4850] : [3600, 4100];
      const result: EffectResult = {
        day: 7,
        ...windows(work.observeFrom, 7),
        pages: [origin + story.path],
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
        notes: [content.observationNote],
      };
      work.observation = { results: [result] };
    }
  }
  return { work, createdAt: at(45 - index), updatedAt: at(1, -index) };
}

async function writeTasks(
  host: DemoHost,
  content: DemoContent,
  context: DemoImportContext,
) {
  const projects = data(context).projects!;
  const repo = host.db.getRepository('nrSnapshots');
  for (const [which, stories] of [
    ['main', content.stories],
    ['second', content.secondTasks],
  ] as const) {
    const id = projects[which];
    const origin = `https://${content.projects[which].domain}`;
    await host.db.sequelize.transaction(async (transaction: unknown) => {
      for (const [index, story] of stories.entries()) {
        const { work, createdAt, updatedAt } = storyTask(
          content,
          context,
          origin,
          story,
          index,
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
    });
    await context.progress(which === 'main' ? 0.8 : 1);
  }
}

async function writeOpportunities(
  host: DemoHost,
  content: DemoContent,
  context: DemoImportContext,
) {
  const id = data(context).projects!.main;
  const origin = `https://${content.projects.main.domain}`;
  const copy = content.opportunities;
  const now = context.clock.now.toISOString();
  const repo = host.db.getRepository('nrSnapshots');
  await host.db.sequelize.transaction(async (transaction: unknown) => {
    const row = await repo.findOne({
      filter: { key: `strategy:${id}` },
      transaction,
    });
    const state: StrategyState = structuredClone(
      (row?.get('payload') as StrategyState | undefined) || {
        revision: 0,
        goal: null,
        proposals: [],
        operations: [],
      },
    );
    const cards: Opportunity[] = copy.briefs.map(
      ([
        key,
        title,
        observation,
        meaning,
        suggestion,
        objective,
        path,
        source,
        priority,
      ]) => ({
        id: `editorial-opportunity-${key}`,
        title,
        observation,
        meaning,
        suggestion,
        objective,
        source:
          source === 'gsc' ? 'search' : source === 'site' ? 'website' : 'mixed',
        evidenceText: `${observation}\n${copy.notice}`,
        limitation: `${copy.notice} ${copy.limitation}`,
        signalIds: [`editorial-signal-${key}`],
        sources: [source],
        priority,
        priorityReason:
          priority === 'high' ? copy.priorityHigh : copy.priorityOther,
        confidence: 'supported',
        category: 'optimize',
        lifecycle: 'persistent',
        change: 'new',
        audience: copy.audience,
        effort: 'medium',
        target: `${origin}${path}`,
        firstSeenAt: now,
      }),
    );
    const signals: Signal[] = cards.map((card, i) => ({
      key: card.signalIds![0],
      type: 'editorial',
      source: copy.briefs[i][7],
      title: card.title,
      facts: [card.observation, copy.notice],
      url: card.target,
      strength: 90 - i * 3,
      actionable: true,
      action: 'optimize',
      isNew: true,
    }));
    for (const [key, title, fact] of copy.watches)
      signals.push({
        key: `editorial-watch-${key}`,
        type: 'editorial',
        source: key === 'github' ? 'github' : 'ga4',
        title,
        facts: [fact, copy.notice],
        strength: 40,
        actionable: false,
        action: null,
      });
    signals.push({
      key: 'editorial-normal-search',
      type: 'editorial',
      source: 'gsc',
      title: copy.normal[0],
      facts: [copy.normal[1], copy.notice],
      strength: 20,
      actionable: false,
      action: null,
    });
    state.insights = {
      generatedAt: now,
      items: cards,
      evidence: {
        searchQueries: [],
        pages: [],
        industryCandidates: [],
        analysisVersion: 3,
        capturedAt: now,
        availableThrough: context.clock.dateAgo(0),
        periodDays: 28,
        limitations: [copy.notice],
        signals: {
          computedAt: now,
          coverage: { gsc: now, site: now, discourse: now },
          missing: [],
          items: signals,
        },
      },
      observations: [copy.notice, ...copy.observations],
      signalReviews: {},
    };
    state.opportunityMeta ||= {};
    state.watch ||= {};
    for (const signal of signals.filter((s) => s.actionable))
      state.insights.signalReviews![signal.key] = {
        verdict: 'do',
        reason: copy.doReason,
      };
    const decideBy = context.clock.dateAgo(-7);
    for (const [key, , , waitingFor] of copy.watches) {
      const signal = signals.find((s) => s.key === `editorial-watch-${key}`)!;
      state.insights.signalReviews![signal.key] = {
        verdict: 'watch',
        reason: signal.facts[0],
        waitingFor,
        decideBy,
      };
      state.watch[signal.key] = {
        key: signal.key,
        source: signal.source,
        since: now,
        startTitle: signal.title,
        startFacts: signal.facts,
        waitingFor,
        decideBy,
        lastSeen: now,
      };
    }
    state.insights.signalReviews!['editorial-normal-search'] = {
      verdict: 'skip',
      reason: copy.skipReason,
    };
    for (const card of cards.slice(10))
      state.opportunityMeta[card.id] = {
        status: 'ignored',
        ignoredAt: now,
        reviewedAt: now,
      };
    // Two opportunities were already turned into tasks: the CRM search research and the forum reply.
    const tasks = await host.db.getRepository('nrTasks').find({
      filter: {
        projectId: id,
        taskKey: {
          $in: [
            `nocoreach-demo:${id}:crm-search`,
            `nocoreach-demo:${id}:forum-multiple-roles`,
          ],
        },
      },
      transaction,
    });
    for (const [index, card] of cards.slice(8, 10).entries()) {
      const task = tasks.find((t) =>
        String(t.taskKey).endsWith(
          index === 0 ? 'crm-search' : 'forum-multiple-roles',
        ),
      );
      if (task)
        state.proposals.push({
          id: `editorial-proposal-${index}`,
          title: String(task.title),
          brief: card.suggestion,
          status: 'approved',
          goalVersion: null,
          insight: card,
          // Keep the opaque id: converting a snowflake string loses precision.
          taskId: task.id as number,
          taskNo: (task.get('evidence') as { no?: number } | undefined)?.no,
          evidence: state.insights.evidence,
        });
    }
    state.goal ||= { ...copy.goal, version: 1, confirmedAt: now };
    numberOpportunities(state);
    state.revision++;
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
