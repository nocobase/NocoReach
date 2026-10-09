// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { requireAccess, roleOf, assignedRoles, MEMBERS_KEY, NOCOBASE_ADMIN } from './policy.js';
// 设置 · 成员 (2026-10-08 user decision): people are added as users in the NocoBase admin; here an admin picks their
// NocoReach role — 管理员, 成员 or 未加入 (the default, so a NocoBase that allows sign-up does not open the data). NocoBase
// admins are always 管理员, and nobody changes their own role here. Kept in nrSnapshots (nr-members), for all projects.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const nameOf=u=>String(u.nickname||u.username||u.email||u.id);
class Members{
 constructor(p){this.p=p;}
 repo(name){return this.p.db.getRepository(name);}
 async users(){const rows=[];for(let offset=0;offset<2000;offset+=200){const page=await this.repo('users').find({appends:['roles'],sort:'id',limit:200,offset});rows.push(...page.map(r=>r.toJSON?r.toJSON():r));if(page.length<200)break;}return rows;}
 // Everyone in NocoBase with their role here; 管理员 first, then 成员, then 未加入.
 async list(){const assigned=await assignedRoles(this.p.db),order={admin:0,member:1};
  return (await this.users()).map(u=>{const locked=(u.roles||[]).some(r=>NOCOBASE_ADMIN.includes(r?.name)),set=assigned[String(u.id)];
   return {id:String(u.id),name:nameOf(u),account:String(u.username||u.email||''),role:locked?'admin':set==='admin'||set==='member'?set:null,locked};})
   .sort((a,b)=>(order[a.role]??2)-(order[b.role]??2)||Number(a.id)-Number(b.id));}
 // People who can own a task: everyone with a role.
 async joined(){return (await this.list()).filter(u=>u.role);}
 async setRole(actor,v){
  const id=String(v.userId||''),role=v.role==null||v.role===''?null:v.role;
  if(!/^[1-9]\d{0,15}$/.test(id))fail('成员标识不对');if(![null,'admin','member'].includes(role))fail('角色只能是管理员、成员或未加入');
  if(id===String(actor))fail('不能在这里改自己的角色',409);
  const target=(await this.list()).find(u=>u.id===id);if(!target)fail('没有这个用户',404);if(target.locked)fail('NocoBase 管理员固定是管理员',409);
  await this.p.db.sequelize.transaction(async transaction=>{
   await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:MEMBERS_KEY},transaction});
   const repo=this.repo('nrSnapshots'),row=await repo.findOne({filter:{key:MEMBERS_KEY},transaction}),users={...(row?.get('payload')?.users||{})};
   if(role)users[id]=role;else delete users[id];
   const payload={users,updatedAt:new Date().toISOString(),updatedBy:String(actor)};
   if(row)await repo.update({filterByTk:row.id,values:{payload},transaction});else await repo.create({values:{key:MEMBERS_KEY,payload},transaction});
  });
  return this.list();}
 register(){
  const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{ctx.body=await fn(ctx.action.params.values||{},ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'成员没有保存，请稍后重试。');}};
  // Who you are here; answered for people who have not joined too, so the portal can say so.
  const me=async(ctx,next)=>{if(!ctx.auth?.user?.id)ctx.throw(401,'请先登录');const u=ctx.auth.user;ctx.body={id:String(u.id),name:nameOf(u),role:await roleOf(ctx.db||ctx.app?.db,u.id,ctx.state?.currentRoles||[])};await next();};
  const actions={me,list:wrap(()=>this.list()),setRole:wrap((v,ctx)=>this.setRole(ctx.auth.user.id,v))};
  this.p.app.resourceManager.define({name:'nrMembers',actions});this.p.app.acl.allow('nrMembers',Object.keys(actions),'loggedIn');}
}
export { Members };