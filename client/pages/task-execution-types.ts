import type { TaskResultSource } from '../../shared/task-result.js';
import type { ArticleDraft, ArticleSnapshot } from '../../shared/article-publishing.js';
import {localizeWorkSnapshots} from './playbook-snapshot';
import {stageName} from './playbook-model';
import {reopening} from '../../shared/task-reopen.js';
import type { MaterialNotice } from './task-detail/material-notices.js';
import type { AgentRunExecution, RunTranscriptEvent } from '#components/agent-run-history';
import { $t } from "#i18n";
import type { Plan } from './task-work-model';
import type { FlowSnapshot, PlaybookSnapshot } from './playbook-model';
export type Artifact = { report?:{kind:string;sources:TaskResultSource[];asOf:string;uncertainties:string[]}; id:string; stepId:string; planVersion:number; version:number; content:string; createdAt:string; createdBy:string; runId?:string; legacy?:boolean; manual?:boolean; approvedAt?:string; rejectedAt?:string; pr?:PullRequestInfo; article?:ArticleProposal };
// Article delivery (server/nocoreach/execution/article-flow.ts): the draft an article step proposes and its base.
export type FieldConflict = { field:string; base:string; current:string; draft:string };
export type ArticleProposal = { targetId:string; articleId:string|null; baseKey:string|null; baseVersion:string|null; draft:ArticleDraft; changes:string[]; conflicts?:FieldConflict[]; rebasedFrom?:string; carried?:string[]; also?:AlsoProposal[] };
// The same article for another target: what that target can hold (`skipped` left out), against its own base.
export type AlsoProposal = Omit<ArticleProposal,'also'|'rebasedFrom'> & { skipped:string[]; slug:string; title:string };
export type TargetState = 'publishing'|'published'|'exporting'|'exported'|'publish_failed'|'publish_conflict';
export type ReleaseArticle = { artifactId?:string; state?:TargetState; targetId:string; articleId:string|null; slug?:string; error?:string; errorStep?:'read'|'downstream'|'write'|'verify'; errorDetail?:string; errorAt?:string; published?:{articleId:string;slug:string;version:string;written:string[];at:string;adopted?:boolean}; conflict?:{reason:'changed'|'slug_taken'|'downstream'|'missing';at:string;currentKey?:string;fields?:FieldConflict[];divergence?:{path:string;field:string;git:string;target:string}[]}; exported?:{at:string;commit?:string}; drift?:{at:string;fields:{field:string;published:string;current:string}[];resolvedAt?:string} };
export type ArticleTargetRef = { id:string; name:string; kind:string; locales:string[]; capabilities:{concurrency:string}; status?:boolean; default?:boolean; pages?:Record<string,string|string[]> };
export type FileChange = { path:string; before:string; after:string; truncated?:boolean };
export type VisibleChange = { page:string; label:string; before:string; after:string };
export type PullRequestInfo = { url:string; number:number; branch:string; headSha?:string; files:{path:string;additions:number;deletions:number}[]; checks?:{ok:boolean;summary:string}; outOfScope?:string[]; protected?:string[]; release?:string; verifyText?:string; pages?:string[]; changes?:FileChange[]; visibleChanges?:VisibleChange[]; previewUrl?:string };
export type Release = { state:'simulated'|'merging'|'merge_failed'|'verifying'|'not_seen'|'live'|'publishing'|'publish_failed'|'publish_conflict'|'exporting'|'export_late'; article?:ReleaseArticle; also?:ReleaseArticle[]; pr?:{number:number;url:string;headSha:string}; note:string; pages:string[]; verifyText?:string; error?:string; mergedAt?:string; mergeSha?:string; checks?:number; lastCheckAt?:string; nextCheckAt?:string; deadline?:string; liveAt?:string; reason?:string };
export type Run = { pluginRunId?:string;simulated?:boolean;errorDetail?:string; agentId?:string;agentName?:string;id:string; status:string; planVersion:number; stepId:string; cancelRequested?:boolean; mode?:string; createdAt:string; endedAt?:string; error?:string; artifactId?:string; model?:{model:string}; usage?:{inputTokens?:number;outputTokens?:number}; restartedAt?:string; autoRetry?:{of:string;restartedAt:string}; failureReason?:string; partialAt?:string };
export type Work = { repo?:import('../../shared/repo-routing.js').TaskRepo|null;agentId?:string;agentName?:string;snooze?:import('../../shared/task-pending.js').TaskSnooze|null;cancelledAt?:string; cancelledBy?:string; archivedAt?:string; archivedBy?:string; prClose?:{number:number;state:'closing'|'closed'|'failed';error?:string}; revert?:{of:number;state:'opening'|'opened'|'failed';number?:number;url?:string;at?:string;error?:string}; release?:Release; collaborators?:{id:string;name:string}[]; page?:{url:string;title:string}; playbookId?:string; playbook?:PlaybookSnapshot; prevTaskId?:string; nextTaskId?:string; flowId?:string; flow?:FlowSnapshot; stageIndex?:number; note?:string; observeFrom?:string; observation?:{results:import('./effect-model').EffectResult[]}; schemaVersion?:number; boardState?:BoardState;sortOrder?:number;simple?:boolean;kind?:'content'|'research';contentId?:string; revision:number; stage:string; plan:Plan|null; planVersion:number; step:number; results:(Artifact|null)[]; history:{at:string;actor?:string;action:string;previous?:unknown;comment?:string;note?:string;runId?:string;artifactId?:string;stageKey?:string}[]; receipt?:{note:string;url:string}; verification?:{note:string;outcome:string}; humanOwnerId?:string;humanOwnerName?:string;latestRun?:{id:string;status:string}; article?:{targetId:string;articleId:string|null;slug:string;title:string;sourceKey:string|null;locales?:string[]}; delivery?:{kind:'article';targetId:string;articleId:string|null;sourceKey:string|null;also?:{targetId:string;articleId:string|null;sourceKey:string|null}[];locales?:string[];translateFrom?:{artifactId:string|null;at:string;published?:boolean}} };
// What a failed run got before it stopped (TaskService.partialOf): kept content, or a draft it saved.
export type PartialResult = {content:string;report?:Artifact['report'];savedAt?:string;draft?:true};
export type TaskData = {savedDraft?:{content:string;savedAt:string}|null;partial?:PartialResult|null;execution?:{runId:string;run:{startedAt?:string|null;finishedAt?:string|null;executions?:AgentRunExecution[];failureReason?:string|null;failureDetail?:string|null};events:RunTranscriptEvent[];truncated:boolean;canInspect:boolean};sources?:{capturedAt:string;topics:{id:string;title:string;url:string;complete:boolean;posts:unknown[];missing:MaterialNotice[]}[];warnings:MaterialNotice[]};task:{id:number;title:string;brief:string;evidence?:Record<string,unknown>};work:Work;runs:Run[];artifacts:Artifact[];reviews:{artifactVersionId?:string;decision:string;comment?:string;at:string;kind?:string;stageKey?:string;checklist?:string[]}[];playbookDefault?:string;articleTargets?:ArticleTargetRef[];articlePlaybookTargets?:Record<string,string>;articleBases?:Record<string,ArticleSnapshot>;related?:{id:number;title:string;relation:'prev'|'next'|'sibling';no?:number;state?:BoardState|'closed';pages?:string[]}[];agent?:{repo:import('../../shared/repo-routing.js').TaskRepo|null;repos?:(import('../../shared/repo-routing.js').RepoRef&{baseBranch:string;allowedPaths:string[]})[];online:boolean;agentId?:string|null;defaultAgentId?:string|null;options?:{id:string;name:string;type?:'runner'|'demo';online?:boolean;tool?:string|null}[]}};

export type BoardState='todo'|'doing'|'review'|'done';
export const getWorkColumns = (): Record<BoardState,string> => ({todo:$t('common.pending'),doing:$t('common.inProgress'),review:$t('common.needsConfirmation'),done:$t('common.completed')});
export {taskState as workState} from '../../shared/task-pending.js';

// Task lifecycle (SPEC §6.2): one action, Close task. A task that is under way is stopped (cancelTask: the executor
// stops, an unmerged PR is closed); anything else — not started, done, or live and being observed — is put away
// (archiveTask). Every closed task can be reopened (2026-10-29 user decision) and resumes where it was closed
// (shared/task-reopen.ts).
export const isClosed=(w?:Partial<Work>)=>Boolean(w?.cancelledAt||w?.archivedAt);
/** When a closed task was closed. */
export const closedAt=(w?:Partial<Work>)=>w?.cancelledAt||w?.archivedAt||'';
// Snoozed until a day (Snooze, 2026-10-28): out of Needs you, Current, the board and every count of what waits.
export const isSnoozed=(w?:Partial<Work>)=>Boolean(w?.snooze&&!isClosed(w)&&w.stage!=='done');
export const isLive=(w?:Partial<Work>)=>w?.stage==='flow'&&w.flow?.stages[w.stageIndex||0]?.kind==='observe';
export function canCancel(w?:Partial<Work>){return Boolean(w&&!w.cancelledAt&&!w.archivedAt&&w.stage!=='done'&&!isLive(w)&&(w.flow||w.plan||w.simple));}
export function canArchive(w?:Partial<Work>){const started=w&&(w.stage==='flow'||(w.stage==='work'&&w.plan)||w.stage==='execution'||w.stage==='verification');return Boolean(!w?.archivedAt&&(!started||w?.cancelledAt||w?.stage==='done'||isLive(w)));}
export function closeCommand(w?:Partial<Work>):'cancelTask'|'archiveTask'|null{if(isClosed(w))return null;if(canArchive(w))return 'archiveTask';if(canCancel(w))return 'cancelTask';return null;}
export const canReopen=(w?:Partial<Work>)=>isClosed(w);
export const closedLabel=(w?:Partial<Work>)=>isClosed(w)?$t('common.closed'):'';
// Where a closed task stood when it was closed.
export function closedWhen(w?:Partial<Work>){
 if(!w)return '';
 w=localizeWorkSnapshots(w);
 if(w.cancelledAt){const st=w.flow?.stages[w.stageIndex||0];return st?$t('taskExecution.stopped',{0:stageName(st,w)}):$t('taskExecution.stoppedWhileProgress');}
 if(w.archivedBy==='system')return $t('taskExecution.oldWorkflowArchivedSystem');
 if(w.stage==='done'||isLive(w))return $t('common.completed');
 return $t('common.notStarted');
}
export const getCloseConfirm = () => ($t('taskExecution.executorStopsUnmergedPrsClosed'));
// An Agent step reopened after the closing stopped it or withdrew its change, not started again yet: it waits for a
// person (Start this step again) rather than reading as a failure or as the Agent at work.
export function restartOf(w?:Partial<Work>):'stopped'|'withdrawn'|undefined{
 const st=w?.flow?.stages[w.stageIndex||0];if(!w||w.stage!=='flow'||st?.kind!=='agent'||isClosed(w))return;
 const h=w.history||[],i=h.map(e=>e.action).lastIndexOf('unarchiveTask'),e=h[i];
 if(!e||e.stageKey!==st.key||(e.note!=='stopped'&&e.note!=='withdrawn'))return;
 return h.slice(i+1).some(x=>x.action==='runQueued'||x.action==='recordManual')?undefined:e.note;
}
// What Reopen does, on the closed card: where the task goes back to, as the server moves it (shared/task-reopen.ts).
export function reopenHint(w:Work,runs:Run[]){
 const back=reopening(w,runs);w=localizeWorkSnapshots(w);
 if(back.wait)return $t('taskExecution.reopenAfterStopping');
 const st=back.stageIndex===undefined?undefined:w.flow?.stages[back.stageIndex];
 if(st){const name=stageName(st,w);return back.restart?$t(back.restart==='withdrawn'?'taskExecution.reopenResubmit':'taskExecution.reopenRestart',{0:name}):$t(st.kind==='review'?'taskExecution.reopenToReview':'taskExecution.reopenTo',{0:name});}
 if(w.archivedBy==='system'||w.plan||w.simple)return $t('taskExecution.reopenToStep');
 return $t(w.stage==='done'||isLive(w)?'taskExecution.reopenToDone':'taskExecution.reopenToStart');
}

export function hasTaskAgent(data: TaskData) {
  return Boolean(
    data.agent?.agentId &&
    data.agent.options?.some((agent) => agent.id === data.agent?.agentId),
  );
}
