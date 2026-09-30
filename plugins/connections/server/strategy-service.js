'use strict';
const {randomUUID}=require('node:crypto');
const board=require('./opportunity-board');
const periods=require('./evidence-period');
const {projectId,requireAdmin}=require('./policy');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function text(value,max,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail('请检查输入内容和长度');return value.trim();}
function goalInput(v){return {intent:text(v.intent,3000,true),audience:text(v.audience,2000,true),focus:text(v.focus,3000,true),progress:text(v.progress,2000,true)};}
function proposalInput(v){return {title:text(v.title,200,true),brief:text(v.brief,20000,true)};}
function insightInput(v){return {...board.assessment(v),title:text(v.title,200,true),observation:text(v.observation,2000,true),meaning:text(v.meaning,2000,true),evidenceText:text(v.evidenceText,3000,true),limitation:text(v.limitation,2000,true),suggestion:text(v.suggestion,3000,true),objective:text(v.objective,1000,true),source:['website','search','market','mixed'].includes(v.source)?v.source:'mixed'};}
function initial(){return {revision:0,goal:null,goalHistory:[],proposals:[],operations:[]};}
function evidenceFrom(snapshots,candidates,now,requestedDays=28){
 const days=periods.periodDays(requestedDays);
 const get=key=>snapshots.find(s=>s.key===key)?.payload;
 const p=get('project')||{};
 const summary=(key,fields)=>periods.summarize(get(key)||[],fields,p.end,days);
 const safeRows=(key,fields)=>{const rows=get(key);return (Array.isArray(rows)?rows:[]).slice(0,20).map(row=>Object.fromEntries(fields.filter(f=>typeof row[f]==='string'||typeof row[f]==='number').map(f=>[f,row[f]])));};
 return {analysisVersion:2,capturedAt:now,availableThrough:p.end||null,periodDays:days,githubReferral:summary('history-github-referral',['sessions','views','conversions']),summary:{web:summary('history-web',['views','sessions','conversions']),search:summary('history-search',['clicks','impressions'])},
  searchQueries:safeRows(`queries-${days}`,['keyword','page','clicks','impressions','position']),
  pages:safeRows(`pages-${days}`,['page','views','conversions']),
  industryCandidates:candidates.slice(0,20).map(c=>({keyword:c.keyword,source:'DataForSEO',retrievedAt:c.payload?.retrievedAt||null,market:c.payload?.spec?.locationCode||null,volume:c.payload?.item?.volume??null})),
  limitations:['仅取已同步数据与已保存候选，不发起新采集。','页面与查询最多各 20 条，不能视为全量数据或全站合计。','仅 metrics.comparable 为 true 的指标允许做前期涨跌判断；查询与页面样本未验证对比覆盖。','Google Trends 尚未接入；公开内容和 GitHub 覆盖以 publicSources 列表为准。','GA4 关键事件不是成交；GSC 不是全市场搜索量。']};
}
class StrategyService{
 constructor(plugin){this.p=plugin;}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 async row(id,transaction){return this.repo().findOne({filter:{key:`strategy:${id}`},transaction});}
 async state(id){return (await this.row(id))?.get('payload')||initial();}
 async context(id,requestedDays=28){
  const days=periods.periodDays(requestedDays);
  const project=await this.p.project(id);let snapshots=[],candidates=[],warnings=[];
  try{snapshots=await this.p.sync.snapshots(id);}catch{warnings.push('同步数据暂时不可用，本次不能据此形成数据结论。');}
  try{candidates=(await this.p.db.getRepository('nrKeywordCandidates').find({filter:{projectId:id},sort:'-createdAt',limit:20})).map(r=>r.toJSON());}catch{warnings.push('关键词候选暂时不可用。');}
  const evidence=evidenceFrom(snapshots,candidates,new Date().toISOString(),days);evidence.limitations.push(...warnings);
  try{evidence.publicSources=(await this.p.sources.state(id)).sources.filter(s=>s.status==='ready').slice(-8).map(s=>({id:s.id,kind:s.kind,url:s.url,title:s.title,capturedAt:s.capturedAt,revision:s.revision,warnings:s.warnings,...(s.kind==='github'?{marketing:periods.starEvidence(s,s.capturedAt?.slice(0,10),days)}:{}),items:s.items.filter(i=>s.kind!=='github'||i.type==='repository').slice(0,12).map(i=>({...i,text:i.text?.slice(0,2000)}))}));}catch{evidence.publicSources=[];evidence.limitations.push('公开来源读取暂不可用。');}
  if(evidence.publicSources.some(s=>s.kind==='github'))evidence.limitations.push('GitHub 仓库浏览量尚未授权接入；Star 仅有实际采样两端时显示净变化。GitHub 到官网的流量另取 GA4，不能代替仓库浏览量。');
  evidence.limitations.push('公开资料上下文最多取最近 8 个来源，每个最多 12 条、每条正文最多 2000 字；不代表全量。');
  return {project:{id:project.id,name:project.name,description:project.description,audience:project.audience,market:project.market,domains:project.domains},evidence};
 }
 async mutate(id,v,fn){return this.p.db.sequelize.transaction(async transaction=>{
  await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:`nocoreach-strategy:${id}`},transaction});
  const row=await this.row(id,transaction),state=row?.get('payload')||initial();
  if(typeof v.requestId!=='string'||!/^[-a-zA-Z0-9]{20,80}$/.test(v.requestId))fail('请求标识无效。');
  state.operations ||= [];
  if(state.operations.includes(v.requestId))return state;
  if(v.action==='approve'&&state.proposals.find(p=>p.id===v.proposalId)?.taskId)return state;
  if(!Number.isInteger(v.revision)||v.revision!==state.revision)fail('内容已在其他窗口更新，请刷新后再保存。当前编辑内容仍保留。',409);
  await fn(state,transaction);state.revision++;state.operations.push(v.requestId);
  if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});
  else await this.repo().create({values:{key:`strategy:${id}`,payload:state},transaction});
  return state;
 });}
 async saveGoal(id,v,ctx){const fields=goalInput(v);return this.mutate(id,v,async state=>{
  const goal={...fields,version:(state.goal?.version||0)+1,confirmedAt:new Date().toISOString(),confirmedBy:String(ctx.auth.user.id)};
  if(state.goal)state.goalHistory.push(state.goal);state.goal=goal;
 });}
 async saveProposal(id,v){const fields=proposalInput(v),context=await this.context(id);return this.mutate(id,v,async state=>{
  if(!state.goal)fail('请先确认目标。',409);
  if(state.proposals.length>=100)fail('当前试运行最多保存 100 份方案。',409);
  state.proposals.unshift({...fields,id:randomUUID(),status:'review',goalVersion:state.goal.version,goal:state.goal,evidence:context.evidence,createdAt:new Date().toISOString()});
 });}
 async saveInsights(id,v,ctx){
  if(!Array.isArray(v.insights)||v.insights.length>12)fail('洞察格式不完整，请重新生成。');
  const cards=v.insights.map(insightInput);let context;
  if(v.evidenceToken){context=await ctx?.cache.get(`nr-analysis:${id}:${ctx.auth.user.id}:${v.evidenceToken}`);if(!context)fail('分析依据已过期，请重新分析。',409);}else context=await this.context(id,v.periodDays);
  const available=new Set([...(context.evidence.summary?.web.days?['ga4']:[]),...(context.evidence.summary?.search.days?['gsc']:[]),...(context.evidence.industryCandidates?.length?['keywords']:[]),...(context.evidence.publicSources||[]).map(s=>s.id)]);
  for(const c of cards)c.sources=c.sources.filter(s=>available.has(s));
  const reviews=(Array.isArray(v.sourceReviews)?v.sourceReviews:[]).filter(r=>available.has(r.sourceId)&&typeof r.reason==='string').slice(0,12).map(r=>({sourceId:r.sourceId,reason:r.reason.slice(0,1000),result:['opportunity','no_signal','insufficient'].includes(r.result)?r.result:'insufficient'}));
  return this.mutate(id,v,async state=>{const now=new Date().toISOString(),items=board.mergeCards(state,cards,now,randomUUID);state.insightHistory ||= [];if(state.insights)state.insightHistory.unshift(state.insights);state.insights={generatedAt:now,evidence:context.evidence,items,sourceReviews:reviews};});
 }
 async reviewOpportunity(id,v){return this.mutate(id,v,async state=>{if(!board.allCards(state).some(c=>c.id===v.insightId))fail('机会不存在',404);if(v.priority!==undefined&&!board.priorities.includes(v.priority))fail('优先级无效');if(v.status!==undefined&&!board.statuses.includes(v.status))fail('处理状态无效');if(v.priority===undefined&&v.status===undefined)fail('请选择调整内容');state.opportunityMeta ||= {};const old=state.opportunityMeta[v.insightId]||{};state.opportunityMeta[v.insightId]={...old,...(v.priority!==undefined?{priority:v.priority}:{}),...(v.status!==undefined?{status:v.status}:{}),reviewedAt:new Date().toISOString()};});}
 async confirmDirection(id,v){const fields=proposalInput(v),objective=text(v.objective,1000,true),context=await this.context(id);return this.mutate(id,v,async(state,transaction)=>{
  const batch=[state.insights,...(state.insightHistory||[])].find(b=>b?.items.some(i=>i.id===v.insightId));
  const insight=v.insightId?batch?.items.find(i=>i.id===v.insightId):null;
  if(v.insightId&&!insight)fail('这条机会不存在，请到机会库核对后重试。',409);
  if(state.proposals.length>=100)fail('当前试运行最多保存 100 份方案。',409);
  const proposal={...fields,objective,id:randomUUID(),status:'approved',goalVersion:null,goal:null,insight:insight||null,evidence:insight?batch.evidence:context.evidence,createdAt:new Date().toISOString()};
  const task=await this.p.db.getRepository('nrTasks').create({values:{projectId:id,taskKey:`strategy:${proposal.id}`,title:proposal.title,brief:`行动目标：${objective}\n\n${proposal.brief}`,status:'待处理',evidence:{source:'AI 机会行动，经人工确认',objective,insight:proposal.insight,context:proposal.evidence,proposalId:proposal.id}},transaction});
  state.proposals.unshift({...proposal,taskId:task.id,approvedAt:new Date().toISOString()});
 });}
 async approve(id,v){return this.mutate(id,{...v,action:'approve'},async(state,transaction)=>{
  const proposal=state.proposals.find(p=>p.id===v.proposalId);if(!proposal)fail('方案不存在。',404);
  if(proposal.goalVersion!==state.goal?.version)fail('目标已更新，请重新审阅并保存新方案。',409);
  const task=await this.p.db.getRepository('nrTasks').create({values:{projectId:id,taskKey:`strategy:${proposal.id}`,title:proposal.title,brief:proposal.brief,status:'待处理',evidence:{source:'AI 协作方案，经人工确认',goal:proposal.goal,context:proposal.evidence,proposalId:proposal.id}},transaction});
  proposal.status='approved';proposal.taskId=task.id;proposal.approvedAt=new Date().toISOString();
 });}
 register(){const wrap=fn=>async(ctx,next)=>{requireAdmin(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){if(e.status&&e.status<500)ctx.throw(e.status,e.message);ctx.throw(502,'工作区请求未完成，编辑内容已保留，请稍后重试。');}};
  this.p.app.resourceManager.define({name:'nrStrategy',actions:{state:wrap(id=>this.state(id)),reviewOpportunity:wrap((id,v)=>this.reviewOpportunity(id,v)),saveInsights:wrap((id,v,c)=>this.saveInsights(id,v,c)),context:wrap(async(id,v,c)=>{const context=await this.context(id,v.periodDays),evidenceToken=randomUUID();await c.cache.set(`nr-analysis:${id}:${c.auth.user.id}:${evidenceToken}`,context,86400000);return {...context,evidenceToken};}),saveGoal:wrap((id,v,c)=>this.saveGoal(id,v,c)),saveProposal:wrap((id,v)=>this.saveProposal(id,v)),approve:wrap((id,v)=>this.approve(id,v)),confirmDirection:wrap((id,v)=>this.confirmDirection(id,v))}});
  this.p.app.acl.allow('nrStrategy',['state','context','reviewOpportunity','saveGoal','saveProposal','approve','confirmDirection','saveInsights'],'loggedIn');
 }
}
module.exports={StrategyService,goalInput,proposalInput,insightInput,evidenceFrom};
