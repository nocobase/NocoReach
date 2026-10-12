// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { shift } from './sync-data.js';
function periodDays(value=28){const n=Number(value);if(![7,28,90].includes(n))throw Object.assign(new Error(systemMessageText('evidencePeriod.value72890DayPeriods')),{status:400});return n;}
function summarize(rows,fields,end,days){
 const unique=[...new Map(rows.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&(!end||r.date<=end)).map(r=>[r.date,r])).values()].sort((a,b)=>a.date.localeCompare(b.date));
 const start=end?shift(end,1-days):null,previousEnd=start?shift(start,-1):null,previousStart=start?shift(start,-days):null;
 const selected=unique.filter(r=>start&&r.date>=start&&r.date<=end),prior=unique.filter(r=>previousStart&&r.date>=previousStart&&r.date<=previousEnd);
 const sum=(rs,f)=>rs.length&&rs.every(r=>Number.isFinite(r[f]))?rs.reduce((s,r)=>s+r[f],0):null;
 const metrics=Object.fromEntries(fields.map(f=>{const current=sum(selected,f),previous=sum(prior,f),comparable=selected.length===days&&prior.length===days&&current!==null&&previous!==null;return [f,{current,previous,comparable,change:comparable?current-previous:null,percent:comparable&&previous!==0?(current-previous)/previous*100:null}];}));
 return {from:selected[0]?.date||null,through:selected.at(-1)?.date||null,availableFrom:unique[0]?.date||null,availableDays:unique.length,days:selected.length,expectedDays:days,start,end,previousStart,previousEnd,previousDays:prior.length,metrics,...Object.fromEntries(fields.map(f=>[f,metrics[f].current]))};
}
function starEvidence(source,end,days){const samples=source.starHistory||[];const cutoff=end||source.capturedAt?.slice(0,10);const first=cutoff?shift(cutoff,-days):null;const at=d=>samples.filter(s=>s.at.slice(0,10)===d).at(-1);const latest=at(cutoff),baseline=at(first);return {metric:'netStars',currentTotal:source.items?.find(i=>i.type==='repository')?.stars??null,sampledAt:source.capturedAt,from:first,through:cutoff,baselineAt:baseline?.at||null,endSampleAt:latest?.at||null,netChange:latest&&baseline?latest.stars-baseline.stars:null,availableSamples:samples.length,limitation:systemMessageText('evidencePeriod.netChangeCalculatedSamplesBoth'),traffic:{status:'not_connected',reason:systemMessageText('evidencePeriod.repositoryViewsNeedRepositoryPermission')}};}
export { periodDays, summarize, starEvidence };