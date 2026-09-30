'use strict';
// Shared sync schedule for non-Google sources (SPEC §11 数据健康): one success per day, backoff after failures.
const BACKOFF_HOURS=[1,3,6];
const day=d=>new Date(d).toISOString().slice(0,10);
function due(last,now=Date.now()){if(!last?.at)return true;if(last.ok)return day(last.at)!==day(now);const wait=BACKOFF_HOURS[Math.min(Math.max((last.attempts||1)-1,0),BACKOFF_HOURS.length-1)];return now-Date.parse(last.at)>=wait*3600000;}
function nextAt(last,now=Date.now()){if(!last?.at)return new Date(now).toISOString();if(last.ok){const d=new Date(day(last.at)+'T00:00:00Z');return new Date(d.getTime()+86400000).toISOString();}const wait=BACKOFF_HOURS[Math.min(Math.max((last.attempts||1)-1,0),BACKOFF_HOURS.length-1)];return new Date(Date.parse(last.at)+wait*3600000).toISOString();}
// Record an attempt: success resets the counter and moves lastSuccessAt; failure keeps the last good time.
// Records written before lastSuccessAt existed count their own time when they succeeded.
const lastSuccess=last=>last?.lastSuccessAt||(last?.ok?last.at:null)||null;
function record(prev,{at,ok,errors}){return {at,ok,errors:(errors||[]).slice(0,5),attempts:ok?0:(prev&&!prev.ok?(prev.attempts||1)+1:1),lastSuccessAt:ok?at:lastSuccess(prev)};}
module.exports={due,nextAt,record,lastSuccess,BACKOFF_HOURS,day};
