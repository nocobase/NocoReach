import {useEffect,useRef,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {KanbanIcon,ListIcon,SearchIcon} from 'lucide-react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {cn} from '@/lib/utils';
import {PageContainer,PageHeader} from '@/components/reach/page';
import {Button} from '@/components/ui/button';
import {records,useProject} from './reach-data';
import {workColumns,workState,isClosed,type BoardState,type Work,type TaskData} from './task-execution-types';
import {executorOf,executorNames} from './task-list-model';
import {WorkBoard,TaskTable} from './work-board';
type Task={id:number;title:string;brief:string;status:string;updatedAt:string;evidence?:{work?:Work;keyword?:string}};
const statusOptions:[string,string][]=[['','当前任务'],...(Object.entries(workColumns) as [string,string][]),['closed','已取消与归档']];
// 任务 (SPEC §5, as NocoProject's issue list): a table by default, a board one click away; filters in one row.
export default function OptimizationWork(){
 const {project,error:projectError}=useProject(),navigate=useNavigate(),[params,setParams]=useSearchParams();
 const [tasks,setTasks]=useState<Task[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef(false),generation=useRef(0),moveRequest=useRef({key:'',id:''});
 const q=params.get('q')||'',status=params.get('status')||(params.get('scope')==='archived'?'closed':''),playbook=params.get('playbook')||'',owner=params.get('owner')||'',executor=params.get('executor')||'';
 const closed=status==='closed',board=params.get('view')==='board'&&!closed;
 const playbookOf=(t:Task)=>t.evidence?.work?.playbook?.name||'';
 async function load(){if(!project)return;const seq=++generation.current;setLoading(true);try{const rows=await records<Task>('nrTasks',{projectId:String(project.id)});if(seq===generation.current){setTasks(rows);setError('');}}catch{if(seq===generation.current)setError('读取任务失败，请重试。');}finally{if(seq===generation.current)setLoading(false);}}
 useEffect(()=>{void load();return()=>{generation.current++;};},[project?.id]);
 useEffect(()=>{const task=params.get('task');if(task)navigate('/actions/'+encodeURIComponent(task),{replace:true});},[params.get('task')]);
 function param(key:string,value:string){const p=new URLSearchParams(params);p.delete('scope');value?p.set(key,value):p.delete(key);setParams(p,{replace:key==='q'});}
 function saved(t:Task,d:TaskData){setTasks(rows=>rows.map(row=>row.id===t.id?{...row,...d.task,evidence:{...row.evidence,work:d.work}}:row));}
 async function move(t:Task,target:BoardState,beforeId?:number){
  if(!project||pending.current||beforeId===t.id)return;
  if(target==='done'&&workState(t.evidence?.work,t.status)!=='done'&&!confirm('确认这项工作已完成？此操作不会发布内容；未审核成果或缺少实际执行记录时无法完成。'))return;
  pending.current=true;setBusy(true);setError('');setNotice('');
  const body={projectId:String(project.id),taskId:String(t.id),revision:t.evidence?.work?.revision||0,command:'moveWork',state:target,beforeId:beforeId?String(beforeId):undefined,confirm:target==='done'};
  const key=JSON.stringify(body);if(moveRequest.current.key!==key)moveRequest.current={key,id:crypto.randomUUID()};
  try{saved(t,await api.action<TaskData>('nrTaskWork','advance',{method:'POST',body:{...body,requestId:moveRequest.current.id},unwrap:'data'}));}
  catch(e){setError(`${e instanceof Error?e.message:'位置未能保存'}。卡片保留原位，若提示版本冲突请重新加载。`);}
  finally{pending.current=false;setBusy(false);}
 }
 // Cancel and archive (SPEC §6.2): cancelling asks first because it stops the executor and closes an open PR.
 async function act(t:Task,command:'cancelTask'|'archiveTask'|'unarchiveTask'){
  if(!project||pending.current)return;
  if(command==='cancelTask'&&!confirm(`取消任务“${t.title}”？正在进行的执行会停止，未合并的 PR 会被关闭（分支保留）。`))return;
  pending.current=true;setBusy(true);setError('');
  try{saved(t,await api.action<TaskData>('nrTaskWork','advance',{method:'POST',body:{projectId:String(project.id),taskId:String(t.id),revision:t.evidence?.work?.revision||0,requestId:crypto.randomUUID(),command},unwrap:'data'}));setNotice({cancelTask:`已取消：${t.title}`,archiveTask:`已归档：${t.title}`,unarchiveTask:`已恢复：${t.title}`}[command]);}
  catch(e){setError(e instanceof Error?e.message:'操作没有完成，请重试。');}finally{pending.current=false;setBusy(false);}
 }
 const ordered=[...tasks].sort((a,b)=>(a.evidence?.work?.sortOrder??a.id*1024)-(b.evidence?.work?.sortOrder??b.id*1024)||a.id-b.id);
 const visible=ordered.filter(t=>{const w=t.evidence?.work;return isClosed(w)===closed&&(!status||closed||workState(w,t.status)===status)&&(!playbook||playbookOf(t)===playbook)&&(!owner||w?.humanOwnerName===owner)&&(!executor||executorOf(w)===executor)&&`${t.title} ${t.brief} ${t.evidence?.keyword||''}`.toLowerCase().includes(q.toLowerCase());});
 // The table lists what needs you first: 待确认, 进行中, 待处理, 已完成; the board keeps its manual order.
 const rank:Record<BoardState,number>={review:0,doing:1,todo:2,done:3};
 const rows=board||closed?visible:[...visible].sort((a,b)=>rank[workState(a.evidence?.work,a.status)]-rank[workState(b.evidence?.work,b.status)]||String(b.updatedAt).localeCompare(String(a.updatedAt)));
 const uniq=(xs:string[])=>[...new Set(xs.filter(Boolean))].sort();
 const select='min-w-28';
 return <PageContainer className="nr-page"><PageHeader title="任务" description="Agent 和在线 AI 按做法完成的工作，需要你确认时会停下来。"/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}<Button disabled={busy} variant="outline" size="sm" onClick={()=>void load()}>重新加载</Button></p>}{notice&&<p role="status" className="nr-success">{notice}</p>}
  <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="筛选">
   <label className="relative flex min-w-48 flex-1 items-center sm:max-w-72"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label="搜索任务" value={q} onChange={e=>param('q',e.target.value)} placeholder="按标题搜索" className="w-full pl-8!"/></label>
   <select aria-label="按状态筛选" value={status} onChange={e=>param('status',e.target.value)} className={select}>{statusOptions.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
   <select aria-label="按做法筛选" value={playbook} onChange={e=>param('playbook',e.target.value)} className={select}><option value="">全部做法</option>{uniq(tasks.map(playbookOf)).map(n=><option key={n} value={n}>{n}</option>)}</select>
   <select aria-label="按负责人筛选" value={owner} onChange={e=>param('owner',e.target.value)} className={select}><option value="">任意负责人</option>{uniq(tasks.map(t=>t.evidence?.work?.humanOwnerName||'')).map(n=><option key={n} value={n}>{n}</option>)}</select>
   <select aria-label="按执行者筛选" value={executor} onChange={e=>param('executor',e.target.value)} className={select}><option value="">任意执行者</option>{(['agent','ai'] as const).map(k=><option key={k} value={k}>{executorNames[k]}</option>)}</select>
   {!closed&&<div className="ml-auto inline-flex overflow-hidden rounded-md border" role="group" aria-label="视图">{([['','列表',ListIcon],['board','看板',KanbanIcon]] as const).map(([k,label,Icon])=><button key={label} type="button" aria-label={label} title={label} aria-pressed={(k==='board')===board} onClick={()=>param('view',k)} className={cn('inline-flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground',(k==='board')===board&&'bg-muted text-foreground')}><Icon className="size-4"/></button>)}</div>}
  </div>
  {loading?<p role="status" className="text-sm text-muted-foreground">正在读取任务…</p>:board?<WorkBoard tasks={rows} busy={busy} list={false} onMove={(t,s,before)=>void move(t as Task,s,before)} onOpen={id=>navigate('/actions/'+id)} onAction={(t,c)=>void act(t as Task,c)}/>
   :rows.length?<TaskTable tasks={rows} onOpen={id=>navigate('/actions/'+id)} onAction={(t,c)=>void act(t as Task,c)}/>:null}
  {!loading&&!rows.length&&!board&&<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{closed?'没有取消或归档的任务。':q||status||playbook||owner||executor?'没有匹配的任务，可以调整筛选。':'还没有任务。在机会页点“交给 Agent”就会出现在这里。'}</p>}
 </PageContainer>;
}
