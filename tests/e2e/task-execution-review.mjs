import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect,request}=require('@playwright/test');
const base=process.env.NR_PORTAL_URL,token=process.env.NR_API_TOKEN;
assert.ok(base&&token&&process.env.NR_TEST_MODEL==='1','Set authorized NR_PORTAL_URL, NR_API_TOKEN and NR_TEST_MODEL=1');
const api=await request.newContext({baseURL:new URL(base).origin,extraHTTPHeaders:{Authorization:`Bearer ${token}`,'x-portal':'main'}});
const anonymous=await request.newContext({baseURL:new URL(base).origin});
let taskId,browser;
const call=(action,body={})=>api.post('/api/nrTaskWork:'+action,{data:{projectId:'1',taskId,...body}});
const get=async()=>{const r=await call('get');assert.equal(r.status(),200);return (await r.json()).data;};
try{
 const r=await api.post('/api/nrTasks:create',{data:{projectId:'1',taskKey:'m1-test-'+randomUUID(),title:'M1 临时验收：合成产品文案',status:'待处理',brief:'仅基于虚构资料：星桥笔记是一款支持离线写作和标签整理的工具，为学生写80字中文介绍。不使用项目背景、不联网、不发布。方案只安排一个在线AI文本步骤。',evidence:{source:'M1 synthetic test',reason:'No production action'}}});assert.equal(r.status(),200);taskId=(await r.json()).data.id;
 assert.ok([401,403].includes((await anonymous.post('/api/nrTaskWork:get',{data:{projectId:'1',taskId}})).status()));
 assert.equal((await call('get',{projectId:'2'})).status(),404);
 browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(t=>localStorage.setItem('NOCOBASE_TOKEN',t),token);
 await page.goto(base+'/actions/'+taskId);
 await expect(page.getByRole('heading',{name:'M1 临时验收：合成产品文案'})).toBeVisible({timeout:30000});
 await page.getByRole('button',{name:'由我负责',exact:true}).click();
 await page.getByText('按需拆分步骤与审核点',{exact:true}).click();
 const plan=page.getByRole('button',{name:'让 AI 梳理执行方案',exact:true});await expect(plan).toBeEnabled({timeout:30000});await plan.click();
 const take=page.getByRole('button',{name:'将 AI 建议放入编辑区',exact:true});await expect(take).toBeVisible({timeout:240000});await take.click();
 while(await page.getByRole('button',{name:'删除此步骤',exact:true}).count()>1)await page.getByRole('button',{name:'删除此步骤',exact:true}).last().click();
 await page.locator('fieldset select').first().selectOption('ai');
 await page.getByRole('button',{name:'保存方案',exact:true}).click();
 await page.getByRole('button',{name:'确认方案，开始推进',exact:true}).click();
 const produce=page.getByRole('button',{name:'让 AI 生成成果',exact:true});await expect(produce).toBeEnabled();
 let startBody;page.on('request',r=>{if(r.url().includes('/nrTaskWork:advance')){const b=r.postDataJSON();if(b?.command==='startRun')startBody=b;}});
 await produce.click();await expect.poll(async()=>(await get()).runs.length).toBe(1);
 const repeat=await api.post('/api/nrTaskWork:advance',{data:startBody});assert.equal(repeat.status(),200);assert.equal((await get()).runs.length,1);
 await page.reload();await expect(page.getByLabel('当前成果',{exact:true})).not.toHaveValue('',{timeout:240000});
 let data=await get();assert.equal(data.runs[0].status,'succeeded');assert.equal(data.work.stage,'work');
 const first=data.work.results[0].id;
 await page.getByLabel('当前成果',{exact:true}).fill('人工编辑：星桥笔记支持离线写作与标签整理，适合学生记录学习笔记。');await page.getByRole('button',{name:'保存成果',exact:true}).click();
 await expect.poll(async()=>(await get()).artifacts.length).toBe(2);
 data=await get();assert.equal((await call('advance',{command:'approveResult',revision:data.work.revision,requestId:randomUUID(),artifactId:first})).status(),409);
 await page.getByText('成果版本与审核记录',{exact:true}).click();await page.getByLabel('查看历史版本').selectOption(first);await expect(page.getByRole('heading',{name:'所选历史版本',exact:true})).toBeVisible();
 await page.getByLabel('修改意见').fill('请保留人工修改的事实，增加一句具体学生使用场景。');await page.getByRole('button',{name:'打回修改',exact:true}).click();
 await expect(page.getByRole('button',{name:'确认这份成果',exact:true})).toBeDisabled();
 await produce.click();await expect.poll(async()=>(await get()).runs.length).toBe(2);
 await expect.poll(async()=>(await get()).runs.at(-1).status,{timeout:240000}).toBe('succeeded');
 await page.reload();await expect(page.getByLabel('当前成果',{exact:true})).not.toHaveValue('');
 // Simulate another human editor via the real API; failed local save must preserve the draft.
 await page.getByLabel('当前成果',{exact:true}).fill('保留在当前浏览器的未保存草稿');data=await get();
 assert.equal((await call('advance',{command:'saveResult',revision:data.work.revision,requestId:randomUUID(),content:'另一窗口已保存的新版本'})).status(),200);
 await page.getByRole('button',{name:'保存成果',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'任务已更新'})).toBeVisible();await expect(page.getByLabel('当前成果',{exact:true})).toHaveValue('保留在当前浏览器的未保存草稿');
 page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'刷新保存状态',exact:true}).click();
 await expect(page.getByLabel('当前成果',{exact:true})).toHaveValue('另一窗口已保存的新版本');
 await page.getByRole('button',{name:'确认这份成果',exact:true}).click();await expect(page.getByRole('heading',{name:'成果已确认，等待实际执行或发布',exact:true})).toBeVisible();
 for(const dark of [false,true])for(const density of ['compact','comfortable']){
  await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
  await page.getByRole('button',{name:density==='compact'?'紧凑':'舒适',exact:true}).click();
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 }
 assert.deepEqual(errors,[]);
 console.log('PASS real online plan, durable run after reload, replay idempotency, version edit/review/rejection/regeneration, stale save retains draft, project/auth boundary and 8 visual combinations. No publishing performed.');
}finally{
 if(browser)await browser.close();
 if(taskId){
  // Only delete this synthetic task and records under its exact project/task prefix.
  const current=await get();if(current.runs.some(r=>['queued','running'].includes(r.status)))throw Error('Test run still active: leave synthetic task for inspection; do not delete active work');
  for(const kind of ['run','artifact','review','plan','legacy','op']){
   const r=await api.get('/api/nrSnapshots:list',{params:{filter:JSON.stringify({key:{$startsWith:`nr-task-${kind}:1:${taskId}:`}}),pageSize:'1000'}});
   assert.equal(r.status(),200);for(const row of (await r.json()).data||[]){const deleted=await api.post('/api/nrSnapshots:destroy',{params:{filterByTk:String(row.id)}});assert.ok(deleted.ok());}
  }
  assert.ok((await api.post('/api/nrTasks:destroy',{params:{filterByTk:String(taskId)}})).ok());
 }
 await api.dispose();await anonymous.dispose();
}
