import { $t, $tj } from "#i18n";
import {useState,type ReactElement} from 'react';
import {MoreHorizontal} from 'lucide-react';
import {ActorAvatar} from '#components/reach/actor';
import {cn} from '#lib/utils';
import {Tag} from '#components/reach/tag';
import {Button} from '#components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger} from '#components/ui/dropdown-menu';
import {workColumns,workState,closeCommand,canReopen,closedWhen,isClosed,type BoardState,type Work} from './task-execution-types';
import {stepOf,executorOf,executorNames,ago,stateTone} from './task-list-model';
import {WithInfo} from '#components/reach/info-tip';
import {help} from './glossary';
import {useMe} from './me';
// A task someone else owns: a 成员 can open and read it, but not drag, move or close it (its owner and 管理员 can; 2026-10-09).
function useEditable(){const {can}=useMe();return (t:WorkCard)=>can(t.evidence?.work?.humanOwnerId||t.evidence?.createdBy?.id);}
export type WorkCard={id:number;title:string;brief:string;status:string;updatedAt:string;evidence?:{work?:Work;keyword?:string;no?:number;insight?:{id?:string;no?:number};createdBy?:{id?:string;name?:string}}};
// The owner: the one set on the task, or whoever created it before anything happened on it (2026-10-08).
const ownerOf=(t:WorkCard)=>t.evidence?.work?.humanOwnerName||t.evidence?.createdBy?.name||'';
// The short task number (T-12); the long record id is never shown.
const No=({t}:{t:WorkCard})=>t.evidence?.no?<span className="font-mono text-xs text-muted-foreground tabular-nums">T-{t.evidence.no}</span>:null;
export type TaskAction='close'|'reopen';
type Action=(task:WorkCard,action:TaskAction)=>void;
const dot:Record<BoardState,string>={todo:'bg-nr-ink-grey',doing:'bg-nr-ink-blue',review:'bg-nr-ink-violet',done:'bg-nr-ink-green'};
// Small parts shared by the table and the board (NocoProject look: dot pill, the shared actor avatar, executor as agent avatar + name).
function Avatar({name}:{name?:string}){return name?<span title={name} className="inline-flex"><ActorAvatar type="user" name={name} size="sm"/></span>:<span className="text-muted-foreground">—</span>;}
function Executor({w,compact=false}:{w?:Work;compact?:boolean}){const e=executorOf(w);if(!e)return <span className="text-muted-foreground">—</span>;
 return <span className="inline-flex min-w-0 items-center gap-1.5" title={executorNames[e]}><ActorAvatar type="agent" size="xs"/>
  <span className="truncate">{e==='agent'?(compact?'Agent':$t("Agent")):$t("在线 AI")}</span></span>;}
function StatusTag({t}:{t:WorkCard}){const w=t.evidence?.work;if(isClosed(w))return <Tag tone="slate" dot>{$t("已关闭")}</Tag>;const s=workState(w,t.status);return <Tag tone={stateTone[s]} dot>{workColumns[s]}</Tag>;}
function StepCell({w,muted='—'}:{w?:Work;muted?:string}){const s=stepOf(w);if(!s)return <span className="text-muted-foreground">{muted}</span>;return s.tone?<Tag tone={s.tone}>{s.text}</Tag>:<span className="truncate text-muted-foreground">{s.text}</span>;}
function Menu({t,busy,moves,onMove,onAction}:{t:WorkCard;busy?:boolean;moves?:{col:BoardState;siblings:WorkCard[]};onMove?:(t:WorkCard,state:BoardState,beforeId?:number)=>void;onAction?:Action}){
 const w=t.evidence?.work,index=moves?moves.siblings.findIndex(x=>x.id===t.id):-1,close=onAction&&closeCommand(w),reopen=onAction&&canReopen(w);
 if(!moves&&!close&&!reopen)return null;
 return <DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={$t("{0} 更多操作",{0:t.title})} disabled={busy} onClick={e=>e.stopPropagation()}/>}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end">
  {close&&<DropdownMenuItem onClick={()=>onAction!(t,'close')}>{$t("关闭任务")}</DropdownMenuItem>}
  {reopen&&<DropdownMenuItem onClick={()=>onAction!(t,'reopen')}>{$t("重新打开")}</DropdownMenuItem>}
  {moves&&onMove&&<>{close&&<DropdownMenuSeparator/>}{Object.entries(workColumns).filter(([k])=>k!==moves.col).map(([k,v])=><DropdownMenuItem key={k} onClick={()=>onMove(t,k as BoardState)}>{$tj("移到{0}",{0:v})}</DropdownMenuItem>)}
   <DropdownMenuSeparator/><DropdownMenuItem disabled={index===0} onClick={()=>onMove(t,moves.col,moves.siblings[index-1]?.id)}>{$t("上移")}</DropdownMenuItem><DropdownMenuItem disabled={index===moves.siblings.length-1} onClick={()=>onMove(t,moves.col,moves.siblings[index+2]?.id)}>{$t("下移")}</DropdownMenuItem></>}
 </DropdownMenuContent></DropdownMenu>;
}
// Board: four columns (待处理 · 进行中 · 待确认 · 已完成) of current tasks; drag or use the card menu to move. Moving never
// starts AI or publishes, and closing is only in the menu (dragging must not stop a running executor).
export function WorkBoard({tasks:visible,busy,list,onMove,onOpen,onAction}:{tasks:WorkCard[];busy:boolean;list:boolean;onMove:(task:WorkCard,state:BoardState,beforeId?:number)=>void;onOpen:(id:number)=>void;onAction?:Action}):ReactElement{
 const [drag,setDrag]=useState<number|null>(null),[over,setOver]=useState(''),editable=useEditable();
 const state=(t:WorkCard)=>workState(t.evidence?.work,t.status);
 function move(t:WorkCard,target:BoardState,beforeId?:number){setDrag(null);setOver('');onMove(t,target,beforeId);}
 function drop(target:BoardState,before?:number){const t=visible.find(t=>t.id===drag);if(t)move(t,target,before);}
 function card(t:WorkCard){const w=t.evidence?.work,col=state(t),siblings=visible.filter(x=>state(x)===col),s=stepOf(w),mine=editable(t);
  return <article key={t.id} data-task-id={t.id} draggable={!busy&&mine} data-locked={mine?undefined:''}
   className={cn('flex flex-col gap-2',mine&&'cursor-grab','rounded-lg border bg-card p-3 text-card-foreground transition-colors hover:border-ring',over===String(t.id)&&'border-t-2 border-t-primary')}
   onDragStart={e=>{if(!mine){e.preventDefault();return;}setDrag(t.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(t.id));}} onDragEnd={()=>{setDrag(null);setOver('');}}
   onDragOver={e=>{if(drag!==null&&!busy){e.preventDefault();e.stopPropagation();setOver(String(t.id));}}} onDrop={e=>{e.preventDefault();e.stopPropagation();drop(col,t.id);}}>
   <No t={t}/>
   <h3 className="-mt-1.5 m-0 text-sm font-medium leading-snug"><button type="button" className="line-clamp-3 text-left hover:underline" onClick={()=>onOpen(t.id)}>{t.title}</button></h3>
   {s&&(s.tone?<Tag tone={s.tone}>{s.text}</Tag>:<span className="text-xs text-muted-foreground">{s.text}</span>)}
   <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><Avatar name={ownerOf(t)}/><span className="min-w-0 flex-1"><Executor w={w} compact/></span><span className="shrink-0">{ago(t.updatedAt)}</span>
    {mine?<Menu t={t} busy={busy} moves={{col,siblings}} onMove={move} onAction={onAction}/>:null}</div>
  </article>;}
 if(list)return <div className="flex flex-col gap-2">{visible.map(card)}</div>;
 return <div className="relative grid gap-3 overflow-x-auto pb-1 [grid-template-columns:repeat(4,minmax(15rem,1fr))]" aria-label={$t("任务看板")}>{(Object.keys(workColumns) as BoardState[]).map(key=>{const cards=visible.filter(t=>state(t)===key);
  return <section key={key} aria-label={workColumns[key]} className={cn('flex min-w-0 flex-col gap-2 rounded-lg bg-muted/50 p-2',over===key&&'ring-2 ring-primary')}
   onDragOver={e=>{if(drag!==null&&!busy){e.preventDefault();setOver(key);}}} onDrop={e=>{e.preventDefault();drop(key);}}>
   <header className="flex items-center gap-2 px-1 py-1 text-sm font-medium"><span aria-hidden="true" className={cn('size-2 rounded-full',dot[key])}/><h2 className="m-0 text-sm font-medium">{workColumns[key]}</h2><span className="text-xs font-normal text-muted-foreground tabular-nums">{cards.length}</span></header>
   {cards.map(card)}{!cards.length&&<p className="px-1 py-4 text-center text-xs text-muted-foreground">{$t("暂无任务")}</p>}
  </section>;})}</div>;
}
// Table: one row per task, the row opens the task; 关闭任务 / 重新打开 in the row menu. Closed tasks show where they stood.
export function TaskTable({tasks,closed=false,onOpen,onAction}:{tasks:WorkCard[];closed?:boolean;onOpen:(id:number)=>void;onAction?:Action}):ReactElement{
 const editable=useEditable();
 return <div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[50rem] table-fixed border-collapse text-sm" aria-label={$t("任务列表")}>
  <colgroup><col className="w-16"/><col/><col className="w-24"/><col className="w-48"/><col className="w-36"/><col className="w-32"/><col className="w-24"/><col className="w-10"/></colgroup>
  <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{[$t("编号"),$t("标题"),$t("状态"),closed?$t("关闭时"):$t("当前一步"),$t("负责人"),$t("执行者"),$t("更新")].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h===$t("执行者")?<WithInfo help={help(h)}>{h}</WithInfo>:h}</th>)}<th><span className="sr-only">{$t("操作")}</span></th></tr></thead>
  <tbody>{tasks.map(t=>{const w=t.evidence?.work;return <tr key={t.id} data-task-id={t.id} className={cn('cursor-pointer border-t transition-colors hover:bg-muted/40',isClosed(w)&&'text-muted-foreground')} onClick={()=>onOpen(t.id)}>
   <td className="px-3 py-2.5"><No t={t}/></td>
   <td className="px-3 py-2.5"><button type="button" className="block w-full truncate text-left font-medium hover:underline" onClick={e=>{e.stopPropagation();onOpen(t.id);}}>{t.title}</button></td>
   <td className="px-3 py-2.5"><StatusTag t={t}/></td>
   <td className="truncate px-3 py-2.5">{isClosed(w)?<span className="text-muted-foreground">{closedWhen(w)}</span>:<StepCell w={w}/>}</td>
   <td className="px-3 py-2.5"><span className="flex min-w-0 items-center gap-2"><Avatar name={ownerOf(t)}/>{ownerOf(t)&&<span className="truncate">{ownerOf(t)}</span>}</span></td>
   <td className="px-3 py-2.5"><Executor w={w}/></td>
   <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{ago(t.updatedAt)}</td>
   <td className="px-1 py-2.5" onClick={e=>e.stopPropagation()}>{editable(t)?<Menu t={t} onAction={onAction}/>:null}</td>
  </tr>;})}</tbody></table></div>;
}
// Kept for older callers: the playbook and step in words, and the executor in words.
export function workTypeLabel(w?:Work){if(w?.flow){const name=$t(w.playbook?.name||w.flow.name||$t("做法")),st=w.flow.stages[w.stageIndex||0];return w.stage==='done'?$t("{0} · 已完成",{0:name}):`${name} · ${st?$t(st.name):''}`;}if(w?.kind||w?.plan)return w.kind==='research'?$t("调研分析"):$t("优化页面");return $t("未开始");}
export function executorLabel(w?:Work){const e=executorOf(w);return e?executorNames[e]:'—';}
