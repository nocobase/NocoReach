// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { documentText } from './document-text.js';
import { projectId, requireAccess } from './policy.js';
import { memoryInput } from './execution/memory.js';
// 项目知识 (SPEC §6.0): the project's 记忆 (saved on the project) and its 知识库 — material the Agent looks up when it needs
// to. Each item's text is stored on its own; the list keeps titles, categories and sizes. Files are read into text with
// an isolated document parser; the original file is not kept. Nothing here calls a model.
const CATEGORIES=['competitor','customer','product','industry','agent','other'];
const FILE_TYPES=['.pdf','.docx','.doc','.pptx','.xlsx','.xls','.txt','.md','.markdown','.csv','.json'];
const MAX_FILE=5*1024*1024,MAX_TEXT=200000,MAX_ITEMS=200,AGENT_BUDGET=400000;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const summaryOf=text=>text.replace(/\s+/g,' ').trim().slice(0,120);
// Reads an uploaded file into text with an isolated document parser (PDF, Word, PowerPoint, Excel, text).
async function readFile(name,buffer){
 const ext=path.extname(name).toLowerCase();if(!FILE_TYPES.includes(ext))fail(systemMessageText('knowledge.pdfWordPowerpointExcelMarkdown'));
 if(['.txt','.md','.markdown','.csv','.json'].includes(ext))return buffer.toString('utf8');
 try{return await documentText(ext,buffer);}
 catch(e){if(e.status)throw e;fail(systemMessageText('knowledge.noTextReadFileMay'),422);}
}
class Knowledge{
 constructor(plugin,read=readFile){this.p=plugin;this.read=read;}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `knowledge:${id}`;}
 itemKey(id,item){return `knowledge-item:${id}:${item}`;}
 async snapshot(key,transaction){return (await this.repo().findOne({filter:{key},transaction}))?.get('payload')||null;}
 async put(key,payload,transaction){const row=await this.repo().findOne({filter:{key},transaction});if(row)await this.repo().update({filterByTk:row.id,values:{payload},transaction});else await this.repo().create({values:{key,payload},transaction});}
 async lock(id,fn){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:`nocoreach-knowledge:${id}`},transaction});return fn(transaction);});}
 async list(id){const d=await this.snapshot(this.key(id));return {revision:d?.revision||0,items:(d?.items||[]).slice().sort((a,b)=>String(b.addedAt).localeCompare(String(a.addedAt)))};}
 async get(id,v){const d=await this.list(id),item=d.items.find(x=>x.id===v.itemId);if(!item)fail(systemMessageText('knowledge.materialNotExistRefreshTry'),404);return {item,text:(await this.snapshot(this.itemKey(id,item.id)))?.text||''};}
 // One item from pasted text or an uploaded file (base64): title, category, summary and size are kept in the list.
 async add(id,v,actor){
  const category=CATEGORIES.includes(v.category)?v.category:'other';let text,kind,fileName='';
  if(v.file){fileName=str(v.file.name,200);if(!fileName)fail(systemMessageText('knowledge.invalidFileName'));const buffer=Buffer.from(String(v.file.data||''),'base64');if(!buffer.length)fail(systemMessageText('knowledgeSuggest.fileEmpty'));if(buffer.length>MAX_FILE)fail(systemMessageText('projectKnowledge.fileTooLargeKeepUnder'));text=await this.read(fileName,buffer);kind='file';}
  // Text already read by 添加 (knowledge-suggest) keeps where it came from: a file's name or a link.
  else{text=typeof v.text==='string'?v.text:'';fileName=str(v.fileName,200);kind=fileName?'file':v.source?'link':'text';}
  text=text.replace(/\r\n/g,'\n').trim();if(!text)fail(kind==='file'?systemMessageText('knowledge.noTextReadFile'):systemMessageText('knowledge.pasteContentSaveKnowledgeBase'));if(text.length>MAX_TEXT)fail(systemMessageText('messages.contentExceedsPartLimit', { 0: text.length, 1: MAX_TEXT }));
  const title=str(v.title,120)||fileName.replace(/\.[^.]+$/,'')||text.split('\n')[0].slice(0,60);
  return this.lock(id,async tx=>{const d=await this.snapshot(this.key(id),tx)||{revision:0,items:[]};if(d.items.length>=MAX_ITEMS)fail(systemMessageText('messages.knowledgeBaseHoldsUpMaterials', { 0: MAX_ITEMS }),409);
   const item={id:randomUUID().slice(0,12),title,category,kind,...(fileName?{fileName}:{}),...(kind==='link'?{source:str(v.source,2000)}:{}),chars:text.length,summary:summaryOf(text),addedAt:new Date().toISOString(),addedBy:String(actor||'')};
   await this.put(this.itemKey(id,item.id),{text},tx);await this.put(this.key(id),{revision:d.revision+1,items:[...d.items,item]},tx);return {revision:d.revision+1,item};});
 }
 // A document a task delivered and its owner accepted (2026-10-08): kept as “Agent 交付”, once per task, so the daily
 // analysis (which reads the catalogue) and later tasks know it. Skipped when the knowledge base is full or it is empty.
 async saveDelivery(id,{taskId,title,text}){const body=String(text||'').trim().slice(0,MAX_TEXT);if(!body)return null;
  const have=(await this.list(id)).items;if(have.some(x=>String(x.taskId)===String(taskId))||have.length>=MAX_ITEMS)return null;
  const r=await this.add(id,{text:body,title:String(title||'').slice(0,120),category:'agent'},'agent');
  return this.lock(id,async tx=>{const d=await this.snapshot(this.key(id),tx);const item=d.items.find(x=>x.id===r.item.id);if(item){item.taskId=String(taskId);await this.put(this.key(id),{revision:d.revision+1,items:d.items},tx);}return item;});}
 async update(id,v){return this.lock(id,async tx=>{const d=await this.snapshot(this.key(id),tx)||{revision:0,items:[]};const item=d.items.find(x=>x.id===v.itemId);if(!item)fail(systemMessageText('knowledge.materialNotExistRefreshTry'),404);
  if(v.title!==undefined){const t=str(v.title,120);if(!t)fail(systemMessageText('knowledge.titleCannotEmpty'));item.title=t;}if(v.category!==undefined){if(!CATEGORIES.includes(v.category))fail(systemMessageText('knowledge.invalidCategory'));item.category=v.category;}
  await this.put(this.key(id),{revision:d.revision+1,items:d.items},tx);return {revision:d.revision+1,item};});}
 async remove(id,v){return this.lock(id,async tx=>{const d=await this.snapshot(this.key(id),tx)||{revision:0,items:[]};if(!d.items.some(x=>x.id===v.itemId))fail(systemMessageText('knowledge.materialNotExistRefreshTry'),404);
  await this.put(this.key(id),{revision:d.revision+1,items:d.items.filter(x=>x.id!==v.itemId)},tx);await this.repo().destroy({filter:{key:this.itemKey(id,v.itemId)},transaction:tx});return {revision:d.revision+1};});}
 // 记忆 is saved on the project record next to its older fields (which stay as they were).
 async saveMemory(id,v){const memory=memoryInput(v.memory);const row=await this.p.projects.row(id);const project=row?.get('payload');if(!row||String(project?.id)!==String(id))fail(systemMessageText('settings.projectNotExist'),404);
  const name=v.name===undefined?project.name:str(v.name,200);if(!name)fail(systemMessageText('knowledge.projectNameCannotEmpty'));
  await this.repo().update({filterByTk:row.id,values:{payload:{...project,name,memory}}});return {name,memory};}
 // What the Agent gets with a task: every item's text, newest first, within a size budget (the rest is listed by title).
 async forAgent(id){const {items}=await this.list(id);const out=[];let used=0;
  for(const item of items){const text=(await this.snapshot(this.itemKey(id,item.id)))?.text||'';if(!text)continue;const fits=used+text.length<=AGENT_BUDGET;used+=fits?text.length:0;out.push({id:item.id,title:item.title,category:item.category,...(fits?{text}:{omitted:true})});}
  return out;}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('knowledge.knowledgeBaseRequestNotComplete'));}};
  this.p.app.resourceManager.define({name:'nrKnowledge',actions:{list:wrap(id=>this.list(id)),get:wrap((id,v)=>this.get(id,v)),add:wrap((id,v,c)=>this.add(id,v,c.auth?.user?.id)),edit:wrap((id,v)=>this.update(id,v)),remove:wrap((id,v)=>this.remove(id,v)),saveMemory:wrap((id,v)=>this.saveMemory(id,v))}});
  this.p.app.acl.allow('nrKnowledge',['list','get','add','edit','remove','saveMemory'],'loggedIn');}
}
export { Knowledge, readFile, CATEGORIES, FILE_TYPES, MAX_FILE, MAX_TEXT, AGENT_BUDGET };