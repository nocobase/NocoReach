// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { LANGUAGES } from './language.js';
// Projects (SPEC §3): project 1 lives in the original `project` record; projects added later live in `project:<id>`.
// Every source already keeps its data under the project id, so adding a project needs no change to their storage.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const MAX_PROJECTS=50;
const host=d=>String(d||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/[/?#].*$/,'');
class Projects{
 constructor(plugin){this.p=plugin;}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 async row(id,transaction){const own=await this.repo().findOne({filter:{key:`project:${id}`},transaction});if(own)return own;const legacy=await this.repo().findOne({filter:{key:'project'},transaction});return legacy&&String(legacy.get('payload')?.id)===String(id)?legacy:null;}
 async get(id){const p=(await this.row(id))?.get('payload');if(!p)fail(systemMessageText('projects.projectNotExistNotOpen'),404);return p;}
 // Internal catalogue for global invariants; user-facing reads go through list().
 async all(transaction?){const rows=[...await this.repo().find({filter:{key:'project'},transaction}),...await this.repo().find({filter:{key:{$like:'project:%'}},transaction})];const seen=new Set(),out=[];
  for(const r of rows){const p=r.get('payload');if(!p?.id||seen.has(String(p.id)))continue;
   seen.add(String(p.id));out.push(p);}return out.sort((a,b)=>Number(a.id)-Number(b.id));}
 async list(){const list=await this.all();if(!this.p.db.access?.current())return list;const out=[];
  for(const p of list)if(await this.p.db.access.allows('nrProjects','list',String(p.id)))out.push(p);return out;}
 async ids(){return (await this.list()).map(p=>String(p.id));}
 // Saves fields of one project (memory, bound Google resources), keeping the rest.
 async update(id,fn,transaction){const row=await this.row(id,transaction);if(!row)fail(systemMessageText('settings.projectNotExist'),404);const next=await fn({...row.get('payload')});await this.repo().update({filterByTk:row.id,values:{payload:next},transaction});return next;}
 async create(v){const name=String(v.name||'').trim().replace(/\s+/g,' '),domain=host(v.domain);if(!name||name.length>60)fail(systemMessageText('projects.projectNamesNeed160'));if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))fail(systemMessageText('projects.enterWebsiteUrlExampleHttps'));
  return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext('nocoreach-projects'))",{transaction});
   const list=await this.all(transaction);if(list.length>=MAX_PROJECTS)fail(systemMessageText('messages.upProjects', { 0: MAX_PROJECTS }),409);if(list.some(p=>(p.domains||[]).map(host).includes(domain)))fail(systemMessageText('projects.projectAlreadyUsesWebsite'),409);
   const id=String(Math.max(0,...list.map(p=>Number(p.id)||0))+1);projectId(id);
   const payload={id:Number(id),name,domains:[domain],language:LANGUAGES.includes(v.language)?v.language:'zh-CN',description:'',audience:'',market:'',analyticsPropertyId:'',searchConsoleProperty:'',createdAt:new Date().toISOString()};
   await this.repo().create({values:{key:`project:${id}`,payload},transaction});return payload;});}
 // 项目知识 › AI 用的语言: what the AI writes in for this project (language.js); other fields are edited elsewhere.
 async edit(id,v){if(!LANGUAGES.includes(v.language))fail(systemMessageText('projects.pickChineseEnglish'));return this.update(id,p=>({...p,language:v.language}));}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{ctx.body=await fn(ctx.action.params.values||{},ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('projects.projectActionNotCompleteTry'));}};
  this.p.app.resourceManager.define({name:'nrProjects',actions:{list:wrap(()=>this.list()),create:wrap(async(v,ctx)=>{const p=await this.create(v);await this.p.db.access?.joinCreatedProject(String(ctx.auth.user.id),String(p.id));this.p.memoryUpdates?.start(String(p.id),'draft');return p;}),edit:wrap(v=>this.edit(projectId(v.projectId),v))}});this.p.app.acl.allow('nrProjects',['list','create','edit'],'loggedIn');}
}
export { Projects, host };
