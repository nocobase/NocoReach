'use strict';
const {GoogleDailySync,calendarDateInTimeZone}=require('./google-sync');
const {GOOGLE_ENDPOINTS,jsonRequest,googleJson}=require('./google-client');
const {secretKey}=require('./policy');
const {shift,compact,buildSnapshots}=require('./sync-data');
const active=['queued','running','retrying'];
const safeError=e=>['network_timeout','network_unreachable','invalid_grant','invalid_client','google_api_error'].includes(e?.code)?e.code:'sync_failed';
class StagedSync extends GoogleDailySync{
 constructor(options){super(options);this.batches=[];}
 async createRun(){return 0;}async finishRun(){}async replaceWindow(){}
 async writeRows(resource,rows){this.batches.push(...rows);return rows.length;}
}
class SyncService{
 constructor(plugin){this.p=plugin;this.busy=false;}
 repo(name){return this.p.db.getRepository(name);}
 async link(id){const link=await this.p.link(id);if(!link||!this.p.env(secretKey(id))||!link.get('ga4PropertyId')||!link.get('gscSiteUrl')||link.get('status')==='disconnected')throw Object.assign(new Error('请先授权并确认 GA4 与 Search Console 资源'),{status:409});const p=await this.p.project(id);if(String(p.analyticsPropertyId)!==link.get('ga4PropertyId')||p.searchConsoleProperty!==link.get('gscSiteUrl'))throw Object.assign(new Error('连接资源与项目不一致，已阻止同步'),{status:409});return link;}
 async lock(transaction){const [rows]=await this.p.db.sequelize.query("SELECT pg_try_advisory_xact_lock(hashtext('nocoreach-google-sync')) AS locked",{transaction});return rows[0].locked;}
 async enqueue(id,days=7,trigger='manual'){
  if(![7,28,56].includes(days))throw Object.assign(new Error('同步范围仅支持 7、28 或 56 天'),{status:400});const link=await this.link(id);
  return this.p.db.sequelize.transaction(async transaction=>{if(!await this.lock(transaction))throw Object.assign(new Error('同步正在处理，请稍后重试'),{status:409});const existing=await this.repo('nrSyncJobs').find({filter:{projectId:id,status:{$in:[...active,'paused']}},transaction});if(existing.length)return {alreadyQueued:true,jobs:existing.map(r=>r.toJSON())};
   // Three days of reporting lag, explicit rather than treating pending Google data as zero.
   const end=shift(calendarDateInTimeZone('America/Los_Angeles'),-3),start=shift(end,-days+1),jobs=[];
   for(const source of ['ga4','gsc'])jobs.push((await this.repo('nrSyncJobs').create({values:{projectId:id,source,resource:link.get(source==='ga4'?'ga4PropertyId':'gscSiteUrl'),status:'queued',startDate:start,endDate:end,cursor:start,attempts:0,recordCount:0,trigger},transaction})).toJSON());
   await this.p.db.getRepository('nrGoogleLinks').update({filterByTk:link.id,values:{nextSyncAt:new Date(Date.now()+86400000).toISOString()},transaction});return {jobs};
  });
 }
 async status(id){const jobs=await this.repo('nrSyncJobs').find({filter:{projectId:id},sort:'-createdAt',limit:20});const link=await this.p.link(id);const latest=(await Promise.all(['ga4','gsc'].map(source=>this.repo('nrSyncPartitions').find({filter:{projectId:id,source,grain:'overview'},sort:'-date',limit:100})))).flat();return {jobs:jobs.map(r=>r.toJSON()),scheduleEnabled:Boolean(link?.get('scheduleEnabled')),nextSyncAt:link?.get('nextSyncAt')||null,lastSyncAt:link?.get('lastSyncAt')||null,coverage:['ga4','gsc'].map(source=>({source,availableThrough:latest.filter(r=>r.get('source')===source&&r.get('payload')?.length).map(r=>r.get('date')).sort().at(-1)||null}))};}
 async control(id,command){await this.link(id);if(command==='enable'||command==='disable'){await this.p.metadata(id,{scheduleEnabled:command==='enable',...(command==='enable'?{nextSyncAt:new Date().toISOString()}: {})});return;}
  const status=command==='pause'?'paused':'queued';const from=command==='pause'?active:command==='retry'?['failed']:['paused'];if(!['pause','resume','retry'].includes(command))throw Object.assign(new Error('无效操作'),{status:400});await this.repo('nrSyncJobs').update({filter:{projectId:id,status:{$in:from}},values:{status,attempts:0,retryAt:null,errorCode:null}});
 }
 async step(){
  if(this.busy)return false;this.busy=true;let jobId;
  try{return await this.p.db.sequelize.transaction(async transaction=>{if(!await this.lock(transaction))return false;
   const jobs=await this.repo('nrSyncJobs').find({filter:{status:{$in:active}},sort:'createdAt',transaction});const job=jobs.find(j=>!j.get('retryAt')||Date.parse(j.get('retryAt'))<=Date.now());if(!job)return false;jobId=job.id;
   const id=job.get('projectId'),source=job.get('source'),link=await this.link(id);if(job.get('resource')!==link.get(source==='ga4'?'ga4PropertyId':'gscSiteUrl'))throw new Error('resource_changed');
   const cursor=job.get('cursor'),end=[shift(cursor,6),job.get('endDate')].sort()[0];
   const token=await this.p.token(id);
   let propertyTimeZone='UTC';if(source==='ga4'){const property=await googleJson(`${GOOGLE_ENDPOINTS.analyticsAdmin}/properties/${job.get('resource')}`,jsonRequest(token));propertyTimeZone=property.timeZone||'UTC';}
   const collector=new StagedSync({db:{sequelize:{transaction:fn=>fn(null)}},getAccessToken:async()=>token,propertyId:link.get('ga4PropertyId'),siteUrl:link.get('gscSiteUrl'),propertyTimeZone,reportTypes:source==='ga4'?['overview','source','page']:['overview','query_page'],searchTypes:['web'],dataState:'final'});
   await collector[source==='ga4'?'syncGa4':'syncGsc']({startDate:cursor,endDate:end});
   // Pause/disconnect during an external call discards the staged block, leaving previous data untouched.
   const fresh=await this.repo('nrSyncJobs').findOne({filterByTk:job.id,transaction,lock:true});if(!fresh||!active.includes(fresh.get('status')))return false;await this.link(id);
   for(let date=cursor;date<=end;date=shift(date,1))for(const grain of source==='ga4'?['overview','source','page']:['overview','query_page']){
    const payload=compact(collector.batches.filter(r=>r.periodDate===date&&r.grainType===grain),grain);const partitionKey=JSON.stringify([id,source,job.get('resource'),date,grain]);const r=this.repo('nrSyncPartitions'),old=await r.findOne({filter:{partitionKey},transaction});const values={projectId:id,source,resource:job.get('resource'),date,grain,payload};if(old)await r.update({filterByTk:old.id,values,transaction});else await r.create({values:{partitionKey,...values},transaction});
   }
   const finished=end===job.get('endDate');await this.repo('nrSyncJobs').update({filterByTk:job.id,values:{cursor:shift(end,1),status:finished?'succeeded':'running',recordCount:Number(job.get('recordCount')||0)+collector.batches.length,attempts:0,errorCode:null,retryAt:null,...(finished?{finishedAt:new Date().toISOString()}: {})},transaction});
   if(finished)await this.p.db.getRepository('nrGoogleLinks').update({filterByTk:link.id,values:{lastSyncAt:new Date().toISOString()},transaction});return true;
  });}catch(e){if(jobId){const job=await this.repo('nrSyncJobs').findOne({filterByTk:jobId});if(job&&active.includes(job.get('status'))){const attempts=Number(job.get('attempts')||0)+1;const retry=attempts<3&&['network_timeout','network_unreachable','google_api_error'].includes(e.code);await this.repo('nrSyncJobs').update({filterByTk:jobId,values:{status:retry?'retrying':'failed',attempts,errorCode:safeError(e),retryAt:retry?new Date(Date.now()+60000*attempts).toISOString():null}});}}this.p.app.logger.warn('NocoReach synchronization failed',{code:safeError(e)});return false;}finally{this.busy=false;}
 }
 async tick(){if(this.busy)return;const links=await this.repo('nrGoogleLinks').find({filter:{scheduleEnabled:true}});for(const link of links){if(link.get('nextSyncAt')&&Date.parse(link.get('nextSyncAt'))>Date.now())continue;try{await this.enqueue(link.get('projectId'),7,'scheduled');}catch(e){this.p.app.logger.warn('NocoReach scheduled enqueue skipped',{code:safeError(e)});}}
  const deadline=Date.now()+25000;while(Date.now()<deadline&&await this.step()){}
 }
 async snapshots(id){const link=await this.link(id),rows=[];for(let offset=0;;offset+=200){const page=await this.repo('nrSyncPartitions').find({filter:{projectId:id},offset,limit:200});rows.push(...page.map(r=>r.toJSON()).filter(r=>r.resource===(r.source==='ga4'?link.get('ga4PropertyId'):link.get('gscSiteUrl'))));if(page.length<200)break;if(rows.length>12000)throw Object.assign(new Error('同步数据范围过大，需要服务端分页汇总'),{status:409});}return buildSnapshots(rows,await this.p.project(id));}
}
module.exports={SyncService,StagedSync};
