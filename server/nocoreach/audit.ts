// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
// 网站审计 (OpenSEO Site Audit, batch 5, without Lighthouse): checks the pages of the 网站内容 source as they were last
// read (each is re-read weekly), so the audit is free and covers exactly the pages 内容 lists. Every issue type lists
// the pages it affects and says whether it is a technical fix or a content change, for 交给 Agent.
const key=u=>{try{const x=new URL(u);return `${x.host.toLowerCase().replace(/^www\./,'')}${x.pathname.replace(/\/+$/,'')||'/'}`;}catch{return '';}};
const width=s=>[...String(s||'')].reduce((n,c)=>n+(c.charCodeAt(0)<=255?0.5:1),0);
// Issue types: severity (critical, warning, notice), what to do, and whether it is a technical (tech-fix) or content job.
const TYPES={
 broken:{severity:'critical',title:systemMessageText('audit.pageNotLoad'),description:systemMessageText('audit.returns4Xx5Xx'),job:'tech'},
 noindex:{severity:'critical',title:systemMessageText('audit.setNoindex'),description:systemMessageText('audit.pageSitemapTellsSearchEngines'),job:'tech'},
 offsite:{severity:'warning',title:systemMessageText('audit.redirectsAnotherDomain'),description:systemMessageText('audit.redirectsAnotherDomainUseFinal'),job:'tech'},
 noTitle:{severity:'warning',title:systemMessageText('audit.missingTitle'),description:systemMessageText('audit.pageNoTitleShowsPoorly'),job:'content'},
 dupTitle:{severity:'warning',title:systemMessageText('analysisRules.duplicateTitle'),description:systemMessageText('audit.severalPagesShareSameTitle'),job:'content'},
 noDescription:{severity:'warning',title:systemMessageText('audit.missingDescription'),description:systemMessageText('audit.noMetaDescriptionSearchEngines'),job:'content'},
 dupDescription:{severity:'warning',title:systemMessageText('audit.duplicateDescription'),description:systemMessageText('audit.severalPagesShareSameDescription'),job:'content'},
 noH1:{severity:'warning',title:systemMessageText('audit.missingH1'),description:systemMessageText('audit.pageNoTopLevelHeading'),job:'content'},
 longTitle:{severity:'notice',title:systemMessageText('audit.titleTooLong'),description:systemMessageText('audit.over60CharactersChineseCharacters'),job:'content'},
 shortDescription:{severity:'notice',title:systemMessageText('audit.descriptionTooShort'),description:systemMessageText('audit.under50CharactersNotSay'),job:'content'},
 longDescription:{severity:'notice',title:systemMessageText('audit.descriptionTooLong'),description:systemMessageText('audit.over160CharactersGetsTruncated'),job:'content'},
 multiH1:{severity:'notice',title:systemMessageText('audit.multipleH1S'),description:systemMessageText('audit.pageOneTopLevelHeading'),job:'content'},
 imagesNoAlt:{severity:'notice',title:systemMessageText('audit.imagesMissingAltText'),description:systemMessageText('audit.imagesNoAltTextSearch'),job:'content'},
 thin:{severity:'notice',title:systemMessageText('strategy.thinContent'),description:systemMessageText('audit.bodyTextUnder150Characters'),job:'content'},
 canonical:{severity:'notice',title:systemMessageText('audit.canonicalPointsAnotherPage'),description:systemMessageText('audit.pageDeclaresDifferentCanonicalUrl'),job:'tech'},
 orphan:{severity:'notice',title:systemMessageText('audit.noInternalLinksPointHere'),description:systemMessageText('audit.noOtherPageReadSite'),job:'content'},
};
const ORDER={critical:0,warning:1,notice:2};
function audit(site){const pages=site?.pages||[],read=pages.filter(p=>p.fetchedAt),ok=read.filter(p=>!p.fetchError),found={};for(const t of Object.keys(TYPES))found[t]=[];
 const add=(t,p,detail)=>found[t].push({url:p.url,title:p.title||'',detail:detail||''});
 for(const p of read){const e=String(p.fetchError||'');
  if(/返回 [45]\d\d/.test(e)){add('broken',p,e.match(/返回 (\d+)/)?.[1]||'');continue;}
  if(/跳转至其他域名/.test(e)){add('offsite',p);continue;}
  if(e)continue;
  if(p.noindex)add('noindex',p);
  if(!p.title)add('noTitle',p);else if(width(p.title)>30)add('longTitle',p,p.title);
  if(!p.description)add('noDescription',p);else if(p.description.length<50)add('shortDescription',p,p.description);else if(width(p.description)>80)add('longDescription',p);
  if(p.h1===0)add('noH1',p);else if(p.h1>1)add('multiH1',p,systemMessageText('common.itemCount', { 0: p.h1 }));
  if(p.imagesNoAlt>0)add('imagesNoAlt',p,systemMessageText('messages.images', { 0: p.imagesNoAlt }));
  if(typeof p.words==='number'&&p.words<150)add('thin',p,systemMessageText('common.characters', { 0: p.words }));
  if(p.canonical&&key(p.canonical)!==key(p.url))add('canonical',p,p.canonical);}
 for(const [field,type] of [['title','dupTitle'],['description','dupDescription']]){const by=new Map();for(const p of ok)if(p[field]){const k=p[field].trim().toLowerCase();by.set(k,[...(by.get(k)||[]),p]);}for(const list of by.values())if(list.length>1)for(const p of list)add(type,p,systemMessageText('messages.sameOtherPages', { 0: list.length-1 }));}
 // Orphans need link data: only judged once most pages have been read with links.
 const withLinks=ok.filter(p=>Array.isArray(p.links));if(withLinks.length>=Math.max(3,ok.length*0.8)){const inbound=new Set(withLinks.flatMap(p=>p.links));for(const p of withLinks)if(!inbound.has(key(p.url))&&!/^\/?$/.test(new URL(p.url).pathname))add('orphan',p);}
 const issues=Object.entries(found).filter(([,l])=>l.length).map(([type,list])=>({type,...TYPES[type],count:list.length,pages:list.slice(0,200)})).sort((a,b)=>ORDER[a.severity]-ORDER[b.severity]||b.count-a.count);
 const lastRead=read.map(p=>p.fetchedAt).sort();
 return {total:pages.length,read:read.length,pending:pages.length-read.length,oldestRead:lastRead[0]||null,newestRead:lastRead.at(-1)||null,counts:{critical:issues.filter(i=>i.severity==='critical').reduce((n,i)=>n+i.count,0),warning:issues.filter(i=>i.severity==='warning').reduce((n,i)=>n+i.count,0),notice:issues.filter(i=>i.severity==='notice').reduce((n,i)=>n+i.count,0)},issues};}
class SiteAudit{
 constructor(plugin){this.p=plugin;}
 async report(id){const site=await this.p.siteContent?.state(id);if(!site?.pages?.length)return {connected:false};return {connected:true,...audit(site)};}
 // Re-read every page soon (oldest first) instead of waiting for the weekly re-read.
 async recheck(id){await this.p.siteContent.mutate(id,cur=>{if(!cur)return cur;cur.pages=cur.pages.map(p=>p.fetchedAt?{...p,fetchedAt:'2000-01-01T00:00:00.000Z'}:p);return cur;});return this.report(id);}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:systemMessageText('audit.auditNotCompleteTryAgain'));}};
  this.p.app.resourceManager.define({name:'nrAudit',actions:{report:wrap(id=>this.report(id)),recheck:wrap(id=>this.recheck(id))}});this.p.app.acl.allow('nrAudit',['report','recheck'],'loggedIn');}
}
export { SiteAudit, audit, TYPES };