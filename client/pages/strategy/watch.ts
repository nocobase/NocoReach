// 观察中 (2026-10-08 user requests): the changes the daily analysis judged 先观察, kept together on 机会. The server keeps
// a record of each watch (state.watch: since, the numbers then, what the AI waits for, the deadline, how it ended); the
// verdict of each day is read back through the earlier analyses, since a change keeps its key from day to day.
import type {StrategyState,WatchRecord} from './model';
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
// The day the latest analysis ran: watching is counted in analysis days, as on the server.
export const analysisDay=(state:StrategyState)=>String(state.insights?.generatedAt||new Date().toISOString()).slice(0,10);
export const daysBetween=(from:string,to:string)=>Math.max(1,Math.round((Date.parse(to.slice(0,10))-Date.parse(from.slice(0,10)))/DAY)+1);
export const watchOf=(state:StrategyState,key:string):WatchRecord|undefined=>{const w=state.watch?.[key];return w&&!w.ended?w:undefined;};
// Days watched: from the record (since 2026-10-08), else read back from the verdicts of earlier analyses.
export function watchDays(state:StrategyState,key:string):number{const w=watchOf(state,key);return w?daysBetween(w.since,analysisDay(state)):watchedDays(verdictsOf(state,key));}
// 最近结束: watches that ended in the last 7 days, latest first.
export function recentlyEnded(state:StrategyState,days=7):WatchRecord[]{const today=Date.parse(analysisDay(state));
 return Object.values(state.watch||{}).filter(w=>w.ended&&today-Date.parse(w.ended.at.slice(0,10))<days*DAY).sort((a,b)=>b.ended!.at.localeCompare(a.ended!.at));}
