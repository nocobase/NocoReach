'use strict';
// 观察中 (2026-10-08 user decisions): a change the AI judged 先观察 is followed, not judged afresh each day. Its record
// keeps when watching started, the numbers then, what the AI is waiting for and the day it must decide by (at most 14
// days); every analysis gives these back to the AI, which compares them with today's numbers. A watch ends, with the
// reason kept for 最近结束: it became an opportunity, the AI found nothing to do (or the deadline came), the change is
// no longer there (back to normal; kept while its source has no data), or the person ignored it.
const DAY=86400000,MAX_DAYS=14,KEEP_ENDED_DAYS=30;
const day=iso=>String(iso||'').slice(0,10);
const addDays=(d,n)=>new Date(Date.parse(d)+n*DAY).toISOString().slice(0,10);
const clip=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
// The last day of watching: the AI's date when it is a date within the limit, otherwise the limit itself.
function deadline(value,since,maxDays=MAX_DAYS){const last=addDays(day(since),maxDays-1);return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>=day(since)&&value<=last?value:last;}
const daysWatched=(w,today)=>Math.max(1,Math.round((Date.parse(day(today))-Date.parse(day(w.since)))/DAY)+1);
const open=(state,key)=>{const w=state.watch?.[key];return w&&!w.ended?w:null;};
const activeKeys=state=>Object.values(state.watch||{}).filter(w=>!w.ended).map(w=>w.key);
// What the model reads about a change being watched (added to the signal in its input).
function watchInput(state,key,now){const w=open(state,key);if(!w)return undefined;const today=day(now);
 return {since:day(w.since),days:daysWatched(w,today),startFacts:w.startFacts,waitingFor:w.waitingFor,decideBy:w.decideBy,mustDecide:today>=w.decideBy};}
// At its deadline a watched change must be decided: a 先观察 then reads as 不用做.
function enforceDeadlines(state,reviews,now){const today=day(now);
 for(const [key,r] of Object.entries(reviews)){const w=open(state,key);if(w&&r.verdict==='watch'&&today>=w.decideBy)reviews[key]={verdict:'skip',reason:r.reason?`到期仍没有结论：${r.reason}`.slice(0,200):'到期仍没有结论，先不做'};}
 return reviews;}
function end(w,outcome,now,extra={}){w.ended={at:now,outcome,...extra};}
// The verdicts of an analysis (or of the changes judged afterwards) applied to the records.
function applyVerdicts(state,{signals,reviews,cards=[],now,maxDays=MAX_DAYS}){state.watch ||= {};const today=day(now);
 for(const s of signals){const r=reviews[s.key];if(!r)continue;const w=open(state,s.key);
  if(r.verdict==='watch'){
   if(!w)state.watch[s.key]={key:s.key,source:s.source,since:now,startTitle:s.title,startFacts:(s.facts||[]).slice(0,4),startChip:s.chip||null,waitingFor:clip(r.waitingFor,120),decideBy:deadline(r.decideBy,now,maxDays),lastSeen:now};
   else{w.lastSeen=now;if(clip(r.waitingFor,120))w.waitingFor=clip(r.waitingFor,120);if(r.decideBy)w.decideBy=deadline(r.decideBy,w.since,maxDays);}
  }else if(w){
   if(r.verdict==='do'){const card=cards.find(c=>(c.signalIds||[]).includes(s.key));end(w,'opportunity',now,{reason:r.reason||'',...(card?{opportunityId:card.id}:{})});}
   else end(w,today>=w.decideBy?'expired':'skip',now,{reason:r.reason||''});
  }
 }
 return state.watch;}
// After a full analysis: a watched change no longer found has gone back to normal, unless its source had no data.
function endMissing(state,{signals,missing=[],now}){const present=new Set(signals.map(s=>s.key));
 for(const w of Object.values(state.watch||{}))if(!w.ended&&!present.has(w.key)&&!missing.includes(w.source))end(w,'normal',now);
 for(const [k,w] of Object.entries(state.watch||{}))if(w.ended&&Date.parse(now)-Date.parse(w.ended.at)>KEEP_ENDED_DAYS*DAY)delete state.watch[k];
 return state.watch;}
// 忽略 ends a watch; 恢复 opens it again.
function ignore(state,key,now){const w=open(state,key);if(w)end(w,'ignored',now);}
function restore(state,key){const w=state.watch?.[key];if(w?.ended?.outcome==='ignored')delete w.ended;}
module.exports={MAX_DAYS,deadline,daysWatched,activeKeys,watchInput,enforceDeadlines,applyVerdicts,endMissing,ignore,restore};
