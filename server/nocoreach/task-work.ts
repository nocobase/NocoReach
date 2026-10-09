// @ts-nocheck
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function text(v,max=30000){if(typeof v!=='string'||!v.trim()||v.length>max)fail('请填写完整内容，并检查长度');return v.trim();}
function planInput(v){if(!v||!Array.isArray(v.steps)||!v.steps.length||v.steps.length>6)fail('执行方案需要 1–6 个步骤');return {deliverable:text(v.deliverable,2000),verification:text(v.verification,3000),steps:v.steps.map(s=>({title:text(s.title,200),owner:s.owner==='ai'?'ai':'human',instruction:text(s.instruction,5000),acceptance:text(s.acceptance,2000)}))};}
const initial=()=>({revision:0,stage:'plan',plan:null,step:0,results:[],history:[],operations:[],receipt:null,verification:null});
function transition(w,v,now,actor){
 const event={at:now,actor,action:v.command,stage:w.stage,step:w.step};
 if(v.command==='savePlan'){if(w.stage!=='plan')fail('请先返回方案阶段',409);if(w.plan)event.previous=w.plan;w.plan=planInput(v.plan);}
 else if(v.command==='approvePlan'){if(w.stage!=='plan'||!w.plan)fail('请先保存执行方案',409);w.stage='work';}
 else if(v.command==='saveResult'){if(w.stage!=='work')fail('当前不在成果阶段',409);const previous=w.results[w.step];if(previous)event.previous=previous;w.results[w.step]={content:text(v.content),savedAt:now};}
 else if(v.command==='approveResult'){if(w.stage!=='work'||!w.results[w.step])fail('请先保存当前成果',409);w.results[w.step].approvedAt=now;w.results[w.step].approvedBy=actor;event.approved=w.results[w.step];w.step++;if(w.step>=w.plan.steps.length)w.stage='execution';}
 else if(v.command==='recordExecution'){if(w.stage!=='execution')fail('须先审核全部成果',409);let url='';if(v.url){try{const u=new URL(v.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error();url=u.href;}catch{fail('请填写有效的执行结果网址');}}w.receipt={note:text(v.note,5000),url,recordedAt:now,recordedBy:actor};w.stage='verification';}
 else if(v.command==='verify'){if(w.stage!=='verification')fail('请先记录实际执行结果',409);if(!['met','unmet','inconclusive'].includes(v.outcome))fail('请选择验证结论');if(w.verification)event.previous=w.verification;w.verification={outcome:v.outcome,note:text(v.note,10000),at:now};if(v.outcome!=='inconclusive')w.stage='done';}
 else if(v.command==='replan'){if(!w.plan)fail('尚无需要调整的方案');event.previous={plan:w.plan,results:w.results,receipt:w.receipt,verification:w.verification};w.stage='plan';w.step=0;w.results=[];w.receipt=null;w.verification=null;}
 else fail('不支持此操作');
 w.history.push(event);return w;
}
class TaskWork{
 constructor(p){this.p=p;}
 async task(id,taskId,transaction){if(!/^\d+$/.test(String(taskId)))fail('任务编号无效');const row=await this.p.db.getRepository('nrTasks').findOne({filter:{id:taskId,projectId:id},transaction});if(!row)fail('任务不存在或不属于当前项目',404);return row;}
 async get(id,taskId){const task=(await this.task(id,taskId)).toJSON();return {task,work:task.evidence?.work||initial()};}
 async update(id,v,actor){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:`nr-task:${id}:${v.taskId}`},transaction});const row=await this.task(id,v.taskId,transaction),task=row.toJSON(),evidence=task.evidence||{},work=structuredClone(evidence.work||initial());if(!/^[-a-zA-Z0-9]{20,80}$/.test(v.requestId||''))fail('请求标识无效');if(work.operations.includes(v.requestId))return {task,work};if(v.revision!==work.revision)fail('任务已在其他窗口更新，请刷新后再保存，编辑内容仍保留。',409);transition(work,v,new Date().toISOString(),String(actor));work.revision++;work.operations.push(v.requestId);const values={evidence:{...evidence,work},status:work.stage==='done'?'已完成':work.stage==='plan'?'待处理':'进行中'};await this.p.db.getRepository('nrTasks').update({filterByTk:row.id,values,transaction});return {task:{...task,...values},work};});}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'任务请求未完成，编辑内容保留，请稍后重试。');}};this.p.app.resourceManager.define({name:'nrTaskWork',actions:{get:wrap((id,v)=>this.get(id,v.taskId)),advance:wrap((id,v,c)=>this.update(id,v,c.auth.user.id))}});this.p.app.acl.allow('nrTaskWork',['get','advance'],'loggedIn');}
}
export { TaskWork, initial, transition, planInput };