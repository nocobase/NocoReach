import {signalDisposition} from '../../../shared/strategy-pending.js';
import {WAITING_TASKS_URL} from '../task-waiting';
import { useMessageState, getCurrentLocale, $t, $tj, $legacyText, $legacyJsx } from "#i18n";
import {useEffect,useRef,useState,type ReactElement} from 'react';
import {useNavigate} from 'react-router';
import {BellIcon,ArrowRightIcon,BotIcon,ChevronRightIcon,SparklesIcon} from 'lucide-react';
import {AiMark} from '#components/reach/actor';
import {judgeMissing,judgeSignal,request} from './service';
import {Button} from '#components/ui/button';
import {Section} from '#components/reach/page';
import {InfoTip} from '#components/reach/info-tip';
import {Tag,type Tone} from '#components/reach/tag';
import {citedSignals,reasonLine,getSourceNames,type Row} from './board';
import type {StrategyState,Signal,WatchRecord} from './model';
import {type Work} from '../task-execution-types';
import {DetailDrawer} from '../detail-drawer';
import {DraftHandOffDialog,type TaskDraft} from '../keyword-hand-off';
import {SectionHandOff} from '../section-hand-off';
import {AllCheck,RowCheck,useSelection} from '#components/reach/hand-off-slot';
import type {HandOffResult} from './hand-off';
import {verdictsOf,watchDays,watchOf,daysBetween,type Verdict} from './watch';
// 洞察 building blocks (SPEC §5): numbers and changes first, one line each; no paragraphs.
export type Metric={key:string;label:string;value:number|null;previous:number|null;complete:boolean;change:number|null};
export type SourceCard={id:string;cutoff:string|null;window:{start:string;end:string;days:number};metrics:Metric[];series:{date:string;value:number|null}[];seriesBy?:Record<string,{date:string;value:number|null}[]>};
type Task={id:number;title:string;status:string;updatedAt?:string;evidence?:{work?:Work}};
// The one coloured fact of a change (server-computed; read from the wording for signals stored before chips existed).
export function chipOf(s:Signal):{tone:Tone;text:string}|null{
 if(s.chip)return {tone:s.chip.tone as Tone,text:$legacyText(s.chip.text)};
 const t=s.title,f=s.facts.join(' '),m=(re:RegExp,src=t)=>src.match(re);let x;
 if((x=m(/(上升|增加|增长)\s*\+?(\d+(?:\.\d+)?%)/)))return {tone:'green',text:`↑ ${x[2]}`};
 if((x=m(/(下降|减少)\s*-?(\d+(?:\.\d+)?%)/)))return {tone:'red',text:`↓ ${x[2]}`};
 if((x=m(/是平时的 ([\d.]+) 倍/)))return {tone:'green',text:$t('strategy.growthMultiplier',{0:x[1]})};
 if((x=m(/平均排名 ([\d.]+)/)))return {tone:'blue',text:$t('strategy.position',{0:x[1]})};
 if((x=m(/其中 (\d+) 个未标记为已解决/)))return {tone:'amber',text:$t('strategy.unsolved',{0:x[1]})};
 if((x=m(/(\d+) 个主题无人回复/)))return {tone:'amber',text:$t('strategy.unanswered',{0:x[1]})};
 if((x=m(/(\d+) 个主题/)))return {tone:'amber',text:$t('strategy.topics',{0:x[1]})};
 if((x=m(/已 (\d+) 个月未更新/)))return {tone:'amber',text:$t('strategy.notUpdatedMonths',{0:x[1]})};
 if(/内容很短/.test(t))return {tone:'amber',text:(x=m(/正文约 (\d+) 字/,f))?$t('strategy.charactersBodyText',{0:x[1]}):$t('strategy.thinContent')};
 if(/曝光多、点击少/.test(t))return {tone:'amber',text:$t('strategy.fewClicks')};
 if(/访问多但关键事件少/.test(t))return {tone:'amber',text:$t('strategy.fewKeyEvents')};
 if(/分类讨论增加/.test(t)&&(x=m(/近 14 天 (\d+) 个主题，此前 14 天 (\d+) 个/,f)))return {tone:'green',text:`↑ ${+x[2]?$t('strategy.multiplier',{0:((+x[1]/+x[2]).toFixed(1))}):$t('common.itemCount',{0:(x[1])})}`};
 if(/正式版/.test(t))return {tone:'violet',text:$t('common.newRelease')};
 if(/预发布/.test(t))return {tone:'violet',text:$t('strategy.preRelease')};
 return null;
}
export const titleOf=(s:Signal)=>$legacyText(s.title.replace(/(下降|减少)\s*-(\d)/,'$1 $2').replace(/(上升|增加)\s*\+(\d)/,'$1 $2'));
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
 const items=[{label:$t('common.searchClicks'),...pick(gsc,'clicks'),to:'/seo-opportunities'},{label:$t('common.searchImpressions'),...pick(gsc,'impressions'),to:'/seo-opportunities'},{label:$t('strategy.sessions'),...pick(ga4,'sessions'),to:'/website'},{label:$t('common.keyEvents'),...pick(ga4,'conversions'),to:'/website/conversion'},
  ...([['github','stars',$t('common.newStars'),'/data/github'],['packages','downloads',$t('common.downloads'),'/data/downloads'],['discourse','topics',$t('strategy.newForumTopics'),'/data/community'],['mentions','mentions',$t('common.hackerNewsMentions'),'/data/hackernews'],['reddit','posts',$t('strategy.newRedditPosts'),'/data/reddit']] as const).flatMap(([id,key,label,to])=>by.get(id)?[{label,...pick(by.get(id),key),s:by.get(id)!.series,to}]:[])];
 return <section className="grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-4" aria-label={$t('strategy.keyMetrics')}>{items.map(({label,m,s,to})=>{const up=(m?.change??0)>=0;
  return <button key={label} type="button" onClick={()=>navigate(to)} className="flex flex-col gap-1 rounded-lg border bg-card p-4 text-left text-card-foreground transition-colors hover:border-ring">
   <span className="text-xs text-muted-foreground">{label}</span>
   <span className="font-heading text-2xl font-semibold tabular-nums">{m?.value==null?'—':`${label===$t('common.newStars')&&m.value>0?'+':''}${m.value.toLocaleString(getCurrentLocale())}`}</span>
   <span className="text-xs">{m?.change==null?<span className="text-muted-foreground">{m?.value==null?$t('strategy.noDataYet'):$t('strategy.noComparisonYet')}</span>:<span className={up?'text-nr-ink-green':'text-nr-ink-red'}>{up?'↑':'↓'} {pct(m.change)}</span>}</span>
   {s&&<Sparkline points={s} change={m?.change}/>}
  </button>;})}</section>;
}
// 当前状况 (was 各方面一览, then 需要留意 — 2026-10-08 user: “留意” read like the AI's 先观察): how things stand now, as
// against 今天的变化 (what changed) — no comparison and no AI, a problem stays here until it is fixed. The state of each connected source (server: nrInsights:summary), each opening its page.
// 2026-10-08 (user: beside the metric cards, a second grid of number tiles left no telling which to look at): the metric
// cards are the only big numbers on the page; this is a quiet list, one sentence per line with its numbers in bold, then
// where it comes from. Lines to deal with (amber or red) come first with an amber dot; the rest are grey.
export type AreaRow={key:string;title:string;meta?:string;url?:string|null;tag?:{tone:Tone;text:string}};
export type AreaItem={key:string;text:string;values:string[];source:string;detail?:string;to:string;tone?:Tone;rows?:AreaRow[];total?:number;compare?:{label:string;now:string|number;before:string|number}[];handOff?:{playbookId:string;title:string}};
export type Area={id:string;title:string;items:AreaItem[]};
const sentence=(i:AreaItem)=>$legacyText(i.text).replace(/\{(\d+)\}/g,(_,k:string)=>i.values[Number(k)]??'');
export function AreaList({areas,projectId}:{areas?:Area[];projectId:number}):ReactElement|null{
 const navigate=useNavigate(),[openKey,setOpenKey]=useState<string>(),all=(areas||[]).flatMap(a=>a.items.map(i=>({...i,area:a.id,attention:i.tone==='amber'||i.tone==='red'})));if(!all.length)return null;
 const items=[...all.filter(i=>i.attention),...all.filter(i=>!i.attention)],open=items.find(i=>`${i.area}:${i.key}`===openKey);
 // A line with something behind it opens its detail here; one without (AI 搜索还没查过) goes to its page.
 const go=(i:typeof items[number])=>{if(i.rows?.length||i.compare?.length)setOpenKey(`${i.area}:${i.key}`);else navigate(i.to);};
 return <Section aria-label={$t('strategy.whereThingsStand')} title={<>{$t('strategy.whereThingsStand')}<InfoTip label={$t('strategy.statusExplanation')}>{$t('strategy.notWhatChangedHowThings')}</InfoTip></>}><ul className="divide-y">{items.map(i=><li key={`${i.area}:${i.key}`}>
  <button type="button" onClick={()=>go(i)} title={i.detail?$legacyText(i.detail):undefined} className="flex w-full items-start gap-2.5 py-2 text-left hover:opacity-80" data-area={i.area} data-item={i.key} data-attention={i.attention||undefined}>
   <span className={`mt-1.5 size-2 shrink-0 rounded-full ${i.attention?'bg-nr-ink-amber':'bg-muted-foreground/40'}`} aria-hidden="true"/>
   <span className="min-w-0 flex-1">
    <span className={`block text-sm ${i.attention?'':'text-muted-foreground'}`}>{$legacyJsx(i.text,Object.fromEntries(i.values.map((v,k)=>[k,<b key={k} className="font-semibold text-foreground tabular-nums">{v}</b>])))}</span>
    <span className="block truncate text-xs text-muted-foreground">{[$legacyText(i.source),i.detail?$legacyText(i.detail):''].filter(Boolean).join(' · ')}</span>
   </span>
   <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>
  </button></li>)}</ul>
  {open?<AttentionDetail key={openKey} item={open} projectId={projectId} onClose={()=>setOpenKey(undefined)}/>:null}</Section>;
}
// What is behind a 当前状况 line (2026-10-08 user feedback: the line led to a whole page where its own data was hard to
// find): its rows (ticked ones go to the Agent from the top right, the task opening to be confirmed) or this period
// against the one before; then the page with all of it.
function AttentionDetail({item,projectId,onClose}:{item:AreaItem;projectId:number;onClose:()=>void}):ReactElement{
 const navigate=useNavigate(),list=item.rows||[],selection=useSelection(list.map(r=>r.key)),ticked=list.filter(r=>selection.has(r.key)),text=sentence(item);
 const draft=():TaskDraft=>({title:item.handOff!.title.replace('{0}',ticked.map(r=>r.title).join('、').slice(0,120)).slice(0,200),objective:$t('strategy.handleInsightsWorthLook',{0:text}).slice(0,1000),
  brief:[$t('strategy.insightsWhereThingsStand',{0:text,1:$legacyText(item.source),2:item.detail?`，${$legacyText(item.detail)}`:''}),'',...ticked.map(r=>`- ${r.title}${r.meta?`（${$legacyText(r.meta)}）`:''}${r.url?`：${r.url}`:''}`),'',$t('strategy.suggestionCheckDataPagesItems')].join('\n').slice(0,20000)});
 return <DetailDrawer open onClose={onClose} title={text} description={[$legacyText(item.source),item.detail?$legacyText(item.detail):''].filter(Boolean).join(' · ')}
  actions={item.handOff&&list.length?<SectionHandOff projectId={projectId} disabled={!ticked.length} playbookId={item.handOff.playbookId} page={ticked.length===1&&ticked[0].url?ticked[0].url:undefined} label={ticked.length?$t('common.handOffAgentValue',{0:ticked.length}):$t('common.handOffAgent')} draft={draft}/>:undefined}
  footer={<Button variant="outline" onClick={()=>navigate(item.to)}>{$t('strategy.see',{0:$legacyText(item.source)})}<ArrowRightIcon/></Button>}>
  <div className="space-y-3 text-sm" data-attention-detail={item.key}>
   {item.compare?.length?<table className="w-full text-sm" aria-label={$t('strategy.periodLast')}><thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="py-1.5 text-left font-normal"></th><th className="py-1.5 text-right font-normal">{$t('strategy.period')}</th><th className="py-1.5 text-right font-normal">{$t('strategy.lastPeriod')}</th></tr></thead>
    <tbody>{item.compare.map(c=><tr key={c.label} className="border-b last:border-0"><td className="py-1.5">{$legacyText(c.label)}</td><td className="py-1.5 text-right tabular-nums">{c.now}</td><td className="py-1.5 text-right tabular-nums text-muted-foreground">{c.before}</td></tr>)}</tbody></table>:null}
   {list.length?<ul className="divide-y rounded-lg border">
    {item.handOff?<li className="flex items-center gap-3 px-3 py-1.5 text-xs text-muted-foreground"><AllCheck selection={selection} count={list.length}/>{$t('common.select')}</li>:null}
    {list.map(r=><li key={r.key} className="flex items-start gap-3 px-3 py-2" data-row={r.key}>
     {item.handOff?<span className="pt-0.5"><RowCheck selection={selection} k={r.key} label={r.title}/></span>:null}
     <span className="min-w-0 flex-1"><span className="flex items-center gap-2">{r.tag?<Tag tone={r.tag.tone}>{$legacyText(r.tag.text)}</Tag>:null}{r.url?<a className="nr-link truncate" href={r.url} target="_blank" rel="noreferrer">{r.title}</a>:<span className="truncate">{$legacyText(r.title)}</span>}</span>
      {r.meta?<span className="block truncate text-xs text-muted-foreground">{$legacyText(r.meta)}</span>:null}</span>
    </li>)}</ul>:item.compare?.length?null:<p className="text-muted-foreground">{$t('strategy.nothingListRightNow')}</p>}
   {(item.total||0)>list.length?<p className="nr-footnote">{$t('strategy.firstListedHere',{0:item.total,1:list.length})}</p>:null}
  </div>
 </DetailDrawer>;
}
// The rule signals of the latest analysis, largest first, each with what happened to it (2026-10-05 user feedback: rows
// with a button on some and nothing on others, then a bare “—”, read as unfinished). Every change gets the AI's verdict
// in the daily analysis — 建议处理 (and an opportunity), 建议观察 or 无需处理, with a reason — or what came after it: 已交给
// Agent, 已忽略. The detail shows the data, the verdict and one next step; a change from an older analysis without a
// verdict can be judged on the spot.
type Status={label:string;tone:Tone;verdict?:'do'|'watch'|'skip';next:'opportunity'|'task'|'hand'|'judge';row?:Row;taskId?:number;reason?:string;why:string;earlier?:{id:number;no?:number;state:'done'|'closed'};ignored?:boolean;dismissed?:boolean};
type ChangeTask={id:number;status:string;evidence?:{no?:number;work?:Work}};
const SOURCE_PAGE:Record<string,string>={gsc:'/seo-opportunities',ga4:'/website',site:'/content',github:'/data/github','github-traffic':'/data/github',discourse:'/data/community',packages:'/data/downloads',hackernews:'/data/hackernews',reddit:'/data/reddit',x:'/data/x',discord:'/data/discord',slack:'/data/slack',trends:'/trends',competitors:'/research/domain',rank:'/keywords?tab=tracking','ai-search':'/ai-search'};
const pageOf=(s:Signal)=>s.key.startsWith('audit-')?'/audit':SOURCE_PAGE[s.source];
const PLAYBOOK:Record<string,string>={technical:'tech-fix',optimize:'optimize-page',create:'content-outline',reply:'community-reply'};
// The AI's verdicts (2026-10-08 user: one set of words on 洞察 and 机会, less colloquial): 建议处理, 建议观察, 无需处理 —
// written as the AI's advice, apart from your own 忽略. Tones follow the shared colour table: 建议处理 waits for you
// (amber), a task in progress is blue, not yet / watching grey, not doing slate.
const getVerdict = () => ({do:{verdict:'do',label:$t('common.act'),tone:'amber',why:$t('strategy.aiSuggestsActing')},watch:{verdict:'watch',label:$t('common.watchRecommendation'),tone:'grey',why:$t('strategy.aiSuggestsWatchingLooksAgain')},skip:{verdict:'skip',label:$t('common.noActionNeeded'),tone:'slate',why:$t('strategy.aiFoundNoActionNeeded')}} as const);
function changeDraft(s:Signal,reason?:string):TaskDraft{return {title:titleOf(s).slice(0,200),objective:$t('strategy.handleChange',{0:titleOf(s)}).slice(0,1000),brief:[$t('strategy.latestChangeInsights',{0:getSourceNames()[s.source]||s.source,1:titleOf(s)}),...s.facts.map(f=>`- ${f}`),...(s.url?[$t('strategy.relatedPage',{0:s.url})]:[]),...(reason?[$t('strategy.aiVerdictValue',{0:reason})]:[]),'',$t('strategy.suggestionCheckDataAffectedPages')].join('\n').slice(0,20000),signalKey:s.key};}
// A change keeps its key from day to day (the same 278 duplicate titles), so tasks handed off weeks ago still point at it:
// only a task still open counts as 处理中; a finished or closed one is mentioned, and today's verdict decides again.
export function statusOf(s:Signal,state:StrategyState,tasks:ChangeTask[]):Status{
 const x=signalDisposition(s,state,tasks),review=state.insights?.signalReviews?.[s.key],earlier=x.earlier;
 if(x.next==='task')return {label:$t('strategy.progress'),tone:'blue',next:'task',taskId:x.taskId,why:$t('strategy.taskHandling',{0:x.taskNo?` T-${x.taskNo}`:''})};
 if(x.next==='opportunity')return {label:$t('common.act'),verdict:'do',tone:'amber',next:'opportunity',row:x.row,reason:review?.reason,earlier,why:$t('strategy.aiSuggestsActingWroteUp')};
 if(x.dismissed)return {label:$t('strategy.dismissed'),dismissed:true,tone:'slate',next:'hand',ignored:x.ignored,reason:x.ignored?review?.reason:undefined,earlier,why:$t(x.ignored?'strategy.ignoredChangeIfChangeMind':'strategy.dismissedMatchingOpportunityIfChange')};
 if(review)return {...getVerdict()[review.verdict],next:'hand',reason:review.reason,earlier,why:review.verdict==='do'?$t('strategy.aiSuggestsActingNotWrite'):$t('strategy.ifDisagreeStillHandOff',{0:getVerdict()[review.verdict].why})};
 return {label:$t('strategy.awaitingVerdict'),tone:'grey',next:'judge',why:$t('strategy.analysisNotReachedVerdictChange'),earlier};
}
// 今天的变化 (2026-10-08 user request; replaces 今天值得做的事 and 最新变化, which listed the same things twice): one list
// of the latest analysis in the three groups used on 机会 too (2026-10-08): 待处理 — each pending opportunity with the
// change it rests on and 交给 Agent / 忽略, then changes the AI advises dealing with that have no opportunity of their own;
// 观察中 (the first five); and, folded, 已处理 — already with a task, 无需处理 and 已忽略. Any row opens the change's detail.
type Group='todo'|'watch'|'done';
type Entry={key:string;group:Group;rank:number;title:string;sub:string;chip:{tone:Tone;text:string}|null;signal?:Signal;row?:Row;status?:Status;days?:number};
const WATCH_SHOWN=5;
// How long a change has been watched: 今天开始 on its first day, then the days in a row.
export const watchedLabel=(days:number)=>days<=1?$t('strategy.watchingSinceToday'):$t('strategy.watchedDays',{0:days});
export function TodayChanges({state,tasks,rows,projectId,busy,labelOf,convert,ignore,empty,onHandOff,onState}:{state:StrategyState;tasks:ChangeTask[];rows:Row[];projectId:number;busy:boolean;labelOf:(r:Row)=>string;convert:(r:Row)=>void;ignore:(r:Row)=>void;empty:string;onHandOff:(r:HandOffResult)=>void;onState:()=>void}):ReactElement{
 const navigate=useNavigate(),[openKey,setOpenKey]=useState<string>(),[handing,setHanding]=useState<{s:Signal;reason?:string}>(),[judging,setJudging]=useState(false),[error,setError]=useMessageState(''),[more,setMore]=useState<Record<'watch'|'done',boolean>>({watch:false,done:false});
 const signals=[...(state.insights?.evidence.signals?.items||[])].sort((a,b)=>b.strength-a.strength);
 const open=signals.find(s=>s.key===openKey),st=open?statusOf(open,state,tasks):undefined,page=open?pageOf(open):undefined;
 // A change nobody judged yet (an analysis from before every change got a verdict) is judged once, at once, in the
 // background: the row reads “AI 判断中” meanwhile; only if that fails does it offer 让 AI 现在判断 by hand.
 const missing=signals.filter(s=>statusOf(s,state,tasks).next==='judge').length,asked=useRef(''),[auto,setAuto]=useState<'running'|'failed'|''>('');
 useEffect(()=>{const batch=state.insights?.generatedAt||'';if(!missing||asked.current===batch)return;asked.current=batch;setAuto('running');void judgeMissing(projectId).then(()=>{setAuto('');onState();}).catch(()=>setAuto('failed'));},[state.insights?.generatedAt,missing]);
 const shown=(x:Status):Status=>x.next==='judge'&&auto==='running'?{...x,label:$t('strategy.aiJudging')}:x;
 // 忽略 / 恢复 for a change without an opportunity of its own (the opportunities have theirs).
 const [deciding,setDeciding]=useState(false);
 const decide=async(s:Signal,status:'ignored'|'pending')=>{setDeciding(true);setError('');try{await request(projectId,'decideSignal',{signalKey:s.key,status,revision:state.revision,requestId:crypto.randomUUID()});onState();}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('strategy.notSaveRefreshTryAgain')));}finally{setDeciding(false);}};
 const judge=async(s:Signal)=>{setJudging(true);setError('');try{await judgeSignal(projectId,s.key);onState();}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('strategy.noVerdictTryAgain')));}finally{setJudging(false);}};
 const cited=new Set(rows.flatMap(r=>citedSignals(r).map(s=>s.key)));
 const entries:Entry[]=[...rows.map((r,i):Entry=>{const lead=citedSignals(r)[0];return {key:`o:${r.card.id}`,group:'todo',rank:i,title:r.card.title,sub:lead?`${getSourceNames()[lead.source]||lead.source} · ${titleOf(lead)}`:reasonLine(r),chip:lead?chipOf(lead):null,signal:lead,row:r};}),
  ...signals.filter(s=>!cited.has(s.key)).map((s,i):Entry=>{const x=shown(statusOf(s,state,tasks)),worth=x.next==='hand'&&x.verdict==='do'&&!x.ignored;
   const group:Group=worth||x.next==='opportunity'?'todo':x.next==='task'||x.verdict==='skip'||x.dismissed?'done':'watch';
   return {key:s.key,group,rank:group==='todo'?(worth?100:200)+i:group==='done'?(x.next==='task'?0:100)+i:i,title:titleOf(s),sub:[getSourceNames()[s.source]||s.source,x.reason].filter(Boolean).join(' · '),chip:chipOf(s),signal:s,status:x,days:x.verdict==='watch'&&!x.dismissed?watchDays(state,s.key):undefined};})];
 const by=(g:Group)=>entries.filter(e=>e.group===g).sort((a,b)=>a.rank-b.rank),todo=by('todo'),watch=by('watch'),done=by('done');
 const item=(e:Entry)=><li key={e.key} className="flex items-center gap-3 py-2" data-change={e.signal?.key} data-opportunity-id={e.row?.card.id}>
  <button type="button" className="min-w-0 flex-1 text-left hover:opacity-80" onClick={()=>{if(e.signal){setOpenKey(e.signal.key);setError('');}else if(e.row)navigate(`/opportunities?item=${encodeURIComponent(e.row.card.id)}`);}}>
   <span className="flex items-center gap-2 text-sm font-medium"><span className="truncate">{e.title}</span>{e.chip?<Tag tone={e.chip.tone}>{e.chip.text}</Tag>:null}</span>
   <span className="block truncate text-xs text-muted-foreground">{e.sub}</span></button>
  {e.row?<><Button size="sm" variant="outline" disabled={busy} onClick={()=>convert(e.row!)}>{labelOf(e.row)}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>ignore(e.row!)}>{$t('common.ignore')}</Button></>
   :e.status?.next==='hand'&&e.status.verdict==='do'&&!e.status.dismissed&&e.signal?.actionable?<><Button size="sm" variant="outline" onClick={()=>setHanding({s:e.signal!,reason:e.status?.reason})}>{$t('common.handOffAgent')}</Button><Button size="sm" variant="ghost" disabled={deciding} onClick={()=>void decide(e.signal!,'ignored')}>{$t('common.ignore')}</Button></>
   :e.days?<><span className="w-[6.5rem] shrink-0 text-right text-xs text-muted-foreground tabular-nums" data-watched={e.days}>{watchedLabel(e.days)}</span><Button size="sm" variant="ghost" disabled={deciding} onClick={()=>void decide(e.signal!,'ignored')}>{$t('common.ignore')}</Button></>
   :e.status?<span className="flex w-[6.5rem] shrink-0 justify-end"><Tag tone={e.status.tone} dot>{e.status.label}</Tag></span>:null}
 </li>;
 const head=(label:string,n:number)=><p className="pt-3 text-xs font-medium text-muted-foreground first:pt-0">{$tj("{0} {1}",{0:label,1:n})}</p>;
 const total=entries.length;
 return <Section aria-label={$t('strategy.todayChanges')} title={<>{$t('strategy.todayChanges')}<InfoTip label={$t('strategy.changeExplanation')}>{$t('strategy.analysisWorkflowHelp')}</InfoTip></>} count={total||undefined} actions={<Button size="sm" variant="ghost" onClick={()=>navigate('/opportunities')}>{$t('strategy.opportunities')}<ArrowRightIcon/></Button>}>
  {total?<div>
   {todo.length?<>{head($t('common.pending'),todo.length)}<ul className="divide-y">{todo.map(item)}</ul></>:null}
   {watch.length?<>{head($t('tasks.watchingTab',undefined),watch.length)}<ul className="divide-y">{watch.slice(0,WATCH_SHOWN).map(item)}</ul>
    {watch.length>WATCH_SHOWN?<Button size="sm" variant="ghost" onClick={()=>navigate('/opportunities?tab=watch')}>{$t('strategy.opportunitiesWatching',{0:watch.length})}<ArrowRightIcon/></Button>:null}</>:null}
   {done.length?(more.done?<>{head($t('strategy.handled'),done.length)}<ul className="divide-y">{done.map(item)}</ul></>
    :<Button size="sm" variant="ghost" className="mt-2" onClick={()=>setMore(m=>({...m,done:true}))}>{$t('strategy.handledValue',{0:done.length})}<ChevronRightIcon/></Button>):null}
  </div>:<p className="text-sm text-muted-foreground">{empty}</p>}
  {open&&st?<ChangeDetail signal={open} status={st} projectId={projectId} verdicts={verdictsOf(state,open.key)} watch={watchOf(state,open.key)} today={state.insights?.generatedAt} judging={judging||deciding} error={error} onJudge={()=>void judge(open)} onDecide={status=>void decide(open,status).then(()=>setOpenKey(undefined))} onClose={()=>setOpenKey(undefined)} onHandOff={onHandOff}/>:null}
  {handing?<DraftHandOffDialog projectId={projectId} draft={changeDraft(handing.s,handing.reason)} playbookId={PLAYBOOK[handing.s.action||'']||'optimize-page'} page={handing.s.url&&handing.s.source==='site'?handing.s.url:undefined} description={$t('strategy.changeDataGoTaskBrief')} onClose={()=>setHanding(undefined)} onDone={r=>{setHanding(undefined);onHandOff(r);}}/>:null}
 </Section>;
}
// One change in a panel (洞察's 今天的变化, 机会's 观察中): its data, the AI's verdict and one next step, and the verdicts of
// earlier days when there are some (how a watched change has been judged).
export function ChangeDetail({signal:open,status:st,projectId,verdicts,watch,today,judging,error,onJudge,onDecide,onClose,onHandOff}:{signal:Signal;status:Status;projectId:number;verdicts?:Verdict[];watch?:WatchRecord;today?:string;judging?:boolean;error?:string;onJudge?:()=>void;onDecide?:(status:'ignored'|'pending')=>void;onClose:()=>void;onHandOff:(r:HandOffResult)=>void}):ReactElement{
 const navigate=useNavigate(),[handing,setHanding]=useState(false),page=pageOf(open);
 return <>
  {handing?null:<DetailDrawer open onClose={onClose} title={titleOf(open)} description={getSourceNames()[open.source]||open.source}
   footer={<div className="flex w-full flex-wrap gap-2">
    {st.next==='opportunity'?<Button onClick={()=>navigate(`/opportunities?item=${encodeURIComponent(st.row!.card.id)}`)}>{$t('strategy.viewOpportunity')}<ArrowRightIcon/></Button>
     :st.next==='task'?<Button onClick={()=>navigate(`/actions/${st.taskId}`)}>{$t('strategy.viewTask')}<ArrowRightIcon/></Button>
     :st.next==='judge'?<Button disabled={judging} onClick={onJudge}><SparklesIcon data-icon="inline-start"/>{judging?$t('strategy.aiJudgingLoading'):$t('strategy.askAiJudgeNow')}</Button>:null}
    {(st.next==='hand'||st.next==='judge')&&open.actionable?<Button variant={st.next==='hand'&&st.verdict==='do'&&!st.ignored&&!st.dismissed?'default':'outline'} onClick={()=>setHanding(true)}><BotIcon data-icon="inline-start"/>{st.next==='hand'&&!(st.verdict==='do'&&!st.dismissed)?$t('strategy.handOffAgentAnyway'):$t('common.handOffAgent')}</Button>:null}
    {onDecide&&st.next==='hand'&&!st.dismissed&&(st.verdict==='do'||st.verdict==='watch')?<Button variant="ghost" disabled={judging} onClick={()=>onDecide('ignored')}>{$t('common.ignore')}</Button>:null}
    {onDecide&&st.ignored?<Button variant="outline" disabled={judging} onClick={()=>onDecide('pending')}>{$t('strategy.restore')}</Button>:null}
    {page?<Button variant="outline" onClick={()=>navigate(page)}>{$t('strategy.viewData')}</Button>:null}</div>}>
   <div className="space-y-3 text-sm">
    <div className="flex flex-wrap items-center gap-2"><Tag tone={st.tone} dot>{st.label}</Tag>{(()=>{const c=chipOf(open);return c?<Tag tone={c.tone}>{c.text}</Tag>:null;})()}</div>
    <section className="space-y-1"><h3 className="text-xs font-medium text-muted-foreground">{$t('strategy.data')}</h3><ul className="list-disc space-y-1 pl-5">{open.facts.map(f=><li key={f}>{$legacyText(f)}</li>)}</ul>{open.url?<p><a className="nr-link break-all" href={open.url} target="_blank" rel="noreferrer">{open.url}</a></p>:null}</section>
    <section className="space-y-1"><h3 className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><AiMark label={$t('strategy.aiVerdict')}/>{$t('strategy.aiVerdict')}</h3><p>{st.reason?`${st.label}：${st.reason}`:st.why}</p>{st.reason?<p className="text-xs text-muted-foreground">{st.why}</p>:null}</section>
    {st.earlier?<p className="text-xs text-muted-foreground">{$t('strategy.handedOffAgentBefore')}<button type="button" className="nr-link" onClick={()=>navigate(`/actions/${st.earlier!.id}`)}>{st.earlier.no?`T-${st.earlier.no}`:$t('common.tasks')}</button>{$tj('strategy.changeStillThere',{0:st.earlier.state==='done'?$t('strategy.done'):$t('strategy.closed')})}</p>:null}
    {watch&&st.verdict==='watch'&&!st.dismissed?<section className="space-y-1" data-watch-record=""><h3 className="text-xs font-medium text-muted-foreground">{$t('common.watch')}</h3>
     <dl className="grid grid-cols-[5.5rem_1fr] gap-y-1"><dt className="text-muted-foreground">{$t('strategy.decisionCondition')}</dt><dd>{watch.waitingFor||'—'}</dd>
      <dt className="text-muted-foreground">{$t('strategy.watchingSince')}</dt><dd>{$t('strategy.day',{0:watch.since.slice(5,10).replace('-','/'),1:daysBetween(watch.since,today||new Date().toISOString())})}</dd>
      <dt className="text-muted-foreground">{$t('strategy.deadline')}</dt><dd>{watch.decideBy.slice(5).replace('-','/')}</dd>
      <dt className="text-muted-foreground">{$t('strategy.startingValue')}</dt><dd><ul className="list-disc space-y-0.5 pl-4">{watch.startFacts.map(f=><li key={f}>{$legacyText(f)}</li>)}</ul></dd></dl></section>:null}
    {verdicts&&verdicts.length>1?<section className="space-y-1" data-verdicts=""><h3 className="text-xs font-medium text-muted-foreground">{$t('strategy.verdictDay')}</h3><ul className="space-y-0.5">{verdicts.slice(0,14).map(v=><li key={v.day} className="grid grid-cols-[3.5rem_1fr] gap-2"><span className="tabular-nums text-muted-foreground">{v.day.slice(5).replace('-','/')}</span><span>{getVerdict()[v.verdict].label}：{v.reason}</span></li>)}</ul></section>:null}
    {error?<p role="alert" className="nr-error">{error}</p>:null}
   </div>
  </DetailDrawer>}
  {handing?<DraftHandOffDialog projectId={projectId} draft={changeDraft(open,st.reason)} playbookId={PLAYBOOK[open.action||'']||'optimize-page'} page={open.url&&open.source==='site'?open.url:undefined} description={$t('strategy.changeDataGoTaskBrief')} onClose={onClose} onDone={r=>{onClose();onHandOff(r);}}/>:null}
 </>;
}
// Needs-you (§5.4 attention): one line, only when something waits.
export function WaitingStrip({tasks,label}:{tasks:Task[];label:(w?:Work)=>string}):ReactElement|null{
 const navigate=useNavigate();if(!tasks.length)return null;
 return <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-nr-tint-amber px-3 py-2 text-sm text-nr-ink-amber"><BellIcon className="size-4 shrink-0" aria-hidden="true"/><b className="font-medium">{$tj('strategy.thingsNeed',{0:tasks.length})}</b>
  {tasks.slice(0,2).map(t=><button key={t.id} type="button" className="min-w-0 max-w-[24rem] truncate underline-offset-4 hover:underline" onClick={()=>navigate(`/actions/${t.id}`)}>{t.title} · {label(t.evidence?.work)}</button>)}
  <button type="button" className="ml-auto underline-offset-4 hover:underline" onClick={()=>navigate(WAITING_TASKS_URL)}>{$t('strategy.view')}</button></div>;
}
