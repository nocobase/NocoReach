import { formatDateTime, formatDate } from '#lib/format';
import { Skeleton } from '#components/ui/skeleton';
import {matchesObservation} from '../../shared/result-comparison.js';
import { mockSettingsAvailable } from '../../app-plugins/nocoreach-mock/client/index.js';
import { localizeWorkSnapshots } from './playbook-snapshot';
import { reportDate } from './task-detail/material-notices.js';
import { TechnicalDetails } from './task-detail/technical-details.js';
import { useTechnicalDetails, type TechnicalTab } from './task-detail/technical-state.js';
import { failureOf, failureStreak, sentences } from './task-detail/failure-model.js';
import { EvidenceDialog } from './task-detail/evidence.js';
import { taskEvidence, whyText } from './task-detail/evidence-model.js';
import { VisibleChanges } from './task-detail/visible-changes.js';
import { DeliveryDialog, DeliverySummary } from './task-detail/article-start.js';
import { PlaybookDrawer } from './task-detail/playbook-drawer.js';
import { ArticleEditor, ArticleReview } from './task-detail/article-review.js';
import { ConflictBody, DriftNotice, PendingButton, TargetRows } from './task-detail/article-release.js';
import { canRebase, conflictHeading, defaultDelivery, deliveryPlan, exportingNames, failedSub, fieldLabel, joinNames, pageUrlsOf, publishingTitle, soleConflict, translationPending, type ArticleFound, type DeliveryChoice } from './task-detail/article-model.js';
import { matchArticle, localeName } from './article-targets-api';
import { TaskMedia } from './task-detail/media.js';
import { TaskProperties } from './task-detail/task-properties.js';
import { TaskNumbers } from './task-detail/task-numbers.js';
import { Card, Clamped, Field } from './task-detail/layout.js';
import { GAP, text } from './task-detail/styles.js';
import { TaskStatusTag, TaskStandingTag } from './task-status-tag';
import { startAgent, startBlockers, type StartBlocker } from '../../shared/task-start.js';
import { MarkdownEditor } from './task-detail/markdown-editor.js';
import { hasTaskAgent, type PartialResult } from './task-execution-types';
import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {refreshNavBadges} from '#components/app-shell/nav-badges';
import {Outlet,useNavigate,useSearchParams} from 'react-router';
import {useNavigationGuard,usePageBreadcrumb} from '@nocobase/app-client';
import {Comparison} from './results/comparison.js';
import {nocobaseClient as api,NocoReachHttpError} from "#lib/nocoreach-api";
import {BookOpen,CirclePlay,Lock,Archive,ArchiveRestore,Play,Bot,Check,RotateCcw,AlertCircle,Link2,UserRound,Rocket,Pencil,ArrowRightLeft,Move,FileText,GitMerge,Globe,Search,ExternalLink,Users,Square,Undo2,Loader2,MoreHorizontal,Code2,ChevronRight,TriangleAlert,CircleCheck,Sparkles,CircleAlert,Hand} from 'lucide-react';
import {ActorAvatar} from '#components/reach/actor';
import {Tag} from '#components/reach/tag';
import {InfoTip} from '#components/reach/info-tip';
import {PageContainer} from '#components/reach/page';
import {Reveal} from '#components/reach/reveal';
import {Button} from '#components/ui/button';
import {Input} from '#components/ui/input';
import {Textarea} from '#components/ui/textarea';
import {Select,SelectContent,SelectGroup,SelectItem,SelectLabel,SelectTrigger,SelectValue} from '#components/ui/select';
import {cn} from '#lib/utils';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '#components/ui/dialog';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuCheckboxItem,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuSub,DropdownMenuSubTrigger,DropdownMenuSubContent} from '#components/ui/dropdown-menu';
import {TaskDraftScope,TaskDraftRecovery} from './task-detail/drafts.js';
import {Checklist,RequestBox} from './task-detail/review-parts.js';
import type {TaskPageContext} from './task-detail/reader-context.js';
import {useTaskDraft,useTaskDraftStatus} from './task-detail/draft-store.js';
import {DocReader,Markdown} from './doc-view';
import {effectItems,effectLine,effectPages,type EffectResult} from './effect-model';
import {closeCommand,canReopen,closedWhen,getCloseConfirm,closedLabel,isClosed,type TaskData as Data,type Work,type Artifact,type PullRequestInfo} from './task-execution-types';
import {playbookRequest,localizePlaybookList,getCategories,getStageExecutor,stageName as displayStageName,stageLabel,stagesFor,readsOnly,withoutRepo,eventText,type PlaybookList,type Stage} from './playbook-model';
import {translatesArticle} from '../../shared/playbook-catalog';
import './strategy/strategy.css';
import './reach-workspace.css';
import './task-execution.css';
import './task-detail.css';
import {confirmAction} from '#components/reach/confirm';
import {useMe} from './me';
import {parseReplies,ReplyDrafts,REPLY_PLAYBOOK} from './reply-drafts';
// Community reply drafts: the drafts as cards with Copy reply (reply-drafts.tsx); other documents as text.
const repliesOf=(w:Work,content?:string)=>(w.playbook?.id===REPLY_PLAYBOOK||w.flow?.id===REPLY_PLAYBOOK)&&content?parseReplies(content):[];
// Whether you can do this task's steps (2026-10-08): its owner and administrators can; other members read it and leave a message.
const TaskAccess=createContext<{allowed:boolean;self:boolean;owner:string}>({allowed:true,self:true,owner:''});
type Update=(command:string,body?:object)=>Promise<Data|undefined>;
// What the cards can ask of the rest of the page (2026-10-23 user request: actions instead of directions such as "change
// the Agent above"): open the Agent picker in Properties, focus the message to the Agent, choose the related page, and
// complete the current step by hand (asked from the task menu, carried out by the card that holds the form), and go to
// the task an accepted document was handed over to.
const TaskActions=createContext<{pickAgent:()=>void;messageAgent:()=>void;choosePage:()=>void;askManual:()=>void;manualAsk:number;handedOver:(taskId:string)=>void}>({pickAgent:()=>undefined,messageAgent:()=>undefined,choosePage:()=>undefined,askManual:()=>undefined,manualAsk:0,handedOver:()=>undefined});
type Member={id:string;name:string};
type Run=Data['runs'][number];
// Why a run failed and what to do (task-detail/failure-model.ts). Trying again cannot help these until someone signs in,
// fixes the setup or picks another Agent (2026-10-21 user report: the card pushed Try again for a tool that was not
// signed in), so it stays available but not as the main action.
const NO_RETRY=new Set(['toolLogin','setup','model','missingTool','toolSignIn']);
const call=<T,>(projectId:number,taskId:string,action:string,body:object={})=>api.action<T>('nrTaskWork',action,{method:'POST',body:{projectId:String(projectId),taskId,...body},unwrap:'data'});
// Tasks run by a playbook (new tasks, and tasks started with a flow) use this page; older step-plan tasks keep theirs.
export function isPlaybookTask(d:Data){const w=d.work;return Boolean(w.playbook||w.flow)||(w.stage==='plan'&&!w.plan&&!w.simple);}
const when=(iso?:string)=>iso&&!Number.isNaN(Date.parse(iso))?formatDateTime(iso):'';
// Agent text often carries machine timestamps (2026-10-16T10:03:33.905Z); show them as the rest of the page does.
const humanTimes=(text:string)=>text.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})/g,m=>when(m)||m);
const active=(r:Run)=>r.status==='queued'||r.status==='running';
function since(iso:string){const m=Math.max(0,Math.round((Date.now()-Date.parse(iso))/60000));return Number.isNaN(m)||m<1?$t('taskDetail.under1Min'):$t('taskDetail.min',{0:m});}
const pathOf=(u:string)=>{try{const x=new URL(u);return x.pathname+x.search;}catch{return u;}};
const PageLinks=({pages}:{pages:string[]})=>pages.length?<ul className="nr-td-live-pages">{pages.map(u=><li key={u}><a className="nr-link" href={u} target="_blank" rel="noreferrer">{pathOf(u)}<ExternalLink aria-hidden="true"/></a></li>)}</ul>:null;
// A long document is read at a comfortable line length inside the full-width card.
const Reading=({children}:{children:ReactNode})=><div className="max-w-[45em] min-w-0">{children}</div>;
// Task page for the people who run marketing (2026-10-16 user decision): it answers three questions, each once —
// why the task exists (header), what it needs from you now (the stage card, which changes with the step and becomes
// the result after going live), and what has happened (activity). Developer material — pull requests, code, checks,
// Runner and model details, the execution transcript — is behind Technical details.
export function TaskDetail({projectId,taskId,initial}:{projectId:number;taskId:string;initial:Data}){
 return <TaskDraftScope scope={`${projectId}:${taskId}`}><TaskDetailContent key={`${projectId}:${taskId}`} projectId={projectId} taskId={taskId} initial={initial}/></TaskDraftScope>;
}
function TaskDetailContent({projectId,taskId,initial}:{projectId:number;taskId:string;initial:Data}){
 const {dirty,clear}=useTaskDraftStatus();
 const [storedData,setStoredData]=useState<Data>(initial),[busy,setBusy]=useState(false),[error,setError]=useMessageState(''),[rawPlaybooks,setRawPlaybooks]=useState<PlaybookList>(),[members,setMembers]=useState<Member[]>([]),[membersLoaded,setMembersLoaded]=useState(false);
 const [resultParams]=useSearchParams();
 const data={...storedData,work:localizeWorkSnapshots(storedData.work)};
 const list=localizePlaybookList(rawPlaybooks);
 // Keep the submitting instance mounted so its response updates the visible task revision.
 useNavigationGuard(()=>!busy);
 const pending=useRef(false),op=useRef({key:'',id:''});
 const w=data.work,runActive=data.runs.some(active);
 // An article release moves on in the background (publishing, export): keep the card current while it does.
 const releasePolling=w.release?.state==='publishing'||w.release?.state==='exporting';
 // The playbook chosen in the start card; the header's steps follow it before the task starts.
 const [pick,setPick]=useState(w.playbookId||data.playbookDefault||'optimize-page');
 const [evidenceOpen,setEvidenceOpen]=useState(false),[pageOpen,setPageOpen]=useState(false),[agentPicker,setAgentPicker]=useState(false),[manualAsk,setManualAsk]=useState(0),[handedTo,setHandedTo]=useState<string>();
 const actions=useMemo(()=>({manualAsk,askManual:()=>setManualAsk(n=>n+1),choosePage:()=>setPageOpen(true),
  pickAgent:()=>{document.getElementById('task-agent-menu')?.scrollIntoView?.({block:'center'});setAgentPicker(true);},
  messageAgent:()=>{const box=document.getElementById('nr-composer');box?.scrollIntoView?.({block:'center'});box?.focus();},handedOver:setHandedTo}),[manualAsk]);
 // Accept and start lands on the new task (2026-10-24 user report: the person stayed on the old one and could not tell
 // whether the next one had started), once the request has settled so the page's leave guard lets it go.
 const navigate=useNavigate();
 useEffect(()=>{if(handedTo&&!busy)void navigate(`/actions/${handedTo}`);},[handedTo,busy,navigate]);
 useEffect(()=>{void playbookRequest<PlaybookList>('list',projectId).then(setRawPlaybooks).catch(()=>undefined);void call<Member[]>(projectId,taskId,'members').then(m=>setMembers(Array.isArray(m)?m:[])).catch(()=>undefined).finally(()=>setMembersLoaded(true));},[projectId]);
 useEffect(()=>{if(!runActive&&!releasePolling)return;const t=setInterval(()=>{if(!pending.current)void call<Data>(projectId,taskId,'get').then(next=>{setStoredData(next);setError('');}).catch(()=>setError(() => ($t('taskDetail.runStatusTemporarilyUnavailableRetry'))));},2500);return()=>clearInterval(t);},[runActive, releasePolling, projectId, taskId, setError]);
 const update:Update=async(command,body={})=>{if(pending.current)return;pending.current=true;setBusy(true);setError('');const key=JSON.stringify([data.work.revision,command,body]);if(op.current.key!==key)op.current={key,id:crypto.randomUUID()};
  try{const d=await call<Data>(projectId,taskId,'advance',{revision:data.work.revision,requestId:op.current.id,command,...body});setStoredData(d);refreshNavBadges();return d;}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.operationFailed')));
   // A conflict means the page is behind the server (an Agent removed, another window's change): reload the task so
   // what it offers next is current. The message stays until the next command succeeds.
   if(e instanceof NocoReachHttpError&&e.status===409)void call<Data>(projectId,taskId,'get').then(setStoredData).catch(()=>undefined);}finally{pending.current=false;setBusy(false);}};
 const index=w.stageIndex||0,stage=w.flow?.stages[index],started=Boolean(w.flow),done=w.stage==='done';
 const draftScope=!started?'start':JSON.stringify([w.flow?.id,w.flow?.version,index,stage?.key,w.results[index-1]?.id]);
 const runs=[...data.runs].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 const {me,can}=useMe(),creator=(data.task.evidence as {createdBy?:{id?:string;name?:string}}|undefined)?.createdBy,ownerId=w.humanOwnerId||creator?.id;
 const access={allowed:can(ownerId),self:!ownerId||!me?.id||String(ownerId)===me.id,owner:w.humanOwnerName||creator?.name||$t('common.owner')};
 const title=shownTitle(data,started?undefined:list?.playbooks.find(x=>x.id===pick));
 const no=(data.task.evidence as {no?:number}|undefined)?.no,heading=no?`T-${no} ${title}`:title;
 // The trail leads back the way the user came: from Results with its filters, otherwise to the task board.
 usePageBreadcrumb(resultParams.has('resultDay')?[{label:$t('results.title'),to:`/results/${taskId}${resultParams.get('resultQuery')||`?day=${resultParams.get('resultDay')==='28'?28:7}`}`},{label:heading}]:[{label:$t('common.tasks'),to:'/actions'},{label:heading}]);
 // One skeleton for every state (2026-10-22 user decision): the two-line header, then the card for what to do now and
 // the activity on the left, and on the right why the task exists, its properties and its performance, always in that
 // order. Below 1280px the two columns become one: why, properties, now, performance, activity.
 return <TaskAccess.Provider value={access}><TaskActions.Provider value={actions}><PageContainer className="nr-task-page">
  <TaskHeading data={data} title={title} list={list} pick={pick} busy={busy} members={members} update={update} onPage={()=>setPageOpen(true)}/>
  <div className={cn('flex flex-col xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start',GAP)}>
   <div className={cn('contents xl:flex xl:min-w-0 xl:flex-col',GAP)}>
    <div className={cn('order-3 flex min-w-0 flex-col',GAP)}>
     {dirty&&<p role='status' className={cn(text.muted,'flex flex-wrap items-center gap-x-2')}>{$t('taskDetail.draftRetained')} <Button size='sm' variant='ghost' disabled={busy} onClick={()=>{void confirmAction({title:()=>($t('taskDetail.discardTaskDrafts',{0:data.task.title})),description:()=>($t('taskDetail.discardDraftWarning')),action:'taskDetail.discardDrafts'}).then(confirmed=>{if(confirmed)clear();});}}>{$t('taskDetail.discardDrafts')}</Button></p>}
     <TaskDraftRecovery activeScope={w.cancelledAt||w.archivedAt||done?undefined:draftScope}/>
     {error&&<p role="alert" className="nr-error">{error}</p>}
     {w.cancelledAt||w.archivedAt?<ClosedCard w={w} update={update} busy={busy}/>:!started?<TaskDraftScope scope='start'><StartCard data={data} list={list} pick={pick} setPick={setPick} update={update} busy={busy} projectId={projectId} taskId={taskId} onEvidence={()=>setEvidenceOpen(true)}/></TaskDraftScope>:done?<DoneCard data={data} update={update} busy={busy}/>:<TaskDraftScope scope={draftScope}><CurrentCard key={draftScope} data={data} update={update} busy={busy} list={list}/></TaskDraftScope>}
    </div>
    <ActivityCard data={data} update={update} busy={busy} members={members} membersLoaded={membersLoaded}/>
   </div>
   <div className={cn('contents xl:flex xl:min-w-0 xl:flex-col',GAP)}>
    <WhyCard data={data} onEvidence={()=>setEvidenceOpen(true)}/>
    <TaskProperties data={data} members={members} allowed={access.allowed} busy={busy} runActive={runActive} className="order-2"
     agentLocked={!access.allowed?$t('taskDetail.ownerAdminChange'):closedLabel(w)?$t('taskDetail.taskClosed'):w.stage==='done'?$t('taskDetail.taskDone'):runActive?$t('taskDetail.taskQueuedRunningWaitFinish'):undefined}
     onOwner={userId=>void update('setOwner',{userId})} onAgent={async agentId=>Boolean(await update('setAgent',{agentId}))} agentPicker={agentPicker} onAgentPicker={setAgentPicker}/>
    <TaskNumbers data={data} projectId={projectId} taskId={taskId} className="order-4"/>
   </div>
  </div>
  <TechnicalDetails data={data} projectId={projectId} taskId={taskId} runs={runs}/>
  <EvidenceDialog open={evidenceOpen} onClose={()=>setEvidenceOpen(false)} data={data} projectId={projectId} taskId={taskId}/>
  {/* The article's reading page (task-detail/article-reader.tsx) covers this page and keeps its scroll position. */}
  <Outlet context={{data,update,busy,error,allowed:access.allowed,draftScope,crumb:no?`T-${no}`:data.task.title,heading} satisfies TaskPageContext}/>
  <Dialog open={pageOpen} onOpenChange={o=>{if(!o)setPageOpen(false);}}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{$t('common.relatedPage')}</DialogTitle></DialogHeader><PageLinkEditor data={data} projectId={projectId} taskId={taskId} busy={busy} update={update}/></DialogContent></Dialog>
 </PageContainer></TaskActions.Provider></TaskAccess.Provider>;
}
// The header, two lines (2026-10-22 user decision): the title with its number in grey, the status and the task's menu;
// then the playbook's steps, the current one highlighted.
// An automatic title follows the playbook chosen on the start card, as the steps do, and is saved so when the task
// starts (server task-title.ts); previewed only in the language it was written in, so the two read the same.
function shownTitle(data:Data,pb?:{name:string}){
 const auto=(data.task.evidence as {autoTitle?:{subject?:string;locale?:string}}|undefined)?.autoTitle;
 return pb&&auto?.subject&&(auto.locale||'zh-CN')===getCurrentLocale()?$t('taskTitle.auto',{0:pb.name,1:auto.subject}).slice(0,200):data.task.title;
}
function TaskHeading({data,title,list,pick,busy,members,update,onPage}:{data:Data;title:string;list?:PlaybookList;pick:string;busy:boolean;members:Member[];update:Update;onPage:()=>void}){
 const no=(data.task.evidence as {no?:number}|undefined)?.no,w=data.work,started=Boolean(w.flow);
 const pb=started?undefined:list?.playbooks.find(x=>x.id===pick),stages=started?w.flow!.stages:pb?stagesFor(pb):[];
 return <header className="flex flex-col gap-1.5">
  <div className="flex items-start justify-between gap-3">
   <h1 className={cn(text.title,'min-w-0 break-words')}>{no?<span className="mr-2 text-muted-foreground">T-{no}</span>:null}{title}</h1>
   <div className="flex shrink-0 items-center gap-1 pt-1.5"><TaskStatusTag work={w} status={(data.task as {status?:string}).status||''}/><MoreMenu data={data} busy={busy} members={members} update={update} onPage={onPage}/></div>
  </div>
  {stages.length>0&&<StepBar stages={stages} w={w}/>}
 </header>;
}
// The playbook's steps as a row of tags, as before #241 (restored 2026-10-24 at the user's request): done ones ticked in
// green, the current one outlined (violet for a person's step, blue for the Agent's), the rest grey.
function StepBar({stages,w}:{stages:Stage[];w:Work}){
 const {self,owner}=useContext(TaskAccess),started=Boolean(w.flow),done=w.stage==='done',index=w.stageIndex||0,closed=Boolean(closedLabel(w));
 const label=(s:Stage)=>{const text=stageLabel(s,w);if(s.kind!=='review'||self)return text;
  // A space where a Latin owner name meets Chinese or Japanese text ("Super Admin" before the review step).
  if(!text.startsWith($t('common.you')))return `${text} · ${owner}`;const rest=text.slice($t('common.you').length);
  return `${owner}${/[A-Za-z0-9]$/.test(owner)&&/^[\u3040-\u30ff\u3400-\u9fff]/.test(rest)?' ':''}${rest}`;};
 return <ol className="nr-td-stepbar flex flex-wrap items-center gap-1" aria-label={$t('common.progress')}>
  {stages.map((s,i)=>{const st=!started?'todo':done||i<index?'done':i===index&&!closed?'current':'todo';return <li key={s.key} className="flex items-center gap-1" data-state={st} aria-current={st==='current'?'step':undefined}>
   {i>0&&<ChevronRight className="size-3 text-muted-foreground" aria-hidden="true"/>}
   <Tag tone={st==='done'?'green':st==='current'?(s.kind==='review'?'violet':'blue'):'grey'} icon={st==='done'?<Check/>:undefined} dot={st==='current'} className={st==='current'?'ring-1 ring-current':undefined}>{label(s)}</Tag>
  </li>;})}
 </ol>;
}
// ✦ Why: the reason in a sentence or two, with the evidence behind it (2026-10-22 user decision, as the website's demo
// card). While a change waits for review it answers why the change was made.
function WhyCard({data,onEvidence}:{data:Data;onEvidence:()=>void}){
 const w=data.work,started=Boolean(w.flow),why=whyText(data),evidence=taskEvidence(data),hasEvidence=Boolean(evidence.signals.length||evidence.brief||evidence.note||evidence.attachments||evidence.resultSource);
 // Before the task starts the brief is shown in full in the card on the left, with View evidence below it; a reason
 // that would only repeat the brief leaves the card out.
 const reason=(why.from==='brief'||why.from==='objective')&&!started?'':why.text;
 if(!reason&&(!started||!hasEvidence))return null;
 const stage=w.flow?.stages[w.stageIndex||0],out=w.results[(w.stageIndex||0)-1];
 const title=w.stage!=='done'&&!isClosed(w)&&stage?.kind==='review'&&Boolean(out?.pr||out?.article)?$t('taskDetail.whyChangeTitle'):$t('taskDetail.whyTitle');
 return <Card className="order-1" aria-label={title} title={<><Sparkles aria-hidden="true" className="size-4 shrink-0 text-agent"/>{title}</>}>
  {reason&&<div className="flex flex-col gap-1">
   <p className={cn(text.body,'leading-6')}>{reason}</p>
   {(why.fact||why.more>0)&&<p className={cn(text.body,'leading-6')}>{why.fact}{why.more>0&&<span className="text-muted-foreground">{why.fact?' ':''}{$t('taskDetail.moreSignals',{0:why.more})}</span>}</p>}
  </div>}
  {hasEvidence&&<Button variant="link" size="sm" className="h-auto font-normal self-start p-0" onClick={onEvidence}>{$t('taskDetail.viewEvidence')}</Button>}
 </Card>;
}
// Everything a task's owner rarely needs: Technical details for engineers, the linked page, collaborators, closing.
function MoreMenu({data,busy,members,update,onPage}:{data:Data;busy:boolean;members:Member[];update:Update;onPage:()=>void}){
 const w=data.work,{allowed}=useContext(TaskAccess),{askManual}=useContext(TaskActions),tech=useTechnicalDetails(),cmd=allowed?closeCommand(w):null;
 // Completing an Agent's step by hand is an escape hatch, not a card action (2026-10-23 user request): offered while
 // the step waits, has failed or is queued, never while the Agent is working on it.
 const stage=w.flow&&w.stage!=='done'&&!isClosed(w)?w.flow.stages[w.stageIndex||0]:undefined;
 const run=stage?.kind==='agent'?data.runs.filter(r=>r.stepId===stage.key&&r.planVersion===0).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0]:undefined;
 const manual=allowed&&stage?.kind==='agent'&&run?.status!=='running';
 const hasCode=w.results.some(r=>r?.pr)||Boolean(w.release?.pr||w.revert?.url),technical=hasCode||data.runs.length>0;
 const collab=w.collaborators||[],collabIds=collab.map(c=>c.id),others=members.filter(m=>m.id!==w.humanOwnerId);
 if(!technical&&!allowed)return null;
 return <DropdownMenu><DropdownMenuTrigger render={<Button size="icon" variant="ghost" aria-label={$t('common.more')}><MoreHorizontal/></Button>}/>
  <DropdownMenuContent align="end" className="w-auto min-w-40">
   {technical&&<DropdownMenuItem onClick={()=>tech.open(hasCode?'result':'runs')}><Code2/>{$t('taskDetail.technicalDetails')}</DropdownMenuItem>}
   {manual&&<DropdownMenuItem disabled={busy} onClick={askManual}><Hand/>{$t('taskDetail.completeManually')}</DropdownMenuItem>}
   {allowed&&<DropdownMenuItem disabled={busy} onClick={onPage}><Link2/>{$t('common.relatedPage')}</DropdownMenuItem>}
   {allowed&&<DropdownMenuSub><DropdownMenuSubTrigger disabled={busy||!members.length}><Users/>{$t('taskDetail.collaborators')}</DropdownMenuSubTrigger>
    <DropdownMenuSubContent>{others.map(m=><DropdownMenuCheckboxItem key={m.id} checked={collabIds.includes(m.id)} onCheckedChange={on=>void update('setCollaborators',{userIds:on?[...collabIds,m.id]:collabIds.filter(x=>x!==m.id)})}>{m.name}</DropdownMenuCheckboxItem>)}{others.length===0&&<p className="nr-td-muted nr-td-menu-empty">{$t('taskDetail.noOtherMembers')}</p>}</DropdownMenuSubContent></DropdownMenuSub>}
   {cmd&&<><DropdownMenuSeparator/><DropdownMenuItem variant="destructive" disabled={busy} onClick={async()=>{if(cmd==='archiveTask'||(await confirmAction({title:() => ($t('common.closeTaskValueConfirmation',{0:data.task.title})),description:() => (getCloseConfirm()),action:'common.closeTask'})))void update(cmd);}}><Archive/>{$t('common.closeTask')}</DropdownMenuItem></>}
  </DropdownMenuContent></DropdownMenu>;
}
// The one card that holds what the task needs from you now: its title, a grey line and the actions in one row that
// stays in view while a long document or comparison scrolls under it; then its content. The section keeps the name of
// what it is (Needs you, Current progress, Done, Status) for assistive technology; the header already shows the status.
// `error` marks something that did not work (2026-10-23 user request: a failure read like any other text): a red mark
// before the title and a red edge on the card.
function StageCard({title,sub,at,children,actions,label=$t('common.needsAction'),spinning=false,error=false}:{title:ReactNode;sub?:ReactNode;at?:string;children?:ReactNode;actions?:ReactNode;label?:string;spinning?:boolean;error?:boolean}){
 const access=useContext(TaskAccess),time=at?when(at):'';
 return <Card sticky className={cn('nr-td-now',error&&'border-destructive/40')} aria-label={label} data-error={error||undefined}
  title={<>{spinning&&<Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"/>}{error&&<CircleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive"/>}{title}</>}
  sub={sub||time?<>{sub}{sub&&time?' · ':''}{time&&<time dateTime={at}>{time}</time>}</>:undefined}
  actions={actions&&(access.allowed?actions:<p className={cn(text.muted,'flex items-center gap-1.5')} data-locked=""><Lock aria-hidden="true" className="size-3.5 shrink-0"/>{$t('taskDetail.reviewsLeaveCommentBelow',{0:access.owner})}</p>)}>
  {children}
 </Card>;
}
// Shown in a card whose action needs an Agent when none can be used: the choice itself is in Properties.
const NeedsAgent=({data}:{data:Data})=>hasTaskAgent(data)||(data.agent?.options||[]).length===1?null:<p className="text-sm text-nr-ink-red">{(data.agent?.options||[]).length?$t('taskDetail.chooseAgentFirst'):$t('taskDetail.noTeamAccessibleRunnerAgents')}</p>;
// With no usable Agent saved on the task and exactly one available, that one is saved first, then `command` runs on
// the revision the save returned (the same rule as Start).
async function withUsableAgent(data:Data,update:Update,command:string,body:object={}){
 const options=data.agent?.options||[];let revision=data.work.revision;
 if(!hasTaskAgent(data)&&options.length===1){const d=await update('setAgent',{agentId:options[0].id});if(!d)return;revision=d.work.revision;}
 return update(command,{...body,revision});
}
// Before a task starts (2026-10-08 user decision: Hand off to agent only creates the task): what the Agent will get,
// the playbook (the one suggested at hand-off preselected) and a note; nothing runs until Start. A task an accepted
// document was handed over to is started with these defaults instead (2026-10-24) and shows this card only when one
// of them needs a person.
function StartCard({data,list,pick,setPick,update,busy,projectId,taskId,onEvidence}:{data:Data;list?:PlaybookList;pick:string;setPick:(id:string)=>void;update:Update;busy:boolean;projectId:number;taskId:string;onEvidence:()=>void}){
 const {allowed}=useContext(TaskAccess);
 const {clear}=useTaskDraftStatus();
 const p=list?.playbooks.find(x=>x.id===pick),handoff=(data.task.evidence?.handoff as {playbook?:string;content?:string}|undefined),brief=handoff?.content||data.task.brief||'',briefTitle=handoff?.content?$t('taskDetail.documentDelivered',{0:handoff.playbook}):$t('taskDetail.whatAgentReceive');
 const options=data.agent?.options||[],agent=startAgent(data),ready=agent.ready;
 // With exactly one Agent available nothing needs choosing: it is saved on the task as the start is confirmed.
 // Article publishing (article-start.tsx): shown for playbooks that change something, when the project has a target.
 const articleChoice=Boolean(p?.kind==='build'&&data.articleTargets?.length);
 // Translate into other languages (2026-10-25): an existing article, from its source language into the ones chosen.
 const translate=articleChoice&&translatesArticle(p);
 // A choice belongs to the playbook it was made for: another playbook starts again from its own default.
 const [choiceState,setChoiceState]=useState<DeliveryChoice&{playbook:string}>();
 const targetIds=(data.articleTargets||[]).map(t=>t.id);
 const choice=choiceState&&choiceState.playbook===pick&&(choiceState.target==='repo'||targetIds.includes(choiceState.target))?{...choiceState,also:choiceState.also.filter(x=>targetIds.includes(x))}:undefined;
 // The article is found from the task's page (2026-10-21) rather than picked from hundreds; Change is for exceptions.
 const pages=pageUrlsOf(data),pagesKey=pages.join('\n'),hasTargets=Boolean(data.articleTargets?.length),savedArticle=data.work.article?.articleId||'';
 const lookupKey=hasTargets&&!savedArticle&&pagesKey?`${projectId}\n${pagesKey}`:'';
 const [lookup,setLookup]=useState<{key:string;found:ArticleFound}>(),[choosing,setChoosing]=useState(false),[viewing,setViewing]=useState(false);
 useEffect(()=>{if(!lookupKey)return;const c=new AbortController();
  void matchArticle(projectId,pagesKey.split('\n'),c.signal).then(r=>{if(!c.signal.aborted)setLookup({key:lookupKey,found:r});},()=>{if(!c.signal.aborted)setLookup({key:lookupKey,found:{article:null,unchecked:true}});});return()=>c.abort();},[lookupKey,projectId,pagesKey]);
 const found:ArticleFound|'finding'|undefined=!lookupKey?undefined:lookup?.key===lookupKey?lookup.found:'finding';
 const finding=found==='finding',delivery=defaultDelivery(data,pick,found==='finding'?undefined:found,translate),current=choice||delivery,plan:{ready:boolean;unlink:boolean;link?:{targetId:string;articleId:string};delivery?:unknown}=articleChoice?deliveryPlan(data,current,translate):{ready:true,unlink:false,delivery:undefined};
 const notice=found&&found!=='finding'&&!found.article?$t(found.unchecked?'articleTask.matchUnavailable':'articleTask.noArticleForPage'):undefined;
 // A task handed over from an accepted document starts by itself (startHandedOver in service.ts, with these same
 // rules from shared/task-start.ts); one still waiting here has something only a person can settle: the sub line says
 // so, and each item is marked where it is chosen (the Agent below, the article in its field, a target or repository).
 const navigate=useNavigate(),st=p?stagesFor(p):[],first=st[0],demo=options.some(a=>a.id===data.agent?.agentId&&a.type==='demo');
 const blockers:StartBlocker[]=handoff?.content&&p&&!finding?startBlockers(data,{playbookId:p.id,changes:p.kind==='build',translate,needsRepository:first?.kind==='agent'&&!withoutRepo(first,st),simulated:demo,found}):[];
 const blocked=(b:StartBlocker,body:ReactNode)=>blockers.includes(b)?<p className="text-sm text-nr-ink-red" data-start-blocker={b}>{body}</p>:null;
 const link=async(targetId:string,articleId:string)=>Boolean(await update('linkArticle',{targetId,articleId}));
 const start=async()=>{let revision=data.work.revision;if(agent.save){const d=await update('setAgent',{agentId:agent.save});if(!d)return;revision=d.work.revision;}if(plan.unlink){const d=await update('linkArticle',{targetId:null,revision});if(!d)return;revision=d.work.revision;}if(plan.link){const d=await update('linkArticle',{...plan.link,revision});if(!d)return;revision=d.work.revision;}const d=await update('startTask',{playbookId:pick,revision,...(plan.delivery?{delivery:plan.delivery}:{})});if(d)clear();};
 const attachments=Array.isArray(data.task.evidence?.attachmentIds)&&data.task.evidence.attachmentIds.length>0;
 const briefText=brief.replace(/[#*>`_]/g,'').replace(/^[ \t]+/gm,'').replace(/\n{2,}/g,'\n').trim();
 // Top to bottom, every field the card's full width (2026-10-22 user decision): the brief as plain text, the playbook
 // with its description, the article where the change goes, and the note.
 return <StageCard title={$t('taskDetail.startAfterReview')} sub={handoff?$t(blockers.length?'taskDetail.handoffNotStarted':'taskDetail.taskHandedOverDocumentDelivered',{0:handoff.playbook}):$t('taskDetail.agentNotStartedReadBrief')}
  actions={<Button disabled={busy||!p||!ready||!plan.ready||finding} onClick={()=>void start()}>{$t('taskDetail.confirmStart')}</Button>}>
  {briefText&&<Field label={briefTitle}><Clamped long={briefText.length>240||briefText.split('\n').length>3} extra={whyText(data).from==='brief'&&<Button variant="link" size="sm" className="h-auto font-normal p-0" onClick={onEvidence}>{$t('taskDetail.viewEvidence')}</Button>}>{briefText}</Clamped></Field>}
  <Field label={$t('common.playbook')} id={`${taskId}-playbook`}>
   <Select value={pick} disabled={busy||!list||!allowed} onValueChange={v=>{if(v!=null)setPick(String(v));}}>
    <SelectTrigger className="w-full" aria-labelledby={`${taskId}-playbook`}><SelectValue>{(v:string)=>{const x=list?.playbooks.find(y=>y.id===v);return x?`${x.name}${x.id===data.playbookDefault?$t('taskDetail.recommended'):''}`:v;}}</SelectValue></SelectTrigger>
    <SelectContent className="max-w-[min(var(--container-md),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal">
     {getCategories().map(([k,label])=>{const items=(list?.playbooks||[]).filter(x=>x.category===k);return items.length?<SelectGroup key={k}><SelectLabel>{label}</SelectLabel>{items.map(x=><SelectItem key={x.id} value={x.id}>{x.name}{x.id===data.playbookDefault?$t('taskDetail.recommended'):''}</SelectItem>)}</SelectGroup>:null;})}
    </SelectContent>
   </Select>
   {/* View steps opens the playbook over the page (2026-10-21), so the choices made here stay. */}
   {p&&<p className={text.muted}>{p.description}{p.description?' ':''}<Button variant="link" size="sm" className="h-auto font-normal p-0 align-baseline" onClick={()=>setViewing(true)}>{$t('taskDetail.viewSteps')}</Button></p>}
   <PlaybookDrawer playbook={p} open={viewing} onClose={()=>setViewing(false)}/>
  </Field>
  {articleChoice&&<DeliverySummary data={data} choice={current} finding={finding} notice={notice} allowed={allowed} busy={busy} translate={translate} onChange={()=>setChoosing(true)}/>}
  {blocked('chooseTarget',$t('taskDetail.startChooseTarget'))}
  {blocked('targetGone',$t('articles.targetMissing'))}
  {articleChoice&&<DeliveryDialog open={choosing} onClose={()=>setChoosing(false)} data={data} projectId={projectId} choice={current} found={found&&found!=='finding'?found.article:null} notice={notice} translate={translate} busy={busy} link={link} onSave={c=>setChoiceState({...c,playbook:pick})}/>}
  <NeedsAgent data={data}/>
  {blocked('noRepository',<>{$t('taskDetail.noWebsiteSourceRepositoryConnectedMessage')} <Button variant="link" size="sm" className="h-auto font-normal p-0 align-baseline" onClick={()=>void navigate('/connections?source=repo')}>{$t('common.goDataSources')}</Button></>)}
  {attachments&&<Field label={$t('taskDetail.attachmentsDelivered')}><TaskMedia projectId={projectId} taskId={taskId}/></Field>}
 </StageCard>;
}
// From the second version on: what was asked last time, above the version that answers it.
function LastFeedback({w,stage,out}:{w:Work;stage:Stage;out:Artifact}){
 if(out.version<2)return null;
 const last=[...(w.history||[])].reverse().find(e=>e.action==='requestStageChanges'&&(!e.stageKey||e.stageKey===stage.key)&&e.comment);
 return last?<p className={cn(text.body,'whitespace-pre-wrap')}><span className="text-muted-foreground">{$t('taskDetail.lastFeedback')}</span>{last.comment}</p>:null;
}
// What a failed run got before it stopped (2026-10-24 user decision): kept for the owner to read or to finish the step
// with by hand, and handed to the step's next run to continue from.
function GotSoFar({partial,onUse}:{partial:PartialResult;onUse?:()=>void}){
 const report=Array.isArray(partial.report?.sources)?partial.report:undefined,sources=report?.sources.length||0;
 return <Reveal label={<>{$t('taskDetail.partialTitle')}{sources?<span className="font-normal text-muted-foreground">· {$t('taskDetail.partialSources',{0:sources})}</span>:null}</>}>
  <div className="flex flex-col gap-3">
   <Reading><Markdown content={partial.content}/></Reading>
   {report&&<ReportNotes report={report}/>}
   <p className={text.muted}>{$t('taskDetail.partialContinue')}</p>
   {onUse&&<Button variant="outline" className="self-start" onClick={onUse}>{$t('taskDetail.partialUse')}</Button>}
  </div>
 </Reveal>;
}
// Sources and open questions the Agent reported, with machine timestamps made readable.
function ReportNotes({report}:{report:NonNullable<Artifact['report']>}){
 return <Field label={$t('taskDetail.sourcesUncertainties')}><div className={cn(text.body,'flex flex-col gap-1')}><p className="text-muted-foreground">{humanTimes(reportDate(report.asOf))}</p>{report.sources.map(source=>source.material?<p key={`${source.material}:${source.title}`}>{source.title} · {$t('agentResult.material')}</p>:<a key={`${source.url}:${source.title}`} className="nr-link break-all" href={source.url} target="_blank" rel="noreferrer">{source.title||source.url}</a>)}{report.uncertainties.map((note,i)=><p key={i}>{humanTimes(note)}</p>)}</div></Field>;
}
// A page change as its owner reviews it: the Agent's summary, what visitors will see before and after, where to
// look, and one line on the automatic checks. Code, branches and check output are in Technical details.
function PageChange({pr,content}:{pr?:PullRequestInfo;content:string}){
 const tech=useTechnicalDetails(),pages=pr?.pages||[];
 return <div className="flex flex-col gap-4">
  {pr?.release&&<Field label={$t('taskDetail.whatChanged')}><Clamped long={pr.release.length>200||pr.release.split('\n').length>3}>{humanTimes(pr.release)}</Clamped></Field>}
  {pr?.visibleChanges?.length?<VisibleChanges items={pr.visibleChanges}/>:pr?<p className={text.muted}>{$t('taskDetail.noVisibleChanges')}</p>:<Reading><Markdown content={content}/></Reading>}
  {pr&&<div className={cn(text.body,'flex flex-wrap items-center gap-x-4 gap-y-2')}>
   {pr.previewUrl&&<a className="nr-link inline-flex items-center gap-1" href={pr.previewUrl} target="_blank" rel="noreferrer"><Globe className="size-4" aria-hidden="true"/>{$t('taskDetail.openPreviewPage')}</a>}
   {pages.map(u=><a key={u} className="nr-link inline-flex items-center gap-1" href={u} target="_blank" rel="noreferrer">{$t('common.openPage')} {pathOf(u)}<ExternalLink className="size-3" aria-hidden="true"/></a>)}
   {pr.checks&&<span className="inline-flex items-center gap-1 text-muted-foreground">{pr.checks.ok?<CircleCheck className="size-4 text-nr-ink-green" aria-hidden="true"/>:<TriangleAlert className="size-4 text-nr-ink-amber" aria-hidden="true"/>}{pr.checks.ok?$t('taskDetail.checksPassed'):$t('taskDetail.checksNeedAttention')}</span>}
   <Button variant="link" size="sm" className="h-auto font-normal p-0 text-muted-foreground" onClick={()=>tech.open('result')}><Code2/>{$t('taskDetail.technicalDetails')}</Button>
  </div>}
 </div>;
}
const ScopeConfirm=({pr,ok,setOk,busy}:{pr?:PullRequestInfo;ok:boolean;setOk:(v:boolean)=>void;busy:boolean})=>pr?.outOfScope?.length?<label className="flex items-start gap-2 text-sm text-destructive"><input type="checkbox" className="mt-0.5 size-4 accent-destructive" checked={ok} disabled={busy} onChange={e=>setOk(e.target.checked)}/> {$t('taskDetail.otherFilesChanged')}</label>:null;
// The version under review, under the card's title: the Agent's own needs no name, since Properties shows the Agent
// (2026-10-24 user request: "Agent · Version 2"); a version a person made says so, without assuming it was you.
const versionLine=(out:{version:number;manual?:boolean;createdBy?:string})=>[$t('taskDetail.versionNumber',{0:out.version}),out.manual?$t('taskDetail.doneByHand'):out.createdBy&&out.createdBy!=='agent'?$t('taskDetail.editedByHand'):''].filter(Boolean).join(' · ');
// The note that goes with a publish, folded until asked for.
function ReleaseNote({value,onChange,busy,open}:{value:string;onChange:(v:string)=>void;busy:boolean;open:boolean}){
 return <Reveal label={$t('taskDetail.editReleaseNotes')} defaultOpen={open}><Field label={$t('taskDetail.releaseNotesGoPublishRecord')}><Textarea aria-label={$t('taskDetail.releaseNotes')} rows={3} value={value} disabled={busy} placeholder={$t('taskDetail.oneTwoSentencesWhatChanged')} onChange={e=>onChange(e.target.value)}/></Field></Reveal>;
}
function CurrentCard({data,update,busy,list}:{data:Data;update:Update;busy:boolean;list?:PlaybookList}){
 const w=data.work,stages=w.flow!.stages,index=w.stageIndex||0,stage=stages[index];
 const navigate=useNavigate(),tech=useTechnicalDetails(),{allowed}=useContext(TaskAccess),{manualAsk,pickAgent,messageAgent,handedOver}=useContext(TaskActions);const [manualOpen,setManual]=useTaskDraft('manual',false,false),[scopeOk,setScopeOk]=useState(false);
 // Complete this step manually, asked from the task menu: opens the form here once per request, not again on remount.
 const handledAsk=useRef(manualAsk);
 useEffect(()=>{if(manualAsk!==handledAsk.current){handledAsk.current=manualAsk;setManual(true);}},[manualAsk,setManual]);
 const [checked,setChecked]=useState<string[]>([]),[editingOpen,setEditing]=useTaskDraft('editing',false,false),[draft,setDraft]=useTaskDraft('draft',w.results[index-1]?.content||''),[record,setRecord]=useTaskDraft('record',''),[note,setNote]=useTaskDraft('note',''),[url,setUrl]=useTaskDraft('url','');
 const [requestOpen,setRequest]=useTaskDraft('requesting',false,false);
 const editButtonRef=useRef<HTMLButtonElement>(null);
 const manual=manualOpen||Boolean(record),editing=editingOpen||draft!==(w.results[index-1]?.content||'');
 // What can follow the accepted document: the playbook's next steps as they are now, as the server checks them
 // (2026-10-28), or the start's copy when the playbook is gone; the first is preselected until another is chosen.
 const current=list?.playbooks.find(p=>p.id===w.playbook?.id),last=stages.slice(index+1).every(s=>s.kind==='observe'),nextOptions=w.playbook?.kind==='plan'&&last?current?.next??w.playbook.next:[];
 const [chosen,setNext]=useState<string>(),next=chosen===''||(chosen&&nextOptions.includes(chosen))?chosen:nextOptions[0]||'',[articleTab,setArticleTab]=useState(''),[relNote,setRelNote]=useTaskDraft('release',w.results[index-1]?.pr?.release||'');
 const {clear}=useTaskDraftStatus();
 const act=async(command:string,body:object)=>{const result=await update(command,{stageKey:stage.key,...body});if(result&&['editStageOutput','recordManual','confirmPublish','approveStage','requestStageChanges'].includes(command))clear();return result;};
 const name=(id:string)=>list?.playbooks.find(p=>p.id===id)?.name||id;
 const cur=data.runs.filter(r=>r.stepId===stage.key&&r.planVersion===0).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0];
 const producer=stages[index-1],out=w.results[index-1];
 const request=(executor:string)=>requestOpen&&out?<RequestBox executor={executor} busy={busy} onCancel={()=>setRequest(false)} onSend={async comment=>Boolean(await act('requestStageChanges',{artifactId:out.id,comment}))}/>:null;
 const requestButton=<Button variant="outline" disabled={busy} onClick={()=>setRequest(!requestOpen)}>{$t('taskDetail.requestChanges')}</Button>;
 const techLinkTo=(tab:TechnicalTab)=><Button variant="link" size="sm" className="h-auto font-normal self-start p-0 text-muted-foreground" onClick={()=>tech.open(tab)}><Code2/>{$t('taskDetail.technicalDetails')}</Button>,techLink=techLinkTo('runs');
 const progress=$t('taskDetail.currentProgress');
 if(stage.kind==='review'&&stages[index+1]?.kind==='release'){
  const pr=out?.pr;
  if(!out)return <StageCard error title={displayStageName(stage)} sub={$t('taskDetail.noChangesViewRefreshTry')}/>;
  const by=versionLine(out);
  // An article to publish to a target (article-review.tsx): read field by field, or edited as a new version. It has no
  // release note to write: no target receives one, and the task's record keeps the Agent's summary (2026-10-24).
  if(out.article){
   const missingChecks=(stage.checklist||[]).some(c=>c.required&&!checked.includes(c.key));
   // A target removed after the draft was written cannot receive it: say so instead of offering a publish that fails.
   const articleTarget=out.article.targetId,targetGone=!(data.articleTargets||[]).some(t=>t.id===articleTarget);
   // In several languages the card says which round it is: the primary to approve, or the translations to publish.
   const langs=w.delivery?.locales||[],translated=langs.length>1&&Boolean(w.delivery?.translateFrom);
   const reviewTitle=translationPending(data)?$t('articleTask.reviewPrimaryTitle',{0:localeName(langs[0],getCurrentLocale())}):translated?$t('articleTask.reviewTranslatedTitle'):$t('articleTask.reviewTitle');
   return <StageCard title={reviewTitle} sub={by} at={out.createdAt}
    actions={editing||!allowed?undefined:<>{!targetGone&&<Button disabled={busy||missingChecks} onClick={()=>void act('approveStage',{artifactId:out.id,checked})}><Rocket/>{$t(translationPending(data)?'articleTask.approveTranslate':(mockSettingsAvailable() || data.task.evidence?.simulated) ? 'taskDetail.approveAndSimulatePublish' : 'taskDetail.approveAndPublish')}</Button>}{requestButton}<Button ref={editButtonRef} variant='ghost' disabled={busy} onClick={()=>setEditing(true)}><Pencil/>{$t('taskDetail.editDirectly')}</Button></>}>
    {!editing&&request(getStageExecutor().agent)}
    {targetGone&&<p role='alert' className='text-sm text-destructive'>{$t('articles.targetMissing')}</p>}
    <LastFeedback w={w} stage={stage} out={out}/>
    {editing?<ArticleEditor data={data} article={out.article} draftKey={out.id} tab={articleTab} busy={busy} onCancel={()=>{setEditing(false);setTimeout(()=>editButtonRef.current?.focus(),0);}} onSave={async article=>{const d=await act('editArticleDraft',{artifactId:out.id,article});if(d){setEditing(false);setTimeout(()=>editButtonRef.current?.focus(),0);}return Boolean(d);}}/>:<>
     <ArticleReview key={out.id} data={data} article={out.article} notes={out.content} tab={articleTab} onTab={setArticleTab} readerTo={(lang,view)=>`article?lang=${encodeURIComponent(lang)}&view=${view}`}/>
     <Checklist stage={stage} checked={checked} setChecked={setChecked} busy={busy}/>
    </>}
   </StageCard>;
  }
  const missing=(stage.checklist||[]).some(c=>c.required&&!checked.includes(c.key))||Boolean(pr?.outOfScope?.length&&!scopeOk);
  return <StageCard title={(pr||data.task.evidence?.simulated)?$t('taskDetail.pageChangeReady'):$t('taskDetail.madeChangeYourselfAfterConfirm')} sub={by} at={out.createdAt}
   actions={<><Button disabled={busy||missing} onClick={()=>void act('approveStage',{artifactId:out.id,checked,release:{note:relNote},...(pr?.outOfScope?.length?{confirmOutOfScope:scopeOk}:{})})}><Rocket/>{$t((mockSettingsAvailable() || data.task.evidence?.simulated) ? 'taskDetail.approveAndSimulatePublish' : 'taskDetail.approveAndPublish')}</Button>{requestButton}<InfoTip label={$t('taskDetail.aboutPublishing')}>{(mockSettingsAvailable() || data.task.evidence?.simulated)?$t('taskDetail.simulatedReleaseDescription'):$t('taskDetail.publishHint')}</InfoTip></>}>
   {request(getStageExecutor().agent)}
   <LastFeedback w={w} stage={stage} out={out}/>
   <PageChange pr={pr} content={out.content}/>
   <ScopeConfirm pr={pr} ok={scopeOk} setOk={setScopeOk} busy={busy}/>
   <Checklist stage={stage} checked={checked} setChecked={setChecked} busy={busy}/>
   <ReleaseNote value={relNote} onChange={setRelNote} busy={busy} open={relNote!==(pr?.release||'')}/>
  </StageCard>;
 }
 if(stage.kind==='release'){
  const r=w.release,queued=cur?.status==='queued';
  if(!r)return <StageCard error title={displayStageName(stage)} sub={$t('taskDetail.nothingPublishRefreshTryAgain')}/>;
  // Article releases (article-release.tsx): saved in the target, exported, then the same page check as a PR.
  if(r.article){
   // Several targets: each has a row with its state; the title and the one action follow the aggregate.
   const act2=allowed,rows=<TargetRows data={data} r={r}/>,sole=soleConflict(r);
   if(r.state==='publishing')return <StageCard label={progress} spinning title={publishingTitle(data,r)} sub={$t('articleTask.publishingHint')}>{rows}</StageCard>;
   if(r.state==='publish_failed')return <StageCard error title={$t('articleTask.publishFailed')} sub={failedSub(r)} actions={act2?<PendingButton disabled={busy} onClick={()=>act('retryPublish',{})}>{$t('articleTask.retry')}</PendingButton>:undefined}>{rows}{techLinkTo('result')}</StageCard>;
   if(r.state==='publish_conflict')return <StageCard title={conflictHeading(data,r)} actions={act2&&canRebase(r)?<PendingButton disabled={busy} onClick={()=>act('rebaseArticle',{})}>{$t('articleTask.reviewAgain')}</PendingButton>:undefined}>{rows}{sole&&!r.also&&<ConflictBody data={data} r={sole}/>}</StageCard>;
   if(r.state==='exporting')return <StageCard label={progress} title={$t('articleTask.exporting',{0:exportingNames(data,r)})} sub={$t('articleTask.exportingHint')} actions={act2?<Button variant='ghost' disabled={busy} onClick={()=>void act('confirmLive',{})}>{$t('taskDetail.iConfirmLive')}</Button>:undefined}>{rows}<PageLinks pages={r.pages}/><DriftNotice data={data} r={r}/></StageCard>;
   if(r.state==='export_late')return <StageCard title={$t('articleTask.exportLate')} sub={$t('articleTask.exportLateHint',{0:exportingNames(data,r)})} actions={act2?<><Button disabled={busy} onClick={()=>void act('confirmLive',{})}>{$t('taskDetail.iConfirmLive')}</Button><Button variant='outline' disabled={busy} onClick={()=>void act('waitLonger',{})}>{$t('common.waitAnother24Hours')}</Button></>:undefined}>{rows}<PageLinks pages={r.pages}/></StageCard>;
  }
  const manualMark=<Button variant="ghost" disabled={busy} onClick={()=>void act('markMerged',{})}>{$t('taskDetail.publishedManually')}</Button>;
  if(r.state==='merging')return <StageCard label={progress} spinning title={$t('taskDetail.publishing')} sub={queued&&!data.agent?.online?<>{$t('taskDetail.agentComputerOfflinePublish')} <Button variant="link" size="sm" className="h-auto font-normal p-0 align-baseline" onClick={()=>navigate('/agents')}>{$t('common.manageAgents')}</Button></>:$t('taskDetail.publishingHint')} actions={queued?manualMark:undefined}/>;
  if(r.state==='merge_failed')return <StageCard error title={$t('taskDetail.publishFailed')} sub={cur?.restartedAt?$t('taskDetail.publishRestartHint'):$t('taskDetail.publishFailedHint')} actions={<><Button disabled={busy} onClick={()=>void act('retryMerge',{})}>{$t('taskDetail.tryAgain')}</Button>{manualMark}</>}>{techLink}</StageCard>;
  const live=<Button variant={r.state==='verifying'?'ghost':'default'} disabled={busy} onClick={()=>void act('confirmLive',{})}>{$t('taskDetail.iConfirmLive')}</Button>;
  if(r.state==='verifying')return <StageCard label={progress} title={$t('taskDetail.waitingSiteUpdate')} sub={$t('taskDetail.waitingSiteUpdateHint',{0:r.lastCheckAt?$t('taskDetail.lastCheckedNotSeenYet',{0:when(r.lastCheckAt)}):''})} actions={live}><TargetRows data={data} r={r}/><PageLinks pages={r.pages}/><DriftNotice data={data} r={r}/></StageCard>;
  const [title,sub]=r.reason==='manual'?[$t('taskDetail.waitingConfirmLive'),$t('taskDetail.madeChangeYourselfConfirmOnce')]:r.reason==='cannot_verify'?[$t('taskDetail.publishedWaitingConfirmLive'),$t('taskDetail.changeNoTextCheckedWeb')]:[$t('taskDetail.changeNotSeenLiveAfter'),$t('taskDetail.siteMayNotHaveUpdated')];
  return <StageCard title={title} sub={sub} actions={<>{live}{!r.reason&&<Button variant='outline' disabled={busy} onClick={()=>void act('waitLonger',{})}>{$t('common.waitAnother24Hours')}</Button>}</>}><TargetRows data={data} r={r}/><PageLinks pages={r.pages}/><DriftNotice data={data} r={r}/></StageCard>;
 }
 if(stage.kind==='review'){
  const missing=(stage.checklist||[]).some(c=>c.required&&!checked.includes(c.key))||Boolean(out?.pr?.outOfScope?.length&&!scopeOk);
  const label=nextOptions.length&&next?$t('taskDetail.acceptHandAgent',{0:name(next)}):stages[index+1]?.kind==='agent'?$t('taskDetail.approveHand',{0:getStageExecutor().agent}):stages[index+1]?.kind==='publish'?$t('taskDetail.approvePublish'):$t('taskDetail.accept');
  const by=out?versionLine(out):'';
  if(!out)return <StageCard error title={displayStageName(stage)} sub={$t('taskDetail.nothingReviewRefreshTryAgain')}/>;
  return <StageCard title={$t('taskDetail.resultReady',{0:producer.name})} sub={by} at={out.createdAt}
   actions={editing?<><Button disabled={busy||!draft.trim()} onClick={()=>void act('editStageOutput',{artifactId:out.id,content:draft})}>{$t('taskDetail.saveChanges')}</Button><Button variant="ghost" onClick={()=>{setEditing(false);setDraft(w.results[index-1]?.content||'');}}>{$t('common.cancel')}</Button></>
    :<><Button disabled={busy||missing} onClick={()=>void act('approveStage',{artifactId:out.id,checked,...(nextOptions.length&&next?{next}:{}),...(out.pr?.outOfScope?.length?{confirmOutOfScope:scopeOk}:{})}).then(d=>{if(d&&nextOptions.length&&next&&d.work.nextTaskId)handedOver(String(d.work.nextTaskId));})}>{label}</Button>{requestButton}<Button variant="ghost" disabled={busy} onClick={()=>{setDraft(out.content);setEditing(true);}}><Pencil/>{$t('taskDetail.editDirectly')}</Button></>}>
   {!editing&&request(getStageExecutor()[producer.kind])}
   <LastFeedback w={w} stage={stage} out={out}/>
   {editing?<MarkdownEditor aria-label={$t('taskDetail.editContent')} value={draft} disabled={busy} onChange={e=>{setDraft(e.target.value);}} preview={value=><Markdown content={value}/>}/>:<>
    {out.pr?<PageChange pr={out.pr} content={out.content}/>:(()=>{const r=repliesOf(w,out.content);return r.length?<ReplyDrafts items={r}/>:<Reading><Markdown content={out.content}/></Reading>;})()}
    <ScopeConfirm pr={out.pr} ok={scopeOk} setOk={setScopeOk} busy={busy}/>
    {out.report&&<ReportNotes report={out.report}/>}
    <Checklist stage={stage} checked={checked} setChecked={setChecked} busy={busy}/>
    {nextOptions.length>0&&<Field label={$t('taskDetail.continue')} id={`${stage.key}-next`}><Select value={next||NONE} disabled={busy} onValueChange={v=>{if(v!=null)setNext(v===NONE?'':String(v));}}>
     <SelectTrigger className="w-full" aria-labelledby={`${stage.key}-next`}><SelectValue>{(v:string)=>v===NONE?$t('taskDetail.notContinue'):name(v)}</SelectValue></SelectTrigger>
     <SelectContent className="min-w-(--anchor-width)">{nextOptions.map(id=><SelectItem key={id} value={id}>{name(id)}</SelectItem>)}<SelectItem value={NONE}>{$t('taskDetail.notContinue')}</SelectItem></SelectContent>
    </Select></Field>}
   </>}
  </StageCard>;
 }
 if(stage.kind==='agent'){
  const approved=[...w.results.slice(0,index)].reverse().find(r=>r?.approvedAt&&!r.rejectedAt),source=approved?stages[w.results.indexOf(approved)]:undefined;
  const agent=data.agent,isActive=cur&&active(cur),canRun=Boolean(agent?.options?.some(a=>a.id===agent.agentId&&a.type==='demo'))||Boolean(agent?.repo)||withoutRepo(stage,stages)||w.delivery?.kind==='article';
  const failure=cur?.status==='failed'?failureOf(cur,data):undefined;
  // How often the step failed in a row, and for the same cause (failure-model.ts): after the same cause twice the card
  // says what to fix first and no longer suggests Try again (2026-10-24 user decision).
  const {failures,same}=failure?failureStreak(data.runs.filter(r=>r.stepId===stage.key&&r.planVersion===0).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),failure.group,data):{failures:0,same:0},repeated=same>=2&&Boolean(failure?.fix);
  const retry=cur?.status!=='running'&&cur?.status!=='queued'&&canRun&&<Button variant={failure&&(NO_RETRY.has(failure.group)||repeated)?'outline':'default'} disabled={busy||(!hasTaskAgent(data)&&(agent?.options||[]).length!==1)} onClick={()=>void withUsableAgent(data,update,'retryStage',{stageKey:stage.key})}>{cur?$t('taskDetail.tryAgain'):$t('taskDetail.handOffAgent')}</Button>;
  // Every Agent on the computer meets a shared failure alike, so switching is not offered (2026-10-24 user decision).
  const switchAgent=failure&&failure.group!=='restart'&&!failure.shared&&(agent?.options||[]).length>1&&<Button variant="outline" disabled={busy} onClick={pickAgent}>{$t('taskDetail.switchAgent')}</Button>;
  const actions=!manual?<>
   {repeated&&switchAgent}
   {retry}
   {cur?.status==='failed'&&cur.error==='invalid_agent_result'&&cur.mode==='plan'&&!cur.artifactId&&<Button variant='outline' disabled={busy} title={$t('agentResult.recoverHint')} onClick={()=>void act('recoverResult',{runId:cur.id})}>{$t('agentResult.recover')}</Button>}
   {isActive&&<Button variant="outline" disabled={busy||Boolean(cur.cancelRequested)} onClick={async()=>{if(await confirmAction({title:() => ($t('taskDetail.stopCurrentRun',{0:data.task.title})),description:() => ($t('taskDetail.stoppingNotUndoPushedChanges')),action:'common.stop'}))void update('cancelRun',{runId:cur.id});}}><Square/>{$t('common.stop')}</Button>}
   {!repeated&&switchAgent}
   {failure&&<Button variant="ghost" disabled={busy} onClick={messageAgent}>{$t('taskDetail.messageAgent')}</Button>}
  </>:<><Button disabled={busy||!record.trim()} onClick={()=>void act('recordManual',{content:record})}>{$t('taskDetail.recordContinue')}</Button><Button variant="ghost" onClick={()=>{setManual(false);setRecord('');}}>{$t('common.cancel')}</Button></>;
  const recordLabel=readsOnly(stage)?(stage.mode==='analyze'?$t('taskDetail.analysisResult'):$t('taskDetail.plan')):$t('taskDetail.changeHistory');
  const body=manual||(!isActive&&!manual&&canRun&&!hasTaskAgent(data)&&(agent?.options||[]).length!==1)||(approved&&source)?<>{manual&&<Field label={recordLabel} htmlFor={`${stage.key}-record`}>{readsOnly(stage)
    // A document written by hand is written beside its rendering, as the Agent's documents are edited.
    ?<MarkdownEditor id={`${stage.key}-record`} aria-label={recordLabel} value={record} disabled={busy} placeholder={stage.mode==='analyze'?$t('taskDetail.writeAnalysisResult'):$t('taskDetail.whichFilesSectionsChangeWhat')} onChange={e=>{setRecord(e.target.value);}} preview={value=><Markdown content={value}/>}/>
    :<Textarea id={`${stage.key}-record`} aria-label={recordLabel} rows={4} value={record} disabled={busy} placeholder={$t('taskDetail.prLinkWhichFilesContent')} onChange={e=>{setRecord(e.target.value);}}/>}</Field>}
   {!isActive&&!manual&&canRun&&<NeedsAgent data={data}/>}
   {approved&&source&&<Reveal label={$t('taskDetail.viewApprovedInput',{0:source.name})}><Reading><Markdown content={approved.content}/></Reading></Reveal>}</>:undefined;
  if(!canRun)return <StageCard error title={displayStageName(stage)} sub={<>{$t('taskDetail.noWebsiteSourceRepositoryConnectedMessage')} <Button variant="link" size="sm" className="h-auto font-normal p-0 align-baseline" onClick={()=>navigate('/connections?source=repo')}>{$t('common.goDataSources')}</Button></>} actions={actions}>{body}</StageCard>;
  // Started again by the system after NocoReach restarted (retryAfterRestart on the server): say why it runs again.
  const restarted=cur?.autoRetry?<p className={text.muted}>{$t('taskDetail.restartRetried')}</p>:null;
  // While the Agent translates an approved primary language into the others (2026-10-24), the card says so.
  const translating=w.delivery?.translateFrom&&!w.release?w.delivery.locales?.slice(1)||[]:[];
  const working=translating.length?$t('articleTask.translating',{0:joinNames(translating.map(l=>localeName(l,getCurrentLocale())))}):$t('taskDetail.agentWorking',{0:stage.name});
  if(cur?.status==='queued')return <StageCard label={progress} title={working} sub={agent?.online?$t('taskDetail.handedOffAgentStartingNow'):<>{$t('taskDetail.agentComputerOffline')} <Button variant="link" size="sm" className="h-auto font-normal p-0 align-baseline" onClick={()=>navigate('/agents')}>{$t('common.manageAgents')}</Button></>} actions={actions}>{restarted}{body}</StageCard>;
  if(cur?.status==='running')return <StageCard label={progress} spinning title={<>{working}{cur.cancelRequested?$t('taskDetail.stoppingAside'):''}</>} sub={$t('taskDetail.agentWorkingFor',{0:since(cur.createdAt)})} actions={actions}>{restarted}{body}</StageCard>;
  if(cur?.status==='failed'&&failure){
   const {why,next,fix,group,shared}=failure,streak=repeated?$t('taskDetail.failureRepeated',{0:same}):failures>=2?$t('taskDetail.failureStreak',{0:failures}):'';
   // What the run got before it stopped (TaskService.partialOf), read with the run the page holds in full; a step that
   // only reads can be finished with it by hand.
   const partial=data.execution?.runId===cur.id?data.partial:null,use=partial&&allowed&&readsOnly(stage)?()=>{setRecord(partial.content);setManual(true);}:undefined;
   // One notice (2026-10-23 user request): the reason in a sentence, how often it has happened, what helps; the
   // actions above do what the sentence suggests.
   return <StageCard error title={$t('taskDetail.agentDidNotFinish')} actions={actions}>
    <div className="flex flex-col gap-1">
     <p className={text.body}>{sentences(why,group==='toolLogin'&&agent?.online&&$t('taskDetail.failureOnlineMeans'))}{streak?<span className="text-muted-foreground"> · {streak}</span>:null}</p>
     <p className={text.muted}>{sentences(repeated?$t('taskDetail.failureRepeatedNext',{0:fix}):next,shared&&$t('taskDetail.failureSharedComputer'))}</p>
    </div>
    {partial&&!manual&&<GotSoFar partial={partial} onUse={use}/>}
    {body}{techLink}</StageCard>;
  }
  return <StageCard title={displayStageName(stage)} sub={$t('taskDetail.stepDoneAgent',{0:stage.instruction})} actions={actions}>{body}</StageCard>;
 }
 return <StageCard title={$t('common.confirmPublish')} sub={$t('taskDetail.prReviewApprovedConfirmAfter')}
  actions={<Button disabled={busy||!note.trim()} onClick={()=>void act('confirmPublish',{note,url})}>{$t('common.confirmedPublished')}</Button>}>
  <Field label={$t('taskDetail.publishedPageOptional')} htmlFor={`${stage.key}-url`}><Input id={`${stage.key}-url`} aria-label={$t('taskDetail.publishedPage')} value={url} disabled={busy} onChange={e=>setUrl(e.target.value)}/></Field>
  <Field label={$t('taskDetail.releaseNotes')} htmlFor={`${stage.key}-note`}><Textarea id={`${stage.key}-note`} aria-label={$t('taskDetail.releaseNotes')} rows={3} value={note} disabled={busy} placeholder={$t('taskDetail.whichPrMergedWhenWent')} onChange={e=>setNote(e.target.value)}/></Field>
 </StageCard>;
}
// The empty choice of a Select (Do not continue), which cannot hold "".
const NONE='__none__';
// A cancelled or archived task: what happened, what became of the unpublished change, and Reopen when allowed.
function ClosedCard({w,update,busy}:{w:Work;update:Update;busy:boolean}){
 const pr=w.prClose,prLine=pr?{closing:$t('taskDetail.unpublishedClosing'),closed:$t('taskDetail.unpublishedClosed'),failed:$t('taskDetail.unpublishedCloseFailed')}[pr.state]:'';
 const at=w.cancelledAt||w.archivedAt;
 return <StageCard label={$t('common.status')} title={$t('taskDetail.closedValue',{0:closedWhen(w)})} sub={`${at?$t('taskDetail.closedValueMessage',{0:when(at)}):''}${canReopen(w)?'':$t('taskDetail.taskStoppedHalfwayCannotContinue')}`}
  actions={canReopen(w)?<Button variant="outline" disabled={busy} onClick={()=>void update('unarchiveTask')}><ArchiveRestore/>{$t('common.reopen')}</Button>:undefined}>{prLine&&<p className={text.body}>{prLine}</p>}</StageCard>;
}
// After the task: the effect once a change is live, otherwise the accepted result itself.
function DoneCard({data,update,busy}:{data:Data;update:Update;busy:boolean}){
 const w=data.work,r=w.release,canRevert=Boolean(data.agent?.repo),navigate=useNavigate();
 // The task the accepted document was handed over to, linked with where it stands (2026-10-24 user report: after the
 // hand-over the person could not find the new task or tell whether it had started).
 const next=(data.related||[]).find(x=>x.relation==='next');
 const handed=next?<p className={cn(text.body,'flex flex-wrap items-center gap-x-2 gap-y-1')} data-handed-over="">{$tj('taskDetail.handedOverTo',{0:<button type="button" className="nr-link text-left" onClick={()=>void navigate(`/actions/${next.id}`)}>{next.no?`T-${next.no} `:''}{next.title}</button>})}{next.state&&<TaskStandingTag state={next.state}/>}</p>:null;
 const accepted=[...w.results].reverse().find(x=>x?.approvedAt&&!x.rejectedAt);
 // The version that went live: an article release names its artifact; a merged change is the accepted one.
 const shipped=(r?.article?.artifactId&&w.results.find(x=>x?.id===r.article!.artifactId))||accepted||undefined;
 const done=$t('common.completed');
 if(r?.state==='simulated')return <StageCard label={done} title={$t('taskDetail.simulatedRelease')} sub={$t('taskDetail.simulatedReleaseDescription')}><Field label={$t('taskDetail.releaseNotes')}><p className={cn(text.body,'whitespace-pre-wrap')}>{r.note}</p></Field></StageCard>;
 if(r?.state==='live')return <StageCard label={done} title={$t('taskDetail.live')} sub={$t('taskDetail.liveSince',{0:when(r.liveAt),1:(w.history||[]).some(e=>e.action==='live'&&e.actor==='system')?$t('taskDetail.sawChangeLive'):$t('common.confirmedLive')})}
  actions={r.pr&&r.mergedAt&&canRevert&&(!w.revert||w.revert.state==='failed')?<Button variant="outline" disabled={busy} onClick={async()=>{if(await confirmAction({title:() => ($t('taskDetail.undoChangeConfirm')),description:() => ($t('taskDetail.undoChangeDescription')),action:'taskDetail.revertChange'}))void update('revertRelease');}}><Undo2/>{$t('taskDetail.revertCurrentChange')}</Button>:undefined}>
  {w.revert&&<p className={w.revert.state==='failed'?'text-sm text-destructive':text.body} role={w.revert.state==='failed'?'alert':undefined} data-revert={w.revert.state}>{w.revert.state==='opening'?$t('taskDetail.undoPreparing'):w.revert.state==='opened'?$t('taskDetail.undoPrepared'):$t('taskDetail.undoFailed',{0:w.revert.error||$t('errors.unknownReason')})}</p>}
  <LiveChange data={data} artifact={shipped}/>
  <TargetRows data={data} r={r}/>
  <DriftNotice data={data} r={r}/>
  <EffectList w={w}/>
  <PageLinks pages={r.pages}/>
  {r.note&&!r.article&&<Reveal label={$t('taskDetail.releaseNotes')}><p className={cn(text.body,'whitespace-pre-wrap')}>{r.note}</p></Reveal>}
 </StageCard>;
 const replies=repliesOf(w,accepted?.content);
 if(replies.length)return <StageCard label={done} title={$t('taskDetail.replyDraftsAccepted')} sub={$t('taskDetail.copyReplyPostYourselfNocoreach')}>{handed}<ReplyDrafts items={replies}/></StageCard>;
 return <StageCard label={done} title={done} sub={w.observeFrom?$t('taskDetail.trackingImpactSince',{0:formatDate(w.observeFrom)}):undefined}>
  {handed}
  {w.receipt?.note&&<p className={text.body}>{$tj('taskDetail.published',{0:w.receipt.note})}{w.receipt.url&&<> · <a className="nr-link" href={w.receipt.url} target="_blank" rel="noreferrer">{$t('common.openPage')}</a></>}</p>}
  {w.observeFrom&&<EffectList w={w}/>}
  {accepted&&!accepted.pr&&<><Reading><Markdown content={accepted.content}/></Reading>{accepted.report&&<ReportNotes report={accepted.report}/>}</>}
 </StageCard>;
}
// What one delivered version changes, as its owner reviewed it: a page change's visible changes, or an article's fields
// against the version it was written from. The activity's View and the live card's View changes both show it.
function VersionChange({data,artifact,notes}:{data:Data;artifact:Artifact;notes:boolean}){
 if(artifact.pr)return <PageChange pr={artifact.pr} content={artifact.content}/>;
 if(artifact.article)return <ArticleReview data={data} article={artifact.article} notes={notes?artifact.content:''} settled/>;
 return null;
}
// Once live, the card names what changed in one line; the change itself opens on demand.
function LiveChange({data,artifact}:{data:Data;artifact?:Artifact}){
 const [open,setOpen]=useState(false);
 if(!artifact||(!artifact.pr&&!artifact.article))return null;
 const a=artifact.article,visible=artifact.pr?.visibleChanges||[];
 const paths=a?(a.changes.length?a.changes:a.carried||[]):[];
 const labels=a?paths.map(fieldLabel):[...new Set(visible.map(v=>v.label))],count=a?paths.length:visible.length;
 // A new article went live as a whole: it is named as one, not as fields it "changed" (2026-10-24 user report).
 const created=Boolean(a&&!a.articleId);
 return <div className={cn(text.body,'flex flex-wrap items-center gap-x-2 gap-y-1')}>
  {created?<span>{$t('articleTask.newArticle')}</span>:count>0&&<span>{$t('taskDetail.changedSummary',{0:count,1:joinNames(labels)})}</span>}
  <Button variant='link' size='sm' className='h-auto font-normal p-0' onClick={()=>setOpen(true)}>{created?$t('taskDetail.viewArticle'):$t('taskDetail.viewChanges')}<ChevronRight/></Button>
  <DocReader open={open} onClose={()=>setOpen(false)} title={created?$t('articleTask.article'):$t('taskDetail.whatChanged')} meta={`${$t('taskDetail.versionNumber',{0:artifact.version})}${artifact.approvedAt?` · ${$t('taskDetail.approvedOn',{0:when(artifact.approvedAt)})}`:''}`} content=''><VersionChange data={data} artifact={artifact} notes={false}/></DocReader>
 </div>;
}
// Impact tracking (SPEC §8): day 7 and day 28 against the same number of days before going live.
function EffectList({w}:{w:Work}){
 const items=effectItems(w),pages=effectPages(w),{choosePage}=useContext(TaskActions),{allowed}=useContext(TaskAccess);
 if(!pages.length)return <p className={cn(text.muted,'flex flex-wrap items-center gap-x-2')}>{$t('taskDetail.noRelatedPageNothingCompare')}{allowed&&<Button variant="link" size="sm" className="h-auto p-0 font-normal" onClick={choosePage}>{$t('taskDetail.chooseRelatedPage')}</Button>}</p>;
 return <ul className="flex flex-col gap-2">{items.map(i=>i.result?<EffectRow key={i.day} r={i.result} observeFrom={w.observeFrom}/>:<li key={i.day} className={text.muted}>{$tj('taskDetail.dayResultsAbout',{0:i.day,1:i.expected})}</li>)}</ul>;
}
function EffectRow({r,observeFrom}:{r:EffectResult;observeFrom?:string}){
 const [open,setOpen]=useState(false),range=(x:{start:string;end:string})=>$t('common.range',{0:x.start.slice(5),1:x.end.slice(5)});
 const rows:[string,[number,number],string?][]=[...(r.gsc?[[$t('common.searchClicks'),r.gsc.clicks],[$t('common.searchImpressions'),r.gsc.impressions],[$t('common.ctr'),r.gsc.ctr,'%'],[$t('common.averagePosition'),r.gsc.position]] as [string,[number,number],string?][]:[]),...(r.ga4?[[$t('common.viewCount'),r.ga4.views],[$t('common.keyEvents'),r.ga4.conversions]] as [string,[number,number],string?][]:[])];
 return <li className={cn(text.body,'flex flex-col items-start gap-1')} data-c={r.conclusion}><span>{effectLine(r,observeFrom)}</span><Button variant="link" size="sm" className="h-auto font-normal p-0" onClick={()=>setOpen(v=>!v)}>{open?$t('common.collapse'):$t('taskDetail.seeNumbers')}</Button>
  {open&&<div className="nr-td-effect-detail"><Comparison result={r} observeFrom={observeFrom}/>{(!r.coverage||!matchesObservation(r,observeFrom))&&<Reveal label={$t('results.legacy')}><p>{r.conclusion} · {r.change===null?'—':`${r.change*100}%`}</p><p className="text-muted-foreground">{$tj('taskDetail.beforeGoingLiveAfter',{0:range(r.baseline),1:range(r.after)})}</p><table><tbody>{rows.map(([k,[b,a],u])=><tr key={k}><th>{k}</th><td>{b}{u}</td><td>→</td><td>{a}{u}</td></tr>)}</tbody></table></Reveal>}</div>}</li>;
}
const eventIcons:Record<string,ReactNode>={merged:<GitMerge/>,live:<Globe/>,notSeen:<AlertCircle/>,retryMerge:<RotateCcw/>,markMerged:<GitMerge/>,confirmLive:<Globe/>,waitLonger:<RotateCcw/>,startTask:<CirclePlay/>,runSucceeded:<FileText/>,approveStage:<Check/>,editStageOutput:<Pencil/>,recordManual:<Pencil/>,retryStage:<RotateCcw/>,confirmPublish:<Rocket/>,linkContent:<Link2/>,linkPage:<Link2/>,setAgent:<Bot/>,setOwner:<UserRound/>,setCollaborators:<Users/>,handoff:<ArrowRightLeft/>,moveWork:<Move/>,selectPlaybook:<BookOpen/>,revertRelease:<Undo2/>};
// Run bookkeeping that only matters when something goes wrong; the stage card shows the current failure and
// Technical details keeps every run.
const QUIET=new Set(['runQueued','runFailed','flowWaiting']);
const RECENT=8;
// Release events in the owner's words rather than in pull-request terms.
const getPlainEvents=():Record<string,string>=>({merged:$t('taskDetail.eventPublished'),markMerged:$t('taskDetail.publishedManually'),retryMerge:$t('taskDetail.eventPublishAgain'),prClosed:$t('taskDetail.unpublishedClosed'),revertOpened:$t('taskDetail.undoPrepared')});
// What has happened: people's actions, each version the Agent delivered (open it here) and comments, then one line to
// write to the Agent (2026-10-22 user decision: the activity and the message form one card).
function ActivityCard({data,update,busy,members,membersLoaded}:{data:Data;update:Update;busy:boolean;members:Member[];membersLoaded:boolean}){
 const [message,setMessage,clearMessage]=useTaskDraft('comment',''),w=data.work,stages=w.flow?.stages||[],done=w.stage==='done',closed=Boolean(w.cancelledAt||w.archivedAt);
 const [all,setAll]=useState(false),[view,setView]=useState<Artifact>();
 const executor=getStageExecutor().agent;
 const nameOf=(key?:string)=>stages.find(s=>s.key===key)?.name||$t('taskDetail.step');
 const people=useMemo(()=>new Map(members.map(m=>[m.id,m.name])),[members]);
 const artifacts=new Map([...(data.artifacts||[]),...w.results.filter(Boolean) as Artifact[]].map(a=>[a.id,a]));
 const plain=getPlainEvents();
 const rows=(w.history||[]).map((e,i)=>({e,i,t:QUIET.has(e.action)?null:eventText(e,nameOf,executor)})).filter(x=>x.t).sort((a,b)=>String(a.e.at).localeCompare(String(b.e.at))||a.i-b.i);
 const shown=all?rows:rows.slice(-RECENT),hidden=rows.length-shown.length;
 async function send(){const d=await update('comment',{comment:message});if(d){clearMessage();}}
 const composer=(!done&&!closed)||Boolean(message);
 return <Card className="order-5" aria-label={$t('common.activity')} title={$t('common.activity')}>
  {hidden>0&&<Button variant="link" size="sm" className="h-auto font-normal self-start p-0" onClick={()=>setAll(true)}>{$t('taskDetail.showEarlier',{0:hidden})}</Button>}
  <ol className="flex flex-col gap-3">{shown.map(({e,t,i})=>{const who=t!.who===$t('common.you')?(e.actor&&people.get(e.actor))||$t('common.member'):t!.who;
   // Until the members load, a person's name is a placeholder bar, not "Member" that turns into the name (UI review 2026-10-22).
   const pending=t!.who===$t('common.you')&&Boolean(e.actor)&&!membersLoaded,name=pending?<Skeleton className="inline-block h-3.5 w-16 align-middle"/>:who;
   if(e.action==='comment'||e.action==='requestStageChanges')return <li key={`${e.at}:${e.action}:${e.comment}`} className="flex items-start gap-2">{pending?null:<ActorAvatar type="user" name={who} size="xs"/>}<div className="flex min-w-0 flex-1 flex-col gap-0.5"><p className={cn(text.body,'flex flex-wrap items-center gap-x-2 gap-y-1')}><span data-actor="">{name}</span>{e.action==='requestStageChanges'&&<Tag tone="violet">{$t('taskDetail.requestChanges')}</Tag>}<time className="ml-auto text-muted-foreground">{when(e.at)}</time></p><p className={cn(text.body,'break-words whitespace-pre-wrap')}>{e.comment}</p></div></li>;
   const artifact=e.action==='runSucceeded'&&e.artifactId?artifacts.get(e.artifactId):undefined;
   const line=artifact?$t('taskDetail.deliveredVersion',{0:artifact.version,1:nameOf(artifact.stepId)}):plain[e.action]||t!.text;
   return <li key={`${e.at}:${e.action}:${e.runId||''}:${i}`} className={cn(text.muted,'flex items-start gap-2')}><span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center [&_svg]:size-3.5">{eventIcons[e.action]||<Play/>}</span><p className="min-w-0 flex-1 break-words"><span data-actor="" className="text-foreground">{e.action==='runSucceeded'?executor:name}</span>{getCurrentLocale()==='ru-RU'?' — ':' '}{line}{artifact&&<> <Button variant="link" size="sm" className="h-auto font-normal p-0 align-baseline" onClick={()=>setView(artifact)}>{$t('common.view')}</Button></>}</p><time className="shrink-0">{when(e.at)}</time></li>;})}
   {!rows.length&&<li className={text.muted}>{$t('taskDetail.noActivityYet')}</li>}</ol>
  {view&&<DocReader open onClose={()=>setView(undefined)} title={`${nameOf(view.stepId)} · ${$t('taskDetail.versionNumber',{0:view.version})}`} meta={when(view.createdAt)} content={view.pr||view.article?'':view.content}><VersionChange data={data} artifact={view} notes/></DocReader>}
  {composer&&<div className="flex items-end gap-2"><Textarea id="nr-composer" aria-label={$t('taskDetail.noteExecutor')} rows={1} className="max-h-40 min-h-8 resize-none py-1.5" value={message} disabled={busy} readOnly={done||closed} placeholder={w.flow?$t('taskDetail.leaveNoteNextRunReads',{0:executor}):$t('taskDetail.leaveNoteBeforeStart',{0:executor,1:$t('taskDetail.changeEnglishVersionKeepTechnical')})} onChange={e=>{setMessage(e.target.value);}}/>{!done&&!closed&&<Button variant="outline" disabled={busy||!message.trim()} onClick={()=>void send()}>{$t('taskDetail.send')}</Button>}</div>}
 </Card>;
}
function PageLinkEditor({data,projectId,taskId,busy,update}:{data:Data;projectId:number;taskId:string;busy:boolean;update:Update}){
 const page=data.work.page,[q,setQ]=useState(''),[hits,setHits]=useState<{url:string;title:string;type:string}[]>(),[editing,setEditing]=useState(!page),[focused,setFocused]=useState(false);
 useEffect(()=>{setEditing(!page);},[page?.url]);
 useEffect(()=>{if(!editing)return;const t=setTimeout(()=>{void call<{url:string;title:string;type:string}[]>(projectId,taskId,'pages',{q}).then(r=>setHits(Array.isArray(r)?r:[])).catch(()=>setHits([]));},250);return()=>clearTimeout(t);},[q,editing,projectId,taskId]);
 const path=(u:string)=>{try{return new URL(u).pathname;}catch{return u;}};
 return <div className="flex flex-col gap-2 text-sm">
  {page&&!editing?<div className="nr-td-page"><a className="nr-link" href={page.url} target="_blank" rel="noreferrer">{page.title||path(page.url)}<ExternalLink aria-hidden="true"/></a><small>{path(page.url)}</small>
   <div className="nr-td-row-actions"><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setEditing(true)}>{$t('taskDetail.change')}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void update('linkPage',{url:''})}>{$t('common.remove')}</Button></div></div>
  :<><label className="nr-td-search"><Search aria-hidden="true"/><input aria-label={$t('common.searchPages')} value={q} placeholder={$t('taskDetail.searchPagesWebsiteContent')} onFocus={()=>setFocused(true)} onChange={e=>setQ(e.target.value)}/></label>
   {hits&&(focused||q)&&(hits.length?<ul className="nr-td-hits">{hits.slice(0,6).map(h=><li key={h.url}><button type="button" disabled={busy} onClick={()=>void update('linkPage',{url:h.url}).then(d=>{if(d){setQ('');setEditing(false);}})}><b>{h.title||path(h.url)}</b><small>{path(h.url)}</small></button></li>)}</ul>:<p className="nr-td-muted">{q?$t('taskDetail.noMatchingPages'):$t('taskDetail.websiteContentNoPagesYet')}</p>)}
   {page&&<Button size="sm" variant="ghost" className="self-start" onClick={()=>setEditing(false)}>{$t('common.cancel')}</Button>}</>}
  {!page&&data.work.contentId&&<p className="nr-td-muted">{$t('taskDetail.linkedOldContentMappingPicking')}</p>}
 </div>;
}
