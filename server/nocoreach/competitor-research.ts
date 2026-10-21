// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { DataForSeo } from './dataforseo.js';
// 竞品 › 总览 (2026-10-05, after Semrush's Domain Overview and Keyword Gap and Similarweb's side-by-side benchmark; user
// choice: updated by itself once a month). For our site and each competitor with a website, DataForSEO Labs (one market):
// the estimated organic traffic and ranking keywords month by month over the past year (historical_rank_overview); for
// each competitor also the keywords it ranks for in the top 20 where we do not rank (domain_intersection, intersections
// false, brand words left out) and its pages that draw the most search traffic (relevant_pages). About $0.04 a competitor
// and $0.012 for us a month, inside the DataForSEO budget; a domain is queried when added and then every 30 days, an
// uncertain run is not retried. The other columns reuse data already collected for free: Google Trends interest, GitHub
// stars, AI answers' share of mentions, new pages and releases. Traffic from other channels and audiences (Similarweb's
// clickstream) is not available here.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const DAY=86400000,MONTH=30*DAY,GAP=50,PAGES=10;
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const hostOf=u=>{if(!u||typeof u!=='string')return '';try{return new URL(/^https?:\/\//.test(u)?u:`https://${u}`).hostname.replace(/^www\./,'').toLowerCase();}catch{return '';}};
const MARKETS=[[2840,'en',systemMessageText('common.unitedStatesEnglish')],[2826,'en',systemMessageText('keyword.unitedKingdomEnglish')],[2276,'de',systemMessageText('keyword.germanyGerman')],[2250,'fr',systemMessageText('keyword.franceFrench')],[2392,'ja',systemMessageText('keyword.japanJapanese')],[2156,'zh-CN',systemMessageText('competitorResearch.chinaSimplifiedChinese')],[2158,'zh-TW',systemMessageText('keyword.taiwanTraditionalChinese')],[2356,'en',systemMessageText('competitorResearch.indiaEnglish')],[2076,'pt',systemMessageText('competitorResearch.brazilPortuguese')]];
const marketOf=v=>{const m=MARKETS.find(([c,l])=>c===Number(v?.locationCode)&&l===String(v?.language));return m?{locationCode:m[0],language:m[1]}:{locationCode:2840,language:'en'};};
const marketLabel=m=>(MARKETS.find(([c,l])=>c===m.locationCode&&l===m.language)||MARKETS[0])[2];
const base=v=>{const m=marketOf(v),target=hostOf(v.target);if(!target)fail(systemMessageText('competitorResearch.missingDomain'));return {target,m,request:{location_code:m.locationCode,language_code:m.language}};};
const task=raw=>(Array.isArray(raw?.tasks)?raw.tasks[0]:null)||{};
const failed=(raw,t)=>raw?.status_code!==20000||t.status_code!==20000;
const cost=(raw,t)=>num(raw?.cost)??num(t.cost);
// The past year month by month: estimated organic traffic, ranking keywords, how many in the top 3 and top 10.
const history={specification(v){const {target,m,request}=base(v),from=new Date(Date.now()-400*DAY).toISOString().slice(0,7)+'-01';
  return {kind:'competitor-history',target,...m,path:'dataforseo_labs/google/historical_rank_overview/live',request:{target,...request,date_from:from},estimatedUsd:0.012,reservationUsd:0.03,priceVersion:'official-list-2026-07'};},
 result(raw){const t=task(raw);if(failed(raw,t))return {status:'failed',errorCode:systemMessageText('competitorResearch.searchDataLookupFailed'),result:null,costUsd:cost(raw,t)};
  const months=(t.result?.[0]?.items||[]).map(i=>{const o=i?.metrics?.organic||{},top3=(num(o.pos_1)||0)+(num(o.pos_2_3)||0);return {date:`${i.year}-${String(i.month).padStart(2,'0')}`,etv:num(o.etv)===null?null:Math.round(o.etv),count:num(o.count),top3,top10:top3+(num(o.pos_4_10)||0)};}).filter(x=>/^\d{4}-\d{2}$/.test(x.date)).sort((a,b)=>a.date.localeCompare(b.date)).slice(-13);
  return {status:'completed',errorCode:null,result:{months},costUsd:cost(raw,t)};}};
// Keywords the competitor ranks for that we do not (top search volume first).
const gap={specification(v){const {target,m,request}=base(v),ours=hostOf(v.ours);if(!ours)fail(systemMessageText('competitorResearch.missingSiteDomain'));
  return {kind:'competitor-gap',target,ours,...m,path:'dataforseo_labs/google/domain_intersection/live',request:{target1:target,target2:ours,intersections:false,...request,limit:200},estimatedUsd:0.03,reservationUsd:0.06,priceVersion:'official-list-2026-07'};},
 result(raw){const t=task(raw);if(failed(raw,t))return {status:'failed',errorCode:systemMessageText('competitorResearch.keywordGapLookupFailed'),result:null,costUsd:cost(raw,t)};
  const items=(t.result?.[0]?.items||[]).map(i=>{const e=i?.first_domain_serp_element||{},k=i?.keyword_data||{};return {keyword:String(k.keyword||'').toLowerCase(),volume:num(k.keyword_info?.search_volume),difficulty:num(k.keyword_properties?.keyword_difficulty),intent:k.search_intent_info?.main_intent||null,position:num(e.rank_group??e.rank_absolute),url:typeof e.url==='string'?e.url:null,traffic:num(e.etv)===null?null:Math.round(e.etv)};}).filter(x=>x.keyword);
  return {status:'completed',errorCode:null,result:{items},costUsd:cost(raw,t)};}};
// The competitor's pages that draw the most search traffic.
const pages={specification(v){const {target,m,request}=base(v);
  return {kind:'competitor-pages',target,...m,path:'dataforseo_labs/google/relevant_pages/live',request:{target,...request,limit:PAGES,order_by:['metrics.organic.etv,desc']},estimatedUsd:0.011,reservationUsd:0.03,priceVersion:'official-list-2026-07'};},
 result(raw){const t=task(raw);if(failed(raw,t))return {status:'failed',errorCode:systemMessageText('competitorResearch.topPagesLookupFailed'),result:null,costUsd:cost(raw,t)};
  const items=(t.result?.[0]?.items||[]).map(i=>{const o=i?.metrics?.organic||{};return {url:String(i?.page_address||''),traffic:num(o.etv)===null?null:Math.round(o.etv),keywords:num(o.count)};}).filter(x=>/^https?:\/\//.test(x.url));
  return {status:'completed',errorCode:null,result:{items},costUsd:cost(raw,t)};}};
// Brand words are not a gap worth chasing: “retool login” belongs to Retool.
const brandWords=(name,domain)=>[...new Set([String(name||'').toLowerCase().trim(),String(domain||'').split('.')[0]])].filter(w=>w.length>=3);
const keepGap=(items,name,domain)=>{const brand=brandWords(name,domain);return (items||[]).filter(x=>x.position!==null&&x.position<=20&&!brand.some(b=>x.keyword.includes(b))).slice(0,GAP);};
const sumMentions=(brands,key)=>{let total=0,mine=null;for(const b of brands||[])for(const s of b.result?.share||[]){const n=num(s.mentions);if(n===null)continue;total+=n;if(String(s.key).toLowerCase()===key)mine=(mine||0)+n;}return {total,mine};};
class CompetitorResearch{
 constructor(p){this.p=p;this.d4s=new DataForSeo(p,{'competitor-history':{...history,reuseMs:25*DAY},'competitor-gap':{...gap,reuseMs:25*DAY},'competitor-pages':{...pages,reuseMs:25*DAY}});this.running=new Map();}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `competitor-research:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});const state=await fn(row?.get('payload')||{});if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 // Who is compared: our site first, then each competitor in 竞品 (one without a website has only the free columns).
 async sites(id){const project=await this.p.projects.get(id),list=(await this.p.competitors?.state(id).catch(()=>null))?.list||[],ours=hostOf(project.domains?.[0]||'');
  return [{id:'own',name:project.name||ours,domain:ours,own:true},...list.map(c=>({id:c.id,name:c.name,domain:c.site?hostOf(c.site):'',repo:c.repo||'',own:false}))];}
 // Due: no data yet, data older than 30 days, or the market changed. Runs one project at a time, in the background.
 refresh(id,{force=false}={}){if(this.running.has(id))return this.running.get(id);const job=this.update(id,{force}).catch(e=>{this.p.app?.logger?.warn?.('NocoReach competitor research failed',{projectId:id,message:e.message});}).finally(()=>this.running.delete(id));this.running.set(id,job);return job;}
 async update(id,{force=false}={}){if(!this.d4s.config(id)?.verifiedAt)return;const s=await this.state(id),market=marketOf(s?.market),sites=(await this.sites(id)).filter(x=>x.domain),ours=sites.find(x=>x.own)?.domain;
  for(const site of sites){const old=s?.domains?.[site.domain],fresh=old?.at&&Date.now()-Date.parse(old.at)<MONTH&&old.market===`${market.locationCode}|${market.language}`;if(fresh&&!force)continue;
   const now=new Date().toISOString(),run=async(kind,extra={})=>{try{const r=await this.d4s.run(id,kind,{target:site.domain,...market,...extra,requestKey:`${kind}-${id}-${site.id}-${Date.now()}`});return r.status==='completed'?{ok:true,result:r.result}:{ok:false,error:r.errorCode||systemMessageText('common.notComplete')};}catch(e){return {ok:false,error:e.message};}};
   const h=await run('competitor-history'),g=site.own||!ours?null:await run('competitor-gap',{ours}),pg=site.own?null:await run('competitor-pages');
   await this.mutate(id,cur=>{const prev=cur.domains?.[site.domain]||{};return {...cur,market,domains:{...(cur.domains||{}),[site.domain]:{at:now,market:`${market.locationCode}|${market.language}`,
    months:h.ok?h.result.months:prev.months||[],gap:g?.ok?g.result.items:prev.gap||[],pages:pg?.ok?pg.result.items:prev.pages||[],errors:[h,g,pg].filter(x=>x&&!x.ok).map(x=>x.error)}},lastRun:{at:now}};});}}
 async setMarket(id,v){const market=marketOf(v);await this.mutate(id,cur=>({...cur,market}));this.refresh(id,{force:true});return this.view(id);}
 // The comparison table and, per competitor, what its detail shows. (Not `rows`: NocoBase turns a body with `rows` into
 // a paged list and drops the rest.)
 async view(id){const dataforseo=Boolean(this.d4s.config(id)?.verifiedAt),s=await this.state(id)||{},market=marketOf(s.market),sites=await this.sites(id),mk=`${market.locationCode}|${market.language}`;
  if(dataforseo&&!this.running.has(id)&&sites.some(x=>x.domain&&(!s.domains?.[x.domain]||s.domains[x.domain].market!==mk)))this.refresh(id);
  const safe=async fn=>{try{return await fn();}catch{return null;}};
  const [trends,watch,gh,site,ai]=await Promise.all([safe(()=>this.p.trends?.status(id)),safe(()=>this.p.competitors?.status(id)),safe(()=>this.p.github?.status(id)),safe(()=>this.p.siteContent?.state(id)),safe(()=>this.p.aiSearch?.state(id))]);
  const cw=await safe(()=>this.p.competitors?.state(id)),since=Date.now()-30*DAY,events=(cw?.events||[]);
  const items=sites.map(x=>{const d=x.domain?s.domains?.[x.domain]:null,ok=d&&d.market===mk,months=ok?d.months||[]:[],last=months.at(-1)||null,back=months.at(-4)||null;
   const term=(trends?.summary||[]).find(t=>t.term.toLowerCase()===(x.own?(trends?.product||x.name):x.name).toLowerCase());
   const w=x.own?null:(watch?.list||[]).find(c=>c.id===x.id);
   const share=sumMentions(ai?.brands,x.name.toLowerCase()),domainShare=x.domain?sumMentions(ai?.brands,x.domain):{mine:null},mine=share.mine??domainShare.mine,total=share.total||domainShare.total;
   const pages30=x.own?(site?.pages||[]).filter(p=>p.firstSeenAt&&Date.parse(p.firstSeenAt)>=since).length:events.filter(e=>e.competitorId===x.id&&e.type==='page'&&Date.parse(e.at)>=since).length;
   return {id:x.id,name:x.name,domain:x.domain||null,own:x.own,searched:Boolean(ok),checkedAt:ok?d.at:null,errors:ok?d.errors||[]:[],
    traffic:last?.etv??null,trafficChange:last?.etv!=null&&back?.etv?Number(((last.etv-back.etv)/back.etv).toFixed(3)):null,keywords:last?.count??null,top10:last?.top10??null,months:months.map(m=>({date:m.date,etv:m.etv,count:m.count})),
    interest:term?.recent??null,interestChange:term?.change??null,stars:x.own?(gh?.latest?.stars??null):(w?.stars??null),starsWeek:x.own?(gh?.starDelta7??null):(w?.week??null),
    aiShare:mine!==null&&total?Number((mine/total).toFixed(3)):null,pages30,release:x.own?(gh?.releases?.[0]?.name||null):(w?.latestRelease?.name||null),
    gap:x.own||!ok?[]:keepGap(d.gap,x.name,x.domain),topPages:x.own||!ok?[]:(d.pages||[]).slice(0,PAGES),
    events:x.own?[]:events.filter(e=>e.competitorId===x.id).slice(0,10).map(e=>({type:e.type,title:e.title,url:e.url,at:e.at}))};});
  return {dataforseo,market,marketLabel:marketLabel(market),markets:MARKETS.map(([locationCode,language,label])=>({locationCode,language,label})),refreshing:this.running.has(id),lastRun:s.lastRun||null,sites:items,
   notes:[systemMessageText('competitorResearch.trafficEstimatesHelp'),systemMessageText('competitorResearch.googleInterestGithubStarsAi'),systemMessageText('competitorResearch.metricsNeedBrowsingDataLike')]};}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds())await this.refresh(String(id));}finally{this.busy=false;}}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('competitorResearch.notLoadCompetitorOverviewTry'));}};
  const actions={view:wrap(id=>this.view(id)),market:wrap((id,v)=>this.setMarket(id,v))};
  this.p.app.resourceManager.define({name:'nrCompetitorResearch',actions});this.p.app.acl.allow('nrCompetitorResearch',Object.keys(actions),'loggedIn');}
}
export { CompetitorResearch, history, gap, pages, keepGap, hostOf, marketOf };