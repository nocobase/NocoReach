import {useEffect,useRef,useState} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {ReachPageHeader} from '@/components/reach-page-header';
import {records,useProject} from './reach-data';
import {workColumns,workState,type BoardState,type Work,type TaskData} from './task-execution-types';
import './reach-workspace.css';
import './strategy/strategy.css';
import './task-board.css';
import {WorkBoard,TaskTable,workTypeLabel} from './work-board';
type Task={id:number;title:string;brief:string;status:string;updatedAt:string;evidence?:{work?:Work;keyword?:string}};
export default function OptimizationWork(){
 const {project,error:projectError}=useProject(),navigate=useNavigate(),[params,setParams]=useSearchParams();
 const [tasks,setTasks]=useState<Task[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const pending=useRef(false),generation=useRef(0),moveRequest=useRef({key:'',id:''});
 const q=params.get('q')||'',playbook=params.get('playbook')||'',table=params.get('view')==='table';
 const playbookOf=(t:Task)=>workTypeLabel(t.evidence?.work).split(' · ')[0];
 const state=(t:Task)=>workState(t.evidence?.work,t.status);
 async function load(){if(!project)return;const seq=++generation.current;setLoading(true);try{const rows=await records<Task>('nrTasks',{projectId:String(project.id)});if(seq===generation.current){setTasks(rows);setError('');}}catch{if(seq===generation.current)setError('读取任务失败，请重试。');}finally{if(seq===generation.current)setLoading(false);}}
 useEffect(()=>{void load();return()=>{generation.current++;};},[project?.id]);
 useEffect(()=>{const task=params.get('task');if(task)navigate('/actions/'+encodeURIComponent(task),{replace:true});},[params.get('task')]);
 function param(key:string,value:string){const p=new URLSearchParams(params);value?p.set(key,value):p.delete(key);setParams(p,{replace:key==='q'});}
 async function move(t:Task,target:BoardState,beforeId?:number){
  if(!project||pending.current||beforeId===t.id)return;
  if(target==='done'&&state(t)!=='done'&&!confirm('确认这项工作已完成？此操作不会发布内容；未审核成果或缺少实际执行记录时无法完成。'))return;
  pending.current=true;setBusy(true);setError('');setNotice('正在保存位置…');
  const body={projectId:String(project.id),taskId:String(t.id),revision:t.evidence?.work?.revision||0,command:'moveWork',state:target,beforeId:beforeId?String(beforeId):undefined,confirm:target==='done'};
  const key=JSON.stringify(body);if(moveRequest.current.key!==key)moveRequest.current={key,id:crypto.randomUUID()};
  try{const d=await api.action<TaskData>('nrTaskWork','advance',{method:'POST',body:{...body,requestId:moveRequest.current.id},unwrap:'data'});setTasks(rows=>rows.map(row=>row.id===t.id?{...row,...d.task,evidence:{...row.evidence,work:d.work}}:row));setNotice('位置已保存。');}
  catch(e){setError(e instanceof Error?e.message:'位置未能保存，卡片保留原位。');setNotice('卡片保留原位。若提示版本冲突，请重新加载后再移动。');}
  finally{pending.current=false;setBusy(false);}
 }
 const ordered=[...tasks].sort((a,b)=>(a.evidence?.work?.sortOrder??a.id*1024)-(b.evidence?.work?.sortOrder??b.id*1024)||a.id-b.id);
 const visible=ordered.filter(t=>(!playbook||playbookOf(t)===playbook)&&`${t.title} ${t.brief} ${t.evidence?.keyword||''}`.toLowerCase().includes(q.toLowerCase()));
 const playbookNames=[...new Set(tasks.map(playbookOf))].sort();
 return <main className="nr-app nr-discovery nr-opportunities nr-task-board"><ReachPageHeader title="任务" description="每个任务由一个执行者按做法完成，需要你确认时会停下来。"/>
 {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}<Button disabled={busy} variant="outline" onClick={()=>void load()}>重新加载</Button></p>}{notice&&<p role="status">{notice}</p>}
 <div className="nr-task-toolbar"><input aria-label="搜索任务" value={q} onChange={e=>param('q',e.target.value)} placeholder="搜索任务"/><select aria-label="按做法筛选" value={playbook} onChange={e=>param('playbook',e.target.value)}><option value="">全部做法</option>{playbookNames.map(n=><option key={n} value={n}>{n}</option>)}</select><div className="nr-tabs nr-board-views" role="group" aria-label="视图"><button aria-pressed={!table} onClick={()=>param('view','')}>看板</button><button aria-pressed={table} onClick={()=>param('view','table')}>表格</button></div></div>
 {!table&&<p className="nr-footnote">拖动只改变状态和顺序，不会启动 AI 或发布。</p>}
 {loading?<p role="status">正在读取任务…</p>:table?<TaskTable tasks={visible} onOpen={id=>navigate('/actions/'+id)}/>:<WorkBoard tasks={visible} busy={busy} list={false} onMove={(t,state,before)=>void move(t,state,before)} onOpen={id=>navigate('/actions/'+id)}/>}
 {!loading&&!visible.length&&<p>没有匹配的任务。可调整筛选，或从洞察中的机会开始。</p>}</main>;
}
