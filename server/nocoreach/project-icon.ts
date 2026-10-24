// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { download } from './public-sources.js';
// The project's site icon for the header (SPEC §5): read from the site's homepage <link rel=icon> (largest PNG or SVG
// preferred, then /favicon.ico), kept as a small data URL and refreshed weekly. Public read only; a failure keeps the
// letter fallback and is retried after a day.
const MAX_BYTES=200*1024,WEEK=7*86400000,DAY=86400000;
const host=d=>String(d||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'');
// Icon links in a homepage, best first: apple-touch-icon and sized PNGs (larger is better), SVG, any icon, then /favicon.ico.
function iconLinks(html,base){const out=[];for(const m of String(html||'').matchAll(/<link\b[^>]*>/gi)){const tag=m[0],rel=(tag.match(/\brel\s*=\s*["']([^"']+)["']/i)||[])[1]||'';if(!/\bicon\b/i.test(rel))continue;const href=(tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)||[])[1];if(!href||/^data:/i.test(href))continue;
  let url;try{url=new URL(href.replace(/&amp;/g,'&'),base);}catch{continue;}if(url.protocol!=='https:')continue;const size=Math.max(0,...((tag.match(/\bsizes\s*=\s*["']([^"']+)["']/i)||[])[1]||'').split(/\s+/).map(x=>parseInt(x,10)||0));const svg=/\.svg(\?|$)/i.test(url.pathname)||/svg/i.test(tag);
  out.push({url:url.href,score:(/apple-touch-icon/i.test(rel)?400:0)+Math.min(size,256)+(svg?300:0)});}
 out.sort((a,b)=>b.score-a.score);out.push({url:new URL('/favicon.ico',base).href,score:-1});return [...new Map(out.map(x=>[x.url,x])).values()].map(x=>x.url);}
const IMAGE=/^image\/(png|svg\+xml|x-icon|vnd\.microsoft\.icon|jpeg|webp|gif)/i;
class ProjectIcon{
 constructor(plugin,read=download){this.p=plugin;this.p.network?.bind(this,['get']);this.read=this.p.network&&read===download?(url)=>download(url,0,{network:this.p.network,connection:'site'}):read;}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 key(id){return `project-icon:${id}`;}
 async saved(id){return (await this.repo().findOne({filter:{key:this.key(id)}}))?.get('payload')||null;}
 async save(id,value){const row=await this.repo().findOne({filter:{key:this.key(id)}});if(row)await this.repo().update({filterByTk:row.id,values:{payload:value}});else await this.repo().create({values:{key:this.key(id),payload:value}});return value;}
 // The homepage may live on www or the bare domain; a redirect to the other one counts as a different host for the safe reader.
 async fetchIcon(domain){const d=host(domain);for(const origin of [`https://${d}`,`https://www.${d.replace(/^www\./,'')}`].filter((o,i,a)=>a.indexOf(o)===i)){let page;try{page=await this.read(origin+'/');}catch{continue;}
  for(const url of iconLinks(page.text,page.url||origin+'/').slice(0,4)){try{const r=await this.read(url);const type=String(r.type||'').split(';')[0].trim()||(/\.svg/i.test(url)?'image/svg+xml':/\.ico/i.test(url)?'image/x-icon':'');const body=r.body||Buffer.from(r.text||'');if(!IMAGE.test(type)||!body.length||body.length>MAX_BYTES)continue;return {dataUrl:`data:${type};base64,${body.toString('base64')}`,source:url};}catch{/* try the next icon */}}}
  return null;}
 async get(id){const project=await this.p.project(id),domain=host(project?.domains?.[0]);if(!domain)return {dataUrl:null};const s=await this.saved(id),now=Date.now();
  if((this.p as {demoConfiguration?:{enabled:boolean}}).demoConfiguration?.enabled)return {dataUrl:null,source:null};
  const fresh=s&&s.domain===domain&&(s.dataUrl?now-Date.parse(s.fetchedAt)<WEEK:now-Date.parse(s.fetchedAt)<DAY);if(fresh)return {dataUrl:s.dataUrl||null,source:s.source||null};
  if(this.pending)return {dataUrl:s?.domain===domain?s.dataUrl||null:null};
  this.pending=this.fetchIcon(domain).then(r=>this.save(id,{domain,fetchedAt:new Date().toISOString(),dataUrl:r?.dataUrl||null,source:r?.source||null})).catch(()=>this.save(id,{domain,fetchedAt:new Date().toISOString(),dataUrl:s?.dataUrl||null,source:s?.source||null})).finally(()=>{this.pending=null;});
  const r=await this.pending;return {dataUrl:r?.dataUrl||null,source:r?.source||null};}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('projectIcon.iconReadingNotComplete'));}};
  this.p.app.resourceManager.define({name:'nrProjectIcon',actions:{get:wrap(id=>this.get(id))}});this.p.app.acl.allow('nrProjectIcon',['get'],'loggedIn');}
}
export { ProjectIcon, iconLinks };
