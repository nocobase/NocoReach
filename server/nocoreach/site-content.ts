// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import { decodeHtmlNumericReference } from '../../shared/html-entities.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { randomUUID } from 'node:crypto';
import { projectId, requireAccess } from './policy.js';
import { normalize, download, plain } from './public-sources.js';
import { ProxyConfigurationError } from './proxy-profiles.js';
import { NetworkProfileError } from './profile-routing.js';
import { unreachableOf } from './outbound-network.js';
import { isNetworkError, NETWORK_TEXT } from './sync-policy.js';
import { due, record } from './sync-policy.js';
// Website content data source (SPEC §11): sitemap-based page inventory joined with GA4/GSC page samples.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const MAX_SITEMAPS=20,MAX_PAGES=5000,MAX_SITES=5,ENRICH_PER_TICK=5,REREAD_MS=7*86400000;
// Numeric references too: sites write the apostrophe as &#x27; or &#39; (UI review 2026-10-21 found them shown raw).
const decode=v=>v.replace(/&#x([0-9a-f]+);/gi,(whole:string,h:string)=>decodeHtmlNumericReference(whole,h,16)).replace(/&#(\d+);/g,(whole:string,d:string)=>decodeHtmlNumericReference(whole,d,10)).replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').trim();
function robotsSitemaps(text){return String(text||'').split(/\r?\n/).map(l=>l.match(/^\s*sitemap\s*:\s*(\S+)/i)?.[1]).filter(Boolean);}
function parseSitemap(xml){const text=String(xml||''),blocks=(tag)=>[...text.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`,'gi'))].map(m=>m[1]);const loc=b=>decode(b.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]||''),lastmod=b=>decode(b.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1]||'')||null;return {sitemaps:blocks('sitemap').map(loc).filter(Boolean),urls:blocks('url').map(b=>({loc:loc(b),lastmod:lastmod(b)})).filter(u=>u.loc)};}
const BLOG=new Set(['blog','blogs','posts','post','news','articles','article','changelog','updates']),DOCS=new Set(['docs','doc','documentation','guide','guides','reference','api','tutorial','tutorials','learn','manual','handbook','handbooks','kb','help']);
// Type is inferred from the first meaningful path segment (a locale prefix such as /en/ or /zh-cn/ is skipped).
function classify(url){let u;try{u=new URL(url);}catch{return 'page';}if(/^(docs|doc|developer|developers|help)\./.test(u.hostname))return 'docs';if(/^blog\./.test(u.hostname))return 'blog';const parts=u.pathname.split('/').filter(Boolean).map(p=>p.toLowerCase());const first=/^[a-z]{2}(-[a-z0-9]{2,4})?$/.test(parts[0]||'')&&parts.length>1?parts[1]:parts[0];return BLOG.has(first)?'blog':DOCS.has(first)?'docs':'page';}
const baseHost=h=>h.replace(/^www\./,'');
function sameSite(url,origin){try{const h=new URL(url).hostname,b=baseHost(new URL(origin).hostname);return baseHost(h)===b||h.endsWith('.'+b);}catch{return false;}}
// What a page tells about itself (titles, description, words, links) and, for 网站审计, its indexing and markup:
// noindex, canonical, H1 count, images without alt text, and up to 100 internal link targets (host and path).
function pageMeta(html,url){const title=plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').slice(0,300),description=decode(html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]||'').slice(0,500),body=plain(html),words=(body.match(/[一-鿿]|[A-Za-z0-9]+/g)||[]).length;let internal=0;const host=baseHost(new URL(url).hostname),links=new Set();for(const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)){try{const t=new URL(decode(m[1]),url);if(baseHost(t.hostname)===host&&t.pathname!==new URL(url).pathname){internal++;if(links.size<100)links.add(`${baseHost(t.hostname)}${t.pathname.replace(/\/+$/,'')||'/'}`);}}catch{/* ignore malformed links */}}
 const robots=(html.match(/<meta[^>]+name=["']robots["'][^>]*content=["']([^"']*)["']/i)?.[1]||'').toLowerCase(),canonicalHref=html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]||html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1];
 let canonical=null;try{canonical=canonicalHref?new URL(decode(canonicalHref),url).href:null;}catch{canonical=null;}
 const h1=(html.match(/<h1\b/gi)||[]).length,imagesNoAlt=[...html.matchAll(/<img\b[^>]*>/gi)].filter(m=>!/\balt\s*=\s*["'][^"']+["']/i.test(m[0])).length;
 return {title,description,words,internalLinks:internal,noindex:/noindex/.test(robots),canonical,h1,imagesNoAlt,links:[...links]};}
function counts(pages){return pages.reduce((a,p)=>(a[p.type]=(a[p.type]||0)+1,a),{});}
function pathOf(url){try{return new URL(url).pathname.replace(/\/$/,'')||'/';}catch{return String(url||'').replace(/\/$/,'')||'/';}}
function hostOf(url){try{return baseHost(new URL(url).hostname.toLowerCase());}catch{return '';}}
// Pages people reach that the sitemap does not list: GA4's top pages and Search Console's pages on a connected site (the
// same host, not a sibling subdomain) of a page type it keeps, added with `outsideSitemap` so the list shows them with
// their figures. A GA4 row synced before hosts were kept is placed only when one site is connected.
const OUTSIDE_SITEMAP_MAX=200;
// All of them, busiest first as given; the list keeps the first OUTSIDE_SITEMAP_MAX and says how many there were.
function outsideSitemap(state,ga4,gsc,max=OUTSIDE_SITEMAP_MAX){const sites=state?.sites||[];if(!sites.length)return [];
 const key=u=>`${hostOf(u)}${pathOf(u)}`,known=new Set((state.pages||[]).map(p=>key(p.url))),out=new Map();
 const add=url=>{let u;try{u=new URL(url);}catch{return;}const site=sites.find(x=>hostOf(x.origin)===hostOf(u.href));if(!site)return;
  const clean=`${new URL(site.origin).origin}${pathOf(u.href)==='/'?'/':pathOf(u.href)}`,k=key(clean),type=classify(clean);
  if(known.has(k)||out.has(k)||(site.types?.length&&!site.types.includes(type)))return;out.set(k,{url:clean,type,origin:site.origin,outsideSitemap:true});};
 for(const r of ga4||[]){if(r.host)add(`https://${r.host}${r.page}`);else if(sites.length===1)add(`${sites[0].origin}${r.page}`);}
 for(const r of gsc||[])add(r.page);
 return [...out.values()].slice(0,max);}
// Metrics come from the saved 28-day GA4 page top list and GSC query/page sample; absence means "not in sample", not zero.
// Rows match by host and path, so sites sharing a path (www and docs both have "/") keep their own figures.
// GA4 rows synced before the hostname was kept carry only a path and still match every site by path.
function joinMetrics(pages,ga4,gsc){
 const key=(host,path)=>JSON.stringify([host,path]),add=(m,k,r,fields)=>{const o=m.get(k)||{};for(const f of fields)if(r[f]!=null)o[f]=(o[f]||0)+Number(r[f]);m.set(k,o);};
 const web=new Map(),search=new Map();
 for(const r of ga4||[])add(web,key(r.host?baseHost(String(r.host).toLowerCase()):'',pathOf(r.page)),r,['views','sessions']);
 for(const r of gsc||[])add(search,key(hostOf(r.page),pathOf(r.page)),r,['clicks','impressions']);
 // Host-less GA4 rows are only shared with a site GA4 tracks: once rows name their hosts and none names this one (docs
 // without the GA4 tag), the property does not cover it, and an old row with its path belongs to another site.
 const tracked=new Set((ga4||[]).filter(r=>r.host).map(r=>baseHost(String(r.host).toLowerCase())));
 const pick=(m,url,hostless=true)=>{const path=pathOf(url),host=hostOf(url),own=host?m.get(key(host,path)):null,any=hostless?m.get(key('',path)):null;if(!own&&!any)return null;const o={...any};for(const [f,v] of Object.entries(own||{}))o[f]=(o[f]||0)+v;return o;};
 return pages.map(p=>{const w=pick(web,p.url,!tracked.size||tracked.has(hostOf(p.url))),q=pick(search,p.url);return {...p,views:w?w.views??null:null,sessions:w?w.sessions??null:null,clicks:q?q.clicks??null:null,impressions:q?q.impressions??null:null};});
}
// 页面 from every synced day (DataViews.pageFigures): each page's visits and search figures for the period and the one
// before, 0 when a synced source has no row for it. A host GA4 does not track (rows name hosts, none this one) reads
// `ga4Untracked` with no visits, and takes no host-less GA4 row. A previous figure is left out until that period is synced.
function joinFigures(pages,f){
 const web=new Map(f.web.map(r=>[`${r.host}|${r.path}`,r])),search=new Map(f.search.map(r=>[`${r.host}|${r.path}`,r]));
 const tracked=new Set(f.web.filter(r=>r.host).map(r=>r.host)),days=f.window?.days||0;
 const has={web:f.days.ga4.current>0,search:f.days.gsc.current>0,webBefore:!f.window?.all&&f.days.ga4.previous>=days&&days>0,searchBefore:!f.window?.all&&f.days.gsc.previous>=days&&days>0};
 return pages.map(p=>{const host=hostOf(p.url),path=pathOf(p.url),untracked=tracked.size>0&&!tracked.has(host);
  const own=web.get(`${host}|${path}`),old=untracked?null:web.get(`|${path}`),views=per=>(own?.[per].views||0)+(old?.[per].views||0),q=search.get(`${host}|${path}`);
  return {...p,views:has.web&&!untracked?views('current'):null,previousViews:has.webBefore&&!untracked?views('previous'):null,...(untracked?{ga4Untracked:true}:{}),
   clicks:has.search?(q?.current.clicks||0):null,impressions:has.search?(q?.current.impressions||0):null,previousClicks:has.searchBefore?(q?.previous.clicks||0):null};});
}
// The pages the figures name that a sitemap does not, as rows outsideSitemap takes, busiest first.
function figureRows(f){const web=f.web.filter(r=>r.current.views>0).sort((a,b)=>b.current.views-a.current.views).map(r=>({page:r.path,...(r.host?{host:r.host}:{})}));
 const gsc=f.search.filter(r=>r.current.impressions>0).sort((a,b)=>b.current.clicks-a.current.clicks||b.current.impressions-a.current.impressions).map(r=>({page:`https://${r.host}${r.path}`}));
 return [web,gsc];}
class SiteContent{
 constructor(plugin,read=download){this.p=plugin;this.p.network?.bind(this,['refresh', 'enrich'], read === download ? 'site' : undefined);this.read=this.p.network&&read===download?(url)=>download(url,0,{network:this.p.network,connection:'site'}):read;}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `site-content:${id}`;}
 // Older records held one site at the top level; they are read as a single-entry site list.
 static upgrade(state){if(!state)return null;if(state.sites)return state;const origin=state.origin;return {...state,sites:origin?[{origin,sitemaps:state.sitemaps||[],types:state.types||[],warnings:state.warnings||[],confirmedAt:state.confirmedAt}]:[],pages:(state.pages||[]).map(p=>({origin,...p}))};}
 async state(id){return SiteContent.upgrade((await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null);}
 async mutate(id,fn){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});const state=await fn(SiteContent.upgrade(row?.get('payload')||null));if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 async discover(input){const origin=new URL(normalize('website',input)).origin;const warnings=[];let queue=[],offline=false;try{queue=robotsSitemaps((await this.read(origin+'/robots.txt')).text);}catch(e){if(e instanceof ProxyConfigurationError||e instanceof NetworkProfileError||e?.code==='mock_unsupported_operation')throw e;if(isNetworkError(e))offline=offline||e;warnings.push(systemMessageText('siteContent.robotsTxtNotReadTrying'));}if(!queue.length)queue=[origin+'/sitemap.xml',origin+'/sitemap_index.xml'];
  const seen=new Set(),pages=new Map(),read=[];let truncated=false;
  while(queue.length&&read.length<MAX_SITEMAPS){const next=queue.shift();if(seen.has(next)||!sameSite(next,origin))continue;seen.add(next);let r;try{r=await this.read(next);}catch(e){if(e instanceof ProxyConfigurationError||e instanceof NetworkProfileError||e?.code==='mock_unsupported_operation')throw e;if(isNetworkError(e))offline=offline||e;continue;}read.push(next);const parsed=parseSitemap(r.text);queue.push(...parsed.sitemaps);for(const u of parsed.urls){if(!sameSite(u.loc,origin))continue;if(pages.size>=MAX_PAGES){truncated=true;break;}if(!pages.has(u.loc))pages.set(u.loc,{url:u.loc,type:classify(u.loc),lastmod:u.lastmod});}}
  // Nothing read because the network was away is not a missing sitemap. A request that got no answer says why.
  if(!read.length&&offline)fail(unreachableOf(offline)?.message||systemMessageText('messages.caNotReachWebsite', { 0: NETWORK_TEXT }),503);
  if(!read.length)fail(systemMessageText('siteContent.noSitemapFoundMakeSure'),422);
  if(queue.length)warnings.push(systemMessageText('messages.manySitemapFilesFirstRead', { 0: MAX_SITEMAPS }));if(truncated)warnings.push(systemMessageText('messages.overPagesFirstIncluded', { 0: MAX_PAGES, 1: MAX_PAGES }));
  const list=[...pages.values()];if(!list.length)fail(systemMessageText('siteContent.noPagesWebsiteFoundSitemap'),422);
  return {origin,sitemaps:read,pages:list,types:counts(list),warnings};}
 // Confirming a site replaces only that site's pages; other sites (for example a separate docs domain) stay as they are.
 async confirm(id,saved,types){const keep=new Set((Array.isArray(types)?types:[]).filter(t=>['blog','docs','page'].includes(t)));if(!keep.size)fail(systemMessageText('siteContent.pickLeastOnePageType'));const origin=saved.origin,pages=saved.pages.filter(p=>keep.has(p.type));return this.mutate(id,old=>{const sites=(old?.sites||[]).filter(x=>x.origin!==origin);if(sites.length>=MAX_SITES)fail(systemMessageText('messages.upUrls', { 0: MAX_SITES }));const prior=new Map((old?.pages||[]).map(p=>[p.url,p]));const others=(old?.pages||[]).filter(p=>p.origin!==origin),own=new Set(others.map(p=>p.url));return {sites:[...sites,{origin,sitemaps:saved.sitemaps,types:[...keep],warnings:saved.warnings,confirmedAt:new Date().toISOString()}],revision:(old?.revision||0)+1,pages:[...others,...pages.filter(p=>!own.has(p.url)).map(p=>({...(prior.get(p.url)||{}),...p,origin}))]};});}
 async remove(id,origin){return this.mutate(id,old=>{if(!old?.sites.some(x=>x.origin===origin))fail(systemMessageText('siteContent.urlNotConnected'),404);return {...old,sites:old.sites.filter(x=>x.origin!==origin),pages:old.pages.filter(p=>p.origin!==origin),revision:(old.revision||0)+1};});}
 // Daily: re-read each site's sitemaps and keep the chosen page types; new pages join, removed pages leave, enrichment is kept.
 async refresh(id){const s=await this.state(id);if(!s?.sites.length)fail(systemMessageText('siteContent.connectWebsiteFirst'),409);const now=new Date().toISOString(),errors=[],fresh={};for(const site of s.sites){try{const d=await this.discover(site.origin);fresh[site.origin]=d.pages.filter(p=>site.types.includes(p.type));}catch(e){errors.push(`${site.origin}：${e.message}`);}}
  return this.mutate(id,cur=>{if(!cur)return cur;const prior=new Map(cur.pages.map(p=>[p.url,p]));const pages=cur.sites.flatMap(site=>fresh[site.origin]?fresh[site.origin].map(p=>({...(prior.get(p.url)||{firstSeenAt:now}),...p,origin:site.origin})):cur.pages.filter(p=>p.origin===site.origin));const seen=new Set();return {...cur,pages:pages.filter(p=>!seen.has(p.url)&&seen.add(p.url)),refresh:record(cur.refresh,{at:now,ok:Object.keys(fresh).length===cur.sites.length,errors})};});}
 async summary(id){const s=await this.state(id);if(!s||!s.sites.length)return {pages:0,sites:[]};return {pages:s.pages.length,refresh:s.refresh||null,lastConfirmedAt:s.sites.map(x=>x.confirmedAt).sort().at(-1)||null,origin:s.sites.map(x=>x.origin).join('、'),sites:s.sites.map(x=>{const own=s.pages.filter(p=>p.origin===x.origin);return {origin:x.origin,pages:own.length,types:counts(own),confirmedAt:x.confirmedAt,warnings:x.warnings||[]};}),types:counts(s.pages),enriched:s.pages.filter(p=>p.fetchedAt).length};}
 // Page metrics come from the live Google snapshots for the chosen period (the same source the analysis uses).
 async list(id,range='28',from,to){if(range==='custom'&&(!/^\d{4}-\d{2}-\d{2}$/.test(String(from||''))||!/^\d{4}-\d{2}-\d{2}$/.test(String(to||''))||from>to||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||new Date(from).toISOString().slice(0,10)!==from||new Date(to).toISOString().slice(0,10)!==to||(Date.parse(to)-Date.parse(from))/86400000>=490))fail(systemMessageText('dataViews.pickValidStartEndDates')); const s=await this.state(id);if(!s)return {pages:[],summary:{pages:0,sites:[]}};const key=['7','28','90','3m','6m','12m','16m','all','custom'].includes(String(range))?String(range):'28';let snaps=[];try{snaps=await this.p.sync.snapshots(id);}catch{snaps=[];}const get=k=>snaps.find(r=>r.key===k)?.payload||[];const label={all:systemMessageText('rangePicker.allTime'),custom:systemMessageText('rangePicker.custom'),7:systemMessageText('common.last7Days'),28:systemMessageText('common.last28Days'),90:systemMessageText('rangePicker.last90Days'),'3m':systemMessageText('rangePicker.last3Months'),'6m':systemMessageText('rangePicker.last6Months'),'12m':systemMessageText('rangePicker.last12Months'),'16m':systemMessageText('rangePicker.last16Months')}[key];// Every synced day when it can be read; the snapshots' top-page samples otherwise.
  let figures=null;try{figures=await this.p.dataViews?.pageFigures(id,key,from,to);}catch(e){if(e.status===400||key==='custom'||key==='all')throw e;figures=null;}
  if(figures){const [ga4,gsc]=figureRows(figures),outside=outsideSitemap(s,ga4,gsc,Infinity),shown=outside.slice(0,OUTSIDE_SITEMAP_MAX);return {range:key,window:figures.window,cutoff:get('project')?.end||null,complete:true,pages:joinFigures([...s.pages,...shown],figures),outsideSitemap:{shown:shown.length,total:outside.length},summary:await this.summary(id),limitations:[systemMessageText('messages.pageFiguresFromSyncedData', { 0: label })]};}
  return {range:key,cutoff:get('project')?.end||null,pages:joinMetrics([...s.pages,...outsideSitemap(s,get(`pages-${key}`),get(`queries-${key}`))],get(`pages-${key}`),get(`queries-${key}`)),summary:await this.summary(id),limitations:[systemMessageText('messages.trafficSearchDataComeTop', { 0: label })]};}
 // Background enrichment: a few pages per tick, oldest first, so a large site never floods the target server.
 async enrich(id){const s=await this.state(id);if(!s)return 0;// Never-read pages first, then pages read more than a week ago, so 网站审计 stays current.
  const stale=Date.now()-REREAD_MS,todo=[...s.pages.filter(p=>!p.fetchedAt),...s.pages.filter(p=>p.fetchedAt&&Date.parse(p.fetchedAt)<stale).sort((a,b)=>a.fetchedAt.localeCompare(b.fetchedAt))].slice(0,ENRICH_PER_TICK);if(!todo.length)return 0;const results=[];for(const p of todo){try{const r=await this.read(p.url);results.push({url:p.url,...(/text\/html/.test(r.type)?pageMeta(r.text,p.url):{}),fetchError:undefined,fetchedAt:new Date().toISOString()});}catch(e){results.push({url:p.url,fetchError:String(e.message||systemMessageText('publicSources.readFailed')).slice(0,120),fetchedAt:new Date().toISOString()});}}
  await this.mutate(id,cur=>{if(!cur)return cur;const by=new Map(results.map(r=>[r.url,r]));cur.pages=cur.pages.map(p=>by.has(p.url)?{...p,...by.get(p.url)}:p);return cur;});return results.length;}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{const s=await this.state(String(id));if(!s?.sites?.length)continue;const since=Date.parse(s.sites.map(x=>x.confirmedAt).sort().at(-1)||0);if(due(s.refresh)&&Date.now()-since>3600000)await this.refresh(String(id));else await this.enrich(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach source tick failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('siteContent.readingWebsiteNotCompleteCheck'));}};
  this.p.app.resourceManager.define({name:'nrSiteContent',actions:{
   discover:wrap(async(id,v,ctx)=>{const data=await this.discover(v.url),previewId=randomUUID();await ctx.cache.set(`nr-site-preview:${id}:${ctx.auth.user.id}:${previewId}`,data,1800000);return {origin:data.origin,sitemaps:data.sitemaps,types:data.types,warnings:data.warnings,total:data.pages.length,samples:Object.fromEntries(['blog','docs','page'].map(t=>[t,data.pages.filter(p=>p.type===t).slice(0,5).map(p=>p.url)])),previewId};}),
   confirm:wrap(async(id,v,ctx)=>{const saved=await ctx.cache.get(`nr-site-preview:${id}:${ctx.auth.user.id}:${v.previewId}`);if(!saved)fail(systemMessageText('publicSources.previewExpiredReadAgain'),409);await this.confirm(id,saved,v.types);return this.summary(id);}),
   remove:wrap(async(id,v)=>{await this.remove(id,String(v.origin||''));return this.summary(id);}),
   refresh:wrap(async id=>{await this.refresh(id);return this.summary(id);}),
   summary:wrap(id=>this.summary(id)),list:wrap((id,v)=>this.list(id,v.range,v.from,v.to))}});
  this.p.app.acl.allow('nrSiteContent',['discover','confirm','remove','refresh','summary','list'],'loggedIn');}
}
export { SiteContent, parseSitemap, robotsSitemaps, classify, pageMeta, joinMetrics, joinFigures, figureRows, outsideSitemap, sameSite };
