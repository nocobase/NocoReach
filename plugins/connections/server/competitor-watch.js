'use strict';
// 竞品动态 (SPEC §11 竞品, P2; 2026-10-04): up to five competitors a person lists (name, website, GitHub repository) are
// looked at once a week, for free: new pages in the website's sitemap (titles read for a few, read politely like
// 网站内容) and, on GitHub's public API, new releases and stars. The first look only records what is there. Keyword
// coverage stays on 竞品 › 查域名 (DataForSEO, paid, asked for by the person).
const {createHash,randomUUID}=require('node:crypto');
const {projectId,requireAdmin}=require('./policy');
const {pageMeta}=require('./site-content');
const {download}=require('./public-sources');
const {memoryOf}=require('../dist/execution/memory');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const DAY=86400000,WEEK=7*DAY,MAX=5,KNOWN=6000,EVENTS=400,TITLES=8,BURST=40;
const hash=u=>createHash('sha1').update(String(u).replace(/\/$/,'')).digest('hex').slice(0,10);
const str=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
function siteOf(input){const raw=str(input,300);if(!raw)return '';let u;try{u=new URL(/^https?:\/\//i.test(raw)?raw:`https://${raw}`);}catch{fail('官网地址不对，例如 https://retool.com');}
 if(!/\.[a-z]{2,}$/i.test(u.hostname))fail('官网地址不对，例如 https://retool.com');return `https://${u.hostname.toLowerCase()}`;}
function repoOf(input){const raw=str(input,300);if(!raw)return '';const m=raw.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);if(!m)fail('GitHub 仓库写成 https://github.com/org/repo');return `${m[1]}/${m[2]}`;}
// Names written in 记忆's 竞品 section, offered when adding.
function memoryNames(project,list){const taken=new Set(list.map(c=>c.name.toLowerCase()));return [...new Set(String(memoryOf(project).competitors||'').split(/[\n,，、;；]/).map(s=>s.replace(/[（(].*$/,'').replace(/^[-*•\s]+/,'').split(/[:：]/)[0].trim()).filter(s=>s.length>=2&&s.length<=30&&!taken.has(s.toLowerCase())))].slice(0,8);}
class CompetitorWatch{
 constructor(p,read=download){this.p=p;this.read=read;this.checking=null;}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `competitors:${id}`;}
 async state(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async mutate(id,fn){return this.p.db.sequelize.transaction(async transaction=>{await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:this.key(id)},transaction});const row=await this.repo().findOne({filter:{key:this.key(id)},transaction});const state=await fn(row?.get('payload')||{list:[],track:{},events:[]});if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});else await this.repo().create({values:{key:this.key(id),payload:state},transaction});return state;});}
 async add(id,v){const name=str(v.name,60),site=siteOf(v.site),repo=repoOf(v.repo);if(!name)fail('请填写竞品名称');if(!site&&!repo)fail('官网和 GitHub 仓库至少填一个');
  const project=await this.p.projects.get(id);if(site&&(project.domains||[]).some(d=>site.endsWith(String(d).replace(/^www\./,''))))fail('这是本项目自己的网站');
  let added;await this.mutate(id,s=>{if(s.list.length>=MAX)fail(`最多关注 ${MAX} 个竞品`,409);if(s.list.some(c=>c.name.toLowerCase()===name.toLowerCase()||(site&&c.site===site)||(repo&&c.repo===repo)))fail('这个竞品已经在列表里了',409);
   added={id:randomUUID().slice(0,8),name,site,repo,addedAt:new Date().toISOString()};return {...s,list:[...s.list,added]};});
  this.start(id,[added.id]);return this.status(id);}
 async remove(id,v){await this.mutate(id,s=>{const {[v.competitorId]:_gone,...track}=s.track||{};return {...s,list:s.list.filter(c=>c.id!==v.competitorId),track,events:(s.events||[]).filter(e=>e.competitorId!==v.competitorId)};});return this.status(id);}
 start(id,only){if(this.checking)return;this.checking=this.check(id,{force:true,only}).catch(()=>undefined).finally(()=>{this.checking=null;});}
 // One competitor: its sitemap against the pages seen before, its repository and releases.
 async look(id,c,old={}){const now=new Date().toISOString(),track={...old,checkedAt:now},events=[],errors=[],ev=(type,title,url,detail='')=>events.push({id:randomUUID().slice(0,10),competitorId:c.id,type,title:str(title,300),url,detail:str(detail,300),at:now});
  if(c.site){try{const d=await this.p.siteContent.discover(c.site),truncated=d.warnings.some(w=>/只收录/.test(w)),first=!Array.isArray(old.known),known=new Set(old.known||[]),month=Date.now()-30*DAY;
    const fresh=first?[]:d.pages.filter(p=>!known.has(hash(p.url))&&(!truncated||Date.parse(p.lastmod||0)>=month));
    if(fresh.length>BURST)ev('site',`网站新增了 ${fresh.length} 个网址`,c.site,'一次出现很多，可能是改版或新开了栏目');
    else for(const [i,p] of fresh.entries()){let title='',description='';if(i<TITLES){try{const r=await this.read(p.url);({title,description}=pageMeta(String(r.text||''),p.url));}catch{/* the address is enough */}}ev('page',title||new URL(p.url).pathname,p.url,description);}
    track.known=d.pages.map(p=>hash(p.url)).slice(0,KNOWN);track.pages=d.pages.length;track.siteError=null;}
   catch(e){errors.push(`${c.name} 官网：${e.message}`);track.siteError=e.message;}}
  if(c.repo){const token=this.p.github?.token?.(id)||undefined;
   try{const r=await this.p.github.gh(`/repos/${c.repo}`,token);const day=now.slice(0,10);track.stars={...(old.stars||{}),[day]:r.stargazers_count};track.stars=Object.fromEntries(Object.entries(track.stars).sort(([a],[b])=>a.localeCompare(b)).slice(-120));track.forks=r.forks_count;track.description=str(r.description,200);
    const rel=(await this.p.github.gh(`/repos/${c.repo}/releases?per_page=5`,token)||[]).filter(x=>!x.draft).map(x=>({name:str(x.name||x.tag_name,120),tag:str(x.tag_name,60),url:x.html_url,publishedAt:x.published_at}));
    if(old.latestRelease!==undefined)for(const x of rel.filter(x=>x.publishedAt&&x.publishedAt>(old.latestRelease?.publishedAt||'')).reverse())ev('release',`发布 ${x.name}`,x.url,x.name.includes(x.tag)?'':x.tag);
    track.latestRelease=rel[0]||null;track.repoError=null;}
   catch(e){errors.push(`${c.name} GitHub：${e.message}`);track.repoError=e.message;}}
  return {track,events,errors};}
 async check(id,{force=false,only}={}){const s=await this.state(id);if(!s?.list?.length)return {events:0,errors:[]};const now=new Date().toISOString(),due=s.list.filter(c=>(!only||only.includes(c.id))&&(force||!s.track?.[c.id]?.checkedAt||Date.now()-Date.parse(s.track[c.id].checkedAt)>=WEEK-6*3600000));
  if(!due.length)return {events:0,errors:[]};const results={};for(const c of due)results[c.id]=await this.look(id,c,s.track?.[c.id]);
  let count=0;const errors=Object.values(results).flatMap(r=>r.errors);
  await this.mutate(id,cur=>{const track={...(cur.track||{})},events=[...(cur.events||[])];for(const c of cur.list){const r=results[c.id];if(!r)continue;track[c.id]=r.track;events.unshift(...r.events);count+=r.events.length;}
   return {...cur,track,events:events.slice(0,EVENTS),lastRun:{at:now,ok:!errors.length,errors:errors.slice(0,5)}};});
  return {events:count,errors};}
 // Stars now and a week before (the sample closest to seven days back, at least five days old).
 starsOf(t){const days=Object.entries(t?.stars||{}).sort(([a],[b])=>a.localeCompare(b));if(!days.length)return {stars:null,week:null};const [lastDay,now]=days.at(-1),before=days.filter(([d])=>Date.parse(lastDay)-Date.parse(d)>=5*DAY).at(-1);return {stars:now,week:before?now-before[1]:null};}
 async status(id){const s=await this.state(id)||{list:[],track:{},events:[]},project=await this.p.projects.get(id).catch(()=>({}));
  return {connected:s.list.length>0,checking:Boolean(this.checking),max:MAX,suggestions:memoryNames(project,s.list),lastRun:s.lastRun||null,nextCheckAt:s.lastRun?new Date(Date.parse(s.lastRun.at)+WEEK).toISOString():null,
   list:s.list.map(c=>{const t=s.track?.[c.id]||{};return {...c,checkedAt:t.checkedAt||null,pages:t.pages??null,...this.starsOf(t),latestRelease:t.latestRelease||null,errors:[t.siteError,t.repoError].filter(Boolean)};})};}
 async view(id,v={}){const st=await this.status(id),s=await this.state(id);const since=Date.now()-Number(v.days||90)*DAY;
  return {...st,events:(s?.events||[]).filter(e=>Date.parse(e.at)>=since).slice(0,200).map(e=>({...e,competitor:st.list.find(c=>c.id===e.competitorId)?.name||''})),
   notes:['每周看一次：官网 sitemap 里新出现的页面，GitHub 的新版本和 Star；第一次只记下现状','关键词和流量估算在“查域名”里查（DataForSEO，按次收费）']};}
 async tick(){if(this.busy||this.checking)return;this.busy=true;try{for(const id of await this.p.projectIds()){try{await this.check(String(id));}catch(e){this.p.app?.logger?.warn?.('NocoReach competitor check failed',{projectId:id,message:e.message});}}}finally{this.busy=false;}}
 register(){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);ctx.set('Cache-Control','no-store');try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'竞品动态没有读出来，请稍后重试。');}};
  const actions={status:wrap(id=>this.status(id)),view:wrap((id,v)=>this.view(id,v)),add:wrap((id,v)=>this.add(id,v)),remove:wrap((id,v)=>this.remove(id,v)),check:wrap(async id=>{if(this.checking)fail('正在查看，请稍后刷新',409);this.checking=this.check(id,{force:true});try{const r=await this.checking;return {...r,...await this.status(id)};}finally{this.checking=null;}})};
  this.p.app.resourceManager.define({name:'nrCompetitors',actions});this.p.app.acl.allow('nrCompetitors',Object.keys(actions),'loggedIn');}
}
module.exports={CompetitorWatch,siteOf,repoOf,memoryNames};
