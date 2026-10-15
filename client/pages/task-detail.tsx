import {matchesObservation} from '../../shared/result-comparison.js';
import { mockSettingsAvailable } from '../../app-plugins/nocoreach-mock/client/index.js';
import { localizeWorkSnapshots } from './playbook-snapshot';
import { reportDate } from './task-detail/material-notices.js';
import { TaskExecutionPanel } from './task-detail/execution-panel.js';
import { TaskMedia } from './task-detail/media.js';
import { TaskAgentField } from './task-detail/agent-field';
import { hasTaskAgent } from './task-execution-types';
import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {refreshNavBadges} from '#components/app-shell/nav-badges';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {useNavigationGuard} from '@nocobase/app-client';
import {Comparison} from './results/comparison.js';
import {ResultSourcePanel} from './results/source.js';
import type {ResultSource} from './results/types.js';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Lock,Archive,ArchiveRestore,Ban,Play,Bot,Check,RotateCcw,AlertCircle,Link2,UserRound,Rocket,Pencil,ArrowRightLeft,Move,FileText,GitPullRequest,GitMerge,Globe,Eye,Search,ExternalLink,Users,Square,Undo2} from 'lucide-react';
import {ActorAvatar} from '#components/reach/actor';
import {Tag,stateToneOf} from '#components/reach/tag';
import {Button} from '#components/ui/button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuCheckboxItem} from '#components/ui/dropdown-menu';
import {ReachDetailLayout} from '#components/reach-detail-layout';
import {TaskDraftScope,TaskDraftRecovery} from './task-detail/drafts.js';
import {useTaskDraft,useTaskDraftStatus} from './task-detail/draft-store.js';
import {DocView,DocReader} from './doc-view';
import {ChangeView} from './change-view';
import {effectItems,effectLine,effectPages,latestEffect,type EffectResult} from './effect-model';
import {getWorkColumns,workState,closeCommand,canReopen,closedWhen,getCloseConfirm,closedLabel,type TaskData as Data,type Work,type Artifact,type PullRequestInfo} from './task-execution-types';
import {playbookRequest,localizePlaybookList,getCategories,categoryName,getStageExecutor,stageName as displayStageName,stagesFor,producesOutput,readsOnly,withoutRepo,eventText,type PlaybookList,type Stage} from './playbook-model';
import './strategy/strategy.css';
import './reach-workspace.css';
import './task-execution.css';
import './task-detail.css';
import {confirmAction} from '#components/reach/confirm';
import {WithInfo} from '#components/reach/info-tip';
import {help} from './glossary';
import {useMe} from './me';
import {StepChips} from '#components/reach/step-chips';
import {parseReplies,ReplyDrafts,REPLY_PLAYBOOK} from './reply-drafts';
// 起草社区回复: the drafts as cards with 复制回复 (reply-drafts.tsx); other documents as text.
const repliesOf=(w:Work,content?:string)=>(w.playbook?.id===REPLY_PLAYBOOK||w.flow?.id===REPLY_PLAYBOOK)&&content?parseReplies(content):[];
// Whether you can do this task's steps (2026-10-08): its owner and 管理员 can; other members read it and leave a message.
const TaskAccess=createContext<{allowed:boolean;self:boolean;owner:string}>({allowed:true,self:true,owner:''});
type Update=(command:string,body?:object)=>Promise<Data|undefined>;
type Signal={key:string;source:string;title:string;facts:string[]};
type Member={id:string;name:string};
type Run=Data['runs'][number];
const getSourceNames = (): Record<string,string> => ({gsc:'Search Console',ga4:'GA4',site:$t('common.websiteContent'),github:'GitHub','github-traffic':'GitHub Traffic',discourse:$t('common.communityForum'),packages:$t('common.downloads'),hackernews:'Hacker News',reddit:'Reddit',trends:'Google Trends',competitors:$t('common.competitorActivity'),x:'X','discord-slack':'Discord、Slack',discord:'Discord',slack:'Slack',rank:$t('common.rankTracking'),'ai-search':$t('common.aiSearch')});
const getRunErrors = (): Record<string,string> => ({provider_failed_or_unknown:$t('taskDetail.onlineAiReturnedNoResult'),interrupted_or_unknown:$t('taskDetail.runInterruptedResultUnknown'),context_changed:$t('taskDetail.taskChangedBeforeRun'),cancelled:$t('taskDetail.stoppedCheckChangesAlreadyPushed'),no_changes:$t('taskDetail.agentNotChangeFiles'),no_repo:$t('taskDetail.noWebsiteSourceRepositoryConnected'),revert_failed:$t('taskDetail.revertPrNotOpened'),agent_failed:$t('taskDetail.runNotCompleteSeeRun'),replaced_by_manual:$t('taskDetail.switchedDoing')});
const call=<T,>(projectId:number,taskId:string,action:string,body:object={})=>api.action<T>('nrTaskWork',action,{method:'POST',body:{projectId:String(projectId),taskId,...body},unwrap:'data'});
// Tasks run by a playbook (new tasks, and tasks started with a flow) use this page; older step-plan tasks keep theirs.
export function isPlaybookTask(d:Data){const w=d.work;return Boolean(w.playbook||w.flow)||(w.stage==='plan'&&!w.plan&&!w.simple);}
const when=(iso?:string)=>iso&&!Number.isNaN(Date.parse(iso))?new Date(iso).toLocaleString(getCurrentLocale(),{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const active=(r:Run)=>r.status==='queued'||r.status==='running';
function took(r:Run){if(!r.endedAt)return '';const s=Math.max(0,Math.round((Date.parse(r.endedAt)-Date.parse(r.createdAt))/1000));return s<60?$t('taskDetail.s',{0:s}):$t('taskDetail.minS',{0:Math.floor(s/60),1:s%60});}
function since(iso:string){const m=Math.max(0,Math.round((Date.now()-Date.parse(iso))/60000));return Number.isNaN(m)||m<1?$t('taskDetail.under1Min'):$t('taskDetail.min',{0:m});}
const runnerOf=(r:Run)=>r.agentName||(r.executorKind==='runner'?$t('common.localAgent'):$t('common.onlineAi'));
const pathOf=(u:string)=>{try{const x=new URL(u);return x.pathname+x.search;}catch{return u;}};
const PageLinks=({pages}:{pages:string[]})=>pages.length?<ul className="nr-td-live-pages">{pages.map(u=><li key={u}><a className="nr-link" href={u} target="_blank" rel="noreferrer">{pathOf(u)}<ExternalLink aria-hidden="true"/></a></li>)}</ul>:null;
// Task page (SPEC §6, after NocoProject's issue detail): what waits for you, evidence, outputs and activity on the left;
// properties, progress, linked page and runs on the right.
export function TaskDetail({projectId,taskId,initial}:{projectId:number;taskId:string;initial:Data}){
 return <TaskDraftScope scope={`${projectId}:${taskId}`}><TaskDetailContent key={`${projectId}:${taskId}`} projectId={projectId} taskId={taskId} initial={initial}/></TaskDraftScope>;
}
function TaskDetailContent({projectId,taskId,initial}:{projectId:number;taskId:string;initial:Data}){
 const {dirty,clear}=useTaskDraftStatus();
 const navigate=useNavigate();const [storedData,setStoredData]=useState<Data>(initial),[busy,setBusy]=useState(false),[error,setError]=useMessageState(''),[rawPlaybooks,setRawPlaybooks]=useState<PlaybookList>(),[members,setMembers]=useState<Member[]>([]);
 const [resultParams]=useSearchParams();
 const data={...storedData,work:localizeWorkSnapshots(storedData.work)};
 const list=localizePlaybookList(rawPlaybooks);
 // Keep the submitting instance mounted so its response updates the visible task revision.
 useNavigationGuard(()=>!busy);
 const pending=useRef(false),op=useRef({key:'',id:''});
 const w=data.work,runActive=data.runs.some(active);
 useEffect(()=>{void playbookRequest<PlaybookList>('list',projectId).then(setRawPlaybooks).catch(()=>undefined);void call<Member[]>(projectId,taskId,'members').then(m=>setMembers(Array.isArray(m)?m:[])).catch(()=>undefined);},[projectId]);
 useEffect(()=>{if(!runActive)return;const t=setInterval(()=>{if(!pending.current)void call<Data>(projectId,taskId,'get').then(next=>{setStoredData(next);setError('');}).catch(()=>setError(() => ($t('taskDetail.runStatusTemporarilyUnavailableRetry'))));},2500);return()=>clearInterval(t);},[runActive, projectId, taskId, setError]);
 const update:Update=async(command,body={})=>{if(pending.current)return;pending.current=true;setBusy(true);setError('');const key=JSON.stringify([data.work.revision,command,body]);if(op.current.key!==key)op.current={key,id:crypto.randomUUID()};
  try{const d=await call<Data>(projectId,taskId,'advance',{revision:data.work.revision,requestId:op.current.id,command,...body});setStoredData(d);refreshNavBadges();return d;}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.operationFailed')));}finally{pending.current=false;setBusy(false);}};
 const stages:Stage[]=w.flow?.stages||[],index=w.stageIndex||0,stage=stages[index],started=Boolean(w.flow),done=w.stage==='done';
 const draftScope=!started?'start':JSON.stringify([w.flow?.id,w.flow?.version,index,stage?.key,w.results[index-1]?.id]);
 // Every task is run by the Agent; tasks started before then may still run online AI steps.
 const executor=stages.some(s=>s.kind==='ai')&&!stages.some(s=>s.kind==='agent')?$t('common.onlineAi'):$t('common.localAgent'),state=workState(w);
 const runs=[...data.runs].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),live=runs.find(active);
 const {me,can}=useMe(),creator=(data.task.evidence as {createdBy?:{id?:string;name?:string}}|undefined)?.createdBy,ownerId=w.humanOwnerId||creator?.id;
 const access={allowed:can(ownerId),self:!ownerId||!me?.id||String(ownerId)===me.id,owner:w.humanOwnerName||creator?.name||$t('common.owner')};
 return <TaskAccess.Provider value={access}><div className="nr-app nr-task-page">
  <ReachDetailLayout asideLabel={$t('common.taskProperties')} main={<div className="nr-td-main">
   <header className="nr-td-head">
    {resultParams.has('resultDay')&&<Link className="nr-link text-sm" to={`/results/${taskId}${resultParams.get('resultQuery')||`?day=${resultParams.get('resultDay')==='28'?28:7}`}`}>{$t('results.title')}</Link>}
    {(data.task.evidence as {resultSource?:ResultSource}|undefined)?.resultSource&&<ResultSourcePanel source={(data.task.evidence as {resultSource:ResultSource}).resultSource}/>}
    <nav className="nr-td-crumbs" aria-label={$t('taskDetail.position')}><button type="button" onClick={()=>{void navigate('/actions');}}>{$t('common.tasks')}</button><span>/</span><span>{data.task.title}</span></nav>
    <div className="nr-td-titlebar"><div className="min-w-0"><h1>{(data.task.evidence as {no?:number}|undefined)?.no?<span className="mr-2 font-mono text-base font-normal text-muted-foreground">T-{(data.task.evidence as {no:number}).no}</span>:null}{data.task.title}</h1>
     {(()=>{const o=(data.task.evidence as {insight?:{id?:string;no?:number}}|undefined)?.insight;return o?.id&&<button type="button" className="nr-link text-xs" onClick={()=>navigate(`/opportunities?item=${encodeURIComponent(o.id!)}`)}>{$tj('taskDetail.sourceAttribution',{0:o.no?`O-${o.no}`:$t('common.opportunity')})}</button>;})()}</div><div className="nr-td-head-actions">
     {!access.allowed?null:canReopen(w)?<Button size="sm" variant="outline" disabled={busy} onClick={()=>void update('unarchiveTask')}><ArchiveRestore/>{$t('common.reopen')}</Button>
      :(()=>{const cmd=closeCommand(w);return cmd&&<Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(cmd==='archiveTask'||(await confirmAction({title:() => ($t('common.closeTaskValueConfirmation',{0:data.task.title})),description:() => (getCloseConfirm()),action:'common.closeTask'})))void update(cmd);}}><Archive/>{$t('common.closeTask')}</Button>;})()}
    </div></div>
    <p className="nr-td-meta">{closedLabel(w)?<Tag tone="slate" dot>{closedLabel(w)}</Tag>:<Tag tone={stateToneOf(state)} dot>{getWorkColumns()[state]}</Tag>}{started&&<Tag tone="grey">{w.playbook?.name||w.flow?.name||""}</Tag>}{started&&<span>{executor}</span>}{live&&<span className="nr-live max-w-full break-words">{$tj('taskDetail.running',{0:runnerOf(live),1:stage?.name||$t('common.run'),2:since(live.createdAt)})}</span>}</p>
   </header>
   {dirty&&<p role='status' className='nr-td-muted'>{$t('taskDetail.draftRetained')} <Button size='sm' variant='ghost' disabled={busy} onClick={()=>{void confirmAction({title:()=>($t('taskDetail.discardTaskDrafts',{0:data.task.title})),description:()=>($t('taskDetail.discardDraftWarning')),action:'taskDetail.discardDrafts'}).then(confirmed=>{if(confirmed)clear();});}}>{$t('taskDetail.discardDrafts')}</Button></p>}
   <TaskDraftRecovery activeScope={w.cancelledAt||w.archivedAt||done?undefined:draftScope}/>
   {error&&<p role="alert" className="nr-error">{error}</p>}
   {w.cancelledAt||w.archivedAt?<ClosedCard w={w}/>:!started?<TaskDraftScope scope='start'><StartCard data={data} list={list} update={update} busy={busy}/></TaskDraftScope>:done?<DoneCard w={w} canRevert={Boolean(data.agent?.repo)} update={update} busy={busy}/>:<TaskDraftScope scope={draftScope}><CurrentCard key={draftScope} data={data} update={update} busy={busy} runActive={runActive} list={list}/></TaskDraftScope>}
   {Array.isArray(data.task.evidence?.attachmentIds)&&data.task.evidence.attachmentIds.length>0&&<TaskMedia projectId={projectId} taskId={taskId}/>}
   <TaskExecutionPanel projectId={projectId} taskId={taskId} runs={runs}/>
   <EvidenceCard data={data} showBrief={started}/>
   <OutputsCard data={data}/>
   <ActivityCard data={data} update={update} busy={busy} executor={started?executor:$t('common.executor')} members={members}/>
  </div>} aside={<Aside data={data} list={list} projectId={projectId} taskId={taskId} busy={busy} runActive={runActive} members={members} runs={runs} update={update}/>}/>
 </div></TaskAccess.Provider>;
}
// The one thing that waits for you: a card with a coloured edge, one sentence, the content and the actions under it.
// The card of the task's current step (2026-10-08, as NocoProject's “Waiting for you”, user: no coloured bar on the
// left): a small section heading outside (等你处理, 当前进度, 已完成…), then a plain card — the step's icon, title, one
// sentence and time, its content, and the buttons right under it (the main one filled and first).
function Await({icon,title,sub,at,children,actions,tone='attention',label=$t('common.needsAction')}:{icon:ReactNode;title:string;sub?:ReactNode;at?:string;children?:ReactNode;actions?:ReactNode;tone?:'attention'|'live'|'done'|'error'|'closed';label?:string}){
 const access=useContext(TaskAccess);
 return <section className="nr-td-await" data-tone={tone} aria-label={label}>
  <h2 className="nr-td-await-heading">{label}</h2>
  <div className="nr-td-await-body"><header><span className="nr-td-await-icon" aria-hidden="true">{icon}</span><div className="nr-td-await-title"><h3>{title}</h3>{sub&&<p className="nr-td-sub">{sub}</p>}</div>{at&&<time>{when(at)}</time>}</header>{children}
   {actions&&(access.allowed?<div className="nr-td-await-actions">{actions}</div>:<p className="nr-td-await-locked" data-locked=""><Lock aria-hidden="true"/>{$t('taskDetail.reviewsLeaveCommentBelow',{0:access.owner})}</p>)}</div>
 </section>;
}
// Before a task starts (2026-10-08 user decision: 交给 Agent only creates the task): what the Agent will get, the 做法
// (the one suggested at hand-off preselected) and a note; nothing runs until 确定开始执行.
function StartCard({data,list,update,busy}:{data:Data;list?:PlaybookList;update:Update;busy:boolean}){
 const [id,setId]=useState(data.work.playbookId||data.playbookDefault||'optimize-page'),[note,setNote]=useTaskDraft('note',''),[reading,setReading]=useState(false),{allowed,self,owner}=useContext(TaskAccess);
 const {clear}=useTaskDraftStatus();
 const p=list?.playbooks.find(x=>x.id===id),handoff=(data.task.evidence?.handoff as {playbook?:string;content?:string}|undefined),brief=handoff?.content||data.task.brief||'',briefTitle=handoff?.content?$t('taskDetail.documentDelivered',{0:handoff.playbook}):$t('taskDetail.whatAgentReceive');
 return <Await icon={<Play/>} title={$t('taskDetail.startAfterReview')} sub={handoff?$t('taskDetail.taskHandedOverDocumentDelivered',{0:handoff.playbook}):$t('taskDetail.agentNotStartedReadBrief')}
  actions={<Button disabled={busy||!p||!hasTaskAgent(data)} onClick={()=>void update('startTask',{playbookId:id,note}).then(d=>{if(d)clear();})}>{$t('taskDetail.confirmStart')}</Button>}>
  {brief&&<div className="nr-td-start-field" data-start-brief=""><span>{briefTitle}</span><div className="nr-td-start-brief"><p>{brief.replace(/[#*>`_]/g,'').replace(/^[ \t]+/gm,'').replace(/\n{2,}/g,'\n').trim().slice(0,600)}</p></div><button type="button" className="nr-link self-start text-xs" onClick={()=>setReading(true)}>{$t('taskDetail.viewFullText')}</button><DocReader open={reading} onClose={()=>setReading(false)} title={briefTitle} content={brief}/></div>}
  <TaskAgentField data={data} busy={busy} lockedReason={!allowed?$t('taskDetail.ownerAdminChange'):undefined} onChange={async agentId=>Boolean(await update('setAgent',{agentId}))}/>
  <div className="nr-td-start-grid">
   <label className="nr-td-start-field"><span>{$t('common.playbook')}</span><select aria-label={$t('common.playbook')} value={id} disabled={busy||!list||!allowed} onChange={e=>setId(e.target.value)}>
    {getCategories().map(([k,label])=><optgroup key={k} label={label}>{(list?.playbooks||[]).filter(x=>x.category===k).map(x=><option key={x.id} value={x.id}>{x.name}{x.id===data.playbookDefault?$t('taskDetail.recommended'):''}</option>)}</optgroup>)}
   </select>
    {p&&<><small>{p.description}{p.description?' ':''}{$tj('taskDetail.runAgent',{0:p.kind==='build'?$t('taskDetail.onceChangedReviewResultBefore'):$t('taskDetail.writesDocumentReview')})}</small>
     <StepChips stages={stagesFor(p)} owner={self?null:owner}/></>}
   </label>
   <label className="nr-td-start-field"><span>{$t('taskDetail.notesOptional')}</span><textarea aria-label={$t('taskDetail.additionalNotes')} rows={3} value={note} disabled={busy||!allowed} placeholder={$t('taskDetail.changeEnglishVersionKeepTechnical')} onChange={e=>setNote(e.target.value)}/></label>
  </div>
 </Await>;
}
const focusComposer=()=>{const el=document.getElementById('nr-composer') as HTMLTextAreaElement|null;el?.scrollIntoView({block:'center',behavior:'smooth'});el?.focus();};
function PrCard({pr,compact=false}:{pr:PullRequestInfo;compact?:boolean}){
 const add=pr.files.reduce((n,f)=>n+f.additions,0),del=pr.files.reduce((n,f)=>n+f.deletions,0);
 return <div className="nr-td-pr"><div className="nr-td-pr-head"><GitPullRequest aria-hidden="true"/><a className="nr-link" href={pr.url} target="_blank" rel="noreferrer">{$t('taskDetail.viewChangesGithub')}</a><code>#{pr.number}</code></div>
  <dl><div><dt>{$t('taskDetail.changes')}</dt><dd><span className="nr-add">+{add}</span> <span className="nr-del">−{del}</span>  {$tj('taskDetail.files',{0:pr.files.length})}</dd></div><div><dt>{$t('taskDetail.branch')}</dt><dd><code>{pr.branch}</code>{pr.headSha?` · ${pr.headSha.slice(0,7)}`:''}</dd></div>{pr.checks&&<div><dt>{$t('common.check')}</dt><dd className={pr.checks.ok?'nr-check-ok':'nr-error'}>{pr.checks.summary}</dd></div>}</dl>
  {!compact&&<ul className="nr-pr-files">{pr.files.slice(0,12).map(f=><li key={f.path}><code>{f.path}</code><span>+{f.additions} −{f.deletions}</span></li>)}{pr.files.length>12&&<li>{$tj('taskDetail.moreFiles',{0:pr.files.length-12})}</li>}</ul>}</div>;
}

function CurrentCard({data,update,busy,runActive,list}:{data:Data;update:Update;busy:boolean;runActive:boolean;list?:PlaybookList}){
 const w=data.work,stages=w.flow!.stages,index=w.stageIndex||0,stage=stages[index];
 const navigate=useNavigate();const [manualOpen,setManual]=useTaskDraft('manual',false,false),[scopeOk,setScopeOk]=useState(false);
 const [checked,setChecked]=useState<string[]>([]),[editingOpen,setEditing]=useTaskDraft('editing',false,false),[draft,setDraft]=useTaskDraft('draft',w.results[index-1]?.content||''),[record,setRecord]=useTaskDraft('record',''),[note,setNote]=useTaskDraft('note',''),[url,setUrl]=useTaskDraft('url','');
 const manual=manualOpen||Boolean(record),editing=editingOpen||draft!==(w.results[index-1]?.content||'');
 const last=stages.slice(index+1).every(s=>s.kind==='observe'),nextOptions=w.playbook?.kind==='plan'&&last?w.playbook.next:[];
 const [next,setNext]=useState(nextOptions[0]||''),[showNote,setShowNote]=useTaskDraft('showRelease',false,false),[relNote,setRelNote]=useTaskDraft('release',w.results[index-1]?.pr?.release||'');
 const {clear}=useTaskDraftStatus();
 const act=async(command:string,body:object)=>{const result=await update(command,{stageKey:stage.key,...body});if(result&&['editStageOutput','recordManual','confirmPublish','approveStage'].includes(command))clear();return result;};
 const name=(id:string)=>list?.playbooks.find(p=>p.id===id)?.name||id;
 const cur=data.runs.filter(r=>r.stepId===stage.key&&r.planVersion===0).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
 if(stage.kind==='ai'){
  if(runActive)return <Await tone="live" label={$t('taskDetail.currentProgress')} icon={<Bot/>} title={$t('taskDetail.onlineAi',{0:stage.name})} sub={$t('taskDetail.waitsReviewWhenDoneUsually')}/>;
  return <Await icon={<Bot/>} title={displayStageName(stage)} sub={cur?.status==='failed'?<span className="nr-error">{$tj('taskDetail.lastRunNotCompleteExisting',{0:getRunErrors()[cur.error||'']||cur.error||$t('errors.unknownReason')})}</span>:$t('taskDetail.stepDoneOnlineAiNot')}
   actions={<Button disabled={busy} onClick={()=>void act('retryStage',{})}>{cur?$t('common.retry'):$t('taskDetail.start')}</Button>}/>;
 }
 if(stage.kind==='review'&&stages[index+1]?.kind==='release'){
  const out=w.results[index-1],pr=out?.pr;
  if(!out)return <Await tone="error" icon={<AlertCircle/>} title={displayStageName(stage)} sub={$t('taskDetail.noChangesViewRefreshTry')}/>;
  const missing=(stage.checklist||[]).some(c=>c.required&&!checked.includes(c.key))||Boolean(pr?.outOfScope?.length&&!scopeOk);
  return <Await icon={<Eye/>} title={displayStageName(stage)} at={out.createdAt} sub={pr?$t('taskDetail.agentChangedFilesReviewChanges',{0:pr.files.length}):$t('taskDetail.madeChangeYourselfAfterConfirm')}
   actions={<><Button disabled={busy||missing} onClick={()=>void act('approveStage',{artifactId:out.id,checked,release:{note:relNote},...(pr?.outOfScope?.length?{confirmOutOfScope:scopeOk}:{})})}><Rocket/>{$t(mockSettingsAvailable() ? 'taskDetail.simulatePublish' : 'common.publish')}</Button><Button variant="outline" disabled={busy} onClick={focusComposer}>{$t('taskDetail.requestChanges')}</Button>
    <span className="nr-td-push nr-td-release-hint">{mockSettingsAvailable()?$t('taskDetail.simulatedReleaseDescription'):pr?$t('taskDetail.prMergedVersionReviewed',{0:pr.number}):$t('taskDetail.noMergeNeeded')} · <button type="button" className="nr-link" onClick={()=>setShowNote(!showNote)}>{showNote?$t('taskDetail.hideReleaseNotes'):$t('taskDetail.releaseNotes')}</button></span></>}>
   {pr?.previewUrl&&<a className="nr-td-preview" href={pr.previewUrl} target="_blank" rel="noreferrer"><Globe aria-hidden="true"/>{$t('taskDetail.openPreviewPage')}<ExternalLink aria-hidden="true"/></a>}
   {pr?.release&&<div className="nr-td-what"><b>{$t('taskDetail.whatChanged')}</b><p>{pr.release}</p></div>}
   {pr?.changes?.length?<ChangeView changes={pr.changes}/>:<DocView content={out.content} title={$t('taskDetail.changeNotes')} meta={$t('taskDetail.versionNumber',{0:out.version})}/>}
   {pr&&<PrCard pr={pr} compact={Boolean(pr.changes?.length)}/>}
   {pr?.outOfScope?.length?<label className="nr-error nr-scope-confirm"><input type="checkbox" checked={scopeOk} disabled={busy} onChange={e=>setScopeOk(e.target.checked)}/>  {$tj('taskDetail.outsideAllowedScopeIVe',{0:pr.outOfScope.join('、')})}</label>:null}
   {(stage.checklist||[]).length>0&&<fieldset className="nr-checklist"><legend>{$t('taskDetail.confirmFollowing')}</legend>{stage.checklist!.map(c=><label key={c.key}><input type="checkbox" checked={checked.includes(c.key)} disabled={busy} onChange={e=>setChecked(e.target.checked?[...checked,c.key]:checked.filter(k=>k!==c.key))}/> {c.label}{c.required?'':$t('taskDetail.optional')}</label>)}</fieldset>}
   {showNote&&<label className="nr-field">{$t('taskDetail.releaseNotesGoPublishRecord')}<textarea aria-label={$t('taskDetail.releaseNotes')} rows={3} value={relNote} disabled={busy} placeholder={$t('taskDetail.oneTwoSentencesWhatChanged')} onChange={e=>{setRelNote(e.target.value);}}/></label>}
  </Await>;
 }
 if(stage.kind==='release'){
  const r=w.release,queued=cur?.status==='queued';
  if(!r)return <Await tone="error" icon={<AlertCircle/>} title={displayStageName(stage)} sub={$t('taskDetail.nothingPublishRefreshTryAgain')}/>;
  const mark=<Button variant="ghost" className="nr-td-push" disabled={busy} onClick={()=>void act('markMerged',{})}>{$t('taskDetail.iMergedGithub')}</Button>;
  if(r.state==='merging')return <Await tone="live" label={$t('taskDetail.currentProgress')} icon={<GitMerge/>} title={$t('taskDetail.localAgentMergingPr',{0:r.pr?.number})} sub={queued&&!data.agent?.online?<>{$t('taskDetail.waitingAvailableRunnerMergeStart')}<Button variant="link" onClick={()=>navigate('/runtimes')}>{$t('taskDetail.viewRunners')}</Button></>:$t('taskDetail.commitReviewedMergedGoingLive')} actions={queued?mark:undefined}/>;
  if(r.state==='merge_failed')return <Await tone="error" icon={<AlertCircle/>} title={$t('taskDetail.mergeFailed')} sub={r.error||$t('taskDetail.mergeNotComplete')} actions={<><Button disabled={busy} onClick={()=>void act('retryMerge',{})}>{$t('common.mergeAgain')}</Button>{mark}</>}><PageLinks pages={[]}/></Await>;
  const live=<Button variant={r.state==='verifying'?'ghost':'default'} className={r.state==='verifying'?'nr-td-push':''} disabled={busy} onClick={()=>void act('confirmLive',{})}>{$t('taskDetail.iConfirmLive')}</Button>;
  if(r.state==='verifying')return <Await tone="live" label={$t('taskDetail.currentProgress')} icon={<Globe/>} title={$t('taskDetail.mergedWaitingGoLive')} sub={$t('taskDetail.opensLivePageEvery30',{0:r.verifyText,1:r.lastCheckAt?$t('taskDetail.lastCheckedNotSeenYet',{0:when(r.lastCheckAt)}):''})} actions={live}><PageLinks pages={r.pages}/></Await>;
  const [title,sub]=r.reason==='manual'?[$t('taskDetail.waitingConfirmLive'),$t('taskDetail.madeChangeYourselfConfirmOnce')]:r.reason==='cannot_verify'?[$t('taskDetail.mergedWaitingConfirmLive'),$t('taskDetail.changeNoTextCheckedWeb')]:[$t('taskDetail.changeNotSeenLiveAfter'),$t('taskDetail.deploymentMayNotFinishedRepository')];
  return <Await icon={<Globe/>} title={title} sub={sub} actions={<>{live}{!r.reason&&<Button variant="outline" disabled={busy} onClick={()=>void act('waitLonger',{})}>{$t('common.waitAnother24Hours')}</Button>}</>}><PageLinks pages={r.pages}/></Await>;
 }
 if(stage.kind==='review'){
  const producer=stages[index-1],out=w.results[index-1];
  const missing=(stage.checklist||[]).some(c=>c.required&&!checked.includes(c.key))||Boolean(out?.pr?.outOfScope?.length&&!scopeOk);
  const label=nextOptions.length&&next?$t('taskDetail.acceptHandAgent',{0:name(next)}):stages[index+1]?.kind==='agent'?$t('taskDetail.approveHand',{0:getStageExecutor().agent}):stages[index+1]?.kind==='publish'?$t('taskDetail.approvePublish'):$t('taskDetail.accept');
  const by=$t('taskDetail.artifactVersion',{0:getStageExecutor()[producer.kind],1:out?.manual?$t('taskDetail.recordedAside'):'',2:out?.version});
  if(!out)return <Await tone="error" icon={<AlertCircle/>} title={displayStageName(stage)} sub={$t('taskDetail.nothingReviewRefreshTryAgain')}/>;
  return <Await icon={out.pr?<GitPullRequest/>:<FileText/>} title={displayStageName(stage)} at={out.createdAt} sub={out.pr?$t('taskDetail.madeChangeOpenedPrReview',{0:getStageExecutor()[producer.kind]}):$t('taskDetail.afterReviewingApproveWriteFeedback',{0:by})}
   actions={editing?<><Button disabled={busy||!draft.trim()} onClick={()=>void act('editStageOutput',{artifactId:out.id,content:draft})}>{$t('taskDetail.saveChanges')}</Button><Button variant="ghost" onClick={()=>{setEditing(false);setDraft(w.results[index-1]?.content||'');}}>{$t('common.cancel')}</Button></>
    :<><Button disabled={busy||missing} onClick={()=>void act('approveStage',{artifactId:out.id,checked,...(nextOptions.length&&next?{next}:{}),...(out.pr?.outOfScope?.length?{confirmOutOfScope:scopeOk}:{})})}>{label}</Button><Button variant="outline" disabled={busy} onClick={focusComposer}>{$t('taskDetail.requestChanges')}</Button><Button variant="ghost" className="nr-td-push" disabled={busy} onClick={()=>{setDraft(out.content);setEditing(true);}}><Pencil/>{$t('taskDetail.editDirectly')}</Button></>}>
   {editing?<textarea className="nr-stage-edit" aria-label={$t('taskDetail.editContent')} rows={18} value={draft} disabled={busy} onChange={e=>{setDraft(e.target.value);}}/>:<>
    {out.pr&&<PrCard pr={out.pr}/>}
    {out.pr?.outOfScope?.length?<label className="nr-error nr-scope-confirm"><input type="checkbox" checked={scopeOk} disabled={busy} onChange={e=>setScopeOk(e.target.checked)}/>  {$tj('taskDetail.outsideAllowedScopeIVe',{0:out.pr.outOfScope.join('、')})}</label>:null}
    {(()=>{const r=repliesOf(w,out.content);return r.length?<ReplyDrafts items={r}/>:<DocView content={out.content} title={producer.name} meta={by}/>;})()}
    {out.report&&<div className="flex flex-col gap-2 text-sm"><h4 className="font-medium">{$t('taskDetail.sourcesUncertainties')}</h4><p>{reportDate(out.report.asOf)}</p>{out.report.sources.map((source,i)=><a key={i} className="underline break-all" href={source.url} target="_blank" rel="noreferrer">{source.title||source.url}</a>)}{out.report.uncertainties.map((note,i)=><p key={i}>{note}</p>)}</div>}
    {(stage.checklist||[]).length>0&&<fieldset className="nr-checklist"><legend>{$t('taskDetail.confirmFollowing')}</legend>{stage.checklist!.map(c=><label key={c.key}><input type="checkbox" checked={checked.includes(c.key)} disabled={busy} onChange={e=>setChecked(e.target.checked?[...checked,c.key]:checked.filter(k=>k!==c.key))}/> {c.label}{c.required?'':$t('taskDetail.optional')}</label>)}</fieldset>}
    {nextOptions.length>0&&<label className="nr-inline-field nr-next-field">{$t('taskDetail.continue')}<select aria-label={$t('taskDetail.continue')} value={next} disabled={busy} onChange={e=>setNext(e.target.value)}>{nextOptions.map(id=><option key={id} value={id}>{name(id)}</option>)}<option value="">{$t('taskDetail.notContinue')}</option></select></label>}
   </>}
  </Await>;
 }
 if(stage.kind==='agent'){
  const approved=[...w.results.slice(0,index)].reverse().find(r=>r?.approvedAt&&!r.rejectedAt),source=approved?stages[w.results.indexOf(approved)]:undefined;
  const agent=data.agent,isActive=cur&&active(cur),canRun=Boolean(agent?.repo)||withoutRepo(stage,stages);
  const actions=!manual?<>
   {cur?.status!=='running'&&cur?.status!=='queued'&&canRun&&<Button disabled={busy} onClick={()=>void act('retryStage',{})}>{cur?$t('common.retry'):$t('taskDetail.handOffAgent')}</Button>}
   {isActive&&<Button variant="outline" disabled={busy||Boolean(cur.cancelRequested)} onClick={async()=>{if(await confirmAction({title:() => ($t('taskDetail.stopCurrentRun',{0:data.task.title})),description:() => ($t('taskDetail.stoppingNotUndoPushedChanges')),action:'common.stop'}))void update('cancelRun',{runId:cur.id});}}><Square/>{$t('common.stop')}</Button>}
   {cur?.status!=='running'&&<Button variant="ghost" className="nr-td-push" disabled={busy} onClick={()=>setManual(true)}>{$t('taskDetail.iLlMyself')}</Button>}
  </>:<><Button disabled={busy||!record.trim()} onClick={()=>void act('recordManual',{content:record})}>{$t('taskDetail.recordContinue')}</Button><Button variant="ghost" onClick={()=>{setManual(false);setRecord('');}}>{$t('common.cancel')}</Button></>;
  const body=<>{manual&&<label className="nr-field">{readsOnly(stage)?(stage.mode==='analyze'?$t('taskDetail.analysisResult'):$t('taskDetail.plan')):$t('taskDetail.changeHistory')}<textarea aria-label={readsOnly(stage)?(stage.mode==='analyze'?$t('taskDetail.analysisResult'):$t('taskDetail.plan')):$t('taskDetail.changeHistory')} rows={4} value={record} disabled={busy} placeholder={readsOnly(stage)?(stage.mode==='analyze'?$t('taskDetail.writeAnalysisResult'):$t('taskDetail.whichFilesSectionsChangeWhat')):$t('taskDetail.prLinkWhichFilesContent')} onChange={e=>{setRecord(e.target.value);}}/></label>}

   {approved&&source&&<DocView content={approved.content} title={$t('taskDetail.approvedValue',{0:source.name})} meta={$t('taskDetail.versionNumber',{0:approved.version})}/>}</>;
  if(!canRun)return <Await tone="error" icon={<AlertCircle/>} title={displayStageName(stage)} sub={<>{$t('taskDetail.noWebsiteSourceRepositoryConnectedMessage')}<Button variant="link" onClick={()=>navigate('/connections?source=repo')}>{$t('common.goDataSources')}</Button></>} actions={actions}>{body}</Await>;
  if(cur?.status==='queued')return <Await tone="live" label={$t('taskDetail.currentProgress')} icon={<Bot/>} title={$t('taskDetail.agentLabel',{0:stage.name})} sub={agent?.online?$t('taskDetail.handedOffAgentStartingNow'):<>{$t('taskDetail.waitingAvailableRunnerTaskStart')}<Button variant="link" onClick={()=>navigate('/runtimes')}>{$t('taskDetail.viewRunners')}</Button></>} actions={actions}>{body}</Await>;
  if(cur?.status==='running')return <Await tone="live" label={$t('taskDetail.currentProgress')} icon={<Bot/>} title={$t('taskDetail.agentActivity',{0:stage.name,1:cur.cancelRequested?$t('taskDetail.stoppingAside'):''})} sub={$t('taskDetail.runningCurrently',{0:since(cur.createdAt)})} actions={actions}>{body}</Await>;
  if(cur?.status==='failed')return <Await tone="error" icon={<AlertCircle/>} title={displayStageName(stage)} sub={$t('taskDetail.lastRunRetryYourself',{0:(cur.errorDetail ? $legacyText(cur.errorDetail) : '')||getRunErrors()[cur.error||'']||$t('common.notComplete')})} actions={actions}>{body}</Await>;
  return <Await icon={<Bot/>} title={displayStageName(stage)} sub={$t('taskDetail.stepDoneAgent',{0:stage.instruction})} actions={actions}>{body}</Await>;
 }
 return <Await icon={<Rocket/>} title={$t('common.confirmPublish')} sub={$t('taskDetail.prReviewApprovedConfirmAfter')}
  actions={<Button disabled={busy||!note.trim()} onClick={()=>void act('confirmPublish',{note,url})}>{$t('common.confirmedPublished')}</Button>}>
  <label className="nr-field">{$t('taskDetail.publishedPageOptional')}<input aria-label={$t('taskDetail.publishedPage')} value={url} disabled={busy} onChange={e=>setUrl(e.target.value)}/></label>
  <label className="nr-field">{$t('taskDetail.releaseNotes')}<textarea aria-label={$t('taskDetail.releaseNotes')} rows={3} value={note} disabled={busy} placeholder={$t('taskDetail.whichPrMergedWhenWent')} onChange={e=>setNote(e.target.value)}/></label>
 </Await>;
}
// A cancelled or archived task: what happened, and the open PR's fate.
function ClosedCard({w}:{w:Work}){
 const pr=w.prClose,prLine=pr?{closing:$t('taskDetail.prWaitingAgentCloseBranch',{0:pr.number}),closed:$t('taskDetail.prClosedBranchKept',{0:pr.number}),failed:$t('taskDetail.prNotClosedCloseGithub',{0:pr.number,1:pr.error||$t('errors.unknownReason')})}[pr.state]:'';
 const at=w.cancelledAt||w.archivedAt;
 return <Await tone="closed" label={$t('common.closed')} icon={w.cancelledAt?<Ban/>:<Archive/>} title={$t('taskDetail.closedValue',{0:closedWhen(w)})} sub={`${at?$t('taskDetail.closedValueMessage',{0:when(at)}):''}${canReopen(w)?$t('taskDetail.clickReopenIfNeeded'):$t('taskDetail.taskStoppedHalfwayCannotContinue')}`}>{prLine&&<p className="nr-td-text">{prLine}</p>}</Await>;
}
function DoneCard({w,canRevert,update,busy}:{w:Work;canRevert:boolean;update:Update;busy:boolean}){
 const r=w.release;
 if(r?.state==='simulated')return <Await tone='done' label={$t('common.completed')} icon={<Check/>} title={$t('taskDetail.simulatedRelease')} sub={$t('taskDetail.simulatedReleaseDescription')}><div className='nr-td-what'><b>{$t('taskDetail.releaseNotes')}</b><p>{r.note}</p></div></Await>;
 if(r?.state==='live')return <Await tone="done" label={$t('common.completed')} icon={<Check/>} title={$t('taskDetail.live')} sub={$t('taskDetail.days728ComparedBefore',{0:when(r.liveAt),1:(w.history||[]).some(e=>e.action==='live'&&e.actor==='system')?$t('taskDetail.sawChangeLive'):$t('common.confirmedLive')})}
  actions={r.pr&&r.mergedAt&&canRevert&&(!w.revert||w.revert.state==='failed')?<Button variant="outline" disabled={busy} onClick={async()=>{if(await confirmAction({title:() => ($t('taskDetail.revertChangesPr',{0:r.pr!.number})),description:() => ($t('taskDetail.agentOpensRevertPrOnce')),action:'taskDetail.revertChange'}))void update('revertRelease');}}><Undo2/>{w.revert?$t('taskDetail.openRevertPrAgain'):$t('taskDetail.revertCurrentChange')}</Button>:undefined}>
  {w.revert&&<p className={w.revert.state==='failed'?'nr-error':'nr-td-text'} data-revert={w.revert.state}>{w.revert.state==='opening'?$t('taskDetail.waitingAgentOpenRevertPr',{0:w.revert.of}):w.revert.state==='opened'?<>{$t('taskDetail.opened')} <a className="nr-link" href={w.revert.url} target="_blank" rel="noreferrer">{$tj('taskDetail.revertPr',{0:w.revert.number})}</a>{$t('taskDetail.onceMergedGithubChangeUndone')}</>:$t('taskDetail.revertPrNotOpenedValue',{0:w.revert.error||$t('errors.unknownReason')})}</p>}
  {latestEffect(w)&&<p className="nr-td-text">{effectLine(latestEffect(w)!,w.observeFrom)}</p>}
  <div className="nr-td-what"><b>{$t('taskDetail.releaseNotes')}</b><p>{r.note}</p></div><PageLinks pages={r.pages}/>{r.pr&&<p className="nr-td-muted"><a className="nr-link" href={r.pr.url} target="_blank" rel="noreferrer">PR #{r.pr.number}</a>{r.mergeSha?$t('taskDetail.mergeCommit',{0:r.mergeSha.slice(0,7)}):''}</p>}
 </Await>;
 const replies=repliesOf(w,[...w.results].reverse().find(x=>x?.approvedAt&&!x.rejectedAt)?.content);
 if(replies.length)return <Await tone="done" label={$t('common.completed')} icon={<Check/>} title={$t('taskDetail.replyDraftsAccepted')} sub={$t('taskDetail.copyReplyPostYourselfNocoreach')}><ReplyDrafts items={replies}/></Await>;
 return <Await tone="done" label={$t('common.completed')} icon={<Check/>} title={$t('common.completed')} sub={w.observeFrom?$t('taskDetail.trackingImpactDays728',{0:new Date(w.observeFrom).toLocaleDateString(getCurrentLocale())}):$t('taskDetail.deliveredContentSavedUnderDeliverables')}>
  {w.receipt?.note&&<p className="nr-td-text">{$tj('taskDetail.published',{0:w.receipt.note})}{w.receipt.url&&<> · <a className="nr-link" href={w.receipt.url} target="_blank" rel="noreferrer">{$t('common.openPage')}</a></>}</p>}
 </Await>;
}
function Section({title,count,children}:{title:string;count?:number;children:ReactNode}){return <section className="nr-td-section" aria-label={title}><h2>{title}{count?<span>{count}</span>:null}</h2>{children}</section>;}
// Before the task starts, the brief is in the start card above, so it is not repeated here.
function EvidenceCard({data,showBrief=true}:{data:Data;showBrief?:boolean}){
 const ev=(data.task.evidence||{}) as {insight?:{signalIds?:string[]};context?:{signals?:{items?:Signal[]}};handoff?:{playbook?:string;content?:string}};
 const ids=new Set(ev.insight?.signalIds||[]),signals=(ev.context?.signals?.items||[]).filter(s=>ids.has(s.key));
 const [open,setOpen]=useState(false),brief=ev.handoff?.content||data.task.brief||'',briefTitle=ev.handoff?.content?$t('taskDetail.documentDelivered',{0:ev.handoff.playbook}):$t('taskDetail.taskBrief');
 if(!signals.length&&!(brief&&showBrief)&&!data.work.note)return null;
 return <Section title={$t('taskDetail.evidence')}><div className="nr-td-evidence">
  {signals.map(s=><div key={s.key} className="nr-td-tile"><span>{getSourceNames()[s.source]||s.source}</span><b>{$legacyText(s.title)}</b>{s.facts.slice(0,3).map(f=><small key={f}>{$legacyText(f)}</small>)}</div>)}
  {brief&&showBrief&&<button type="button" className="nr-td-tile nr-td-brief" onClick={()=>setOpen(true)}><span>{briefTitle}</span><p>{brief.replace(/[#*>`_-]/g,'').slice(0,140)}</p><small className="nr-td-open">{$t('taskDetail.viewFullText')}</small></button>}
  {data.work.note&&<div className="nr-td-tile"><span>{$t('taskDetail.notes')}</span><p>{data.work.note}</p></div>}
 </div><DocReader open={open} onClose={()=>setOpen(false)} title={briefTitle} content={brief}/></Section>;
}
function OutputsCard({data}:{data:Data}){
 const w=data.work,stages=w.flow?.stages||[],index=w.stageIndex||0,[view,setView]=useState<{s:Stage;r:Artifact}>();
 const rows=stages.map((s,i)=>({s,r:w.results[i],i})).filter(x=>producesOutput(x.s)&&x.r) as {s:Stage;r:Artifact;i:number}[];
 if(!rows.length)return null;
 const status=(r:Artifact,i:number)=>r.approvedAt?['done',$t('taskDetail.approved')]:r.rejectedAt?['error',$t('taskDetail.sentBack')]:w.stage==='flow'&&!w.cancelledAt&&stages[index]?.kind==='review'&&index-1===i?['review',$t('common.awaitingReview')]:['todo',$t('taskDetail.delivered')];
 return <Section title={$t('taskDetail.deliverables')} count={rows.length}><ul className="nr-td-outputs">{rows.map(({s,r,i})=>{const [tone,label]=status(r,i);return <li key={s.key}>
  {r.pr?<GitPullRequest aria-hidden="true"/>:<FileText aria-hidden="true"/>}<b>{s.name}</b><span className="nr-td-muted">{$tj('taskDetail.versionAuthorDetail',{0:r.version,1:r.manual?$t('taskDetail.recorded'):getStageExecutor()[s.kind],2:r.pr?` · PR #${r.pr.number}`:''})}</span>
  <Tag tone={stateToneOf(tone)} className="ml-auto">{label}</Tag><Button size="sm" variant="ghost" onClick={()=>setView({s,r})}>{$t('common.view')}</Button></li>;})}</ul>
  {view&&<DocReader open onClose={()=>setView(undefined)} title={stages.find(s=>s.key===view.s.key)?.name||view.s.name} meta={$t('taskDetail.versionAuthor',{0:view.r.version,1:when(view.r.createdAt)})} content={view.r.content}>{view.r.pr&&<PrCard pr={view.r.pr}/>}</DocReader>}
 </Section>;
}
const eventIcons:Record<string,ReactNode>={merged:<GitMerge/>,live:<Globe/>,notSeen:<AlertCircle/>,retryMerge:<RotateCcw/>,markMerged:<GitMerge/>,confirmLive:<Globe/>,waitLonger:<RotateCcw/>,startTask:<Play/>,runQueued:<Bot/>,runSucceeded:<Bot/>,runFailed:<AlertCircle/>,flowWaiting:<AlertCircle/>,approveStage:<Check/>,editStageOutput:<Pencil/>,recordManual:<Pencil/>,retryStage:<RotateCcw/>,confirmPublish:<Rocket/>,linkContent:<Link2/>,linkPage:<Link2/>,setAgent:<Bot/>,setOwner:<UserRound/>,setCollaborators:<Users/>,handoff:<ArrowRightLeft/>,moveWork:<Move/>,selectPlaybook:<Play/>};
function ActivityCard({data,update,busy,executor,members}:{data:Data;update:Update;busy:boolean;executor:string;members:Member[]}){
 const [text,setText,clearText]=useTaskDraft('comment',''),w=data.work,stages=w.flow?.stages||[],stage=stages[w.stageIndex||0],done=w.stage==='done';
 const reviewing=useContext(TaskAccess).allowed&&Boolean(w.flow)&&!done&&stage?.kind==='review'&&w.results[(w.stageIndex||0)-1];
 const nameOf=(key?:string)=>stages.find(s=>s.key===key)?.name||$t('taskDetail.step');
 const people=useMemo(()=>new Map(members.map(m=>[m.id,m.name])),[members]);
 const runs=new Map(data.runs.map(r=>[r.id,r]));
 // A command and the run it starts share one time; show the command first.
 const rows=(w.history||[]).map((e,i)=>({e,i,t:eventText(e,nameOf,executor)})).filter(x=>x.t).sort((a,b)=>String(a.e.at).localeCompare(String(b.e.at))||Number(a.e.action==='runQueued')-Number(b.e.action==='runQueued')||a.i-b.i);
 async function send(){const d=reviewing?await update('requestStageChanges',{stageKey:stage.key,artifactId:w.results[(w.stageIndex||0)-1]!.id,comment:text}):await update('comment',{comment:text});if(d){clearText();}}
 return <Section title={$t('common.activity')}><ol className="nr-td-timeline">{rows.map(({e,t},i)=>{const who=t!.who===$t('common.you')?(e.actor&&people.get(e.actor))||$t('common.you'):t!.who;const run=e.runId?runs.get(e.runId):undefined;
  if(e.action==='comment'||e.action==='requestStageChanges')return <li key={i} className="nr-td-comment"><header><ActorAvatar type="user" name={who} size="xs"/><b>{who}</b>{e.action==='requestStageChanges'&&<Tag tone="violet">{$t('taskDetail.requestChanges')}</Tag>}<time>{when(e.at)}</time></header><p>{e.comment}</p></li>;
  return <li key={i} className="nr-td-event">{eventIcons[e.action]||<Play/>}<b>{who}</b><span>{t!.text}{e.action==='runQueued'&&run?.endedAt?$t('taskDetail.took',{0:took(run)}):''}</span><time>{when(e.at)}</time></li>;})}
  {!rows.length&&<li className="nr-td-muted">{$t('taskDetail.noActivityYet')}</li>}</ol>
  {((!done&&!w.cancelledAt&&!w.archivedAt)||Boolean(text))&&<div className="nr-td-composer"><textarea id="nr-composer" aria-label={$t('taskDetail.noteExecutor')} rows={3} value={text} disabled={busy} readOnly={done||Boolean(w.cancelledAt||w.archivedAt)} placeholder={reviewing?$t('taskDetail.writeFeedbackAfterSendRedoes',{0:getStageExecutor()[stages[(w.stageIndex||0)-1].kind]}):$t('taskDetail.leaveNoteNextRunReads',{0:executor})} onChange={e=>{setText(e.target.value);}}/>{!done&&!w.cancelledAt&&!w.archivedAt&&<div><Button size="sm" disabled={busy||!text.trim()} onClick={()=>void send()}>{reviewing?$t('taskDetail.sendRequestChanges'):$t('taskDetail.send')}</Button></div>}</div>}
 </Section>;
}
function PageLink({data,projectId,taskId,busy,update}:{data:Data;projectId:number;taskId:string;busy:boolean;update:Update}){
 const {allowed}=useContext(TaskAccess);if(!allowed)return <div className="nr-td-card"><h3>{$t('common.relatedPage')}</h3>{data.work.page?<div className="nr-td-page"><a className="nr-link" href={data.work.page.url} target="_blank" rel="noreferrer">{data.work.page.title||data.work.page.url}<ExternalLink aria-hidden="true"/></a></div>:<p className="nr-td-muted">{$t('taskDetail.notLinked')}</p>}</div>;
 return <PageLinkEditor data={data} projectId={projectId} taskId={taskId} busy={busy} update={update}/>;
}
function PageLinkEditor({data,projectId,taskId,busy,update}:{data:Data;projectId:number;taskId:string;busy:boolean;update:Update}){
 const page=data.work.page,[q,setQ]=useState(''),[hits,setHits]=useState<{url:string;title:string;type:string}[]>(),[editing,setEditing]=useState(!page),[focused,setFocused]=useState(false);
 useEffect(()=>{setEditing(!page);},[page?.url]);
 useEffect(()=>{if(!editing)return;const t=setTimeout(()=>{void call<{url:string;title:string;type:string}[]>(projectId,taskId,'pages',{q}).then(r=>setHits(Array.isArray(r)?r:[])).catch(()=>setHits([]));},250);return()=>clearTimeout(t);},[q,editing,projectId,taskId]);
 const path=(u:string)=>{try{return new URL(u).pathname;}catch{return u;}};
 return <div className="nr-td-card"><h3>{$t('common.relatedPage')}</h3>
  {page&&!editing?<div className="nr-td-page"><a className="nr-link" href={page.url} target="_blank" rel="noreferrer">{page.title||path(page.url)}<ExternalLink aria-hidden="true"/></a><small>{path(page.url)}</small>
   <div className="nr-td-row-actions"><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setEditing(true)}>{$t('taskDetail.change')}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void update('linkPage',{url:''})}>{$t('common.remove')}</Button></div></div>
  :<><label className="nr-td-search"><Search aria-hidden="true"/><input aria-label={$t('common.searchPages')} value={q} placeholder={$t('taskDetail.searchPagesWebsiteContent')} onFocus={()=>setFocused(true)} onChange={e=>setQ(e.target.value)}/></label>
   {hits&&(focused||q)&&(hits.length?<ul className="nr-td-hits">{hits.slice(0,6).map(h=><li key={h.url}><button type="button" disabled={busy} onClick={()=>void update('linkPage',{url:h.url}).then(d=>{if(d){setQ('');setEditing(false);}})}><b>{h.title||path(h.url)}</b><small>{path(h.url)}</small></button></li>)}</ul>:<p className="nr-td-muted">{q?$t('taskDetail.noMatchingPages'):$t('taskDetail.websiteContentNoPagesYet')}</p>)}
   {page&&<Button size="sm" variant="ghost" onClick={()=>setEditing(false)}>{$t('common.cancel')}</Button>}</>}
  {!page&&data.work.contentId&&<p className="nr-td-muted">{$t('taskDetail.linkedOldContentMappingPicking')}</p>}
 </div>;
}
// 效果观察 (SPEC §8): day 7 and day 28 against the same number of days before going live.
function EffectCard({w}:{w:Work}){
 const items=effectItems(w),pages=effectPages(w);
 return <div className="nr-td-card"><h3>{$t('taskDetail.impactTracking')}</h3>
  {!w.observeFrom?<p className="nr-td-muted">{$t('taskDetail.startsAfterGoingLiveComparing')}</p>
  :!pages.length?<p className="nr-td-muted">{$t('taskDetail.noRelatedPageNothingCompare')}</p>
  :<ul className="nr-td-effects">{items.map(i=>i.result?<EffectRow key={i.day} r={i.result} observeFrom={w.observeFrom}/>:<li key={i.day} className="nr-td-muted">{$tj('taskDetail.dayResultsAbout',{0:i.day,1:i.expected})}</li>)}</ul>}
 </div>;
}
function EffectRow({r,observeFrom}:{r:EffectResult;observeFrom?:string}){
 const [open,setOpen]=useState(false),range=(x:{start:string;end:string})=>$t('common.range',{0:x.start.slice(5),1:x.end.slice(5)});
 const rows:[string,[number,number],string?][]=[...(r.gsc?[[$t('common.searchClicks'),r.gsc.clicks],[$t('common.searchImpressions'),r.gsc.impressions],[$t('common.ctr'),r.gsc.ctr,'%'],[$t('common.averagePosition'),r.gsc.position]] as [string,[number,number],string?][]:[]),...(r.ga4?[[$t('common.viewCount'),r.ga4.views],[$t('common.keyEvents'),r.ga4.conversions]] as [string,[number,number],string?][]:[])];
 return <li data-c={r.conclusion}><b>{effectLine(r,observeFrom)}</b><button type="button" className="nr-link" onClick={()=>setOpen(v=>!v)}>{open?$t('common.collapse'):$t('taskDetail.seeNumbers')}</button>
  {open&&<div className="nr-td-effect-detail"><Comparison result={r} observeFrom={observeFrom}/>{(!r.coverage||!matchesObservation(r,observeFrom))&&<details><summary>{$t('results.legacy')}</summary><p>{r.conclusion} · {r.change===null?'—':`${r.change*100}%`}</p><p className="nr-td-muted">{$tj('taskDetail.beforeGoingLiveAfter',{0:range(r.baseline),1:range(r.after)})}</p><table><tbody>{rows.map(([k,[b,a],u])=><tr key={k}><th>{k}</th><td>{b}{u}</td><td>→</td><td>{a}{u}</td></tr>)}</tbody></table></details>}</div>}</li>;
}
function Aside({data,list,projectId,taskId,busy,runActive,members,runs,update}:{data:Data;list?:PlaybookList;projectId:number;taskId:string;busy:boolean;runActive:boolean;members:Member[];runs:Run[];update:Update}){
 const navigate=useNavigate(),w=data.work,started=Boolean(w.flow),done=w.stage==='done',index=w.stageIndex||0,state=workState(w);
 const pb=list?.playbooks.find(x=>x.id===(w.playbookId||data.playbookDefault));
 const preview=started?w.flow!.stages:pb?stagesFor(pb):[];
 const pbName=w.playbook?.name||w.flow?.name||pb?.name,pbKind=w.playbook?.kind||pb?.kind,legacyAi=preview.some(s=>s.kind==='ai')&&!preview.some(s=>s.kind==='agent');
 const collab=w.collaborators||[],collabIds=collab.map(c=>c.id),stageName=(key:string)=>preview.find(s=>s.key===key)?.name||key;
 const owners=members.some(m=>m.id===w.humanOwnerId)||!w.humanOwnerId?members:[{id:w.humanOwnerId,name:w.humanOwnerName||w.humanOwnerId},...members],{allowed,owner}=useContext(TaskAccess);
 return <div className="nr-td-aside">
  <div className="nr-td-card"><h3>{$t('taskDetail.properties')}</h3>
   <div className="nr-td-prop"><span>{$t('common.status')}</span><span>{closedLabel(w)?<Tag tone="slate" dot>{closedLabel(w)}</Tag>:<Tag tone={stateToneOf(state)} dot>{getWorkColumns()[state]}</Tag>}</span></div>
   <div className="nr-td-prop"><WithInfo help={help($t('common.playbook'))}>{$t('common.playbook')}</WithInfo><span>{pbName||'—'}{!started&&pbName?$t('taskDetail.notStarted'):''}</span></div>
   {pbKind&&<div className="nr-td-prop"><WithInfo help={help($t('common.executor'))}>{$t('common.executor')}</WithInfo><span>{legacyAi?$t('common.onlineAi'):$t('common.localAgent')}{pb&&!started?<small> · {categoryName(pb.category)}</small>:null}</span></div>}
   {started&&<TaskAgentField data={data} busy={busy} lockedReason={closedLabel(w)?$t('taskDetail.taskClosed'):done?$t('taskDetail.taskDone'):!allowed?$t('taskDetail.ownerAdminChange'):runActive?$t('taskDetail.taskQueuedRunningWaitFinish'):undefined} onChange={async agentId=>Boolean(await update('setAgent',{agentId}))}/>}
   <div className="nr-td-prop"><label htmlFor="nr-owner">{$t('common.owner')}</label><span><select id="nr-owner" aria-label={$t('common.owner')} value={w.humanOwnerId||''} disabled={busy||runActive||!members.length||!allowed} title={!allowed?$t('taskDetail.ownerAdminChange'):runActive?$t('taskDetail.executorRunningChangeAfterFinishes'):undefined} onChange={e=>void update('setOwner',{userId:e.target.value})}>{!w.humanOwnerId&&<option value="">{$t('common.unassigned')}</option>}{owners.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></span></div>
   <div className="nr-td-prop"><span>{$t('taskDetail.collaborators')}</span><span className="nr-td-people">{collab.map(c=><span key={c.id} className="nr-td-person"><ActorAvatar type="user" name={c.name} size="xs"/>{c.name}</span>)}
    <DropdownMenu><DropdownMenuTrigger render={<Button size="sm" variant="ghost" disabled={busy||!members.length||!allowed}>{collab.length?$t('taskDetail.adjust'):$t('common.add')}</Button>}/>
     <DropdownMenuContent align="end">{members.filter(m=>m.id!==w.humanOwnerId).map(m=><DropdownMenuCheckboxItem key={m.id} checked={collabIds.includes(m.id)} onCheckedChange={on=>void update('setCollaborators',{userIds:on?[...collabIds,m.id]:collabIds.filter(x=>x!==m.id)})}>{m.name}</DropdownMenuCheckboxItem>)}{members.filter(m=>m.id!==w.humanOwnerId).length===0&&<p className="nr-td-muted nr-td-menu-empty">{$t('taskDetail.noOtherMembers')}</p>}</DropdownMenuContent></DropdownMenu></span></div>
  </div>
  {preview.length>0&&<div className="nr-td-card"><h3>{$t('common.progress')}</h3><ol className="nr-td-steps">{preview.filter(s=>s.kind!=='observe').map((s,i)=>{const st=!started?'todo':done||i<index?'done':i===index&&!closedLabel(w)?'current':'todo';return <li key={s.key} data-state={st}><span className="nr-td-dot" aria-hidden="true">{st==='done'?<Check/>:null}</span><span>{displayStageName(s)}</span><small>{s.kind==='review'&&!allowed?owner:getStageExecutor()[s.kind]}</small></li>;})}</ol></div>}
  <PageLink data={data} projectId={projectId} taskId={taskId} busy={busy} update={update}/>
  {runs.length>0&&<div className="nr-td-card"><h3>{$t('taskDetail.runHistory')}</h3><ul className="nr-td-runs">{runs.slice(0,6).map(r=><li key={r.id} data-status={r.status}><span className="nr-td-run-dot" aria-hidden="true"/><span>{stageName(r.stepId)}<small className="truncate" title={runnerOf(r)}>{runnerOf(r)}</small></span><small>{active(r)?(r.status==='queued'?$t('common.queued'):$t('common.running')):r.status==='failed'?(getRunErrors()[r.error||'']||$t('common.failed')):took(r)}</small></li>)}</ul></div>}
  {(data.related||[]).length>0&&<div className="nr-td-card"><h3>{$t('taskDetail.relatedTasks')}</h3>{data.related!.map(r=><button key={r.id} type="button" className="nr-link nr-td-related" onClick={()=>navigate(`/actions/${r.id}`)}>{r.relation==='prev'?$t('taskDetail.previous'):$t('taskDetail.next')}{r.title}</button>)}</div>}
  {pbKind==='build'&&<EffectCard w={w}/>}
 </div>;
}
