// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.

function projectId(value){const v=String(value||'');if(!/^[1-9]\d{0,15}$/.test(v))throw Object.assign(new Error('项目标识无效'),{status:400});return v;}
function secretKey(id){return `NOREACH_GOOGLE_REFRESH_${projectId(id)}`;}
// Roles (2026-10-08): NocoBase root/admin users are always 管理员; anyone else is 管理员 or 成员 once an admin picks a role
// in 设置 · 成员, and cannot use NocoReach before that (a NocoBase that allows sign-up must not open the data to strangers).
const NOCOBASE_ADMIN=['root','admin'],MEMBERS_KEY='nr-members';
const payloadOf=r=>r?.get?r.get('payload'):r?.payload;
async function assignedRoles(db){return payloadOf(await db.getRepository('nrSnapshots').findOne({filter:{key:MEMBERS_KEY}}))?.users||{};}
async function roleOf(db,userId,currentRoles=[]){
 if(!userId)return null;if(currentRoles.some(r=>NOCOBASE_ADMIN.includes(r)))return 'admin';if(!db?.getRepository)return null;
 const row=await db.getRepository('users').findOne({filterByTk:userId,appends:['roles']}),user=row?.toJSON?row.toJSON():row;
 if(!user)return null;if((user.roles||[]).some(r=>NOCOBASE_ADMIN.includes(r?.name)))return 'admin';
 const role=(await assignedRoles(db))[String(userId)];return role==='admin'||role==='member'?role:null;
}
// Settings only 管理员 can change (数据接入, AI 团队, 分析规则, 成员, projects); members can do everything else, and a task's
// review steps are limited to its owner and 管理员 in the task service.
const ADMIN_ONLY={
 nrProxyProfiles:['list','get','save','remove','test','selections','select','testConnection'],
 nrGoogle:['configure','authorize','resources','select','disconnect','syncNow','syncControl'],
 nrCommunity:['preview','connect','sync','disconnect'],nrHackerNews:['preview','connect','sync','disconnect'],
 nrGitHub:['preview','connect','sync','backfill','setToken','removeToken','disconnect'],nrPackages:['preview','add','remove','sync'],
 nrSources:['preview','save','refresh','disconnect'],nrChat:['inspect','connect','disconnect','sync'],
 nrReddit:['connect','disconnect'],nrX:['connect','disconnect'],nrTrends:['connect','disconnect'],
 nrSiteContent:['discover','confirm','remove','refresh'],nrDiscovery:['discover'],nrKeywords:['configure','disconnect'],
 nrAgent:['select','saveRepo','removeRepo'],
 nrPlaybooks:['save','copy','remove','restore','draft'],
 nrSkills:['create','import','readLink','importLink','edit','addFiles','removeFile','remove','setEnabled'],
 nrKnowledge:['add','edit','remove','saveMemory'],nrKnowledgeAdd:['suggest','confirm'],nrMemory:['draft','check','accept','dismiss'],
 nrProjects:['create','edit'],nrAnalysisRules:['save'],nrMembers:['setRole'],
};
const adminOnly=(resource,action)=>Boolean(ADMIN_ONLY[resource]?.includes(action));
async function requireAccess(ctx){
 if(!ctx.auth?.user?.id)ctx.throw(401,'请先登录');
 const role=await roleOf(ctx.db||ctx.app?.db,ctx.auth.user.id,ctx.state?.currentRoles||[]);
 if(!role)ctx.throw(403,'你还没有加入 NocoReach：请管理员在“设置 · 成员”里给你选角色');
 if(role!=='admin'&&adminOnly(ctx.action?.resourceName,ctx.action?.actionName))ctx.throw(403,'只有管理员能修改设置');
 ctx.state.nrRole=role;return role;
}
// Where Google sends the browser back after consent: the NocoReach route under the app's base path on NocoBase 3
// (classic: /api/nrGoogle:callback). Set once at start by the NocoReach provider.
let callbackPath='/main/api/nocoreach/nrGoogle/callback';
const CALLBACK_PATH=()=>callbackPath;
function setCallbackPath(path){callbackPath=path;}
function callbackUri(base){const u=new URL(base);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname))))throw Object.assign(new Error('回调基址必须是 HTTPS 源地址，本机允许 HTTP'),{status:400});return u.origin+callbackPath;}
// An AI suggestion that did not come back: say so plainly when online AI is simply not connected yet (409 from the
// provider), otherwise the caller's message. Never retried.
const aiFail=(e,message)=>{throw Object.assign(new Error(e?.status===409?'还没有接入在线 AI：先在 AI 团队 → 模型里配置':message),{status:e?.status===409?409:502});};
export { projectId, secretKey, requireAccess, roleOf, adminOnly, assignedRoles, MEMBERS_KEY, NOCOBASE_ADMIN, callbackUri, aiFail, CALLBACK_PATH, setCallbackPath };