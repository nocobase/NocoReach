'use strict';
// AI 搜索 (OpenSEO AI Search, batch 5b): after every-app/open-seo db8bde1 src/server/features/ai-search/ and
// src/server/lib/dataforseo/{ai,llm-models}.ts (Brand Lookup, Prompt Explorer; MIT). On the shared DataForSEO layer: runs
// only when asked, monthly budget, 30-day reuse, uncertain results never retried.
// Changes: per platform one brand query sends aggregated_metrics + search (+ cross_aggregated_metrics with competitors),
// without top_pages (the cited pages are counted from the question sample); our pages are marked from the project's
// domains; 问 AI asks each model as its own run (no extra paid retry when a model answered without searching); a model
// name is always checked against DataForSEO's free catalog first, and a model is skipped when the catalog cannot be read.
const {VisibilityError}=require('./research-helpers');
const {markets,languages}=require('./keyword-policy');
const {projectId,requireAdmin}=require('./policy');
const {DataForSeo}=require('./dataforseo');
const error=(message,status=400)=>{throw new VisibilityError(message,status);};
const PLATFORMS=['chat_gpt','google'];
const MODELS=['chat_gpt','claude','gemini','perplexity'];
// Measured by OpenSEO (2026-08): $0.1 a request + $0.001 a row on llm_mentions; answers with web search per model.
const ANSWER_USD={chat_gpt:0.09,claude:0.18,gemini:0.11,perplexity:0.04};
const SEARCH_LIMIT=100;
// Model catalog (free): the newest plain alias per provider, ChatGPT pinned to the 5.6 tier while listed.
const PINNED={chat_gpt:'gpt-5.6-luna'};
const LATEST={chat_gpt:/^gpt-(\d+(?:\.\d+)*)$/,claude:/^claude-sonnet-(\d+(?:-\d+)*)$/,gemini:/^gemini-(\d+(?:\.\d+)*)-pro$/,perplexity:/^sonar-reasoning-pro$/};
function pickModel(slug,names){if(PINNED[slug]&&names.includes(PINNED[slug]))return PINNED[slug];let best=null;
 for(const name of names){const m=LATEST[slug].exec(name);if(!m)continue;const v=(m[1]||'0').split(/[.-]/).map(Number);if(!best||cmp(v,best.v)>0)best={name,v};}
 return best?.name||null;}
const cmp=(a,b)=>{for(let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]??0)-(b[i]??0);if(d)return d;}return 0;};
const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
const num=v=>Number.isFinite(Number(v))&&v!==null&&v!==''?Number(v):null;
const DOMAIN=/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
// A bare domain from a domain or address, or null for a brand name.
function domainOf(v){let s=String(v||'').trim().toLowerCase();try{if(/^https?:\/\//.test(s))s=new URL(s).hostname;}catch{return null;}s=s.replace(/^www\./,'').replace(/\/.*$/,'');return DOMAIN.test(s)?s:null;}
const hostOf=v=>{try{return new URL(v).hostname.replace(/^www\./,'').toLowerCase();}catch{return domainOf(v);}};
const httpsUrl=v=>{try{const u=new URL(String(v||''));return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?u.href.slice(0,2048):'';}catch{return '';}};
// DataForSEO target: a domain (cited or shown in results) or a brand name (said in the question, answer or brands).
function target(value){const d=domainOf(value);return d?{domain:d,include_subdomains:true,search_filter:'include',search_scope:['any']}:{keyword:value,search_filter:'include',search_scope:['any','brand_entities'],match_type:'word_match'};}
function terms(spec){return [...new Set([spec.target,...spec.own,...spec.own.map(d=>d.split('.')[0])].map(t=>String(t||'').toLowerCase()).filter(t=>t.length>=3))];}
const isOwn=(domain,own)=>Boolean(domain)&&own.some(o=>domain===o||domain.endsWith('.'+o));
function brandInput(v,project){
 const value=str(v.target,100);if(value.length<2)error('请填写品牌名或域名');
 const competitors=[...new Set((Array.isArray(v.competitors)?v.competitors:[]).map(c=>str(c,100)).filter(c=>c.length>=2&&c.toLowerCase()!==value.toLowerCase()))];
 if(competitors.length>5)error('最多比较 5 个竞品');
 if(!PLATFORMS.includes(v.platform))error('请选择 ChatGPT 或 Google AI 概览');
 // ChatGPT's mention data is US English only.
 const locationCode=v.platform==='chat_gpt'?2840:Number(v.locationCode),language=v.platform==='chat_gpt'?'en':String(v.language||'');
 if(!markets.includes(locationCode)||!languages.includes(language))error('请选择支持的地区和语言');
 const own=[...new Set([...(project.domains||[]).map(domainOf),domainOf(value)].filter(Boolean))];
 return {value,competitors,platform:v.platform,locationCode,language,own};}
function brandSpec(v){const t=target(v.value),base={platform:v.platform,location_code:v.locationCode,language_code:v.language};
 const requests=[{path:'ai_optimization/llm_mentions/aggregated_metrics/live',body:{target:[t],...base,internal_list_limit:10}},{path:'ai_optimization/llm_mentions/search/live',body:{target:[t],...base,limit:SEARCH_LIMIT}}];
 if(v.competitors.length)requests.push({path:'ai_optimization/llm_mentions/cross_aggregated_metrics/live',body:{targets:[v.value,...v.competitors].map(k=>({aggregation_key:k,target:[target(k)]})),...base,internal_list_limit:5}});
 const estimatedUsd=Number((0.101+0.1+SEARCH_LIMIT*0.001+(v.competitors.length?0.101:0)).toFixed(3));
 return {kind:'ai-brand',platform:v.platform,target:v.value,competitors:v.competitors,locationCode:v.locationCode,language:v.language,own:v.own,
  // One lookup = the brand and its competitors; ChatGPT and Google (any market) are its two platforms.
  group:JSON.stringify([v.value.toLowerCase(),[...v.competitors].map(c=>c.toLowerCase()).sort()]).slice(0,600),
  requests,estimatedUsd,reservationUsd:Number((estimatedUsd+0.1).toFixed(3)),priceVersion:'openseo-measured-2026-08'};}
// Replies of one platform: totals, the question sample (who is cited, whether we are), pages cited most in it, and
// the share of mentions against competitors.
function brandResult(raws,spec){
 const tasks=raws.map(r=>(Array.isArray(r?.tasks)?r.tasks[0]:null)||{}),costs=raws.map((r,i)=>num(r?.cost)??num(tasks[i].cost));
 const costUsd=costs.every(c=>c!==null&&c>=0)?Number(costs.reduce((a,b)=>a+b,0).toFixed(6)):null;
 const bad=raws.findIndex((r,i)=>r?.status_code!==20000||tasks[i].status_code!==20000);
 if(bad>=0)return {costUsd,status:'failed',errorCode:`provider_status_${tasks[bad].status_code||raws[bad]?.status_code||'unknown'}`,result:null};
 const [agg={},search={},cross={}]=tasks.map(t=>(Array.isArray(t.result)?t.result[0]:null)||{});
 const group=(agg.total?.platform||[]).find(g=>g?.key===spec.platform)||{},words=terms(spec);
 const questions=(Array.isArray(search.items)?search.items:[]).slice(0,SEARCH_LIMIT).map(i=>{
  const sources=(Array.isArray(i.sources)?i.sources:[]).map(s=>({url:httpsUrl(s?.url),title:str(s?.title,300),domain:str(s?.domain,253).toLowerCase().replace(/^www\./,'')||hostOf(s?.url)||''})).filter(s=>s.domain).slice(0,20);
  const answer=typeof i.answer==='string'?i.answer:'',at=words.map(w=>answer.toLowerCase().indexOf(w)).filter(x=>x>=0).sort((a,b)=>a-b)[0];
  return {question:str(i.question,500),volume:num(i.ai_search_volume),sources:sources.slice(0,10).map(s=>({...s,own:isOwn(s.domain,spec.own)})),ownCited:sources.some(s=>isOwn(s.domain,spec.own)),
   brands:(Array.isArray(i.brand_entities)?i.brand_entities:[]).map(b=>str(b?.title,100)).filter(Boolean).slice(0,10),excerpt:at===undefined?'':answer.slice(Math.max(0,at-120),at+200).replace(/\s+/g,' ').trim(),at:str(i.last_response_at,40)||null};
 }).filter(q=>q.question).sort((a,b)=>(b.volume||0)-(a.volume||0));
 const pages=new Map();for(const q of questions)for(const s of q.sources){const k=s.url||s.domain,p=pages.get(k)||{url:s.url,domain:s.domain,title:s.title,count:0,own:s.own};p.count++;pages.set(k,p);}
 const keys=[spec.target,...spec.competitors],items=Array.isArray(cross.items)?cross.items:[];
 const share=spec.competitors.length?keys.map(k=>{const it=items.find(x=>String(x?.key||'').toLowerCase()===k.toLowerCase());const m=it?(it.platform||[]).map(g=>num(g?.mentions)).filter(x=>x!==null):[];return {key:k,mentions:m.length?m.reduce((a,b)=>a+b,0):null,own:k===spec.target};}):null;
 return {costUsd,status:'completed',errorCode:null,result:{platform:spec.platform,mentions:num(group.mentions),aiSearchVolume:num(group.ai_search_volume),questions,pages:[...pages.values()].sort((a,b)=>b.count-a.count||Number(b.own)-Number(a.own)).slice(0,30),share}};}
// The site a citation points to; Gemini cites through Google redirect links whose title is the real site.
function citedSite(url,title){const h=hostOf(url)||'';return /(^|\.)vertexaisearch\.cloud\.google\.com$/.test(h)?domainOf(title)||h:h;}
function answerSpec(v){return {kind:'ai-answer',model:v.model,modelName:v.modelName,question:v.question,own:v.own,brand:v.brand,group:v.question.toLowerCase().replace(/\s+/g,' ').slice(0,500),
 path:`ai_optimization/${v.model}/llm_responses/live`,request:{user_prompt:v.question,model_name:v.modelName,web_search:true,...(v.model==='claude'?{force_web_search:true}:{}),max_output_tokens:2048},
 estimatedUsd:ANSWER_USD[v.model],reservationUsd:Number(Math.min(0.4,ANSWER_USD[v.model]*2).toFixed(3)),priceVersion:'openseo-measured-2026-08'};}
function answerResult(raw,spec){const task=(Array.isArray(raw?.tasks)?raw.tasks[0]:null)||{},c=num(raw?.cost)??num(task.cost),costUsd=c!==null&&c>=0?c:null;
 if(raw?.status_code!==20000||task.status_code!==20000)return {costUsd,status:'failed',errorCode:`provider_status_${task.status_code||raw?.status_code||'unknown'}`,result:null};
 // Only the answer itself (message items): reasoning items are the model's thinking, not what a user reads.
 const r=(Array.isArray(task.result)?task.result[0]:null)||{},items=Array.isArray(r.items)?r.items:[],answer=items.some(i=>i?.type==='message')?items.filter(i=>i?.type==='message'):items.filter(i=>i?.type!=='reasoning');
 const sections=answer.flatMap(i=>Array.isArray(i?.sections)?i.sections:[]);
 const text=sections.map(s=>typeof s?.text==='string'?s.text:'').filter(Boolean).join('\n\n').slice(0,20000),seen=new Set(),citations=[];
 for(const a of sections.flatMap(s=>Array.isArray(s?.annotations)?s.annotations:[])){const url=httpsUrl(a?.url);if(!url||seen.has(url))continue;seen.add(url);const domain=citedSite(url,a?.title);citations.push({url,title:str(a?.title,300),domain,own:isOwn(domain,spec.own)});if(citations.length>=30)break;}
 const words=terms({target:spec.brand,own:spec.own}),lower=text.toLowerCase();
 return {costUsd,status:'completed',errorCode:null,result:{model:spec.model,modelName:str(r.model_name,80)||spec.modelName,text,citations,mentioned:words.some(w=>lower.includes(w)),ownCited:citations.filter(x=>x.own).length,webSearch:r.web_search===true,fanOut:(Array.isArray(r.fan_out_queries)?r.fan_out_queries:[]).map(q=>str(q,200)).filter(Boolean).slice(0,20)}};}
const kinds={'ai-brand':{specification:v=>brandSpec(v),result:brandResult},'ai-answer':{specification:v=>answerSpec(v),result:answerResult}};
class AiSearch{
 constructor(p){this.p=p;this.d4s=new DataForSeo(p,kinds);this.catalog=new Map();}
 // The model to ask for a provider, read from DataForSEO's free catalog (an unknown name is a billed failure).
 async modelName(id,slug){const hit=this.catalog.get(slug);if(hit&&Date.now()-hit.at<3600000)return hit.name;const c=this.d4s.config(id);
  let names=[];try{const raw=await this.d4s.request(c,`ai_optimization/${slug}/llm_responses/models`);names=(raw?.tasks?.[0]?.result||[]).map(x=>x?.model_name).filter(x=>typeof x==='string');}catch{names=[];}
  const name=pickModel(slug,names);if(!name)error(`没读到 ${({chat_gpt:'ChatGPT',claude:'Claude',gemini:'Gemini',perplexity:'Perplexity'})[slug]} 的模型目录，这次没有问它，稍后再试`,502);
  this.catalog.set(slug,{name,at:Date.now()});return name;}
 async brand(id,v){const project=await this.p.project(id),input=brandInput(v,project);return this.d4s.run(id,'ai-brand',{...v,...input});}
 async ask(id,v){const question=str(v.question,500);if(question.length<5)error('请填写一个问题');if(!MODELS.includes(v.model))error('不支持的模型');
  const c=this.d4s.config(id);if(!c?.verifiedAt)error('请先在数据接入中保存并验证 DataForSEO');
  const project=await this.p.project(id),own=[...new Set((project.domains||[]).map(domainOf).filter(Boolean))];
  return this.d4s.run(id,'ai-answer',{...v,question,model:v.model,modelName:await this.modelName(id,v.model),own,brand:str(project.name,100)});}
 async rows(id,limit=300){return (await this.d4s.repo().find({filter:{projectId:id},sort:'-createdAt',limit})).filter(r=>['ai-brand','ai-answer'].includes(r.get('spec')?.kind));}
 // Recent lookups and questions: one entry per brand set or question, with its latest run per platform or model.
 async list(id){const out=new Map();
  for(const r of await this.rows(id)){const s=r.get('spec'),k=s.kind+':'+s.group;let e=out.get(k);
   if(!e){if(out.size>=40)continue;e={kind:s.kind==='ai-brand'?'brand':'answer',group:s.group,label:s.kind==='ai-brand'?s.target:s.question,competitors:s.competitors||[],locationCode:s.locationCode??null,language:s.language??null,createdAt:r.get('createdAt'),runs:{}};out.set(k,e);}
   const slot=s.platform||s.model;if(!e.runs[slot])e.runs[slot]={id:String(r.id),status:r.get('status'),mentioned:r.get('result')?.mentioned??null};}
  return [...out.values()];}
 async open(id,v){const kind=v.kind==='brand'?'ai-brand':v.kind==='answer'?'ai-answer':error('不支持的查询类型');const picked=new Map();
  for(const r of await this.rows(id)){const s=r.get('spec');if(s.kind!==kind||s.group!==String(v.group||''))continue;const slot=s.platform||s.model;if(!picked.has(slot))picked.set(slot,r.toJSON());}
  return {runs:[...picked.values()]};}
 // Inputs for the daily analysis: the latest brand lookup per platform (45 days) and questions asked in 30 days.
 async state(id){const now=Date.now(),brands=new Map(),answers=new Map();
  for(const r of await this.rows(id)){if(r.get('status')!=='completed')continue;const s=r.get('spec'),age=now-Date.parse(r.get('createdAt'));
   if(s.kind==='ai-brand'&&age<45*86400000&&!brands.has(s.platform))brands.set(s.platform,{spec:s,result:r.get('result'),at:r.get('createdAt')});
   if(s.kind==='ai-answer'&&age<30*86400000){const e=answers.get(s.group)||{question:s.question,models:{}};if(!e.models[s.model])e.models[s.model]={...r.get('result'),at:r.get('createdAt')};answers.set(s.group,e);}}
  return {brands:[...brands.values()],answers:[...answers.values()].slice(0,10)};}
 register(){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);ctx.set('Cache-Control','no-store');try{if(ctx.method!=='POST')error('请使用 POST',405);const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){if(!(e instanceof VisibilityError))ctx.logger.warn('NocoReach AI search local failure',{errorName:e.name});ctx.throw(e instanceof VisibilityError?e.status:502,e instanceof VisibilityError?e.message:'AI 搜索没有完成，请稍后重试');}};
  const actions={brand:wrap((id,v)=>this.brand(id,v)),ask:wrap((id,v)=>this.ask(id,v)),list:wrap(id=>this.list(id)),open:wrap((id,v)=>this.open(id,v))};
  this.p.app.resourceManager.define({name:'nrAiSearch',actions});this.p.app.acl.allow('nrAiSearch',Object.keys(actions),'loggedIn');}
}
module.exports={AiSearch,brandSpec,brandResult,brandInput,answerSpec,answerResult,pickModel,target,domainOf,citedSite};
