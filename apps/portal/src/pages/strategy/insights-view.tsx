import { $t, $tj } from "@/i18n";
import {useEffect,useRef,useState,type ReactElement} from 'react';
import {useNavigate} from 'react-router';
import {BellIcon,ArrowRightIcon,BotIcon,ChevronRightIcon,SparklesIcon} from 'lucide-react';
import {AiMark} from '@/components/reach/actor';
import {judgeMissing,judgeSignal} from './service';
import {Button} from '@/components/ui/button';
import {Section} from '@/components/reach/page';
import {Tag,type Tone} from '@/components/reach/tag';
import {citedSignals,reasonLine,rowsFor,opportunityState,sourceNames,type Row} from './board';
import type {StrategyState,Signal} from './model';
import {effectItems,effectLine,effectPages,latestEffect} from '../effect-model';
import {isClosed,workState,type Work} from '../task-execution-types';
import {DetailDrawer} from '../detail-drawer';
import {DraftHandOffDialog,type TaskDraft} from '../keyword-hand-off';
import type {HandOffResult} from './hand-off';
// 洞察 building blocks (SPEC §5): numbers and changes first, one line each; no paragraphs.
export type Metric={key:string;label:string;value:number|null;previous:number|null;complete:boolean;change:number|null};
export type SourceCard={id:string;cutoff:string|null;window:{start:string;end:string;days:number};metrics:Metric[];series:{date:string;value:number|null}[];seriesBy?:Record<string,{date:string;value:number|null}[]>};
type Task={id:number;title:string;status:string;updatedAt?:string;evidence?:{work?:Work}};
// The one coloured fact of a change (server-computed; read from the wording for signals stored before chips existed).
export function chipOf(s:Signal):{tone:Tone;text:string}|null{
 if(s.chip)return {tone:s.chip.tone as Tone,text:$t(s.chip.text)};
 const t=s.title,f=s.facts.join(' '),m=(re:RegExp,src=t)=>src.match(re);let x;
 if((x=m(/(上升|增加|增长)\s*\+?(\d+(?:\.\d+)?%)/)))return {tone:'green',text:`↑ ${x[2]}`};
 if((x=m(/(下降|减少)\s*-?(\d+(?:\.\d+)?%)/)))return {tone:'red',text:`↓ ${x[2]}`};
 if((x=m(/是平时的 ([\d.]+) 倍/)))return {tone:'green',text:$t("↑ {0} 倍",{0:x[1]})};
 if((x=m(/平均排名 ([\d.]+)/)))return {tone:'blue',text:$t("排名 {0}",{0:x[1]})};
 if((x=m(/其中 (\d+) 个未标记为已解决/)))return {tone:'amber',text:$t("{0} 个未解决",{0:x[1]})};
 if((x=m(/(\d+) 个主题无人回复/)))return {tone:'amber',text:$t("{0} 个无人回复",{0:x[1]})};
 if((x=m(/(\d+) 个主题/)))return {tone:'amber',text:$t("{0} 个主题",{0:x[1]})};
 if((x=m(/已 (\d+) 个月未更新/)))return {tone:'amber',text:$t("{0} 个月未更新",{0:x[1]})};
 if(/内容很短/.test(t))return {tone:'amber',text:(x=m(/正文约 (\d+) 字/,f))?$t("正文 {0} 字",{0:x[1]}):$t("内容很短")};
 if(/曝光多、点击少/.test(t))return {tone:'amber',text:$t("点击少")};
 if(/访问多但关键事件少/.test(t))return {tone:'amber',text:$t("关键事件少")};
 if(/分类讨论增加/.test(t)&&(x=m(/近 14 天 (\d+) 个主题，此前 14 天 (\d+) 个/,f)))return {tone:'green',text:`↑ ${+x[2]?$t("{0} 倍",{0:((+x[1]/+x[2]).toFixed(1))}):$t("{0} 个",{0:(x[1])})}`};
 if(/正式版/.test(t))return {tone:'violet',text:$t("新版本")};
 if(/预发布/.test(t))return {tone:'violet',text:$t("预发布")};
 return null;
}
export const titleOf=(s:Signal)=>$t(s.title.replace(/(下降|减少)\s*-(\d)/,'$1 $2').replace(/(上升|增加)\s*\+(\d)/,'$1 $2'));
const pct=(n:number)=>`${Math.abs(n)>=0.095?Math.round(Math.abs(n)*100):(Math.abs(n)*100).toFixed(1)}%`;
function Sparkline({points,change}:{points:{value:number|null}[];change?:number|null}):ReactElement|null{
 const v=points.map(p=>p.value).filter((x):x is number=>x!==null);if(v.length<2)return null;
 const min=Math.min(...v),max=Math.max(...v),span=max-min||1,step=100/(points.length-1);
 const d=points.map((p,i)=>p.value===null?null:`${(i*step).toFixed(1)},${(18-((p.value-min)/span)*16).toFixed(1)}`).filter(Boolean).join(' ');
 return <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="h-5 w-full" aria-hidden="true"><polyline points={d} fill="none" stroke={change==null||change===0?'var(--muted-foreground)':change>0?'var(--nr-ink-green)':'var(--nr-ink-red)'} strokeWidth="1.2" vectorEffect="non-scaling-stroke"/></svg>;
}
// One tile per connected source (2026-10-03: every source, not four): search, visits and key events, then GitHub stars,
// downloads, forum topics, Hacker News and Reddit when connected; each opens its page.
export function KpiCards({cards}:{cards?:SourceCard[]}):ReactElement{
 const navigate=useNavigate(),by=new Map((cards||[]).map(c=>[c.id,c]));
 const pick=(c:SourceCard|undefined,key:string)=>({m:c?.metrics.find(x=>x.key===key),s:c?.seriesBy?.[key]||(c?.metrics[0]?.key===key?c.series:undefined)});
 const gsc=by.get('gsc'),ga4=by.get('ga4');
 const items=[{label:$t("搜索点击"),...pick(gsc,'clicks'),to:'/seo-opportunities'},{label:$t("搜索曝光"),...pick(gsc,'impressions'),to:'/seo-opportunities'},{label:$t("访问次数"),...pick(ga4,'sessions'),to:'/website'},{label:$t("关键事件"),...pick(ga4,'conversions'),to:'/website/conversion'},
  ...([['github','stars',$t("新增 Star"),'/data/github'],['packages','downloads',$t("下载量"),'/data/downloads'],['discourse','topics',$t("论坛新主题"),'/data/community'],['mentions','mentions',$t("Hacker News 提及"),'/data/hackernews'],['reddit','posts',$t("Reddit 新帖"),'/data/reddit']] as const).flatMap(([id,key,label,to])=>by.get(id)?[{label,...pick(by.get(id),key),s:by.get(id)!.series,to}]:[])];
 return <section className="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-4" aria-label={$t("关键指标")}>{items.map(({label,m,s,to})=>{const up=(m?.change??0)>=0;
  return <button key={label} type="button" onClick={()=>navigate(to)} className="flex flex-col gap-1 rounded-lg border bg-card p-4 text-left text-card-foreground transition-colors hover:border-ring">
   <span className="text-xs text-muted-foreground">{label}</span>
   <span className="font-heading text-2xl font-semibold tabular-nums">{m?.value==null?'—':`${label===$t("新增 Star")&&m.value>0?'+':''}${m.value.toLocaleString()}`}</span>
   <span className="text-xs">{m?.change==null?<span className="text-muted-foreground">{m?.value==null?$t("暂无数据"):$t("暂无对比")}</span>:<span className={up?'text-nr-ink-green':'text-nr-ink-red'}>{up?'↑':'↓'} {pct(m.change)}</span>}</span>
   {s&&<Sparkline points={s} change={m?.change}/>}
  </button>;})}</section>;
}
// 需要留意 (was 各方面一览): the state of each connected source (server: nrInsights:summary), each opening its page.
// 2026-10-08 (user: beside the metric cards, a second grid of number tiles left no telling which to look at): the metric
// cards are the only big numbers on the page; this is a quiet list, one sentence per line with its numbers in bold, then
// where it comes from. Lines to deal with (amber or red) come first with an amber dot; the rest are grey.
export type AreaItem={key:string;text:string;values:string[];source:string;detail?:string;to:string;tone?:Tone};
export type Area={id:string;title:string;items:AreaItem[]};
export function AreaList({areas}:{areas?:Area[]}):ReactElement|null{
 const navigate=useNavigate(),all=(areas||[]).flatMap(a=>a.items.map(i=>({...i,area:a.id,attention:i.tone==='amber'||i.tone==='red'})));if(!all.length)return null;
 const items=[...all.filter(i=>i.attention),...all.filter(i=>!i.attention)];
 return <Section title={$t("需要留意",undefined,"heading")}><ul className="divide-y">{items.map(i=><li key={`${i.area}:${i.key}`}>
  <button type="button" onClick={()=>navigate(i.to)} title={i.detail?$t(i.detail):undefined} className="flex w-full items-start gap-2.5 py-2 text-left hover:opacity-80" data-area={i.area} data-item={i.key} data-attention={i.attention||undefined}>
   <span className={`mt-1.5 size-2 shrink-0 rounded-full ${i.attention?'bg-nr-ink-amber':'bg-muted-foreground/40'}`} aria-hidden="true"/>
   <span className="min-w-0 flex-1">
    <span className={`block text-sm ${i.attention?'':'text-muted-foreground'}`}>{$tj(i.text,Object.fromEntries(i.values.map((v,k)=>[k,<b key={k} className="font-semibold text-foreground tabular-nums">{v}</b>])))}</span>
    <span className="block truncate text-xs text-muted-foreground">{[$t(i.source),i.detail?$t(i.detail):''].filter(Boolean).join(' · ')}</span>
   </span>
   <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>
  </button></li>)}</ul></Section>;
}
// The rule signals of the latest analysis, largest first, each with what happened to it (2026-10-05 user feedback: rows
// with a button on some and nothing on others, then a bare “—”, read as unfinished). Every change gets the AI's verdict
// in the daily analysis — 值得做 (and an opportunity), 先观察 or 不用做, with a reason — or what came after it: 已交给
// Agent, 已忽略. The detail shows the data, the verdict and one next step; a change from an older analysis without a
// verdict can be judged on the spot.
type Status={label:string;tone:Tone;next:'opportunity'|'task'|'hand'|'judge';row?:Row;taskId?:number;reason?:string;why:string;earlier?:{id:number;no?:number;state:'done'|'closed'}};
type ChangeTask={id:number;status:string;evidence?:{no?:number;work?:Work}};
const SOURCE_PAGE:Record<string,string>={gsc:'/seo-opportunities',ga4:'/website',site:'/content',github:'/data/github','github-traffic':'/data/github',discourse:'/data/community',packages:'/data/downloads',hackernews:'/data/hackernews',reddit:'/data/reddit',x:'/data/x',discord:'/data/discord',slack:'/data/slack',trends:'/trends',competitors:'/research/domain',rank:'/keywords?tab=tracking','ai-search':'/ai-search'};
const pageOf=(s:Signal)=>s.key.startsWith('audit-')?'/audit':SOURCE_PAGE[s.source];
const PLAYBOOK:Record<string,string>={technical:'tech-fix',optimize:'optimize-page',create:'content-outline'};
// Tones follow the shared colour table: 值得做 waits for you (amber), a task in progress is blue, not yet / watching grey,
// not doing slate.
const VERDICT={do:{label:$t("值得做"),tone:'amber',why:$t("AI 判断值得做")},watch:{label:$t("先观察"),tone:'grey',why:$t("AI 判断先观察，下次分析再看")},skip:{label:$t("不用做"),tone:'slate',why:$t("AI 判断不用做")}} as const;
function changeDraft(s:Signal,reason?:string):TaskDraft{return {title:titleOf(s).slice(0,200),objective:$t("处理这个变化：{0}",{0:titleOf(s)}).slice(0,1000),brief:[$t("洞察里的最新变化（{0}）：{1}",{0:sourceNames[s.source]||s.source,1:titleOf(s)}),...s.facts.map(f=>`- ${f}`),...(s.url?[$t("相关页面：{0}",{0:s.url})]:[]),...(reason?[$t("AI 的判断：{0}",{0:reason})]:[]),'',$t("建议：先核对数据和受影响的页面，再给出具体改法；需要改网站时开 PR 给人审核。")].join('\n').slice(0,20000),signalKey:s.key};}
// A change keeps its key from day to day (the same 278 duplicate titles), so tasks handed off weeks ago still point at it:
// only a task still open counts as 处理中; a finished or closed one is mentioned, and today's verdict decides again.
export function statusOf(s:Signal,state:StrategyState,tasks:ChangeTask[]):Status{
 const rows=rowsFor(state).filter(r=>citedSignals(r).some(x=>x.key===s.key)),review=state.insights?.signalReviews?.[s.key];
 const ids=[...new Set([...rows.map(r=>r.taskId),...state.proposals.filter(p=>p.signalKey===s.key).map(p=>p.taskId)].filter((x):x is number=>Boolean(x)))];
 const linked=ids.map(id=>tasks.find(t=>t.id===id)).filter((t):t is ChangeTask=>Boolean(t)).map(t=>({id:t.id,no:t.evidence?.no,state:isClosed(t.evidence?.work)?'closed' as const:workState(t.evidence?.work,t.status)==='done'?'done' as const:'open' as const}));
 const open=linked.find(t=>t.state==='open'),last=linked.filter(t=>t.state!=='open').sort((a,b)=>b.id-a.id)[0],earlier=last?{id:last.id,no:last.no,state:last.state as 'done'|'closed'}:undefined;
 if(open)return {label:$t("处理中"),tone:'blue',next:'task',taskId:open.id,why:$t("任务{0} 正在处理它。",{0:open.no?` T-${open.no}`:''})};
 const pending=rows.find(r=>opportunityState(r,state).state==='pending');
 if(pending)return {label:$t("值得做"),tone:'amber',next:'opportunity',row:pending,reason:review?.reason,earlier,why:$t("AI 判断值得做，已经写成机会，在机会里决定交给 Agent 还是忽略。")};
 if(rows.some(r=>opportunityState(r,state).reason==='ignored'&&r.batch===state.insights))return {label:$t("已忽略"),tone:'slate',next:'hand',earlier,why:$t("对应的机会你忽略了；改主意可以直接交给 Agent。")};
 if(review)return {...VERDICT[review.verdict],next:'hand',reason:review.reason,earlier,why:review.verdict==='do'?$t("AI 判断值得做，这次没有单独写成机会；可以直接交给 Agent。"):$t("{0}；你不同意可以仍然交给 Agent。",{0:VERDICT[review.verdict].why})};
 return {label:$t("等判断"),tone:'grey',next:'judge',why:$t("这次分析还没有给这条变化下结论。"),earlier};
}
// 今天的变化 (2026-10-08 user request; replaces 今天值得做的事 and 最新变化, which listed the same things twice): one list
// of the latest analysis, grouped by the AI's verdict. 值得做 first — each pending opportunity with the change it rests on
// and 交给 Agent / 忽略, then changes judged worth doing without an opportunity of their own, then those already in
// progress; then 先观察 (the first five) and, folded, 不用做 and 已忽略. Any row opens the change's detail.
type Group='do'|'watch'|'skip';
type Entry={key:string;group:Group;rank:number;title:string;sub:string;chip:{tone:Tone;text:string}|null;signal?:Signal;row?:Row;status?:Status};
const WATCH_SHOWN=5;
export function TodayChanges({state,tasks,rows,projectId,busy,labelOf,convert,ignore,empty,onHandOff,onState}:{state:StrategyState;tasks:ChangeTask[];rows:Row[];projectId:number;busy:boolean;labelOf:(r:Row)=>string;convert:(r:Row)=>void;ignore:(r:Row)=>void;empty:string;onHandOff:(r:HandOffResult)=>void;onState:()=>void}):ReactElement{
 const navigate=useNavigate(),[openKey,setOpenKey]=useState<string>(),[handing,setHanding]=useState<{s:Signal;reason?:string}>(),[judging,setJudging]=useState(false),[error,setError]=useState(''),[more,setMore]=useState<Record<'watch'|'skip',boolean>>({watch:false,skip:false});
 const signals=[...(state.insights?.evidence.signals?.items||[])].sort((a,b)=>b.strength-a.strength);
 const open=signals.find(s=>s.key===openKey),st=open?statusOf(open,state,tasks):undefined,page=open?pageOf(open):undefined;
 // A change nobody judged yet (an analysis from before every change got a verdict) is judged once, at once, in the
 // background: the row reads “AI 判断中” meanwhile; only if that fails does it offer 让 AI 现在判断 by hand.
 const missing=signals.filter(s=>statusOf(s,state,tasks).next==='judge').length,asked=useRef(''),[auto,setAuto]=useState<'running'|'failed'|''>('');
 useEffect(()=>{const batch=state.insights?.generatedAt||'';if(!missing||asked.current===batch)return;asked.current=batch;setAuto('running');void judgeMissing(projectId).then(()=>{setAuto('');onState();}).catch(()=>setAuto('failed'));},[state.insights?.generatedAt,missing]);
 const shown=(x:Status):Status=>x.next==='judge'&&auto==='running'?{...x,label:$t("AI 判断中")}:x;
 const judge=async(s:Signal)=>{setJudging(true);setError('');try{await judgeSignal(projectId,s.key);onState();}catch(e){setError(e instanceof Error?e.message:$t("没有判断出来，请再试一次"));}finally{setJudging(false);}};
 const cited=new Set(rows.flatMap(r=>citedSignals(r).map(s=>s.key)));
 const entries:Entry[]=[...rows.map((r,i):Entry=>{const lead=citedSignals(r)[0];return {key:`o:${r.card.id}`,group:'do',rank:i,title:r.card.title,sub:lead?`${sourceNames[lead.source]||lead.source} · ${titleOf(lead)}`:reasonLine(r),chip:lead?chipOf(lead):null,signal:lead,row:r};}),
  ...signals.filter(s=>!cited.has(s.key)).map((s,i):Entry=>{const x=shown(statusOf(s,state,tasks)),worth=x.next==='hand'&&x.label===$t("值得做");
   const group:Group=worth||x.next==='opportunity'||x.next==='task'?'do':x.label===$t("不用做")||x.label===$t("已忽略")?'skip':'watch';
   return {key:s.key,group,rank:group==='do'?(worth?100:x.next==='opportunity'?200:300)+i:i,title:titleOf(s),sub:[sourceNames[s.source]||s.source,x.reason].filter(Boolean).join(' · '),chip:chipOf(s),signal:s,status:x};})];
 const by=(g:Group)=>entries.filter(e=>e.group===g).sort((a,b)=>a.rank-b.rank),todo=by('do'),watch=by('watch'),skip=by('skip');
 const item=(e:Entry)=><li key={e.key} className="flex items-center gap-3 py-2" data-change={e.signal?.key} data-opportunity-id={e.row?.card.id}>
  <button type="button" className="min-w-0 flex-1 text-left hover:opacity-80" onClick={()=>{if(e.signal){setOpenKey(e.signal.key);setError('');}else if(e.row)navigate(`/opportunities?item=${encodeURIComponent(e.row.card.id)}`);}}>
   <span className="flex items-center gap-2 text-sm font-medium"><span className="truncate">{e.title}</span>{e.chip?<Tag tone={e.chip.tone}>{e.chip.text}</Tag>:null}</span>
   <span className="block truncate text-xs text-muted-foreground">{e.sub}</span></button>
  {e.row?<><Button size="sm" variant="outline" disabled={busy} onClick={()=>convert(e.row!)}>{labelOf(e.row)}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>ignore(e.row!)}>{$t("忽略")}</Button></>
   :e.status?.next==='hand'&&e.status.label===$t("值得做")&&e.signal?.actionable?<Button size="sm" variant="outline" onClick={()=>setHanding({s:e.signal!,reason:e.status?.reason})}>{$t("交给 Agent")}</Button>
   :e.status?<span className="flex w-[6.5rem] shrink-0 justify-end"><Tag tone={e.status.tone} dot>{e.status.label}</Tag></span>:null}
 </li>;
 const head=(label:string,n:number)=><p className="pt-3 text-xs font-medium text-muted-foreground first:pt-0">{$tj("{0} {1}",{0:label,1:n})}</p>;
 const total=entries.length;
 return <Section title={$t("今天的变化")} count={total||undefined} actions={<Button size="sm" variant="ghost" onClick={()=>navigate('/opportunities')}>{$t("全部机会")}<ArrowRightIcon/></Button>}>
  {total?<div>
   {todo.length?<>{head($t("值得做"),todo.length)}<ul className="divide-y">{todo.map(item)}</ul></>:null}
   {watch.length?<>{head($t("先观察"),watch.length)}<ul className="divide-y">{(more.watch?watch:watch.slice(0,WATCH_SHOWN)).map(item)}</ul>
    {watch.length>WATCH_SHOWN&&!more.watch?<Button size="sm" variant="ghost" onClick={()=>setMore(m=>({...m,watch:true}))}>{$t("再看 {0} 条",{0:watch.length-WATCH_SHOWN})}</Button>:null}</>:null}
   {skip.length?(more.skip?<>{head($t("不用做"),skip.length)}<ul className="divide-y">{skip.map(item)}</ul></>
    :<Button size="sm" variant="ghost" className="mt-2" onClick={()=>setMore(m=>({...m,skip:true}))}>{$t("另有 {0} 条不用做",{0:skip.length})}<ChevronRightIcon/></Button>):null}
  </div>:<p className="text-sm text-muted-foreground">{empty}</p>}
  {open&&st?<DetailDrawer open onClose={()=>setOpenKey(undefined)} title={titleOf(open)} description={sourceNames[open.source]||open.source}
   footer={<div className="flex w-full flex-wrap gap-2">
    {st.next==='opportunity'?<Button onClick={()=>navigate(`/opportunities?item=${encodeURIComponent(st.row!.card.id)}`)}>{$t("看机会")}<ArrowRightIcon/></Button>
     :st.next==='task'?<Button onClick={()=>navigate(`/actions/${st.taskId}`)}>{$t("看任务")}<ArrowRightIcon/></Button>
     :st.next==='judge'?<Button disabled={judging} onClick={()=>void judge(open)}><SparklesIcon data-icon="inline-start"/>{judging?$t("AI 正在判断…"):$t("让 AI 现在判断")}</Button>:null}
    {(st.next==='hand'||st.next==='judge')&&open.actionable?<Button variant={st.next==='hand'&&st.label===$t("值得做")?'default':'outline'} onClick={()=>{setHanding({s:open,reason:st.reason});setOpenKey(undefined);}}><BotIcon data-icon="inline-start"/>{st.next==='hand'&&st.label!==$t("值得做")?$t("仍然交给 Agent"):$t("交给 Agent")}</Button>:null}
    {page?<Button variant="outline" onClick={()=>navigate(page)}>{$t("去看数据")}</Button>:null}</div>}>
   <div className="space-y-3 text-sm">
    <div className="flex flex-wrap items-center gap-2"><Tag tone={st.tone} dot>{st.label}</Tag>{(()=>{const c=chipOf(open);return c?<Tag tone={c.tone}>{c.text}</Tag>:null;})()}</div>
    <section className="space-y-1"><h3 className="text-xs font-medium text-muted-foreground">{$t("数据")}</h3><ul className="list-disc space-y-1 pl-5">{open.facts.map(f=><li key={f}>{$t(f)}</li>)}</ul>{open.url?<p><a className="nr-link break-all" href={open.url} target="_blank" rel="noreferrer">{open.url}</a></p>:null}</section>
    <section className="space-y-1"><h3 className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><AiMark label={$t("AI 的判断")}/>{$t("AI 的判断")}</h3><p>{st.reason?`${st.label}：${st.reason}`:st.why}</p>{st.reason?<p className="text-xs text-muted-foreground">{st.why}</p>:null}</section>
    {st.earlier?<p className="text-xs text-muted-foreground">{$t("之前交给过 Agent：")}<button type="button" className="nr-link" onClick={()=>navigate(`/actions/${st.earlier!.id}`)}>{st.earlier.no?`T-${st.earlier.no}`:$t("任务")}</button>{$tj("{0}，这个变化还在。",{0:st.earlier.state==='done'?$t(" 已完成"):$t(" 已关闭")})}</p>:null}
    {error?<p role="alert" className="nr-error">{error}</p>:null}
   </div>
  </DetailDrawer>:null}
  {handing?<DraftHandOffDialog projectId={projectId} draft={changeDraft(handing.s,handing.reason)} playbookId={PLAYBOOK[handing.s.action||'']||'optimize-page'} page={handing.s.url&&handing.s.source==='site'?handing.s.url:undefined} description={$t("这条变化和它的数据写进任务说明，确认后立即开始。")} onClose={()=>setHanding(undefined)} onDone={r=>{setHanding(undefined);onHandOff(r);}}/>:null}
 </Section>;
}
const effectTone:Record<string,Tone>={up:'green',down:'red',flat:'grey',insufficient:'grey'};
export function Effects({tasks}:{tasks:Task[]}):ReactElement{
 const navigate=useNavigate();
 // Kept when empty so the row stays two columns and says what will appear here.
 if(!tasks.length)return <Section title={$t("最近改动的效果")}><p className="text-sm text-muted-foreground">{$t("还没有上线的改动。任务发布后显示改动前后的数字对比。")}</p></Section>;
 return <Section title={$t("最近改动的效果")}><ul className="divide-y">{tasks.map(t=>{const w=t.evidence!.work!,r=latestEffect(w),next=effectItems(w).find(i=>!i.result);
  return <li key={t.id}><button type="button" className="flex w-full items-center gap-3 py-2 text-left" onClick={()=>navigate(`/actions/${t.id}`)}><span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
   {r?<Tag tone={effectTone[r.conclusion]}>{effectLine(r).replace(/(，|, ).*$/,'')}{r.change!==null?` ${r.change>=0?'↑':'↓'} ${Math.round(Math.abs(r.change)*100)}%`:''}</Tag>:<Tag tone="grey">{!effectPages(w).length?$t("没有关联页面"):$t("约 {0} 出结果",{0:next?.expected})}</Tag>}</button></li>;})}</ul></Section>;
}
// Needs-you (§5.4 attention): one line, only when something waits.
export function WaitingStrip({tasks,label}:{tasks:Task[];label:(w?:Work)=>string}):ReactElement|null{
 const navigate=useNavigate();if(!tasks.length)return null;
 return <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-nr-tint-amber px-3 py-2 text-sm text-nr-ink-amber"><BellIcon className="size-4 shrink-0" aria-hidden="true"/><b className="font-medium">{$tj("{0} 件事等你处理",{0:tasks.length})}</b>
  {tasks.slice(0,2).map(t=><button key={t.id} type="button" className="min-w-0 max-w-[24rem] truncate underline-offset-4 hover:underline" onClick={()=>navigate(`/actions/${t.id}`)}>{t.title} · {label(t.evidence?.work)}</button>)}
  <button type="button" className="ml-auto underline-offset-4 hover:underline" onClick={()=>navigate('/actions')}>{$t("查看全部")}</button></div>;
}
