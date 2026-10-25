import { $t } from '#i18n';
import { formatDate } from '#lib/format';
import type {Work} from './task-execution-types';
import { safeConclusion, metricValues, matchesObservation } from '../../shared/result-comparison.js';
// Mirrors plugins/connections/server/execution/effect.ts: results are computed on the server, shown here.
export type EffectResult=import('../../server/nocoreach/execution/effect.js').EffectResult;
export const CHECKPOINTS=[7,28];
export const getConclusionLabels = (): Record<EffectResult['conclusion'],string> => ({insufficient:$t('effect.notEnoughData'),flat:$t('effect.noClearChange'),up:$t('effect.up'),down:$t('effect.down')});
const shift=(date:string,n:number)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const md=(date:string)=>formatDate(date,{withYear:false});
export function effectLine(r:EffectResult,observeFrom?:string){
 if(observeFrom&&!matchesObservation(r,observeFrom))return $t('results.batchUnverified');
 if(safeConclusion(r)==='insufficient'||!r.primary)return $t('common.dayNotEnoughData',{0:r.day});
 if(r.change===null){const v=metricValues(r,r.primary==='clicks'?'gsc':'ga4',r.primary);return $t('results.absoluteSummary',{0:r.day,1:getConclusionLabels()[safeConclusion(r)],2:v.before??'—',3:v.after??'—',4:v.difference??'—'});}
 const [b,a]=r.primary==='clicks'?r.gsc!.clicks:r.ga4!.views,p=Math.round(r.change*100);
 return $t('effect.day',{0:r.day,1:getConclusionLabels()[r.conclusion],2:r.primary==='clicks'?$t('common.searchClicks'):$t('common.viewCount'),3:b,4:a,5:p>0?'+':'',6:p});
}
// Pages the observation compares: released pages, the published page and the linked page (same as the server).
export function effectPages(w:Partial<Work>){const ok=(u?:string)=>{try{return u&&new URL(u).protocol==='https:'?u:'';}catch{return '';}};return [...new Set([...(w.release?.pages||[]),w.receipt?.url,w.page?.url].map(ok).filter((value): value is string => Boolean(value)))];}
// Each checkpoint: its result, or the day it is expected (Google data arrives about three days late).
export function effectItems(w:Partial<Work>){
 if(!w.observeFrom)return [];
 const from=new Date(w.observeFrom).toISOString().slice(0,10),results=((w as {observation?:{results:EffectResult[]}}).observation?.results)||[];
 return CHECKPOINTS.map(day=>({day,result:results.find(r=>r.day===day),expected:md(shift(from,day+3))}));
}
export const latestEffect=(w:Partial<Work>)=>{const items=effectItems(w),done=items.filter(i=>i.result);return done.length?done[done.length-1].result:undefined;};
export {md as monthDay};
