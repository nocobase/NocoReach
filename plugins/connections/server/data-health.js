'use strict';
// Data health (SPEC §11): one view of every connected source's last success, data cutoff, next sync and failure.
const {projectId,requireAdmin}=require('./policy');
const {nextAt,lastSuccess}=require('./sync-policy');
const H=3600000;
// State from attempts only; a failure is "failing" once there has been no success for a day.
function assess({lastSuccessAt,attempt,now=Date.now()}){
 if(!attempt?.at)return {state:'pending',message:'等待首次同步'};
 const errors=attempt.errors||[];
 if(attempt.ok){if(lastSuccessAt&&now-Date.parse(lastSuccessAt)>48*H)return {state:'warning',message:'超过两天没有同步成功'};return errors.length?{state:'warning',message:`部分数据未更新：${errors[0]}`}:{state:'healthy',message:''};}
 const reason=errors[0]||'原因未知';
 if(lastSuccessAt&&now-Date.parse(lastSuccessAt)<24*H)return {state:'warning',message:`上次同步失败，将自动重试：${reason}`};
 return {state:'failing',message:`同步失败超过 1 天：${reason}`};
}
const googleCodes={network_timeout:'网络超时',network_unreachable:'网络不可用',google_api_error:'Google 接口错误',resource_changed:'所选资源已更换',invalid_grant:'Google 授权已失效，请重新授权'};
class DataHealth{
 constructor(plugin){this.p=plugin;}
 async google(id,now){const out=[];let status=null,link=null;try{link=await this.p.link(id);if(link&&this.p.env(require('./policy').secretKey(id)))status=await this.p.sync.status(id);}catch{status=null;}
  for(const [source,name,field] of [['gsc','Google Search Console','gscSiteUrl'],['ga4','GA4','ga4PropertyId']]){if(!status||!link?.get(field))continue;const job=status.jobs.find(j=>j.source===source),through=status.coverage.find(c=>c.source===source)?.availableThrough||null;
   const failed=job?.status==='failed',retrying=job?.status==='retrying',attempt=job?{at:job.finishedAt||job.updatedAt||job.createdAt,ok:!failed&&!retrying,errors:failed||retrying?[googleCodes[job.errorCode]||job.errorCode||'原因未知']:[]}:null;
   let h=assess({lastSuccessAt:status.lastSyncAt,attempt:attempt||(status.lastSyncAt?{at:status.lastSyncAt,ok:true}:null),now});if(retrying)h={state:'warning',message:`正在自动重试：${attempt.errors[0]}`};if(!status.scheduleEnabled&&h.state==='healthy')h={state:'warning',message:'未开启每日同步'};
   out.push({id:source,name,...h,lastSuccessAt:status.lastSyncAt,dataThrough:through,nextSyncAt:status.scheduleEnabled?status.nextSyncAt:null,note:'Google 数据有约 3 天延迟',retry:failed?{resource:'nrGoogle',action:'syncControl',body:{command:'retry'}}:null});}
  return out;}
 async list(id){const now=Date.now(),items=[...await this.google(id,now)];
  const site=await this.p.siteContent?.state(id);if(site?.sites?.length){const last=site.refresh||{at:site.sites.map(x=>x.confirmedAt).sort().at(-1),ok:true,lastSuccessAt:site.sites.map(x=>x.confirmedAt).sort().at(-1)};items.push({id:'site',name:'网站内容',...assess({lastSuccessAt:last.lastSuccessAt,attempt:last,now}),lastSuccessAt:last.lastSuccessAt,dataThrough:null,nextSyncAt:nextAt(site.refresh,now),note:`${site.pages.length} 个页面，已读取详情 ${site.pages.filter(p=>p.fetchedAt).length} 个`,retry:{resource:'nrSiteContent',action:'refresh',body:{}}});}
  const gh=await this.p.github?.state(id);if(gh?.repo&&gh.status!=='disconnected'){const last=gh.lastSync;items.push({id:'github',name:`GitHub ${gh.repo}`,...assess({lastSuccessAt:lastSuccess(last),attempt:last,now}),lastSuccessAt:lastSuccess(last),dataThrough:Object.keys(gh.daily||{}).sort().at(-1)||null,nextSyncAt:nextAt(last,now),retry:{resource:'nrGitHub',action:'sync',body:{}}});
   if(gh.token){const t=gh.token.error?{state:'failing',message:gh.token.error}:assess({lastSuccessAt:lastSuccess(last),attempt:last&&{...last,errors:(last.errors||[]).filter(e=>e.startsWith('Traffic'))},now});items.push({id:'github-traffic',name:'GitHub Traffic',...t,lastSuccessAt:lastSuccess(last),dataThrough:Object.keys(gh.traffic?.views||{}).sort().at(-1)||null,nextSyncAt:nextAt(last,now),note:gh.traffic?.since?`从 ${gh.traffic.since} 开始归档`:'',retry:{resource:'nrGitHub',action:'sync',body:{}}});}}
  const cm=await this.p.community?.state(id);if(cm?.origin&&cm.status!=='disconnected'){const last=cm.lastSync;items.push({id:'discourse',name:cm.title||'社区论坛',...(this.p.community.syncing&&!last?{state:'pending',message:'正在首次同步'}:assess({lastSuccessAt:lastSuccess(last),attempt:last,now})),lastSuccessAt:lastSuccess(last),dataThrough:lastSuccess(last)?lastSuccess(last).slice(0,10):null,nextSyncAt:nextAt(last,now),note:`已保存 ${Object.keys(cm.topics||{}).length} 个主题${cm.retainedFrom?`，从 ${cm.retainedFrom} 开始`:''}`,retry:{resource:'nrCommunity',action:'sync',body:{}}});}
  const pk=await this.p.packages?.state(id);if(pk?.packages?.length){const last=pk.lastSync,dates=Object.values(pk.daily||{}).flatMap(d=>Object.keys(d)).sort();items.push({id:'packages',name:'下载量',...(this.p.packages.syncing&&!last?{state:'pending',message:'正在首次同步'}:assess({lastSuccessAt:lastSuccess(last),attempt:last,now})),lastSuccessAt:lastSuccess(last),dataThrough:dates.at(-1)||null,nextSyncAt:nextAt(last,now),note:pk.packages.map(p=>p.title||p.name).join('、'),retry:{resource:'nrPackages',action:'sync',body:{}}});}
  const hn=await this.p.hackernews?.state(id);if(hn?.terms?.length&&hn.status!=='disconnected'){const last=hn.lastSync;items.push({id:'hackernews',name:'Hacker News 提及',...(this.p.hackernews.syncing&&!last?{state:'pending',message:'正在首次同步'}:assess({lastSuccessAt:lastSuccess(last),attempt:last,now})),lastSuccessAt:lastSuccess(last),dataThrough:lastSuccess(last)?lastSuccess(last).slice(0,10):null,nextSyncAt:nextAt(last,now),note:`搜索 ${hn.terms.join('、')}，已保存 ${Object.keys(hn.mentions||{}).length} 条${hn.retainedFrom?`，从 ${hn.retainedFrom} 开始`:''}`,retry:{resource:'nrHackerNews',action:'sync',body:{}}});}
  if(this.p.analysis){const a=await this.p.analysis.status(id);if(a.last||a.schedule){const last=a.last;const h=a.running?{state:'pending',message:'正在分析'}:a.schedule&&!a.schedule.enabled?{state:'warning',message:'每日分析工作流已停用'}:assess({lastSuccessAt:lastSuccess(last),attempt:last,now});items.push({id:'daily-analysis',name:'每日分析',...h,lastSuccessAt:lastSuccess(last),dataThrough:null,nextSyncAt:null,note:a.schedule?`由 NocoBase 工作流按 ${a.schedule.cron||'计划'} 运行`:'',retry:{resource:'nrAnalysis',action:'run',body:{}}});}}
  const order={failing:0,warning:1,pending:2,healthy:3};return {checkedAt:new Date(now).toISOString(),items:items.sort((a,b)=>order[a.state]-order[b.state])};}
 register(){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){ctx.throw(e.status||502,e.status?e.message:'读取数据健康状态失败。');}};
  this.p.app.resourceManager.define({name:'nrHealth',actions:{list:wrap(id=>this.list(id))}});this.p.app.acl.allow('nrHealth',['list'],'loggedIn');}
}
module.exports={DataHealth,assess};
