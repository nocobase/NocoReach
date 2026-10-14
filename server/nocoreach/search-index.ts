// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import { projectId, requireAccess } from './policy.js';
import { businessNow } from './business-clock.js';
import * as g from './google-client.js';
// 搜索表现 · 索引 and 站点地图 (2026-10-14, user request: everything Search Console's API offers, in NocoReach's own
// style). Search Console's page-indexing report is not in its API, so 索引 is built from the URL Inspection API: the
// project's pages (内容, site-content.ts) inside the Search Console property are inspected a few at a time through the
// project's Google connection, never-checked pages first, then the least recently checked, at most 500 a day (Google
// allows 2,000 a day and 600 a minute per property) and each page again after a week. Results are kept in nrSnapshots
// (search-index:<id>) with one count a day of indexed and not indexed pages. 站点地图 reads the Sitemaps API when the page
// asks (kept six hours) and adds the sitemaps NocoReach read from robots.txt that Search Console does not list.
const INSPECT='https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const DAY=86400000,DAILY=500,PER_TICK=25,RECHECK=7*DAY,HISTORY=490,CACHE_MS=6*3600000;
const KEY=id=>`search-index:${id}`;
const iso=t=>new Date(t).toISOString().slice(0,10);
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const googleDisconnected=e=>Boolean(e&&typeof e==='object'&&e.code==='NOCOREACH_GOOGLE_NOT_CONNECTED');
// A domain property covers its subdomains; a URL-prefix property covers the URLs under it.
function inProperty(site,url){try{const u=new URL(url);if(String(site).startsWith('sc-domain:')){const d=site.slice(10).toLowerCase(),h=u.hostname.toLowerCase();return h===d||h.endsWith('.'+d);}return String(url).startsWith(site);}catch{return false;}}
const indexed=r=>Boolean(r&&!r.error&&(r.verdict==='PASS'||r.verdict==='PARTIAL'));
const mismatch=r=>Boolean(r?.googleCanonical&&r?.userCanonical&&r.googleCanonical!==r.userCanonical);
// What one inspection says, as kept: index status, canonicals, where Google found the page, and rich results with
// their issues (issue messages in English, so every member reads the same stored text).
function resultOf(payload,at){const x=payload?.inspectionResult||{},i=x.indexStatusResult||{},rr=x.richResultsResult;
 return {checkedAt:at,verdict:i.verdict||null,coverageState:i.coverageState||null,robotsTxtState:i.robotsTxtState||null,indexingState:i.indexingState||null,pageFetchState:i.pageFetchState||null,lastCrawlTime:i.lastCrawlTime||null,
  googleCanonical:i.googleCanonical||null,userCanonical:i.userCanonical||null,crawledAs:i.crawledAs||null,sitemaps:(i.sitemap||[]).map(String).slice(0,10),referringUrls:(i.referringUrls||[]).map(String).slice(0,10),link:x.inspectionResultLink||null,
  richResults:rr?{verdict:rr.verdict||null,types:(rr.detectedItems||[]).map(d=>({type:String(d.richResultType||''),items:(d.items||[]).length,
   issues:(d.items||[]).flatMap(it=>(it.issues||[]).map(s=>({item:it.name?String(it.name).slice(0,120):null,message:String(s.issueMessage||'').slice(0,300),severity:s.severity==='ERROR'?'ERROR':'WARNING'}))).slice(0,20)}))}:null};}
// Rich-result issue counts of one result.
function richCounts(r){const issues=(r?.richResults?.types||[]).flatMap(t=>t.issues);return {errors:issues.filter(x=>x.severity==='ERROR').length,warnings:issues.filter(x=>x.severity!=='ERROR').length};}
// One day's count over the pages now in the property.
function dayCount(date,pages,results){const checked=pages.map(p=>results[p.url]).filter(r=>r&&!r.error);const n=checked.filter(indexed).length;return {date,indexed:n,notIndexed:checked.length-n,checked:checked.length};}
function withDay(history,entry){return [...(history||[]).filter(h=>h.date!==entry.date),entry].sort((a,b)=>a.date.localeCompare(b.date)).slice(-HISTORY);}
// Sitemaps API entries; counts come as int64 strings.
const int=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const sitemapOf=s=>({path:String(s.path||''),type:s.type||null,isIndex:Boolean(s.isSitemapsIndex),isPending:Boolean(s.isPending),lastSubmitted:s.lastSubmitted||null,lastDownloaded:s.lastDownloaded||null,warnings:int(s.warnings),errors:int(s.errors),contents:(s.contents||[]).map(c=>({type:String(c.type||''),submitted:int(c.submitted)}))});
class SearchIndex{
 constructor(plugin){this.p=plugin;this.running=new Set();this.cache=new Map();}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 async state(id){return (await this.repo().findOne({filter:{key:KEY(id)}}))?.get('payload')||null;}
 async mutate(id,fn){const key=KEY(id);return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key},transaction});const row=await this.repo().findOne({filter:{key},transaction});const state=await fn(row?.get('payload')||null);if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key,payload:state},transaction});return state;});}
 async site(id){try{return (await this.p.sync.link(id)).get('gscSiteUrl');}catch(e){if(googleDisconnected(e))return null;throw e;}}
 // The project's pages Search Console can inspect (内容 keeps up to 5,000), and how many lie outside the property.
 async pages(id,site){const content=await this.p.siteContent?.state(id).catch(()=>null),all=content?.pages||[];const pages=all.filter(p=>inProperty(site,p.url));return {pages,outside:all.length-pages.length,sites:content?.sites||[]};}
 async run(id){if(this.running.has(String(id)))return 0;this.running.add(String(id));try{return await this.inspect(String(id));}finally{this.running.delete(String(id));}}
 // One batch: up to 25 pages, within today's 500. Inspected outside any transaction; the results are written in a short
 // one, unless the property changed meanwhile. Quota, sign-in and server failures end the batch; a page Google refuses
 // (for example one outside the property) keeps its error until it is due again.
 async inspect(id){const site=await this.site(id);if(!site)return 0;const {pages}=await this.pages(id,site);if(!pages.length)return 0;
  const s=await this.state(id),today=iso(Date.now()),used=s?.site===site&&s?.quota?.date===today?s.quota.count:0,results=s?.site===site?s.results||{}:{},now=Date.now(),day=iso(businessNow(this.p,id,'google'));
  const due=[...pages.filter(p=>!results[p.url]),...pages.filter(p=>results[p.url]&&now-Date.parse(results[p.url].checkedAt)>=RECHECK).sort((a,b)=>results[a.url].checkedAt.localeCompare(results[b.url].checkedAt))].slice(0,Math.max(0,Math.min(PER_TICK,DAILY-used)));
  if(!due.length){if(Object.keys(results).length&&s?.history?.at(-1)?.date!==day)await this.mutate(id,cur=>cur&&cur.site===site?{...cur,history:withDay(cur.history,dayCount(day,pages,cur.results||{}))}:cur);return 0;}
  const token=await this.p.token(id),out={};let stopped=null;
  for(const p of due){try{out[p.url]=resultOf(await g.googleJson(INSPECT,g.jsonRequest(token,{inspectionUrl:p.url,siteUrl:site,languageCode:'en-US'}),this.p.googleFetch?.(id)),new Date().toISOString());}
   catch(e){if(e.status===429||e.status===401||e.status>=500||e.code==='invalid_grant'||String(e.code||'').startsWith('network')){stopped=e;break;}out[p.url]={checkedAt:new Date().toISOString(),error:String(e.message||'').slice(0,200)};}}
  // Nothing inspected: the reason is kept for the page to show, then reported.
  const n=Object.keys(out).length;if(!n){if(stopped){await this.mutate(id,cur=>({...(cur?.site===site?cur:{site,results:{},history:[]}),lastError:String(stopped.message||'').slice(0,200)}));throw stopped;}return 0;}
  if(await this.site(id)!==site)return 0;
  const keep=new Set(pages.map(p=>p.url));
  await this.mutate(id,cur=>{const same=cur?.site===site,merged=Object.fromEntries(Object.entries({...(same?cur.results||{}:{}),...out}).filter(([u])=>keep.has(u)));
   return {site,results:merged,quota:{date:today,count:(same&&cur?.quota?.date===today?cur.quota.count:0)+n},history:withDay(same?cur.history:[],dayCount(day,pages,merged)),lastRunAt:new Date().toISOString(),lastError:stopped?String(stopped.message||'').slice(0,200):null};});
  return n;}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{await this.run(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach search index tick failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 // 索引: every page in the property with its latest result (details come with `page`), one count a day, today's quota.
 // Opening it before anything was checked starts the first batch.
 async view(id){const site=await this.site(id);if(!site)return {connected:false};const [s,{pages,outside,sites}]=await Promise.all([this.state(id),this.pages(id,site)]);const results=s?.site===site?s.results||{}:{};
  if(pages.length&&!Object.keys(results).length&&!this.running.has(id))this.later=this.run(id).catch(e=>this.p.app?.logger?.warn?.('NocoReach search index failed',{projectId:id,message:e.message}));
  const rows=pages.map(p=>{const r=results[p.url];if(!r)return {url:p.url,type:p.type||'page',status:'unchecked'};
   return {url:p.url,type:p.type||'page',status:r.error?'error':indexed(r)?'indexed':'notIndexed',checkedAt:r.checkedAt,coverageState:r.coverageState,verdict:r.verdict,lastCrawlTime:r.lastCrawlTime,crawledAs:r.crawledAs,canonicalMismatch:mismatch(r),rich:(r.richResults?.types||[]).map(t=>({type:t.type,...richCounts({richResults:{types:[t]}})})),error:r.error||null};});
  return {connected:true,site,hasContent:Boolean(sites.length),total:pages.length,outside,now:new Date(businessNow(this.p,id,'google')).toISOString(),running:this.running.has(id),lastRunAt:s?.site===site?s.lastRunAt||null:null,lastError:s?.site===site?s.lastError||null:null,
   quota:{used:s?.site===site&&s?.quota?.date===iso(Date.now())?s.quota.count:0,daily:DAILY},history:s?.site===site?s.history||[]:[],pages:rows};}
 // One page's whole result, for its detail.
 async page(id,v){const url=String(v.url||'').slice(0,4096);if(!url)fail(systemMessageText('dataViews.providePageUrl'));const site=await this.site(id);if(!site)return {connected:false};const s=await this.state(id),r=s?.site===site?s.results?.[url]:null;
  return {connected:true,site,url,result:r?{...r,indexed:indexed(r),canonicalMismatch:mismatch(r)}:null};}
 // 站点地图: Search Console's submitted sitemaps (with the files under an index), the sitemaps NocoReach read that it does
 // not list, and per sitemap how many inspected pages Google lists in it and how many of those are indexed.
 async sitemaps(id){const site=await this.site(id);if(!site)return {connected:false};const key=JSON.stringify([id,site]),hit=this.cache.get(key);let listed;
  if(hit&&Date.now()-hit.at<CACHE_MS)listed=hit.value;else{const token=await this.p.token(id),base=`${g.GOOGLE_ENDPOINTS.searchConsole}/sites/${encodeURIComponent(site)}/sitemaps`,get=url=>g.googleJson(url,g.jsonRequest(token),this.p.googleFetch?.(id));
   try{listed=((await get(base)).sitemap||[]).map(sitemapOf);for(const x of listed.filter(x=>x.isIndex).slice(0,5))x.children=((await get(`${base}?sitemapIndex=${encodeURIComponent(x.path)}`).catch(()=>({}))).sitemap||[]).map(sitemapOf);}
   catch(e){fail(e.code==='invalid_grant'?systemMessageText('dataViews.googleAuthorizationExpiredAuthorizeAgain'):systemMessageText('dataViews.notReadSearchConsoleData'),502);}
   this.cache.set(key,{at:Date.now(),value:listed});if(this.cache.size>20)this.cache.delete(this.cache.keys().next().value);}
  const [s,{sites}]=await Promise.all([this.state(id),this.pages(id,site)]),results=Object.values(s?.site===site?s.results||{}:{}).filter(r=>!r.error);
  const tally=paths=>{const own=results.filter(r=>r.sitemaps?.some(x=>paths.includes(x)));return {checked:own.length,indexed:own.filter(indexed).length};};
  const known=new Set(listed.flatMap(x=>[x.path,...(x.children||[]).map(c=>c.path)]));
  const unsubmitted=[...new Set(sites.flatMap(x=>x.sitemaps||[]))].filter(u=>inProperty(site,u)&&!known.has(u)).map(path=>({path,...tally([path])}));
  return {connected:true,site,readAt:new Date(this.cache.get(key)?.at||Date.now()).toISOString(),
   sitemaps:listed.map(x=>({...x,...tally([x.path,...(x.children||[]).map(c=>c.path)]),...(x.children?{children:x.children.map(c=>({...c,...tally([c.path])}))}:{})})),unsubmitted};}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(String(id),v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('dataViews.notLoadDataTryAgain'));}};
  this.p.app.resourceManager.define({name:'nrSearchIndex',actions:{view:wrap(id=>this.view(id)),page:wrap((id,v)=>this.page(id,v)),sitemaps:wrap(id=>this.sitemaps(id))}});
  this.p.app.acl.allow('nrSearchIndex',['view','page','sitemaps'],'loggedIn');}
}
export { SearchIndex, KEY, inProperty, resultOf, dayCount, DAILY, PER_TICK, RECHECK };
