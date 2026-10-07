const test=require('node:test'),assert=require('node:assert/strict');
const {TABLES,ensureTables}=require('../../plugins/connections/server/tables');

const plugin=(existing,log=[],loaded=[])=>({db:{getCollection:name=>loaded.includes(name)?{}:undefined,getRepository:name=>name!=='collections'?null:{
 findOne:async({filter})=>existing.includes(filter.name)?{name:filter.name}:null,
 create:async({values,context})=>{assert.ok(context,'context makes the collection manager create the table');log.push(values);},
}}});
const compose=(table,{mode})=>({...table,mode,fields:[{name:'id'},...table.fields]});

test('a fresh install gets every table the plugin reads and writes, through the collection manager',async()=>{
 const log=[];const made=await ensureTables(plugin([],log),compose);
 assert.deepEqual(made,['nrSnapshots','nrTasks','nrGoogleLinks','nrSyncJobs','nrSyncPartitions','nrKeywordRuns','nrKeywordCandidates']);
 assert.equal(log[0].mode,'create');assert.deepEqual(log[0].fields.map(f=>f.name),['id','key','payload']);
 assert.deepEqual(log[1].fields.find(f=>f.name==='taskKey'),{name:'taskKey',interface:'input',unique:true});
});

test('tables that already exist are left alone, so a running site keeps its data',async()=>{
 const log=[];const made=await ensureTables(plugin(TABLES.map(t=>t.name).filter(n=>n!=='nrKeywordCandidates'),log),compose);
 assert.deepEqual(made,['nrKeywordCandidates']);assert.equal(log.length,1);
 assert.deepEqual(await ensureTables(plugin(TABLES.map(t=>t.name)),()=>assert.fail('nothing to create')),[]);
 // Defined some other way (no collection-manager record) still counts as existing.
 assert.deepEqual(await ensureTables(plugin([],[],TABLES.map(t=>t.name)),()=>assert.fail('nothing to create')),[]);
});

test('without the collection manager the start-up says why',async()=>{
 await assert.rejects(ensureTables({db:{getRepository:()=>null}}),/data-source-main/);
});
