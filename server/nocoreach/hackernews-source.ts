// @ts-nocheck
import { ProjectRuns } from './project-runs.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { businessNow } from './business-clock.js';
import { due, record } from './sync-policy.js';
import { download, plain } from './public-sources.js';
// Hacker News mentions (SPEC §11 外部讨论, P1): stories and comments that name the product, from the public HN Algolia
// search; no account. Only the content and counts are kept, never the authors. First sync reads the last year (up to
// 1000 hits per term), later syncs the last week, which also refreshes points and comment counts.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const API='https://hn.algolia.com/api/v1/search_by_date',MAX_TERMS=5,FIRST_DAYS=365,DAILY_DAYS=7,KEEP_DAYS=400,MAX_MENTIONS=5000,DAY=86400000;
const iso=t=>new Date(t).toISOString().slice(0,10);
function terms(input){const list=(Array.isArray(input)?input:String(input||'').split(/[,，\n]/)).map(t=>String(t).trim().replace(/\s+/g,' ')).filter(Boolean);const seen=new Set(),out=[];
 for(const t of list){if(t.length<3||t.length>60)fail(systemMessageText('hackernewsSource.termNeeds360Characters'));if(/["\\]/.test(t))fail(systemMessageText('hackernewsSource.termsCannotContainQuotesBackslashes'));const k=t.toLowerCase();if(!seen.has(k)){seen.add(k);out.push(t);}}
 if(!out.length)fail(systemMessageText('hackernewsSource.enterProductNameWebsiteDomain'));if(out.length>MAX_TERMS)fail(systemMessageText('messages.upTerms', { 0: MAX_TERMS }));return out;}
// One hit as kept: what was said and where, how much attention it got; the author is dropped.
function mention(h,term){const story=Boolean(h._tags?.includes('story'));const id=String(h.objectID);const storyId=String(story?h.objectID:h.story_id||h.parent_id||h.objectID);
 return {id,type:story?'story':'comment',title:String((story?h.title:h.story_title)||'').slice(0,300),url:/^https?:\/\//.test(String(h.url||h.story_url||''))?String(h.url||h.story_url).slice(0,500):null,
  hnUrl:`https://news.ycombinator.com/item?id=${id}`,storyId,points:Number(h.points)||0,comments:Number(h.num_comments)||0,createdAt:new Date((Number(h.created_at_i)||0)*1000).toISOString(),term,
  excerpt:story?'':plain(String(h.comment_text||'')).slice(0,300)};}
function merge(existing,incoming,since){const by=new Map(Object.entries(existing||{}));for(const m of incoming){if(m.createdAt<since)continue;const old=by.get(m.id);by.set(m.id,old?{...old,...m,term:old.term}:m);}
 return Object.fromEntries([...by.values()].filter(m=>m.createdAt>=since).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,MAX_MENTIONS).map(m=>[m.id,m]));}
// Mentions per day (stories and comments) from the day coverage starts; days without mentions are 0, not missing.
function dailyRows(state,end=iso(Date.now()-DAY)){if(!state?.retainedFrom)return [];const by={};for(const m of Object.values(state.mentions||{})){const d=m.createdAt.slice(0,10);by[d] ||= {mentions:0,stories:0,points:0};by[d].mentions++;if(m.type==='story'){by[d].stories++;by[d].points+=m.points;}}
 const out=[];for(let d=state.retainedFrom;d<=end;d=iso(Date.parse(d+'T00:00:00Z')+DAY))out.push({date:d,...(by[d]||{mentions:0,stories:0,points:0})});return out;}
class HackerNewsSource{
 readonly runs: ProjectRuns;
 constructor(plugin,read=download){this.p=plugin;this.runs=new ProjectRuns();this.p.network?.bind(this,['connect', 'sync']);this.read=this.p.network&&read===download?(url)=>download(url,0,{network:this.p.network,connection:'hackernews'}):read;this.runs.bindRequest(this,'read');}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `hackernews:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn){this.runs.assertActive();return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});this.runs.assertActive();const state=await fn(row?.get('payload')||null);this.runs.assertActive();if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 // Exact phrase search, newest first, paged until the start date (Algolia stops at 1000 hits).
 async search(term,sinceMs,maxPages){const out=[];let complete=true;for(let page=0;page<maxPages;page++){const url=`${API}?query=${encodeURIComponent(`"${term}"`)}&tags=(story,comment)&numericFilters=created_at_i>${Math.floor(sinceMs/1000)}&hitsPerPage=100&page=${page}`;
  this.runs.assertActive();let d;try{d=JSON.parse((await this.read(url)).text);}catch(e){if(e.status||/来源/.test(e.message))throw e;fail(systemMessageText('hackernewsSource.hackerNewsSearchNotReturn'),502);}
  out.push(...(d.hits||[]).map(h=>mention(h,term)));if(page+1>=(d.nbPages||0))break;if(page+1===maxPages)complete=false;}
  return {hits:out,complete};}
 async preview(v){const list=terms(v.terms);const since=businessNow(this.p)-30*DAY,found=[];for(const t of list)found.push(...(await this.search(t,since,1)).hits);
  const uniq=[...new Map(found.map(m=>[m.id,m])).values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return {terms:list,last30:uniq.length,stories:uniq.filter(m=>m.type==='story').length,recent:uniq.slice(0,3).map(m=>({title:m.title,type:m.type,hnUrl:m.hnUrl,createdAt:m.createdAt}))};}
 async connect(id,v){const list=terms(v.terms);await this.mutate(id,old=>{const same=old&&JSON.stringify(old.terms)===JSON.stringify(list);return {...(same?old:{mentions:{}}),terms:list,connectedAt:same?old.connectedAt:new Date().toISOString(),status:'active',...(same?{}:{backfilledAt:null,retainedFrom:null,lastSync:null})};});
  this.runs.start(id,()=>this.sync(id));return this.state(id);}
 async disconnect(id){await this.runs.cancel(id,()=>this.mutate(id,cur=>cur?{...cur,status:'disconnected'}:cur));return this.state(id);}
 sync(id){return this.runs.run(id,()=>this.collect(id));}
 async collect(id){const s=await this.state(id);if(!s?.terms?.length||s.status==='disconnected')fail(systemMessageText('hackernewsSource.connectHackerNewsFirst'),409);const clock=businessNow(this.p,id),now=new Date(clock).toISOString(),at=new Date().toISOString(),deep=!s.backfilledAt,errors=[],found=[];let complete=true;
  const since=clock-(deep?FIRST_DAYS:DAILY_DAYS)*DAY;
  for(const t of s.terms){try{const r=await this.search(t,since,deep?10:3);found.push(...r.hits);if(!r.complete)complete=false;}catch(e){errors.push(`「${t}」：${e.message}`);}}
  const keepFrom=new Date(clock-KEEP_DAYS*DAY).toISOString();
  return this.mutate(id,cur=>{if(!cur||JSON.stringify(cur.terms)!==JSON.stringify(s.terms))return cur;const ok=!errors.length;
   // When the first read hit the 1000-result cap, coverage starts at the oldest mention read, not a year ago.
   const oldest=found.map(m=>m.createdAt).sort()[0],start=deep?(complete?iso(since):(oldest?oldest.slice(0,10):iso(clock))):cur.retainedFrom;
   const keepDay=iso(Date.parse(keepFrom)),retainedFrom=deep&&ok?start:cur.retainedFrom&&cur.retainedFrom<keepDay?keepDay:cur.retainedFrom;
   return {...cur,mentions:merge(cur.mentions,found,keepFrom),...(deep&&ok?{backfilledAt:now}:{}),retainedFrom,lastSync:record(cur.lastSync,{at,ok,errors})};});}
 async status(id){const s=await this.state(id);if(!s?.terms?.length)return {connected:false};const since30=new Date(businessNow(this.p,id)-30*DAY).toISOString(),list=Object.values(s.mentions||{}),recent=list.filter(m=>m.createdAt>=since30);
  return {connected:s.status!=='disconnected',syncing:this.runs.has(id),terms:s.terms,lastSync:s.lastSync||null,retainedFrom:s.retainedFrom||null,total:list.length,last30:recent.length,stories30:recent.filter(m=>m.type==='story').length,
   top:list.filter(m=>m.type==='story').sort((a,b)=>b.points-a.points).slice(0,5).map(m=>({title:m.title,points:m.points,comments:m.comments,hnUrl:m.hnUrl,createdAt:m.createdAt}))};}
 async tick(){if(this.busy)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{const s=await this.state(String(id));if(!s?.terms?.length||s.status==='disconnected'||this.runs.has(String(id)))continue;if(!due(s.lastSync))continue;await this.sync(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach source tick failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 async close(){await this.runs.close();}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('hackernewsSource.readingHackerNewsNotComplete'));}};
  this.p.app.resourceManager.define({name:'nrHackerNews',actions:{status:wrap(id=>this.status(id)),preview:wrap((id,v)=>this.preview(v)),connect:wrap(async(id,v)=>{await this.connect(id,v);return this.status(id);}),sync:wrap(async id=>{await this.sync(id);return this.status(id);}),disconnect:wrap(async id=>{await this.disconnect(id);return this.status(id);})}});
  this.p.app.acl.allow('nrHackerNews',['status','preview','connect','sync','disconnect'],'loggedIn');}
}
export { HackerNewsSource, terms, mention, merge, dailyRows };