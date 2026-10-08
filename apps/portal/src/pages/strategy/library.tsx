import { $t, $tj } from "@/i18n";
import {useEffect,useState,type ReactNode} from 'react';
import {useNavigate,useSearchParams} from 'react-router';
import {ArrowRightIcon,ChevronRightIcon,ExternalLinkIcon,SearchIcon} from 'lucide-react';
import {PageContainer,PageHeader} from '@/components/reach/page';
import {Tag} from '@/components/reach/tag';
import {refreshNavBadges} from '@/components/app-shell/nav-badges';
import {Button} from '@/components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle} from '@/components/ui/sheet';
import {cn} from '@/lib/utils';
import {useProject} from '../reach-data';
import {request} from './service';
import type {StrategyState} from './model';
import {rowsFor,opportunityState,citedSignals,reasonLine,priorityRank,sourcesOf,oppNo,taskNo,sourceNames,type OpportunityState,type Row} from './board';
import {chipOf,titleOf,statusOf,ChangeDetail,watchedLabel} from './insights-view';
import {verdictsOf,watchDays,watchOf,recentlyEnded,daysBetween} from './watch';
import {records} from '../reach-data';
import type {Signal,WatchRecord} from './model';
import {handOff,handOffLabel,handOffNote,handOffResult,recommendedFor,HandOffNotice,type HandOffResult} from './hand-off';
import {playbookRequest,stagesFor,stageLabel,type PlaybookList} from '../playbook-model';
type Tab='pending'|'watch'|'all';
const tabs:[Tab,string][]=[['pending',$t("待处理")],['watch',$t("观察中",undefined,"tab")],['all',$t("全部")]];
type Dest='pending'|'task'|'ignored'|'expired';
const destinations:[Dest|'',string][]=[['',$t("全部去向")],['pending',$t("待处理")],['task',$t("已交给 Agent")],['ignored',$t("已忽略")],['expired',$t("已过期")]];
const day=(iso?:string)=>iso?new Date(iso).toLocaleDateString():'—';
type Item=Row&{state:OpportunityState;reason?:string};
const destOf=(r:Item):Dest=>r.state==='task'?'task':r.state==='archived'?(r.reason==='ignored'?'ignored':'expired'):'pending';
// The coloured fact of an opportunity: its strongest cited signal's tag (as on 洞察).
const leadChip=(r:Row)=>{const s=[...citedSignals(r)].sort((a,b)=>b.strength-a.strength).map(chipOf).find(Boolean);return s||null;};
const No=({row}:{row:Row})=>row.card.no?<span className="font-mono text-xs text-muted-foreground tabular-nums">{oppNo(row.card)}</span>:null;
// 机会 (SPEC §5): 待处理 — the undecided ones, list left and detail right; 观察中 — the changes the AI judged 先观察
// (2026-10-08), with the days watched; 全部 — every opportunity ever raised as one table.
// A row in 全部 goes where the opportunity is now: 待处理 opens there, a handed-off one opens its task, an archived one
// slides in its detail. A link to one item (?item=) opens it the same way, except a handed-off one shows its detail.
export default function OpportunityLibrary(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();const [params,setParams]=useSearchParams();
 const [state,setState]=useState<StrategyState>(),[playbooks,setPlaybooks]=useState<PlaybookList>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState<HandOffResult>(),[tasks,setTasks]=useState<WatchTask[]>([]),[watchKey,setWatchKey]=useState<string>();
 useEffect(()=>{if(!project)return;void request<StrategyState>(project.id,'state').then(s=>{setState(s);setError('');}).catch(()=>setError($t("机会读取失败，请重试。")));void playbookRequest<PlaybookList>('list',project.id).then(setPlaybooks).catch(()=>undefined);void records<WatchTask>('nrTasks',{projectId:String(project.id)}).then(setTasks).catch(()=>undefined);},[project?.id]);
 const rows:Item[]=state?rowsFor(state).map(r=>({...r,...opportunityState(r,state)})):[];
 const linked=rows.find(r=>r.card.id===params.get('item'));
 const asked=params.get('tab');
 const tab:Tab=asked==='pending'||asked==='all'||asked==='watch'?asked:asked==='task'||asked==='archived'?'all':linked&&linked.state!=='pending'?'all':'pending';
 const pending=rows.filter(r=>r.state==='pending').sort((a,b)=>(priorityRank[a.priority]??3)-(priorityRank[b.priority]??3)||String(b.firstSeenAt).localeCompare(String(a.firstSeenAt)));
 const selected=pending.find(r=>r.card.id===params.get('item'))||pending[0];
 const opened=tab==='all'?linked:undefined;
 // 观察中: the latest analysis's changes judged 先观察 (not already an opportunity or a task), biggest first, as on 洞察.
 const watching=state?[...(state.insights?.evidence.signals?.items||[])].sort((a,b)=>b.strength-a.strength).map(s=>({s,status:statusOf(s,state,tasks)})).filter(x=>x.status.label===$t("先观察")).map(x=>({...x,days:watchDays(state,x.s.key),record:watchOf(state,x.s.key)})):[];
 const ended=state?recentlyEnded(state):[];
 // 忽略 / 恢复 a watched change.
 async function decideWatch(key:string,status:'ignored'|'pending'){if(!state||!project||busy)return;setBusy(true);try{setState(await request<StrategyState>(project.id,'decideSignal',{signalKey:key,status,revision:state.revision,requestId:crypto.randomUUID()}));setError('');setWatchKey(undefined);}catch(e){setError(e instanceof Error?e.message:$t("保存失败，请刷新后重试。"));}finally{setBusy(false);}}
 const watched=watching.find(x=>x.s.key===watchKey);
 function go(next:{tab?:string;item?:string}){const p=new URLSearchParams(params);for(const [k,v] of Object.entries(next)){if(v)p.set(k,v);else p.delete(k);}setParams(p,{replace:true});}
 async function decide(row:Row,status:'ignored'|'pending'){if(!state||!project||busy)return;setBusy(true);setNotice(undefined);try{setState(await request<StrategyState>(project.id,'reviewOpportunity',{insightId:row.card.id,status,revision:state.revision,requestId:crypto.randomUUID()}));setError('');go({item:''});refreshNavBadges();}catch{setError($t("保存失败，请刷新后重试。"));}finally{setBusy(false);}}
 async function give(row:Row,playbookId?:string){if(!state||!project||busy)return;setBusy(true);setNotice(undefined);
  try{const r=await handOff(project.id,state,row,playbookId);setState(r.state);setError('');go({item:''});refreshNavBadges();
   setNotice(handOffResult(row,r,(playbooks?.playbooks.find(p=>p.id===playbookId)||recommendedFor(row,playbooks?.playbooks))?.kind));}
  catch{setError($t("没能交出去，机会仍保留，请稍后重试。"));}finally{setBusy(false);}}
 function openRow(r:Item){if(r.state==='pending')go({tab:'pending',item:r.card.id});else if(r.state==='task'&&r.taskId)navigate(`/actions/${r.taskId}`);else go({item:r.card.id});}
 const detail=(r:Item)=><Detail key={r.card.id} row={r} playbooks={playbooks} busy={busy} latest={state?.insights?.generatedAt} onGive={id=>void give(r,id)} onIgnore={()=>void decide(r,'ignored')} onRestore={()=>void decide(r,'pending')} onOpen={()=>navigate(`/actions/${r.taskId}`)}/>;
 return <PageContainer className="nr-page"><PageHeader title={$t("机会",undefined,"title")} description={$t("数据变化里值得做的事。交给 Agent 去做，或者忽略。")}/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}
  <HandOffNotice result={notice}/>
  <nav className="nr-tabs" aria-label={$t("机会分类")}>{tabs.map(([k,v])=><button key={k} aria-pressed={tab===k} onClick={()=>go({tab:k,item:''})}>{v}{state?` ${k==='pending'?pending.length:k==='watch'?watching.length:rows.length}`:''}</button>)}</nav>
  {!state?<p role="status" className="text-sm text-muted-foreground">{$t("正在读取机会…")}</p>:tab==='all'?<AllTable rows={rows} busy={busy} onOpen={openRow} onRestore={r=>void decide(r,'pending')}/>
  :tab==='watch'?<WatchList items={watching} ended={ended} rows={rows} busy={busy} onOpen={setWatchKey} onIgnore={k=>void decideWatch(k,'ignored')} onRestore={k=>void decideWatch(k,'pending')} onOpportunity={id=>go({tab:'pending',item:id})}/>
  :<div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
   <div className="flex flex-col gap-2">
    {pending.map(r=>{const c=leadChip(r);return <button key={r.card.id} type="button" aria-current={selected?.card.id===r.card.id} onClick={()=>go({item:r.card.id})}
     className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-left text-card-foreground transition-colors hover:border-ring aria-[current=true]:border-primary aria-[current=true]:ring-1 aria-[current=true]:ring-primary">
     <span className="line-clamp-2 text-sm font-medium"><No row={r}/>{r.card.no?' ':''}{r.card.title}</span>
     <span className="line-clamp-2 text-xs text-muted-foreground">{reasonLine(r)}</span>
     <span className="flex flex-wrap items-center gap-1">{c&&<Tag tone={c.tone}>{c.text}</Tag>}{sourcesOf(r).map(s=><Tag key={s} tone="grey">{s}</Tag>)}{r.card.change==='new'&&<Tag tone="blue">{$t("新")}</Tag>}</span>
    </button>;})}
    {!pending.length&&<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{$t("今天没有新的机会。数据变化不明显时，不必为了凑数而行动。")}</p>}
   </div>
   {selected&&detail(selected)}
  </div>}
  {watched&&project&&state?<ChangeDetail signal={watched.s} status={watched.status} projectId={project.id} verdicts={verdictsOf(state,watched.s.key)} watch={watched.record} today={state.insights?.generatedAt} judging={busy} onDecide={status=>void decideWatch(watched.s.key,status)} onClose={()=>setWatchKey(undefined)} onHandOff={r=>{setNotice(r);void request<StrategyState>(project.id,'state').then(setState).catch(()=>undefined);}}/>:null}
  <Sheet open={Boolean(opened)} onOpenChange={o=>{if(!o)go({item:''});}}>
   <SheetContent className="w-full overflow-y-auto sm:max-w-lg" aria-describedby={undefined}><SheetHeader className="sr-only"><SheetTitle>{$t("机会详情")}</SheetTitle></SheetHeader><div className="p-4 pt-12">{opened&&detail(opened)}</div></SheetContent>
  </Sheet>
 </PageContainer>;
}
type WatchTask={id:number;status:string;evidence?:{no?:number;work?:import('../task-execution-types').Work}};
// 观察中: one line per change — what changed, its numbers when watching started and now, what the AI waits for and the
// day it must decide by; 忽略 ends it. Below, 最近结束: how the watches of the last 7 days ended.
const short=(d?:string)=>d?d.slice(5,10).replace('-','/'):'—';
type Watching={s:Signal;status:{reason?:string};days:number;record?:WatchRecord};
function startToNow(w:Watching){const now=chipOf(w.s)?.text,start=w.record?.startChip?.text;return start&&now&&start!==now?`${start} → ${now}`:now||start||'—';}
function WatchList({items,ended,rows,busy,onOpen,onIgnore,onRestore,onOpportunity}:{items:Watching[];ended:WatchRecord[];rows:Item[];busy:boolean;onOpen:(key:string)=>void;onIgnore:(key:string)=>void;onRestore:(key:string)=>void;onOpportunity:(id:string)=>void}){
 const outcome=(w:WatchRecord)=>{const e=w.ended!,row=e.opportunityId?rows.find(r=>r.card.id===e.opportunityId):undefined;
  return e.outcome==='opportunity'?(row?<button type="button" onClick={()=>onOpportunity(row.card.id)}><Tag tone="amber">{$tj("变成机会{0}",{0:row.card.no?` ${oppNo(row.card)}`:''})}</Tag></button>:<Tag tone="amber">{$t("变成机会")}</Tag>)
   :e.outcome==='normal'?<Tag tone="grey">{$t("数字回到正常")}</Tag>:e.outcome==='ignored'?<Tag tone="slate">{$t("你忽略了")}</Tag>:<Tag tone="grey">{e.outcome==='expired'?$t("到期 · 不用做"):$t("不用做")}</Tag>;};
 return <div className="flex flex-col gap-3">
  <p className="text-sm text-muted-foreground">{$t("AI 判断先观察的变化：每条写着开始时的数字、在等什么和最晚哪天定。每天的分析对照这些重新判断，满足就变成机会或结束；到了最晚那天必须给出值得做或不用做。")}</p>
  {items.length?<div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[48rem] table-fixed border-collapse text-sm" aria-label={$t("观察中",undefined,"tab")}>
   <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="w-[38%] px-4 py-2 text-left font-normal">{$t("变化")}</th><th className="w-[16%] px-3 py-2 text-left font-normal">{$t("开始时 → 现在")}</th><th className="px-3 py-2 text-left font-normal">{$t("在等什么")}</th><th className="w-20 px-3 py-2 text-right font-normal">{$t("最晚定")}</th><th className="w-20 px-3 py-2"><span className="sr-only">{$t("操作")}</span></th></tr></thead>
   <tbody>{items.map(w=>{const c=chipOf(w.s);return <tr key={w.s.key} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" data-watch={w.s.key} onClick={()=>onOpen(w.s.key)}>
    <td className="px-4 py-2.5"><button type="button" className="block w-full min-w-0 text-left" onClick={e=>{e.stopPropagation();onOpen(w.s.key);}}><span className="flex items-center gap-2 font-medium"><span className="truncate">{titleOf(w.s)}</span>{c?<Tag tone={c.tone}>{c.text}</Tag>:null}</span>
     <span className="block truncate text-xs text-muted-foreground">{sourceNames[w.s.source]||w.s.source} · <span data-watched={w.days}>{watchedLabel(w.days)}</span></span></button></td>
    <td className="px-3 py-2.5 tabular-nums" data-start-now="">{startToNow(w)}</td>
    <td className="px-3 py-2.5 text-muted-foreground"><span className="line-clamp-2">{w.record?.waitingFor||w.status.reason||'—'}</span></td>
    <td className="px-3 py-2.5 text-right tabular-nums">{short(w.record?.decideBy)}</td>
    <td className="px-3 py-2.5 text-right"><Button size="sm" variant="ghost" disabled={busy} onClick={e=>{e.stopPropagation();onIgnore(w.s.key);}}>{$t("忽略")}</Button></td>
   </tr>;})}</tbody></table></div>
  :<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{$t("现在没有观察中的变化。")}</p>}
  {ended.length?<section className="flex flex-col gap-2" aria-label={$t("最近结束")}><h2 className="text-sm font-semibold">{$t("最近结束")} <span className="text-xs font-normal text-muted-foreground">{$t("近 7 天")}</span></h2>
   <ul className="divide-y rounded-lg border bg-card">{ended.map(w=><li key={w.key} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm" data-ended={w.ended!.outcome}>
    <span className="min-w-0 flex-1"><span className="block truncate">{$t(w.startTitle)}</span>{w.ended!.reason?<span className="block truncate text-xs text-muted-foreground">{w.ended!.reason}</span>:null}</span>
    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{$t("观察 {0} 天",{0:daysBetween(w.since,w.ended!.at)})}</span>{outcome(w)}
    {w.ended!.outcome==='ignored'?<Button size="sm" variant="ghost" disabled={busy} onClick={()=>onRestore(w.key)}>{$t("恢复")}</Button>:null}
   </li>)}</ul></section>:null}
 </div>;
}
// 全部: every opportunity ever raised, newest first; search by title or number, filter by where it went.
function AllTable({rows,busy,onOpen,onRestore}:{rows:Item[];busy:boolean;onOpen:(r:Item)=>void;onRestore:(r:Item)=>void}){
 const [q,setQ]=useState(''),[dest,setDest]=useState<Dest|''>('');
 const key=q.trim().toLowerCase().replace(/\s+/g,'');
 const visible=rows.filter(r=>(!dest||destOf(r)===dest)&&(!key||r.card.title.toLowerCase().includes(key)||(r.card.no&&[`o-${r.card.no}`,`o${r.card.no}`,String(r.card.no)].includes(key))))
  .sort((a,b)=>(b.card.no||0)-(a.card.no||0)||String(b.firstSeenAt).localeCompare(String(a.firstSeenAt)));
 const tag=(r:Item)=>{const d=destOf(r);return d==='pending'?<Tag tone="amber" dot>{$t("待处理")}</Tag>:d==='task'?<Tag tone="blue" dot>{$tj("已交给 Agent{0}",{0:r.taskNo?` · ${taskNo(r.taskNo)}`:''})}</Tag>:<Tag tone="grey" dot>{d==='ignored'?$t("已忽略"):$t("已过期")}</Tag>;};
 return <div className="flex flex-col gap-3">
  <div className="flex flex-wrap items-center gap-2"><label className="relative flex min-w-48 flex-1 items-center sm:max-w-80"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label={$t("搜索机会")} value={q} onChange={e=>setQ(e.target.value)} placeholder={$t("按标题或编号搜索，如 O-27")} className="w-full pl-8!"/></label>
   <select aria-label={$t("按去向筛选")} value={dest} onChange={e=>setDest(e.target.value as Dest|'')} className="min-w-28">{destinations.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
  {visible.length?<div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[40rem] table-fixed border-collapse text-sm" aria-label={$t("全部机会")}>
   <colgroup><col className="w-20"/><col/><col className="w-48"/><col className="w-28"/><col className="w-24"/></colgroup>
   <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{[$t("编号"),$t("标题"),$t("去向"),$t("首次发现")].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}<th><span className="sr-only">{$t("操作")}</span></th></tr></thead>
   <tbody>{visible.map(r=><tr key={r.card.id} data-opportunity-id={r.card.id} className={cn('cursor-pointer border-t transition-colors hover:bg-muted/40',r.state==='archived'&&'text-muted-foreground')} onClick={()=>onOpen(r)}>
    <td className="px-3 py-2.5"><No row={r}/></td>
    <td className="px-3 py-2.5"><button type="button" className="block w-full truncate text-left font-medium hover:underline" onClick={e=>{e.stopPropagation();onOpen(r);}}>{r.card.title}</button></td>
    <td className="px-3 py-2.5">{tag(r)}</td>
    <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{day(r.firstSeenAt)}</td>
    <td className="px-2 py-2.5 text-right" onClick={e=>e.stopPropagation()}>{r.state==='archived'&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>onRestore(r)}>{$t("恢复")}</Button>}</td>
   </tr>)}</tbody></table></div>
  :<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{key||dest?$t("没有匹配的机会。"):$t("还没有机会。每日分析发现值得做的事后会提出机会。")}</p>}
 </div>;
}
function Block({title,children}:{title:string;children:ReactNode}){return <div className="flex flex-col gap-1.5"><h3 className="text-xs font-medium text-muted-foreground">{title}</h3>{children}</div>;}
function Detail({row,playbooks,busy,latest,onGive,onIgnore,onRestore,onOpen}:{row:Item;playbooks?:PlaybookList;busy:boolean;latest?:string;onGive:(playbookId?:string)=>void;onIgnore:()=>void;onRestore:()=>void;onOpen:()=>void}){
 const signals=[...citedSignals(row)].sort((a,b)=>b.strength-a.strength),c=leadChip(row);
 const [playbookId,setPlaybookId]=useState<string>();const pb=playbooks?.playbooks.find(p=>p.id===playbookId)||recommendedFor(row,playbooks?.playbooks);
 return <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-label={$t("机会详情")}>
  <div className="flex flex-col gap-1.5">
   <div className="flex flex-wrap items-center gap-1">{c&&<Tag tone={c.tone}>{c.text}</Tag>}{sourcesOf(row).map(s=><Tag key={s} tone="grey">{s}</Tag>)}</div>
   <h2 className="flex flex-wrap items-baseline gap-2 text-lg font-semibold leading-snug"><No row={row}/><span>{row.card.title}</span></h2>
   <p className="nr-footnote">{$tj("{0} 首次发现 · {1}",{0:day(row.firstSeenAt),1:row.state==='pending'?$t("来自 {0} 的分析",{0:day(latest)}):row.state==='task'?$t("已交给 Agent{0}",{0:row.taskNo?$t("，任务 {0}",{0:taskNo(row.taskNo)}):''}):row.reason==='ignored'?$t("已忽略，之后的分析不会再提出"):$t("已过期：最新的分析没有再提出")})}</p>
  </div>
  <Block title={$t("数据变化")}>{signals.length?<ul className="flex flex-col divide-y">{signals.map(s=>{const sc=chipOf(s);return <li key={s.key} className="flex items-center gap-2 py-1.5 text-sm" title={s.facts.join('；')}>
    <span className="min-w-0 flex-1">{titleOf(s)}</span>{sc&&<Tag tone={sc.tone}>{sc.text}</Tag>}
    {s.url&&<a className="text-muted-foreground hover:text-foreground" href={s.url} target="_blank" rel="noreferrer" aria-label={$t("打开页面：{0}",{0:titleOf(s)})}><ExternalLinkIcon className="size-3.5"/></a>}</li>;})}</ul>
   :<p className="text-sm">{row.card.evidenceText||row.card.observation}</p>}</Block>
  <Block title={$t("建议做法")}><p className="text-sm leading-relaxed">{row.card.suggestion}</p></Block>
  {row.state==='pending'&&pb&&<Block title={$t("交给谁做")}>
   <div className="flex flex-wrap items-center gap-2 text-sm"><select aria-label={$t("做法")} value={pb.id} onChange={e=>setPlaybookId(e.target.value)} className="font-medium">{playbooks!.playbooks.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="text-xs text-muted-foreground">{$t("做法")}</span></div>
   <ol className="flex flex-wrap items-center gap-1" aria-label={$t("步骤")}>{stagesFor(pb).map((s,i)=><li key={s.key} className="flex items-center gap-1">{i>0&&<ChevronRightIcon className="size-3 text-muted-foreground" aria-hidden="true"/>}
    <Tag tone={s.kind==='review'?'violet':'grey'}>{stageLabel(s)}</Tag></li>)}</ol>
  </Block>}
  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
   {row.state==='pending'&&<><Button disabled={busy} onClick={()=>onGive(pb?.id)}>{handOffLabel(pb?.kind)}</Button><Button variant="ghost" disabled={busy} onClick={onIgnore}>{$t("忽略")}</Button><span className="ml-auto text-xs text-muted-foreground">{handOffNote(pb?.kind)}</span></>}
   {row.state==='task'&&<Button variant="outline" onClick={onOpen}>{$tj("打开任务{0}",{0:row.taskNo?` ${taskNo(row.taskNo)}`:''})}<ArrowRightIcon/></Button>}
   {row.state==='archived'&&<Button variant="outline" disabled={busy} onClick={onRestore}>{$t("恢复到待处理")}</Button>}
  </div>
  {row.card.limitation&&<p className="nr-footnote -mt-2">{$tj("限制：{0}",{0:row.card.limitation})}</p>}
 </section>;
}
