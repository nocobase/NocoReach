import {useState} from 'react';
import {MoreHorizontal} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {workColumns,workState,type BoardState,type Work} from './task-execution-types';
export type WorkCard={id:number;title:string;brief:string;status:string;updatedAt:string;evidence?:{work?:Work;keyword?:string}};
export function WorkBoard({tasks:visible,busy,list,onMove,onOpen}:{tasks:WorkCard[];busy:boolean;list:boolean;onMove:(task:WorkCard,state:BoardState,beforeId?:number)=>void;onOpen:(id:number)=>void}){
 const [drag,setDrag]=useState<number|null>(null),[over,setOver]=useState('');
 const state=(t:WorkCard)=>workState(t.evidence?.work,t.status);
 function move(t:WorkCard,target:BoardState,beforeId?:number){setDrag(null);setOver('');onMove(t,target,beforeId);}
 function drop(target:BoardState,before?:number){const t=visible.find(t=>t.id===drag);if(t)void move(t,target,before);}
 function card(t:WorkCard){const w=t.evidence?.work,col=state(t),siblings=visible.filter(x=>state(x)===col),index=siblings.findIndex(x=>x.id===t.id);return <article key={t.id} className={'nr-task-card '+(over===String(t.id)?'nr-drop-before':'')} data-task-id={t.id} draggable={!busy} onDragStart={e=>{setDrag(t.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(t.id));}} onDragEnd={()=>{setDrag(null);setOver('');}} onDragOver={e=>{if(drag!==null&&!busy){e.preventDefault();e.stopPropagation();setOver(String(t.id));}}} onDrop={e=>{e.preventDefault();e.stopPropagation();drop(col,t.id);}}>
  <h3><button className="nr-task-open" onClick={()=>onOpen(t.id)}>{t.title}</button></h3>
  <div className="nr-task-card-meta"><span className="nr-pill nr-work-type">{workTypeLabel(w)}</span>
  {w?.latestRun&&['queued','running','failed'].includes(w.latestRun.status)&&<span className={'nr-pill nr-run-'+w.latestRun.status}>{{queued:'AI 排队中',running:'AI 执行中',failed:'AI 执行失败'}[w.latestRun.status]}</span>}
  {w?.stage==='verification'&&w.receipt?.note&&<span className="nr-pill">效果观察中</span>}
  <span className="nr-task-updated">{t.updatedAt?new Date(t.updatedAt).toLocaleDateString():''}
  <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`${t.title} 更多操作`} disabled={busy}/>}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end">
   {Object.entries(workColumns).filter(([k])=>k!==col).map(([k,v])=><DropdownMenuItem key={k} onClick={()=>void move(t,k as BoardState)}>移到{v}</DropdownMenuItem>)}
   <DropdownMenuSeparator/><DropdownMenuItem disabled={index===0} onClick={()=>void move(t,col,siblings[index-1]?.id)}>上移</DropdownMenuItem><DropdownMenuItem disabled={index===siblings.length-1} onClick={()=>void move(t,col,siblings[index+2]?.id)}>下移</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu></span></div>
 </article>;}
 return list?<div className="nr-work-list">{visible.map(card)}</div>:<div className="nr-task-kanban" aria-label="优化工作看板">{Object.entries(workColumns).map(([key,label])=><section key={key} className={'nr-task-column '+(over===key?'nr-drop-column':'')} aria-label={label} onDragOver={e=>{if(drag!==null&&!busy){e.preventDefault();setOver(key);}}} onDrop={e=>{e.preventDefault();drop(key as BoardState);}}><header><h2>{label}</h2><span>{visible.filter(t=>state(t)===key).length}</span></header><div className="nr-task-column-cards">{visible.filter(t=>state(t)===key).map(card)}{!visible.some(t=>state(t)===key)&&<p className="nr-task-column-empty">暂无工作</p>}</div></section>)}</div>;
}
// Work type tag; the full taxonomy is pending the workflow discussion, so only known kinds are labelled.
export function workTypeLabel(w?:Work){return w?.kind==='research'?'调研分析':'优化页面';}
