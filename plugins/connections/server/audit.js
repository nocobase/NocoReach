'use strict';
// 网站审计 (OpenSEO Site Audit, batch 5, without Lighthouse): checks the pages of the 网站内容 source as they were last
// read (each is re-read weekly), so the audit is free and covers exactly the pages 内容 lists. Every issue type lists
// the pages it affects and says whether it is a technical fix or a content change, for 交给 Agent.
const {projectId,requireAccess}=require('./policy');
const key=u=>{try{const x=new URL(u);return `${x.host.toLowerCase().replace(/^www\./,'')}${x.pathname.replace(/\/+$/,'')||'/'}`;}catch{return '';}};
const width=s=>[...String(s||'')].reduce((n,c)=>n+(/[\u0000-ÿ]/.test(c)?0.5:1),0);
// Issue types: severity (critical, warning, notice), what to do, and whether it is a technical (tech-fix) or content job.
const TYPES={
 broken:{severity:'critical',title:'页面打不开',description:'读取时返回 4xx 或 5xx，用户和搜索引擎都看不到。',job:'tech'},
 noindex:{severity:'critical',title:'设置了 noindex',description:'页面在 sitemap 里，却告诉搜索引擎不要收录。',job:'tech'},
 offsite:{severity:'warning',title:'跳转到别的域名',description:'打开后跳到别的域名，sitemap 里应换成最终地址。',job:'tech'},
 noTitle:{severity:'warning',title:'缺少标题',description:'页面没有 <title>，搜索结果里会显示得很差。',job:'content'},
 dupTitle:{severity:'warning',title:'标题重复',description:'几个页面用同一个标题，搜索引擎难以区分。',job:'content'},
 noDescription:{severity:'warning',title:'缺少描述',description:'没有 meta description，搜索结果里的摘要由搜索引擎随便截取。',job:'content'},
 dupDescription:{severity:'warning',title:'描述重复',description:'几个页面用同一段描述。',job:'content'},
 noH1:{severity:'warning',title:'缺少 H1',description:'页面没有一级标题。',job:'content'},
 longTitle:{severity:'notice',title:'标题太长',description:'超过 60 个字符（中文按 2 个算）会在搜索结果里被截断。',job:'content'},
 shortDescription:{severity:'notice',title:'描述太短',description:'少于 50 个字符，没说清这一页讲什么。',job:'content'},
 longDescription:{severity:'notice',title:'描述太长',description:'超过 160 个字符会被截断。',job:'content'},
 multiH1:{severity:'notice',title:'有多个 H1',description:'一页最好只有一个一级标题。',job:'content'},
 imagesNoAlt:{severity:'notice',title:'图片缺少说明（alt）',description:'图片没有 alt 文字，搜索引擎和读屏软件看不懂。',job:'content'},
 thin:{severity:'notice',title:'内容很短',description:'正文不到 150 字。',job:'content'},
 canonical:{severity:'notice',title:'canonical 指向别的页面',description:'这页声明了另一个“正式地址”，自己可能不会被收录；确认是不是有意的。',job:'tech'},
 orphan:{severity:'notice',title:'没有内链指向',description:'站内其他读过的页面都没有链接到这一页，用户和搜索引擎不容易找到。',job:'content'},
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
  if(p.h1===0)add('noH1',p);else if(p.h1>1)add('multiH1',p,`${p.h1} 个`);
  if(p.imagesNoAlt>0)add('imagesNoAlt',p,`${p.imagesNoAlt} 张`);
  if(typeof p.words==='number'&&p.words<150)add('thin',p,`${p.words} 字`);
  if(p.canonical&&key(p.canonical)!==key(p.url))add('canonical',p,p.canonical);}
 for(const [field,type] of [['title','dupTitle'],['description','dupDescription']]){const by=new Map();for(const p of ok)if(p[field]){const k=p[field].trim().toLowerCase();by.set(k,[...(by.get(k)||[]),p]);}for(const list of by.values())if(list.length>1)for(const p of list)add(type,p,`和另外 ${list.length-1} 页相同`);}
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
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'审计没有完成，请稍后重试。');}};
  this.p.app.resourceManager.define({name:'nrAudit',actions:{report:wrap(id=>this.report(id)),recheck:wrap(id=>this.recheck(id))}});this.p.app.acl.allow('nrAudit',['report','recheck'],'loggedIn');}
}
module.exports={SiteAudit,audit,TYPES};
