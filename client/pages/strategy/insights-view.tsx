import {signalDisposition} from '../../../shared/strategy-pending.js';
import {WAITING_TASKS_URL} from '../task-waiting';
import { $t, $tj, $legacyText, $legacyFragment, $legacyJsx } from "#i18n";
import {useLayoutEffect,useRef,useState,type ReactElement,type RefObject} from 'react';
import {useNavigate} from 'react-router';
import {BellIcon,ArrowRightIcon,BotIcon,ChevronRightIcon,SparklesIcon} from 'lucide-react';
import {AiMark} from '#components/reach/actor';
import {Button} from '#components/ui/button';
import {Section} from '#components/reach/page';
import {Tag,type Tone} from '#components/reach/tag';
import {getSourceNames,type Row} from './board';
import type {StrategyState,Signal,WatchRecord,Evidence,SourceSummary} from './model';
import {type Work} from '../task-execution-types';
import {DetailDrawer} from '../detail-drawer';
import {DraftHandOffDialog,type TaskDraft} from '../keyword-hand-off';
import {SectionHandOff} from '../section-hand-off';
import {AllCheck,RowCheck,useSelection} from '#components/reach/hand-off-slot';
import type {HandOffResult} from './hand-off';
import {daysBetween,type Verdict} from './watch';
import {isZero,situationLines} from './situation-lines';
import {TASK_TAG,type TaskStanding} from './task-standing';
import {distinctPages} from '../../../shared/task-start.js';
// The playbooks that change the site's pages.
const PAGE_PLAYBOOKS=new Set(['optimize-page','tech-fix']);
// 洞察 building blocks (SPEC §5): numbers and changes first, one line each; no paragraphs.
export type Metric={key:string;label:string;value:number|null;previous:number|null;complete:boolean;change:number|null};
export type SourceCard={id:string;cutoff:string|null;window:{start:string;end:string;days:number};metrics:Metric[];series:{date:string;value:number|null}[];seriesBy?:Record<string,{date:string;value:number|null}[]>};
type Task={id:number;title:string;status:string;updatedAt?:string;evidence?:{work?:Work}};
// The one coloured fact of a change (server-computed; read from the wording for signals stored before chips existed).
export function chipOf(s:Signal):{tone:Tone;text:string}|null{
 if(s.chip)return {tone:s.chip.tone as Tone,text:$legacyFragment(s.chip.text)};
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
type Point={value:number|null};
// A metric's daily series in its change's colour, with a light wash under the line and a dot on the latest day
// (2026-10-22 visual polish). The dot is an element over the stretched drawing so it stays round.
export function Sparkline({points,change}:{points:Point[];change?:number|null}):ReactElement|null{
 const v=points.map(p=>p.value).filter((x):x is number=>x!==null);if(v.length<2)return null;
 const min=Math.min(...v),max=Math.max(...v),span=max-min||1,step=100/(points.length-1);
 const xy=points.flatMap((p,i)=>p.value===null?[]:[[i*step,18-((p.value-min)/span)*16] as const]),d=xy.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
 const colour=change==null||change===0?'var(--muted-foreground)':change>0?'var(--nr-ink-green)':'var(--nr-ink-red)',[lastX,lastY]=xy[xy.length-1];
 return <span className="relative block h-6 w-full" aria-hidden="true">
  <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="block size-full"><polygon points={`${xy[0][0].toFixed(1)},20 ${d} ${lastX.toFixed(1)},20`} fill={colour} fillOpacity="0.08"/><polyline points={d} fill="none" stroke={colour} strokeWidth="1.2" vectorEffect="non-scaling-stroke"/></svg>
  <span className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{left:`${lastX}%`,top:`${lastY*5}%`,background:colour}}/>
 </span>;
}
// The page's numbers: search, visits and key events, then GitHub stars, downloads, forum topics, Hacker News and Reddit
// when connected, each with its daily series and its data page. A metric without a value is left out by the caller.
// `days` is the cards' period; each card's page opens on it (?days=), so the numbers there match.
export type MetricItem={label:string;value:number|null;previous?:number|null;change:number|null;to:string;signed?:boolean;series?:Point[]};
export function metricItems(cards?:SourceCard[],days?:number):MetricItem[]{
 const by=new Map((cards||[]).map(c=>[c.id,c]));
 const item=(label:string,c:SourceCard|undefined,key:string,to:string,signed=false,series?:Point[]):MetricItem=>{const m=c?.metrics.find(x=>x.key===key);
  return {label,value:m?.value??null,previous:m?.previous??null,change:m?.change??null,to:days?`${to}${to.includes('?')?'&':'?'}days=${days}`:to,signed,series:series||c?.seriesBy?.[key]||(c?.metrics[0]?.key===key?c.series:undefined)};};
 const gsc=by.get('gsc'),ga4=by.get('ga4');
 return [item($t('common.searchClicks'),gsc,'clicks','/seo-opportunities'),item($t('common.searchImpressions'),gsc,'impressions','/seo-opportunities'),item($t('strategy.sessions'),ga4,'sessions','/website'),item($t('common.keyEvents'),ga4,'conversions','/website/conversion'),
  ...([['github','stars',$t('common.newStars'),'/data/github',true],['packages','downloads',$t('common.downloads'),'/data/downloads',false],['discourse','topics',$t('strategy.newForumTopics'),'/data/community',false],['mentions','mentions',$t('common.hackerNewsMentions'),'/data/hackernews',false],['reddit','posts',$t('strategy.newRedditPosts'),'/data/reddit',false]] as const).flatMap(([id,key,label,to,signed])=>{const c=by.get(id);return c?[item(label,c,key,to,signed,c.series)]:[];})];
}
// The numbers a day's analysis read (its evidence: Search Console and GA4 over its own period against the period
// before), for the chips of that day's message. They come from the analysis, not the tiles above, so the chips and the
// notes the AI wrote from the same figures agree, and an earlier day keeps its own (2026-10-27 user report: the tiles
// went to 7 days in #291 and the chips said "Search impressions ↑ 35%" beside notes reading -21.3% over 28 days). A
// figure the evidence does not carry, or cannot compare, is left out rather than taken from another window.
export function analysisMetrics(evidence?:Evidence):MetricItem[]{
 const days=evidence?.periodDays;
 const item=(label:string,source:SourceSummary|undefined,key:string,to:string):MetricItem=>{const m=source?.metrics?.[key],ok=Boolean(m?.comparable&&m.current!=null&&m.previous!=null);
  return {label,value:ok?m!.current:null,previous:ok?m!.previous:null,change:ok&&m!.percent!=null?m!.percent/100:null,to:days?`${to}?days=${days}`:to};};
 const search=evidence?.summary?.search,web=evidence?.summary?.web;
 return [item($t('common.searchClicks'),search,'clicks','/seo-opportunities'),item($t('common.searchImpressions'),search,'impressions','/seo-opportunities'),item($t('strategy.sessions'),web,'sessions','/website'),item($t('common.keyEvents'),web,'conversions','/website/conversion')].filter(i=>i.value!=null);
}
export const percent=pct;
// 当前状况 (was 各方面一览, then 需要留意 — 2026-10-08 user: “留意” read like the AI's 先观察): how things stand now, as
// against 今天的变化 (what changed) — no comparison and no AI, a problem stays here until it is fixed. The state of each connected source (server: nrInsights:summary), each opening its page.
// 2026-10-08 (user: beside the metric cards, a second grid of number tiles left no telling which to look at): the metric
// cards are the only big numbers on the page; this is a quiet list, one sentence per line with its numbers in bold, then
// where it comes from. Lines to deal with (amber or red) come first with an amber dot; the rest are grey.
// `pages`: a site audit row's affected pages, handed off with it (2026-10-29).
export type AreaRow={key:string;title:string;meta?:string;url?:string|null;pages?:string[];tag?:{tone:Tone;text:string}};
export type AreaItem={key:string;text:string;values:string[];source:string;detail?:string;to:string;tone?:Tone;group?:'worse'|'handle'|'chance'|'voice';rows?:AreaRow[];total?:number;compare?:{label:string;now:string|number;before:string|number}[];handOff?:{playbookId:string;title:string}};
export type Area={id:string;title:string;items:AreaItem[]};
// Current situation names each line with a short noun label and puts its value on the right (2026-10-24 user-approved
// design: no icons, no sentences with the number in the middle). The label goes by the line's stable key (server:
// nrInsights:summary); a line without one, or without a value, keeps its sentence as the label.
const SITUATION_LABEL:Record<string,string>={striking:'strategy.situationStriking',rank:'strategy.situationRank',trends:'strategy.situationTrends',answers:'strategy.situationAnswers',audit:'strategy.situationAudit',forum:'strategy.situationForum',discord:'strategy.situationDiscord',slack:'strategy.situationSlack',x:'strategy.situationX','brand-chat_gpt':'strategy.situationChatgpt','brand-google':'strategy.situationGoogleAi',hackernews:'strategy.situationHackerNews',reddit:'strategy.situationReddit',downloads:'strategy.situationDownloads',
 'rule-gsc-click-drop':'strategy.situationClickDrop','rule-competitor-release':'strategy.situationCompetitorRelease','rule-competitor-pages':'strategy.situationCompetitorPages','rule-ai-share':'strategy.situationAiShare','rule-github-rival-stars':'strategy.situationRivalStars','rule-gsc-low-ctr':'strategy.situationLowCtr','rule-ga4-low-conversion':'strategy.situationLowConversion','rule-site-stale':'strategy.situationStale','rule-site-thin':'strategy.situationThin','rule-ai-uncited':'strategy.situationAiUncited','rule-trends-rising':'strategy.situationRising','rule-hn-story':'strategy.situationHnStory','rule-x-hot':'strategy.situationXHot','rule-community-theme':'strategy.situationThemes','rule-github-referrer':'strategy.situationReferrer','rule-github-release':'strategy.situationRelease'};
const situationValue=(i:{key:string;values:string[]})=>i.key==='rank'&&i.values.length===2?[`↑${i.values[0]}`,`↓${i.values[1]}`]:i.values;
const NORMAL_SHOWN=6,SHOW_ALL_HEIGHT=24;
// How many rows fit in the column beside the conversation. On wide screens it has the window's height and scrolls
// inside (strategy/index.tsx, data-situation-column), and a scrollbar in a column this narrow looked broken (2026-10-24
// user feedback), so the list shows what fits: `fit` rows with "Show all N" under them, `all` without. Undefined where
// the column grows with its content (a phone, the folded line beside the side panel); NORMAL_SHOWN applies there.
function useRowRoom(listRef:RefObject<HTMLElement|null>,ready:boolean):{fit:number;all:number}|undefined{
 const [room,setRoom]=useState<{fit:number;all:number}>();
 // Measured again when the column or the list changes size (the metric cards above and the fonts arrive after the list),
 // from the elements as they are then.
 useLayoutEffect(()=>{const first=listRef.current,firstBox=first?.closest<HTMLElement>('[data-situation-column]');if(!first||!firstBox||typeof ResizeObserver==='undefined')return;
  const measure=()=>{const list=listRef.current,box=list?.closest<HTMLElement>('[data-situation-column]'),row=list?.querySelector('li')?.getBoundingClientRect().height;
   if(!list||!box||!row||!/(auto|scroll)/.test(getComputedStyle(box).overflowY)){setRoom(undefined);return;}
   const left=box.clientHeight-(list.getBoundingClientRect().top-box.getBoundingClientRect().top+box.scrollTop),next={fit:Math.floor((left-SHOW_ALL_HEIGHT)/row),all:Math.floor(left/row)};
   setRoom(r=>r&&r.fit===next.fit&&r.all===next.all?r:next);};
  measure();const observer=new ResizeObserver(measure);observer.observe(firstBox);observer.observe(first);return()=>observer.disconnect();},[listRef,ready]);
 return room;}
const sentence=(i:AreaItem)=>$legacyText(i.text).replace(/\{(\d+)\}/g,(_,k:string)=>i.values[Number(k)]??'');
export function AreaList({areas,projectId,quiet=false}:{areas?:Area[];projectId:number;quiet?:boolean}):ReactElement|null{
 const navigate=useNavigate(),[openKey,setOpenKey]=useState<string>(),[allNormal,setAllNormal]=useState(false),listRef=useRef<HTMLDivElement>(null),all=situationLines(areas),room=useRowRoom(listRef,quiet&&all.length>0);if(!all.length)return null;
 const items=all,open=items.find(i=>`${i.area}:${i.key}`===openKey);
 // A line with something behind it opens its detail here; one without (AI 搜索还没查过) goes to its page.
 const go=(i:typeof items[number])=>{if(i.rows?.length||i.compare?.length)setOpenKey(`${i.area}:${i.key}`);else navigate(i.to);};
 const detail=open?<AttentionDetail key={openKey} item={open} projectId={projectId} onClose={()=>setOpenKey(undefined)}/>:null;
 // Quiet, beside the day's conversation on Insights (2026-10-21 user feedback: the column drew the eye from the
 // conversation): one list in group order (getting worse, to handle, opportunities, share of voice), each row a short
 // label and its value on the right in tabular figures, where it comes from on hover (2026-10-24 design,
 // ui-references/insights-2026-10-22). Rows in the small size, as the metric cards' labels: at the conversation's size
 // the column competed with it (2026-10-24 user feedback). No icons, logos or group captions: the colour of a count says
 // its group (red getting worse, amber to handle, plain otherwise), so a caption only took room. A change is coloured by
 // its direction as on the metric cards (up green, down red; a zero plain). A line without a label or a value keeps its
 // sentence. The column has a window's height, so the lines past the ones to deal with and what fits wait behind "Show
 // all N" (useRowRoom).
 if(quiet){const ink=(i:typeof items[number],v:string)=>/^[↑↓]/.test(v)?isZero(v)?'text-foreground':v.startsWith('↑')?'text-nr-ink-green':'text-nr-ink-red':i.group==='worse'?'text-nr-ink-red':i.group==='handle'?'text-nr-ink-amber':i.group||!i.attention?'text-foreground':i.tone==='red'?'text-nr-ink-red':'text-nr-ink-amber';
  const row=(i:typeof items[number])=>{const label=SITUATION_LABEL[i.key],value=i.values.length?situationValue(i):null;
   return <li key={`${i.area}:${i.key}`}><button type='button' onClick={()=>go(i)} title={[$legacyText(i.source),i.detail?$legacyText(i.detail):''].filter(Boolean).join(' · ')} className='-mx-2 flex w-[calc(100%+var(--spacing)*4)] items-baseline gap-3 rounded-md px-2 py-[5px] text-left text-xs text-foreground/80 transition-colors hover:bg-muted' data-area={i.area} data-item={i.key} data-attention={i.attention||undefined}>
    <span className='min-w-0 flex-1'>{label&&value?$t(label):sentence(i)}</span>
    {label&&value?<span className='flex shrink-0 gap-1.5 font-medium tabular-nums'>{value.map(v=><span key={v} className={ink(i,v)}>{v}</span>)}</span>:null}
   </button></li>;};
  const attention=items.filter(i=>i.attention),normal=items.filter(i=>!i.attention),normalRoom=!room?NORMAL_SHOWN:room.all>=items.length?normal.length:Math.max(0,room.fit-attention.length),shown=allNormal?items:[...attention,...normal.slice(0,normalRoom)];
  return <div ref={listRef} aria-label={$t('strategy.whereThingsStand')} className='flex flex-col'>
   <ul>{shown.map(row)}</ul>
   {normal.length>normalRoom&&<button type='button' className='mt-1.5 self-start text-xs text-muted-foreground hover:text-foreground' aria-expanded={allNormal} onClick={()=>setAllNormal(v=>!v)}>{allNormal?$t('common.collapse'):$t('strategy.situationShowAll',{0:items.length})}</button>}
   {detail}</div>;}
 // Untitled: the block around it carries the heading and what it means.
 return <Section aria-label={$t('strategy.whereThingsStand')}><ul className="divide-y">{items.map(i=><li key={`${i.area}:${i.key}`}>
  <button type="button" onClick={()=>go(i)} title={i.detail?$legacyText(i.detail):undefined} className="flex w-full items-start gap-2.5 py-2 text-left hover:opacity-80" data-area={i.area} data-item={i.key} data-attention={i.attention||undefined}>
   <span className={`mt-1.5 size-2 shrink-0 rounded-full ${i.attention?'bg-nr-ink-amber':'bg-muted-foreground/40'}`} aria-hidden="true"/>
   <span className="min-w-0 flex-1">
    <span className={`block text-sm ${i.attention?'':'text-muted-foreground'}`}>{$legacyJsx(i.text,Object.fromEntries(i.values.map((v,k)=>[k,<b key={k} className="font-semibold text-foreground tabular-nums">{v}</b>])))}</span>
    <span className="block truncate text-xs text-muted-foreground">{[$legacyText(i.source),i.detail?$legacyText(i.detail):''].filter(Boolean).join(' · ')}</span>
   </span>
   <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true"/>
  </button></li>)}</ul>
  {detail}</Section>;
}
// What is behind a 当前状况 line (2026-10-08 user feedback: the line led to a whole page where its own data was hard to
// find): its rows (ticked ones go to the Agent from the top right, the task opening to be confirmed) or this period
// against the one before; then the page with all of it.
function AttentionDetail({item,projectId,onClose}:{item:AreaItem;projectId:number;onClose:()=>void}):ReactElement{
 // A rule's line is titled as in the list, by its label (the rule's own name reads differently).
 const navigate=useNavigate(),list=item.rows||[],selection=useSelection(list.map(r=>r.key)),ticked=list.filter(r=>selection.has(r.key)),text=item.key.startsWith('rule-')&&SITUATION_LABEL[item.key]?$t(SITUATION_LABEL[item.key]):sentence(item);
 // A line about the site's own pages hands its ticked pages off with the task (2026-10-29); others (forum topics,
 // posts) are not pages to change.
 const draft=():TaskDraft=>({...(PAGE_PLAYBOOKS.has(item.handOff!.playbookId)?{pages:distinctPages(ticked.flatMap(r=>[r.url,...(r.pages||[])]))}:{}),title:item.handOff!.title.replace('{0}',ticked.map(r=>r.title).join('、').slice(0,120)).slice(0,200),subject:ticked.map(r=>r.title).join('、').slice(0,160),objective:$t('strategy.handleInsightsWorthLook',{0:text}).slice(0,1000),
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
type Status={label:string;tone:Tone;verdict?:'do'|'watch'|'skip';next:'opportunity'|'task'|'hand'|'judge';row?:Row;taskId?:number;taskNo?:number;task?:TaskStanding;reason?:string;why:string;earlier?:{id:number;no?:number;state:'done'|'closed'};ignored?:boolean;dismissed?:boolean};
type ChangeTask={id:number;status:string;evidence?:{no?:number;work?:Work}};
const SOURCE_PAGE:Record<string,string>={gsc:'/seo-opportunities',ga4:'/website',site:'/content',github:'/data/github','github-traffic':'/data/github',discourse:'/data/community',packages:'/data/downloads',hackernews:'/data/hackernews',reddit:'/data/reddit',x:'/data/x',discord:'/data/discord',slack:'/data/slack',trends:'/trends',competitors:'/research/domain',rank:'/keywords?tab=tracking','ai-search':'/ai-search'};
const pageOf=(s:Signal)=>s.key.startsWith('audit-')?'/audit':SOURCE_PAGE[s.source];
const PLAYBOOK:Record<string,string>={technical:'tech-fix',optimize:'optimize-page',create:'content-outline',reply:'community-reply'};
// The AI's verdicts (2026-10-08 user: one set of words on 洞察 and 机会, less colloquial): 建议处理, 建议观察, 无需处理 —
// written as the AI's advice, apart from your own 忽略. Tones follow the shared colour table: 建议处理 waits for you
// (amber), a task in progress is blue, not yet / watching grey, not doing slate.
const getVerdict = () => ({do:{verdict:'do',label:$t('common.act'),tone:'amber',why:$t('strategy.aiSuggestsActing')},watch:{verdict:'watch',label:$t('common.watchRecommendation'),tone:'grey',why:$t('strategy.aiSuggestsWatchingLooksAgain')},skip:{verdict:'skip',label:$t('common.noActionNeeded'),tone:'slate',why:$t('strategy.aiFoundNoActionNeeded')}} as const);
function changeDraft(s:Signal,reason?:string):TaskDraft{return {title:titleOf(s).slice(0,200),subject:titleOf(s).slice(0,160),objective:$t('strategy.handleChange',{0:titleOf(s)}).slice(0,1000),brief:[$t('strategy.latestChangeInsights',{0:getSourceNames()[s.source]||s.source,1:titleOf(s)}),...s.facts.map(f=>`- ${$legacyText(f)}`),...(s.url?[$t('strategy.relatedPage',{0:s.url})]:[]),...(reason?[$t('strategy.aiVerdictValue',{0:reason})]:[]),'',$t('strategy.suggestionCheckDataAffectedPages')].join('\n').slice(0,20000),signalKey:s.key};}
// A change keeps its key from day to day (the same 278 duplicate titles), so tasks handed off weeks ago still point at it:
// only a task still open counts as 处理中; a finished or closed one is mentioned, and today's verdict decides again. The
// open task's tag says where it stands, in the words and tones of Opportunities' Where it went (task-standing.ts).
export function statusOf(s:Signal,state:StrategyState,tasks:ChangeTask[]):Status{
 const x=signalDisposition(s,state,tasks),review=state.insights?.signalReviews?.[s.key],earlier=x.earlier;
 if(x.next==='task'){const task=x.taskStanding??'todo';return {label:TASK_TAG[task][1](),tone:TASK_TAG[task][0],next:'task',taskId:x.taskId,taskNo:x.taskNo,task,why:$t('strategy.taskHandling',{0:x.taskNo?` T-${x.taskNo}`:''})};}
 if(x.next==='opportunity')return {label:$t('common.act'),verdict:'do',tone:'amber',next:'opportunity',row:x.row,reason:review?.reason,earlier,why:$t('strategy.aiSuggestsActingWroteUp')};
 if(x.dismissed)return {label:$t('strategy.dismissed'),dismissed:true,tone:'slate',next:'hand',ignored:x.ignored,reason:x.ignored?review?.reason:undefined,earlier,why:$t(x.ignored?'strategy.ignoredChangeIfChangeMind':'strategy.dismissedMatchingOpportunityIfChange')};
 if(review)return {...getVerdict()[review.verdict],next:'hand',reason:review.reason,earlier,why:review.verdict==='do'?$t('strategy.aiSuggestsActingNotWrite'):$t('strategy.ifDisagreeStillHandOff',{0:getVerdict()[review.verdict].why})};
 return {label:$t('strategy.awaitingVerdict'),tone:'grey',next:'judge',why:$t('strategy.analysisNotReachedVerdictChange'),earlier};
}
// How long a change has been watched: Today on its first day, then the days in a row.
export const watchedLabel=(days:number)=>days<=1?$t('strategy.watchingSinceToday'):$t('strategy.watchedDays',{0:days});
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
  {handing?<DraftHandOffDialog projectId={projectId} draft={changeDraft(open,st.reason)} playbookId={PLAYBOOK[open.action||'']||'optimize-page'} page={open.url||undefined} description={$t('strategy.changeDataGoTaskBrief')} onClose={onClose} onDone={r=>{onClose();onHandOff(r);}}/>:null}
 </>;
}
// Needs-you (§5.4 attention): one line, only when something waits.
export function WaitingStrip({tasks,label}:{tasks:Task[];label:(w?:Work)=>string}):ReactElement|null{
 const navigate=useNavigate();if(!tasks.length)return null;
 return <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-nr-tint-amber px-3 py-2 text-sm text-nr-ink-amber"><BellIcon className="size-4 shrink-0" aria-hidden="true"/><b className="font-medium">{$tj('strategy.thingsNeed',{0:tasks.length})}</b>
  {tasks.slice(0,2).map(t=><button key={t.id} type="button" className="min-w-0 max-w-[24rem] truncate underline-offset-4 hover:underline" onClick={()=>navigate(`/actions/${t.id}`)}>{t.title} · {label(t.evidence?.work)}</button>)}
  <button type="button" className="ml-auto underline-offset-4 hover:underline" onClick={()=>navigate(WAITING_TASKS_URL)}>{$t('strategy.view')}</button></div>;
}
