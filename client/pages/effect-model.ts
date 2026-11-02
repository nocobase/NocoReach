import { $t, getCurrentLocale } from "#i18n";
import { formatChange, formatCount, formatDate } from '#lib/format';
import type {Work} from './task-execution-types';
import { safeConclusion, matchesObservation, JUDGED_METRICS, type EffectMetric, type Lacking } from '../../shared/result-comparison.js';
// Mirrors plugins/connections/server/execution/effect.ts: results are computed on the server, shown here.
export type EffectResult=import('../../server/nocoreach/execution/effect.js').EffectResult;
export const CHECKPOINTS=[7,28];
export const getConclusionLabels = (): Record<EffectResult['conclusion'],string> => ({insufficient:$t('effect.notEnoughData'),flat:$t('effect.noClearChange'),up:$t('effect.up'),down:$t('effect.down')});
const shift=(date:string,n:number)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const md=(date:string)=>formatDate(date,{withYear:false});
// The metric a change was judged by, named the same wherever a result is written (2026-11-02): Search clicks, Search
// impressions, Views.
export const metricName=(m:EffectMetric)=>$t(({clicks:'common.searchClicks',impressions:'common.searchImpressions',views:'common.viewCount'} as const)[m]);
// How much it changed, written the same everywhere: "↑ 208%", "↓ 29%"; from nothing before, the count it rose to: "↑ 240".
export const changeText=(before:number,after:number)=>before>0?formatChange((after-before)/before):`${after>before?'↑ ':after<before?'↓ ':''}${formatCount(Math.abs(after-before))}`;
// The pair of numbers the conclusion rests on.
export const judgedPair=(r:EffectResult):[number,number]|undefined=>r.primary==='views'?r.ga4?.views:r.primary?r.gsc?.[r.primary]:undefined;
// "Day 7: Up · Search impressions 170 → 524 · ↑ 208%", as the server's summary writes it for the Agent (execution/effect.ts).
export function effectLine(r:EffectResult,observeFrom?:string){
 if(observeFrom&&!matchesObservation(r,observeFrom))return $t('results.batchUnverified');
 const pair=judgedPair(r);
 if(safeConclusion(r)==='insufficient'||!r.primary||!pair)return $t('common.dayNotEnoughData',{0:r.day});
 const [b,a]=pair;
 return $t('effect.dayLine',{0:r.day,1:getConclusionLabels()[r.conclusion],2:metricName(r.primary),3:formatCount(b),4:formatCount(a),5:changeText(b,a)});
}
// Why a change has too little data to judge, in the numbers there were (shared/result-comparison.ts lacking): "Search clicks
// 19, Search impressions 35, Views 6 in the 7 days before and after going live, too few to judge".
export function lackingText(l:Lacking){
 const totals=JUDGED_METRICS.filter(({metric})=>l[metric]!==undefined).map(({metric})=>`${metricName(metric)} ${formatCount(l[metric]!)}`);
 if(totals.length)return $t('effect.tooLittleTotals',{0:l.day,1:totals.join(getCurrentLocale().startsWith('zh')?'、':', ')});
 return $t(l.missingDays?'effect.tooManyMissingDaysJudge':'effect.noSearchTrafficDataPage');
}
// Pages the observation compares: released pages, the published page and the linked page (same as the server).
export function effectPages(w:Partial<Work>){const ok=(u?:string)=>{try{return u&&new URL(u).protocol==='https:'?u:'';}catch{return '';}};return [...new Set([...(w.release?.pages||[]),w.receipt?.url,w.page?.url].map(ok).filter(Boolean) as string[])];}
// Each checkpoint: its result, or the day it is expected (Google data arrives about three days late).
export function effectItems(w:Partial<Work>){
 if(!w.observeFrom)return [];
 const from=new Date(w.observeFrom).toISOString().slice(0,10),results=((w as {observation?:{results:EffectResult[]}}).observation?.results)||[];
 return CHECKPOINTS.map(day=>({day,result:results.find(r=>r.day===day),expected:md(shift(from,day+3))}));
}
// The effect without its day, in a few words: "Search clicks ↑ 26%", "not enough data", "no clear change". The status chip
// (task-list-model.ts effectChip) and the effect's line in Activity (playbook-model.ts eventText) both read it, so the two say the same.
export function effectSummary(r:EffectResult){
 const pair=judgedPair(r);
 if(safeConclusion(r)==='insufficient'||!r.primary||!pair)return $t('taskList.notEnoughData');
 if(r.conclusion==='flat')return $t('taskList.noClearChange');
 return $t('taskList.effectChange',{0:metricName(r.primary),1:changeText(pair[0],pair[1])});
}
export const latestEffect=(w:Partial<Work>)=>{const items=effectItems(w),done=items.filter(i=>i.result);return done.length?done[done.length-1].result:undefined;};
export {md as monthDay};
