import {useMe} from './me';
import {isWaitingTask} from './task-waiting';
import { renderMessage, type Message, useMessageState, $t, $legacyText } from "#i18n";
import {useEffect,useRef,useState} from 'react';
import {Outlet,useLocation,useNavigate} from 'react-router';
import {useUrlSearch} from '#hooks/use-url-search';
import {ArchiveIcon,CircleCheckIcon,CircleDotIcon,KanbanIcon,ListIcon,SearchIcon} from 'lucide-react';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {cn} from '#lib/utils';
import {refreshNavBadges} from '#components/app-shell/nav-badges';
import {PageContainer,PageHeader} from '#components/reach/page';
import {Button} from '#components/ui/button';
import {taskRecords,useProject} from './reach-data';
import {getWorkColumns,workState,isClosed,closeCommand,getCloseConfirm,type BoardState,type Work,type TaskData} from './task-execution-types';
import {executorOf,getExecutorNames} from './task-list-model';
import {legacyPlaybookFilterLabel,matchesPlaybookFilter,playbookFilterOptions,playbookFilterValue} from './task-playbook-filter';
import {WorkBoard,TaskTable,type TaskAction} from './work-board';
import {confirmAction} from '#components/reach/confirm';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription,EmptyContent} from '#components/ui/empty';
type Task={id:number;title:string;brief:string;status:string;updatedAt:string;evidence?:{work?:Work;keyword?:string;no?:number;insight?:{id?:string;no?:number};createdBy?:{id?:string;name?:string}}};
// The owner's name: the one set on the task, or whoever created it before anything happened on it (2026-10-08).
const ownerName=(t:Task)=>t.evidence?.work?.humanOwnerName||t.evidence?.createdBy?.name||'';
// The last view picked (列表 or 看板) is kept in this browser and used when the address does not say (2026-10-08 user request).
const VIEW_KEY='nr-tasks-view';
const savedView=()=>{try{return localStorage.getItem(VIEW_KEY)==='board'?'board':'';}catch{return '';}};
const saveView=(v:string)=>{try{localStorage.setItem(VIEW_KEY,v||'list');}catch{/* private mode: this page only */}};
const getStatusOptions = (): [string,string][] => ([['',$t('optimizationWork.statuses')],...(Object.entries(getWorkColumns()) as [string,string][])]);
// 任务 (SPEC §5, as NocoProject's issue list): a table by default, a board one click away; filters in one row. Finished
// and closed tasks are one click away too (当前 | 已完成 | 已关闭, 2026-10-08 user request) and shown as a table; the board
// keeps its 已完成 column.
export default function OptimizationWork(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();
 const {searchParams:params,search:q,inputProps,updateParams}=useUrlSearch();
 const [tasks,setTasks]=useState<Task[]>([]),[loading,setLoading]=useState(true),[error,setError]=useMessageState(''),[notice,setNotice]=useState<{text:Message;undo?:Task}>(),[busy,setBusy]=useState(false);
 const pending=useRef(false),generation=useRef(0),moveRequest=useRef({key:'',id:''});
 const legacyClosed=params.get('scope')==='archived'||params.get('status')==='closed',closed=params.get('scope')==='closed'||legacyClosed;
 const {mine,isAdmin}=useMe(),waiting=params.get('scope')==='waiting';
 const legacyPlaybook=!params.has('playbookName');
 const status=legacyClosed?'':params.get('status')||'',playbook=params.get(legacyPlaybook?'playbook':'playbookName')||'',owner=params.get('owner')||'',executor=params.get('executor')||'';
 const done=!closed&&params.get('scope')==='done',board=(params.get('view')??savedView())==='board'&&!closed&&!done;
 const playbookOptions=playbookFilterOptions(tasks.map(t=>t.evidence?.work));
 async function load(){if(!project)return;const seq=++generation.current;setLoading(true);try{const rows=await taskRecords<Task>(project.id);if(seq===generation.current){setTasks(rows);setError('');}}catch{if(seq===generation.current)setError(() => ($t('optimizationWork.notLoadTasksTryAgain')));}finally{if(seq===generation.current)setLoading(false);}}
 useEffect(()=>{void load();return()=>{generation.current++;};},[project?.id]);
 useEffect(()=>{const task=params.get('task');if(task)navigate('/actions/'+encodeURIComponent(task),{replace:true});},[params.get('task')]);
 function param(key:string,value:string){updateParams(p=>{if(p.get('status')==='closed')p.delete('status');if(p.get('scope')==='archived')p.set('scope','closed');if(key==='playbookName')p.delete('playbook');if(key==='scope'&&value==='waiting'){p.delete('status');p.delete('owner');}value?p.set(key,value):p.delete(key);},key==='q');}
 function saved(t:Task,d:TaskData){setTasks(rows=>rows.map(row=>row.id===t.id?{...row,...d.task,evidence:{...row.evidence,work:d.work}}:row));refreshNavBadges();}
 async function move(t:Task,target:BoardState,beforeId?:number){
  if(!project||pending.current||beforeId===t.id)return;
  if(target==='done'&&workState(t.evidence?.work,t.status)!=='done'&&!(await confirmAction({title:() => ($t('optimizationWork.confirmWorkDone')),description:() => ($t('optimizationWork.nothingPublishedCannotCompletedWithout')),action:'optimizationWork.markDone',destructive:false})))return;
  pending.current=true;setBusy(true);setError('');setNotice(undefined);
  const body={projectId:String(project.id),taskId:String(t.id),revision:t.evidence?.work?.revision||0,command:'moveWork',state:target,beforeId:beforeId?String(beforeId):undefined,confirm:target==='done'};
  const key=JSON.stringify(body);if(moveRequest.current.key!==key)moveRequest.current={key,id:crypto.randomUUID()};
  try{saved(t,await api.action<TaskData>('nrTaskWork','advance',{method:'POST',body:{...body,requestId:moveRequest.current.id},unwrap:'data'}));}
  catch(e){setError(() => ($t('optimizationWork.cardStaysPlaceIfThere',{0:e instanceof Error?$legacyText(e.message):$t('optimizationWork.positionNotSaved')})));}
  finally{pending.current=false;setBusy(false);}
 }
 // 关闭任务 / 重新打开 (SPEC §6.2): closing a task under way asks first (the executor stops, an open PR is closed);
 // anything else is put away at once with an undo.
 async function command(t:Task,cmd:'cancelTask'|'archiveTask'|'unarchiveTask'){
  if(!project||pending.current)return false;pending.current=true;setBusy(true);setError('');
  try{saved(t,await api.action<TaskData>('nrTaskWork','advance',{method:'POST',body:{projectId:String(project.id),taskId:String(t.id),revision:t.evidence?.work?.revision||0,requestId:crypto.randomUUID(),command:cmd},unwrap:'data'}));return true;}
  catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.operationFailed')));return false;}finally{pending.current=false;setBusy(false);}
 }
 async function act(t:Task,action:TaskAction){
  if(action==='reopen'){if(await command(t,'unarchiveTask'))setNotice({text:() => $t('optimizationWork.reopened',{0:t.title})});return;}
  const cmd=closeCommand(t.evidence?.work);if(!cmd)return;
  if(cmd==='cancelTask'&&!(await confirmAction({title:() => ($t('common.closeTaskValueConfirmation',{0:t.title})),description:() => (getCloseConfirm()),action:'common.closeTask'})))return;
  if(await command(t,cmd))setNotice(cmd==='archiveTask'?{text:() => $t('optimizationWork.closed',{0:t.title}),undo:t}:{text:() => $t('optimizationWork.closedStopped',{0:t.title})});
 }
 async function undo(t:Task){const fresh=tasks.find(x=>x.id===t.id)||t;if(await command(fresh,'unarchiveTask'))setNotice({text:() => $t('optimizationWork.closeUndone',{0:t.title})});}
 const ordered=[...tasks].sort((a,b)=>(a.evidence?.work?.sortOrder??a.id*1024)-(b.evidence?.work?.sortOrder??b.id*1024)||a.id-b.id);
 const isDone=(t:Task)=>!isClosed(t.evidence?.work)&&workState(t.evidence?.work,t.status)==='done';
 const closedCount=tasks.filter(t=>isClosed(t.evidence?.work)).length,doneCount=tasks.filter(isDone).length;
 // 当前 is what is still under way (the board also shows its 已完成 column); 已完成 and 已关闭 are their own lists.
 const waitingCount=tasks.filter(t=>isWaitingTask(t,mine)).length;
 const inScope=(t:Task)=>waiting?isWaitingTask(t,mine):closed?isClosed(t.evidence?.work):done?isDone(t):!isClosed(t.evidence?.work)&&(board||!isDone(t));
 const visible=ordered.filter(t=>{const w=t.evidence?.work;return inScope(t)&&(!status||waiting||closed||done||workState(w,t.status)===status)&&matchesPlaybookFilter(w,playbook,legacyPlaybook)&&(waiting||!owner||ownerName(t)===owner)&&(!executor||executorOf(w)===executor)&&`${t.evidence?.no?`t-${t.evidence.no}`:''} ${t.evidence?.insight?.no?`o-${t.evidence.insight.no}`:''} ${t.title} ${t.brief} ${t.evidence?.keyword||''}`.toLowerCase().includes(q.trim().toLowerCase());});
 // The table lists what needs you first: 待确认, 进行中, 待处理, 已完成; the board keeps its manual order.
 const rank:Record<BoardState,number>={review:0,doing:1,todo:2,done:3};
 const rows=board||closed?visible:[...visible].sort((a,b)=>rank[workState(a.evidence?.work,a.status)]-rank[workState(b.evidence?.work,b.status)]||String(b.updatedAt).localeCompare(String(a.updatedAt)));
 const uniq=(xs:string[])=>[...new Set(xs.filter(Boolean))].sort();
 const select='min-w-28';
 const location=useLocation();
 const newTask=()=>navigate({pathname:'/actions/new',search:location.search});
 return <PageContainer className="nr-page"><PageHeader title={$t('common.tasks')} description={$t('optimizationWork.workAgentOnlineAiPlaybook')} actions={tasks.length||loading?<Button onClick={()=>void newTask()}>{$t('manualTask.newTask')}</Button>:undefined}/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}<Button disabled={busy} variant="outline" size="sm" onClick={()=>void load()}>{$t('common.reload')}</Button></p>}{notice&&<p role="status" className="nr-success">{renderMessage(notice.text)}{notice.undo&&<button type="button" disabled={busy} className="ml-auto underline-offset-4 hover:underline" onClick={()=>void undo(notice.undo!)}>{$t('optimizationWork.undo')}</button>}</p>}
  <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={$t('common.filter')}>
   <div className="inline-flex flex-wrap overflow-hidden rounded-md border" role="group" aria-label={$t('optimizationWork.scope')}>{([['waiting',$t('optimizationWork.waitingForMe'),CircleDotIcon,waitingCount],['',$t('optimizationWork.current'),CircleDotIcon,tasks.length-closedCount-doneCount],['done',$t('common.completed'),CircleCheckIcon,doneCount],['closed',$t('common.closed'),ArchiveIcon,closedCount]] as const).map(([c,label,Icon,n])=>{const on=c===(waiting?'waiting':closed?'closed':done?'done':'');return <button key={label} type="button" aria-pressed={on} onClick={()=>param('scope',c)} className={cn('inline-flex h-8 items-center gap-1.5 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground',on&&'bg-muted font-medium text-foreground')}><Icon className="size-3.5"/>{label} <span className="tabular-nums">{loading?'':n}</span></button>;})}</div>
   <label className="relative flex min-w-48 flex-1 items-center sm:max-w-72"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label={$t('optimizationWork.searchTasks')} {...inputProps} placeholder={$t('optimizationWork.searchTitleNumber')} className="w-full pl-8!"/></label>
   {!waiting&&!closed&&!done&&<select aria-label={$t('optimizationWork.filterStatus')} value={status} onChange={e=>param('status',e.target.value)} className={select}>{getStatusOptions().filter(([k])=>board||k!=='done').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>}
   <select aria-label={$t('optimizationWork.filterPlaybook')} value={playbookFilterValue(playbook,legacyPlaybook)} onChange={e=>param('playbookName',playbookOptions.find(o=>o.value===e.target.value)?.name||'')} className={select}><option value="">{$t('optimizationWork.playbooks')}</option>{legacyPlaybook&&playbook&&<option value={playbookFilterValue(playbook,true)}>{legacyPlaybookFilterLabel(playbookOptions,playbook)}</option>}{playbookOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
   {!waiting&&<select aria-label={$t('optimizationWork.filterOwner')} value={owner} onChange={e=>param('owner',e.target.value)} className={select}><option value="">{$t('optimizationWork.owner')}</option>{uniq(tasks.map(ownerName)).map(n=><option key={n} value={n}>{n}</option>)}</select>}
   <select aria-label={$t('optimizationWork.filterExecutor')} value={executor} onChange={e=>param('executor',e.target.value)} className={select}><option value="">{$t('optimizationWork.executor')}</option>{(['agent','ai'] as const).map(k=><option key={k} value={k}>{getExecutorNames()[k]}</option>)}</select>
   <div className="ml-auto inline-flex overflow-hidden rounded-md border" role="group" aria-label={$t('optimizationWork.view')}>{([['',$t('optimizationWork.list'),ListIcon],['board',$t('optimizationWork.board'),KanbanIcon]] as const).map(([k,label,Icon])=>{const off=(closed||done)&&k==='board';return <button key={label} type="button" aria-label={label} title={off?$t('optimizationWork.finishedClosedTasksShownList'):label} disabled={off} aria-pressed={(k==='board')===board} onClick={()=>{saveView(k);param('view',k);}} className={cn('inline-flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40',(k==='board')===board&&'bg-muted text-foreground')}><Icon className="size-4"/></button>;})}</div>
  </div>
  {waiting&&<p role='status' className='text-sm text-muted-foreground'>{$t(isAdmin?'optimizationWork.waitingAdminScope':'optimizationWork.waitingMemberScope')}</p>}
  {loading?<p role="status" className="text-sm text-muted-foreground">{$t('common.loadingTasks')}</p>:board?<WorkBoard tasks={rows} busy={busy} list={false} onMove={(t,s,before)=>void move(t as Task,s,before)} onOpen={id=>navigate('/actions/'+id)} onAction={(t,c)=>void act(t as Task,c)}/>
   :rows.length?<TaskTable tasks={rows} closed={closed} onOpen={id=>navigate('/actions/'+id)} onAction={(t,c)=>void act(t as Task,c)}/>:null}
  {!loading&&!tasks.length?<Empty className="min-h-48 border"><EmptyHeader><EmptyTitle>{$t('manualTask.emptyTitle')}</EmptyTitle><EmptyDescription>{$t('manualTask.createHint')}</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={()=>void newTask()}>{$t('manualTask.newTask')}</Button></EmptyContent></Empty>:!loading&&!rows.length&&!board&&<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{closed?$t('optimizationWork.noClosedTasks'):done?$t('optimizationWork.noFinishedTasksYet'):q||(!waiting&&status)||playbook||(!waiting&&owner)||executor?$t('optimizationWork.noMatchingTasksTryAdjusting'):waiting?$t('optimizationWork.noWaitingTasks'):$t('optimizationWork.noTasksYetTasksCreated')}</p>}
  <Outlet/>
 </PageContainer>;
}
