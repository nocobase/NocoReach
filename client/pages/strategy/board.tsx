import {citedSignals,type Row} from '../../../shared/strategy-pending.js';
// eslint-disable-next-line react-refresh/only-export-components -- retain the existing public predicate exports
export {rowsFor,opportunityState,citedSignals,todaySuggestions,priorityRank,overviewPeriodDays,type Row,type OpportunityState} from '../../../shared/strategy-pending.js';
import { getCurrentLocale, $t, $tj } from "#i18n";
import {useState} from 'react';
import {MoreHorizontal} from 'lucide-react';
import {Button} from '#components/ui/button';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '#components/ui/dropdown-menu';
import {summaryMetrics,type StrategyState,type InsightBatch,type Evidence} from './model';
// An opportunity is pending while it is in the latest analysis and undecided (or restored), becomes a task when
// converted, and is archived otherwise: ignored, or no longer brought up by the latest analysis.

// The signals an opportunity cites, as stored with the analysis that produced it.
// One line for the list: the written reason (one key number), else the cited signals' figures, else the observation.
export function reasonLine(row:Row){const text=row.card.reason||citedSignals(row).flatMap(s=>s.facts).slice(0,2).join(' · ')||row.card.observation;return text.length>60?text.slice(0,60)+'…':text;}
export function sourceLabels(batch:InsightBatch){return new Map<string,string>([...(batch.evidence.summary?.web.days?[['ga4','GA4'] as [string,string]]:[]),...(batch.evidence.summary?.search.days?[['gsc','Search Console'] as [string,string]]:[]),...(batch.evidence.industryCandidates?.length?[['keywords',$t('strategy.keywordResearch')] as [string,string]]:[]),...(batch.evidence.publicSources||[]).map(s=>[s.id,s.kind==='github'?'GitHub · '+s.title:$t('strategy.websiteMaterial',{0:s.title})] as [string,string])]);}
export type Review=(id:string,change:{priority?:string;status?:string})=>Promise<void>;
export function PerformanceSummary({evidence}:{evidence:Evidence}){return <><section className="nr-metrics" aria-label={$t('strategy.websitePerformanceSummary')}>{summaryMetrics(evidence).map(m=><div className="nr-metric nr-overview-metric" key={m.label}><span>{m.label}</span><strong>{m.value===null?'—':m.value.toLocaleString(getCurrentLocale())}</strong><small>{m.value===null?$t('strategy.noDataYet'):m.percent!==null?$t('strategy.vsPreviousDays',{0:m.percent>=0?'+':'',1:m.percent.toFixed(1),2:evidence.periodDays}):m.comparable?$t('strategy.previousPeriodZeroNoChange'):$t('strategy.previousPeriodIncompleteNoChange')}</small></div>)}</section></>;}
// The overview shows one list: the latest 28-day analysis, supported evidence only, at most five items.
// The analysis the overview reports on: the newest batch for the period, signal-based (v3) or the earlier v2 format.
// Looking for v2 only made the page show an old run's time after daily analysis switched to v3.
export function latestBatch(state:StrategyState,periodDays:number):InsightBatch|undefined{return ([state.insights,...(state.insightHistory||[])] as (InsightBatch|undefined|null)[]).find(b=>b?.evidence.periodDays===periodDays&&(b.evidence.analysisVersion===2||b.evidence.analysisVersion===3))||undefined;}

export function SuggestionList({rows,busy,convert,review}:{rows:Row[];busy:boolean;convert:(row:Row)=>void;review:Review}){
 const [expanded,setExpanded]=useState<string|null>(null);
 return <div className="nr-suggestions">{rows.map((row,i)=><article className="nr-suggestion" key={row.card.id} data-opportunity-id={row.card.id}>
  <div className="nr-suggestion-line"><div className="nr-suggestion-text"><h3>{row.card.title}</h3><p>{row.card.observation}</p></div>
  <Button variant={i===0?'default':'outline'} disabled={busy} onClick={()=>convert(row)}>{$t('strategy.turnTask')}</Button>
  <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={$t('common.moreActions',{0:row.card.title})} disabled={busy}/>}><MoreHorizontal/></DropdownMenuTrigger><DropdownMenuContent align="end">
   <DropdownMenuItem onClick={()=>setExpanded(e=>e===row.card.id?null:row.card.id)}>{expanded===row.card.id?$t('strategy.hideEvidence'):$t('strategy.showEvidence')}</DropdownMenuItem>
   <DropdownMenuItem onClick={()=>void review(row.card.id,{status:'ignored'})}>{$t('common.ignore')}</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu></div>
  {expanded===row.card.id&&<div className="nr-suggestion-evidence">{(row.card.signalIds||[]).map(k=>row.batch.evidence.signals?.items.find(s=>s.key===k)).filter(Boolean).map(s=><div key={s!.key} className="nr-signal"><strong>{getSourceNames()[s!.source]||s!.source} · {s!.title}</strong>{s!.facts.map(f=><span key={f} className="nr-block nr-footnote">{f}</span>)}{s!.url&&<a className="nr-link nr-footnote" href={s!.url} target="_blank" rel="noreferrer">{$t('common.openPage')}</a>}</div>)}<p><strong>{$t('strategy.suggestion')}</strong>{row.card.suggestion}</p><p><strong>{$t('strategy.why')}</strong>{row.card.meaning}</p><p><strong>{$t('strategy.evidence')}</strong>{row.card.evidenceText}</p><p className="nr-footnote">{$tj('strategy.limitation',{0:row.card.limitation})}</p></div>}
 </article>)}</div>;
}
// Numbers people say: O-27 for an opportunity, T-41 for a task — both short numbers given in order of creation (task
// record ids are long generated numbers and are never shown).
export const oppNo=(card:{no?:number})=>card.no?`O-${card.no}`:'';
export const taskNo=(no?:number)=>no?`T-${no}`:'';
export const getSourceNames = (): Record<string,string> => ({gsc:'Search Console',ga4:'GA4',site:$t('common.websiteContent'),github:'GitHub','github-traffic':'GitHub Traffic',discourse:$t('common.communityForum'),packages:$t('common.downloads'),hackernews:'Hacker News',reddit:'Reddit',trends:'Google Trends',competitors:$t('common.competitorActivity'),x:'X','discord-slack':'Discord、Slack',discord:'Discord',slack:'Slack',rank:$t('common.rankTracking'),'ai-search':$t('common.aiSearch')});
// Where an opportunity comes from: the sources of its cited signals, else the sources the analysis named.
export function sourcesOf(row:Row){const ids=[...new Set(citedSignals(row).map(s=>s.source))];return (ids.length?ids:row.card.sources||[]).map(s=>getSourceNames()[s]||sourceLabels(row.batch).get(s)||s);}
// "本期观察": a few sentences grounded in signals; shown even when there is nothing to act on.
export function Observations({batch,generating}:{batch?:InsightBatch;generating:boolean}){const obs=batch?.evidence.analysisVersion===3?batch.observations||[]:[];const sig=batch?.evidence.signals;
 return <section className="nr-observations" aria-label={$t('strategy.periodObservations')}><h2>{$t('strategy.periodObservations')}</h2>{obs.length?<ul>{obs.map(o=><li key={o}>{o}</li>)}</ul>:<p className="nr-muted">{generating?$t('strategy.analyzingSignalsDataSource'):$t('strategy.noSignalBasedAnalysisYet')}</p>}
 {sig&&<p className="nr-footnote">{$tj('strategy.analysisUsedSignalsTotal',{0:Object.entries(sig.coverage).filter(([,v])=>v).map(([k,v])=>`${getSourceNames()[k]||k}（${v}）`).join('、')||$t('strategy.none'),1:sig.missing.length?$t('strategy.notConnectedNoData',{0:sig.missing.map(k=>getSourceNames()[k]||k).join('、')}):'',2:sig.items.length})}</p>}</section>;}
