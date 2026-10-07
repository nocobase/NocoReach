'use strict';
function projectId(value){const v=String(value||'');if(!/^[1-9]\d{0,15}$/.test(v))throw Object.assign(new Error('项目标识无效'),{status:400});return v;}
function secretKey(id){return `NOREACH_GOOGLE_REFRESH_${projectId(id)}`;}
function requireAdmin(ctx){if(!ctx.auth?.user?.id)ctx.throw(401,'请先登录');if(!(ctx.state.currentRoles||[]).some(r=>['root','admin'].includes(r)))ctx.throw(403,'当前接入试运行仅开放给管理员');}
function callbackUri(base){const u=new URL(base);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname))))throw Object.assign(new Error('回调基址必须是 HTTPS 源地址，本机允许 HTTP'),{status:400});return u.origin+'/api/nrGoogle:callback';}
// An AI suggestion that did not come back: say so plainly when online AI is simply not connected yet (409 from the
// provider), otherwise the caller's message. Never retried.
const aiFail=(e,message)=>{throw Object.assign(new Error(e?.status===409?'还没有接入在线 AI：先在 AI 团队 → Agent 里接入':message),{status:e?.status===409?409:502});};
module.exports={projectId,secretKey,requireAdmin,callbackUri,aiFail};
