import { $t } from "#i18n";
import type {Work} from './task-execution-types';
// Mirrors plugins/connections/server/execution/effect.ts: results are computed on the server, shown here.
export type EffectResult={day:number;baseline:{start:string;end:string};after:{start:string;end:string};pages:string[];gsc?:{clicks:[number,number];impressions:[number,number];ctr:[number,number];position:[number,number]};ga4?:{views:[number,number];conversions:[number,number]};primary:'clicks'|'views'|null;change:number|null;conclusion:'insufficient'|'flat'|'up'|'down';notes:string[];computedAt:string};
export const CHECKPOINTS=[7,28];
export const getConclusionLabels = (): Record<EffectResult['conclusion'],string> => ({insufficient:$t("数据不足"),flat:$t("无明显变化"),up:$t("上升"),down:$t("下降")});
const shift=(date:string,n:number)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const md=(date:string)=>{const [,m,d]=date.split('-');return `${Number(m)}/${Number(d)}`;};
export function effectLine(r:EffectResult){
 if(r.conclusion==='insufficient'||!r.primary||r.change===null)return $t("第 {0} 天：数据不足",{0:r.day});
 const [b,a]=r.primary==='clicks'?r.gsc!.clicks:r.ga4!.views,p=Math.round(r.change*100);
 return $t("第 {0} 天：{1}，{2} {3} → {4}（{5}{6}%）",{0:r.day,1:getConclusionLabels()[r.conclusion],2:r.primary==='clicks'?$t("搜索点击"):$t("浏览量"),3:b,4:a,5:p>0?'+':'',6:p});
}
// Pages the observation compares: released pages, the published page and the linked page (same as the server).
export function effectPages(w:Partial<Work>){const ok=(u?:string)=>{try{return u&&new URL(u).protocol==='https:'?u:'';}catch{return '';}};return [...new Set([...(w.release?.pages||[]),w.receipt?.url,w.page?.url].map(ok).filter(Boolean) as string[])];}
// Each checkpoint: its result, or the day it is expected (Google data arrives about three days late).
export function effectItems(w:Partial<Work>){
 if(!w.observeFrom)return [];
 const from=new Date(w.observeFrom).toISOString().slice(0,10),results=((w as {observation?:{results:EffectResult[]}}).observation?.results)||[];
 return CHECKPOINTS.map(day=>({day,result:results.find(r=>r.day===day),expected:md(shift(from,day+3))}));
}
export const latestEffect=(w:Partial<Work>)=>{const items=effectItems(w),done=items.filter(i=>i.result);return done.length?done[done.length-1].result:undefined;};
export {md as monthDay};
