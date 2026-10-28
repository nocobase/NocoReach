import {useMe} from './me';
import {isWaitingTask} from './task-waiting';
import {onBoard} from './board-done';
import { renderMessage, type Message, useMessageState, $t, $legacyText } from "#i18n";
import {useEffect,useRef,useState} from 'react';
import {Outlet,useLocation,useNavigate} from 'react-router';
import {useUrlSearch} from '#hooks/use-url-search';
import {BotIcon,KanbanIcon,ListIcon,SearchIcon} from 'lucide-react';
import {Segmented} from '#components/reach/segmented';
import {ListSkeleton} from '#components/reach/states';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {cn} from '#lib/utils';
import {refreshNavBadges} from '#components/app-shell/nav-badges';
import {PageContainer,PageHeader} from '#components/reach/page';
import {Button} from '#components/ui/button';
import {taskRecords,useProject} from './reach-data';
import {workState,isClosed,isSnoozed,closeCommand,getCloseConfirm,type BoardState,type Work,type TaskData} from './task-execution-types';
import {legacyPlaybookFilterLabel,matchesPlaybookFilter,playbookFilterOptions,playbookFilterValue} from './task-playbook-filter';
import {WorkBoard,TaskTable,type TaskAction} from './work-board';
import {AgentBoard,RuntimeNotice} from './agent-board';
import {taskAgentOf,UNASSIGNED,type AgentStatus} from './task-agents';
import {confirmAction} from '#components/reach/confirm';
import {Empty,EmptyHeader,EmptyTitle,EmptyDescription,EmptyContent} from '#components/ui/empty';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '#components/ui/select';
type Task={id:number;title:string;brief:string;status:string;updatedAt:string;evidence?:{work?:Work;keyword?:string;no?:number;insight?:{id?:string;no?:number};createdBy?:{id?:string;name?:string}}};
// The owner's name: the one set on the task, or whoever created it before anything happened on it (2026-10-08).
const ownerName=(t:Task)=>t.evidence?.work?.humanOwnerName||t.evidence?.createdBy?.name||'';
// The last view picked (List, Board or By Agent) is kept in this browser and used when the address does not say (2026-10-08 user request).
const VIEW_KEY='nr-tasks-view';
const savedView=()=>{try{const v=localStorage.getItem(VIEW_KEY);return v==='board'||v==='agent'?v:'';}catch{return '';}};
const saveView=(v:string)=>{try{localStorage.setItem(VIEW_KEY,v||'list');}catch{/* private mode: this page only */}};
// The toolbar's drop-downs use the application's Select (UI review 2026-10-22). "" (any) travels as ANY because a Select
// item cannot have an empty value; data-value carries the chosen value for tests and tools.
const ANY='__any__';
function FilterSelect({label,value,options,onChange}:{label:string;value:string;options:[string,string][];onChange:(value:string)=>void}){
 const names=new Map(options);
 // Base UI reports null when the chosen item leaves the list (an old link's playbook option, gone once another is
 // picked); that is not a choice.
 return <Select value={value||ANY} onValueChange={v=>{if(v==null)return;onChange(v===ANY?'':String(v));}}>
  <SelectTrigger className="w-auto min-w-28" aria-label={label} data-value={value}><SelectValue>{(v:string)=>names.get(v===ANY?'':v)??v}</SelectValue></SelectTrigger>
  <SelectContent className="w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal">{options.map(([k,v])=><SelectItem key={k||ANY} value={k||ANY}>{v}</SelectItem>)}</SelectContent>
 </Select>;
}
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
 const playbook=params.get(legacyPlaybook?'playbook':'playbookName')||'',owner=params.get('owner')||'';
 // Snoozed (2026-10-28): its own list, out of Needs you and Current, shown as a table like Done and Closed.
 const done=!closed&&params.get('scope')==='done',snoozed=!closed&&params.get('scope')==='snoozed',view=params.get('view')??savedView(),board=view==='board'&&!closed&&!done&&!snoozed,byAgent=view==='agent'&&!closed&&!done&&!snoozed,agentFilter=params.get('agent')||'';
 // The project's Agents, to name each task's Agent and lay out By Agent; without them cards show the name saved on the task.
 const [agents,setAgents]=useState<AgentStatus>();
 const playbookOptions=playbookFilterOptions(tasks.map(t=>t.evidence?.work));
 async function load(){if(!project)return;const seq=++generation.current;setLoading(true);try{const rows=await taskRecords<Task>(project.id);if(seq===generation.current){setTasks(rows);setError('');}}catch{if(seq===generation.current)setError(() => ($t('optimizationWork.notLoadTasksTryAgain')));}finally{if(seq===generation.current)setLoading(false);}}
 useEffect(()=>{void load();return()=>{generation.current++;};},[project?.id]);
 useEffect(()=>{if(!project)return;const c=new AbortController();void Promise.resolve().then(()=>api.action<AgentStatus>('nrAgent','status',{method:'POST',body:{projectId:String(project.id)},signal:c.signal})).then(a=>{if(!c.signal.aborted)setAgents(a);},()=>undefined);return()=>c.abort();},[project?.id]);
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
 const isAside=(t:Task)=>isSnoozed(t.evidence?.work);
 const closedCount=tasks.filter(t=>isClosed(t.evidence?.work)).length,doneCount=tasks.filter(isDone).length,snoozedCount=tasks.filter(isAside).length;
 // 当前 is what is still under way (the board also shows its 已完成 column); 已完成 and 已关闭 are their own lists.
 const waitingCount=tasks.filter(t=>isWaitingTask(t,mine)).length;
 // The board's Done column keeps what is still watched and what finished in the last week (board-done.ts); the rest is
 // in the Done list, which its last line opens.
 const onBoardNow=(t:Task)=>!isDone(t)||onBoard(t.evidence?.work,t.updatedAt);
 const inScope=(t:Task)=>waiting?isWaitingTask(t,mine):closed?isClosed(t.evidence?.work):done?isDone(t):snoozed?isAside(t):!isClosed(t.evidence?.work)&&!isAside(t)&&(board?onBoardNow(t):!isDone(t));
 const matches=(t:Task)=>{const w=t.evidence?.work;return matchesPlaybookFilter(w,playbook,legacyPlaybook)&&(waiting||!owner||ownerName(t)===owner)&&(!agentFilter||!agents||(taskAgentOf(w,agents)?.id||UNASSIGNED)===agentFilter)&&`${t.evidence?.no?`t-${t.evidence.no}`:''} ${t.evidence?.insight?.no?`o-${t.evidence.insight.no}`:''} ${t.title} ${t.brief} ${t.evidence?.keyword||''} ${w?.snooze?.reason||''}`.toLowerCase().includes(q.trim().toLowerCase());};
 const visible=ordered.filter(t=>inScope(t)&&matches(t));
 const olderDone=board&&!waiting?ordered.filter(t=>isDone(t)&&!onBoardNow(t)&&matches(t)).length:0;
 // The table lists what needs you first: 待确认, 进行中, 待处理, 已完成; the board keeps its manual order.
 const rank:Record<BoardState,number>={review:0,doing:1,todo:2,done:3};
 // Snoozed: the one coming back soonest first.
 const rows=board||byAgent||closed?visible:snoozed?[...visible].sort((a,b)=>String(a.evidence?.work?.snooze?.until).localeCompare(String(b.evidence?.work?.snooze?.until))):[...visible].sort((a,b)=>rank[workState(a.evidence?.work,a.status)]-rank[workState(b.evidence?.work,b.status)]||String(b.updatedAt).localeCompare(String(a.updatedAt)));
 const uniq=(xs:string[])=>[...new Set(xs.filter(Boolean))].sort();
 const location=useLocation();
 const newTask=()=>navigate({pathname:'/actions/new',search:location.search});
 return <PageContainer className="nr-page"><PageHeader title={$t('common.tasks')} description={$t('optimizationWork.workAgentOnlineAiPlaybook')} actions={tasks.length||loading?<Button onClick={()=>void newTask()}>{$t('manualTask.newTask')}</Button>:undefined}/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}<Button disabled={busy} variant="outline" size="sm" onClick={()=>void load()}>{$t('common.reload')}</Button></p>}{notice&&<p role="status" className="nr-success">{renderMessage(notice.text)}{notice.undo&&<button type="button" disabled={busy} className="ml-auto underline-offset-4 hover:underline" onClick={()=>void undo(notice.undo!)}>{$t('optimizationWork.undo')}</button>}</p>}
  <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={$t('common.filter')}>
   {/* The scopes filter this one list, so they are the toolbar's pick-one control, not tabs (2026-10-22 decision D1:
       line tabs only switch a page's sections; a table's filters are a segmented control in its toolbar). */}
   <Segmented label={$t('optimizationWork.scope')} options={([['waiting',$t('optimizationWork.waitingForMe'),waitingCount],['',$t('optimizationWork.current'),tasks.length-closedCount-doneCount-snoozedCount],['snoozed',$t('common.snoozed'),snoozedCount],['done',$t('common.completed'),doneCount],['closed',$t('common.closed'),closedCount]] as const).map(([c,label,n])=>({id:c,label:<>{label} <span>{loading?'':n}</span></>,title:label}))} value={waiting?'waiting':closed?'closed':done?'done':snoozed?'snoozed':''} onChange={c=>param('scope',c)}/>
   <label className="relative flex min-w-48 flex-1 items-center sm:max-w-72"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label={$t('optimizationWork.searchTasks')} {...inputProps} placeholder={$t('optimizationWork.searchTitleNumber')} className="w-full pl-8!"/></label>
   {/* One set of status choices: the scopes above (UI review 2026-10-22). The board's columns and the list's order
       already separate the statuses, so there is no separate status filter; an old ?status= link is ignored. */}
   <FilterSelect label={$t('optimizationWork.filterPlaybook')} value={playbookFilterValue(playbook,legacyPlaybook)} options={[['',$t('optimizationWork.playbooks')],...(legacyPlaybook&&playbook?[[playbookFilterValue(playbook,true),legacyPlaybookFilterLabel(playbookOptions,playbook)] as [string,string]]:[]),...playbookOptions.map(o=>[o.value,o.label] as [string,string])]} onChange={v=>param('playbookName',playbookOptions.find(o=>o.value===v)?.name||'')}/>
   {!waiting&&<FilterSelect label={$t('optimizationWork.filterOwner')} value={owner} options={[['',$t('optimizationWork.owner')],...uniq(tasks.map(ownerName)).map(n=>[n,n] as [string,string])]} onChange={v=>param('owner',v)}/>}
   {agents?.options?.length?<FilterSelect label={$t('optimizationWork.filterAgent')} value={agentFilter} options={[['',$t('optimizationWork.anyAgent')],...agents.options.map(a=>[a.id,a.name] as [string,string]),[UNASSIGNED,$t('taskAgents.unassigned')]]} onChange={v=>param('agent',v)}/>:null}
   <div className="ml-auto inline-flex overflow-hidden rounded-md border" role="group" aria-label={$t('optimizationWork.view')}>{([['',$t('optimizationWork.list'),ListIcon],['board',$t('optimizationWork.board'),KanbanIcon],['agent',$t('optimizationWork.byAgent'),BotIcon]] as const).map(([k,label,Icon])=>{const off=(closed||done||snoozed)&&k!=='',on=k===(board?'board':byAgent?'agent':'');return <button key={label} type="button" aria-label={label} title={off?$t('optimizationWork.finishedClosedTasksShownList'):label} disabled={off} aria-pressed={on} onClick={()=>{saveView(k);param('view',k);}} className={cn('inline-flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40',on&&'bg-muted text-foreground')}><Icon className="size-4"/></button>;})}</div>
  </div>
  {!closed&&!done&&!snoozed&&tasks.length>0&&<RuntimeNotice/>}
  {waiting&&<p role='status' className='text-sm text-muted-foreground'>{$t(isAdmin?'optimizationWork.waitingAdminScope':'optimizationWork.waitingMemberScope')}</p>}
  {loading?<ListSkeleton rows={6} label={$t('common.loadingTasks')}/>:byAgent?<AgentBoard tasks={rows} agents={agents} onOpen={id=>navigate('/actions/'+id)}/>:board?<WorkBoard tasks={rows} busy={busy} list={false} agents={agents} olderDone={olderDone} onOlderDone={()=>param('scope','done')} onMove={(t,s,before)=>void move(t as Task,s,before)} onOpen={id=>navigate('/actions/'+id)} onAction={(t,c)=>void act(t as Task,c)}/>
   :rows.length?<TaskTable tasks={rows} closed={closed} snoozed={snoozed} agents={agents} onOpen={id=>navigate('/actions/'+id)} onAction={(t,c)=>void act(t as Task,c)}/>:null}
  {!loading&&!tasks.length?<Empty className="min-h-48 border"><EmptyHeader><EmptyTitle>{$t('manualTask.emptyTitle')}</EmptyTitle><EmptyDescription>{$t('manualTask.createHint')}</EmptyDescription></EmptyHeader><EmptyContent><Button onClick={()=>void newTask()}>{$t('manualTask.newTask')}</Button></EmptyContent></Empty>:!loading&&!rows.length&&!board&&!byAgent&&<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{closed?$t('optimizationWork.noClosedTasks'):done?$t('optimizationWork.noFinishedTasksYet'):snoozed&&!q&&!playbook&&!owner&&!agentFilter?$t('optimizationWork.noSnoozedTasks'):q||playbook||(!waiting&&owner)||agentFilter?$t('optimizationWork.noMatchingTasksTryAdjusting'):waiting?$t('optimizationWork.noWaitingTasks'):$t('optimizationWork.noTasksYetTasksCreated')}</p>}
  <Outlet/>
 </PageContainer>;
}
