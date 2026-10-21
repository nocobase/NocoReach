import { useMessageState, $t, $tj, $legacyText, $legacyFragment } from "#i18n";
import {useEffect,useState,type ReactNode} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {ArrowRightIcon,ExternalLinkIcon,EyeIcon,LightbulbIcon,RotateCcwIcon,SearchIcon} from 'lucide-react';
import {PageContainer,PageHeader} from '#components/reach/page';
import {Tag,type Tone} from '#components/reach/tag';
import {InfoTip} from '#components/reach/info-tip';
import {EmptyState} from '#components/reach/states';
import {formatDate} from '#lib/format';
import {refreshNavBadges} from '#components/app-shell/nav-badges';
import {Button} from '#components/ui/button';
import {Sheet,SheetContent,SheetHeader,SheetTitle} from '#components/ui/sheet';
import {cn} from '#lib/utils';
import {useProject,type Project} from '../reach-data';
import {request} from './service';
import type {StrategyState} from './model';
import {rowsFor,opportunityState,opportunityKeepDays,citedSignals,reasonLine,priorityRank,sourcesOf,oppNo,taskNo,getSourceNames,type OpportunityState,type Row} from './board';
import {chipOf,titleOf,statusOf,ChangeDetail,watchedLabel} from './insights-view';
import {verdictsOf,watchDays,watchOf,recentlyEnded,daysBetween} from './watch';
import {taskRecords} from '../reach-data';
import type {Signal,WatchRecord} from './model';
import {handOff,handOffLabel,handOffResult,recommendedFor,HandOffNotice,type HandOffResult} from './hand-off';
import {playbookRequest,localizePlaybookList,type PlaybookList} from '../playbook-model';
import {ResultSourcePanel} from '../results/source.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#components/ui/select';
// The same three groups as 洞察's 今天的变化 (2026-10-08 user request): 待处理, 观察中, 已处理.
type Tab='pending'|'watch'|'done';
const getTabs = (): [Tab,string][] => ([['pending',$t('common.pending')],['watch',$t('tasks.watchingTab',undefined)],['done',$t('strategy.handled')]]);
type Dest='pending'|'task'|'ignored'|'expired'|'skip';
const getDestinations = (): [Dest|'',string][] => ([['',$t('strategy.anywhere')],['task',$t('strategy.handedOffAgent')],['ignored',$t('strategy.dismissed')],['expired',$t('strategy.expired')],['skip',$t('common.noActionNeeded')]]);
const day=(iso?:string)=>formatDate(iso);
type Item=Row&{state:OpportunityState;reason?:string};
const destOf=(r:Item):Dest=>r.state==='task'?'task':r.state==='archived'?(r.reason==='ignored'?'ignored':'expired'):'pending';
// The coloured fact of an opportunity: its strongest cited signal's tag (as on 洞察).
const leadChip=(r:Row)=>{const s=[...citedSignals(r)].sort((a,b)=>b.strength-a.strength).map(chipOf).find(Boolean);return s||null;};
const No=({row}:{row:Row})=>row.card.no?<span className="font-mono text-xs text-muted-foreground tabular-nums">{oppNo(row.card)}</span>:null;
// 机会 (SPEC §5): 待处理 — the undecided ones, list left and a read-only detail right (2026-10-21); 观察中 — the changes the AI advised watching
// (2026-10-08), with the days watched; 已处理 — the opportunities decided (handed off, ignored, expired) and the latest
// analysis's changes that need nothing (无需处理, ignored, or handed off on their own), as one table. A search there finds
// every opportunity, the pending ones too. A pending row opens in Pending; any other row or change slides in its detail
// on this page, a handed-off one with a link to its task (UI review 2026-10-21). A link to one item (?item=) opens it the same way.
export default function OpportunityLibrary(){
 const {project,error:projectError}=useProject();return <Library key={project?.id||'loading'} project={project} projectError={projectError}/>;
}
function Library({project,projectError}:{project?:Project;projectError:string}){
 const navigate=useNavigate();const [params,setParams]=useSearchParams();
 const [state,setState]=useState<StrategyState>(),[rawPlaybooks,setRawPlaybooks]=useState<PlaybookList>(),[error,setError]=useMessageState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState<HandOffResult>(),[tasks,setTasks]=useState<WatchTask[]>([]),[watchKey,setWatchKey]=useState<string>();
 const playbooks=localizePlaybookList(rawPlaybooks);
 useEffect(()=>{if(!project)return;void request<StrategyState>(project.id,'state').then(s=>{setState(s);setError('');}).catch(()=>setError(() => ($t('strategy.notLoadOpportunitiesTryAgain'))));void playbookRequest<PlaybookList>('list',project.id).then(setRawPlaybooks).catch(()=>undefined);void taskRecords<WatchTask>(project.id).then(setTasks).catch(()=>undefined);},[project?.id]);
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
 async function decideWatch(key:string,status:'ignored'|'pending'){if(!state||!project||busy)return;setBusy(true);try{setState(await request<StrategyState>(project.id,'decideSignal',{signalKey:key,status,revision:state.revision,requestId:crypto.randomUUID()}));setError('');setWatchKey(undefined);refreshNavBadges();}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('strategy.notSaveRefreshTryAgain')));}finally{setBusy(false);}}
 // 已处理 also lists the latest analysis's changes that need nothing — 无需处理, ignored, or handed off without an
 // opportunity — except those an opportunity already stands for (that one is listed instead).
 const cited=new Set(rows.flatMap(r=>citedSignals(r).map(x=>x.key)));
 const settled=judged.filter(x=>!cited.has(x.s.key)&&(x.status.next==='task'||x.status.verdict==='skip'||Boolean(x.status.ignored)));
 const watched=watching.find(x=>x.s.key===watchKey)||settled.find(x=>x.s.key===watchKey);
 function go(next:{tab?:string;item?:string}){const p=new URLSearchParams(params);for(const [k,v] of Object.entries(next)){if(v)p.set(k,v);else p.delete(k);}setParams(p,{replace:true});}
 async function decide(row:Row,status:'ignored'|'pending'){if(!state||!project||busy)return;setBusy(true);setNotice(undefined);try{setState(await request<StrategyState>(project.id,'reviewOpportunity',{insightId:row.card.id,status,revision:state.revision,requestId:crypto.randomUUID()}));setError('');go({item:''});refreshNavBadges();}catch{setError(() => ($t('strategy.notSaveRefreshTryAgain')));}finally{setBusy(false);}}
 // 交给 Agent with the recommended 做法 and you as the owner; both can still change on the task before it starts.
 async function give(row:Row){if(!state||!project||busy)return;setBusy(true);setNotice(undefined);const pb=recommendedFor(row,playbooks?.playbooks);
  try{const r=await handOff(project.id,state,row,pb?.id);setState(r.state);setError('');go({item:''});refreshNavBadges();
   setNotice(handOffResult(row,r,pb?.kind));}
  catch{setError(() => ($t('strategy.notHandOffOpportunityKept')));}finally{setBusy(false);}}
 function openRow(r:Item){if(r.state==='pending')go({tab:'pending',item:r.card.id});else go({item:r.card.id});}
 const detail=(r:Item)=><Detail key={r.card.id} row={r} busy={busy} onGive={()=>void give(r)} onIgnore={()=>void decide(r,'ignored')} onRestore={()=>void decide(r,'pending')} onOpen={()=>navigate(`/actions/${r.taskId}`)}/>;
 return <PageContainer className="nr-page"><PageHeader title={$t('strategy.opportunitiesTitle',undefined)} description={$t('strategy.thingsWorthDoingWhatChanged')}/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}
  <HandOffNotice result={notice}/>
  <nav className="nr-tabs" aria-label={$t('strategy.opportunityCategory')}>{getTabs().map(([k,v])=><button key={k} aria-pressed={tab===k} onClick={()=>go({tab:k,item:''})}>{v}{state?` ${k==='pending'?pending.length:k==='watch'?watching.length:rows.length-pending.length+settled.length}`:''}</button>)}</nav>
  {!state?<p role="status" className="text-sm text-muted-foreground">{$t('strategy.loadingOpportunities')}</p>:tab==='done'?<DoneTable rows={rows} changes={settled} busy={busy} onOpen={openRow} onOpenChange={setWatchKey} onRestore={r=>void decide(r,'pending')} onRestoreChange={k=>void decideWatch(k,'pending')}/>
  :tab==='watch'?<WatchList items={watching} ended={ended} rows={rows} busy={busy} onOpen={setWatchKey} onIgnore={k=>void decideWatch(k,'ignored')} onRestore={k=>void decideWatch(k,'pending')} onOpportunity={id=>go({tab:'pending',item:id})}/>
  :!pending.length?<EmptyState icon={<LightbulbIcon/>} title={$t('strategy.noPendingOpportunities')} description={$t('strategy.pendingAppearAfterAnalysis')}/>
  :<div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
   <div className="flex flex-col gap-2">
    {pending.map(r=>{const c=leadChip(r);return <button key={r.card.id} type="button" aria-current={selected?.card.id===r.card.id} onClick={()=>go({item:r.card.id})}
     className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-left text-card-foreground transition-colors hover:border-ring aria-[current=true]:border-primary aria-[current=true]:ring-1 aria-[current=true]:ring-primary">
     <span className="line-clamp-2 text-sm font-medium"><No row={r}/>{r.card.no?' ':''}{r.card.title}</span>
     <span className="line-clamp-2 text-xs text-muted-foreground">{reasonLine(r)}</span>
     <span className="flex flex-wrap items-center gap-1">{c&&<Tag tone={c.tone}>{c.text}</Tag>}{sourcesOf(r).map(s=><Tag key={s} tone="grey">{s}</Tag>)}{r.card.change==='new'&&<Tag tone="blue">{$t('strategy.new')}</Tag>}</span>
    </button>;})}
   </div>
   {selected&&detail(selected)}
  </div>}
  {watched&&project&&state?<ChangeDetail signal={watched.s} status={watched.status} projectId={project.id} verdicts={verdictsOf(state,watched.s.key)} watch={watchOf(state,watched.s.key)} today={state.insights?.generatedAt} judging={busy} onDecide={status=>void decideWatch(watched.s.key,status)} onClose={()=>setWatchKey(undefined)} onHandOff={r=>{refreshNavBadges();setNotice(r);void request<StrategyState>(project.id,'state').then(setState).catch(()=>undefined);}}/>:null}
  <Sheet open={Boolean(opened)} onOpenChange={o=>{if(!o)go({item:''});}}>
   <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-lg" aria-describedby={undefined}><SheetHeader className="sr-only"><SheetTitle>{$t('strategy.opportunityDetails')}</SheetTitle></SheetHeader><div className="p-4 pt-12">{opened&&detail(opened)}</div></SheetContent>
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
function Values({w}:{w:Watching}){const now=chipOf(w.s)?.text||'—',start=w.record?.startChip?.text&&$legacyFragment(w.record.startChip.text);
 const second=w.record?(w.days<=1?$t('strategy.startedToday'):start?(start===now?$t('strategy.startedUnchanged',{0:start}):$t('strategy.started',{0:start,1:short(w.record.since)})):''):'';
 return <><span className="block">{$t('strategy.now',{0:now})}</span>{second?<span className="block text-xs text-muted-foreground">{second}</span>:null}</>;}
function Deadline({w}:{w:Watching}){const d=w.record?.decideBy;if(!d)return <span className="text-muted-foreground">{$t('strategy.setNextAnalysis')}</span>;
 const left=Math.round((Date.parse(d.slice(0,10))-Date.parse(localDay()))/86400000);
 return <><span className="block">{short(d)}</span><span className="block text-xs text-muted-foreground">{left>0?$t('strategy.daysLeft',{0:left}):$t('strategy.dueToday')}</span></>;}
function WatchList({items,ended,rows,busy,onOpen,onIgnore,onRestore,onOpportunity}:{items:Watching[];ended:WatchRecord[];rows:Item[];busy:boolean;onOpen:(key:string)=>void;onIgnore:(key:string)=>void;onRestore:(key:string)=>void;onOpportunity:(id:string)=>void}){
 const outcome=(w:WatchRecord)=>{const e=w.ended!,row=e.opportunityId?rows.find(r=>r.card.id===e.opportunityId):undefined;
  return e.outcome==='opportunity'?(row?<button type="button" onClick={()=>onOpportunity(row.card.id)}><Tag tone="amber">{$tj('strategy.becameOpportunityValue',{0:row.card.no?` ${oppNo(row.card)}`:''})}</Tag></button>:<Tag tone="amber">{$t('strategy.becameOpportunity')}</Tag>)
   :e.outcome==='normal'?<Tag tone="grey">{$t('strategy.backNormal')}</Tag>:e.outcome==='ignored'?<Tag tone="slate">{$t('strategy.ignored')}</Tag>:<Tag tone="grey">{e.outcome==='expired'?$t('strategy.deadlineNoActionNeeded'):$t('common.noActionNeeded')}</Tag>;};
 return <div className="flex flex-col gap-3">
  {items.length?<div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[48rem] table-fixed border-collapse text-sm" aria-label={$t('tasks.watchingTab',undefined)}>
   <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="w-[36%] px-4 py-2 text-left font-normal"><span className="inline-flex items-center gap-1">{$t('common.change')}<InfoTip label={$t('strategy.howWatchingWorks')}><p>{$t('strategy.watchLifecycleHelp')} <Link className="nr-link" to="/rules">{$t('strategy.seeAnalysisRules')}</Link></p></InfoTip></span></th><th className="w-[17%] px-3 py-2 text-left font-normal">{$t('strategy.value')}</th><th className="px-3 py-2 text-left font-normal">{$t('strategy.decisionCondition')}</th><th className="w-28 px-3 py-2 text-left font-normal">{$t('strategy.deadline')}</th><th className="w-20 px-3 py-2"><span className="sr-only">{$t('common.actions')}</span></th></tr></thead>
   <tbody>{items.map(w=>{return <tr key={w.s.key} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" data-watch={w.s.key} onClick={()=>onOpen(w.s.key)}>
    <td className="px-4 py-2.5"><button type="button" className="block w-full min-w-0 text-left" onClick={e=>{e.stopPropagation();onOpen(w.s.key);}}><span className="block truncate font-medium">{titleOf(w.s)}</span>
     <span className="block truncate text-xs text-muted-foreground">{getSourceNames()[w.s.source]||w.s.source} · <span data-watched={w.days}>{watchedLabel(w.days)}</span></span></button></td>
    <td className="px-3 py-2.5 tabular-nums" data-start-now=""><Values w={w}/></td>
    <td className="px-3 py-2.5" data-condition=""><span className="line-clamp-2">{w.record?.waitingFor?w.record.waitingFor:w.status.reason?<span className="text-muted-foreground">{$t('strategy.aiReason',{0:w.status.reason})}</span>:'—'}</span></td>
    <td className="px-3 py-2.5 tabular-nums" data-deadline=""><Deadline w={w}/></td>
    <td className="px-3 py-2.5 text-right"><Button size="sm" variant="ghost" disabled={busy} onClick={e=>{e.stopPropagation();onIgnore(w.s.key);}}>{$t('common.ignore')}</Button></td>
   </tr>;})}</tbody></table></div>
  :<EmptyState icon={<EyeIcon/>} title={$t('strategy.nothingWatchedRightNow')} description={$t('strategy.watchEmptyDescription')}/>}
  {ended.length?<section className="flex flex-col gap-2" aria-label={$t('strategy.recentlyEnded')}><h2 className="text-sm font-semibold">{$t('strategy.recentlyEnded')} <span className="text-xs font-normal text-muted-foreground">{$t('common.last7Days')}</span></h2>
   <ul className="divide-y rounded-lg border bg-card">{ended.map(w=><li key={w.key} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm" data-ended={w.ended!.outcome}>
    <span className="min-w-0 flex-1"><span className="block truncate">{$legacyText(w.startTitle)}</span>{w.ended!.reason?<span className="block truncate text-xs text-muted-foreground">{w.ended!.reason}</span>:null}</span>
    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{$t('strategy.watchedDays',{0:daysBetween(w.since,w.ended!.at)})}</span>{outcome(w)}
    {w.ended!.outcome==='ignored'?<Button size="sm" variant="ghost" disabled={busy} onClick={()=>onRestore(w.key)}>{$t('strategy.restore')}</Button>:null}
   </li>)}</ul></section>:null}
 </div>;
}
// 已处理: the opportunities decided (newest first) and the changes that need nothing; search by title or number (a search
// finds the pending opportunities too), filter by where each went.
type Settled={s:Signal;status:ReturnType<typeof statusOf>};
const RestoreButton=({busy,onClick}:{busy:boolean;onClick:()=>void})=><Button size="icon-sm" variant="ghost" className="-my-1.5" disabled={busy} aria-label={$t('strategy.restore')} title={$t('strategy.restore')} onClick={onClick}><RotateCcwIcon/></Button>;
function DoneTable({rows,changes,busy,onOpen,onOpenChange,onRestore,onRestoreChange}:{rows:Item[];changes:Settled[];busy:boolean;onOpen:(r:Item)=>void;onOpenChange:(key:string)=>void;onRestore:(r:Item)=>void;onRestoreChange:(key:string)=>void}){
 const [q,setQ]=useState(''),[dest,setDest]=useState<Dest|''>('');
 const key=q.trim().toLowerCase().replace(/\s+/g,'');
 const match=(title:string,no?:number)=>!key||title.toLowerCase().includes(key)||Boolean(no&&[`o-${no}`,`o${no}`,String(no)].includes(key));
 const opps=rows.filter(r=>(key||destOf(r)!=='pending')&&(!dest||destOf(r)===dest)&&match(r.card.title,r.card.no))
  .sort((a,b)=>(b.card.no||0)-(a.card.no||0)||String(b.firstSeenAt).localeCompare(String(a.firstSeenAt)));
 const changeDest=(c:Settled):Dest=>c.status.next==='task'?'task':c.status.ignored?'ignored':'skip';
 const shown=changes.filter(c=>(!dest||changeDest(c)===dest)&&match(titleOf(c.s)));
 const tag=(r:Item)=>{const d=destOf(r);return d==='pending'?<Tag tone="amber" dot>{$t('common.pending')}</Tag>:d==='task'?<Tag tone="blue" dot>{$tj('strategy.handedOffAgentValue',{0:r.taskNo?` · ${taskNo(r.taskNo)}`:''})}</Tag>:<Tag tone="grey" dot>{d==='ignored'?$t('strategy.dismissed'):$t('strategy.expired')}</Tag>;};
 const changeTag=(c:Settled)=>{const d=changeDest(c);return d==='task'?<Tag tone="blue" dot>{$t('strategy.handedOffAgent')}</Tag>:d==='ignored'?<Tag tone="grey" dot>{$t('strategy.dismissed')}</Tag>:<Tag tone="slate" dot>{$t('common.noActionNeeded')}</Tag>;};
 return <div className="flex flex-col gap-3">
  <div className="flex flex-wrap items-center gap-2"><label className="relative flex min-w-48 flex-1 items-center sm:max-w-80"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label={$t('strategy.searchOpportunities')} value={q} onChange={e=>setQ(e.target.value)} placeholder={$t('strategy.searchTitleNumberLikeO')} className="w-full pl-8!"/></label>
   <Select value={dest||'all'} onValueChange={v=>setDest((v==='all'?'':v) as Dest|'')}><SelectTrigger className="w-full sm:w-40" aria-label={$t('strategy.filterWhereWent')}><SelectValue>{(v:string)=>getDestinations().find(([k])=>(k||'all')===v)?.[1]??v}</SelectValue></SelectTrigger><SelectContent className="w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal">{getDestinations().map(([k,v])=><SelectItem key={k||'all'} value={k||'all'}>{v}</SelectItem>)}</SelectContent></Select></div>
  {opps.length||shown.length?<div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[40rem] table-fixed border-collapse text-sm" aria-label={$t('strategy.handled')}>
   <colgroup><col className="w-20"/><col/><col className="w-48"/><col className="w-28"/><col className="w-12"/></colgroup>
   <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{[$t('common.identifier'),$t('common.title'),$t('strategy.whereWent'),$t('strategy.firstFound')].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}<th><span className="sr-only">{$t('common.actions')}</span></th></tr></thead>
   <tbody>{opps.map(r=><tr key={r.card.id} data-opportunity-id={r.card.id} className={cn('cursor-pointer border-t transition-colors hover:bg-muted/40',r.state==='archived'&&'text-muted-foreground')} onClick={()=>onOpen(r)}>
    <td className="px-3 py-2.5"><No row={r}/></td>
    <td className="px-3 py-2.5"><button type="button" className="block w-full truncate text-left font-medium hover:underline" onClick={e=>{e.stopPropagation();onOpen(r);}}>{r.card.title}</button></td>
    <td className="px-3 py-2.5">{tag(r)}</td>
    <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{day(r.firstSeenAt)}</td>
    <td className="px-2 py-2.5 text-right" onClick={e=>e.stopPropagation()}>{r.state==='archived'&&<RestoreButton busy={busy} onClick={()=>onRestore(r)}/>}</td>
   </tr>)}
   {shown.map(c=>{const chip=chipOf(c.s);return <tr key={c.s.key} data-change={c.s.key} className="cursor-pointer border-t text-muted-foreground transition-colors hover:bg-muted/40" onClick={()=>onOpenChange(c.s.key)}>
    <td className="px-3 py-2.5 text-xs">—</td>
    <td className="px-3 py-2.5"><button type="button" className="flex w-full min-w-0 items-center gap-2 text-left hover:underline" onClick={e=>{e.stopPropagation();onOpenChange(c.s.key);}}><span className="truncate">{titleOf(c.s)}</span>{chip?<Tag tone={chip.tone}>{chip.text}</Tag>:null}</button></td>
    <td className="px-3 py-2.5">{changeTag(c)}</td>
    <td className="px-3 py-2.5 text-xs tabular-nums">—</td>
    <td className="px-2 py-2.5 text-right" onClick={e=>e.stopPropagation()}>{c.status.ignored&&<RestoreButton busy={busy} onClick={()=>onRestoreChange(c.s.key)}/>}</td>
   </tr>;})}</tbody></table></div>
  :<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{key||dest?$t('strategy.nothingMatches'):$t('strategy.nothingHandledYetOpportunitiesHanded')}</p>}
 </div>;
}
// One opportunity, read-only (2026-10-20/21 user decisions: this page says what it is and what to do; who does it and
// with which 做法 is settled on the task after 交给 Agent; the list stays on the left so every opportunity is in sight):
// what happened, why it is worth doing, what to do and where, with the AI's priority, effort and confidence as tags and
// its limits behind ⓘ. A pending one is handed off or ignored, a handed-off one opens its task, an archived one is restored.
const PRIORITY:Record<string,[Tone,()=>string]>={high:['red',()=>$t('strategy.priorityHigh')],medium:['amber',()=>$t('strategy.priorityMedium')],low:['grey',()=>$t('strategy.priorityLow')]};
const EFFORT:Record<string,()=>string>={small:()=>$t('strategy.effortSmall'),medium:()=>$t('strategy.effortMedium'),large:()=>$t('strategy.effortLarge')};
const CONFIDENCE:Record<string,[Tone,()=>string]>={supported:['green',()=>$t('strategy.confidenceSupported')],verify:['amber',()=>$t('strategy.confidenceVerify')]};
function Block({title,children}:{title:string;children:ReactNode}){return <div className="flex flex-col gap-1.5"><h3 className="text-xs font-medium text-muted-foreground">{title}</h3><div className="text-sm leading-relaxed">{children}</div></div>;}
function Detail({row,busy,onGive,onIgnore,onRestore,onOpen}:{row:Item;busy:boolean;onGive:()=>void;onIgnore:()=>void;onRestore:()=>void;onOpen:()=>void}){
 const card=row.card,c=leadChip(row),link=[...citedSignals(row)].sort((a,b)=>b.strength-a.strength).find(s=>s.url);
 const priority=PRIORITY[row.priority],effort=EFFORT[card.effort||''],confidence=CONFIDENCE[card.confidence||''];
 const happened=card.observation||card.reason||card.evidenceText;
 return <article data-opportunity-id={card.id} aria-label={card.title} className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground">
  <div className="flex flex-col gap-1.5">
   {card.resultSource&&<ResultSourcePanel source={card.resultSource}/>}
   <div className="flex flex-wrap items-center gap-1">{c&&<Tag tone={c.tone}>{c.text}</Tag>}{sourcesOf(row).map(s=><Tag key={s} tone="grey">{s}</Tag>)}{priority&&<Tag tone={priority[0]}>{priority[1]()}</Tag>}{effort&&<Tag tone="grey">{effort()}</Tag>}{confidence&&<Tag tone={confidence[0]}>{confidence[1]()}</Tag>}</div>
   <h2 className="flex flex-wrap items-baseline gap-2 text-lg font-semibold leading-snug"><No row={row}/><span>{card.title}</span></h2>
   <p className="nr-footnote">{card.resultSource?$t('results.manualConfirmed',{0:day(row.firstSeenAt)}):$tj('strategy.firstFoundValue',{0:day(row.firstSeenAt),1:row.state==='pending'?$t('strategy.analysis',{0:day(row.batch.generatedAt)}):row.state==='task'?$t('strategy.handedOffAgentValue',{0:row.taskNo?$t('strategy.task',{0:taskNo(row.taskNo)}):''}):row.reason==='ignored'?$t('strategy.dismissedLaterAnalysesCannotSuggest'):row.reason==='replaced'?$t('strategy.expiredRaisedAgain'):$t('strategy.expiredLatestAnalysisNotSuggest',{0:opportunityKeepDays})})}</p>
  </div>
  {happened&&<Block title={$t('strategy.briefWhatHappened')}>{happened}{link?.url&&<a className="ml-1 inline-flex align-middle text-muted-foreground hover:text-foreground" href={link.url} target="_blank" rel="noreferrer" aria-label={$t('strategy.openPage',{0:titleOf(link)})}><ExternalLinkIcon className="size-3.5"/></a>}</Block>}
  {card.meaning&&<Block title={$t('strategy.briefWhyWorthDoing')}>{card.meaning}{card.priorityReason&&<span className="mt-1 block text-xs text-muted-foreground">{card.priorityReason}</span>}</Block>}
  {card.suggestion&&<Block title={$t('strategy.briefWhatToDo')}>{card.suggestion}</Block>}
  {card.target?.trim()&&<Block title={$t('strategy.briefWhere')}><span className="break-words">{card.target}</span></Block>}
  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
   {row.state==='pending'&&<><Button disabled={busy} onClick={onGive}>{handOffLabel()}</Button><Button variant="ghost" disabled={busy} onClick={onIgnore}>{$t('common.ignore')}</Button></>}
   {row.state==='task'&&<Button variant="outline" onClick={onOpen}>{$tj('strategy.openTask',{0:row.taskNo?` ${taskNo(row.taskNo)}`:''})}<ArrowRightIcon/></Button>}
   {row.state==='archived'&&<Button variant="outline" disabled={busy} onClick={onRestore}>{$t('strategy.restorePending')}</Button>}
   {card.limitation&&<span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">{$t('strategy.briefLimitation')}<InfoTip label={$t('strategy.briefLimitation')} side="left"><p>{card.limitation}</p></InfoTip></span>}
  </div>
 </article>;
}
