import { useMessageState, getCurrentLocale, $t, $tj } from "#i18n";
import {useEffect,useState,type ReactNode} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {ArrowRightIcon,ExternalLinkIcon,SearchIcon} from 'lucide-react';
import {PageContainer,PageHeader} from '#components/reach/page';
import {Tag} from '#components/reach/tag';
import {StepChips} from '#components/reach/step-chips';
import {ActorAvatar} from '#components/reach/actor';
import {refreshNavBadges} from '#components/app-shell/nav-badges';
import {Button} from '#components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle} from '#components/ui/sheet';
import {cn} from '#lib/utils';
import {useProject} from '../reach-data';
import {useMe} from '../me';
import {request} from './service';
import type {StrategyState} from './model';
import {rowsFor,opportunityState,citedSignals,reasonLine,priorityRank,sourcesOf,oppNo,taskNo,getSourceNames,type OpportunityState,type Row} from './board';
import {chipOf,titleOf,statusOf,ChangeDetail,watchedLabel} from './insights-view';
import {verdictsOf,watchDays,watchOf,recentlyEnded,daysBetween} from './watch';
import {taskRecords} from '../reach-data';
import type {Signal,WatchRecord} from './model';
import {handOff,handOffLabel,handOffNote,handOffResult,recommendedFor,HandOffNotice,type HandOffResult} from './hand-off';
import {playbookRequest,localizePlaybookList,stagesFor,type PlaybookList} from '../playbook-model';
// The same three groups as 洞察's 今天的变化 (2026-10-08 user request): 待处理, 观察中, 已处理.
type Tab='pending'|'watch'|'done';
const getTabs = (): [Tab,string][] => ([['pending',$t("待处理")],['watch',$t("观察中",undefined,"tab")],['done',$t("已处理")]]);
type Dest='pending'|'task'|'ignored'|'expired'|'skip';
const getDestinations = (): [Dest|'',string][] => ([['',$t("全部去向")],['task',$t("已交给 Agent")],['ignored',$t("已忽略")],['expired',$t("已过期")],['skip',$t("无需处理")]]);
const day=(iso?:string)=>iso?new Date(iso).toLocaleDateString(getCurrentLocale()):'—';
type Item=Row&{state:OpportunityState;reason?:string};
const destOf=(r:Item):Dest=>r.state==='task'?'task':r.state==='archived'?(r.reason==='ignored'?'ignored':'expired'):'pending';
// The coloured fact of an opportunity: its strongest cited signal's tag (as on 洞察).
const leadChip=(r:Row)=>{const s=[...citedSignals(r)].sort((a,b)=>b.strength-a.strength).map(chipOf).find(Boolean);return s||null;};
const No=({row}:{row:Row})=>row.card.no?<span className="font-mono text-xs text-muted-foreground tabular-nums">{oppNo(row.card)}</span>:null;
// 机会 (SPEC §5): 待处理 — the undecided ones, list left and detail right; 观察中 — the changes the AI advised watching
// (2026-10-08), with the days watched; 已处理 — the opportunities decided (handed off, ignored, expired) and the latest
// analysis's changes that need nothing (无需处理, ignored, or handed off on their own), as one table. A search there finds
// every opportunity, the pending ones too. A row goes where it is now: a pending one opens in 待处理, a handed-off one
// opens its task, an archived one or a change slides in its detail. A link to one item (?item=) opens it the same way.
export default function OpportunityLibrary(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();const [params,setParams]=useSearchParams();
 const [state,setState]=useState<StrategyState>(),[rawPlaybooks,setPlaybooks]=useState<PlaybookList>(),[error,setError]=useMessageState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState<HandOffResult>(),[tasks,setTasks]=useState<WatchTask[]>([]),[watchKey,setWatchKey]=useState<string>(),[members,setMembers]=useState<Member[]>([]);
 const playbooks=localizePlaybookList(rawPlaybooks);
 // Who you are (the default owner): NocoReach's own member record — NocoBase 3 has no classic auth:check.
 const me=useMe().me?.id||undefined;
 useEffect(()=>{if(!project)return;void request<StrategyState>(project.id,'state').then(s=>{setState(s);setError('');}).catch(()=>setError(() => ($t("机会读取失败，请重试。"))));void playbookRequest<PlaybookList>('list',project.id).then(setPlaybooks).catch(()=>undefined);void taskRecords<WatchTask>(project.id).then(setTasks).catch(()=>undefined);
  // 交给谁做: the people a task can go to, and who you are (the default).
  void api.action<Member[]>('nrTaskWork','members',{method:'POST',body:{projectId:String(project.id)},unwrap:'data'}).then(m=>setMembers(Array.isArray(m)?m:[])).catch(()=>undefined);},[project?.id]);
 const rows:Item[]=state?rowsFor(state).map(r=>({...r,...opportunityState(r,state)})):[];
 const linked=rows.find(r=>r.card.id===params.get('item'));
 const asked=params.get('tab');
 const tab:Tab=asked==='pending'||asked==='done'||asked==='watch'?asked:asked==='all'||asked==='task'||asked==='archived'?'done':linked&&linked.state!=='pending'?'done':'pending';
 const pending=rows.filter(r=>r.state==='pending').sort((a,b)=>(priorityRank[a.priority]??3)-(priorityRank[b.priority]??3)||String(b.firstSeenAt).localeCompare(String(a.firstSeenAt)));
 const selected=pending.find(r=>r.card.id===params.get('item'))||pending[0];
 const opened=tab==='done'?linked:undefined;
 // 观察中: the latest analysis's changes the AI advised watching (not already an opportunity or a task), biggest first, as on 洞察.
 const judged=state?[...(state.insights?.evidence.signals?.items||[])].sort((a,b)=>b.strength-a.strength).map(s=>({s,status:statusOf(s,state,tasks)})):[];
 const watching=judged.filter(x=>x.status.verdict==='watch'&&!x.status.dismissed).map(x=>({...x,days:watchDays(state!,x.s.key),record:watchOf(state!,x.s.key)}));
 const ended=state?recentlyEnded(state):[];
 // 忽略 / 恢复 a watched change.
 async function decideWatch(key:string,status:'ignored'|'pending'){if(!state||!project||busy)return;setBusy(true);try{setState(await request<StrategyState>(project.id,'decideSignal',{signalKey:key,status,revision:state.revision,requestId:crypto.randomUUID()}));setError('');setWatchKey(undefined);}catch(e){setError(() => (e instanceof Error?$t(e.message):$t("保存失败，请刷新后重试。")));}finally{setBusy(false);}}
 // 已处理 also lists the latest analysis's changes that need nothing — 无需处理, ignored, or handed off without an
 // opportunity — except those an opportunity already stands for (that one is listed instead).
 const cited=new Set(rows.flatMap(r=>citedSignals(r).map(x=>x.key)));
 const settled=judged.filter(x=>!cited.has(x.s.key)&&(x.status.next==='task'||x.status.verdict==='skip'||Boolean(x.status.ignored)));
 const watched=watching.find(x=>x.s.key===watchKey)||settled.find(x=>x.s.key===watchKey);
 function go(next:{tab?:string;item?:string}){const p=new URLSearchParams(params);for(const [k,v] of Object.entries(next)){if(v)p.set(k,v);else p.delete(k);}setParams(p,{replace:true});}
 async function decide(row:Row,status:'ignored'|'pending'){if(!state||!project||busy)return;setBusy(true);setNotice(undefined);try{setState(await request<StrategyState>(project.id,'reviewOpportunity',{insightId:row.card.id,status,revision:state.revision,requestId:crypto.randomUUID()}));setError('');go({item:''});refreshNavBadges();}catch{setError(() => ($t("保存失败，请刷新后重试。")));}finally{setBusy(false);}}
 async function give(row:Row,playbookId?:string,ownerId?:string){if(!state||!project||busy)return;setBusy(true);setNotice(undefined);
  try{const r=await handOff(project.id,state,row,playbookId,ownerId&&ownerId!==me?ownerId:undefined);setState(r.state);setError('');go({item:''});refreshNavBadges();
   setNotice(handOffResult(row,r,(playbooks?.playbooks.find(p=>p.id===playbookId)||recommendedFor(row,playbooks?.playbooks))?.kind));}
  catch{setError(() => ($t("没能交出去，机会仍保留，请稍后重试。")));}finally{setBusy(false);}}
 function openRow(r:Item){if(r.state==='pending')go({tab:'pending',item:r.card.id});else if(r.state==='task'&&r.taskId)navigate(`/actions/${r.taskId}`);else go({item:r.card.id});}
 const detail=(r:Item)=><Detail key={r.card.id} row={r} playbooks={playbooks} busy={busy} latest={state?.insights?.generatedAt} members={members} me={me} onGive={(id,owner)=>void give(r,id,owner)} onIgnore={()=>void decide(r,'ignored')} onRestore={()=>void decide(r,'pending')} onOpen={()=>navigate(`/actions/${r.taskId}`)}/>;
 return <PageContainer className="nr-page"><PageHeader title={$t("机会",undefined,"title")} description={$t("数据变化里值得做的事。交给 Agent 去做，或者忽略。")}/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}
  <HandOffNotice result={notice}/>
  <nav className="nr-tabs" aria-label={$t("机会分类")}>{getTabs().map(([k,v])=><button key={k} aria-pressed={tab===k} onClick={()=>go({tab:k,item:''})}>{v}{state?` ${k==='pending'?pending.length:k==='watch'?watching.length:rows.length-pending.length+settled.length}`:''}</button>)}</nav>
  {!state?<p role="status" className="text-sm text-muted-foreground">{$t("正在读取机会…")}</p>:tab==='done'?<DoneTable rows={rows} changes={settled} busy={busy} onOpen={openRow} onOpenChange={setWatchKey} onRestore={r=>void decide(r,'pending')} onRestoreChange={k=>void decideWatch(k,'pending')}/>
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
  {watched&&project&&state?<ChangeDetail signal={watched.s} status={watched.status} projectId={project.id} verdicts={verdictsOf(state,watched.s.key)} watch={watchOf(state,watched.s.key)} today={state.insights?.generatedAt} judging={busy} onDecide={status=>void decideWatch(watched.s.key,status)} onClose={()=>setWatchKey(undefined)} onHandOff={r=>{setNotice(r);void request<StrategyState>(project.id,'state').then(setState).catch(()=>undefined);}}/>:null}
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
// 观察中 columns (2026-10-09 user feedback: 开始时 → 现在, 在等什么 and 最晚定 read oddly): 数值 (current, then where it
// started), 判断条件 (what decides it) and 截止日期 (the day a verdict is due, with the days left). A change watched before
// its record existed shows the AI's reason in grey and “下次分析确定”.
const localDay=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function Values({w}:{w:Watching}){const now=chipOf(w.s)?.text||'—',start=w.record?.startChip?.text;
 const second=w.record?(w.days<=1?$t("今天开始"):start?(start===now?$t("起始 {0}，持平",{0:start}):$t("起始 {0}（{1}）",{0:start,1:short(w.record.since)})):''):'';
 return <><span className="block">{$t("当前 {0}",{0:now})}</span>{second?<span className="block text-xs text-muted-foreground">{second}</span>:null}</>;}
function Deadline({w}:{w:Watching}){const d=w.record?.decideBy;if(!d)return <span className="text-muted-foreground">{$t("下次分析确定")}</span>;
 const left=Math.round((Date.parse(d.slice(0,10))-Date.parse(localDay()))/86400000);
 return <><span className="block">{short(d)}</span><span className="block text-xs text-muted-foreground">{left>0?$t("还剩 {0} 天",{0:left}):$t("今天到期")}</span></>;}
function WatchList({items,ended,rows,busy,onOpen,onIgnore,onRestore,onOpportunity}:{items:Watching[];ended:WatchRecord[];rows:Item[];busy:boolean;onOpen:(key:string)=>void;onIgnore:(key:string)=>void;onRestore:(key:string)=>void;onOpportunity:(id:string)=>void}){
 const outcome=(w:WatchRecord)=>{const e=w.ended!,row=e.opportunityId?rows.find(r=>r.card.id===e.opportunityId):undefined;
  return e.outcome==='opportunity'?(row?<button type="button" onClick={()=>onOpportunity(row.card.id)}><Tag tone="amber">{$tj("变成机会{0}",{0:row.card.no?` ${oppNo(row.card)}`:''})}</Tag></button>:<Tag tone="amber">{$t("变成机会")}</Tag>)
   :e.outcome==='normal'?<Tag tone="grey">{$t("数字回到正常")}</Tag>:e.outcome==='ignored'?<Tag tone="slate">{$t("你忽略了")}</Tag>:<Tag tone="grey">{e.outcome==='expired'?$t("到期 · 无需处理"):$t("无需处理")}</Tag>;};
 return <div className="flex flex-col gap-3">
  <p className="text-sm text-muted-foreground">{$t("AI 建议观察的变化。每天的分析按“判断条件”重新评估：满足就转为机会或结束观察；到截止日期必须给出“建议处理”或“无需处理”。")} <Link className="nr-link" to="/rules">{$t("看分析规则")}</Link></p>
  {items.length?<div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[48rem] table-fixed border-collapse text-sm" aria-label={$t("观察中",undefined,"tab")}>
   <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="w-[36%] px-4 py-2 text-left font-normal">{$t("变化")}</th><th className="w-[17%] px-3 py-2 text-left font-normal">{$t("数值")}</th><th className="px-3 py-2 text-left font-normal">{$t("判断条件")}</th><th className="w-28 px-3 py-2 text-left font-normal">{$t("截止日期")}</th><th className="w-20 px-3 py-2"><span className="sr-only">{$t("操作")}</span></th></tr></thead>
   <tbody>{items.map(w=>{const c=chipOf(w.s);return <tr key={w.s.key} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" data-watch={w.s.key} onClick={()=>onOpen(w.s.key)}>
    <td className="px-4 py-2.5"><button type="button" className="block w-full min-w-0 text-left" onClick={e=>{e.stopPropagation();onOpen(w.s.key);}}><span className="flex items-center gap-2 font-medium"><span className="truncate">{titleOf(w.s)}</span>{c?<Tag tone={c.tone}>{c.text}</Tag>:null}</span>
     <span className="block truncate text-xs text-muted-foreground">{getSourceNames()[w.s.source]||w.s.source} · <span data-watched={w.days}>{watchedLabel(w.days)}</span></span></button></td>
    <td className="px-3 py-2.5 tabular-nums" data-start-now=""><Values w={w}/></td>
    <td className="px-3 py-2.5" data-condition=""><span className="line-clamp-2">{w.record?.waitingFor?w.record.waitingFor:w.status.reason?<span className="text-muted-foreground">{$t("AI 理由：{0}",{0:w.status.reason})}</span>:'—'}</span></td>
    <td className="px-3 py-2.5 tabular-nums" data-deadline=""><Deadline w={w}/></td>
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
// 已处理: the opportunities decided (newest first) and the changes that need nothing; search by title or number (a search
// finds the pending opportunities too), filter by where each went.
type Settled={s:Signal;status:ReturnType<typeof statusOf>};
function DoneTable({rows,changes,busy,onOpen,onOpenChange,onRestore,onRestoreChange}:{rows:Item[];changes:Settled[];busy:boolean;onOpen:(r:Item)=>void;onOpenChange:(key:string)=>void;onRestore:(r:Item)=>void;onRestoreChange:(key:string)=>void}){
 const [q,setQ]=useState(''),[dest,setDest]=useState<Dest|''>('');
 const key=q.trim().toLowerCase().replace(/\s+/g,'');
 const match=(title:string,no?:number)=>!key||title.toLowerCase().includes(key)||Boolean(no&&[`o-${no}`,`o${no}`,String(no)].includes(key));
 const opps=rows.filter(r=>(key||destOf(r)!=='pending')&&(!dest||destOf(r)===dest)&&match(r.card.title,r.card.no))
  .sort((a,b)=>(b.card.no||0)-(a.card.no||0)||String(b.firstSeenAt).localeCompare(String(a.firstSeenAt)));
 const changeDest=(c:Settled):Dest=>c.status.next==='task'?'task':c.status.ignored?'ignored':'skip';
 const shown=changes.filter(c=>(!dest||changeDest(c)===dest)&&match(titleOf(c.s)));
 const tag=(r:Item)=>{const d=destOf(r);return d==='pending'?<Tag tone="amber" dot>{$t("待处理")}</Tag>:d==='task'?<Tag tone="blue" dot>{$tj("已交给 Agent{0}",{0:r.taskNo?` · ${taskNo(r.taskNo)}`:''})}</Tag>:<Tag tone="grey" dot>{d==='ignored'?$t("已忽略"):$t("已过期")}</Tag>;};
 const changeTag=(c:Settled)=>{const d=changeDest(c);return d==='task'?<Tag tone="blue" dot>{$t("已交给 Agent")}</Tag>:d==='ignored'?<Tag tone="grey" dot>{$t("已忽略")}</Tag>:<Tag tone="slate" dot>{$t("无需处理")}</Tag>;};
 return <div className="flex flex-col gap-3">
  <div className="flex flex-wrap items-center gap-2"><label className="relative flex min-w-48 flex-1 items-center sm:max-w-80"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label={$t("搜索机会")} value={q} onChange={e=>setQ(e.target.value)} placeholder={$t("按标题或编号搜索，如 O-27")} className="w-full pl-8!"/></label>
   <select aria-label={$t("按去向筛选")} value={dest} onChange={e=>setDest(e.target.value as Dest|'')} className="min-w-28">{getDestinations().map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
  {opps.length||shown.length?<div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[40rem] table-fixed border-collapse text-sm" aria-label={$t("已处理")}>
   <colgroup><col className="w-20"/><col/><col className="w-48"/><col className="w-28"/><col className="w-24"/></colgroup>
   <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{[$t("编号"),$t("标题"),$t("去向"),$t("首次发现")].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}<th><span className="sr-only">{$t("操作")}</span></th></tr></thead>
   <tbody>{opps.map(r=><tr key={r.card.id} data-opportunity-id={r.card.id} className={cn('cursor-pointer border-t transition-colors hover:bg-muted/40',r.state==='archived'&&'text-muted-foreground')} onClick={()=>onOpen(r)}>
    <td className="px-3 py-2.5"><No row={r}/></td>
    <td className="px-3 py-2.5"><button type="button" className="block w-full truncate text-left font-medium hover:underline" onClick={e=>{e.stopPropagation();onOpen(r);}}>{r.card.title}</button></td>
    <td className="px-3 py-2.5">{tag(r)}</td>
    <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{day(r.firstSeenAt)}</td>
    <td className="px-2 py-2.5 text-right" onClick={e=>e.stopPropagation()}>{r.state==='archived'&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>onRestore(r)}>{$t("恢复")}</Button>}</td>
   </tr>)}
   {shown.map(c=>{const chip=chipOf(c.s);return <tr key={c.s.key} data-change={c.s.key} className="cursor-pointer border-t text-muted-foreground transition-colors hover:bg-muted/40" onClick={()=>onOpenChange(c.s.key)}>
    <td className="px-3 py-2.5 text-xs">—</td>
    <td className="px-3 py-2.5"><button type="button" className="flex w-full min-w-0 items-center gap-2 text-left hover:underline" onClick={e=>{e.stopPropagation();onOpenChange(c.s.key);}}><span className="truncate">{titleOf(c.s)}</span>{chip?<Tag tone={chip.tone}>{chip.text}</Tag>:null}</button></td>
    <td className="px-3 py-2.5">{changeTag(c)}</td>
    <td className="px-3 py-2.5 text-xs tabular-nums">—</td>
    <td className="px-2 py-2.5 text-right" onClick={e=>e.stopPropagation()}>{c.status.ignored&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>onRestoreChange(c.s.key)}>{$t("恢复")}</Button>}</td>
   </tr>;})}</tbody></table></div>
  :<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{key||dest?$t("没有匹配的条目。"):$t("还没有处理过的机会。交给 Agent、忽略或 AI 判断无需处理的会出现在这里。")}</p>}
 </div>;
}
function Block({title,children}:{title:string;children:ReactNode}){return <div className="flex flex-col gap-1.5"><h3 className="text-xs font-medium text-muted-foreground">{title}</h3>{children}</div>;}
type Member={id:string;name:string};
function Detail({row,playbooks,busy,latest,members,me,onGive,onIgnore,onRestore,onOpen}:{row:Item;playbooks?:PlaybookList;busy:boolean;latest?:string;members:Member[];me?:string;onGive:(playbookId?:string,ownerId?:string)=>void;onIgnore:()=>void;onRestore:()=>void;onOpen:()=>void}){
 const signals=[...citedSignals(row)].sort((a,b)=>b.strength-a.strength),c=leadChip(row);
 const [playbookId,setPlaybookId]=useState<string>();const pb=playbooks?.playbooks.find(p=>p.id===playbookId)||recommendedFor(row,playbooks?.playbooks);
 const [ownerId,setOwnerId]=useState<string>(),owner=ownerId||me,ownerName=members.find(m=>m.id===owner)?.name;
 // The steps you check read with the owner's name when it is someone else.
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
  {/* 2026-10-08 (user: 建议做法 and 交给谁做 read alike, and the second named a 做法, not who): the AI's suggestion is just
      that; 交给谁做 names who first — the local Agent — then the 做法 it follows and where you check. */}
  <Block title={$t("AI 的建议")}><p className="text-sm leading-relaxed">{row.card.suggestion}</p></Block>
  {row.state==='pending'&&pb&&<Block title={$t("交给谁做")}>
   {/* 2026-10-08 (user): a person in charge and the Agent; each field a label over its control, like the blocks above. */}
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs text-muted-foreground">{$t("负责人")}</span>
     <select aria-label={$t("负责人")} value={owner||''} onChange={e=>setOwnerId(e.target.value)} disabled={!members.length}>{!owner&&<option value="">{$t("未指定")}</option>}{members.map(m=><option key={m.id} value={m.id}>{m.id===me?$t("{0}（你）",{0:m.name}):m.name}</option>)}</select>
     <small className="text-xs text-muted-foreground">{$t("方案和发布由负责人把关")}</small></label>
    <div className="flex flex-col gap-1.5 text-sm" data-executor=""><span className="text-xs text-muted-foreground">{$t("执行者")}</span><span className="flex items-center gap-2 py-1"><ActorAvatar type="agent" size="xs"/>{$t("Agent")}</span></div>
   </div>
   <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs text-muted-foreground">{$t("做法")}</span>
    <select aria-label={$t("做法")} value={pb.id} onChange={e=>setPlaybookId(e.target.value)}>{playbooks!.playbooks.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <StepChips stages={stagesFor(pb)} owner={owner&&owner!==me?ownerName:null}/>
  </Block>}
  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
   {row.state==='pending'&&<><Button disabled={busy} onClick={()=>onGive(pb?.id,owner)}>{handOffLabel(pb?.kind)}</Button><Button variant="ghost" disabled={busy} onClick={onIgnore}>{$t("忽略")}</Button><span className="ml-auto text-xs text-muted-foreground">{owner&&owner!==me&&ownerName?$t("由 {0} 把关",{0:ownerName}):handOffNote(pb?.kind)}</span></>}
   {row.state==='task'&&<Button variant="outline" onClick={onOpen}>{$tj("打开任务{0}",{0:row.taskNo?` ${taskNo(row.taskNo)}`:''})}<ArrowRightIcon/></Button>}
   {row.state==='archived'&&<Button variant="outline" disabled={busy} onClick={onRestore}>{$t("恢复到待处理")}</Button>}
  </div>
  {row.card.limitation&&<p className="nr-footnote -mt-2">{$tj("限制：{0}",{0:row.card.limitation})}</p>}
 </section>;
}
