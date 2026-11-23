// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { buildResearchSpec, parseResearch } from './research-adapter.js';
import { VisibilityError } from './research-helpers.js';
import { markets, languages } from './keyword-policy.js';
import { projectId, requireAccess } from './policy.js';
import { DataForSeo, REUSE_MS } from './dataforseo.js';
// 域名概览 (OpenSEO Domain Overview, batch 3; backlinks are backlinks-service.ts): any site's ranking keywords and top pages from
// DataForSEO Labs, on the shared DataForSEO layer (runs only when asked, monthly budget, 30-day reuse, uncertain
// results not retried). One query per tab: 查询 reads the ranking keywords, whose reply also carries the site's
// estimated traffic and position counts; the pages tab is read only when the person asks for it.
const error=(message,status=400)=>{throw new VisibilityError(message,status);};
// A bare domain from a domain or a site address: no scheme, path or www.
function host(input){let v=String(input||'').trim().toLowerCase();try{if(/^https?:\/\//.test(v))v=new URL(v).hostname;}catch{error(systemMessageText('domain.enterDomainExampleExampleCom'));}v=v.replace(/^www\./,'').replace(/\/.*$/,'');if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)||v.length>253)error(systemMessageText('domain.enterDomainExampleExampleCom'));return v;}
// Keyword pages (2026-11-23): each page of 100 ranking keywords is a run of its own, read only when the person opens it;
// `offset` is a multiple of PAGE. A sort other than the default (estimated traffic, highest first) is kept in the spec as
// `sort`; the default writes none, so the first page's spec, request and query hash are those of every earlier lookup.
const PAGE=100,MAX_OFFSET=10000;
const SORTS={traffic:'ranked_serp_element.serp_item.etv',volume:'keyword_data.keyword_info.search_volume',position:'ranked_serp_element.serp_item.rank_group',difficulty:'keyword_data.keyword_properties.keyword_difficulty'};
const DEFAULT_SORT='traffic:desc';
function sortOf(v){const s=v===undefined||v===null||v===''?DEFAULT_SORT:String(v),[field,dir]=s.split(':');if(!SORTS[field]||!['asc','desc'].includes(dir)||s.split(':').length!==2)error(systemMessageText('domain.sortNotSupported'));return s;}
function specification(v){
 if(!['keywords','pages'].includes(v.view)||!markets.includes(Number(v.locationCode))||!languages.includes(v.language))error(systemMessageText('aiSearch.pickSupportedRegionLanguage'));
 const offset=v.offset===undefined||v.offset===null?0:Number(v.offset),sort=v.view==='keywords'?sortOf(v.sort):DEFAULT_SORT;
 if(!Number.isInteger(offset)||offset<0||offset>MAX_OFFSET||offset%PAGE||(v.view!=='keywords'&&offset))error(systemMessageText('domain.pageNotSupported'));
 const spec=buildResearchSpec({kind:'domain',view:v.view,target:host(v.target),scope:'subdomains',locationCode:Number(v.locationCode),language:v.language,limit:PAGE,offset});
 spec.estimatedUsd=Number((0.011+100*0.0001).toFixed(6));spec.reservationUsd=0.05;spec.priceVersion='official-list-2026-09-23';
 if(sort!==DEFAULT_SORT){const [field,dir]=sort.split(':');spec.sort=sort;spec.request.order_by=[`${SORTS[field]},${dir}`];}
 return spec;}
// The first page of a keywords lookup in its own sort: what Recent lookups lists and what the page's address opens.
const firstPage=spec=>spec?.kind==='domain'&&!spec.offset&&!spec.sort;
// Keeps plain fields only; the keywords reply also gives the site's organic metrics (traffic, keyword count, positions).
function result(raw,spec){const parsed=parseResearch(raw,spec);
 if(parsed.result){parsed.result.items=parsed.result.items.map(({raw:_r,serpInfo:_s,...i})=>i);
  const m=raw?.tasks?.[0]?.result?.[0]?.metrics?.organic;
  if(spec.view==='keywords'&&m)parsed.result.summary={traffic:Number(m.etv)||0,keywords:Number(m.count)||0,top3:(Number(m.pos_1)||0)+(Number(m.pos_2_3)||0),top10:(Number(m.pos_1)||0)+(Number(m.pos_2_3)||0)+(Number(m.pos_4_10)||0)};}
 return parsed;}
class DomainService{
 constructor(p){this.p=p;this.d4s=new DataForSeo(p,{domain:{specification,result}});}
 // A first page (any sort) comes back with the later pages already read, so a lookup reopened in that sort shows them.
 async run(id,v){const r=await this.d4s.run(id,'domain',v);return r.spec?.view==='keywords'&&!r.spec.offset?{...r,pages:await this.pages(id,r)}:r;}
 // Recent lookups: the table holds every DataForSEO kind and each keyword page, so it is scanned page by page on its
 // small columns until 30 first pages are found (as Backlinks' list does), and only those are read in full.
 async list(id){const ids=[];
  for(let offset=0;offset<20000&&ids.length<30;offset+=500){const rows=await this.d4s.repo().find({filter:{projectId:id},fields:['id','spec'],sort:'-createdAt',limit:500,offset});
   for(const r of rows)if(firstPage(r.get('spec')))ids.push(String(r.id));if(rows.length<500)break;}
  if(!ids.length)return [];
  return (await this.d4s.repo().find({filter:{projectId:id,id:{$in:ids.slice(0,30)}},sort:'-createdAt'})).filter(r=>firstPage(r.get('spec'))).slice(0,30).map(r=>({id:String(r.id),status:r.get('status'),spec:r.get('spec'),createdAt:r.get('createdAt'),completedAt:r.get('completedAt')||null,errorCode:r.get('errorCode')||null,count:r.get('result')?.items?.length??null,summary:r.get('result')?.summary||null}));}
 // The later pages of a keywords lookup (same site, market and sort) completed within the reuse time, so opening them
 // again costs nothing: found by the query hash each page would have, in one read.
 async pages(id,run){const spec=run.spec,total=Number(run.result?.totalCount)||0;
  if(spec?.view!=='keywords'||run.status!=='completed'||total<=PAGE)return [];
  const c=this.d4s.config(id),hashes=new Map();
  for(let offset=PAGE;offset<Math.min(total,MAX_OFFSET+1);offset+=PAGE)hashes.set(this.d4s.queryHash(id,c,specification({view:'keywords',target:spec.target,locationCode:spec.locationCode,language:spec.language,sort:spec.sort,offset})),offset);
  const rows=await this.d4s.repo().find({filter:{projectId:id,queryHash:{$in:[...hashes.keys()]},status:'completed',createdAt:{$gte:new Date(Date.now()-REUSE_MS).toISOString()}},sort:'-createdAt'});
  const seen=new Set();return rows.filter(r=>{const o=hashes.get(r.get('queryHash'));if(o===undefined||seen.has(o))return false;seen.add(o);return true;}).map(r=>r.toJSON()).sort((a,b)=>a.spec.offset-b.spec.offset);}
 async getRun(id,v){const r=await this.d4s.repo().findOne({filter:{id:String(v.runId),projectId:id}});if(!r||r.get('spec')?.kind!=='domain')error(systemMessageText('domain.queryRecordNotFound'),404);const json=r.toJSON();return {...json,pages:await this.pages(id,json)};}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{if(ctx.method!=='POST')error(systemMessageText('aiSearch.usePost'),405);const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){if(!(e instanceof VisibilityError))ctx.logger.warn('NocoReach domain local failure',{errorName:e.name});ctx.throw(e instanceof VisibilityError?e.status:502,e instanceof VisibilityError?e.message:systemMessageText('domain.domainLookupNotCompleteTry'));}};
  const actions={run:wrap((id,v)=>this.run(id,v)),list:wrap(id=>this.list(id)),getRun:wrap((id,v)=>this.getRun(id,v))};
  this.p.app.resourceManager.define({name:'nrDomains',actions});this.p.app.acl.allow('nrDomains',Object.keys(actions),'loggedIn');}
}
export { DomainService, specification, result, host, firstPage };