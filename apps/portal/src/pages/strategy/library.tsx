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
import {rowsFor,opportunityState,citedSignals,reasonLine,priorityRank,sourcesOf,oppNo,taskNo,type OpportunityState,type Row} from './board';
import {chipOf,titleOf} from './insights-view';
import {handOff,handOffLabel,handOffNote,handOffResult,recommendedFor,HandOffNotice,type HandOffResult} from './hand-off';
import {playbookRequest,stagesFor,stageExecutor,type PlaybookList} from '../playbook-model';
type Tab='pending'|'all';
const tabs:[Tab,string][]=[['pending','待处理'],['all','全部']];
type Dest='pending'|'task'|'ignored'|'expired';
const destinations:[Dest|'',string][]=[['','全部去向'],['pending','待处理'],['task','已交给 Agent'],['ignored','已忽略'],['expired','已过期']];
const day=(iso?:string)=>iso?new Date(iso).toLocaleDateString():'—';
type Item=Row&{state:OpportunityState;reason?:string};
const destOf=(r:Item):Dest=>r.state==='task'?'task':r.state==='archived'?(r.reason==='ignored'?'ignored':'expired'):'pending';
// The coloured fact of an opportunity: its strongest cited signal's tag (as on 洞察).
const leadChip=(r:Row)=>{const s=[...citedSignals(r)].sort((a,b)=>b.strength-a.strength).map(chipOf).find(Boolean);return s||null;};
const No=({row}:{row:Row})=>row.card.no?<span className="font-mono text-xs text-muted-foreground tabular-nums">{oppNo(row.card)}</span>:null;
// 机会 (SPEC §5): 待处理 — the undecided ones, list left and detail right; 全部 — every opportunity ever raised as one table.
// A row in 全部 goes where the opportunity is now: 待处理 opens there, a handed-off one opens its task, an archived one
// slides in its detail. A link to one item (?item=) opens it the same way, except a handed-off one shows its detail.
export default function OpportunityLibrary(){
 const {project,error:projectError}=useProject(),navigate=useNavigate();const [params,setParams]=useSearchParams();
 const [state,setState]=useState<StrategyState>(),[playbooks,setPlaybooks]=useState<PlaybookList>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState<HandOffResult>();
 useEffect(()=>{if(!project)return;void request<StrategyState>(project.id,'state').then(s=>{setState(s);setError('');}).catch(()=>setError('机会读取失败，请重试。'));void playbookRequest<PlaybookList>('list',project.id).then(setPlaybooks).catch(()=>undefined);},[project?.id]);
 const rows:Item[]=state?rowsFor(state).map(r=>({...r,...opportunityState(r,state)})):[];
 const linked=rows.find(r=>r.card.id===params.get('item'));
 const asked=params.get('tab');
 const tab:Tab=asked==='pending'||asked==='all'?asked:asked==='task'||asked==='archived'?'all':linked&&linked.state!=='pending'?'all':'pending';
 const pending=rows.filter(r=>r.state==='pending').sort((a,b)=>(priorityRank[a.priority]??3)-(priorityRank[b.priority]??3)||String(b.firstSeenAt).localeCompare(String(a.firstSeenAt)));
 const selected=pending.find(r=>r.card.id===params.get('item'))||pending[0];
 const opened=tab==='all'?linked:undefined;
 function go(next:{tab?:string;item?:string}){const p=new URLSearchParams(params);for(const [k,v] of Object.entries(next)){if(v)p.set(k,v);else p.delete(k);}setParams(p,{replace:true});}
 async function decide(row:Row,status:'ignored'|'pending'){if(!state||!project||busy)return;setBusy(true);setNotice(undefined);try{setState(await request<StrategyState>(project.id,'reviewOpportunity',{insightId:row.card.id,status,revision:state.revision,requestId:crypto.randomUUID()}));setError('');go({item:''});refreshNavBadges();}catch{setError('保存失败，请刷新后重试。');}finally{setBusy(false);}}
 async function give(row:Row,playbookId?:string){if(!state||!project||busy)return;setBusy(true);setNotice(undefined);
  try{const r=await handOff(project.id,state,row,playbookId);setState(r.state);setError('');go({item:''});refreshNavBadges();
   setNotice(handOffResult(row,r,(playbooks?.playbooks.find(p=>p.id===playbookId)||recommendedFor(row,playbooks?.playbooks))?.kind));}
  catch{setError('没能交出去，机会仍保留，请稍后重试。');}finally{setBusy(false);}}
 function openRow(r:Item){if(r.state==='pending')go({tab:'pending',item:r.card.id});else if(r.state==='task'&&r.taskId)navigate(`/actions/${r.taskId}`);else go({item:r.card.id});}
 const detail=(r:Item)=><Detail key={r.card.id} row={r} playbooks={playbooks} busy={busy} latest={state?.insights?.generatedAt} onGive={id=>void give(r,id)} onIgnore={()=>void decide(r,'ignored')} onRestore={()=>void decide(r,'pending')} onOpen={()=>navigate(`/actions/${r.taskId}`)}/>;
 return <PageContainer className="nr-page"><PageHeader title="机会" description="数据变化里值得做的事。交给 Agent 去做，或者忽略。"/>
  {(error||projectError)&&<p role="alert" className="nr-error">{error||projectError}</p>}
  <HandOffNotice result={notice}/>
  <nav className="nr-tabs" aria-label="机会分类">{tabs.map(([k,v])=><button key={k} aria-pressed={tab===k} onClick={()=>go({tab:k,item:''})}>{v}{state?` ${k==='pending'?pending.length:rows.length}`:''}</button>)}</nav>
  {!state?<p role="status" className="text-sm text-muted-foreground">正在读取机会…</p>:tab==='all'?<AllTable rows={rows} busy={busy} onOpen={openRow} onRestore={r=>void decide(r,'pending')}/>
  :<div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
   <div className="flex flex-col gap-2">
    {pending.map(r=>{const c=leadChip(r);return <button key={r.card.id} type="button" aria-current={selected?.card.id===r.card.id} onClick={()=>go({item:r.card.id})}
     className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-left text-card-foreground transition-colors hover:border-ring aria-[current=true]:border-primary aria-[current=true]:ring-1 aria-[current=true]:ring-primary">
     <span className="line-clamp-2 text-sm font-medium"><No row={r}/>{r.card.no?' ':''}{r.card.title}</span>
     <span className="line-clamp-2 text-xs text-muted-foreground">{reasonLine(r)}</span>
     <span className="flex flex-wrap items-center gap-1">{c&&<Tag tone={c.tone}>{c.text}</Tag>}{sourcesOf(r).map(s=><Tag key={s} tone="grey">{s}</Tag>)}{r.card.change==='new'&&<Tag tone="blue">新</Tag>}</span>
    </button>;})}
    {!pending.length&&<p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">今天没有新的机会。数据变化不明显时，不必为了凑数而行动。</p>}
   </div>
   {selected&&detail(selected)}
  </div>}
  <Sheet open={Boolean(opened)} onOpenChange={o=>{if(!o)go({item:''});}}>
   <SheetContent className="w-full overflow-y-auto sm:max-w-lg" aria-describedby={undefined}><SheetHeader className="sr-only"><SheetTitle>机会详情</SheetTitle></SheetHeader><div className="p-4 pt-12">{opened&&detail(opened)}</div></SheetContent>
  </Sheet>
 </PageContainer>;
}
// 全部: every opportunity ever raised, newest first; search by title or number, filter by where it went.
function AllTable({rows,busy,onOpen,onRestore}:{rows:Item[];busy:boolean;onOpen:(r:Item)=>void;onRestore:(r:Item)=>void}){
 const [q,setQ]=useState(''),[dest,setDest]=useState<Dest|''>('');
 const key=q.trim().toLowerCase().replace(/\s+/g,'');
 const visible=rows.filter(r=>(!dest||destOf(r)===dest)&&(!key||r.card.title.toLowerCase().includes(key)||(r.card.no&&[`o-${r.card.no}`,`o${r.card.no}`,String(r.card.no)].includes(key))))
  .sort((a,b)=>(b.card.no||0)-(a.card.no||0)||String(b.firstSeenAt).localeCompare(String(a.firstSeenAt)));
 const tag=(r:Item)=>{const d=destOf(r);return d==='pending'?<Tag tone="amber" dot>待处理</Tag>:d==='task'?<Tag tone="blue" dot>已交给 Agent{r.taskId?` · ${taskNo(r.taskId)}`:''}</Tag>:<Tag tone="grey" dot>{d==='ignored'?'已忽略':'已过期'}</Tag>;};
 return <div className="flex flex-col gap-3">
  <div className="flex flex-wrap items-center gap-2"><label className="relative flex min-w-48 flex-1 items-center sm:max-w-80"><SearchIcon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true"/><input aria-label="搜索机会" value={q} onChange={e=>setQ(e.target.value)} placeholder="按标题或编号搜索，如 O-27" className="w-full pl-8!"/></label>
   <select aria-label="按去向筛选" value={dest} onChange={e=>setDest(e.target.value as Dest|'')} className="min-w-28">{destinations.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
  {visible.length?<div className="relative overflow-x-auto rounded-lg border bg-card"><table className="w-full min-w-[40rem] table-fixed border-collapse text-sm" aria-label="全部机会">
   <colgroup><col className="w-20"/><col/><col className="w-48"/><col className="w-28"/><col className="w-24"/></colgroup>
   <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['编号','标题','去向','首次发现'].map(h=><th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}<th><span className="sr-only">操作</span></th></tr></thead>
   <tbody>{visible.map(r=><tr key={r.card.id} data-opportunity-id={r.card.id} className={cn('cursor-pointer border-t transition-colors hover:bg-muted/40',r.state==='archived'&&'text-muted-foreground')} onClick={()=>onOpen(r)}>
    <td className="px-3 py-2.5"><No row={r}/></td>
    <td className="px-3 py-2.5"><button type="button" className="block w-full truncate text-left font-medium hover:underline" onClick={e=>{e.stopPropagation();onOpen(r);}}>{r.card.title}</button></td>
    <td className="px-3 py-2.5">{tag(r)}</td>
    <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{day(r.firstSeenAt)}</td>
    <td className="px-2 py-2.5 text-right" onClick={e=>e.stopPropagation()}>{r.state==='archived'&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>onRestore(r)}>恢复</Button>}</td>
   </tr>)}</tbody></table></div>
  :<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{key||dest?'没有匹配的机会。':'还没有机会。每日分析发现值得做的事后会出现在这里。'}</p>}
 </div>;
}
function Block({title,children}:{title:string;children:ReactNode}){return <div className="flex flex-col gap-1.5"><h3 className="text-xs font-medium text-muted-foreground">{title}</h3>{children}</div>;}
function Detail({row,playbooks,busy,latest,onGive,onIgnore,onRestore,onOpen}:{row:Item;playbooks?:PlaybookList;busy:boolean;latest?:string;onGive:(playbookId?:string)=>void;onIgnore:()=>void;onRestore:()=>void;onOpen:()=>void}){
 const signals=[...citedSignals(row)].sort((a,b)=>b.strength-a.strength),c=leadChip(row);
 const [playbookId,setPlaybookId]=useState<string>();const pb=playbooks?.playbooks.find(p=>p.id===playbookId)||recommendedFor(row,playbooks?.playbooks);
 return <section className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-label="机会详情">
  <div className="flex flex-col gap-1.5">
   <div className="flex flex-wrap items-center gap-1">{c&&<Tag tone={c.tone}>{c.text}</Tag>}{sourcesOf(row).map(s=><Tag key={s} tone="grey">{s}</Tag>)}</div>
   <h2 className="flex flex-wrap items-baseline gap-2 text-lg font-semibold leading-snug"><No row={row}/><span>{row.card.title}</span></h2>
   <p className="nr-footnote">{day(row.firstSeenAt)} 首次发现 · {row.state==='pending'?`来自 ${day(latest)} 的分析`:row.state==='task'?`已交给 Agent${row.taskId?`，任务 ${taskNo(row.taskId)}`:''}`:row.reason==='ignored'?'已忽略，之后的分析不会再提出':'已过期：最新的分析没有再提出'}</p>
  </div>
  <Block title="数据变化">{signals.length?<ul className="flex flex-col divide-y">{signals.map(s=>{const sc=chipOf(s);return <li key={s.key} className="flex items-center gap-2 py-1.5 text-sm" title={s.facts.join('；')}>
    <span className="min-w-0 flex-1">{titleOf(s)}</span>{sc&&<Tag tone={sc.tone}>{sc.text}</Tag>}
    {s.url&&<a className="text-muted-foreground hover:text-foreground" href={s.url} target="_blank" rel="noreferrer" aria-label={`打开页面：${titleOf(s)}`}><ExternalLinkIcon className="size-3.5"/></a>}</li>;})}</ul>
   :<p className="text-sm">{row.card.evidenceText||row.card.observation}</p>}</Block>
  <Block title="建议做法"><p className="text-sm leading-relaxed">{row.card.suggestion}</p></Block>
  {row.state==='pending'&&pb&&<Block title="交给谁做">
   <div className="flex flex-wrap items-center gap-2 text-sm"><select aria-label="做法" value={pb.id} onChange={e=>setPlaybookId(e.target.value)} className="font-medium">{playbooks!.playbooks.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="text-xs text-muted-foreground">做法</span></div>
   <ol className="flex flex-wrap items-center gap-1" aria-label="步骤">{stagesFor(pb).map((s,i)=><li key={s.key} className="flex items-center gap-1">{i>0&&<ChevronRightIcon className="size-3 text-muted-foreground" aria-hidden="true"/>}
    <Tag tone={s.kind==='review'?'violet':'grey'}>{s.kind==='review'?`你${s.name}`:s.kind==='agent'||s.kind==='ai'?`${stageExecutor[s.kind]} ${s.name}`:s.name}</Tag></li>)}</ol>
  </Block>}
  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
   {row.state==='pending'&&<><Button disabled={busy} onClick={()=>onGive(pb?.id)}>{handOffLabel(pb?.kind)}</Button><Button variant="ghost" disabled={busy} onClick={onIgnore}>忽略</Button><span className="ml-auto text-xs text-muted-foreground">{handOffNote(pb?.kind)}</span></>}
   {row.state==='task'&&<Button variant="outline" onClick={onOpen}>打开任务{row.taskId?` ${taskNo(row.taskId)}`:''}<ArrowRightIcon/></Button>}
   {row.state==='archived'&&<Button variant="outline" disabled={busy} onClick={onRestore}>恢复到待处理</Button>}
  </div>
  {row.card.limitation&&<p className="nr-footnote -mt-2">限制：{row.card.limitation}</p>}
 </section>;
}
