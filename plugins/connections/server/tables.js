'use strict';
// The plugin's own data tables. They used to be created by hand with the NocoBase CLI, so a fresh install had none and
// nothing worked. After every start the plugin creates the tables that are missing, through NocoBase's collection
// manager, the same way `nb api data-modeling collections apply` does: they show up in the data source like any table.
// Tables that already exist are never touched, so a running site keeps its columns and data.
const f=(name,iface='input',extra={})=>({name,interface:iface,...extra});
const TABLES=[
 {name:'nrSnapshots',title:'NocoReach 数据',fields:[f('key'),f('payload','json')]},
 {name:'nrTasks',title:'NocoReach 任务',fields:[f('taskKey','input',{unique:true}),f('title'),f('status'),f('projectId'),f('evidence','json'),f('brief','textarea')]},
 {name:'nrGoogleLinks',title:'Google 连接元数据',fields:[f('projectId','input',{unique:true}),f('accountEmail'),f('status'),f('authorizedAt'),f('ga4PropertyId'),f('gscSiteUrl'),f('scheduleEnabled','checkbox'),f('nextSyncAt'),f('lastSyncAt')]},
 {name:'nrSyncJobs',title:'同步任务',fields:[f('projectId'),f('status'),f('source'),f('startDate'),f('endDate'),f('cursor'),f('resource'),f('errorCode'),f('attempts','integer'),f('recordCount','integer'),f('trigger'),f('finishedAt'),f('retryAt')]},
 {name:'nrSyncPartitions',title:'接入数据日分区',fields:[f('partitionKey','input',{unique:true}),f('projectId'),f('source'),f('resource'),f('date'),f('grain'),f('payload','json')]},
 {name:'nrKeywordRuns',title:'付费查询记录',fields:[f('projectId'),f('requestKey','input',{unique:true}),f('queryHash'),f('status'),f('spec','json'),f('result','json'),f('costUsd','number'),f('reservedUsd','number'),f('taskId'),f('errorCode','textarea'),f('completedAt')]},
 {name:'nrKeywordCandidates',title:'关键词候选',fields:[f('candidateKey','input',{unique:true}),f('projectId'),f('keyword'),f('runId'),f('payload','json')]},
];

// Returns the names it created. `compose` turns the short field list into a full collection definition (id, createdAt,
// updatedAt and so on); it is passed in by tests.
async function ensureTables(plugin,compose){
 const meta=plugin.db.getRepository('collections');
 if(!meta)throw new Error('NocoBase collection manager (data-source-main) is not enabled');
 const created=[];
 for(const table of TABLES){
  if(plugin.db.getCollection?.(table.name)||await meta.findOne({filter:{name:table.name}}))continue;
  compose=compose||require('@nocobase/plugin-data-source-main/dist/server/modeling/collections').composeCollectionDefinition;
  // A non-empty context makes the collection manager create the database table right away.
  await meta.create({values:compose(table,{mode:'create'}),context:{source:'nocoreach'}});
  created.push(table.name);
 }
 return created;
}

module.exports={TABLES,ensureTables};
