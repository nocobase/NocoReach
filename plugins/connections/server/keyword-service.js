'use strict';
const {hash,VisibilityError}=require('./research-helpers');
const {specification,result}=require('./keyword-policy');
const {projectId,requireAdmin}=require('./policy');
const {DataForSeo}=require('./dataforseo');
const error=(message,status=409)=>{throw new VisibilityError(message,status);};
// 关键词研究: research runs and saved candidates on top of the shared DataForSEO cost control.
class KeywordService{
 constructor(p){this.p=p;this.d4s=new DataForSeo(p,{keywords:{specification,result}});}
 repo(){return this.d4s.repo();}
 status(id){return this.d4s.status(id);}
 configure(id,header,budget){return this.d4s.configure(id,header,budget);}
 check(id){return this.d4s.check(id);}
 preview(id,v){return this.d4s.preview(id,'keywords',v);}
 run(id,v){return this.d4s.run(id,'keywords',v);}
 inspectRun(id,v){return this.d4s.inspectRun(id,v);}
 async list(id){return (await this.repo().find({filter:{projectId:id},sort:'-createdAt',limit:30})).map(r=>r.toJSON());}
 async save(id,v){
  const run=await this.repo().findOne({filter:{id:String(v.runId),projectId:id,status:'completed'}});if(!run)error('研究记录不存在',404);
  const item=run.get('result')?.items?.find(i=>i.id===String(v.itemId));if(!item?.keyword)error('该结果不能保存为关键词候选',400);
  const spec=run.get('spec'),candidateKey=hash([id,item.keyword,spec.locationCode,spec.language]);
  return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('nocoreach-keyword-candidates'))",{transaction});const repo=this.p.db.getRepository('nrKeywordCandidates'),old=await repo.findOne({filter:{candidateKey},transaction});if(old)return old.toJSON();return (await repo.create({values:{candidateKey,projectId:id,keyword:item.keyword,runId:String(run.id),payload:{item,spec,retrievedAt:run.get('completedAt'),source:'DataForSEO'}},transaction})).toJSON();});
 }
 register(){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);ctx.set('Cache-Control','no-store');try{if(ctx.method!=='POST')error('请使用 POST',405);const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){if(!(e instanceof VisibilityError))ctx.logger.warn('NocoReach keyword local failure',{errorName:e.name,databaseCode:e.parent?.code,column:e.parent?.column,table:e.parent?.table});ctx.throw(e instanceof VisibilityError?e.status:502,e instanceof VisibilityError?e.message:'关键词研究请求失败，请稍后重试');}};
  const actions={inspectRun:wrap((id,v)=>this.inspectRun(id,v)),status:wrap(id=>this.status(id)),configure:wrap((id,v,ctx)=>this.configure(id,ctx.get('x-noreach-research-credentials'),v.monthlyBudgetUsd)),check:wrap(id=>this.check(id)),disconnect:wrap(id=>this.d4s.disconnect(id)),preview:wrap((id,v)=>this.preview(id,v)),run:wrap((id,v)=>this.run(id,v)),list:wrap(id=>this.list(id)),save:wrap((id,v)=>this.save(id,v)),candidates:wrap(async id=>(await this.p.db.getRepository('nrKeywordCandidates').find({filter:{projectId:id},sort:'-createdAt',limit:200})).map(r=>r.toJSON()))};
  this.p.app.resourceManager.define({name:'nrKeywords',actions});this.p.app.acl.allow('nrKeywords',Object.keys(actions),'loggedIn');
 }
}
module.exports={KeywordService};
