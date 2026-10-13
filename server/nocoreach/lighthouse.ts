// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { projectId, requireAccess } from './policy.js';
import { VisibilityError } from './research-helpers.js';
import { DataForSeo } from './dataforseo.js';
// 性能检查 (Lighthouse) on 审计: after every-app/open-seo db8bde1 src/server/lib/dataforseo/lighthouse.ts and
// lighthouseStoredPayload.ts (MIT). One page at a time and only when asked, on the shared DataForSEO layer (monthly budget,
// the same page and device reused for 30 days, an uncertain run never retried); a run waits up to 90 s because Lighthouse
// loads the page in a browser. Only the scores, the main metrics and the failing checks are kept, not the multi-MB report.
const error=(message,status=400)=>{throw new VisibilityError(message,status);};
const CATEGORIES=['performance','accessibility','best-practices','seo'];
const METRICS=[['largest-contentful-paint','LCP'],['cumulative-layout-shift','CLS'],['total-blocking-time','TBT'],['first-contentful-paint','FCP'],['speed-index','Speed Index'],['interactive','TTI'],['server-response-time',systemMessageText('lighthouse.serverResponse')]];
const SKIP=new Set(['largest-contentful-paint-element','layout-shifts','diagnostics','metrics','network-requests','network-rtt','network-server-latency','main-thread-tasks','resource-summary','screenshot-thumbnails','final-screenshot','full-page-screenshot','script-treemap-data']);
const pct=v=>typeof v==='number'&&!Number.isNaN(v)?Math.round(v*100):null;
const text=(v,max)=>String(v||'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/`/g,'').trim().slice(0,max);
function pageUrl(v){let u;try{u=new URL(String(v||'').trim());}catch{error(systemMessageText('lighthouse.enterFullUrlExampleHttps'));}if(u.protocol!=='https:'||u.username||u.password)error(systemMessageText('lighthouse.publicHttpsUrlsSupported'));u.hash='';return u.href.slice(0,2000);}
function specification(v){const url=pageUrl(v.url),strategy=v.strategy==='desktop'?'desktop':'mobile';
 return {kind:'lighthouse',url,strategy,path:'on_page/lighthouse/live/json',request:{url,for_mobile:strategy==='mobile',categories:['performance','accessibility','best_practices','seo']},timeoutMs:90000,estimatedUsd:0.005,reservationUsd:0.02,priceVersion:'openseo-measured-2026-08'};}
// Scores, metrics, and the failing checks of each category, worst first.
function result(raw,spec){const task=raw?.tasks?.[0],cost=Number.isFinite(raw?.cost)?raw.cost:Number.isFinite(task?.cost)?task.cost:null;
 if(raw?.status_code!==20000||task?.status_code!==20000)return {status:'failed',errorCode:`provider_status_${task?.status_code||raw?.status_code||'unknown'}`,result:null,costUsd:cost};
 const r=task.result?.[0]||{},cats=r.categories||{},audits=r.audits||{};
 const scores=Object.fromEntries(CATEGORIES.map(k=>[k,pct(cats[k]?.score)]));
 if(Object.values(scores).every(x=>x===null))return {status:'failed',errorCode:'lighthouse_no_scores',result:null,costUsd:cost};
 const metrics=METRICS.map(([k,label])=>({key:k,label,value:typeof audits[k]?.displayValue==='string'?audits[k].displayValue.slice(0,40):null,score:pct(audits[k]?.score)})).filter(m=>m.value!==null);
 const issues=[];for(const c of CATEGORIES)for(const ref of Array.isArray(cats[c]?.auditRefs)?cats[c].auditRefs:[]){const a=audits[ref?.id];if(!a||SKIP.has(ref.id))continue;const score=pct(a.score),mode=a.scoreDisplayMode;
  if(mode==='numeric'||score===null||score>=90||['notApplicable','informative','manual','error'].includes(mode))continue;
  const ms=typeof a.details?.overallSavingsMs==='number'?Math.round(a.details.overallSavingsMs):null,bytes=typeof a.details?.overallSavingsBytes==='number'?Math.round(a.details.overallSavingsBytes):null;
  issues.push({category:c,key:ref.id,title:text(a.title,200),description:text(a.description,400),value:text(a.displayValue,80),score,savingsMs:ms,savingsBytes:bytes,severity:score<50||ms>=1000?'high':'medium'});}
 issues.sort((a,b)=>(a.severity==='high'?0:1)-(b.severity==='high'?0:1)||(b.savingsMs||0)-(a.savingsMs||0)||a.score-b.score);
 return {status:'completed',errorCode:null,costUsd:cost,result:{url:spec.url,finalUrl:String(r.finalUrl||r.requestedUrl||spec.url).slice(0,2000),strategy:spec.strategy,version:r.lighthouseVersion||null,scores,metrics,issues:issues.slice(0,30)}};}
class Lighthouse{
 constructor(p){this.p=p;this.d4s=new DataForSeo(p,{lighthouse:{specification,result}});}
 async status(id){const site=await this.p.siteContent?.state(id).catch(()=>null),project=await this.p.project(id);
  return {connected:Boolean(this.d4s.config(id)?.verifiedAt),suggested:site?.sites?.[0]?.origin?`${site.sites[0].origin}/`:project.domains?.[0]?`https://${String(project.domains[0]).replace(/^https?:\/\//,'').replace(/\/.*$/,'')}/`:''};}
 run(id,v){return this.d4s.run(id,'lighthouse',v);}
 async list(id){return (await this.d4s.repo().find({filter:{projectId:id},sort:'-createdAt',limit:200})).filter(r=>r.get('spec')?.kind==='lighthouse').slice(0,20).map(r=>({id:String(r.id),status:r.get('status'),url:r.get('spec').url,strategy:r.get('spec').strategy,createdAt:r.get('createdAt'),scores:r.get('result')?.scores||null,errorCode:r.get('errorCode')||null}));}
 async getRun(id,v){const r=await this.d4s.repo().findOne({filter:{id:String(v.runId),projectId:id}});if(!r||r.get('spec')?.kind!=='lighthouse')error(systemMessageText('lighthouse.checkRecordNotFound'),404);return r.toJSON();}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);ctx.set('Cache-Control','no-store');try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v);await next();}catch(e){if(!(e instanceof VisibilityError))ctx.logger.warn('NocoReach lighthouse local failure',{errorName:e.name});ctx.throw(e instanceof VisibilityError?e.status:502,e instanceof VisibilityError?e.message:systemMessageText('lighthouse.performanceCheckNotCompleteTry'));}};
  const actions={status:wrap(id=>this.status(id)),run:wrap((id,v)=>this.run(id,v)),list:wrap(id=>this.list(id)),getRun:wrap((id,v)=>this.getRun(id,v))};
  this.p.app.resourceManager.define({name:'nrLighthouse',actions});this.p.app.acl.allow('nrLighthouse',Object.keys(actions),'loggedIn');}
}
export { Lighthouse, specification, result };