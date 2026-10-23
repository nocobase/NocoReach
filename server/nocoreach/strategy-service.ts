// @ts-nocheck
import {rowsFor,opportunityState,insightPending} from '../../shared/strategy-pending.js';
import {taskState,taskOwner,taskClosed} from '../../shared/task-pending.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { randomUUID } from 'node:crypto';
import * as watch from './watch.js';
import * as board from './opportunity-board.js';
import { settleVerdicts } from './verdict-coverage.js';
// The language a verdict's reason is written in: the project's analysis language, passed by daily analysis.
const localeOf=v=>typeof v?.locale==='string'&&/^en/i.test(v.locale)?'en-US':'zh-CN';
import * as periods from './evidence-period.js';
import { projectId, requireAccess } from './policy.js';
import { memoryForAI, MEMORY_SECTIONS } from './execution/memory.js';
import { projectWork } from './execution/model.js';
// Who created a task: it becomes the task's owner (2026-10-08).
const creator=ctx=>{const u=ctx?.auth?.user;return u?.id!=null&&u.kind!=='service'?{createdBy:{id:String(u.id),name:String(u.nickname||u.username||u.id)}}:{};};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function text(value,max,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(systemMessageText('strategy.checkInputLength'));return value.trim();}
function goalInput(v){return {intent:text(v.intent,3000,true),audience:text(v.audience,2000,true),focus:text(v.focus,3000,true),progress:text(v.progress,2000,true)};}
// signalKey: the 最新变化 a task was handed off from directly (2026-10-05), so the change then shows 已交给 Agent.
// AI's verdict on each change (2026-10-05): do (worth doing — every change an opportunity cites), watch (look again next
// time) or skip (nothing to do, e.g. good news); a change that only informs cannot be "do". Keyed by signal. A watch
// also says what it waits for and the day to decide by (2026-10-08, see watch.js).
function reviewsOf(list,signals,cards){const keys=new Map(signals.map(s=>[s.key,s])),cited=new Set(cards.flatMap(c=>c.signalIds||[])),out={};
 for(const r of Array.isArray(list)?list:[]){const s=keys.get(r?.key);if(!s||!['do','watch','skip'].includes(r.verdict))continue;const verdict=r.verdict==='do'&&!s.actionable?'watch':r.verdict;out[s.key]={verdict,reason:typeof r.reason==='string'?r.reason.trim().slice(0,200):'',...(verdict==='watch'&&typeof r.waitingFor==='string'&&r.waitingFor.trim()?{waitingFor:r.waitingFor.trim().slice(0,120)}:{}),...(verdict==='watch'&&typeof r.decideBy==='string'?{decideBy:r.decideBy.slice(0,10)}:{})};}
 for(const k of cited)if(keys.has(k))out[k]={verdict:'do',reason:out[k]?.verdict==='do'?out[k].reason:''};
 return out;}
// The page a hand-off is about (an http(s) address), kept on the task so its article can be found before it starts.
function pageInput(v){if(typeof v!=='string'||!v.trim()||v.length>2000)return undefined;try{const u=new URL(v.trim());return u.protocol==='https:'||u.protocol==='http:'?u.href:undefined;}catch{return undefined;}}
// `entry`: the page a person handed the task off from (a path such as /data/github), shown as where it was found.
function proposalInput(v){const page=pageInput(v.page);return {title:text(v.title,200,true),brief:text(v.brief,20000,true),...(typeof v.signalKey==='string'&&v.signalKey.trim()?{signalKey:v.signalKey.trim().slice(0,200)}:{}),...(page?{page}:{}),...(typeof v.entry==='string'&&/^\/[\w\-/]{1,200}$/.test(v.entry)?{entry:v.entry}:{})};}
function insightInput(v){return {...board.assessment(v),signalIds:(Array.isArray(v.signalIds)?v.signalIds:[]).filter(x=>typeof x==='string').slice(0,10).map(x=>x.slice(0,200)),title:text(v.title,200,true),...(typeof v.reason==='string'&&v.reason.trim()?{reason:v.reason.trim().slice(0,300)}:{}),observation:text(v.observation,2000,true),meaning:text(v.meaning,2000,true),evidenceText:text(v.evidenceText,3000,true),limitation:text(v.limitation,2000,true),suggestion:text(v.suggestion,3000,true),objective:text(v.objective,1000,true),source:['website','search','market','mixed'].includes(v.source)?v.source:'mixed'};}
function initial(){return {revision:0,goal:null,goalHistory:[],proposals:[],operations:[]};}
function resultEvidence(source){return {capturedAt:source.capturedAt,availableThrough:null,periodDays:source.day||28,searchQueries:[],pages:[],industryCandidates:[],limitations:[systemMessageText('results.sourceEvidenceOnly')]};}
function evidenceFrom(snapshots,candidates,now,requestedDays=28){
 const days=periods.periodDays(requestedDays);
 const get=key=>snapshots.find(s=>s.key===key)?.payload;
 const p=get('project')||{};
 const summary=(key,fields)=>periods.summarize(get(key)||[],fields,p.end,days);
 const safeRows=(key,fields)=>{const rows=get(key);return (Array.isArray(rows)?rows:[]).slice(0,20).map(row=>Object.fromEntries(fields.filter(f=>typeof row[f]==='string'||typeof row[f]==='number').map(f=>[f,row[f]])));};
 return {analysisVersion:2,capturedAt:now,availableThrough:p.end||null,periodDays:days,githubReferral:summary('history-github-referral',['sessions','views','conversions']),summary:{web:summary('history-web',['views','sessions','conversions']),search:summary('history-search',['clicks','impressions'])},
  searchQueries:safeRows(`queries-${days}`,['keyword','page','clicks','impressions','position']),
  pages:safeRows(`pages-${days}`,['page','views','conversions']),
  industryCandidates:candidates.slice(0,20).map(c=>({keyword:c.keyword,source:c.payload?.source||'DataForSEO',retrievedAt:c.payload?.retrievedAt||null,market:c.payload?.spec?.locationCode||null,volume:c.payload?.item?.volume??null})),
  limitations:[systemMessageText('strategy.syncedDataSavedCandidatesUsed'),systemMessageText('strategy.up20Pages20Queries'),systemMessageText('strategy.metricsMetricsComparableTrueJudged'),systemMessageText('strategy.publicContentCoverageFollowsPublicsources'),systemMessageText('strategy.ga4KeyEventsNot')]};
}
// Project memory is user-maintained background shared by the online AI and, later, the local agent brief.
// 记忆 (项目知识): the shared reader gives section titles with their text; older projects are read from their fields.
const memoryFields=[systemMessageText('aiQuestions.project'),...MEMORY_SECTIONS.map(s=>s[1])];
const projectMemory=project=>memoryForAI(project);
class StrategyService{
 constructor(plugin){this.p=plugin;}
 repo(){return this.p.db.getRepository('nrSnapshots');}
 async row(id,transaction){return this.repo().findOne({filter:{key:`strategy:${id}`},transaction});}
 async state(id){return (await this.row(id))?.get('payload')||initial();}
 async context(id,requestedDays=28){
  const days=periods.periodDays(requestedDays);
  const project=await this.p.project(id);let snapshots=[],candidates=[],warnings=[];
  try{snapshots=await this.p.sync.snapshots(id);}catch{warnings.push(systemMessageText('strategy.syncedDataNotAvailableRight'));}
  try{candidates=(await this.p.db.getRepository('nrKeywordCandidates').find({filter:{projectId:id},sort:'-createdAt',limit:20})).map(r=>r.toJSON());}catch{warnings.push(systemMessageText('strategy.keywordCandidatesNotAvailableRight'));}
  const evidence=evidenceFrom(snapshots,candidates,new Date().toISOString(),days);evidence.limitations.push(...warnings);
  // Signals (SPEC §9) are the basis of analysis version 3; every suggestion must cite at least one of them.
  // Changes being watched are always passed on, whatever their size (watch.js).
  try{if(this.p.signals){const keep=new Set(watch.activeKeys(await this.state(id)));evidence.signals=await this.p.signals.current(id,keep);evidence.analysisVersion=3;}}catch{evidence.limitations.push(systemMessageText('strategy.signalCalculationNotAvailableRight'));}
  try{evidence.publicSources=(await this.p.sources.state(id)).sources.filter(s=>s.status==='ready').slice(-8).map(s=>({id:s.id,kind:s.kind,url:s.url,title:s.title,capturedAt:s.capturedAt,revision:s.revision,warnings:s.warnings,...(s.kind==='github'?{marketing:periods.starEvidence(s,s.capturedAt?.slice(0,10),days)}:{}),items:s.items.filter(i=>s.kind!=='github'||i.type==='repository').slice(0,12).map(i=>({...i,text:i.text?.slice(0,2000)}))}));}catch{evidence.publicSources=[];evidence.limitations.push(systemMessageText('strategy.readingPublicSourcesNotAvailable'));}
  // Only when GitHub Traffic is really missing (it used to be said even with a token).
  const gh=await this.p.github?.state(id).catch(()=>null);if(gh?.repo&&!gh.token)evidence.limitations.push(systemMessageText('strategy.githubRepositoryViewsNotAuthorized'));
  evidence.limitations.push(systemMessageText('strategy.publicMaterialContextTakesUp'));
  return {project:{id:project.id,domains:project.domains,...projectMemory(project)},evidence};
 }
 async mutate(id,v,fn){return this.p.db.sequelize.transaction(async transaction=>{
  await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:`nocoreach-strategy:${id}`},transaction});
  const row=await this.row(id,transaction),state=row?.get('payload')||initial();
  if(typeof v.requestId!=='string'||!/^[-a-zA-Z0-9]{20,80}$/.test(v.requestId))fail(systemMessageText('strategy.invalidRequestIdMessage'));
  state.operations ||= [];
  if(state.operations.includes(v.requestId))return state;
  if(v.action==='approve'&&state.proposals.find(p=>p.id===v.proposalId)?.taskId)return state;
  if(!Number.isInteger(v.revision)||v.revision!==state.revision)fail(systemMessageText('strategy.contentUpdatedAnotherWindowRefresh'),409);
  await fn(state,transaction);board.number(state);state.revision++;state.operations.push(v.requestId);
  if(row)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});
  else await this.repo().create({values:{key:`strategy:${id}`,payload:state},transaction});
  return state;
 });}
 async saveGoal(id,v,ctx){const fields=goalInput(v);return this.mutate(id,v,async state=>{
  const goal={...fields,version:(state.goal?.version||0)+1,confirmedAt:new Date().toISOString(),confirmedBy:String(ctx.auth.user.id)};
  if(state.goal)state.goalHistory.push(state.goal);state.goal=goal;
 });}
 async saveProposal(id,v){const fields=proposalInput(v),context=await this.context(id);return this.mutate(id,v,async state=>{
  if(!state.goal)fail(systemMessageText('strategy.confirmGoalFirst'),409);
  if(state.proposals.length>=100)fail(systemMessageText('strategy.currentPilotSavesUp100'),409);
  state.proposals.unshift({...fields,id:randomUUID(),status:'review',goalVersion:state.goal.version,goal:state.goal,evidence:context.evidence,createdAt:new Date().toISOString()});
 });}
 async saveInsights(id,v,ctx,trustedContext){
  if(!Array.isArray(v.insights)||v.insights.length>12)fail(systemMessageText('strategy.insightFormatIncompleteGenerateAgain'));
  const cards=v.insights.map(insightInput);let context;
  if(trustedContext){context=trustedContext;}else if(v.evidenceToken){context=await ctx?.cache.get(`nr-analysis:${id}:${ctx.auth.user.id}:${v.evidenceToken}`);if(!context)fail(systemMessageText('strategy.analysisBasisExpiredAnalyzeAgain'),409);}else context=await this.context(id,v.periodDays);
  const available=new Set([...(context.evidence.summary?.web.days?['ga4']:[]),...(context.evidence.summary?.search.days?['gsc']:[]),...(context.evidence.industryCandidates?.length?['keywords']:[]),...(context.evidence.publicSources||[]).map(s=>s.id)]);
  const signalKeys=new Set((context.evidence.signals?.items||[]).map(s=>s.key));for(const s of context.evidence.signals?.items||[])available.add(s.source);
  for(const c of cards)c.sources=c.sources.filter(s=>available.has(s));
  if(context.evidence.signals){for(const c of cards)c.signalIds=c.signalIds.filter(k=>signalKeys.has(k));cards.splice(0,cards.length,...cards.filter(c=>c.signalIds.length));}
  const observations=(Array.isArray(v.observations)?v.observations:[]).filter(o=>typeof o==='string'&&o.trim()).slice(0,4).map(o=>o.trim().slice(0,300));
  const reviews=(Array.isArray(v.sourceReviews)?v.sourceReviews:[]).filter(r=>available.has(r.sourceId)&&typeof r.reason==='string').slice(0,12).map(r=>({sourceId:r.sourceId,reason:r.reason.slice(0,1000),result:['opportunity','no_signal','insufficient'].includes(r.result)?r.result:'insufficient'}));
  const signalReviews=reviewsOf(v.signalReviews,context.evidence.signals?.items||[],cards),maxDays=context.evidence.signals?.analysisSnapshot?.config?.watchDays??(await this.p.analysisRules?.config(id).catch(()=>null))?.watchDays;
  return this.mutate(id,v,async(state,transaction)=>{const now=new Date().toISOString(),items=board.withoutIgnored(state,board.mergeCards(state,cards,now,randomUUID));state.insightHistory ||= [];if(state.insights)state.insightHistory.unshift(state.insights);
   const signals=context.evidence.signals?.items||[];watch.enforceDeadlines(state,signalReviews,now);
   state.insights={generatedAt:now,evidence:context.evidence,items,sourceReviews:reviews,observations,signalReviews};
   settleVerdicts(state,await this.coverTasks(id,transaction),now,randomUUID,localeOf(v));
   watch.applyVerdicts(state,{signals,reviews:signalReviews,cards:state.insights.items,now,maxDays});watch.endMissing(state,{signals,missing:context.evidence.signals?.missing||[],now});});
 }
 // One change judged on request (洞察 › 最新变化 › 让 AI 现在判断) for an analysis made before every change got a verdict.
 async reviewSignal(id,v){const fallbackDays=(await this.p.analysisRules?.config(id).catch(()=>null))?.watchDays;return this.mutate(id,v,async(state,transaction)=>{const maxDays=state.insights?.evidence?.signals?.analysisSnapshot?.config?.watchDays??fallbackDays;const s=(state.insights?.evidence?.signals?.items||[]).find(x=>x.key===v.signalKey);if(!s)fail(systemMessageText('dailyAnalysis.changeNoLongerLatestAnalysis'),404);
  const now=new Date().toISOString(),got=watch.enforceDeadlines(state,reviewsOf([{key:s.key,verdict:v.verdict,reason:v.reason,waitingFor:v.waitingFor,decideBy:v.decideBy}],[s],[]),now),r=got[s.key];if(!r)fail(systemMessageText('strategy.incompleteVerdictFormat'));state.insights.signalReviews={...(state.insights.signalReviews||{}),[s.key]:r};
  settleVerdicts(state,await this.coverTasks(id,transaction),now,randomUUID,localeOf(v));
  watch.applyVerdicts(state,{signals:[s],reviews:{[s.key]:state.insights.signalReviews[s.key]},cards:state.insights.items||[],now,maxDays});});}
 // Several at once: the changes the analysis left without a verdict, filled in afterwards.
 async reviewSignals(id,v){const fallbackDays=(await this.p.analysisRules?.config(id).catch(()=>null))?.watchDays;return this.mutate(id,v,async(state,transaction)=>{const maxDays=state.insights?.evidence?.signals?.analysisSnapshot?.config?.watchDays??fallbackDays;const signals=state.insights?.evidence?.signals?.items||[];const now=new Date().toISOString(),known=state.insights?.signalReviews||{},got=reviewsOf((Array.isArray(v.reviews)?v.reviews:[]).map(r=>({key:r?.signalKey??r?.key,verdict:r?.verdict,reason:r?.reason,waitingFor:r?.waitingFor,decideBy:r?.decideBy})),signals,[]);
  for(const k of Object.keys(got))if(known[k])delete got[k];watch.enforceDeadlines(state,got,now);
  if(state.insights){state.insights.signalReviews={...got,...known};settleVerdicts(state,await this.coverTasks(id,transaction),now,randomUUID,localeOf(v));
   const settled=Object.fromEntries(Object.keys(got).map(k=>[k,state.insights.signalReviews[k]]));watch.applyVerdicts(state,{signals,reviews:settled,cards:state.insights.items||[],now,maxDays});}});}
 // The project's tasks, for what already covers a change (verdict-coverage.ts); none when they cannot be read.
 async coverTasks(id,transaction){try{return (await this.p.db.getRepository('nrTasks').find({filter:{projectId:id},limit:5000,transaction})).map(t=>t.toJSON?t.toJSON():t);}catch{return [];}}
 // 忽略 on a change judged worth doing that has no opportunity of its own (2026-10-08, user: those rows had 交给 Agent but
 // no 忽略). The decision is kept by the change's key, which stays the same from day to day: later analyses show it as
 // 已忽略 and raise no opportunity on it alone; status pending (恢复) takes the decision back.
 async decideSignal(id,v){return this.mutate(id,v,async state=>{const key=typeof v.signalKey==='string'?v.signalKey.slice(0,300):'';
  if(!key||!(state.insights?.evidence?.signals?.items||[]).some(s=>s.key===key))fail(systemMessageText('dailyAnalysis.changeNoLongerLatestAnalysis'),404);if(!['ignored','pending'].includes(v.status))fail(systemMessageText('strategy.invalidStatus'));
  state.signalMeta ||= {};const now=new Date().toISOString();if(v.status==='ignored'){state.signalMeta[key]={status:'ignored',at:now};watch.ignore(state,key,now);}else{delete state.signalMeta[key];watch.restore(state,key);}});}
 async reviewOpportunity(id,v){return this.mutate(id,v,async state=>{if(!board.allCards(state).some(c=>c.id===v.insightId))fail(systemMessageText('strategy.opportunityNotFound'),404);if(v.priority!==undefined&&!board.priorities.includes(v.priority))fail(systemMessageText('strategy.invalidPriority'));if(v.status!==undefined&&!board.statuses.includes(v.status))fail(systemMessageText('strategy.invalidStatus'));if(v.priority===undefined&&v.status===undefined)fail(systemMessageText('strategy.pickWhatAdjust'));state.opportunityMeta ||= {};const old=state.opportunityMeta[v.insightId]||{},at=new Date().toISOString();state.opportunityMeta[v.insightId]={...old,...(v.priority!==undefined?{priority:v.priority}:{}),...(v.status!==undefined?{status:v.status,...(v.status==='pending'?{restoredAt:at}:{ignoredAt:at})}:{}),reviewedAt:at};});}
 async confirmDirection(id,v,ctx){const fields=proposalInput(v),objective=text(v.objective,1000,true),context=await this.context(id);return this.mutate(id,v,async(state,transaction)=>{
  const batch=[state.insights,...(state.insightHistory||[])].find(b=>b?.items.some(i=>i.id===v.insightId));
  const insight=v.insightId?state.resultOpportunities?.find(i=>i.id===v.insightId)||batch?.items.find(i=>i.id===v.insightId):null;
  if(v.insightId&&!insight)fail(systemMessageText('strategy.opportunityNotExistCheckOpportunity'),409);
  if(state.proposals.length>=100)fail(systemMessageText('strategy.currentPilotSavesUp100'),409);
  const proposal={...fields,objective,id:randomUUID(),status:'approved',goalVersion:null,goal:null,insight:insight||null,evidence:insight?.resultSource?resultEvidence(insight.resultSource):insight?batch.evidence:context.evidence,...(insight?.resultSource?{resultSource:insight.resultSource}:{}),createdAt:new Date().toISOString()};
  const task=await this.createDirectionTask(id,proposal,v,ctx,transaction);
  state.proposals.unshift({...proposal,taskId:task.id,taskNo:task.get?.('evidence')?.no,approvedAt:new Date().toISOString()});
 });}
 async createDirectionTask(id,proposal,v,ctx,transaction){return this.p.db.getRepository('nrTasks').create({values:{projectId:id,taskKey:`strategy:${proposal.id}`,title:proposal.title,brief:systemMessageText('messages.goal',{0:proposal.objective,1:proposal.brief},ctx?.getCurrentLocale?.()),status:systemMessageText('common.pending'),evidence:{source:systemMessageText('strategy.aiOpportunityActionConfirmedPerson'),objective:proposal.objective,insight:proposal.insight,context:proposal.evidence,proposalId:proposal.id,...(proposal.signalKey?{signalKey:proposal.signalKey}:{}),...(proposal.page?{page:proposal.page}:{}),...(proposal.entry?{entry:proposal.entry}:{}),...(proposal.resultSource?{resultSource:proposal.resultSource}:{}),...creator(ctx),...(typeof v.playbookId==='string'&&/^[a-z0-9-]{1,60}$/.test(v.playbookId)?{suggestedPlaybook:v.playbookId}:{})}},transaction});}
 // Short task numbers (T-1, T-2 …): task record ids are long generated numbers, so each new task gets the next number
 // of its project when it is created — one hook for every place that creates tasks; kept in evidence.no.
 async numberTask(model,options){
  const e=model.get('evidence')||{};if(Number.isInteger(e.no))return;const project=String(model.get('projectId')||'');if(!project)return;const transaction=options?.transaction;
  if(transaction)await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:`nocoreach-taskno:${project}`},transaction});
  const key=`task-numbers:${project}`,row=await this.repo().findOne({filter:{key},transaction});let next=row?.get('payload')?.next;
  if(!Number.isInteger(next))next=1+Math.max(0,...(await this.p.db.getRepository('nrTasks').find({filter:{projectId:project},limit:5000,transaction})).map(t=>Number((t.get?t.get('evidence'):t.evidence)?.no)||0));
  model.set('evidence',{...e,no:next});
  if(row)await this.repo().update({filterByTk:row.id,values:{payload:{next:next+1}},transaction});else await this.repo().create({values:{key,payload:{next:next+1}},transaction});
 }
 // One-time backfill after an upgrade, idempotent, runs at start: task numbers by creation order; opportunity numbers;
 // the opportunity number on the copy each task keeps (“来自 O-27”) and the task number on each handed-off proposal.
 async numberAll(){for(const id of await this.p.projectIds())await this.numberProject(String(id));}
 async numberProject(id){
  await this.p.db.sequelize.transaction(async transaction=>{
   for(const k of [`nocoreach-strategy:${id}`,`nocoreach-taskno:${id}`])await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:k},transaction});
   const get=(t,k)=>t.get?t.get(k):t[k],tasks=(await this.p.db.getRepository('nrTasks').find({filter:{projectId:id},limit:5000,transaction})).map(t=>({id:get(t,'id'),at:new Date(get(t,'createdAt')||0).getTime(),e:get(t,'evidence')||{},changed:false}));
   let next=1+Math.max(0,...tasks.map(t=>Number(t.e.no)||0));
   for(const t of tasks.filter(t=>!Number.isInteger(t.e.no)).sort((a,b)=>a.at-b.at||String(a.id).length-String(b.id).length||String(a.id).localeCompare(String(b.id)))){t.e={...t.e,no:next++};t.changed=true;}
   const key=`task-numbers:${id}`,counter=await this.repo().findOne({filter:{key},transaction});
   if(!counter)await this.repo().create({values:{key,payload:{next}},transaction});else if(counter.get('payload')?.next!==next&&!(counter.get('payload')?.next>next))await this.repo().update({filterByTk:counter.id,values:{payload:{next}},transaction});
   const row=await this.row(id,transaction),state=row?.get('payload');
   if(state){let changed=board.number(state);const byId=new Map(tasks.map(t=>[String(t.id),t]));
    for(const pr of state.proposals||[]){const t=pr.taskId!=null&&byId.get(String(pr.taskId));if(t&&pr.taskNo!==t.e.no){pr.taskNo=t.e.no;changed=true;}}
    if(changed)await this.repo().update({filterByTk:row.id,values:{payload:state},transaction});
    const nos=new Map(board.allCards(state).map(c=>[c.id,c.no]));
    for(const t of tasks){const ins=t.e.insight;if(ins?.id&&nos.get(ins.id)&&ins.no!==nos.get(ins.id)){t.e={...t.e,insight:{...ins,no:nos.get(ins.id)}};t.changed=true;}}}
   for(const t of tasks.filter(t=>t.changed))await this.p.db.getRepository('nrTasks').update({filterByTk:t.id,values:{evidence:t.e},transaction});
  });}
 // Project menu counts reuse the page predicates; personal tasks use the same raw-record owner/state fallback as home.
 async badges(id,ctx){
  const rows=await this.p.taskExecution.tasks(id) as import('../../shared/task-pending.js').PendingTask[];
  const me=ctx?.auth?.user?.id!=null?String(ctx.auth.user.id):null;
  const tasks=rows.filter(t=>{const owner=taskOwner(t);return me!==null&&(owner?String(owner)===me:ctx?.state?.nrRole==='admin')&&!taskClosed(t.evidence?.work)&&['review','todo'].includes(taskState(t.evidence?.work,t.status));}).length;
  const state=await this.state(id) as import('../../shared/strategy-model.js').StrategyState;
  return {tasks,opportunities:rowsFor(state).filter(r=>opportunityState(r,state).state==='pending').length,insights:insightPending(state,rows)};
 }
 async approve(id,v,ctx){return this.mutate(id,{...v,action:'approve'},async(state,transaction)=>{
  const proposal=state.proposals.find(p=>p.id===v.proposalId);if(!proposal)fail(systemMessageText('strategy.planNotFound'),404);
  if(proposal.goalVersion!==state.goal?.version)fail(systemMessageText('strategy.goalUpdatedReviewAgainSave'),409);
  const task=await this.p.db.getRepository('nrTasks').create({values:{projectId:id,taskKey:`strategy:${proposal.id}`,title:proposal.title,brief:proposal.brief,status:systemMessageText('common.pending'),evidence:{source:systemMessageText('strategy.aiCoWrittenPlanConfirmed'),goal:proposal.goal,context:proposal.evidence,proposalId:proposal.id,...creator(ctx)}},transaction});
  proposal.status='approved';proposal.taskId=task.id;proposal.taskNo=task.get?.('evidence')?.no;proposal.approvedAt=new Date().toISOString();
 });}
 register(){const wrap=fn=>async(ctx,next)=>{await requireAccess(ctx);try{const v=ctx.action.params.values||{},id=projectId(v.projectId);await this.p.project(id);ctx.body=await fn(id,v,ctx);await next();}catch(e){if(e.status&&e.status<500)ctx.throw(e.status,e.message);ctx.throw(502,systemMessageText('strategy.workspaceRequestNotCompleteEdits'));}};
  this.p.app.resourceManager.define({name:'nrStrategy',actions:{state:wrap(id=>this.state(id)),reviewOpportunity:wrap((id,v)=>this.reviewOpportunity(id,v)),saveInsights:wrap((id,v,c)=>this.saveInsights(id,v,c)),context:wrap(async(id,v,c)=>{const context=await this.context(id,v.periodDays),evidenceToken=randomUUID();await c.cache.set(`nr-analysis:${id}:${c.auth.user.id}:${evidenceToken}`,context,86400000);return {...context,evidenceToken};}),saveGoal:wrap((id,v,c)=>this.saveGoal(id,v,c)),saveProposal:wrap((id,v)=>this.saveProposal(id,v)),approve:wrap((id,v,c)=>this.approve(id,v,c)),confirmDirection:wrap((id,v,c)=>this.confirmDirection(id,v,c)),decideSignal:wrap((id,v)=>this.decideSignal(id,v)),badges:wrap((id,v,c)=>this.badges(id,c))}});
  this.p.db.on('nrTasks.beforeCreate',(model,options)=>this.numberTask(model,options));
  this.p.app.on('afterStart',()=>this.numberAll().catch(e=>this.p.app.logger.warn('NocoReach opportunity numbers not filled',{message:e.message})));
  this.p.app.acl.allow('nrStrategy',['state','context','reviewOpportunity','saveGoal','saveProposal','approve','confirmDirection','decideSignal','saveInsights','badges'],'loggedIn');
 }
}
export { StrategyService, goalInput, proposalInput, insightInput, evidenceFrom, projectMemory, memoryFields };
