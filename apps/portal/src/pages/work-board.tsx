import {useState,type ReactElement} from 'react';
import {LaptopIcon,MoreHorizontal,SparklesIcon} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Tag} from '@/components/reach/tag';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {workColumns,workState,canCancel,canArchive,closedLabel,isClosed,type BoardState,type Work} from './task-execution-types';
import {stepOf,executorOf,executorNames,initials,ago,stateTone} from './task-list-model';
export type WorkCard={id:number;title:string;brief:string;status:string;updatedAt:string;evidence?:{work?:Work;keyword?:string}};
type Action=(task:WorkCard,command:'cancelTask'|'archiveTask'|'unarchiveTask')=>void;
const dot:Record<BoardState,string>={todo:'bg-nr-ink-grey',doing:'bg-nr-ink-blue',review:'bg-nr-ink-violet',done:'bg-nr-ink-green'};
// Small parts shared by the table and the board (NocoProject look: dot pill, initials avatar, executor with a tinted icon).
function Avatar({name}:{name?:string}){return name?<span title={name} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium text-muted-foreground">{initials(name)}</span>:<span className="text-muted-foreground">—</span>;}
function Executor({w,compact=false}:{w?:Work;compact?:boolean}){const e=executorOf(w);if(!e)return <span className="text-muted-foreground">—</span>;
 return <span className="inline-flex min-w-0 items-center gap-1.5" title={executorNames[e]}><span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-nr-tint-violet text-nr-ink-violet">{e==='agent'?<LaptopIcon className="size-3"/>:<SparklesIcon className="size-3"/>}</span>
  {e==='agent'?<span className="truncate">{compact?'':'本机 '}<span className="text-nr-ink-violet">Agent</span></span>:<span className="truncate">在线 AI</span>}</span>;}
function StatusTag({t}:{t:WorkCard}){const w=t.evidence?.work,closed=closedLabel(w);if(closed)return <Tag tone="slate" dot>{closed.replace('（旧流程）','')}</Tag>;const s=workState(w,t.status);return <Tag tone={stateTone[s]} dot>{workColumns[s]}</Tag>;}
function StepCell({w,muted='—'}:{w?:Work;muted?:string}){const s=stepOf(w);if(!s)return <span className="text-muted-foreground">{muted}</span>;return s.tone?<Tag tone={s.tone}>{s.text}</Tag>:<span className="truncate text-muted-foreground">{s.text}</span>;}
function Menu({t,busy,moves,onMove,onAction}:{t:WorkCard;busy?:boolean;moves?:{col:BoardState;siblings:WorkCard[]};onMove?:(t:WorkCard,state:BoardState,beforeId?:number)=>void;onAction?:Action}){
 const w=t.evidence?.work,index=moves?moves.siblings.findIndex(x=>x.id===t.id):-1,lifecycle=onAction&&(w?.archivedAt||canCancel(w)||canArchive(w));
 if(!moves&&!lifecycle)return null;
 return <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`${t.title} 更多操作`} disabled={busy} onClick={e=>e.stopPropagation()}/>}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end">
  {moves&&onMove&&<>{Object.entries(workColumns).filter(([k])=>k!==moves.col).map(([k,v])=><DropdownMenuItem key={k} onClick={()=>onMove(t,k as BoardState)}>移到{v}</DropdownMenuItem>)}
   <DropdownMenuSeparator/><DropdownMenuItem disabled={index===0} onClick={()=>onMove(t,moves.col,moves.siblings[index-1]?.id)}>上移</DropdownMenuItem><DropdownMenuItem disabled={index===moves.siblings.length-1} onClick={()=>onMove(t,moves.col,moves.siblings[index+2]?.id)}>下移</DropdownMenuItem></>}
  {moves&&lifecycle&&<DropdownMenuSeparator/>}
  {onAction&&w?.archivedAt&&<DropdownMenuItem onClick={()=>onAction(t,'unarchiveTask')}>恢复</DropdownMenuItem>}
  {onAction&&!w?.archivedAt&&canArchive(w)&&<DropdownMenuItem onClick={()=>onAction(t,'archiveTask')}>归档</DropdownMenuItem>}
  {onAction&&canCancel(w)&&<DropdownMenuItem variant="destructive" onClick={()=>onAction(t,'cancelTask')}>取消任务</DropdownMenuItem>}
 </DropdownMenuContent></DropdownMenu>;
}
// Board: four columns (待处理 · 进行中 · 待确认 · 已完成); drag or use the card menu to move. Moving never starts AI or publishes.
export function WorkBoard({tasks:visible,busy,list,onMove,onOpen,onAction}:{tasks:WorkCard[];busy:boolean;list:boolean;onMove:(task:WorkCard,state:BoardState,beforeId?:number)=>void;onOpen:(id:number)=>void;onAction?:Action}):ReactElement{
 const [drag,setDrag]=useState<number|null>(null),[over,setOver]=useState('');
 const state=(t:WorkCard)=>workState(t.evidence?.work,t.status);
 function move(t:WorkCard,target:BoardState,beforeId?:number){setDrag(null);setOver('');onMove(t,target,beforeId);}
 function drop(target:BoardState,before?:number){const t=visible.find(t=>t.id===drag);if(t)move(t,target,before);}
 function card(t:WorkCard){const w=t.evidence?.work,col=state(t),siblings=visible.filter(x=>state(x)===col),s=stepOf(w);
  return <article key={t.id} data-task-id={t.id} draggable={!busy}
   className={cn('flex cursor-grab flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground transition-colors hover:border-ring',over===String(t.id)&&'border-t-2 border-t-primary')}
   onDragStart={e=>{setDrag(t.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(t.id));}} onDragEnd={()=>{setDrag(null);setOver('');}}
   onDragOver={e=>{if(drag!==null&&!busy){e.preventDefault();e.stopPropagation();setOver(String(t.id));}}} onDrop={e=>{e.preventDefault();e.stopPropagation();drop(col,t.id);}}>
   <h3 className="m-0 text-sm font-medium leading-snug"><button type="button" className="line-clamp-3 text-left hover:underline" onClick={()=>onOpen(t.id)}>{t.title}</button></h3>
   {s&&(s.tone?<Tag tone={s.tone}>{s.text}</Tag>:<span className="text-xs text-muted-foreground">{s.text}</span>)}
   <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><Avatar name={w?.humanOwnerName}/><span className="min-w-0 flex-1"><Executor w={w} compact/></span><span className="shrink-0">{ago(t.updatedAt)}</span>
    <Menu t={t} busy={busy} moves={{col,siblings}} onMove={move} onAction={onAction}/></div>
  </article>;}
 if(list)return <div className="flex flex-col gap-2">{visible.map(card)}</div>;
 return <div className="relative grid gap-3 overflow-x-auto pb-1 [grid-template-columns:repeat(4,minmax(15rem,1fr))]" aria-label="任务看板">{(Object.keys(workColumns) as BoardState[]).map(key=>{const cards=visible.filter(t=>state(t)===key);
  return <section key={key} aria-label={workColumns[key]} className={cn('flex min-w-0 flex-col gap-2 rounded-lg bg-muted/50 p-2',over===key&&'ring-2 ring-primary')}
   onDragOver={e=>{if(drag!==null&&!busy){e.preventDefault();setOver(key);}}} onDrop={e=>{e.preventDefault();drop(key);}}>
   <header className="flex items-center gap-2 px-1 py-1 text-sm font-medium"><span aria-hidden="true" className={cn('size-2 rounded-full',dot[key])}/><h2 className="m-0 text-sm font-medium">{workColumns[key]}</h2><span className="text-xs font-normal text-muted-foreground tabular-nums">{cards.length}</span></header>
   {cards.map(card)}{!cards.length&&<p className="px-1 py-4 text-center text-xs text-muted-foreground">暂无任务</p>}
  </section>;})}</div>;
}
// Table: one row per task, the row opens the task; lifecycle actions in the row menu.
export function TaskTable({tasks,onOpen,onAction}:{tasks:WorkCard[];onOpen:(id:number)=>void;onAction?:Action}):ReactElement{
 return <div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[46rem] table-fixed border-collapse text-sm" aria-label="任务列表">
  <colgroup><col/><col className="w-24"/><col className="w-48"/><col className="w-36"/><col className="w-32"/><col className="w-24"/><col className="w-10"/></colgroup>
  <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['标题','状态','当前一步','负责人','执行者','更新'].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}<th><span className="sr-only">操作</span></th></tr></thead>
  <tbody>{tasks.map(t=>{const w=t.evidence?.work;return <tr key={t.id} data-task-id={t.id} className={cn('cursor-pointer border-t transition-colors hover:bg-muted/40',isClosed(w)&&'text-muted-foreground')} onClick={()=>onOpen(t.id)}>
   <td className="px-3 py-2.5"><button type="button" className="block w-full truncate text-left font-medium hover:underline" onClick={e=>{e.stopPropagation();onOpen(t.id);}}>{t.title}</button></td>
   <td className="px-3 py-2.5"><StatusTag t={t}/></td>
   <td className="truncate px-3 py-2.5">{isClosed(w)?<span className="text-muted-foreground">—</span>:<StepCell w={w}/>}</td>
   <td className="px-3 py-2.5"><span className="flex min-w-0 items-center gap-2"><Avatar name={w?.humanOwnerName}/>{w?.humanOwnerName&&<span className="truncate">{w.humanOwnerName}</span>}</span></td>
   <td className="px-3 py-2.5"><Executor w={w}/></td>
   <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{ago(t.updatedAt)}</td>
   <td className="px-1 py-2.5" onClick={e=>e.stopPropagation()}><Menu t={t} onAction={onAction}/></td>
  </tr>;})}</tbody></table></div>;
}
// Kept for older callers: the playbook and step in words, and the executor in words.
export function workTypeLabel(w?:Work){if(w?.flow){const name=w.playbook?.name||w.flow.name||'做法',st=w.flow.stages[w.stageIndex||0];return w.stage==='done'?`${name} · 已完成`:`${name} · ${st?.name||''}`;}if(w?.kind||w?.plan)return w.kind==='research'?'调研分析':'优化页面';return '未开始';}
export function executorLabel(w?:Work){const e=executorOf(w);return e?executorNames[e]:'—';}
