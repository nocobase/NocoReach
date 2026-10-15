import type { OnlineRun } from '../../shared/online-agent.js';
import {localizeWorkSnapshots} from './playbook-snapshot';
import type { MaterialNotice } from './task-detail/material-notices.js';
import type { AgentRunExecution, RunTranscriptEvent } from '#components/agent-run-history';
import { $t } from "#i18n";
import type { Plan } from './task-work-model';
import type { FlowSnapshot, PlaybookSnapshot } from './playbook-model';
export type Artifact = { report?:{kind:string;sources:{title:string;url:string}[];asOf:string;uncertainties:string[]}; id:string; stepId:string; planVersion:number; version:number; content:string; createdAt:string; createdBy:string; runId?:string; legacy?:boolean; manual?:boolean; approvedAt?:string; rejectedAt?:string; pr?:PullRequestInfo };
export type FileChange = { path:string; before:string; after:string; truncated?:boolean };
export type PullRequestInfo = { url:string; number:number; branch:string; headSha?:string; files:{path:string;additions:number;deletions:number}[]; checks?:{ok:boolean;summary:string}; outOfScope?:string[]; release?:string; verifyText?:string; pages?:string[]; changes?:FileChange[]; previewUrl?:string };
export type Release = { state:'simulated'|'merging'|'merge_failed'|'verifying'|'not_seen'|'live'; pr?:{number:number;url:string;headSha:string}; note:string; pages:string[]; verifyText?:string; error?:string; mergedAt?:string; mergeSha?:string; checks?:number; lastCheckAt?:string; nextCheckAt?:string; deadline?:string; liveAt?:string; reason?:string };
export type Run = { pluginRunId?:string;onlineRunId?:string;agentType?:'online'|'runner';errorDetail?:string; agentId?:string;agentName?:string;id:string; status:string; planVersion:number; stepId:string; executorId:string; executorKind?:string; cancelRequested?:boolean; mode?:string; createdAt:string; endedAt?:string; error?:string; artifactId?:string; model?:{model:string}; usage?:{inputTokens?:number;outputTokens?:number} };
export type Work = { agentId?:string;agentName?:string;cancelledAt?:string; cancelledBy?:string; archivedAt?:string; archivedBy?:string; prClose?:{number:number;state:'closing'|'closed'|'failed';error?:string}; revert?:{of:number;state:'opening'|'opened'|'failed';number?:number;url?:string;at?:string;error?:string}; release?:Release; collaborators?:{id:string;name:string}[]; page?:{url:string;title:string}; playbookId?:string; playbook?:PlaybookSnapshot; prevTaskId?:string; nextTaskId?:string; flowId?:string; flow?:FlowSnapshot; stageIndex?:number; note?:string; observeFrom?:string; observation?:{results:import('./effect-model').EffectResult[]}; schemaVersion?:number; boardState?:BoardState;sortOrder?:number;simple?:boolean;kind?:'content'|'research';contentId?:string; revision:number; stage:string; plan:Plan|null; planVersion:number; step:number; results:(Artifact|null)[]; history:{at:string;actor?:string;action:string;previous?:unknown;comment?:string;note?:string;runId?:string;artifactId?:string;stageKey?:string}[]; receipt?:{note:string;url:string}; verification?:{note:string;outcome:string}; humanOwnerId?:string;humanOwnerName?:string;latestRun?:{id:string;status:string} };
export type TaskData = {onlineExecution?:OnlineRun;savedDraft?:{content:string;savedAt:string}|null;execution?:{runId:string;run:{startedAt?:string|null;finishedAt?:string|null;executions?:AgentRunExecution[]};events:RunTranscriptEvent[];truncated:boolean;canInspect:boolean};sources?:{capturedAt:string;topics:{id:string;title:string;url:string;complete:boolean;posts:unknown[];missing:MaterialNotice[]}[];warnings:MaterialNotice[]};task:{id:number;title:string;brief:string;evidence?:Record<string,unknown>};work:Work;runs:Run[];artifacts:Artifact[];reviews:{artifactVersionId?:string;decision:string;comment?:string;at:string;kind?:string;stageKey?:string;checklist?:string[]}[];playbookDefault?:string;related?:{id:number;title:string;relation:'prev'|'next'}[];agentEvents?:{at:string;type:string;text:string}[];agent?:{repo:{repo:string;baseBranch:string}|null;online:boolean;agentId?:string|null;defaultAgentId?:string|null;options?:{id:string;name:string;type?:'online'|'runner';online?:boolean}[]}};
export const getRunLabels = (): Record<string,string> => ({queued:$t('common.queued'),running:$t('common.running'),succeeded:$t('common.runSucceeded'),failed:$t('common.runFailed')});
export function taskStage(w:Work){return w.stage==='work'?(w.results[w.step]&&!w.results[w.step]?.rejectedAt?'review':'work'):w.stage;}
export const getStageLabels = (): Record<string,string> => ({plan:$t('taskExecution.planConfirm'),work:$t('taskExecution.moveForward'),review:$t('common.awaitingReview'),execution:$t('taskExecution.run'),verification:$t('common.notVerified'),done:$t('common.completed')});

export type BoardState='todo'|'doing'|'review'|'done';
export const getWorkColumns = (): Record<BoardState,string> => ({todo:$t('common.pending'),doing:$t('common.inProgress'),review:$t('common.needsConfirmation'),done:$t('common.completed')});
export {taskState as workState} from '../../shared/task-pending.js';

// Task lifecycle (SPEC §6.2): one action, 关闭任务. A task that is under way is stopped (cancelTask: the executor stops,
// an unmerged PR is closed); anything else — not started, done, or live and being observed — is put away (archiveTask).
// Only tasks put away can be reopened; a stopped task cannot continue.
export const isClosed=(w?:Partial<Work>)=>Boolean(w?.cancelledAt||w?.archivedAt);
export const isLive=(w?:Partial<Work>)=>w?.stage==='flow'&&w.flow?.stages[w.stageIndex||0]?.kind==='observe';
export function canCancel(w?:Partial<Work>){return Boolean(w&&!w.cancelledAt&&!w.archivedAt&&w.stage!=='done'&&!isLive(w)&&(w.flow||w.plan||w.simple));}
export function canArchive(w?:Partial<Work>){const started=w&&(w.stage==='flow'||(w.stage==='work'&&w.plan)||w.stage==='execution'||w.stage==='verification');return Boolean(!w?.archivedAt&&(!started||w?.cancelledAt||w?.stage==='done'||isLive(w)));}
export function closeCommand(w?:Partial<Work>):'cancelTask'|'archiveTask'|null{if(isClosed(w))return null;if(canArchive(w))return 'archiveTask';if(canCancel(w))return 'cancelTask';return null;}
export const canReopen=(w?:Partial<Work>)=>Boolean(w?.archivedAt&&!w.cancelledAt);
export const closedLabel=(w?:Partial<Work>)=>isClosed(w)?$t('common.closed'):'';
// Where a closed task stood when it was closed.
export function closedWhen(w?:Partial<Work>){
 if(!w)return '';
 w=localizeWorkSnapshots(w);
 if(w.cancelledAt){const st=w.flow?.stages[w.stageIndex||0];return st?$t('taskExecution.stopped',{0:st.name}):$t('taskExecution.stoppedWhileProgress');}
 if(w.archivedBy==='system')return $t('taskExecution.oldWorkflowArchivedSystem');
 if(w.stage==='done'||isLive(w))return $t('common.completed');
 return $t('common.notStarted');
}
export const getCloseConfirm = () => ($t('taskExecution.executorStopsUnmergedPrsClosed'));

export function hasTaskAgent(data: TaskData) {
  return Boolean(
    data.agent?.agentId &&
    data.agent.options?.some((agent) => agent.id === data.agent?.agentId),
  );
}
