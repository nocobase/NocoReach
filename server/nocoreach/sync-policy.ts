// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.

// Shared sync schedule for non-Google sources (SPEC §11 数据健康): one success per day, backoff after failures.
// The first retry comes after 15 minutes: most failures are a network that was briefly away.
const BACKOFF_HOURS=[0.25,1,3,6];
const day=d=>new Date(d).toISOString().slice(0,10);
function due(last,now=Date.now()){if(!last?.at)return true;if(last.ok)return day(last.at)!==day(now);const wait=BACKOFF_HOURS[Math.min(Math.max((last.attempts||1)-1,0),BACKOFF_HOURS.length-1)];return now-Date.parse(last.at)>=wait*3600000;}
function nextAt(last,now=Date.now()){if(!last?.at)return new Date(now).toISOString();if(last.ok){const d=new Date(day(last.at)+'T00:00:00Z');return new Date(d.getTime()+86400000).toISOString();}const wait=BACKOFF_HOURS[Math.min(Math.max((last.attempts||1)-1,0),BACKOFF_HOURS.length-1)];return new Date(Date.parse(last.at)+wait*3600000).toISOString();}
// Record an attempt: success resets the counter and moves lastSuccessAt; failure keeps the last good time.
// Records written before lastSuccessAt existed count their own time when they succeeded.
const lastSuccess=last=>last?.lastSuccessAt||(last?.ok?last.at:null)||null;
// A failure caused by the network (no DNS answer, connection refused or reset, timeout) is said plainly, so it is not
// mistaken for a problem with the source; the raw technical text is not shown.
const NETWORK=/fetch failed|socket hang up|getaddrinfo|\b(NR_NETWORK_ERROR|ENOTFOUND|EAI_AGAIN|ETIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ENETDOWN|ECONNABORTED|UND_ERR_[A-Z_]+)\b/;
const NETWORK_TEXT='网络不可用，稍后会自动重试';
const isNetworkError=e=>Boolean(e&&(NETWORK.test(String(e.code||''))||NETWORK.test(String(e.cause?.code||''))||NETWORK.test(String(e.message||e))));
const plainError=t=>{const s=String(t),i=s.indexOf('：');return NETWORK.test(s)?(i>0?`${s.slice(0,i)}：${NETWORK_TEXT}`:NETWORK_TEXT):s;};
function record(prev,{at,ok,errors}){return {at,ok,errors:[...new Set((errors||[]).map(plainError))].slice(0,5),attempts:ok?0:(prev&&!prev.ok?(prev.attempts||1)+1:1),lastSuccessAt:ok?at:lastSuccess(prev)};}
export { due, nextAt, record, lastSuccess, BACKOFF_HOURS, day, isNetworkError, plainError, NETWORK_TEXT };