// 观察中 (2026-10-08 user request): the changes the daily analysis judged 先观察, kept together on 机会 and counted in days.
// A change keeps its key from day to day, so its verdicts can be read back through the earlier analyses: how long it has
// been watched in a row, and what the AI said each day. Nothing is stored for this; it is read from the analyses.
import type {StrategyState} from './model';
export type Verdict={day:string;at:string;verdict:'do'|'watch'|'skip';reason:string};
const DAY=86400000;
// The verdicts on one change, newest first, one per day (the last analysis of that day).
export function verdictsOf(state:StrategyState,key:string,limit=60):Verdict[]{
 const out:Verdict[]=[];
 for(const b of [state.insights,...(state.insightHistory||[])].slice(0,limit)){
  const r=b?.signalReviews?.[key];if(!b||!r)continue;
  const day=String(b.generatedAt).slice(0,10);
  if(out.some(v=>v.day===day))continue;
  out.push({day,at:b.generatedAt,verdict:r.verdict,reason:r.reason});
 }
 return out;
}
// Days watched in a row up to the latest verdict (1 = it started today); 0 when the latest verdict is not 先观察.
export function watchedDays(verdicts:Verdict[]):number{
 if(verdicts[0]?.verdict!=='watch')return 0;
 let first=verdicts[0];
 for(const v of verdicts){if(v.verdict!=='watch')break;first=v;}
 return Math.round((Date.parse(verdicts[0].day)-Date.parse(first.day))/DAY)+1;
}
