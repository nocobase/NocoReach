import { renderMessage, type Message, useMessageState, $t } from "#i18n";
import {useEffect,useRef,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
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
type Task={id:number;title:string;brief:string;status:string;updatedAt:string;evidence?:{work?:Work;keyword?:string;no?:number;insight?:{id?:string;no?:number};createdBy?:{id?:string;name?:string}}};
// The owner's name: the one set on the task, or whoever created it before anything happened on it (2026-10-08).
const ownerName=(t:Task)=>t.evidence?.work?.humanOwnerName||t.evidence?.createdBy?.name||'';
// The last view picked (列表 or 看板) is kept in this browser and used when the address does not say (2026-10-08 user request).
const VIEW_KEY='nr-tasks-view';
const savedView=()=>{try{return localStorage.getItem(VIEW_KEY)==='board'?'board':'';}catch{return '';}};
const saveView=(v:string)=>{try{localStorage.setItem(VIEW_KEY,v||'list');}catch{/* private mode: this page only */}};
const getStatusOptions = (): [string,string][] => ([['',$t("全部状态")],...(Object.entries(getWorkColumns()) as [string,string][])]);
// 任务 (SPEC §5, as NocoProject's issue list): a table by default, a board one click away; filters in one row. Finished
// and closed tasks are one click away too (当前 | 已完成 | 已关闭, 2026-10-08 user request) and shown as a table; the board
// keeps its 已完成 column.
export default function OptimizationWork(){
 const {project,error:projectError}=useProject(),navigate=useNavigate(),[params,setParams]=useSearchParams();
 // Router transitions can leave event handlers on the previous URL. Compose rapid
 // changes from the last write, and adopt the router's parameters on back/forward.
 const paramsRef=useRef(params);
 useEffect(()=>{paramsRef.current=params;},[params]);
 const [tasks,setTasks]=useState<Task[]>([]),[loading,setLoading]=useState(true),[error,setError]=useMessageState(''),[notice,setNotice]=useState<{text:Message;undo?:Task}>(),[busy,setBusy]=useState(false);
 const pending=useRef(false),generation=useRef(0),moveRequest=useRef({key:'',id:''});
 const legacyClosed=params.get('scope')==='archived'||params.get('status')==='closed',closed=params.get('scope')==='closed'||legacyClosed;
 const legacyPlaybook=!params.has('playbookName');
 const q=params.get('q')||'',status=legacyClosed?'':params.get('status')||'',playbook=params.get(legacyPlaybook?'playbook':'playbookName')||'',owner=params.get('owner')||'',executor=params.get('executor')||'';
 const done=!closed&&params.get('scope')==='done',board=(params.get('view')??savedView())==='board'&&!closed&&!done;
 const playbookOptions=playbookFilterOptions(tasks.map(t=>t.evidence?.work));
 async function load(){if(!project)return;const seq=++generation.current;setLoading(true);try{const rows=await taskRecords<Task>(project.id);if(seq===generation.current){setTasks(rows);setError('');}}catch{if(seq===generation.current)setError(() => ($t("读取任务失败，请重试。")));}finally{if(seq===generation.current)setLoading(false);}}
 useEffect(()=>{void load();return()=>{generation.current++;};},[project?.id]);
 useEffect(()=>{const task=params.get('task');if(task)navigate('/actions/'+encodeURIComponent(task),{replace:true});},[params.get('task')]);
 function param(key:string,value:string){const p=new URLSearchParams(paramsRef.current);if(p.get('status')==='closed')p.delete('status');if(p.get('scope')==='archived')p.set('scope','closed');if(key==='playbookName')p.delete('playbook');value?p.set(key,value):p.delete(key);paramsRef.current=p;setParams(p,{replace:key==='q'});}
 function saved(t:Task,d:TaskData){setTasks(rows=>rows.map(row=>row.id===t.id?{...row,...d.task,evidence:{...row.evidence,work:d.work}}:row));refreshNavBadges();}
 async function move(t:Task,target:BoardState,beforeId?:number){
  if(!project||pending.current||beforeId===t.id)return;
  if(target==='done'&&workState(t.evidence?.work,t.status)!=='done'&&!(await confirmAction({title:() => ($t("确认这项工作已完成？")),description:() => ($t("不会发布内容；没有审核过的成果或实际执行记录时无法完成。")),action:'标为完成',destructive:false})))return;
  pending.current=true;setBusy(true);setError('');setNotice(undefined);
  const body={projectId:String(project.id),taskId:String(t.id),revision:t.evidence?.work?.revision||0,command:'moveWork',state:target,beforeId:beforeId?String(beforeId):undefined,confirm:target==='done'};
  const key=JSON.stringify(body);if(moveRequest.current.key!==key)moveRequest.current={key,id:crypto.randomUUID()};
  try{saved(t,await api.action<TaskData>('nrTaskWork','advance',{method:'POST',body:{...body,requestId:moveRequest.current.id},unwrap:'data'}));}
  catch(e){setError(() => ($t("{0}。卡片保留原位，若提示版本冲突请重新加载。",{0:e instanceof Error?$t(e.message):$t("位置未能保存")})));}
  finally{pending.current=false;setBusy(false);}
 }
 // 关闭任务 / 重新打开 (SPEC §6.2): closing a task under way asks first (the executor stops, an open PR is closed);
 // anything else is put away at once with an undo.
 async function command(t:Task,cmd:'cancelTask'|'archiveTask'|'unarchiveTask'){
  if(!project||pending.current)return false;pending.current=true;setBusy(true);setError('');
  try{saved(t,await api.action<TaskData>('nrTaskWork','advance',{method:'POST',body:{projectId:String(project.id),taskId:String(t.id),revision:t.evidence?.work?.revision||0,requestId:crypto.randomUUID(),command:cmd},unwrap:'data'}));return true;}
  catch(e){setError(() => (e instanceof Error?$t(e.message):$t("操作没有完成，请重试。")));return false;}finally{pending.current=false;setBusy(false);}
 }
 async function act(t:Task,action:TaskAction){
  if(action==='reopen'){if(await command(t,'unarchiveTask'))setNotice({text:() => $t("已重新打开：{0}",{0:t.title})});return;}
  const cmd=closeCommand(t.evidence?.work);if(!cmd)return;
  if(cmd==='cancelTask'&&!(await confirmAction({title:() => ($t("关闭任务“{0}”？",{0:t.title})),description:() => (getCloseConfirm()),action:'关闭任务'})))return;
  if(await command(t,cmd))setNotice(cmd==='archiveTask'?{text:() => $t("已关闭：{0}",{0:t.title}),undo:t}:{text:() => $t("已关闭：{0}（已停下）",{0:t.title})});
 }
 async function undo(t:Task){const fresh=tasks.find(x=>x.id===t.id)||t;if(await command(fresh,'unarchiveTask'))setNotice({text:() => $t("已撤销关闭：{0}",{0:t.title})});}
 const ordered=[...tasks].sort((a,b)=>(a.evidence?.work?.sortOrder??a.id*1024)-(b.evidence?.work?.sortOrder??b.id*1024)||a.id-b.id);
 const isDone=(t:Task)=>!isClosed(t.evidence?.work)&&workState(t.evidence?.work,t.status)==='done';
 const closedCount=tasks.filter(t=>isClosed(t.evidence?.work)).length,doneCount=tasks.filter(isDone).length;
 // 当前 is what is still under way (the board also shows its 已完成 column); 已完成 and 已关闭 are their own lists.
 const inScope=(t:Task)=>closed?isClosed(t.evidence?.work):done?isDone(t):!isClosed(t.evidence?.work)&&(board||!isDone(t));
 const visible=ordered.filter(t=>{const w=t.evidence?.work;return inScope(t)&&(!status||closed||done||workState(w,t.status)===status)&&matchesPlaybookFilter(w,playbook,legacyPlaybook)&&(!owner||ownerName(t)===owner)&&(!executor||executorOf(w)===executor)&&`${t.evidence?.no?`t-${t.evidence.no}`:''} ${t.evidence?.insight?.no?`o-${t.evidence.insight.no}`:''} ${t.title} ${t.brief} ${t.evidence?.keyword||''}`.toLowerCase().includes(q.trim().toLowerCase());});
 // The table lists what needs you first: 待确认, 进行中, 待处理, 已完成; the board keeps its manual order.
 const rank:Record<BoardState,number>={review:0,doing:1,todo:2,done:3};
 const rows=board||closed?visible:[...visible].sort((a,b)=>rank[workState(a.evidence?.work,a.status)]-rank[workState(b.evidence?.work,b.status)]||String(b.updatedAt).localeCompare(String(a.updatedAt)));
 const uniq=(xs:string[])=>[...new Set(xs.filter(Boolean))].sort();
 const select='min-w-28';
 return <PageContainer className="nr-page"><PageHeader title={$t("任务")} description={$t("Agent 和在线 AI 按做法完成的工作，需要你确认时会停下来。")}/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}<Button disabled={busy} variant="outline" size="sm" onClick={()=>void load()}>{$t("重新加载")}</Button></p>}{notice&&<p role="status" className="nr-success">{renderMessage(notice.text)}{notice.undo&&<button type="button" disabled={busy} className="ml-auto underline-offset-4 hover:underline" onClick={()=>void undo(notice.undo!)}>{$t("撤销")}</button>}</p>}
  <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={$t("筛选")}>
   <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label={$t("范围")}>{([['',$t("当前"),CircleDotIcon,tasks.length-closedCount-doneCount],['done',$t("已完成"),CircleCheckIcon,doneCount],['closed',$t("已关闭"),ArchiveIcon,closedCount]] as const).map(([c,label,Icon,n])=>{const on=c===(closed?'closed':done?'done':'');return <button key={label} type="button" aria-pressed={on} onClick={()=>param('scope',c)} className={cn('inline-flex h-8 items-center gap-1.5 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground',on&&'bg-muted font-medium text-foreground')}><Icon className="size-3.5"/>{label} <span className="tabular-nums">{loading?'':n}</span></button>;})}</div>
   <label className="relative flex min-w-48 flex-1 items-center sm:max-w-72"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label={$t("搜索任务")} value={q} onChange={e=>param('q',e.target.value)} placeholder={$t("按标题或编号搜索")} className="w-full pl-8!"/></label>
   {!closed&&!done&&<select aria-label={$t("按状态筛选")} value={status} onChange={e=>param('status',e.target.value)} className={select}>{getStatusOptions().filter(([k])=>board||k!=='done').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>}
   <select aria-label={$t("按做法筛选")} value={playbookFilterValue(playbook,legacyPlaybook)} onChange={e=>param('playbookName',playbookOptions.find(o=>o.value===e.target.value)?.name||'')} className={select}><option value="">{$t("全部做法")}</option>{legacyPlaybook&&playbook&&<option value={playbookFilterValue(playbook,true)}>{legacyPlaybookFilterLabel(playbookOptions,playbook)}</option>}{playbookOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
   <select aria-label={$t("按负责人筛选")} value={owner} onChange={e=>param('owner',e.target.value)} className={select}><option value="">{$t("任意负责人")}</option>{uniq(tasks.map(ownerName)).map(n=><option key={n} value={n}>{n}</option>)}</select>
   <select aria-label={$t("按执行者筛选")} value={executor} onChange={e=>param('executor',e.target.value)} className={select}><option value="">{$t("任意执行者")}</option>{(['agent','ai'] as const).map(k=><option key={k} value={k}>{getExecutorNames()[k]}</option>)}</select>
   <div className="ml-auto inline-flex overflow-hidden rounded-md border" role="group" aria-label={$t("视图")}>{([['',$t("列表"),ListIcon],['board',$t("看板"),KanbanIcon]] as const).map(([k,label,Icon])=>{const off=(closed||done)&&k==='board';return <button key={label} type="button" aria-label={label} title={off?$t("已完成和已关闭的任务用列表查看"):label} disabled={off} aria-pressed={(k==='board')===board} onClick={()=>{saveView(k);param('view',k);}} className={cn('inline-flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40',(k==='board')===board&&'bg-muted text-foreground')}><Icon className="size-4"/></button>;})}</div>
  </div>
  {loading?<p role="status" className="text-sm text-muted-foreground">{$t("正在读取任务…")}</p>:board?<WorkBoard tasks={rows} busy={busy} list={false} onMove={(t,s,before)=>void move(t as Task,s,before)} onOpen={id=>navigate('/actions/'+id)} onAction={(t,c)=>void act(t as Task,c)}/>
   :rows.length?<TaskTable tasks={rows} closed={closed} onOpen={id=>navigate('/actions/'+id)} onAction={(t,c)=>void act(t as Task,c)}/>:null}
  {!loading&&!rows.length&&!board&&<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{closed?$t("没有关闭的任务。"):done?$t("还没有完成的任务。"):q||status||playbook||owner||executor?$t("没有匹配的任务，可以调整筛选。"):$t("还没有任务。机会交给 Agent 后生成任务。")}</p>}
 </PageContainer>;
}
