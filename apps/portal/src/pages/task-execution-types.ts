import type { Plan } from './task-work-model';
import type { FlowSnapshot, PlaybookSnapshot } from './playbook-model';
export type Artifact = { id:string; stepId:string; planVersion:number; version:number; content:string; createdAt:string; createdBy:string; runId?:string; legacy?:boolean; manual?:boolean; approvedAt?:string; rejectedAt?:string; pr?:PullRequestInfo };
export type PullRequestInfo = { url:string; number:number; branch:string; headSha?:string; files:{path:string;additions:number;deletions:number}[]; checks?:{ok:boolean;summary:string}; outOfScope?:string[] };
export type Run = { id:string; status:string; planVersion:number; stepId:string; executorId:string; executorKind?:string; cancelRequested?:boolean; mode?:string; createdAt:string; endedAt?:string; error?:string; artifactId?:string; model?:{model:string}; usage?:{inputTokens?:number;outputTokens?:number} };
export type Work = { playbookId?:string; playbook?:PlaybookSnapshot; prevTaskId?:string; nextTaskId?:string; flowId?:string; flow?:FlowSnapshot; stageIndex?:number; note?:string; observeFrom?:string; schemaVersion?:number; boardState?:BoardState;sortOrder?:number;simple?:boolean;kind?:'content'|'research';contentId?:string; revision:number; stage:string; plan:Plan|null; planVersion:number; step:number; results:(Artifact|null)[]; history:{at:string;actor?:string;action:string;previous?:unknown;comment?:string;note?:string;runId?:string;artifactId?:string;stageKey?:string}[]; receipt?:{note:string;url:string}; verification?:{note:string;outcome:string}; humanOwnerId?:string;humanOwnerName?:string;latestRun?:{id:string;status:string} };
export type TaskData = {task:{id:number;title:string;brief:string;evidence?:Record<string,unknown>};work:Work;runs:Run[];artifacts:Artifact[];reviews:{artifactVersionId?:string;decision:string;comment?:string;at:string;kind?:string;stageKey?:string;checklist?:string[]}[];playbookDefault?:string;related?:{id:number;title:string;relation:'prev'|'next'}[];agentEvents?:{at:string;type:string;text:string}[];agent?:{repo:{repo:string;baseBranch:string}|null;online:boolean}};
export const runLabels:Record<string,string>={queued:'排队中',running:'执行中',succeeded:'执行成功',failed:'执行失败'};
export function taskStage(w:Work){return w.stage==='work'?(w.results[w.step]&&!w.results[w.step]?.rejectedAt?'review':'work'):w.stage;}
export const stageLabels:Record<string,string>={plan:'待确认方案',work:'待推进',review:'待审核',execution:'待执行',verification:'待验证',done:'已完成'};

export type BoardState='todo'|'doing'|'review'|'done';
export const workColumns:Record<BoardState,string>={todo:'待处理',doing:'进行中',review:'待确认',done:'已完成'};
export function workState(w?:Partial<Work>,legacyStatus?:string):BoardState {
 if(w?.boardState)return w.boardState;
 if(w?.stage==='done'||(!w&&legacyStatus==='已完成'))return 'done';
 if(w?.stage==='flow'){const kind=w.flow?.stages[w.stageIndex||0]?.kind;return kind==='review'||kind==='publish'?'review':'doing';}
 if(w?.stage==='verification')return w.receipt?.note?'done':'review';
 if(w?.stage==='execution')return 'review';
 if(w?.stage==='work')return w.results?.[w.step||0]&&!w.results[w.step||0]?.rejectedAt?'review':'doing';
 return 'todo';
}
