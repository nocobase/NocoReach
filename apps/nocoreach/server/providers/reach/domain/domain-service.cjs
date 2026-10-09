'use strict';
// 域名概览 (OpenSEO Domain Overview, batch 3 without backlinks): any site's ranking keywords and top pages from
// DataForSEO Labs, on the shared DataForSEO layer (runs only when asked, monthly budget, 30-day reuse, uncertain
// results not retried). One query per tab: 查询 reads the ranking keywords, whose reply also carries the site's
// estimated traffic and position counts; the pages tab is read only when the person asks for it.
const {buildResearchSpec,parseResearch}=require('./research-adapter.cjs');
const {VisibilityError}=require('./research-helpers.cjs');
const {markets,languages}=require('./keyword-policy.cjs');
const {projectId,requireAccess}=require('./policy.cjs');
const {DataForSeo}=require('./dataforseo.cjs');
const error=(message,status=400)=>{throw new VisibilityError(message,status);};
// A bare domain from a domain or a site address: no scheme, path or www.
function host(input){let v=String(input||'').trim().toLowerCase();try{if(/^https?:\/\//.test(v))v=new URL(v).hostname;}catch{error('请填写域名，例如 example.com');}v=v.replace(/^www\./,'').replace(/\/.*$/,'');if(!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)||v.length>253)error('请填写域名，例如 example.com');return v;}
function specification(v){
 if(!['keywords','pages'].includes(v.view)||!markets.includes(Number(v.locationCode))||!languages.includes(v.language))error('请选择支持的地区和语言');
 const spec=buildResearchSpec({kind:'domain',view:v.view,target:host(v.target),scope:'subdomains',locationCode:Number(v.locationCode),language:v.language,limit:100,offset:0});
 spec.estimatedUsd=Number((0.011+100*0.0001).toFixed(6));spec.reservationUsd=0.05;spec.priceVersion='official-list-2026-09-23';
 return spec;}
// Keeps plain fields only; the keywords reply also gives the site's organic metrics (traffic, keyword count, positions).
function result(raw,spec){const parsed=parseResearch(raw,spec);
 if(parsed.result){parsed.result.items=parsed.result.items.map(({raw:_r,serpInfo:_s,...i})=>i);
  const m=raw?.tasks?.[0]?.result?.[0]?.metrics?.organic;
  if(spec.view==='keywords'&&m)parsed.result.summary={traffic:Number(m.etv)||0,keywords:Number(m.count)||0,top3:(Number(m.pos_1)||0)+(Number(m.pos_2_3)||0),top10:(Number(m.pos_1)||0)+(Number(m.pos_2_3)||0)+(Number(m.pos_4_10)||0)};}
 return parsed;}
class DomainService{
 constructor(p){this.p=p;this.d4s=new DataForSeo(p,{domain:{specification,result}});}
 run(id,v){return this.d4s.run(id,'domain',v);}
 async list(id){return (await this.d4s.repo().find({filter:{projectId:id},sort:'-createdAt',limit:100})).filter(r=>r.get('spec')?.kind==='domain').slice(0,30).map(r=>({id:String(r.id),status:r.get('status'),spec:r.get('spec'),createdAt:r.get('createdAt'),completedAt:r.get('completedAt')||null,errorCode:r.get('errorCode')||null,count:r.get('result')?.items?.length??null,summary:r.get('result')?.summary||null}));}
 async getRun(id,v){const r=await this.d4s.repo().findOne({filter:{id:String(v.runId),projectId:id}});if(!r||r.get('spec')?.kind!=='domain')error('查询记录不存在',404);return r.toJSON();}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{if(ctx.method!=='POST')error('请使用 POST',405);const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){if(!(e instanceof VisibilityError))ctx.logger.warn('NocoReach domain local failure',{errorName:e.name});ctx.throw(e instanceof VisibilityError?e.status:502,e instanceof VisibilityError?e.message:'域名查询没有完成，请稍后重试');}};
  const actions={run:wrap((id,v)=>this.run(id,v)),list:wrap(id=>this.list(id)),getRun:wrap((id,v)=>this.getRun(id,v))};
  this.p.routes.define({name:'nrDomains',actions});this.p.routes.allow('nrDomains',Object.keys(actions),'loggedIn');}
}
module.exports={DomainService,specification,result,host};
