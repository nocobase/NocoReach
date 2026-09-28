'use strict';
function projectId(value){const v=String(value||'');if(!/^[1-9]\d{0,15}$/.test(v))throw Object.assign(new Error('项目标识无效'),{status:400});return v;}
function secretKey(id){return `NOREACH_GOOGLE_REFRESH_${projectId(id)}`;}
function requireAdmin(ctx){if(!ctx.auth?.user?.id)ctx.throw(401,'请先登录');if(!(ctx.state.currentRoles||[]).some(r=>['root','admin'].includes(r)))ctx.throw(403,'当前接入试运行仅开放给管理员');}
function callbackUri(base){const u=new URL(base);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname))))throw Object.assign(new Error('回调基址必须是 HTTPS 源地址，本机允许 HTTP'),{status:400});return u.origin+'/api/nrGoogle:callback';}
module.exports={projectId,secretKey,requireAdmin,callbackUri};
