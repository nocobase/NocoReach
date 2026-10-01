import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));const {chromium,expect}=require('@playwright/test');
// The 机会 page against a real host with a synthetic state (route-mocked): pending only from the latest analysis,
// ignored and older items archived, decisions are hand off (交给 Agent) or ignore, archived items can be restored. Writes are intercepted.
const base=process.env.NR_PORTAL_URL,token=process.env.NR_API_TOKEN;assert.ok(base&&token,'set NR_PORTAL_URL and NR_API_TOKEN locally');
const card=(id,title,extra={})=>({id,title,observation:title+'的观察',meaning:'为什么值得做',evidenceText:'e',limitation:'l',suggestion:'建议做法',objective:'g',source:'search',priority:'medium',sources:['gsc'],firstSeenAt:'2026-10-01T00:00:00Z',...extra});
const signals={computedAt:'',coverage:{},missing:[],items:[{key:'thin',type:'page',source:'site',title:'内容很短',facts:['正文约 92 字','曝光 5848'],strength:1,actionable:true,action:'optimize'}]};
const state={revision:1,goal:null,proposals:[],opportunityMeta:{ign:{status:'ignored'}},insights:{generatedAt:'2026-10-01T01:00:00Z',evidence:{analysisVersion:3,periodDays:28,signals},items:[card('now','当前机会',{signalIds:['thin'],priority:'high'}),card('ign','已忽略机会',{signalIds:['thin']})],observations:[]},insightHistory:[{generatedAt:'2026-09-28T01:00:00Z',evidence:{analysisVersion:2,periodDays:28},items:[card('old','旧分析机会')]}]};
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{const p=await browser.newPage({viewport:{width:1440,height:900}});await p.addInitScript(t=>localStorage.setItem('NOCOBASE_TOKEN',t),token);
 const writes=[];await p.route('**/api/nrStrategy:state',r=>r.fulfill({json:{data:state}}));
 await p.route('**/api/nrStrategy:reviewOpportunity',r=>{writes.push(JSON.parse(r.request().postData()||'{}'));r.fulfill({json:{data:state}});});
 await p.goto(base+'/opportunities');await expect(p.getByRole('heading',{name:'机会',exact:true})).toBeVisible({timeout:30000});
 await expect(p.getByRole('button',{name:'待处理 1'})).toBeVisible();await expect(p.getByRole('button',{name:'已归档 2'})).toBeVisible();
 const detail=p.getByRole('region',{name:'机会详情'});await expect(detail).toContainText('内容很短');await expect(detail.getByRole('heading',{name:'交给谁做'})).toBeVisible();
  await p.getByRole('button',{name:'忽略',exact:true}).click();await expect.poll(()=>writes.at(-1)?.status).toBe('ignored');
 await p.getByRole('button',{name:'已归档 2'}).click();await p.getByRole('button',{name:/旧分析机会/}).click();await expect(detail).toContainText('已过期');
 await p.getByRole('button',{name:'恢复到待处理'}).click();await expect.poll(()=>writes.at(-1)?.status).toBe('pending');
 await p.goto(base+'/home/opportunities/old');await expect(p).toHaveURL(/\/opportunities\?item=old/);
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('PASS 机会: tabs and counts, archive of ignored and older items, ignore/restore, old discussion links, mobile width');
}finally{await browser.close();}
