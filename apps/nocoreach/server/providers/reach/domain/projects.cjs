'use strict';
// Projects (SPEC §3): every project is stored under `project:<id>` in the new application.
// Every source already keeps its data under the project id, so adding a project needs no change to their storage.
const {projectId,requireAccess}=require('./policy.cjs');
const {LANGUAGES}=require('./language.cjs');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const MAX_PROJECTS=50;
const host=d=>String(d||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/[/?#].*$/,'');
class Projects{
 constructor(plugin){this.p=plugin;}
 repo(){return this.p.store.repository('nrSnapshots');}
 async row(id,transaction){return this.repo().findOne({filter:{key:`project:${id}`},transaction});}
 async get(id){const p=(await this.row(id))?.get('payload');if(!p)fail('项目不存在或尚未开放接入',404);return p;}
 async list(){const rows=await this.repo().find({filter:{key:{$startsWith:'project:'}}});const seen=new Set(),out=[];
  for(const r of rows){const p=r.get('payload');if(!p?.id||seen.has(String(p.id)))continue;seen.add(String(p.id));out.push(p);}return out.sort((a,b)=>Number(a.id)-Number(b.id));}
 async ids(){return (await this.list()).map(p=>String(p.id));}
 // Saves fields of one project (memory, bound Google resources), keeping the rest.
 async update(id,fn,transaction){const row=await this.row(id,transaction);if(!row)fail('项目不存在',404);const next=await fn({...row.get('payload')});await this.repo().update({filterByTk:row.id,values:{payload:next},transaction});return next;}
 async create(v){const name=String(v.name||'').trim().replace(/\s+/g,' '),domain=host(v.domain);if(!name||name.length>60)fail('项目名称需要 1–60 个字');if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))fail('请填写官网地址，例如 https://example.com');
  return this.p.store.transaction(async transaction=>{void transaction;
   const list=await this.list();if(list.length>=MAX_PROJECTS)fail(`最多 ${MAX_PROJECTS} 个项目`,409);if(list.some(p=>(p.domains||[]).map(host).includes(domain)))fail('已有项目用这个官网地址',409);
   const id=String(Math.max(0,...list.map(p=>Number(p.id)||0))+1);projectId(id);
   const payload={id:Number(id),name,domains:[domain],language:LANGUAGES.includes(v.language)?v.language:'zh-CN',description:'',audience:'',market:'',analyticsPropertyId:'',searchConsoleProperty:'',createdAt:new Date().toISOString()};
   await this.repo().create({values:{key:`project:${id}`,payload},transaction});return payload;});}
 // 项目知识 › AI 用的语言: what the AI writes in for this project (language.js); other fields are edited elsewhere.
 async edit(id,v){if(!LANGUAGES.includes(v.language))fail('请选择中文或英文');return this.update(id,p=>({...p,language:v.language}));}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{ctx.body=await fn(ctx.action.params.values||{},ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'项目操作未完成，请稍后重试。');}};
  this.p.routes.define({name:'nrProjects',actions:{list:wrap(()=>this.list()),create:wrap(async v=>{const p=await this.create(v);this.p.memoryUpdates?.start(String(p.id),'draft');return p;}),edit:wrap(v=>this.edit(projectId(v.projectId),v))}});this.p.routes.allow('nrProjects',['list','create','edit'],'loggedIn');}
}
module.exports={Projects,host};
