'use strict';
const {randomUUID}=require('node:crypto');
const {hash,VisibilityError}=require('./research-helpers');
const {specification,result}=require('./keyword-policy');
const {projectId,requireAdmin}=require('./policy');
const {DataForSeo}=require('./dataforseo');
const error=(message,status=409)=>{throw new VisibilityError(message,status);};
const MAX_SAVED=1000,MAX_TAGS=50,TAG_COLORS=['blue','green','amber','violet','orange','red','slate','grey'];
const clean=v=>String(v??'').trim().replace(/\s+/g,' ');
const list=(v,max)=>(Array.isArray(v)?v:[]).map(x=>String(x)).slice(0,max);
const tagsKey=id=>`keyword-tags:${id}`;
// A saved keyword as the 关键词 page shows it: market estimate when it came from research, none from 搜索表现.
function savedView(r,known){const p=r.get('payload')||{},item=p.item||null,spec=p.spec||null;
 return {id:String(r.id),keyword:r.get('keyword'),source:p.source==='Search Console'?'gsc':'dataforseo',market:spec?{locationCode:spec.locationCode,language:spec.language}:null,
  metrics:item?{volume:item.volume??null,difficulty:item.difficulty??null,cpc:item.cpc??null,competition:item.competition??null,intent:item.intent||null,monthlySearches:item.monthlySearches||[]}:null,
  retrievedAt:p.retrievedAt||null,savedAt:r.get('createdAt'),tagIds:(Array.isArray(p.tagIds)?p.tagIds:[]).filter(t=>known.has(t))};}
// 关键词研究 and 关键词 (SPEC "OpenSEO 数据页面"): research runs, saved keywords with tags, on the shared DataForSEO layer.
class KeywordService{
 constructor(p){this.p=p;this.d4s=new DataForSeo(p,{keywords:{specification,result}});}
 repo(){return this.d4s.repo();}
 candidates(){return this.p.db.getRepository('nrKeywordCandidates');}
 status(id){return this.d4s.status(id);}
 configure(id,header,budget){return this.d4s.configure(id,header,budget);}
 check(id){return this.d4s.check(id);}
 preview(id,v){return this.d4s.preview(id,'keywords',v);}
 run(id,v){return this.d4s.run(id,'keywords',v);}
 spend(id){return this.d4s.spend(id);}
 inspectRun(id,v){return this.d4s.inspectRun(id,v);}
 // Recent research for the list (no results); one run is read in full when it is opened.
 async list(id){return (await this.repo().find({filter:{projectId:id},sort:'-createdAt',limit:100})).filter(r=>(r.get('spec')?.kind||'keywords')==='keywords').slice(0,30).map(r=>({id:String(r.id),status:r.get('status'),spec:r.get('spec'),createdAt:r.get('createdAt'),completedAt:r.get('completedAt')||null,errorCode:r.get('errorCode')||null,count:r.get('result')?.items?.length??null}));}
 async getRun(id,v){const r=await this.repo().findOne({filter:{id:String(v.runId),projectId:id}});if(!r)error('研究记录不存在',404);return r.toJSON();}
 async lock(transaction){await this.p.db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('nocoreach-keyword-candidates'))",{transaction});}
 // Tags are one project record ({id,name,color}); each saved keyword keeps its tag ids in its payload.
 async tags(id,transaction){const repo=this.p.db.getRepository('nrSnapshots'),row=await repo.findOne({filter:{key:tagsKey(id)},transaction});return {row,list:Array.isArray(row?.get('payload'))?row.get('payload'):[]};}
 async putTags(id,{row},next,transaction){const repo=this.p.db.getRepository('nrSnapshots');if(row)await repo.update({filterByTk:row.id,values:{payload:next},transaction});else await repo.create({values:{key:tagsKey(id),payload:next},transaction});}
 async saved(id){const [rows,{list:tags}]=await Promise.all([this.candidates().find({filter:{projectId:id},sort:'-createdAt',limit:MAX_SAVED}),this.tags(id)]);const known=new Set(tags.map(t=>t.id));return {tags,items:rows.map(r=>savedView(r,known))};}
 // Keeps the first copy of each keyword and market; a keyword saved from 搜索表现 (no market) gains the research data
 // when it is saved again from research, keeping its tags.
 async store(id,entries){return this.p.db.sequelize.transaction(async transaction=>{await this.lock(transaction);const repo=this.candidates();let saved=0,skipped=0;let total=await repo.count({filter:{projectId:id},transaction});
  for(const e of entries){if(await repo.findOne({filter:{candidateKey:e.key},transaction})){skipped++;continue;}
   const bare=e.payload.spec?await repo.findOne({filter:{candidateKey:hash([id,e.keyword.toLowerCase(),null,null])},transaction}):null;
   if(bare){await repo.update({filterByTk:bare.id,values:{candidateKey:e.key,runId:e.runId,payload:{...e.payload,tagIds:bare.get('payload')?.tagIds||[]}},transaction});saved++;continue;}
   if(total>=MAX_SAVED)error(`最多保存 ${MAX_SAVED} 个关键词，请先删除一些`);
   await repo.create({values:{candidateKey:e.key,projectId:id,keyword:e.keyword,runId:e.runId,payload:e.payload},transaction});total++;saved++;}
  return {saved,skipped};});}
 async saveFromRun(id,v){const run=await this.repo().findOne({filter:{id:String(v.runId),projectId:id,status:'completed'}});if(!run)error('研究记录不存在',404);
  const want=new Set(list(v.itemIds,500)),spec=run.get('spec'),items=(run.get('result')?.items||[]).filter(i=>want.has(String(i.id))&&i.keyword);if(!items.length)error('没有可以保存的关键词',400);
  return this.store(id,items.map(item=>({keyword:item.keyword,key:hash([id,item.keyword,spec.locationCode,spec.language]),runId:String(run.id),payload:{item,spec,retrievedAt:run.get('completedAt'),source:'DataForSEO'}})));}
 // From 搜索表现: Search Console queries without a market estimate.
 async saveQueries(id,v){const seen=new Set(),keywords=list(v.keywords,500).map(clean).filter(k=>k.length>0&&k.length<=200&&!seen.has(k.toLowerCase())&&seen.add(k.toLowerCase()));if(!keywords.length)error('没有可以保存的关键词',400);
  return this.store(id,keywords.map(keyword=>({keyword,key:hash([id,keyword.toLowerCase(),null,null]),runId:'',payload:{item:null,spec:null,retrievedAt:null,source:'Search Console'}})));}
 async removeSaved(id,v){const ids=list(v.ids,MAX_SAVED);if(!ids.length)error('请选择要删除的关键词',400);const n=await this.candidates().destroy({filter:{projectId:id,id:{$in:ids}}});return {removed:Array.isArray(n)?n.length:Number(n)||0};}
 // Adds tags by name (creating new ones) and removes tags by id, on the chosen keywords.
 async tagSaved(id,v){const ids=list(v.ids,MAX_SAVED),addNames=[...new Set(list(v.add,20).map(clean).filter(Boolean))],remove=new Set(list(v.remove,MAX_TAGS));if(!ids.length)error('请选择关键词',400);
  return this.p.db.sequelize.transaction(async transaction=>{await this.lock(transaction);const t=await this.tags(id,transaction),tags=[...t.list],addIds=[];
   for(const name of addNames){if(name.length>40)error('标签最多 40 个字',400);let tag=tags.find(x=>x.name.toLowerCase()===name.toLowerCase());if(!tag){if(tags.length>=MAX_TAGS)error(`最多 ${MAX_TAGS} 个标签`);tag={id:randomUUID().slice(0,8),name,color:TAG_COLORS[tags.length%TAG_COLORS.length]};tags.push(tag);}addIds.push(tag.id);}
   if(tags.length!==t.list.length)await this.putTags(id,t,tags,transaction);
   const rows=await this.candidates().find({filter:{projectId:id,id:{$in:ids}},transaction});
   for(const r of rows){const p=r.get('payload')||{},next=[...new Set([...(p.tagIds||[]).filter(x=>!remove.has(x)),...addIds])];await this.candidates().update({filterByTk:r.id,values:{payload:{...p,tagIds:next}},transaction});}
   return {updated:rows.length,tags};});}
 async updateTag(id,v){return this.p.db.sequelize.transaction(async transaction=>{await this.lock(transaction);const t=await this.tags(id,transaction),tags=t.list.map(x=>({...x})),tag=tags.find(x=>x.id===String(v.tagId));if(!tag)error('标签不存在',404);
  if(v.name!==undefined){const name=clean(v.name);if(!name||name.length>40)error('标签名需要 1–40 个字',400);if(tags.some(x=>x.id!==tag.id&&x.name.toLowerCase()===name.toLowerCase()))error('已有同名标签',409);tag.name=name;}
  if(v.color!==undefined){if(!TAG_COLORS.includes(v.color))error('不支持的颜色',400);tag.color=v.color;}
  await this.putTags(id,t,tags,transaction);return {tags};});}
 async deleteTag(id,v){return this.p.db.sequelize.transaction(async transaction=>{await this.lock(transaction);const t=await this.tags(id,transaction),tagId=String(v.tagId);if(!t.list.some(x=>x.id===tagId))error('标签不存在',404);
  const tags=t.list.filter(x=>x.id!==tagId);await this.putTags(id,t,tags,transaction);
  for(const r of await this.candidates().find({filter:{projectId:id},limit:MAX_SAVED,transaction})){const p=r.get('payload')||{};if((p.tagIds||[]).includes(tagId))await this.candidates().update({filterByTk:r.id,values:{payload:{...p,tagIds:p.tagIds.filter(x=>x!==tagId)}},transaction});}
  return {tags};});}
 register(){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);ctx.set('Cache-Control','no-store');try{if(ctx.method!=='POST')error('请使用 POST',405);const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){if(!(e instanceof VisibilityError))ctx.logger.warn('NocoReach keyword local failure',{errorName:e.name,databaseCode:e.parent?.code,column:e.parent?.column,table:e.parent?.table});ctx.throw(e instanceof VisibilityError?e.status:502,e instanceof VisibilityError?e.message:'关键词研究请求失败，请稍后重试');}};
  const actions={inspectRun:wrap((id,v)=>this.inspectRun(id,v)),status:wrap(id=>this.status(id)),configure:wrap((id,v,ctx)=>this.configure(id,ctx.get('x-noreach-research-credentials'),v.monthlyBudgetUsd)),check:wrap(id=>this.check(id)),disconnect:wrap(id=>this.d4s.disconnect(id)),preview:wrap((id,v)=>this.preview(id,v)),run:wrap((id,v)=>this.run(id,v)),spend:wrap(id=>this.spend(id)),list:wrap(id=>this.list(id)),getRun:wrap((id,v)=>this.getRun(id,v)),
   saved:wrap(id=>this.saved(id)),saveFromRun:wrap((id,v)=>this.saveFromRun(id,v)),saveQueries:wrap((id,v)=>this.saveQueries(id,v)),removeSaved:wrap((id,v)=>this.removeSaved(id,v)),tagSaved:wrap((id,v)=>this.tagSaved(id,v)),updateTag:wrap((id,v)=>this.updateTag(id,v)),deleteTag:wrap((id,v)=>this.deleteTag(id,v))};
  this.p.app.resourceManager.define({name:'nrKeywords',actions});this.p.app.acl.allow('nrKeywords',Object.keys(actions),'loggedIn');
 }
}
module.exports={KeywordService};
