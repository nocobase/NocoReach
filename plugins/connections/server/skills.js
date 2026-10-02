'use strict';
// Skills (SPEC §6.0): how a kind of work is done, in the open Agent Skills format — SKILL.md (name, description, body)
// and the text files that come with it. One library for every project; each project turns Skills on or off. A step of a
// 做法 can name Skills, and those always go to the Agent; the ones turned on go with every task for the Agent to use when
// they fit. Nothing here calls a model, and files that come with a Skill are never run.
const {randomUUID}=require('node:crypto');
const {projectId,requireAdmin}=require('./policy');
const {BUILT_IN_SKILLS}=require('./skills-builtin');
const NAME=/^[a-z0-9]+(-[a-z0-9]+)*$/,ID=/^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_DESC=1024,MAX_BODY=50000,MAX_FILES=20,MAX_FILE=200000,MAX_SKILL=500000,MAX_SKILLS=100,AGENT_BUDGET=1000000;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const textOf=v=>typeof v==='string'?v.replace(/\r\n/g,'\n'):'';
function cleanName(v){const name=str(v,100).toLowerCase();if(!name)fail('请填写名称');if(name.length>64||!NAME.test(name))fail('名称只能用英文小写字母、数字和连字符，例如 seo-title，64 个字符以内');return name;}
function cleanDescription(v){const d=textOf(v).trim();if(!d)fail('请写什么时候用这个 Skill');if(d.length>MAX_DESC)fail(`“什么时候用”最多 ${MAX_DESC} 字`);return d;}
function cleanBody(v){const b=textOf(v).trim();if(!b)fail('请写怎么做（SKILL.md 正文）');if(b.length>MAX_BODY)fail(`正文最多 ${MAX_BODY.toLocaleString()} 字，较长的参考内容可以放进附带文件`);if(b.includes('\u0000'))fail('正文不是文字');return b;}
// A file's path inside the Skill folder: relative, no hidden or parent segments, and not SKILL.md itself.
function cleanPath(v){
 const p=String(v||'').replace(/\\/g,'/').replace(/^\.?\/+/,'').trim();const parts=p.split('/');
 if(!p||p.length>200||parts.length>4||parts.some(s=>!s||s==='.'||s==='..'||s.startsWith('.')||/[\u0000-\u001f:*?"<>|]/.test(s)))fail(`文件路径不对：${String(v||'').slice(0,80)}`);
 if(p.toLowerCase()==='skill.md')fail('SKILL.md 是正文，不能作为附带文件');return p;
}
function cleanFiles(list,existing=[]){
 if(!Array.isArray(list))fail('文件列表不对');const files=[...existing];
 for(const f of list){const path=cleanPath(f?.path),text=textOf(f?.text);if(text.includes('\u0000'))fail(`${path} 不是文字文件`);if(text.length>MAX_FILE)fail(`${path} 太长了，每个文件最多 ${MAX_FILE.toLocaleString()} 字`);
  const i=files.findIndex(x=>x.path===path);if(i>=0)files[i]={path,text};else files.push({path,text});}
 if(files.length>MAX_FILES)fail(`一个 Skill 最多附带 ${MAX_FILES} 个文件`);return files;
}
// name and description from a SKILL.md's frontmatter (plain, quoted and block values); the rest is the body. Other
// frontmatter fields (allowed-tools and the like) are not kept.
function parseSkillMd(raw){
 const text=textOf(raw).replace(/^﻿/,'');const m=/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);if(!m)return {name:'',description:'',body:text.trim()};
 const out={},lines=m[1].split('\n');
 for(let i=0;i<lines.length;i++){
  const kv=/^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(lines[i]);if(!kv)continue;let value=kv[2].trim();const key=kv[1];
  const more=[];while(i+1<lines.length&&(/^[ \t]+\S/.test(lines[i+1])||(!lines[i+1].trim()&&/^[|>]/.test(value)))){more.push(lines[++i]);}
  if(/^[|>][+-]?$/.test(value)){const indent=Math.min(...more.filter(l=>l.trim()).map(l=>l.match(/^[ \t]*/)[0].length));const body=more.map(l=>l.slice(indent));value=(value[0]==='|'?body.join('\n'):body.map(l=>l.trim()).join(' ').replace(/ {2,}/g,' ')).trim();}
  else{if(more.length)value=[value,...more.map(l=>l.trim())].join(' ').trim();
   if(value.startsWith('"')&&value.endsWith('"')&&value.length>1){try{value=JSON.parse(value);}catch{value=value.slice(1,-1);}}else if(value.startsWith("'")&&value.endsWith("'")&&value.length>1)value=value.slice(1,-1).replace(/''/g,"'");}
  out[key]=value;
 }
 return {name:String(out.name||''),description:String(out.description||''),body:text.slice(m[0].length).trim()};
}
const sizeOf=(body,files)=>body.length+files.reduce((n,f)=>n+f.text.length,0);
const meta=(s,body,files)=>({...s,files:files.map(f=>({path:f.path,chars:f.text.length})),chars:sizeOf(body,files)});
class Skills{
 constructor(plugin){this.p=plugin;}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 async snapshot(key,transaction){return (await this.repo().findOne({filter:{key},transaction}))?.get('payload')||null;}
 async put(key,payload,transaction){const row=await this.repo().findOne({filter:{key},transaction});if(row)await this.repo().update({filterByTk:row.id,values:{payload},transaction});else await this.repo().create({values:{key,payload},transaction});}
 lock(fn){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:'nocoreach-skills'},transaction});return fn(transaction);});}
 // The library is created with the three built-in Skills the first time it is read (inside the caller's lock if it has one).
 async library(transaction){
  const d=await this.snapshot('nr-skills',transaction);if(d)return d;
  const seed=async tx=>{const again=await this.snapshot('nr-skills',tx);if(again)return again;const at=new Date().toISOString(),skills=[];
   for(const b of BUILT_IN_SKILLS){await this.put(`nr-skill:${b.id}`,{body:b.body,files:b.files},tx);skills.push(meta({id:b.id,name:b.name,description:b.description,builtIn:true,createdAt:at,updatedAt:at},b.body,b.files));}
   const doc={revision:1,skills};await this.put('nr-skills',doc,tx);return doc;};
  return transaction?seed(transaction):this.lock(seed);
 }
 async enabledIds(id,tx){return (await this.snapshot(`nr-skills-enabled:${id}`,tx))?.ids||[];}
 async list(id){const [d,on]=await Promise.all([this.library(),this.enabledIds(id)]);
  return {revision:d.revision,skills:d.skills.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>({...s,enabled:on.includes(s.id)}))};}
 async get(id,v){const d=await this.library(),skill=d.skills.find(s=>s.id===v.skillId);if(!skill)fail('这个 Skill 不存在，请刷新后重试',404);
  const c=await this.snapshot(`nr-skill:${skill.id}`)||{body:'',files:[]};return {skill:{...skill,enabled:(await this.enabledIds(id)).includes(skill.id)},body:c.body,files:c.files};}
 // Every change rewrites the Skill's content and its line in the library under one lock.
 async change(skillId,fn){return this.lock(async tx=>{const d=await this.library(tx),i=d.skills.findIndex(s=>s.id===skillId);if(i<0)fail('这个 Skill 不存在，请刷新后重试',404);
  const c=await this.snapshot(`nr-skill:${skillId}`,tx)||{body:'',files:[]};const next=fn({...d.skills[i]},{body:c.body,files:c.files},d.skills);
  if(sizeOf(next.body,next.files)>MAX_SKILL)fail(`一个 Skill 连同附带文件最多 ${MAX_SKILL.toLocaleString()} 字`);
  const skill=meta({...next.skill,updatedAt:new Date().toISOString()},next.body,next.files);d.skills[i]=skill;
  await this.put(`nr-skill:${skillId}`,{body:next.body,files:next.files},tx);await this.put('nr-skills',{revision:d.revision+1,skills:d.skills},tx);return {revision:d.revision+1,skill};});}
 async add(v,actor){return this.lock(async tx=>{const d=await this.library(tx);if(d.skills.length>=MAX_SKILLS)fail(`最多保存 ${MAX_SKILLS} 个 Skill`,409);
  const name=cleanName(v.name);if(d.skills.some(s=>s.name===name))fail(`已经有叫 ${name} 的 Skill 了，换个名称，或先删掉原来的`,409);
  const body=cleanBody(v.body),files=cleanFiles(v.files||[]);if(sizeOf(body,files)>MAX_SKILL)fail(`一个 Skill 连同附带文件最多 ${MAX_SKILL.toLocaleString()} 字`);
  const at=new Date().toISOString(),skill=meta({id:`sk-${randomUUID().slice(0,8)}`,name,description:cleanDescription(v.description),createdAt:at,updatedAt:at,createdBy:String(actor||'')},body,files);
  await this.put(`nr-skill:${skill.id}`,{body,files},tx);await this.put('nr-skills',{revision:d.revision+1,skills:[...d.skills,skill]},tx);return {revision:d.revision+1,skill};});}
 create(v,actor){return this.add({name:v.name,description:v.description,body:v.body},actor);}
 // A folder with SKILL.md at its top (or one folder down), as the browser read it: paths and text.
 async importFolder(v,actor){
  if(!Array.isArray(v.files)||!v.files.length)fail('没有读到文件');if(v.files.length>MAX_FILES+1)fail(`一个 Skill 最多附带 ${MAX_FILES} 个文件`);
  const norm=v.files.map(f=>({path:String(f?.path||'').replace(/\\/g,'/').replace(/^\.?\/+/,''),text:f?.text}));
  let root='';const top=norm.find(f=>f.path.toLowerCase()==='skill.md');
  if(!top){const nested=norm.filter(f=>/^[^/]+\/skill\.md$/i.test(f.path));if(nested.length!==1)fail(nested.length?'这个文件夹里有好几个 Skill，请一次选一个 Skill 的文件夹':'文件夹里没有 SKILL.md');root=nested[0].path.split('/')[0]+'/';}
  const md=norm.find(f=>f.path.toLowerCase()===`${root}skill.md`.toLowerCase()),parsed=parseSkillMd(md.text);
  if(!parsed.name)fail('SKILL.md 开头没有写 name');if(!parsed.description)fail('SKILL.md 开头没有写 description');
  const files=norm.filter(f=>f!==md&&f.path.startsWith(root)).map(f=>({path:f.path.slice(root.length),text:f.text}));
  return this.add({...parsed,files},actor);
 }
 update(v){return this.change(v.skillId,(skill,c,all)=>{
  if(v.name!==undefined){const name=cleanName(v.name);if(all.some(s=>s.name===name&&s.id!==skill.id))fail(`已经有叫 ${name} 的 Skill 了`,409);skill.name=name;}
  if(v.description!==undefined)skill.description=cleanDescription(v.description);
  return {skill,body:v.body!==undefined?cleanBody(v.body):c.body,files:c.files};});}
 addFiles(v){return this.change(v.skillId,(skill,c)=>({skill,body:c.body,files:cleanFiles(v.files,c.files)}));}
 removeFile(v){return this.change(v.skillId,(skill,c)=>{if(!c.files.some(f=>f.path===v.path))fail('这个文件不存在，请刷新后重试',404);return {skill,body:c.body,files:c.files.filter(f=>f.path!==v.path)};});}
 async remove(v){return this.lock(async tx=>{const d=await this.library(tx);if(!d.skills.some(s=>s.id===v.skillId))fail('这个 Skill 不存在，请刷新后重试',404);
  await this.put('nr-skills',{revision:d.revision+1,skills:d.skills.filter(s=>s.id!==v.skillId)},tx);await this.repo().destroy({filter:{key:`nr-skill:${v.skillId}`},transaction:tx});return {revision:d.revision+1};});}
 async setEnabled(id,v){return this.lock(async tx=>{const d=await this.library(tx);if(!d.skills.some(s=>s.id===v.skillId))fail('这个 Skill 不存在，请刷新后重试',404);
  const ids=(await this.enabledIds(id,tx)).filter(x=>x!==v.skillId&&d.skills.some(s=>s.id===x));if(v.enabled)ids.push(v.skillId);
  await this.put(`nr-skills-enabled:${id}`,{ids},tx);return {skillId:v.skillId,enabled:Boolean(v.enabled)};});}
 // What goes with a task: the Skills this step names (required), then the ones turned on in the project; within a budget,
 // what does not fit is listed by name. Skills deleted since the step named them are skipped.
 async forAgent(id,required=[]){
  const d=await this.snapshot('nr-skills');if(!d)return [];const on=await this.enabledIds(id),want=[...new Set([...required.filter(x=>typeof x==='string'),...on])];
  const out=[];let used=0;
  for(const sid of want){const s=d.skills.find(x=>x.id===sid);if(!s)continue;const c=await this.snapshot(`nr-skill:${sid}`)||{body:'',files:[]};const size=sizeOf(c.body,c.files),fits=used+size<=AGENT_BUDGET;used+=fits?size:0;
   out.push({name:s.name,description:s.description,required:required.includes(sid),...(fits?{body:c.body,files:c.files}:{omitted:true})});}
  return out;
 }
 register(){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);if(v.skillId!==undefined&&!ID.test(String(v.skillId)))fail('Skill 标识不对');ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'Skills 请求没有完成，请稍后重试。');}};
  const actions={list:wrap(id=>this.list(id)),get:wrap((id,v)=>this.get(id,v)),create:wrap((id,v,c)=>this.create(v,c.auth?.user?.id)),import:wrap((id,v,c)=>this.importFolder(v,c.auth?.user?.id)),update:wrap((id,v)=>this.update(v)),addFiles:wrap((id,v)=>this.addFiles(v)),removeFile:wrap((id,v)=>this.removeFile(v)),remove:wrap((id,v)=>this.remove(v)),setEnabled:wrap((id,v)=>this.setEnabled(id,v))};
  this.p.app.resourceManager.define({name:'nrSkills',actions});this.p.app.acl.allow('nrSkills',Object.keys(actions),'loggedIn');}
}
module.exports={Skills,parseSkillMd,cleanPath,ID,MAX_FILES,MAX_FILE,AGENT_BUDGET};
