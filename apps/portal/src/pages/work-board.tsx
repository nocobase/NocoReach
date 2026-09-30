import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {workColumns,workState,type BoardState,type Work} from './task-execution-types';
export type WorkCard={id:number;title:string;brief:string;status:string;updatedAt:string;evidence?:{work?:Work;keyword?:string}};
export function WorkBoard({tasks:visible,busy,list,onMove,onOpen}:{tasks:WorkCard[];busy:boolean;list:boolean;onMove:(task:WorkCard,state:BoardState,beforeId?:number)=>void;onOpen:(id:number)=>void}){
 const [drag,setDrag]=useState<number|null>(null),[over,setOver]=useState('');
 const state=(t:WorkCard)=>workState(t.evidence?.work,t.status);
 function move(t:WorkCard,target:BoardState,beforeId?:number){setDrag(null);setOver('');onMove(t,target,beforeId);}
 function drop(target:BoardState,before?:number){const t=visible.find(t=>t.id===drag);if(t)void move(t,target,before);}
 function card(t:WorkCard){const w=t.evidence?.work,col=state(t),siblings=visible.filter(x=>state(x)===col),index=siblings.findIndex(x=>x.id===t.id);return <article key={t.id} className={'nr-task-card '+(over===String(t.id)?'nr-drop-before':'')} data-task-id={t.id} draggable={!busy} onDragStart={e=>{setDrag(t.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(t.id));}} onDragEnd={()=>{setDrag(null);setOver('');}} onDragOver={e=>{if(drag!==null&&!busy){e.preventDefault();e.stopPropagation();setOver(String(t.id));}}} onDrop={e=>{e.preventDefault();e.stopPropagation();drop(col,t.id);}}>
  <h3><button className="nr-task-open" onClick={()=>onOpen(t.id)}>{t.title}</button></h3><p>{t.brief?.slice(0,120)||'打开工作，确认本次要完成的内容。'}</p>
  {w?.stage==='verification'&&w.receipt?.note&&<span className="nr-pill">已执行 · 效果待观察</span>}
  {w?.latestRun&&<p>AI · {{queued:'排队中',running:'执行中',succeeded:'已有结果',failed:'需要处理'}[w.latestRun.status]||w.latestRun.status}</p>}
  <div className="nr-card-controls"><label>移动到<select aria-label={`移动 ${t.title}`} disabled={busy} value={col} onChange={e=>void move(t,e.target.value as BoardState)}>{Object.entries(workColumns).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><Button size="sm" variant="ghost" disabled={busy||index===0} aria-label={`上移 ${t.title}`} onClick={()=>void move(t,col,siblings[index-1]?.id)}>↑</Button><Button size="sm" variant="ghost" disabled={busy||index===siblings.length-1} aria-label={`下移 ${t.title}`} onClick={()=>void move(t,col,siblings[index+2]?.id)}>↓</Button></div>
 </article>;}
 return list?<div className="nr-work-list">{visible.map(card)}</div>:<div className="nr-task-kanban" aria-label="优化工作看板">{Object.entries(workColumns).map(([key,label])=><section key={key} className={'nr-task-column '+(over===key?'nr-drop-column':'')} aria-label={label} onDragOver={e=>{if(drag!==null&&!busy){e.preventDefault();setOver(key);}}} onDrop={e=>{e.preventDefault();drop(key as BoardState);}}><header><h2>{label}</h2><span>{visible.filter(t=>state(t)===key).length}</span></header><div className="nr-task-column-cards">{visible.filter(t=>state(t)===key).map(card)}{!visible.some(t=>state(t)===key)&&<p className="nr-task-column-empty">暂无工作</p>}</div></section>)}</div>;
}
