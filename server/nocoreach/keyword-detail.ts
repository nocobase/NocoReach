// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import { VisibilityError } from './research-helpers.js';
import { markets, languages } from './keyword-policy.js';
import { projectId, requireAccess } from './policy.js';
import { DataForSeo } from './dataforseo.js';
import { hash as candidateKey } from './research-helpers.js';
// 关键词 详情 (2026-10-15 user choice, after Ahrefs' Keywords Explorer): one page for a keyword in one market, opened from
// every list of 关键词. `site` is free and answers at once: the saved record, the weekly rank checks with that week's
// top 10 (already paid for), the site's pages Search Console shows for the keyword and its other queries sharing the
// keyword's words (the last 28 synced days), and the site's pages that mention it without being shown. `market` and
// `serp` are DataForSEO queries run when the page is opened (opening is asking, 2026-10-02), each reused for 30 days
// through the shared layer, so looking again within a month costs nothing: the keyword overview (volume, 12 months,
// growth, difficulty, CPC, intent, the parent topic, result-page features, the top 10's average referring domains),
// related searches and phrases containing it (about $0.04 together), and the top 10 for keywords not tracked (about
// $0.002). A tracked keyword's top 10 comes from its latest weekly check instead.
const fail=(message,status=400)=>{throw new VisibilityError(message,status);};
const num=v=>(v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v));
const str=(v,max=300)=>(typeof v==='string'?v.trim().replace(/\s+/g,' ').slice(0,max):'');
const arr=v=>(Array.isArray(v)?v:[]);
const bare=d=>String(d||'').toLowerCase().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/[/?#].*$/,'');
const ownDomain=(domain,domains)=>{const d=bare(domain);return domains.some(o=>d===o||d.endsWith('.'+o));};
const LIST=50,QUESTION=/^(how|what|why|when|where|which|who|is|are|can|could|should|does|do|did|will|would)\b|\?$|^(怎么|如何|什么|为什么|哪)|吗$/i;
function market(v){const keyword=str(v.keyword,100),locationCode=Number(v.locationCode),language=String(v.language||'');
 if(keyword.length<2||/[:%\p{C}]/u.test(keyword))fail(systemMessageText('keywordPolicy.keywords2100CharactersWithout'));
 if(!markets.includes(locationCode)||!languages.includes(language))fail(systemMessageText('aiSearch.pickSupportedRegionLanguage'));
 return {keyword,locationCode,language};}
// One keyword as DataForSEO Labs describes it, keeping what the page shows.
function keywordItem(r){const ki=r?.keyword_info||{},kp=r?.keyword_properties||{},si=r?.search_intent_info||{},serp=r?.serp_info||null,bl=r?.avg_backlinks_info||null,t=ki.search_volume_trend||null;
 return {keyword:str(r?.keyword,200),volume:num(ki.search_volume),cpc:num(ki.cpc),competition:num(ki.competition),competitionLevel:['LOW','MEDIUM','HIGH'].includes(ki.competition_level)?ki.competition_level:null,
  difficulty:num(kp.keyword_difficulty),intent:str(si.main_intent,40)||null,
  monthlySearches:arr(ki.monthly_searches).map(m=>({year:num(m.year),month:num(m.month),volume:num(m.search_volume)})).filter(m=>m.year&&m.month).sort((a,b)=>a.year-b.year||a.month-b.month).slice(-12),
  trend:t?{monthly:num(t.monthly),quarterly:num(t.quarterly),yearly:num(t.yearly)}:null,coreKeyword:str(kp.core_keyword,200)||null,
  serpFeatures:[...new Set(arr(serp?.serp_item_types).map(String).filter(x=>x!=='organic'&&x!=='paid'))].slice(0,12),resultsCount:num(serp?.se_results_count),
  referringDomains:num(bl?.referring_main_domains??bl?.referring_domains),backlinks:num(bl?.backlinks)};}
const failed=(raw,key)=>({status:'failed',errorCode:systemMessageText(key),result:null,costUsd:Number.isFinite(raw?.cost)?raw.cost:null});
const ok=(raw,result)=>({status:'completed',errorCode:null,result,costUsd:Number.isFinite(raw?.cost)?raw.cost:null});
const good=raw=>raw?.status_code===20000&&raw?.tasks?.[0]?.status_code===20000;
const base=(kind,v,path,request,estimatedUsd,reservationUsd)=>{const m=market(v);return {kind,target:m.keyword,locationCode:m.locationCode,language:m.language,path,request:{...request,location_code:m.locationCode,language_code:m.language},estimatedUsd,reservationUsd,priceVersion:'official-list-2026-09-23'};};
const kinds={
 'kw-overview':{specification:v=>base('kw-overview',v,'dataforseo_labs/google/keyword_overview/live',{keywords:[market(v).keyword],include_serp_info:true},0.0101,0.02),
  result:raw=>good(raw)?ok(raw,{item:(()=>{const r=arr(raw.tasks[0].result?.[0]?.items)[0];return r?keywordItem(r):null;})()}):failed(raw,'keywordSuggest.keywordDataLookupFailed')},
 'kw-related':{specification:v=>base('kw-related',v,'dataforseo_labs/google/related_keywords/live',{keyword:market(v).keyword,depth:2,limit:LIST,order_by:['keyword_data.keyword_info.search_volume,desc']},0.015,0.03),
  result:raw=>good(raw)?ok(raw,{items:arr(raw.tasks[0].result?.[0]?.items).map(i=>keywordItem(i.keyword_data)).filter(i=>i.keyword)}):failed(raw,'keywordSuggest.keywordDataLookupFailed')},
 'kw-suggestions':{specification:v=>base('kw-suggestions',v,'dataforseo_labs/google/keyword_suggestions/live',{keyword:market(v).keyword,limit:LIST,order_by:['keyword_info.search_volume,desc']},0.015,0.03),
  result:raw=>good(raw)?ok(raw,{items:arr(raw.tasks[0].result?.[0]?.items).map(keywordItem).filter(i=>i.keyword)}):failed(raw,'keywordSuggest.keywordDataLookupFailed')},
 // The top 10 organic results, the questions people also ask and the related searches Google shows.
 'kw-serp':{specification:v=>base('kw-serp',v,'serp/google/organic/live/advanced',{keyword:market(v).keyword,device:'desktop',depth:10},0.002,0.01),
  result:raw=>{if(!good(raw))return failed(raw,'rankTracking.searchResultsLookupFailed');const items=arr(raw.tasks[0].result?.[0]?.items);
   return ok(raw,{items:items.filter(i=>i.type==='organic').map(i=>({position:num(i.rank_group),title:str(i.title,200),url:str(i.url,2000),domain:str(i.domain,200)})).slice(0,10),
    questions:items.filter(i=>i.type==='people_also_ask').flatMap(i=>arr(i.items).map(q=>str(q.title,200))).filter(Boolean).slice(0,10),
    related:items.filter(i=>i.type==='related_searches').flatMap(i=>arr(i.items).map(q=>str(typeof q==='string'?q:q?.title,200))).filter(Boolean).slice(0,10),
    features:[...new Set(items.map(i=>String(i.type||'')).filter(t=>t&&t!=='organic'&&t!=='paid'))].slice(0,12)});}},
};
class KeywordDetail{
 constructor(p){this.p=p;this.d4s=new DataForSeo(p,kinds);}
 // A query on its own: its parsed result, or why there is none (never thrown, so one part failing leaves the others).
 async lookup(id,kind,m){try{const run=await this.d4s.run(id,kind,{keyword:m.keyword,locationCode:m.locationCode,language:m.language,requestKey:`detail-${kind}-${Date.now()}-${Math.random().toString(36).slice(2,10)}`});
   return run.status==='completed'?{status:'ready',at:run.completedAt||run.createdAt,...run.result}:{status:'error',message:run.errorCode||systemMessageText('common.notComplete')};}
  catch(e){return {status:'error',message:e instanceof VisibilityError?e.message:systemMessageText('keywordSuggest.keywordDataLookupFailed')};}}
 connected(id){return Boolean(this.d4s.config(id)?.verifiedAt);}
 async market(id,v){const m=market(v);if(!this.connected(id))return {connected:false};
  const [overview,related,suggestions]=await Promise.all([this.lookup(id,'kw-overview',m),this.lookup(id,'kw-related',m),this.lookup(id,'kw-suggestions',m)]);
  const self=m.keyword.toLowerCase(),seen=new Set([self]),fresh=list=>(list.status==='ready'?list.items.filter(i=>{const k=i.keyword.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}):[]);
  const relatedItems=fresh(related),matching=fresh(suggestions),questions=[...relatedItems,...matching].filter(i=>QUESTION.test(i.keyword));
  const error=[related,suggestions].find(x=>x.status==='error')?.message||null;
  return {connected:true,overview:overview.status==='ready'?{status:'ready',at:overview.at,item:overview.item}:overview,
   related:{status:related.status==='error'&&suggestions.status==='error'?'error':'ready',message:error,related:relatedItems,matching,questions}};}
 // The top 10: the latest weekly check of a tracked keyword (free), else a lookup.
 async serp(id,v){const m=market(v),domains=((await this.p.project(id)).domains||[]).map(bare).filter(Boolean);
  const mark=items=>items.map(i=>({...i,own:ownDomain(i.domain||i.url,domains)}));
  const tracked=await this.tracked(id,m);const last=tracked?.checks.at(-1);
  if(last?.runId){const run=await this.p.db.getRepository('nrKeywordRuns').findOne({filter:{id:String(last.runId),projectId:id}});const items=run?.get('result')?.items;
   if(Array.isArray(items))return {connected:true,source:'tracking',status:'ready',at:last.at,items:mark(items.filter(i=>i.position&&i.position<=10).slice(0,10)),questions:[],related:[],features:[]};}
  if(!this.connected(id))return {connected:false};
  const r=await this.lookup(id,'kw-serp',m);return r.status==='ready'?{connected:true,source:'lookup',...r,items:mark(r.items)}:{connected:true,source:'lookup',...r};}
 async tracked(id,m){const s=await this.p.rankTracking.state(id),k=(s?.keywords||[]).find(x=>x.keyword.toLowerCase()===m.keyword.toLowerCase()&&x.locationCode===m.locationCode&&x.language===m.language);
  return k?{id:k.id,addedAt:k.addedAt,checks:arr(s.checks?.[k.id])}:null;}
 // What is known without paying: saved, tracked, Search Console's pages and nearby queries, the site's pages mentioning it.
 async site(id,v){const m=market(v),self=m.keyword.toLowerCase(),words=self.split(/\s+/).filter(w=>w.length>1);
  const [saved,tracked,gsc,content]=await Promise.all([this.p.keywordService.saved(id),this.tracked(id,m),this.p.dataViews.pairRows(id),this.p.siteContent.state(id)]);
  const record=saved.items.find(i=>i.keyword.toLowerCase()===self&&(!i.market||(i.market.locationCode===m.locationCode&&i.market.language===m.language)))||null;
  const rows=gsc.rows||[],byPage=new Map(),byQuery=new Map();
  for(const r of rows){const q=String(r.keyword||'').toLowerCase();if(!q||!r.impressions)continue;
   if(q===self){const o=byPage.get(r.page)||{url:r.page,clicks:0,impressions:0,weight:0};o.clicks+=r.clicks;o.impressions+=r.impressions;o.weight+=r.position*r.impressions;byPage.set(r.page,o);}
   else if(words.length&&words.every(w=>q.includes(w))){const o=byQuery.get(q)||{query:r.keyword,clicks:0,impressions:0,weight:0,page:r.page,best:r.position};o.clicks+=r.clicks;o.impressions+=r.impressions;o.weight+=r.position*r.impressions;if(r.position<o.best){o.best=r.position;o.page=r.page;}byQuery.set(q,o);}}
  const avg=({weight,best: _best,...o})=>({...o,position:o.impressions?weight/o.impressions:null});
  const pages=[...byPage.values()].map(avg).sort((a,b)=>b.clicks-a.clicks||b.impressions-a.impressions).slice(0,20);
  const key=u=>{try{const x=new URL(u);return bare(x.host)+x.pathname.replace(/\/+$/,'');}catch{return '';}},shown=new Set(pages.map(p=>key(p.url)));
  const mentions=(content?.pages||[]).filter(p=>{const text=`${p.title||''} ${decodeURIComponent(String(p.url||'')).replace(/[-_/]+/g,' ')}`.toLowerCase();return words.length&&words.every(w=>text.includes(w))&&!shown.has(key(p.url));})
   .slice(0,10).map(p=>({url:p.url,title:str(p.title,200)||null}));
  return {keyword:m.keyword,market:{locationCode:m.locationCode,language:m.language},dataforseo:this.connected(id),
   saved:record?{id:record.id,source:record.source,tagIds:record.tagIds,savedAt:record.savedAt,metrics:record.metrics}:null,
   tracking:tracked?{id:tracked.id,addedAt:tracked.addedAt,history:tracked.checks.slice(-12).map(c=>({at:c.at,position:c.position,url:c.url}))}:null,
   gsc:{connected:gsc.connected,cutoff:gsc.cutoff,window:gsc.window,pages,queries:[...byQuery.values()].map(avg).sort((a,b)=>b.impressions-a.impressions).slice(0,20)},
   mentions};}
 // 保存 from the page: the keyword in this market, with the overview already read when there is one (no new query).
 async save(id,v){const m=market(v);let item=null,at=null,runId='';
  if(this.connected(id)){const r=(await this.d4s.preview(id,'kw-overview',m)).existing,it=r?.result?.item;
   if(it){item={keyword:m.keyword,volume:it.volume,difficulty:it.difficulty,cpc:it.cpc,competition:it.competition,intent:it.intent,monthlySearches:it.monthlySearches};at=r.completedAt||null;runId=String(r.id);}}
  return this.p.keywordService.store(id,[{keyword:m.keyword,key:candidateKey([id,m.keyword,m.locationCode,m.language]),runId,payload:{item,spec:{locationCode:m.locationCode,language:m.language},retrievedAt:at,source:'DataForSEO'}}]);}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{if(ctx.method!=='POST')fail(systemMessageText('aiSearch.usePost'),405);const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}
   catch(e){if(!(e instanceof VisibilityError))ctx.logger.warn('NocoReach keyword detail failure',{errorName:e.name,message:e.message});ctx.throw(e instanceof VisibilityError?e.status:502,e instanceof VisibilityError?e.message:systemMessageText('keyword.keywordResearchRequestFailedTry'));}};
  const actions={site:wrap((id,v)=>this.site(id,v)),save:wrap((id,v)=>this.save(id,v)),market:wrap((id,v)=>this.market(id,v)),serp:wrap((id,v)=>this.serp(id,v))};
  this.p.app.resourceManager.define({name:'nrKeywordDetail',actions});this.p.app.acl.allow('nrKeywordDetail',Object.keys(actions),'loggedIn');}
}
export { KeywordDetail, keywordItem, kinds, QUESTION };
