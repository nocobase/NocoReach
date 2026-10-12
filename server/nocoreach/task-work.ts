// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function text(v,max=30000){if(typeof v!=='string'||!v.trim()||v.length>max)fail(systemMessageText('taskWork.fillFullContentCheckLength'));return v.trim();}
function planInput(v){if(!v||!Array.isArray(v.steps)||!v.steps.length||v.steps.length>6)fail(systemMessageText('taskWork.planNeeds16Steps'));return {deliverable:text(v.deliverable,2000),verification:text(v.verification,3000),steps:v.steps.map(s=>({title:text(s.title,200),owner:s.owner==='ai'?'ai':'human',instruction:text(s.instruction,5000),acceptance:text(s.acceptance,2000)}))};}
const initial=()=>({revision:0,stage:'plan',plan:null,step:0,results:[],history:[],operations:[],receipt:null,verification:null});
function transition(w,v,now,actor){
 const event={at:now,actor,action:v.command,stage:w.stage,step:w.step};
 if(v.command==='savePlan'){if(w.stage!=='plan')fail(systemMessageText('taskWork.goBackPlanStageFirst'),409);if(w.plan)event.previous=w.plan;w.plan=planInput(v.plan);}
 else if(v.command==='approvePlan'){if(w.stage!=='plan'||!w.plan)fail(systemMessageText('taskWork.saveExecutionPlanFirst'),409);w.stage='work';}
 else if(v.command==='saveResult'){if(w.stage!=='work')fail(systemMessageText('taskWork.notDeliverableStage'),409);const previous=w.results[w.step];if(previous)event.previous=previous;w.results[w.step]={content:text(v.content),savedAt:now};}
 else if(v.command==='approveResult'){if(w.stage!=='work'||!w.results[w.step])fail(systemMessageText('taskWork.saveCurrentDeliverableFirst'),409);w.results[w.step].approvedAt=now;w.results[w.step].approvedBy=actor;event.approved=w.results[w.step];w.step++;if(w.step>=w.plan.steps.length)w.stage='execution';}
 else if(v.command==='recordExecution'){if(w.stage!=='execution')fail(systemMessageText('taskWork.deliverablesReviewedFirst'),409);let url='';if(v.url){try{const u=new URL(v.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error();url=u.href;}catch{fail(systemMessageText('taskWork.enterValidUrlResult'));}}w.receipt={note:text(v.note,5000),url,recordedAt:now,recordedBy:actor};w.stage='verification';}
 else if(v.command==='verify'){if(w.stage!=='verification')fail(systemMessageText('taskWork.recordActualResultFirst'),409);if(!['met','unmet','inconclusive'].includes(v.outcome))fail(systemMessageText('taskWork.pickVerificationVerdict'));if(w.verification)event.previous=w.verification;w.verification={outcome:v.outcome,note:text(v.note,10000),at:now};if(v.outcome!=='inconclusive')w.stage='done';}
 else if(v.command==='replan'){if(!w.plan)fail(systemMessageText('taskWork.noPlanAdjustYet'));event.previous={plan:w.plan,results:w.results,receipt:w.receipt,verification:w.verification};w.stage='plan';w.step=0;w.results=[];w.receipt=null;w.verification=null;}
 else fail(systemMessageText('taskWork.actionNotSupported'));
 w.history.push(event);return w;
}
class TaskWork{
 constructor(p){this.p=p;}
 async task(id,taskId,transaction){if(!/^\d+$/.test(String(taskId)))fail(systemMessageText('taskWork.invalidTaskNumber'));const row=await this.p.db.getRepository('nrTasks').findOne({filter:{id:taskId,projectId:id},transaction});if(!row)fail(systemMessageText('taskWork.taskNotExistNotBelong'),404);return row;}
 async get(id,taskId){const task=(await this.task(id,taskId)).toJSON();return {task,work:task.evidence?.work||initial()};}
 async update(id,v,actor){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:`nr-task:${id}:${v.taskId}`},transaction});const row=await this.task(id,v.taskId,transaction),task=row.toJSON(),evidence=task.evidence||{},work=structuredClone(evidence.work||initial());if(!/^[-a-zA-Z0-9]{20,80}$/.test(v.requestId||''))fail(systemMessageText('strategy.invalidRequestId'));if(work.operations.includes(v.requestId))return {task,work};if(v.revision!==work.revision)fail(systemMessageText('taskWork.taskUpdatedAnotherWindowRefresh'),409);transition(work,v,new Date().toISOString(),String(actor));work.revision++;work.operations.push(v.requestId);const values={evidence:{...evidence,work},status:work.stage==='done'?systemMessageText('common.completed'):work.stage==='plan'?systemMessageText('common.pending'):systemMessageText('common.inProgress')};await this.p.db.getRepository('nrTasks').update({filterByTk:row.id,values,transaction});return {task:{...task,...values},work};});}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('taskWork.taskRequestNotCompleteEdits'));}};this.p.app.resourceManager.define({name:'nrTaskWork',actions:{get:wrap((id,v)=>this.get(id,v.taskId)),advance:wrap((id,v,c)=>this.update(id,v,c.auth.user.id))}});this.p.app.acl.allow('nrTaskWork',['get','advance'],'loggedIn');}
}
export { TaskWork, initial, transition, planInput };