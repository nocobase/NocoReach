// @ts-nocheck
import { ProjectRuns } from './project-runs.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { businessNow } from './business-clock.js';
import { due, record } from './sync-policy.js';
import { download, plain } from './public-sources.js';
// Package downloads (SPEC §11 使用量, P1): npm and PyPI daily downloads and Docker Hub pull counts from public APIs, no
// credentials. npm keeps up to 18 months, PyPI (pypistats) the last 180 days; Docker Hub only reports a running total,
// so it is sampled once a day and compared between samples, like GitHub stars.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const MAX_PACKAGES=10,NPM_DAYS=540,KEEP_DAYS=560,DAY=86400000;
const iso=t=>new Date(t).toISOString().slice(0,10);
const REGISTRIES={npm:'npm',pypi:'PyPI',docker:'Docker Hub'};
// Accepts a name or the package's page on the registry: npmjs.com/package/x, pypi.org/project/x, hub.docker.com/r/a/b.
function parse(registry,input){let r=registry,name=String(input||'').trim();
 try{const u=new URL(name);const path=u.pathname.split('/').filter(Boolean);
  if(/(^|\.)npmjs\.com$/.test(u.hostname)&&path[0]==='package'){r='npm';name=path.slice(1,path[1]?.startsWith('@')?3:2).join('/');}
  else if(/(^|\.)pypi\.org$/.test(u.hostname)&&path[0]==='project'){r='pypi';name=path[1]||'';}
  else if(u.hostname==='hub.docker.com'){r='docker';name=path[0]==='_'?`library/${path[1]||''}`:path[0]==='r'?path.slice(1,3).join('/'):'';}
  else fail(systemMessageText('packagesSource.enterPackageNamePackagePage'));}catch(e){if(e.status)throw e;}
 if(!REGISTRIES[r])fail(systemMessageText('packagesSource.pickNpmPypiDockerHub'));
 if(r==='npm'){name=name.toLowerCase();if(!/^(@[a-z0-9~][a-z0-9-._~]*\/)?[a-z0-9~][a-z0-9-._~]*$/.test(name)||name.length>214)fail(systemMessageText('packagesSource.invalidNpmPackageName'));}
 if(r==='pypi'){if(!/^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(name)||name.length>100)fail(systemMessageText('packagesSource.invalidPypiPackageName'));name=name.toLowerCase().replace(/[-_.]+/g,'-');}
 if(r==='docker'){name=name.toLowerCase();if(!name.includes('/'))name=`library/${name}`;if(!/^[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(name))fail(systemMessageText('packagesSource.invalidDockerHubImageName'));}
 return {registry:r,name,id:`${r}:${name}`};}
const pageUrl=p=>p.registry==='npm'?`https://www.npmjs.com/package/${p.name}`:p.registry==='pypi'?`https://pypi.org/project/${p.name}/`:p.name.startsWith('library/')?`https://hub.docker.com/_/${p.name.slice(8)}`:`https://hub.docker.com/r/${p.name}`;
// Daily totals across the npm and PyPI packages; a day is only present when every package has a number for it.
function downloadRows(state){const pk=(state?.packages||[]).filter(p=>p.registry!=='docker');if(!pk.length)return [];const days=new Set();for(const p of pk)for(const d of Object.keys(state.daily?.[p.id]||{}))days.add(d);
 return [...days].sort().filter(d=>pk.every(p=>Number.isFinite(state.daily?.[p.id]?.[d]))).map(d=>({date:d,downloads:pk.reduce((n,p)=>n+state.daily[p.id][d],0)}));}
// Docker pulls: running totals summed per sample day (only days where every image was sampled).
function pullSamples(state){const pk=(state?.packages||[]).filter(p=>p.registry==='docker');if(!pk.length)return {};const days=new Set();for(const p of pk)for(const d of Object.keys(state.samples?.[p.id]||{}))days.add(d);const out={};for(const d of [...days].sort())if(pk.every(p=>Number.isFinite(state.samples?.[p.id]?.[d])))out[d]={pulls:pk.reduce((n,p)=>n+state.samples[p.id][d],0)};return out;}
class PackagesSource{
 readonly runs: ProjectRuns;
 constructor(plugin,read=download){this.p=plugin;this.runs=new ProjectRuns();this.p.network?.bind(this,['add', 'sync']);this.read=this.p.network&&read===download?(url)=>download(url,0,{network:this.p.network,connection:'packages'}):read;this.runs.bindRequest(this,'read');}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `packages:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn){this.runs.assertActive();return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});this.runs.assertActive();const state=await fn(row?.get('payload')||{packages:[],daily:{},samples:{}});this.runs.assertActive();if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 async json(url){this.runs.assertActive();const r=await this.read(url);try{return JSON.parse(r.text);}catch{fail(systemMessageText('communitySource.returnedDataNotValid'),502);}}
 async info(p){try{
  // The latest manifest only: the full document of a package with many versions is larger than the 2MB read limit.
  if(p.registry==='npm'){const d=await this.json(`https://registry.npmjs.org/${p.name}/latest`);return {title:d.name||p.name,description:plain(String(d.description||'')).slice(0,300),version:d.version||null};}
  if(p.registry==='pypi'){const d=await this.json(`https://pypi.org/pypi/${p.name}/json`);return {title:d.info?.name||p.name,description:String(d.info?.summary||'').slice(0,300),version:d.info?.version||null};}
  const d=await this.json(`https://hub.docker.com/v2/repositories/${p.name}/`);return {title:p.name.replace(/^library\//,''),description:plain(String(d.description||'')).slice(0,300),version:null,pulls:Number.isFinite(d.pull_count)?d.pull_count:null};
 }catch(e){if(/返回 404/.test(e.message))fail(systemMessageText('messages.notFound', { 0: REGISTRIES[p.registry], 1: p.name }),404);throw e;}}
 // npm: the last 540 days on the first read, then the last 30; PyPI: the last 180 days (all pypistats keeps).
 async downloads(p,first,now=businessNow(this.p)){const end=iso(now-DAY);
  if(p.registry==='npm'){const start=iso(now-(first?NPM_DAYS:30)*DAY);const d=await this.json(`https://api.npmjs.org/downloads/range/${start}:${end}/${p.name}`);return Object.fromEntries((d.downloads||[]).filter(x=>x.day<=end).map(x=>[x.day,Number(x.downloads)||0]));}
  const d=await this.json(`https://pypistats.org/api/packages/${p.name}/overall?mirrors=false`);return Object.fromEntries((d.data||[]).filter(x=>x.category==='without_mirrors'&&x.date<=end).map(x=>[x.date,Number(x.downloads)||0]));}
 async preview(v){const p=parse(v.registry,v.name),info=await this.info(p);let recent=null;
  if(p.registry!=='docker'){try{const days=await this.downloads(p,false);const last7=Object.entries(days).sort(([a],[b])=>a.localeCompare(b)).slice(-7);recent=last7.length?last7.reduce((n,[,x])=>n+x,0):null;}catch{recent=null;}}
  return {...p,...info,url:pageUrl(p),recent7:recent};}
 async add(id,v){return this.runs.run<unknown>(id,async()=>{const pv=await this.preview(v);const s=await this.mutate(id,cur=>{const list=(cur.packages||[]).filter(x=>x.id!==pv.id);if(list.length>=MAX_PACKAGES)fail(systemMessageText('messages.upPackages', { 0: MAX_PACKAGES }));const old=(cur.packages||[]).find(x=>x.id===pv.id);
  return {...cur,status:'active',packages:[...list,{id:pv.id,registry:pv.registry,name:pv.name,title:pv.title,description:pv.description,url:pv.url,addedAt:old?.addedAt||new Date().toISOString()}]};});
  this.runs.start(id,()=>this.sync(id));return s;},`connect:${JSON.stringify(v)}`);}
 // Removing a package keeps nothing of it; the others stay.
 async remove(id,v){return this.mutate(id,cur=>{const daily={...(cur.daily||{})},samples={...(cur.samples||{})};delete daily[v.id];delete samples[v.id];return {...cur,packages:(cur.packages||[]).filter(x=>x.id!==v.id),daily,samples};});}
 sync(id){return this.runs.run(id,()=>this.collect(id));}
 async collect(id){const s=await this.state(id);if(!s?.packages?.length)fail(systemMessageText('packagesSource.connectPackageFirst'),409);const clock=businessNow(this.p,id),now=new Date().toISOString(),today=iso(clock),errors=[],daily={},samples={};
  for(const p of s.packages){try{
   if(p.registry==='docker'){const d=await this.json(`https://hub.docker.com/v2/repositories/${p.name}/`);if(Number.isFinite(d.pull_count))samples[p.id]={[today]:d.pull_count};}
   else daily[p.id]=await this.downloads(p,!Object.keys(s.daily?.[p.id]||{}).length,clock);
  }catch(e){errors.push(`${p.title||p.name}：${e.message}`);}}
  const cut=iso(clock-KEEP_DAYS*DAY);
  return this.mutate(id,cur=>{const known=new Set((cur.packages||[]).map(x=>x.id)),nd={...(cur.daily||{})},ns={...(cur.samples||{})};
   for(const [k,v] of Object.entries(daily))if(known.has(k))nd[k]=Object.fromEntries(Object.entries({...(nd[k]||{}),...v}).filter(([d])=>d>=cut).sort(([a],[b])=>a.localeCompare(b)));
   for(const [k,v] of Object.entries(samples))if(known.has(k))ns[k]=Object.fromEntries(Object.entries({...(ns[k]||{}),...v}).filter(([d])=>d>=cut).sort(([a],[b])=>a.localeCompare(b)));
   return {...cur,daily:nd,samples:ns,lastSync:record(cur.lastSync,{at:now,ok:!errors.length,errors})};});}
 async status(id){const s=await this.state(id);if(!s?.packages?.length)return {connected:false,packages:[]};const clock=businessNow(this.p,id),end=iso(clock-DAY),from=iso(clock-28*DAY);
  return {connected:true,syncing:this.runs.has(id),lastSync:s.lastSync||null,packages:s.packages.map(p=>{const d=s.daily?.[p.id]||{},sm=s.samples?.[p.id]||{},days=Object.keys(d).filter(x=>x>=from&&x<=end);const latest=Object.keys(sm).sort().at(-1);
   return {...p,registryName:REGISTRIES[p.registry],downloads28:p.registry==='docker'?null:days.length===28?days.reduce((n,x)=>n+d[x],0):null,since:Object.keys(d).sort()[0]||Object.keys(sm).sort()[0]||null,pulls:latest?sm[latest]:null};})};}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{const s=await this.state(String(id));if(!s?.packages?.length||this.runs.has(String(id))||!due(s.lastSync))continue;await this.sync(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach source tick failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 async close(){await this.runs.close();}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('packagesSource.readingDownloadsNotCompleteTry'));}};
  this.p.app.resourceManager.define({name:'nrPackages',actions:{status:wrap(id=>this.status(id)),preview:wrap((id,v)=>this.preview(v)),add:wrap(async(id,v)=>{await this.add(id,v);return this.status(id);}),remove:wrap(async(id,v)=>{await this.remove(id,v);return this.status(id);}),sync:wrap(async id=>{await this.sync(id);return this.status(id);})}});
  this.p.app.acl.allow('nrPackages',['status','preview','add','remove','sync'],'loggedIn');}
}
export { PackagesSource, parse, downloadRows, pullSamples, pageUrl, REGISTRIES };