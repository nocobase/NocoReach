import { $t } from "#i18n";
import { formatCount, formatDate } from '#lib/format';
import type {Work} from './task-execution-types';
import { safeConclusion, metricValues, matchesObservation, sourceOf, type EffectMetric, type Lacking } from '../../shared/result-comparison.js';
// Mirrors plugins/connections/server/execution/effect.ts: results are computed on the server, shown here.
export type EffectResult=import('../../server/nocoreach/execution/effect.js').EffectResult;
export const CHECKPOINTS=[7,28];
export const getConclusionLabels = (): Record<EffectResult['conclusion'],string> => ({insufficient:$t('effect.notEnoughData'),flat:$t('effect.noClearChange'),up:$t('effect.up'),down:$t('effect.down')});
const shift=(date:string,n:number)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const md=(date:string)=>formatDate(date,{withYear:false});
// The metric a change was judged by: its full name in sentences, its short name in the status chip.
export const metricName=(m:EffectMetric)=>$t(({clicks:'common.searchClicks',impressions:'common.searchImpressions',views:'common.viewCount'} as const)[m]);
const metricShort=(m:EffectMetric)=>$t(({clicks:'common.clicks',impressions:'common.impressions',views:'common.views'} as const)[m]);
// The pair of numbers the conclusion rests on.
export const judgedPair=(r:EffectResult):[number,number]|undefined=>r.primary==='views'?r.ga4?.views:r.primary?r.gsc?.[r.primary]:undefined;
export function effectLine(r:EffectResult,observeFrom?:string){
 if(observeFrom&&!matchesObservation(r,observeFrom))return $t('results.batchUnverified');
 if(safeConclusion(r)==='insufficient'||!r.primary)return $t('common.dayNotEnoughData',{0:r.day});
 if(r.change===null){const v=metricValues(r,sourceOf(r.primary),r.primary);return $t('results.absoluteSummary',{0:r.day,1:getConclusionLabels()[safeConclusion(r)],2:v.before??'—',3:v.after??'—',4:v.difference??'—'});}
 const [b,a]=judgedPair(r)!,p=Math.round(r.change*100);
 return $t('effect.day',{0:r.day,1:getConclusionLabels()[r.conclusion],2:metricName(r.primary),3:b,4:a,5:p>0?'+':'',6:p});
}
// Why a change has too little data to judge, in the numbers there were (shared/result-comparison.ts lacking).
export function lackingText(l:Lacking){
 const n=(v:number)=>formatCount(v);
 if(l.impressions!==undefined&&l.views!==undefined)return $t('effect.tooLittleBoth',{0:l.day,1:n(l.impressions),2:n(l.views)});
 if(l.impressions!==undefined)return $t('effect.tooLittleImpressions',{0:l.day,1:n(l.impressions)});
 if(l.views!==undefined)return $t('effect.tooLittleViews',{0:l.day,1:n(l.views)});
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
// The effect without its day, in a few words: "Clicks ↑ 26%", "not enough data", "no clear change". The status chip (task-list-model.ts
// effectChip) and the effect's line in Activity (playbook-model.ts eventText) both read it, so the two say the same.
export function effectSummary(r:EffectResult){
 if(safeConclusion(r)==='insufficient'||!r.primary)return $t('taskList.notEnoughData');
 if(r.conclusion==='flat')return $t('taskList.noClearChange');
 const arrow=r.conclusion==='up'?'↑':'↓';
 // From nothing before there is no percentage: the count it rose to.
 if(r.change===null)return $t('taskList.effectChangeCount',{0:metricShort(r.primary),1:arrow,2:formatCount(Math.abs((judgedPair(r)?.[1]??0)-(judgedPair(r)?.[0]??0)))});
 return $t('taskList.effectChange',{0:metricShort(r.primary),1:arrow,2:Math.round(Math.abs(r.change)*100)});
}
export const latestEffect=(w:Partial<Work>)=>{const items=effectItems(w),done=items.filter(i=>i.result);return done.length?done[done.length-1].result:undefined;};
export {md as monthDay};
