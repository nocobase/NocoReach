// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { normalize, download } from './public-sources.js';
// One-step discovery (SPEC §11): read the homepage and list data sources it links to. Nothing is imported here.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const baseHost=h=>h.replace(/^www\./,'');
const COMMUNITY=/^(forum|forums|community|discuss|discussion|discussions|talk)\./;
const GITHUB_RESERVED=new Set(['sponsors','orgs','topics','features','marketplace','login','about','pricing','enterprise','settings','apps','collections','trending','explore','security','site','contact']);
const decode=v=>v.replace(/&amp;/g,'&').replace(/&#x2F;/gi,'/').trim();
function links(html,base){const out=[];for(const m of String(html||'').matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)){try{const u=new URL(decode(m[1]),base);if(['http:','https:'].includes(u.protocol))out.push(u);}catch{/* ignore malformed links */}}return out;}
function tally(values){const m=new Map();for(const v of values)m.set(v,(m.get(v)||0)+1);return [...m].sort((a,b)=>b[1]-a[1]).map(([v])=>v);}
// Pure extraction from homepage HTML; each finding keeps the evidence (the link or text it came from).
function extract(html,origin){const text=String(html||''),site=baseHost(new URL(origin).hostname),all=links(text,origin);const sameSite=h=>baseHost(h)===site||h.endsWith('.'+site);
 const websites=tally([new URL(origin).origin,...all.filter(u=>sameSite(u.hostname)&&!COMMUNITY.test(u.hostname)).map(u=>u.origin)]).map(o=>o.replace(/^http:/,'https:')).filter((o,i,a)=>a.indexOf(o)===i).slice(0,5);
 const repos=tally(all.filter(u=>u.hostname==='github.com').map(u=>u.pathname.split('/').filter(Boolean)).filter(p=>p.length>=2&&!GITHUB_RESERVED.has(p[0].toLowerCase())).map(p=>`${p[0]}/${p[1].replace(/\.git$/,'')}`)).slice(0,3);
 const forums=tally(all.filter(u=>COMMUNITY.test(u.hostname)).map(u=>u.origin)).slice(0,3);
 const chats=tally(all.filter(u=>/(^|\.)discord\.(gg|com)$/.test(u.hostname)||/(^|\.)slack\.com$/.test(u.hostname)).map(u=>u.hostname.includes('discord')?'Discord':'Slack'));
 const social=tally(all.flatMap(u=>{const p=u.pathname.split('/').filter(Boolean);if(['x.com','twitter.com','www.twitter.com'].includes(u.hostname)&&p[0]&&!['intent','share','home','i'].includes(p[0]))return [`X @${p[0]}`];if(/(^|\.)youtube\.com$/.test(u.hostname)&&p[0])return ['YouTube'];if(/(^|\.)linkedin\.com$/.test(u.hostname)&&p[0]==='company')return ['LinkedIn'];if(/(^|\.)reddit\.com$/.test(u.hostname)&&p[0]==='r'&&p[1])return [`Reddit r/${p[1]}`];return [];}));
 const pkgLinks=all.flatMap(u=>{const p=u.pathname.split('/').filter(Boolean);if(u.hostname.endsWith('npmjs.com')&&p[0]==='package')return [`npm ${p.slice(1,p[1]?.startsWith('@')?3:2).join('/')}`];if(u.hostname==='pypi.org'&&p[0]==='project'&&p[1])return [`PyPI ${p[1]}`];if(u.hostname==='hub.docker.com'&&p[0]==='r'&&p[2])return [`Docker ${p[1]}/${p[2]}`];return [];});
 const plain=text.replace(/<[^>]+>/g,' ');const pkgText=[...plain.matchAll(/\bnpm\s+(?:i|install)\s+(?:-g\s+)?(@?[\w.-]+(?:\/[\w.-]+)?)/g)].map(m=>`npm ${m[1]}`).concat([...plain.matchAll(/\bpip3?\s+install\s+([\w.-]+)/g)].map(m=>`PyPI ${m[1]}`),[...plain.matchAll(/\bdocker\s+(?:pull|run)\s+(?:-[\w-]+\s+\S+\s+)*([\w.-]+\/[\w.-]+)/g)].map(m=>`Docker ${m[1]}`));
 const packages=tally([...pkgLinks,...pkgText]).slice(0,5);
 const feeds=[...text.matchAll(/<link\b[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)].map(m=>m[0].match(/href=["']([^"']+)["']/i)?.[1]).filter(Boolean).slice(0,3);
 const ga4=[...new Set(text.match(/\bG-[A-Z0-9]{6,12}\b/g)||[])].slice(0,3);
 const title=decode(text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/\s+/g,' ').slice(0,200),description=decode(text.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]||'').slice(0,500);
 return {title,description,websites,repos,forums,chats,social,packages,feeds,ga4};}
// Findings become a checklist tied to catalog sources; only "direct" items may be connected in one step.
function checklist(f,discourse){const items=[];
 f.websites.forEach((o,i)=>{const content=i===0||/^https:\/\/(docs|doc|developer|developers|blog|learn|help|guide|guides)\.|^https:\/\/v\d+\.docs\./.test(o);items.push({source:'site',label:o,url:o,status:content?'direct':'optional',note:content?systemMessageText('sourceDiscovery.readsSitemapListsPages'):systemMessageText('sourceDiscovery.pageLinksSubdomainNotSure')});});
 f.repos.forEach((r,i)=>items.push({source:'github',label:r,url:`https://github.com/${r}`,status:i===0?'direct':'optional',note:i===0?systemMessageText('sourceDiscovery.recordsStarsForksReleasesFrequent'):systemMessageText('sourceDiscovery.pageLinksRepositoryConnectSeparately')}));
 for(const o of f.forums)items.push(discourse.includes(o)?{source:'discourse',label:o,url:o,status:'direct',note:systemMessageText('sourceDiscovery.discourseForumReadsPublicPosts')}:{source:'community',label:o,url:o,status:'unsupported',note:systemMessageText('sourceDiscovery.notDiscourseNotSupportedYet')});
 if(f.repos[0])items.push({source:'github-traffic',label:'GitHub Traffic',url:`https://github.com/${f.repos[0]}`,status:'auth',note:systemMessageText('sourceDiscovery.needCreateReadToken')});
 items.push({source:'gsc',label:'Google Search Console',status:'auth',note:systemMessageText('sourceDiscovery.needsGoogleAuthorization')});
 items.push({source:'ga4',label:f.ga4.length?systemMessageText('messages.ga4DetectedPage', { 0: f.ga4.join('、') }):'GA4',status:'auth',note:systemMessageText('sourceDiscovery.needsGoogleAuthorization')});
 for(const c of f.chats){const slack=/slack/i.test(c);items.push({source:slack?'slack':'discord',label:c,status:'auth',note:slack?systemMessageText('sourceDiscovery.needsInternalAppWorkspace'):systemMessageText('sourceDiscovery.needsBotCreatedInvitedServer')});}
 // Packages named on the page (links or install commands): the first is checked, each keeps its registry and name.
 f.packages.forEach((p,i)=>{const [kind,...rest]=p.split(' '),registry={npm:'npm',PyPI:'pypi',Docker:'docker'}[kind];if(!registry)return;items.push({source:'packages',label:p,registry,name:rest.join(' '),status:i===0?'direct':'optional',note:i===0?systemMessageText('sourceDiscovery.recordsDownloadsDaily'):systemMessageText('sourceDiscovery.pageMentionsPackageConnectToo')});});
 // Hacker News: the site's name and domain as exact phrases; unchecked, since short names can match unrelated posts.
 const domain=baseHost(new URL(f.origin||'https://x.invalid').hostname),brand=domain.split('.')[0],terms=[...new Set([brand.length>=4?brand:null,domain].filter(Boolean))];
 if(f.origin&&domain.includes('.'))items.push({source:'mentions',label:`Hacker News：${terms.join('、')}`,terms,status:'optional',note:systemMessageText('sourceDiscovery.findsPostsCommentsMentioningTerms')});
 for(const s of f.social)items.push({source:s.startsWith('Reddit')?'reddit':'social',label:s,status:'unsupported',note:s.startsWith('Reddit')?systemMessageText('sourceDiscovery.redditNeedsAuthorizationPlanned'):systemMessageText('dataSources.planned')});
 return items;}
class SourceDiscovery{
 constructor(plugin,read=download){this.p=plugin;this.p.network?.bind(this,[]);this.read=this.p.network&&read===download?(url)=>download(url,0,{network:this.p.network,connection:'site'}):read;}
 async isDiscourse(origin){try{const r=await this.read(origin+'/about.json');return Boolean(JSON.parse(r.text)?.about);}catch{return false;}}
 // A bare apex and its www. host are the same site to visitors but different hostnames to download()'s
 // same-host redirect check (SPEC §11 / PM-324): retry once with the www. prefix toggled, then keep
 // whichever origin actually read, falling back to the first error when neither host answers.
 async discover(input){const requested=new URL(normalize('website',input)).origin;let origin=requested,home,firstError;
  try{home=await this.read(origin);}catch(e){firstError=e;
   if(e.message===systemMessageText('publicSources.pageRedirectsAnotherDomainProvide')){
    const alt=new URL(origin);alt.hostname=alt.hostname.startsWith('www.')?alt.hostname.slice(4):`www.${alt.hostname}`;
    try{home=await this.read(alt.origin);origin=alt.origin;}catch{/* keep firstError */}
   }
  }
  if(!home)fail(systemMessageText('messages.caNotReadHomepage', { 0: firstError.message }),firstError.status||422);
  if(!/text\/html/.test(home.type||''))fail(systemMessageText('sourceDiscovery.homepageNotHtmlPageLinks'),422);
  const found=extract(home.text,origin);const discourse=[];for(const f of found.forums)if(await this.isDiscourse(f))discourse.push(f);
  return {origin,title:found.title,description:found.description,items:checklist({...found,origin},discourse)};}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('sourceDiscovery.discoveryNotCompleteCheckUrl'));}};
  this.p.app.resourceManager.define({name:'nrDiscovery',actions:{discover:wrap((id,v)=>this.discover(v.url))}});this.p.app.acl.allow('nrDiscovery',['discover'],'loggedIn');}
}
export { SourceDiscovery, extract, checklist, links };