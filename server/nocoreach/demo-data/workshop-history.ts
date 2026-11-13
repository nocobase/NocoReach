import { randomUUID } from 'node:crypto';

import type { DemoImportContext } from '@nocobase/app-plugin-demo-mode/server/tokens';

import { systemMessageText } from '../../../shared/i18n/messages.js';
import {
  SYSTEM_PLAYBOOKS,
  stagesFor,
} from '../../../shared/playbook-catalog.js';
import {
  FORM_PLAYBOOK,
  FORM_RESULT_KIND,
  repurposeBrief,
  sourceSubject,
  type Destination,
  type RepurposeSource,
} from '../../../shared/repurpose.js';
import { memoryOf } from '../execution/memory.js';
import {
  projectWork,
  type Artifact,
  type Run,
  type RunEvent,
} from '../execution/model.js';
import { playbookTitle } from '../execution/task-title.js';
import { ACME_PAGES } from './acme-content.js';
import type { DemoContent, DemoPerson } from './content.js';
import type { DemoHost } from './host.js';
import type { DemoData } from './steps.js';
import {
  WORKSHOP_BRAND,
  WORKSHOP_DRAFTS,
  WORKSHOP_TOPIC,
  type WorkshopDraft,
} from './workshop-content.js';
import type { L } from './world/script/types.js';

const DAY = 86_400_000;
const MINUTE = 60_000;

const PLAYBOOK_NAMES: Record<string, string> = {
  'x-posts': 'playbooks.xPosts',
  'linkedin-post': 'playbooks.linkedinPost',
  'community-post': 'playbooks.communityPost',
};

// How a destination reads in a task title, as the workshop names it (server/nocoreach/workshop.ts).
const titleDestination = (d: Destination) =>
  d.kind === 'reddit'
    ? `r/${d.subreddit}`
    : d.kind === 'hn'
      ? 'Hacker News'
      : `${d.name} · ${d.section}`;

/**
 * Content workshop for Acme: the brand kit's own community, the voice in Memory, and the posts the team adapted from
 * its articles and an event, two of them waiting for review. Each task is shaped as a workshop task the demo Agent
 * finished: the playbook's two steps, one run with its transcript, and an approval for the finished ones.
 */
export async function writeWorkshop(
  host: DemoHost,
  content: DemoContent,
  context: DemoImportContext,
) {
  const data = context.data as DemoData;
  const id = data.projects!.main;
  const people = data.people ?? {};
  const lang = context.language === 'en-US' ? 'en' : 'zh';
  const locale = context.language;
  const origin = `https://${content.projects.main.domain}`;
  const now = context.clock.now.getTime();
  const at = (days: number, minutes = 0) =>
    new Date(now - days * DAY + minutes * MINUTE).toISOString();
  const snapshots = host.db.getRepository('nrSnapshots');

  const community = {
    name: WORKSHOP_BRAND.community.name[lang],
    url: WORKSHOP_BRAND.community.url,
    sections: [...WORKSHOP_BRAND.community.sections[lang]],
  };
  await snapshots.create({
    values: {
      key: `brand-kit:${id}`,
      payload: { revision: 1, community, updatedAt: at(9) },
    },
  });
  // The CRM project's one Trending now opportunity ("ai crm", growth-briefs.ts crmGrowthBriefs) was skipped in the
  // workshop two days ago, so its Content workshop opens on Library alone; Opportunities still lists it.
  await snapshots.create({
    values: {
      key: `workshop-skips:${data.projects!.second}`,
      payload: {
        skipped: {
          'editorial-opportunity-crm-growth-ai-crm': {
            at: at(2),
            by: String(context.actorId),
          },
        },
      },
    },
  });
  await host.projects.update(
    id,
    (project: Record<string, unknown>) => {
      const topics = (project.memory as { topics?: unknown } | undefined)
        ?.topics;
      return {
        ...project,
        memory: {
          ...memoryOf(project),
          ...(Array.isArray(topics) ? { topics } : {}),
          voice: WORKSHOP_BRAND.voice[lang],
        },
      };
    },
    undefined,
  );

  // The event two weeks from now, as people write its date.
  const [year, month, day] = context.clock.dateAgo(-13).split('-').map(Number);
  const date: L = {
    zh: `${month} 月 ${day} 日`,
    en: new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day))),
  };
  const topic = {
    kind: 'topic' as const,
    topic: WORKSHOP_TOPIC.topic(date)[lang],
    points: WORKSHOP_TOPIC.points[lang],
    links: [...WORKSHOP_TOPIC.links],
  };
  const sourceOf = (d: WorkshopDraft): RepurposeSource => {
    if (d.source.kind === 'topic') return topic;
    const path = d.source.path;
    const page = ACME_PAGES.find((p) => p.path === path)!;
    return { kind: 'article', url: origin + path, title: page.title[lang] };
  };
  const destinationOf = (d: WorkshopDraft): Destination | undefined => {
    const place = d.destination;
    if (!place) return undefined;
    if (place.kind === 'own')
      return {
        kind: 'own',
        name: community.name,
        url: community.url,
        section: community.sections[place.section],
      };
    if (place.kind === 'reddit')
      return {
        kind: 'reddit',
        subreddit: place.subreddit,
        ...(place.discussions
          ? { discussions: place.discussions, weeks: 4 }
          : {}),
      };
    return { kind: 'hn' };
  };
  const personName = (person: DemoPerson) => content.people[person].name;
  const words = (zh: string, en: string) => (lang === 'en' ? en : zh);

  await host.db.sequelize.transaction(async (transaction: unknown) => {
    for (const d of WORKSHOP_DRAFTS) {
      const p = SYSTEM_PLAYBOOKS.find((x) => x.id === FORM_PLAYBOOK[d.form])!;
      const stages = stagesFor(p);
      const [adapt, review] = stages;
      const owner = people[d.owner] ?? context.actorId;
      const ownerName = personName(d.owner);
      // The owner reviews their own adaptation, as the task's review step names them.
      const reviewer = owner;
      const source = sourceOf(d);
      const destination = destinationOf(d);
      const subject = destination
        ? `${sourceSubject(source)} → ${titleDestination(destination)}`
        : sourceSubject(source);
      const repurpose = {
        form: d.form,
        source,
        ...(destination ? { destination } : {}),
      };
      const brief = repurposeBrief(repurpose, locale);
      const draft = d.draft[lang]
        .replaceAll('{date}', date[lang])
        .replaceAll('{name}', ownerName);

      const queued = at(d.created, 1);
      const started = at(d.created, 1.2);
      const ended = at(d.created, 4 + (d.key.length % 4));
      const runId = randomUUID();
      const artifact: Artifact = {
        id: `workshop-${d.key}`,
        stepId: adapt.key,
        planVersion: 0,
        version: 1,
        content: draft,
        createdAt: ended,
        createdBy: 'agent',
        runId,
        ...(d.approved !== undefined
          ? { approvedAt: at(d.approved), approvedBy: reviewer }
          : {}),
      };
      const usage = {
        inputTokens: 5200 + draft.length * 3,
        outputTokens: 600 + Math.round(draft.length / 2),
      };
      const transcript: RunEvent[] = [
        { type: 'status', content: 'running' },
        {
          type: 'thinking',
          content: words(
            '先读任务说明：要改编成什么形式、发到哪里。',
            'Reading the brief first: which form to write and where it goes.',
          ),
        },
        source.kind === 'article'
          ? {
              type: 'toolUse',
              tool: 'WebFetch',
              input: { url: source.url, prompt: 'Read the article' },
            }
          : {
              type: 'toolUse',
              tool: 'Bash',
              input: { command: 'nocoreach task data' },
            },
        {
          type: 'toolResult',
          tool: source.kind === 'article' ? 'WebFetch' : 'Bash',
          output:
            source.kind === 'article'
              ? `# ${source.title}`
              : [
                  source.kind === 'topic' ? source.topic : source.headline,
                  source.points,
                ].join('\n\n'),
        },
        {
          type: 'thinking',
          content: words(
            '按 Memory 里的语气写，只用原文里有的事实；数字照原文，不加新的。',
            'Writing in the voice from Memory, using only facts from the source; figures as the source gives them.',
          ),
        },
        {
          type: 'toolUse',
          tool: 'Write',
          input: { file_path: 'result.md', content: draft.slice(0, 400) },
        },
        {
          type: 'toolResult',
          tool: 'Write',
          output: words(
            `已写入 result.md（${draft.length} 个字符）`,
            `Wrote result.md (${draft.length} characters)`,
          ),
        },
        {
          type: 'text',
          content: words(
            '初稿已提交，请在任务页审核。',
            'The draft is in; review it on the task page.',
          ),
        },
        { type: 'usage', meta: usage },
        { type: 'status', content: 'completed' },
      ].map((event, i, all) => ({
        ...event,
        seq: i + 1,
        at: new Date(
          Date.parse(started) +
            ((Date.parse(ended) - Date.parse(started)) * i) / (all.length - 1),
        ).toISOString(),
      }));
      const run: Run = {
        id: runId,
        projectId: id,
        taskId: '',
        planVersion: 0,
        stepId: adapt.key,
        baseArtifactId: null,
        ownerId: owner,
        actor: owner,
        inputVersion: 1,
        capabilitySnapshot: [],
        status: 'succeeded',
        createdAt: queued,
        startedAt: started,
        endedAt: ended,
        input: JSON.stringify({
          mode: 'plan',
          step: 'analyze',
          resultKind: FORM_RESULT_KIND[d.form],
          title: '',
          repurpose: { form: d.form, source, destination },
        }),
        model: { llmService: 'demo', model: 'demo-agent' },
        flowStage: 0,
        mode: 'plan',
        simulated: true,
        demoAgentId: 'nocoreach.runner',
        agentName: 'NocoReach Demo Agent',
        transcript,
        usage,
        artifactId: artifact.id,
      };

      // The playbook as the demo's language names it, in the task and its activity.
      const playbookName = systemMessageText(PLAYBOOK_NAMES[p.id], {}, locale);
      const work = projectWork({});
      Object.assign(work, {
        playbookId: p.id,
        playbook: {
          id: p.id,
          name: playbookName,
          kind: p.kind,
          version: p.version,
          next: [...p.next],
          system: true,
          edited: false,
          form: p.form,
        },
        flow: {
          id: p.id,
          name: playbookName,
          version: p.version,
          stages,
          system: true,
          edited: false,
        },
        repurpose,
        humanOwnerId: owner,
        humanOwnerName: ownerName,
        note: '',
        startedPages: [],
        stage: d.state === 'done' ? 'done' : 'flow',
        step: 0,
        stageIndex: d.state === 'done' ? 2 : 1,
        results: [artifact],
        latestRun: { id: runId, status: 'succeeded' },
        history: [
          {
            at: at(d.created),
            actor: owner,
            actorName: ownerName,
            action: 'startTask',
            stage: 'plan',
            step: 0,
            note: playbookName,
          },
          {
            at: queued,
            actor: owner,
            actorName: ownerName,
            action: 'runQueued',
            runId,
            stageKey: adapt.key,
            note: adapt.name,
          },
          { at: started, actor: 'system', action: 'runStarted', runId },
          {
            at: ended,
            actor: 'system',
            action: 'runSucceeded',
            runId,
            artifactId: artifact.id,
          },
          ...(d.approved !== undefined
            ? [
                {
                  at: at(d.approved),
                  actor: reviewer,
                  actorName: ownerName,
                  action: 'approveStage',
                  stageKey: review.key,
                  artifactId: artifact.id,
                },
              ]
            : []),
        ],
      });
      const row = await host.db.getRepository('nrTasks').create({
        values: {
          projectId: id,
          taskKey: `nocoreach-demo:${id}:workshop-${d.key}`,
          title: playbookTitle(p, subject.slice(0, 160), locale),
          brief: `${content.notice}${brief}`,
          // Stored status values stay the classic Chinese ones in every language.
          status: d.state === 'done' ? '已完成' : '待确认',
          evidence: {
            origin: 'workshop',
            source: 'workshop',
            createdBy: { id: owner, name: ownerName },
            autoTitle: { subject: subject.slice(0, 160), locale },
            suggestedPlaybook: p.id,
            simulated: true,
            demoEdition: 'nocoreach-demo',
            work,
          },
          createdAt: at(d.created),
          updatedAt: d.approved !== undefined ? at(d.approved) : ended,
        },
        transaction,
      });
      const taskId = String(row.id);
      await snapshots.create({
        values: {
          key: `nr-task-artifact:${id}:${taskId}:${artifact.id}`,
          payload: artifact,
        },
        transaction,
      });
      await snapshots.create({
        values: {
          key: `nr-task-run:${id}:${taskId}:${runId}`,
          payload: { ...run, taskId },
        },
        transaction,
      });
      if (d.approved !== undefined)
        await snapshots.create({
          values: {
            key: `nr-task-review:${id}:${taskId}:${randomUUID()}`,
            payload: {
              kind: 'stage',
              stageKey: review.key,
              stageIndex: 1,
              artifactVersionId: artifact.id,
              decision: 'approve',
              checklist: [],
              reviewerId: reviewer,
              at: at(d.approved),
            },
          },
          transaction,
        });
    }
  });
}
