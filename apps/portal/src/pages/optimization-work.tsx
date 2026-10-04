import {useEffect,useRef,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {CircleCheckIcon,CircleDotIcon,KanbanIcon,ListIcon,SearchIcon} from 'lucide-react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {cn} from '@/lib/utils';
import {refreshNavBadges} from '@/components/app-shell/nav-badges';
import {PageContainer,PageHeader} from '@/components/reach/page';
import {Button} from '@/components/ui/button';
import {records,useProject} from './reach-data';
import {workColumns,workState,isClosed,closeCommand,closeConfirm,type BoardState,type Work,type TaskData} from './task-execution-types';
import {executorOf,executorNames} from './task-list-model';
import {WorkBoard,TaskTable,type TaskAction} from './work-board';
import {confirmAction} from '@/components/reach/confirm';
type Task={id:number;title:string;brief:string;status:string;updatedAt:string;evidence?:{work?:Work;keyword?:string;no?:number;insight?:{id?:string;no?:number}}};
const statusOptions:[string,string][]=[['','全部状态'],...(Object.entries(workColumns) as [string,string][])];
// 任务 (SPEC §5, as NocoProject's issue list): a table by default, a board one click away; filters in one row. Closed
// tasks are one click away too (当前 | 已关闭, as GitHub's open/closed issues) and always shown as a table.
export default function OptimizationWork(){
 const {project,error:projectError}=useProject(),navigate=useNavigate(),[params,setParams]=useSearchParams();
 const [tasks,setTasks]=useState<Task[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState<{text:string;undo?:Task}>(),[busy,setBusy]=useState(false);
 const pending=useRef(false),generation=useRef(0),moveRequest=useRef({key:'',id:''});
 const legacyClosed=params.get('scope')==='archived'||params.get('status')==='closed',closed=params.get('scope')==='closed'||legacyClosed;
 const q=params.get('q')||'',status=legacyClosed?'':params.get('status')||'',playbook=params.get('playbook')||'',owner=params.get('owner')||'',executor=params.get('executor')||'';
 const board=params.get('view')==='board'&&!closed;
 const playbookOf=(t:Task)=>t.evidence?.work?.playbook?.name||'';
 async function load(){if(!project)return;const seq=++generation.current;setLoading(true);try{const rows=await records<Task>('nrTasks',{projectId:String(project.id)});if(seq===generation.current){setTasks(rows);setError('');}}catch{if(seq===generation.current)setError('读取任务失败，请重试。');}finally{if(seq===generation.current)setLoading(false);}}
 useEffect(()=>{void load();return()=>{generation.current++;};},[project?.id]);
 useEffect(()=>{const task=params.get('task');if(task)navigate('/actions/'+encodeURIComponent(task),{replace:true});},[params.get('task')]);
 function param(key:string,value:string){const p=new URLSearchParams(params);if(p.get('status')==='closed')p.delete('status');if(p.get('scope')==='archived')p.set('scope','closed');value?p.set(key,value):p.delete(key);setParams(p,{replace:key==='q'});}
 function saved(t:Task,d:TaskData){setTasks(rows=>rows.map(row=>row.id===t.id?{...row,...d.task,evidence:{...row.evidence,work:d.work}}:row));refreshNavBadges();}
 async function move(t:Task,target:BoardState,beforeId?:number){
  if(!project||pending.current||beforeId===t.id)return;
  if(target==='done'&&workState(t.evidence?.work,t.status)!=='done'&&!(await confirmAction({title:'确认这项工作已完成？',description:'不会发布内容；没有审核过的成果或实际执行记录时无法完成。',action:'标为完成',destructive:false})))return;
  pending.current=true;setBusy(true);setError('');setNotice(undefined);
  const body={projectId:String(project.id),taskId:String(t.id),revision:t.evidence?.work?.revision||0,command:'moveWork',state:target,beforeId:beforeId?String(beforeId):undefined,confirm:target==='done'};
  const key=JSON.stringify(body);if(moveRequest.current.key!==key)moveRequest.current={key,id:crypto.randomUUID()};
  try{saved(t,await api.action<TaskData>('nrTaskWork','advance',{method:'POST',body:{...body,requestId:moveRequest.current.id},unwrap:'data'}));}
  catch(e){setError(`${e instanceof Error?e.message:'位置未能保存'}。卡片保留原位，若提示版本冲突请重新加载。`);}
  finally{pending.current=false;setBusy(false);}
 }
 // 关闭任务 / 重新打开 (SPEC §6.2): closing a task under way asks first (the executor stops, an open PR is closed);
 // anything else is put away at once with an undo.
 async function command(t:Task,cmd:'cancelTask'|'archiveTask'|'unarchiveTask'){
  if(!project||pending.current)return false;pending.current=true;setBusy(true);setError('');
  try{saved(t,await api.action<TaskData>('nrTaskWork','advance',{method:'POST',body:{projectId:String(project.id),taskId:String(t.id),revision:t.evidence?.work?.revision||0,requestId:crypto.randomUUID(),command:cmd},unwrap:'data'}));return true;}
  catch(e){setError(e instanceof Error?e.message:'操作没有完成，请重试。');return false;}finally{pending.current=false;setBusy(false);}
 }
 async function act(t:Task,action:TaskAction){
  if(action==='reopen'){if(await command(t,'unarchiveTask'))setNotice({text:`已重新打开：${t.title}`});return;}
  const cmd=closeCommand(t.evidence?.work);if(!cmd)return;
  if(cmd==='cancelTask'&&!(await confirmAction({title:`关闭任务“${t.title}”？`,description:closeConfirm,action:'关闭任务'})))return;
  if(await command(t,cmd))setNotice(cmd==='archiveTask'?{text:`已关闭：${t.title}`,undo:t}:{text:`已关闭：${t.title}（已停下）`});
 }
 async function undo(t:Task){const fresh=tasks.find(x=>x.id===t.id)||t;if(await command(fresh,'unarchiveTask'))setNotice({text:`已撤销关闭：${t.title}`});}
 const ordered=[...tasks].sort((a,b)=>(a.evidence?.work?.sortOrder??a.id*1024)-(b.evidence?.work?.sortOrder??b.id*1024)||a.id-b.id);
 const closedCount=tasks.filter(t=>isClosed(t.evidence?.work)).length;
 const visible=ordered.filter(t=>{const w=t.evidence?.work;return isClosed(w)===closed&&(!status||closed||workState(w,t.status)===status)&&(!playbook||playbookOf(t)===playbook)&&(!owner||w?.humanOwnerName===owner)&&(!executor||executorOf(w)===executor)&&`${t.evidence?.no?`t-${t.evidence.no}`:''} ${t.evidence?.insight?.no?`o-${t.evidence.insight.no}`:''} ${t.title} ${t.brief} ${t.evidence?.keyword||''}`.toLowerCase().includes(q.trim().toLowerCase());});
 // The table lists what needs you first: 待确认, 进行中, 待处理, 已完成; the board keeps its manual order.
 const rank:Record<BoardState,number>={review:0,doing:1,todo:2,done:3};
 const rows=board||closed?visible:[...visible].sort((a,b)=>rank[workState(a.evidence?.work,a.status)]-rank[workState(b.evidence?.work,b.status)]||String(b.updatedAt).localeCompare(String(a.updatedAt)));
 const uniq=(xs:string[])=>[...new Set(xs.filter(Boolean))].sort();
 const select='min-w-28';
 return <PageContainer className="nr-page"><PageHeader title="任务" description="Agent 和在线 AI 按做法完成的工作，需要你确认时会停下来。"/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}<Button disabled={busy} variant="outline" size="sm" onClick={()=>void load()}>重新加载</Button></p>}{notice&&<p role="status" className="nr-success">{notice.text}{notice.undo&&<button type="button" disabled={busy} className="ml-auto underline-offset-4 hover:underline" onClick={()=>void undo(notice.undo!)}>撤销</button>}</p>}
  <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="筛选">
   <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="范围">{([[false,'当前',CircleDotIcon,tasks.length-closedCount],[true,'已关闭',CircleCheckIcon,closedCount]] as const).map(([c,label,Icon,n])=><button key={label} type="button" aria-pressed={closed===c} onClick={()=>param('scope',c?'closed':'')} className={cn('inline-flex h-8 items-center gap-1.5 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground',closed===c&&'bg-muted font-medium text-foreground')}><Icon className="size-3.5"/>{label} <span className="tabular-nums">{loading?'':n}</span></button>)}</div>
   <label className="relative flex min-w-48 flex-1 items-center sm:max-w-72"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label="搜索任务" value={q} onChange={e=>param('q',e.target.value)} placeholder="按标题或编号搜索" className="w-full pl-8!"/></label>
   {!closed&&<select aria-label="按状态筛选" value={status} onChange={e=>param('status',e.target.value)} className={select}>{statusOptions.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>}
   <select aria-label="按做法筛选" value={playbook} onChange={e=>param('playbook',e.target.value)} className={select}><option value="">全部做法</option>{uniq(tasks.map(playbookOf)).map(n=><option key={n} value={n}>{n}</option>)}</select>
   <select aria-label="按负责人筛选" value={owner} onChange={e=>param('owner',e.target.value)} className={select}><option value="">任意负责人</option>{uniq(tasks.map(t=>t.evidence?.work?.humanOwnerName||'')).map(n=><option key={n} value={n}>{n}</option>)}</select>
   <select aria-label="按执行者筛选" value={executor} onChange={e=>param('executor',e.target.value)} className={select}><option value="">任意执行者</option>{(['agent','ai'] as const).map(k=><option key={k} value={k}>{executorNames[k]}</option>)}</select>
   <div className="ml-auto inline-flex overflow-hidden rounded-md border" role="group" aria-label="视图">{([['','列表',ListIcon],['board','看板',KanbanIcon]] as const).map(([k,label,Icon])=>{const off=closed&&k==='board';return <button key={label} type="button" aria-label={label} title={off?'已关闭的任务用列表查看':label} disabled={off} aria-pressed={(k==='board')===board} onClick={()=>param('view',k)} className={cn('inline-flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40',(k==='board')===board&&'bg-muted text-foreground')}><Icon className="size-4"/></button>;})}</div>
  </div>
  {loading?<p role="status" className="text-sm text-muted-foreground">正在读取任务…</p>:board?<WorkBoard tasks={rows} busy={busy} list={false} onMove={(t,s,before)=>void move(t as Task,s,before)} onOpen={id=>navigate('/actions/'+id)} onAction={(t,c)=>void act(t as Task,c)}/>
   :rows.length?<TaskTable tasks={rows} closed={closed} onOpen={id=>navigate('/actions/'+id)} onAction={(t,c)=>void act(t as Task,c)}/>:null}
  {!loading&&!rows.length&&!board&&<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{closed?'没有关闭的任务。':q||status||playbook||owner||executor?'没有匹配的任务，可以调整筛选。':'还没有任务。机会交给 Agent 后生成任务。'}</p>}
 </PageContainer>;
}
