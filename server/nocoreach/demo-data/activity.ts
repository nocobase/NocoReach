import { createHash, randomUUID } from 'node:crypto';

import type { DemoImportContext } from '@nocobase/app-plugin-demo-mode/server/tokens';

import type {
  OnlineConversation,
  OnlineRun,
} from '../../../shared/online-agent.js';
import {
  stagesFor,
  SYSTEM_PLAYBOOKS,
} from '../../../shared/playbook-catalog.js';
import type { Artifact, Release, Run, RunEvent } from '../execution/model.js';
import { projectWork } from '../execution/model.js';
import { demoContent, type DemoPerson } from './content.js';
import { ACME_STORIES, ACME_DISCUSSIONS } from './acme-content.js';
import { CRM_STORIES } from './crm-content.js';
import type { DemoHost } from './host.js';
import { t, type L } from './world/script/types.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** In-app notifications the import writes carry this prefix, so clearing removes exactly them. */
export const DEMO_NOTIFICATION = 'nocoreach-demo-';

type ChangeState =
  | 'failed'
  | 'ready'
  | 'merge_failed'
  | 'verifying'
  | 'not_seen'
  | 'simulated'
  | 'live';

/** Page-change tasks in each state the release path has, hand-written like the other demo stories. */
interface ChangeTask {
  key: string;
  path: string;
  owner: DemoPerson;
  state: ChangeState;
  /** Days since the task was created. */
  age: number;
  title: L;
  brief: L;
  /** The visible change: what the page said before and says after. */
  label: L;
  before: L;
  after: L;
  /** The release note the owner wrote. */
  note: L;
  /** Why the Agent or the release failed. */
  error?: L;
  comments: readonly (readonly [DemoPerson, L])[];
}

const CHANGES: ChangeTask[] = [
  [
    22,
    'failed',
    'fix-sync-example',
    t('失败后重试即可。', 'Retry after a failure.'),
    t(
      '先核对事件编号与已处理记录，再重放失败事件。',
      'Check event IDs and processed records before replaying failed events.',
    ),
  ],
  [
    1,
    'ready',
    'home-project-management',
    t('让工作更高效。', 'Work more efficiently.'),
    t(
      'ACME 项目管理：把任务、排期和团队协作放在一起。',
      'ACME project management: tasks, schedules and teamwork together.',
    ),
  ],
  [
    2,
    'merge_failed',
    'pricing-guests',
    t('选择适合团队的方案。', 'Choose a plan for your team.'),
    t(
      '先核对成员、客户访客与报表需求，再确认适用方案。',
      'Review members, client guests and reporting needs before confirming a plan.',
    ),
  ],
  [
    5,
    'verifying',
    'timeline-baseline',
    t('依赖变化会更新所有日期。', 'Dependency changes update every date.'),
    t(
      '检查下游影响，固定里程碑由负责人确认，保留基准日期。',
      'Inspect downstream impact; owners confirm fixed milestones while retaining baselines.',
    ),
  ],
  [
    21,
    'not_seen',
    'approval-version',
    t('客户回复后完成验收。', 'Complete acceptance after a client reply.'),
    t(
      '客户明确确认具体附件版本后才完成验收。',
      'Complete acceptance only after explicit confirmation of the exact attachment version.',
    ),
  ],
  [
    15,
    'simulated',
    'handover-checklist',
    t('发送交接通知即可完成。', 'Sending the handover notice completes it.'),
    t(
      '核对未决事项与附件，接收人确认后才完成交接。',
      'Check pending decisions and attachments; complete after recipient confirmation.',
    ),
  ],
  [
    6,
    'live',
    'guest-permissions',
    t('客户可以查看项目。', 'Clients can view projects.'),
    t(
      '访客仅查看获邀项目，撤销后核对旧链接与附件访问。',
      'Guests see invited projects only; check old links and attachment access after revocation.',
    ),
  ],
].map(([index, state, key, before, after], i) => {
  const story = ACME_STORIES[index as number];
  return {
    key: key as string,
    path: story.path,
    owner:
      i === 1 ? 'growth' : i === 0 || i === 3 || i === 4 ? 'devrel' : 'content',
    state: state as ChangeState,
    age: 3 + i * 3,
    title: t(`更新页面：${story.title.zh}`, `Update page: ${story.title.en}`),
    brief: story.brief,
    label: t('页面说明', 'Page explanation'),
    before: before as L,
    after: after as L,
    note: t(
      '演示页面修订，保留原稿供复核。',
      'Demo page revision; retain the original for review.',
    ),
    error:
      i === 0
        ? t(
            '缺少重复同步事件的测试样例，模拟执行停止，未修改页面。',
            'Duplicate sync event fixtures are missing; the simulated run stopped without changing the page.',
          )
        : t(
            '审核后页面发生变化，需要重新核对差异。',
            'The page changed after review; reconcile the differences.',
          ),
    comments: story.comments,
  };
});

const CRM_CHANGES: ChangeTask[] = [
  [
    19,
    'failed',
    t('回传失败后重试即可。', 'Retry a failed callback.'),
    t(
      '按事件编号核对已处理记录，再从确认点重放。',
      'Check processed event IDs before replaying from the confirmed checkpoint.',
    ),
  ],
  [
    15,
    'ready',
    t('提交即预约成功。', 'Submission confirms your booking.'),
    t(
      '我们已收到预约请求，时间以确认邮件中的时区为准。',
      'We received your request; the confirmation email specifies the meeting time and zone.',
    ),
  ],
  [
    6,
    'merge_failed',
    t('托管版按席位计费。', 'Hosting is billed per seat.'),
    t(
      '托管按席位报价；数据迁移和培训范围在确认单中单列。',
      'Hosting is quoted per seat; migration and training scope are listed separately in the confirmation.',
    ),
  ],
  [
    0,
    'verifying',
    t('直接上传完整表格。', 'Upload the complete sheet.'),
    t(
      '先试导二十行，逐组确认重复项并保留来源行号。',
      'Rehearse twenty rows, review duplicate groups and preserve source row IDs.',
    ),
  ],
  [
    3,
    'not_seen',
    t(
      '修改报价后重新发送附件。',
      'Resend the attachment after changing the quote.',
    ),
    t(
      '标记旧版作废，审核折扣，再发送带版本号的新附件。',
      'Mark the old version superseded, review the discount and send a versioned attachment.',
    ),
  ],
  [
    9,
    'simulated',
    t(
      '客户转交后所有任务自动转交。',
      'All tasks transfer automatically with the account.',
    ),
    t(
      '客户与任务分别核对负责人，接收人确认后再撤销旧访问权限。',
      'Check account and task owners separately; revoke old access after the recipient confirms.',
    ),
  ],
  [
    4,
    'live',
    t('隐藏其他销售的菜单即可。', 'Hide other reps’ menu entries.'),
    t(
      '列表、详情链接和导出都应执行客户数据范围限制。',
      'Enforce account scope on lists, direct links and exports.',
    ),
  ],
].map(([index, state, before, after], i) => {
  const story = CRM_STORIES[index as number];
  return {
    key: `${story.key}-page`,
    path: story.path,
    owner: i === 1 ? 'growth' : 'content',
    state: state as ChangeState,
    age: 3 + i * 3,
    title: t(`更新页面：${story.title.zh}`, `Update page: ${story.title.en}`),
    brief: story.brief,
    label: t('页面说明', 'Page explanation'),
    before: before as L,
    after: after as L,
    note: t(
      '演示页面内容修订，保留原稿供核对。',
      'Demo page revision; keep the previous copy for review.',
    ),
    error:
      i === 0
        ? t(
            '找不到回传重放的测试数据，模拟执行停止，未修改页面。',
            'Callback replay fixtures were missing; the simulated run stopped without changing the page.',
          )
        : t(
            '审核后目标页面发生变化，需要重新核对差异。',
            'The target page changed after review; reconcile the differences.',
          ),
    comments: story.comments,
  };
});

const stages = stagesFor(
  SYSTEM_PLAYBOOKS.find((p) => p.id === 'optimize-page')!,
);

interface Built {
  work: ReturnType<typeof projectWork>;
  artifact?: Artifact;
  runs: Run[];
  createdAt: string;
  updatedAt: string;
}

function build(
  context: DemoImportContext,
  people: Partial<Record<DemoPerson, string>>,
  origin: string,
  projectId: string,
  change: ChangeTask,
): Built {
  const lang = context.language === 'en-US' ? 'en' : 'zh';
  const text = (value: L) => value[lang];
  const content = demoContent(context.language);
  const story = (
    origin.endsWith('crm.acme.example') ? content.secondTasks : content.stories
  ).find((s) => s.path === change.path)!;
  const now = context.clock.now.getTime();
  const at = (days: number, hours = 0) =>
    new Date(now - days * DAY + hours * HOUR).toISOString();
  const owner = people[change.owner] ?? context.actorId;
  const work = projectWork({});
  const failed = change.state === 'failed';
  // Where the task is: the Agent's step, the review, the release, or watching the effect.
  const index = failed
    ? 0
    : change.state === 'ready'
      ? 1
      : change.state === 'live'
        ? 3
        : change.state === 'simulated'
          ? 3
          : 2;
  Object.assign(work, {
    kind: 'content',
    // Once live (or simulated), the task is done for its owner and the effect is the system's to watch.
    stage:
      change.state === 'simulated' || change.state === 'live' ? 'done' : 'flow',
    page: { url: origin + change.path, title: text(change.title) },
    note: content.taskNote,
    humanOwnerId: owner,
    humanOwnerName: content.people[change.owner].name,
    playbookId: 'optimize-page',
    flow: {
      id: 'optimize-page',
      name: SYSTEM_PLAYBOOKS.find((p) => p.id === 'optimize-page')!.name,
      version: 3,
      stages: stages.map((s) =>
        s.kind === 'agent' ? { ...s, instruction: text(change.brief) } : s,
      ),
    },
    stageIndex: index,
  });
  work.history = change.comments.map(([person, comment], i) => ({
    at: at(change.age - 1 - i * 0.3, 2),
    actor: people[person] ?? 'demo-editor',
    actorName: content.people[person].name,
    action: 'comment',
    comment: text(comment),
  }));
  work.history.unshift({
    at: at(change.age, 0.1),
    actor: owner,
    actorName: content.people[change.owner].name,
    action: 'startTask',
    note: work.flow!.name,
  });
  const runId = randomUUID();
  const started = change.age - 0.2;
  const usage = {
    inputTokens: Math.round(
      (failed ? 3400 : 9200) +
        context.clock.sample(`input:${change.key}`) * 12000,
    ),
    outputTokens: Math.round(
      (failed ? 120 : 1300) +
        context.clock.sample(`output:${change.key}`) * 1900,
    ),
  };
  const transcript: RunEvent[] = [
    { seq: 1, at: at(started), type: 'status', content: 'running' },
    {
      seq: 2,
      at: at(started, 0.01),
      type: 'thinking',
      content: story.caseStudy.decision,
    },
    {
      seq: 3,
      at: at(started, 0.02),
      type: 'toolUse',
      tool: 'WebFetch',
      input: { url: origin + change.path },
    },
    {
      seq: 4,
      at: at(started, 0.03),
      type: 'toolResult',
      tool: 'WebFetch',
      output: {
        before: text(change.before),
        evidence: story.caseStudy.evidence,
        limits: story.caseStudy.limitation,
      },
    },
    ...(failed
      ? [
          {
            seq: 5,
            at: at(started, 0.05),
            type: 'toolUse',
            tool: 'Bash',
            input: { command: `rg --files docs${change.path}` },
          },
          {
            seq: 6,
            at: at(started, 0.06),
            type: 'toolResult',
            tool: 'Bash',
            output: text(change.error!),
          },
          {
            seq: 7,
            at: at(started, 0.08),
            type: 'text',
            content: text(change.error!),
          },
        ]
      : [
          {
            seq: 5,
            at: at(started, 0.05),
            type: 'toolUse',
            tool: 'Write',
            input: {
              path: `docs${change.path === '/' ? '/index' : change.path}.mdx`,
            },
          },
          {
            seq: 6,
            at: at(started, 0.06),
            type: 'toolResult',
            tool: 'Write',
            output: {
              saved: true,
              after: text(change.after),
              checks: story.caseStudy.checks,
              simulated: true,
            },
          },
          {
            seq: 7,
            at: at(started, 0.08),
            type: 'text',
            content: `${text(change.after)}\n\n${story.caseStudy.checks}\n\n${story.caseStudy.limitation}`,
          },
        ]),
    {
      seq: 8,
      at: at(started, 0.09),
      type: 'usage',
      meta: usage,
    },
  ];
  const run: Run = {
    id: runId,
    projectId,
    taskId: '',
    planVersion: 0,
    stepId: stages[0].key,
    baseArtifactId: null,
    ownerId: owner,
    actor: owner,
    inputVersion: 1,
    capabilitySnapshot: ['repo.read', 'repo.write', 'pr.open'],
    status: failed ? 'failed' : 'succeeded',
    createdAt: at(started, -0.05),
    startedAt: at(started),
    endedAt: at(started, 0.1),
    input: JSON.stringify({ mode: 'build', title: text(change.title) }),
    model: { llmService: 'demo', model: 'demo-agent' },
    flowStage: 0,
    mode: 'build',
    simulated: true,
    demoAgentId: 'nocoreach.runner',
    agentName: 'NocoReach Demo Agent',
    transcript,
    usage,
    ...(failed
      ? { error: 'agent_failed', errorDetail: text(change.error!) }
      : {}),
  };
  work.latestRun = { id: runId, status: run.status };
  work.history.unshift({
    at: at(started, -0.05),
    actor: owner,
    action: 'runQueued',
    runId,
    note: stages[0].name,
  });
  work.history.push({
    at: run.startedAt!,
    actor: 'system',
    action: 'runStarted',
    runId,
  });
  const changes = origin.endsWith('crm.acme.example') ? CRM_CHANGES : CHANGES;
  const repository = origin.endsWith('crm.acme.example')
    ? 'acme/crm'
    : 'acme/acme';
  const number = 3100 + changes.indexOf(change) * 7;
  const pr = {
    url: `https://github.com/${repository}/pull/${number}`,
    number,
    branch: `nocoreach/task-${change.key}`,
    files: [
      {
        path: `docs${change.path === '/' ? '/index' : change.path}.mdx`,
        additions: 4,
        deletions: 1,
      },
    ],
    checks: {
      ok: true,
      summary:
        lang === 'zh' ? '构建和链接检查通过' : 'Build and link checks passed',
    },
    release: text(change.note),
    verifyText: text(change.after).slice(0, 40),
    pages: [origin + change.path],
    visibleChanges: [
      {
        page: origin + change.path,
        label: text(change.label),
        before: text(change.before),
        after: text(change.after),
      },
    ],
  };
  let artifact: Artifact | undefined;
  if (!failed) {
    artifact = {
      id: `editorial-${change.key}`,
      planVersion: 0,
      stepId: stages[0].key,
      version: 1,
      createdAt: at(started, 0.1),
      createdBy: 'agent',
      runId,
      content: `${content.notice}# ${text(change.title)}\n\n**${text(change.label)}**\n\n| ${lang === 'zh' ? '修改前' : 'Before'} | ${lang === 'zh' ? '修改后' : 'After'} |\n| --- | --- |\n| ${text(change.before)} | ${text(change.after)} |\n\n${story.caseStudy.document}\n\n## ${lang === 'zh' ? '复核清单与边界' : 'Review checklist and limits'}\n\n${story.caseStudy.checks}\n\n${story.caseStudy.limitation}`,
      pr,
      ...(index > 1
        ? { approvedAt: at(change.age - 1.5), approvedBy: owner }
        : {}),
    };
    work.results = [artifact];
    run.artifactId = artifact.id;
    work.history.push({
      at: artifact.createdAt,
      actor: 'system',
      action: 'runSucceeded',
      runId,
      artifactId: artifact.id,
      stageKey: stages[0].key,
    });
    if (artifact.approvedAt)
      work.history.push({
        at: artifact.approvedAt,
        actor: owner,
        action: 'approveStage',
        stageKey: stages[1].key,
        artifactId: artifact.id,
      });
  } else {
    work.history.push(
      {
        at: run.endedAt!,
        actor: 'system',
        action: 'runFailed',
        runId,
        note: text(change.error!),
      },
      {
        at: at(started, 0.2),
        actor: owner,
        action: 'comment',
        comment: text(change.error!),
      },
    );
  }
  if (index >= 2) {
    const release: Release = {
      state: 'merging',
      note: text(change.note),
      pages: pr.pages,
      verifyText: pr.verifyText,
      pr: {
        number,
        url: pr.url,
        headSha: randomUUID().replaceAll('-', '').slice(0, 40),
      },
    };
    if (change.state === 'merge_failed')
      Object.assign(release, {
        state: 'merge_failed',
        error: text(change.error!),
      });
    if (change.state === 'verifying')
      Object.assign(release, {
        state: 'verifying',
        mergedAt: at(0, -3),
        checks: 2,
        lastCheckAt: at(0, -0.6),
        nextCheckAt: at(0, 0.4),
        deadline: at(-1),
      });
    if (change.state === 'not_seen')
      Object.assign(release, {
        state: 'not_seen',
        mergedAt: at(2),
        checks: 12,
        lastCheckAt: at(0, -2),
      });
    if (change.state === 'simulated')
      Object.assign(release, { state: 'simulated', pr: undefined });
    if (change.state === 'live') {
      Object.assign(release, {
        state: 'live',
        mergedAt: at(3, -2),
        liveAt: at(3),
        checks: 1,
        lastCheckAt: at(3),
      });
      work.observeFrom = context.clock.dateAgo(3);
      work.history.push({ at: at(3), actor: 'system', action: 'live' });
    }
    work.release = release;
    if (release.mergedAt)
      work.history.push({
        at: release.mergedAt,
        actor: owner,
        action: 'merged',
        note: `#${number}`,
      });
    if (release.state === 'not_seen')
      work.history.push({
        at: release.lastCheckAt!,
        actor: 'system',
        action: 'notSeen',
      });
    if (change.state === 'simulated')
      work.history.push({
        at: at(change.age - 2),
        actor: owner,
        action: 'simulatedRelease',
        note: text(change.note),
      });
  }
  work.history.sort((a: { at: string }, b: { at: string }) =>
    a.at.localeCompare(b.at),
  );
  return {
    work,
    artifact,
    runs: [run],
    createdAt: at(change.age),
    updatedAt: [
      at(Math.max(0, change.age - 2.5)),
      ...work.history.map((entry: { at: string }) => entry.at),
      work.release?.lastCheckAt || '',
      work.release?.mergedAt || '',
    ]
      .sort()
      .at(-1)!,
  };
}

/** The demo's page-change tasks, each standing in a different place on the way to going live. */
export async function writeChangeTasks(
  host: DemoHost,
  context: DemoImportContext,
  projectId: string,
  domain: string,
  people: Partial<Record<DemoPerson, string>>,
): Promise<void> {
  const content = demoContent(context.language);
  const lang = context.language === 'en-US' ? 'en' : 'zh';
  const repo = host.db.getRepository('nrSnapshots');
  await host.db.sequelize.transaction(async (transaction: unknown) => {
    for (const change of domain === 'crm.acme.example'
      ? CRM_CHANGES
      : CHANGES) {
      const built = build(
        context,
        people,
        `https://${domain}`,
        projectId,
        change,
      );
      const row = await host.db.getRepository('nrTasks').create({
        values: {
          projectId,
          taskKey: `nocoreach-demo:${projectId}:${change.key}`,
          title: change.title[lang],
          brief: `${content.notice}${(domain === 'crm.acme.example' ? content.secondTasks : content.stories).find((story) => story.path === change.path)!.brief}\n\n${lang === 'zh' ? '本轮页面改动' : 'Page change in this run'}: ${change.before[lang]} → ${change.after[lang]}`,
          status: {
            failed: '进行中',
            ready: '待确认',
            merge_failed: '待确认',
            verifying: '进行中',
            not_seen: '待确认',
            simulated: '已完成',
            live: '已完成',
          }[change.state],
          evidence: {
            simulated: true,
            demoEdition: 'nocoreach-demo',
            work: built.work,
          },
          createdAt: built.createdAt,
          updatedAt: built.updatedAt,
        },
        transaction,
      });
      const taskId = String(row.id);
      if (built.artifact)
        await repo.create({
          values: {
            key: `nr-task-artifact:${projectId}:${taskId}:${built.artifact.id}`,
            payload: built.artifact,
          },
          transaction,
        });
      for (const run of built.runs)
        await repo.create({
          values: {
            key: `nr-task-run:${projectId}:${taskId}:${run.id}`,
            payload: { ...run, taskId },
          },
          transaction,
        });
    }
  });
}

interface Exchange {
  ask: L;
  answer: L;
  failed?: L;
}
interface Conversation {
  person: DemoPerson | 'admin';
  age: number;
  title: L;
  turns: readonly Exchange[];
}

const CONVERSATIONS: Conversation[] = [0, 1, 3, 9].map((index, i) => {
  const story = ACME_STORIES[index];
  return {
    person: i === 3 ? 'growth' : 'admin',
    age: 1 + i * 2,
    title: ACME_DISCUSSIONS[index].title,
    turns: [
      { ask: ACME_DISCUSSIONS[index].title, answer: story.brief },
      {
        ask: t('下一步先验证什么？', 'What should we verify next?'),
        answer: i === 2 ? t('', '') : story.comments[1][1],
        ...(i === 2
          ? {
              failed: t(
                '模拟模型响应超时，这一轮未完成，可重新发送。',
                'The simulated model timed out; this turn did not finish and may be retried.',
              ),
            }
          : {}),
      },
    ],
  };
});

const CRM_CONVERSATIONS: Conversation[] = [0, 6, 9, 12].map((index, i) => {
  const story = CRM_STORIES[index];
  return {
    person: i === 3 ? 'growth' : 'admin',
    age: 1 + i * 2,
    title: story.title,
    turns: [
      { ask: story.brief, answer: story.draft ?? story.comments[0][1] },
      {
        ask: t('下一步先验证什么？', 'What should we verify next?'),
        answer: story.comments[1][1],
      },
    ],
  };
});

/** Earlier online Agent conversations for the importer and the growth lead, answered as the demo model would. */
export async function writeConversations(
  host: DemoHost,
  context: DemoImportContext,
  projectId: string,
  people: Partial<Record<DemoPerson, string>>,
  model: { modelService: string; model: string } | null,
  which: 'main' | 'second' = 'main',
): Promise<void> {
  const lang = context.language === 'en-US' ? 'en' : 'zh';
  const now = context.clock.now.getTime();
  const used = model ?? { modelService: 'demo', model: 'demo-chat' };
  const records = host.db.access!.database.connection().repository<{
    id: string;
    kind: string;
    ownerId: string;
    groupId: string;
    status: string;
    revision: number;
    payload: string;
  }>('nrOnlineAgentRecords');
  for (const conversation of which === 'main'
    ? CONVERSATIONS
    : CRM_CONVERSATIONS) {
    const ownerId =
      conversation.person === 'admin'
        ? context.actorId
        : people[conversation.person];
    if (!ownerId) continue;
    // The same id shapes the chat service gives its records.
    const id = `online-chat-${randomUUID()}`;
    const start = now - conversation.age * DAY;
    const runs: OnlineRun[] = conversation.turns.map((turn, i) => {
      const created = start + i * 6 * 60_000;
      const usage = {
        inputTokens: 3_200 + i * 1_400,
        outputTokens: turn.failed ? 0 : 420 + i * 90,
      };
      const output = turn.failed ? '' : turn.answer[lang];
      const requestId = randomUUID();
      return {
        id: `online-run-${requestId}`,
        agentId: 'online-default',
        agentName: 'Online Agent',
        requestHash: createHash('sha256').update(requestId).digest('hex'),
        ownerId,
        projectId,
        conversationId: id,
        sequence: i + 1,
        model: used,
        instructions: '',
        input: turn.ask[lang],
        status: turn.failed ? 'failed' : 'completed',
        createdAt: new Date(created).toISOString(),
        startedAt: new Date(created + 1_000).toISOString(),
        finishedAt: new Date(
          created + (turn.failed ? 120_000 : 9_000),
        ).toISOString(),
        deadline: null,
        holder: null,
        cancelRequested: false,
        output,
        events: turn.failed
          ? []
          : [
              { type: 'text', text: output },
              { type: 'usage', model: used.model, usage },
            ],
        usage,
        error: turn.failed ? turn.failed[lang] : null,
        revision: 0,
      };
    });
    const last = runs.at(-1)!;
    const record: OnlineConversation = {
      id,
      ownerId,
      projectId,
      agentId: 'online-default',
      model: used,
      title: conversation.title[lang],
      activeRunId: last.id,
      createdAt: new Date(start).toISOString(),
      updatedAt: last.finishedAt ?? last.createdAt,
      revision: 0,
    };
    await records.createOne({
      values: {
        id,
        kind: 'conversation',
        ownerId,
        groupId: '',
        status: '',
        revision: 0,
        payload: JSON.stringify(record),
      },
    });
    for (const run of runs)
      await records.createOne({
        values: {
          id: run.id,
          kind: 'run',
          ownerId,
          groupId: id,
          status: run.status,
          revision: 0,
          payload: JSON.stringify(run),
        },
      });
  }
}

/** Inbox messages a working week leaves: tasks waiting, a failed release, community questions; some already read. */
export async function writeNotifications(
  host: DemoHost,
  context: DemoImportContext,
  projectId: string,
  people: Partial<Record<DemoPerson, string>>,
  which: 'main' | 'second' = 'main',
): Promise<string[]> {
  const lang = context.language === 'en-US' ? 'en' : 'zh';
  const now = context.clock.now.getTime();
  const tasks = await host.db
    .getRepository('nrTasks')
    .find({ filter: { projectId } });
  const task = (key: string) => {
    const row = tasks.find((r) => String(r.get('taskKey')).endsWith(`:${key}`));
    return row
      ? { path: `/actions/${String(row.id)}`, title: String(row.get('title')) }
      : null;
  };
  const items: [
    person: DemoPerson | 'admin',
    hours: number,
    read: boolean,
    title: L,
    path: string,
    taskKey?: string,
  ][] = [
    [
      'admin',
      2,
      false,
      t(
        '{task}：发布失败，需要处理',
        '"{task}" failed to publish and needs you',
      ),
      '',
      'pricing-guests',
    ],
    [
      'admin',
      5,
      false,
      t(
        '{task}：等你看效果并发布',
        '"{task}" waits for you to check and publish',
      ),
      '',
      'home-project-management',
    ],
    [
      'admin',
      20,
      false,
      t('{task}：Agent 没有完成', 'The Agent did not finish "{task}"'),
      '',
      'fix-sync-example',
    ],
    [
      'admin',
      30,
      true,
      t(
        '社区有新的实施讨论待复核',
        'New implementation discussions need review',
      ),
      '/data/community',
    ],
    [
      'admin',
      52,
      true,
      t(
        '每日分析发现新的协作机会',
        'The daily analysis found new collaboration opportunities',
      ),
      '/opportunities',
    ],
    [
      'admin',
      76,
      true,
      t(
        '项目的 Google 历史数据同步完成',
        "The project's Google history finished syncing",
      ),
      '/website',
    ],
    [
      'growth',
      3,
      false,
      t(
        '{task}：等你看效果并发布',
        '"{task}" waits for you to check and publish',
      ),
      '',
      'home-project-management',
    ],
    [
      'growth',
      48,
      true,
      t('{editor} 评论了：{task}', '{editor} commented on "{task}"'),
      '',
      'home-project-management',
    ],
    [
      'content',
      2,
      false,
      t(
        '{task}：发布失败，需要处理',
        '"{task}" failed to publish and needs you',
      ),
      '',
      'pricing-guests',
    ],
    [
      'devrel',
      4,
      false,
      t(
        '{task}：上线后没在网站上看到改动',
        '"{task}" was not seen live after release',
      ),
      '',
      'approval-version',
    ],
    [
      'devrel',
      26,
      true,
      t(
        '{task}：已合并，等待网站更新',
        '"{task}" merged, waiting for the site to update',
      ),
      '',
      'timeline-baseline',
    ],
  ];
  const editor = demoContent(context.language).people.editor.name;
  const repo = host.db
    .access!.database.connection()
    .repository('notificationInAppItems');
  const ids: string[] = [];
  for (const [person, hours, read, title, path, key] of items) {
    const userId = person === 'admin' ? context.actorId : people[person];
    if (!userId) continue;
    const index = key ? CHANGES.findIndex((change) => change.key === key) : -1;
    const targetKey =
      which === 'second' && index >= 0 ? CRM_CHANGES[index].key : key;
    const target = targetKey ? task(targetKey) : null;
    if (key && !target) continue;
    if (which === 'second' && person === 'devrel') continue;
    const route = target?.path ?? path;
    const at = new Date(now - hours * HOUR).toISOString();
    const id = randomUUID();
    ids.push(id);
    await repo.createOne({
      values: {
        id,
        deliveryId: randomUUID(),
        notificationId: `${DEMO_NOTIFICATION}${randomUUID().slice(0, 18)}`,
        userId: String(userId),
        title: title[lang]
          .replace('{task}', target?.title ?? '')
          .replace('{editor}', editor),
        body: `${demoContent(context.language).projects[which].name}: ${target?.title ?? title[lang]}`,
        actionUrl: null,
        readAt: read ? new Date(now - (hours - 1) * HOUR).toISOString() : null,
        createdAt: at,
        updatedAt: at,
        target: route ? { type: 'route', path: route } : null,
      },
    });
  }
  return ids;
}

/** The business AI's calls over the last month — daily analysis, opportunity judging, summaries — on the demo model. */
export async function writeUsage(
  host: DemoHost,
  context: DemoImportContext,
  model: { modelService: string; model: string } | null,
): Promise<string[]> {
  if (!model) return [];
  const now = context.clock.now.getTime();
  const repo = host.db.access!.database.connection().repository('agModelUsage');
  const ids: string[] = [];
  for (let day = 30; day >= 1; day--) {
    const calls = [
      [6_800, 1_400],
      [4_100, 650],
      ...(day % 7 === 0 ? [[12_400, 2_300]] : []),
      ...(day % 3 === 0 ? [[2_600, 380]] : []),
    ];
    for (const [i, [input, output]] of calls.entries()) {
      const id = randomUUID();
      ids.push(id);
      const factor = context.clock.sample(`usage:${day}:${i}`) * 0.4 + 0.8;
      await repo.createOne({
        values: {
          id,
          purpose: 'text',
          source: 'nocoreach',
          modelService: model.modelService,
          model: model.model,
          inputTokens: Math.round(input * factor),
          outputTokens: Math.round(output * factor),
          units: 0,
          createdAt: new Date(now - day * DAY + (2 + i) * HOUR).toISOString(),
        },
      });
    }
  }
  return ids;
}

/** Tasks in every release state, conversations, inbox messages and model use, after the demo's other records. */
export async function writeActivity(
  host: DemoHost,
  context: DemoImportContext,
  projectId: string,
  domain: string,
  people: Partial<Record<DemoPerson, string>>,
  which: 'main' | 'second' = 'main',
): Promise<void> {
  await writeChangeTasks(host, context, projectId, domain, people);
  // Earlier conversations ran on the demo's own simulated model, never the global default.
  const service = host.demoModels?.serviceName;
  const model = service ? { modelService: service, model: 'demo-chat' } : null;
  await writeConversations(host, context, projectId, people, model, which);
  // Tracked, so a failed import removes them with its other writes.
  await context.track(
    'notificationInAppItems',
    await writeNotifications(host, context, projectId, people, which),
  );
  if (which === 'main')
    await context.track('agModelUsage', await writeUsage(host, context, model));
}
