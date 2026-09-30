import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect,request}=require('@playwright/test');
const base=process.env.NR_PORTAL_URL,token=process.env.NR_API_TOKEN;
assert.ok(base&&token,'Set authorized NR_PORTAL_URL and NR_API_TOKEN; this test does not call a model or publish.');
const api=await request.newContext({baseURL:new URL(base).origin,extraHTTPHeaders:{Authorization:`Bearer ${token}`,'x-portal':'main'}});
const ids=[],run=randomUUID();let browser,contentId;
const post=async(path,body)=>{const r=await api.post('/api/'+path,{data:body});assert.equal(r.status(),200,`${path}: ${r.status()}`);return (await r.json()).data;};
const get=id=>post('nrTaskWork:get',{projectId:'1',taskId:String(id)});
try{
 for(let n=0;n<2;n++){const t=await post('nrTasks:create',{projectId:'1',taskKey:`s1-${run}-${n}`,title:`S1 合成调研 ${run}-${n}`,brief:'仅使用合成资料验证操作，不调用模型，不发布。',status:'待处理',evidence:{source:'S1 synthetic '+run}});ids.push(t.id);}
 browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(t=>localStorage.setItem('NOCOBASE_TOKEN',t),token);
 await page.goto(base+'/actions?q='+run);const doing=page.getByRole('region',{name:'进行中',exact:true});await page.locator(`[data-task-id="${ids[0]}"]`).dragTo(doing);await expect.poll(async()=>(await get(ids[0])).work.boardState).toBe('doing');await page.reload();await expect(doing.locator(`[data-task-id="${ids[0]}"]`)).toBeVisible();
 await page.goto(base+'/actions/'+ids[0]);await expect(page.locator('[aria-current=step]')).toHaveText('1确认范围');await expect(page.getByLabel('本次工作范围')).toBeVisible();await expect(page.getByRole('button',{name:'开始修改',exact:true})).toBeVisible();
 // Scope and result go through the API so the check never starts a model run; the UI then reviews and completes.
 const advance=async(id,body)=>{const cur=await get(id);return post('nrTaskWork:advance',{projectId:'1',taskId:String(id),revision:cur.work.revision,requestId:randomUUID(),...body});};
 await advance(ids[0],{command:'startSimple',scope:'比较合成样例，输出简短研究结论。',kind:'research'});await advance(ids[0],{command:'saveResult',content:'合成报告：样例 A 提供了更多可核对的信息。'});
 await page.reload();await expect(page.locator('[aria-current=step]')).toHaveText('3审核');await page.getByRole('button',{name:'通过',exact:true}).click();await page.getByRole('button',{name:'确认完成',exact:true}).click();
 await expect.poll(async()=>(await get(ids[0])).work.boardState).toBe('done');let d=await get(ids[0]);assert.equal(d.work.receipt,null);assert.equal(d.task.evidence.source,'S1 synthetic '+run);assert.equal(d.runs.length,0);
 const projectResponse=await api.get('/api/nrSnapshots:list',{params:{filter:JSON.stringify({key:'project'}),pageSize:'1'}});assert.equal(projectResponse.status(),200);const project=(await projectResponse.json()).data[0].payload,domain=project.domains[0];
 const saved=await post('nrContentIndex:save',{projectId:'1',revision:0,title:'S1 synthetic '+run,url:new URL('/__nr_s1_'+run,domain.includes('://')?domain:'https://'+domain).href,repository:'example/synthetic',paths:['content/synthetic.md']});contentId=saved.id;
 const contentTask=await post('nrContentIndex:createWork',{projectId:'1',contentId,requestId:run});ids.push(contentTask.id);assert.equal(contentTask.evidence.work.contentId,contentId);
 await page.goto(base+'/content');await expect(page.getByRole('heading',{name:'内容',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'S1 synthetic '+run,exact:true})).toBeVisible();
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);console.log('PASS real S1 navigation, durable drag after reload, simple research review/completion, original evidence and content association. No model or external publishing.');
}finally{
 if(browser)await browser.close();
 for(const id of ids){const d=await get(id);assert.ok(!d.runs.some(r=>['queued','running'].includes(r.status)),'Do not delete active task');for(const kind of ['run','artifact','review','plan','legacy','op']){const res=await api.get('/api/nrSnapshots:list',{params:{filter:JSON.stringify({key:{$startsWith:`nr-task-${kind}:1:${id}:`}}),pageSize:'1000'}});assert.equal(res.status(),200);for(const row of (await res.json()).data||[])assert.ok((await api.post('/api/nrSnapshots:destroy',{params:{filterByTk:String(row.id)}})).ok());}assert.ok((await api.post('/api/nrTasks:destroy',{params:{filterByTk:String(id)}})).ok());}
 for(const key of [contentId&&`nr-task-content:1:index:${contentId}`,`nr-task-content-create:1:index:${run}`].filter(Boolean)){const res=await api.get('/api/nrSnapshots:list',{params:{filter:JSON.stringify({key}),pageSize:'1'}});assert.equal(res.status(),200);for(const row of (await res.json()).data||[])assert.ok((await api.post('/api/nrSnapshots:destroy',{params:{filterByTk:String(row.id)}})).ok());}
 await api.dispose();
}
