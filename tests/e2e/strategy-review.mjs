import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect,request}=require('@playwright/test');
const base=process.env.NR_PORTAL_URL,token=process.env.NR_API_TOKEN;
assert.ok(base&&token,'Set NR_PORTAL_URL and NR_API_TOKEN for the authorized local pilot');
const origin=new URL(base).origin;
const client=await request.newContext({baseURL:origin,extraHTTPHeaders:{Authorization:`Bearer ${token}`}});
async function call(action,body={}){return client.post(`/api/nrStrategy:${action}`,{data:{projectId:'1',...body}});}
const browser=await chromium.launch({headless:true,...(process.env.NR_CHROMIUM_PATH?{executablePath:process.env.NR_CHROMIUM_PATH}:{})});
let createdTask,createdState=false,expectedRevision;
try{
 const initialResponse=await call('state');assert.equal(initialResponse.status(),200);const initial=(await initialResponse.json()).data;
 // Never replace an existing user's goal just to run this test.
 if(!initial.goal&&initial.revision===0){
  const key=randomUUID(),body={revision:0,requestId:key,intent:'[验收临时目标] 验证流程',audience:'测试人员',focus:'检查保存与确认',progress:'流程可追溯'};
  const saved=await call('saveGoal',body);assert.equal(saved.status(),200);let state=(await saved.json()).data;createdState=true;expectedRevision=state.revision;
  const repeated=await call('saveGoal',body);assert.equal((await repeated.json()).data.revision,state.revision);
  assert.equal((await call('saveGoal',{...body,requestId:randomUUID()})).status(),409);
  const proposal=await call('saveProposal',{revision:state.revision,requestId:randomUUID(),title:'[验收临时方案] 流程测试',brief:'仅用于检查方案到任务的确认流程，不创作或发布内容。'});assert.equal(proposal.status(),200);state=(await proposal.json()).data;expectedRevision=state.revision;
  const approval={revision:state.revision,requestId:randomUUID(),proposalId:state.proposals[0].id};
  const approved=await call('approve',approval);assert.equal(approved.status(),200);state=(await approved.json()).data;expectedRevision=state.revision;createdTask=state.proposals[0].taskId;assert.ok(createdTask);
  const again=await call('approve',{...approval,requestId:randomUUID()});assert.equal((await again.json()).data.proposals[0].taskId,createdTask);
  console.log('PASS save, stale revision rejection, idempotency and task approval');
 }

}finally{
 // Delete only records created by this run, and only if nobody has changed its state.
 if(createdState){const response=await call('state');if(response.ok()){const state=(await response.json()).data;
  if(state.revision===expectedRevision&&state.goal?.intent==='[验收临时目标] 验证流程'){
   if(createdTask)await client.post('/api/nrTasks:destroy',{params:{filterByTk:String(createdTask)}});
   const rows=await client.get('/api/nrSnapshots:list',{params:{filter:JSON.stringify({key:'strategy:1'})}});
   for(const row of (await rows.json()).data||[])await client.post('/api/nrSnapshots:destroy',{params:{filterByTk:String(row.id)}});
  }
 }}
 await browser.close();await client.dispose();
}
