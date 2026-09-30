import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));const {chromium,expect,request}=require('@playwright/test');
const base=process.env.NR_PORTAL_URL,token=process.env.NR_API_TOKEN;assert.ok(base&&token);
const api=await request.newContext({baseURL:new URL(base).origin,extraHTTPHeaders:{'x-portal':'main',Authorization:`Bearer ${token}`}});
const read=async()=>{const r=await api.post('/api/nrStrategy:state',{data:{projectId:'1'}});assert.equal(r.status(),200);return (await r.json()).data;};
const before=await read();assert.ok(before.insights?.items.length,'Existing generated opportunities required');const old=before.insights,oldId=old.items[0].id;
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{const p=await browser.newPage({viewport:{width:1600,height:1100}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(t=>{localStorage.setItem('NOCOBASE_TOKEN',t);localStorage.setItem('NOCOBASE_LOCALE','zh-CN');},token);
 await p.goto(base+'/opportunities');await expect(p.getByRole('heading',{name:'机会库',exact:true})).toBeVisible();await expect(p.locator(`[data-opportunity-id="${oldId}"]`)).toBeVisible();
 await p.getByLabel('搜索机会',{exact:true}).fill('no-match-acceptance-unique');await expect(p.getByText('没有匹配的机会，请调整筛选条件。')).toBeVisible();await p.getByLabel('搜索机会',{exact:true}).fill('');
 await p.goto(base+'/home');await expect(p.getByRole('button',{name:'更新建议',exact:true})).toBeEnabled({timeout:30000});
 const saved=p.waitForResponse(r=>r.url().includes('nrStrategy:saveInsights')&&r.status()===200,{timeout:120000});await p.getByRole('button',{name:'更新建议',exact:true}).click();await saved;
 const after=await read();assert.notEqual(after.insights.items[0].id,oldId);assert.deepEqual(after.insightHistory.find(b=>b.items[0].id===oldId),old);
 console.log('PASS real refresh archives old batch with unchanged ids and evidence');
 await p.goto(base+'/opportunities');await p.getByLabel('搜索机会',{exact:true}).fill(old.items[0].title);const row=p.locator(`[data-opportunity-id="${oldId}"]`);await expect(row).toBeVisible();await row.getByRole('button',{name:'查看与继续讨论',exact:true}).click();await expect(p).toHaveURL(new RegExp('/home/opportunities/'+oldId+'$'));await expect(p.getByRole('heading',{name:old.items[0].title,exact:true})).toBeVisible();
 await p.goto(base+'/opportunities');await p.setViewportSize({width:390,height:844});await expect(p.getByRole('heading',{name:'机会库',exact:true})).toBeVisible();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 console.log('PASS library search, historical discussion route and mobile; no task confirmed');
}finally{await browser.close();await api.dispose();}
