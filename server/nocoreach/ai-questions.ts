// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { createHash } from 'node:crypto';
import { projectId, requireAccess } from './policy.js';
import { DataForSeo } from './dataforseo.js';
import { TOPIC_PRICES, TOPICS_MAX } from '../../shared/followed-topics.js';
// AI 搜索 › 问题 (2026-10-05; after Semrush AI Visibility's Missing Prompts, Ahrefs Brand Radar's mention and citation
// gaps, Peec AI and Profound; the user's own use: what people ask AI, where we show up, where the chances are, handed to
// the Agent). Topics — the project's followed topics in Project knowledge › Memory since 2026-11-10, which the online AI
// drafts and the person edits there — are looked up in DataForSEO's LLM mentions index: questions containing the topic
// on ChatGPT (US English only) and Google AI Overviews, 100 a topic and platform (about $0.2), each with the answer, the
// brands it names and the sources it cites. Each question is then marked against the project (named or cited) and the
// competitors in 竞品, so a new competitor counts without asking again. Looked up when a topic is added, then monthly
// (user choice); an uncertain run is not retried.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const DAY=86400000,MONTH=30*DAY,LIMIT=100,MAX_TOPICS=TOPICS_MAX,PLATFORMS=['chat_gpt','google'],PLATFORM={chat_gpt:'ChatGPT',google:systemMessageText('common.googleAiOverviews')};
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const str=(v,max)=>typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,max):'';
const hostOf=u=>{try{return new URL(u).hostname.replace(/^www\./,'').toLowerCase();}catch{return '';}};
const httpsUrl=u=>{try{const x=new URL(String(u||''));return /^https?:$/.test(x.protocol)?x.href.slice(0,2000):'';}catch{return '';}};
const topicOf=v=>{const t=str(v,60).toLowerCase();if(t.length<2)fail(systemMessageText('aiQuestions.topicsNeedLeast2Characters'));if(/["\\]/.test(t))fail(systemMessageText('aiQuestions.topicsCannotContainQuotes'));return t;};
const tid=t=>t.replace(/[^a-z0-9\u4e00-\u9fa5]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'topic';
// Questions containing the topic on one platform, with the answer, brands and sources.
const questions={specification(v){const topic=topicOf(v.topic),platform=PLATFORMS.includes(v.platform)?v.platform:fail(systemMessageText('aiQuestions.platformNotSupported')),m=platform==='chat_gpt'?{locationCode:2840,language:'en'}:{locationCode:Number(v.locationCode)||2840,language:String(v.language||'en')};
  return {kind:'ai-questions',topic,platform,...m,path:'ai_optimization/llm_mentions/search/live',request:{target:[{keyword:topic,search_filter:'include',search_scope:['question'],match_type:'word_match'}],platform,location_code:m.locationCode,language_code:m.language,limit:LIMIT},
   estimatedUsd:TOPIC_PRICES.aiQuestionsUsd,reservationUsd:0.3,timeoutMs:120000,priceVersion:'openseo-measured-2026-08'};},
 result(raw){const t=(Array.isArray(raw?.tasks)?raw.tasks[0]:null)||{},costUsd=num(raw?.cost)??num(t.cost);
  if(raw?.status_code!==20000||t.status_code!==20000)return {status:'failed',errorCode:systemMessageText('aiQuestions.aiQuestionsCheckFailed'),result:null,costUsd};
  const items=(t.result?.[0]?.items||[]).map(i=>({question:str(i?.question,500),volume:num(i?.ai_search_volume),answer:typeof i?.answer==='string'?i.answer.slice(0,900):'',
   sources:(Array.isArray(i?.sources)?i.sources:[]).map(s=>({url:httpsUrl(s?.url),title:str(s?.title,200),domain:str(s?.domain,253).toLowerCase().replace(/^www\./,'')||hostOf(s?.url)})).filter(s=>s.domain).slice(0,12),
   brands:(Array.isArray(i?.brand_entities)?i.brand_entities:[]).map(b=>str(b?.title,80)).filter(Boolean).slice(0,15),at:str(i?.last_response_at,40)||null})).filter(x=>x.question);
  return {status:'completed',errorCode:null,result:{items},costUsd};}};
const words=s=>String(s||'').toLowerCase();
const mentions=(text,brands,name)=>{const n=words(name).trim();if(n.length<3)return false;const re=new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}([^a-z0-9]|$)`);return re.test(words(text))||brands.some(b=>words(b)===n||words(b).startsWith(n+' '));};
const isSite=(domain,site)=>Boolean(domain&&site)&&(domain===site||domain.endsWith('.'+site));
// Every question of every topic once (a question two topics found lists both), marked against the project and the
// competitors: `ours` when we are named or cited, `gap` when other brands are named and we are not, `open` otherwise.
// Most searched first. Read by the page and by the growth signals (growth-signals.ts), which pay for nothing.
function markQuestions(s,{own,name,rivals}){const byKey=new Map();
 for(const t of s?.topics||[])for(const platform of PLATFORMS)for(const q of s.results?.[t.id]?.[platform]?.items||[]){const k=`${platform}|${q.question.toLowerCase()}`,e=byKey.get(k);if(e){if(!e.topics.includes(t.keyword))e.topics.push(t.keyword);continue;}
  const weCited=q.sources.some(x=>own.some(o=>isSite(x.domain,o))),weNamed=mentions(q.answer,q.brands,name)||own.some(o=>mentions(q.answer,q.brands,o.split('.')[0])),named=rivals.filter(r=>mentions(q.answer,q.brands,r.name)||q.sources.some(x=>isSite(x.domain,r.site)));
  const ours=weNamed||weCited,status=ours?'ours':q.brands.length||named.length?'gap':'open';
  byKey.set(k,{key:k,question:q.question,platform,topics:[t.keyword],volume:q.volume,status,weNamed,weCited,rivals:named.map(r=>r.name),brands:q.brands.filter(b=>!rivals.some(r=>words(b).startsWith(words(r.name)))&&!words(b).startsWith(words(name))).slice(0,5),
   sources:q.sources.map(x=>({...x,own:own.some(o=>isSite(x.domain,o)),rival:rivals.find(r=>isSite(x.domain,r.site))?.name||null})),answer:q.answer,at:q.at});}
 return [...byKey.values()].sort((a,b)=>(b.volume||0)-(a.volume||0));}
class AiQuestions{
 constructor(p){this.p=p;this.d4s=new DataForSeo(p,{'ai-questions':{...questions,reuseMs:25*DAY}});this.running=new Map();}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `ai-questions:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});const state=await fn(row?.get('payload')||{});if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 // The followed topics in Memory, lower-cased, in their order (the first MAX_TOPICS). A topic kept keeps its questions,
 // a removed one is forgotten with them; nothing changes until the project's own list was moved into Memory.
 async syncTopics(id){const topics=await this.p.followedTopics?.of(id);if(!topics)return false;
  const list=[];for(const t of topics){let k;try{k=topicOf(t);}catch{continue;}if(!list.includes(k))list.push(k);}const wanted=list.slice(0,MAX_TOPICS);
  const same=cur=>JSON.stringify((cur?.topics||[]).map(t=>t.keyword))===JSON.stringify(wanted);if(same(await this.state(id)))return false;
  await this.mutate(id,cur=>{if(same(cur))return cur;const old=new Map((cur.topics||[]).map(t=>[t.keyword,t])),used=new Set();
   const topics=wanted.map(k=>{const was=old.get(k);if(was){used.add(was.id);return was;}let id=tid(k);if(used.has(id)||[...old.values()].some(t=>t.id===id&&t.keyword!==k))id=`${id}-${createHash('sha1').update(k).digest('hex').slice(0,6)}`;used.add(id);return {id,keyword:k,addedAt:new Date().toISOString()};});
   const keep=new Set(topics.map(t=>t.id));return {...cur,topics,results:Object.fromEntries(Object.entries(cur.results||{}).filter(([k])=>keep.has(k)))};});
  return true;}
 // The list changed in Memory: new topics are looked up at once (both platforms), removed ones forgotten.
 async topicsChanged(id){if(await this.syncTopics(id))this.refresh(id);}
 refresh(id,{force=false}={}){if(this.running.has(id))return this.running.get(id);const job=this.update(id,{force}).catch(e=>{this.p.app?.logger?.warn?.('NocoReach AI questions failed',{projectId:id,message:e.message});}).finally(()=>this.running.delete(id));this.running.set(id,job);return job;}
 async update(id,{force=false}={}){if(!this.d4s.config(id)?.verifiedAt)return;await this.syncTopics(id);const s=await this.state(id);
  for(const t of s?.topics||[])for(const platform of PLATFORMS){const old=s.results?.[t.id]?.[platform];if(!force&&old?.at&&Date.now()-Date.parse(old.at)<MONTH)continue;
   const now=new Date().toISOString();let r;try{const run=await this.d4s.run(id,'ai-questions',{topic:t.keyword,platform,requestKey:`ai-questions-${id}-${t.id}-${platform}-${Date.now()}`});r=run.status==='completed'?{at:now,items:run.result.items,error:null}:{at:now,items:old?.items||[],error:run.errorCode||systemMessageText('common.notComplete')};}catch(e){r={at:now,items:old?.items||[],error:e.message};}
   await this.mutate(id,cur=>(cur.topics||[]).some(x=>x.id===t.id)?{...cur,results:{...(cur.results||{}),[t.id]:{...(cur.results?.[t.id]||{}),[platform]:r}}}:cur);}}
 // Who the questions are marked against: the project (its name and domains) and the competitors in Competitors.
 async parties(id){const project=await this.p.projects.get(id);return {own:(project.domains||[]).map(d=>String(d).replace(/^www\./,'').toLowerCase()),name:project.name||'',rivals:((await this.p.competitors?.state(id).catch(()=>null))?.list||[]).map(c=>({name:c.name,site:c.site?hostOf(c.site):''}))};}
 // Every question marked: we are named or cited, competitors named or cited, or no brand at all; plus the sites the
 // answers we are missing from cite most (where to be seen).
 async view(id){await this.syncTopics(id).catch(()=>false);const s=await this.state(id)||{},dataforseo=Boolean(this.d4s.config(id)?.verifiedAt),aiReady=Boolean(this.p.taskExecution?.provider);
  const {own,name,rivals}=await this.parties(id);
  const list=markQuestions(s,{own,name,rivals}),count=st=>list.filter(q=>q.status===st).length,cited=new Map();
  for(const q of list.filter(x=>x.status!=='ours'))for(const d of new Set(q.sources.map(x=>x.domain))){const src=q.sources.find(x=>x.domain===d),c=cited.get(d)||{domain:d,count:0,own:src.own,rival:src.rival};c.count++;cited.set(d,c);}
  const topics=(s.topics||[]).map(t=>({id:t.id,keyword:t.keyword,platforms:Object.fromEntries(PLATFORMS.map(pf=>{const r=s.results?.[t.id]?.[pf];return [pf,r?{at:r.at,count:r.items.length,error:r.error}:null];}))}));
  return {dataforseo,aiReady,refreshing:this.running.has(id),topics,maxTopics:MAX_TOPICS,
   counts:{all:list.length,ours:count('ours'),gap:count('gap'),open:count('open')},questions:list.slice(0,600),citedDomains:[...cited.values()].sort((a,b)=>b.count-a.count).slice(0,15),
   notes:[systemMessageText('aiQuestions.questionsComeAiQCollected'),systemMessageText('aiQuestions.usAnswerMentionsProjectName'),systemMessageText('aiQuestions.aiSearchVolumeDataforseoEstimate')]};}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds())await this.refresh(String(id));}finally{this.busy=false;}}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('aiQuestions.notLoadAiQuestionsTry'));}};
  const actions={view:wrap(id=>this.view(id))};
  this.p.app.resourceManager.define({name:'nrAiQuestions',actions});this.p.app.acl.allow('nrAiQuestions',Object.keys(actions),'loggedIn');}
}
export { AiQuestions, questions, mentions, markQuestions, PLATFORM };