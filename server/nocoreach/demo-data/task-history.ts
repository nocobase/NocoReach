import { randomUUID } from 'node:crypto';

import type { DemoImportContext } from '@nocobase/app-plugin-demo-mode/server/tokens';

import type { Artifact, Run, RunEvent, Work } from '../execution/model.js';
import type { DemoContent } from './content.js';
import type { DemoTaskStory } from './editorial.js';

const HOUR = 3_600_000;

/** Persisted simulated runs use the same task execution reader as visitor-started demo runs. */
export function taskHistory(
  context: DemoImportContext,
  content: DemoContent,
  projectId: string,
  story: DemoTaskStory,
  work: Work,
  createdAt: string,
  updatedAt: string,
) {
  const runs: Run[] = [];
  const artifacts = work.results.filter(Boolean) as Artifact[];
  const reviews: Record<string, unknown>[] = [];
  if (story.state === 'todo' || !artifacts.length)
    return { runs, artifacts, reviews };
  const en = context.language === 'en-US';
  const words = (zh: string, english: string) => (en ? english : zh);
  const owner = work.humanOwnerId || context.actorId;
  const reviewer =
    (context.data as { people?: { editor?: string } }).people?.editor || owner;
  const final = artifacts[0];
  const finish = final
    ? Date.parse(final.createdAt)
    : Date.parse(createdAt) + 24 * HOUR;
  const at = (offset: number) => new Date(finish + offset * HOUR).toISOString();
  const revised = Boolean(story.previousDraft);
  const study = story.caseStudy;
  const firstComment = (work.history as { action: string; at: string }[]).find(
    (entry) => entry.action === 'comment',
  );
  if (firstComment)
    firstComment.at = new Date(
      Date.parse(createdAt) + 0.1 * HOUR,
    ).toISOString();
  work.history.push(
    {
      at: new Date(Date.parse(createdAt) + 0.2 * HOUR).toISOString(),
      actor: owner,
      action: 'linkPage',
      note: work.page?.url,
    },
    {
      at: new Date(Date.parse(createdAt) + 0.3 * HOUR).toISOString(),
      actor: owner,
      action: 'startTask',
      stage: 'plan',
      step: 0,
      note: work.flow?.name,
    },
  );
  const run = (end: number, artifact: Artifact, previous?: Artifact) => {
    const id = randomUUID();
    const duration =
      (72 +
        Math.round(
          context.clock.sample(`duration:${story.key}:${runs.length}`) * 346,
        )) /
      3600;
    const start = end - duration;
    const usage = {
      inputTokens: Math.round(
        1800 + context.clock.sample(`in:${story.key}:${runs.length}`) * 17500,
      ),
      outputTokens: Math.round(
        850 + context.clock.sample(`out:${story.key}:${runs.length}`) * 3100,
      ),
    };
    const event = (
      fraction: number,
      value: Omit<RunEvent, 'seq' | 'at'>,
    ): RunEvent => ({
      seq: 0,
      at: at(start + duration * fraction),
      ...value,
    });
    const transcript = [
      event(0, { type: 'status', content: 'running' }),
      event(0.08, {
        type: 'text',
        content: words('本轮目标：', 'This run: ') + study.decision,
      }),
      event(0.15, {
        type: 'toolUse',
        tool: 'task data',
        input: { projectId, page: work.page?.url, scope: 'task-materials' },
      }),
      event(0.3, {
        type: 'toolResult',
        tool: 'task data',
        output: {
          brief: story.originalBrief,
          source: work.page?.url,
          evidence: study.evidence,
          limitations: study.limitation,
        },
      }),
      event(0.34, {
        type: 'toolUse',
        tool: 'Read',
        input: {
          source: work.page?.url,
          section: 'working-example',
          simulated: true,
        },
      }),
      event(0.39, { type: 'toolResult', tool: 'Read', output: study.document }),
      event(0.45, {
        type: 'text',
        content: previous ? study.revision : study.evidence,
      }),
      event(0.5, {
        type: 'toolUse',
        tool: 'Review checklist',
        input: {
          checks: study.checks,
          source: work.page?.url,
          simulated: true,
        },
      }),
      event(0.55, {
        type: 'toolResult',
        tool: 'Review checklist',
        output: {
          checks: study.checks,
          limitation: study.limitation,
          decision: 'ready-for-human-review',
        },
      }),
      event(0.6, {
        type: 'toolUse',
        tool: 'task draft',
        input: { artifactId: artifact.id, content: artifact.content },
      }),
      event(0.85, {
        type: 'toolResult',
        tool: 'task draft',
        output: {
          saved: true,
          artifactId: artifact.id,
          version: artifact.version,
        },
      }),
      event(0.94, {
        type: 'text',
        content:
          words('稿件已保存，等待人工核对。', 'Draft saved for human review.') +
          '\n\n' +
          artifact.content,
      }),
      event(0.98, { type: 'usage', meta: usage }),
      event(1, { type: 'status', content: 'completed' }),
    ].map((e, i) => ({ ...e, seq: i + 1 }));
    const record: Run = {
      id,
      projectId,
      taskId: '',
      planVersion: 0,
      stepId: 'draft',
      baseArtifactId: previous?.id || null,
      ...(previous?.rejectedAt ? { baseRejectedAt: previous.rejectedAt } : {}),
      ownerId: owner,
      actor: owner,
      inputVersion: 1,
      capabilitySnapshot: ['repo.read'],
      status: 'succeeded',
      createdAt: at(start - 0.02),
      startedAt: at(start),
      endedAt: at(end),
      input: JSON.stringify({
        title: story.title,
        brief: story.brief,
        page: work.page,
        previousArtifactId: previous?.id,
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
    if (artifact) {
      artifact.createdBy = 'agent';
      artifact.runId = id;
      delete artifact.manual;
    }
    work.history.push({
      at: record.createdAt,
      actor: owner,
      actorName: work.humanOwnerName,
      action: 'runQueued',
      runId: id,
      stageKey: 'draft',
      note: work.flow?.stages[0].name,
    });
    if (runs.length)
      work.history.push({
        at: record.createdAt,
        actor: owner,
        action: 'retryStage',
        runId: id,
        stageKey: 'draft',
      });
    work.history.push(
      {
        at: record.startedAt!,
        actor: 'system',
        action: 'runStarted',
        runId: id,
      },
      {
        at: record.endedAt!,
        actor: 'system',
        action: 'runSucceeded',
        runId: id,
        stageKey: 'draft',
        artifactId: artifact.id,
      },
    );
    runs.push(record);
    return record;
  };
  if (revised && final) {
    const previous: Artifact = {
      ...final,
      id: `${final.id}-v1`,
      version: 1,
      createdAt: at(-2),
      content: `${content.notice}# ${story.title}\n\n${story.previousDraft!}`,
      rejectedAt: at(-1.5),
      report: final.report ? { ...final.report, asOf: at(-2) } : undefined,
    };
    run(-2, previous);
    artifacts.unshift(previous);
    final.version = 2;
    const comment = study.review;
    reviews.push({
      kind: 'stage',
      stageKey: 'draft',
      stageIndex: 0,
      artifactVersionId: previous.id,
      decision: 'requestChanges',
      comment,
      reviewerId: reviewer,
      at: at(-1.5),
    });
    work.history.push({
      at: at(-1.5),
      actor: reviewer,
      actorName: content.people.editor.name,
      action: 'requestStageChanges',
      stageKey: 'review',
      artifactId: previous.id,
      comment,
    });
    run(0, final, previous);
    work.history.push({
      at: at(0.2),
      actor: owner,
      action: 'comment',
      comment: study.revision,
    });
  } else run(0, final);
  if (final && (story.rejected || story.state === 'done')) {
    const reviewAt =
      final.rejectedAt ||
      (work.history as { action: string; comment?: string; at: string }[]).find(
        (h) =>
          h.action === 'comment' &&
          h.comment?.startsWith(en ? 'Review complete.' : '审核完成'),
      )?.at ||
      updatedAt;
    if (!story.rejected)
      Object.assign(final, { approvedAt: reviewAt, approvedBy: reviewer });
    const comment = story.rejected ? study.review : undefined;
    reviews.push({
      kind: 'stage',
      stageKey: 'draft',
      stageIndex: 0,
      artifactVersionId: final.id,
      decision: story.rejected ? 'requestChanges' : 'approve',
      reviewerId: reviewer,
      at: reviewAt,
      checklist: story.rejected ? [] : ['facts'],
      ...(comment ? { comment } : {}),
    });
    work.history.push({
      at: reviewAt,
      actor: reviewer,
      actorName: content.people.editor.name,
      action: story.rejected ? 'requestStageChanges' : 'approveStage',
      stageKey: 'review',
      artifactId: final.id,
      ...(comment ? { comment } : {}),
    });
  }
  if (story.cancelled || story.archived)
    work.history.push({
      at: story.cancelled ? work.cancelledAt! : work.archivedAt!,
      actor: reviewer,
      action: story.cancelled ? 'cancelTask' : 'archiveTask',
      note: story.comments.at(-1),
    });
  const latest = runs.at(-1)!;
  work.latestRun = { id: latest.id, status: latest.status };
  work.history.sort((a: { at: string }, b: { at: string }) =>
    a.at.localeCompare(b.at),
  );
  return { runs, artifacts, reviews };
}
