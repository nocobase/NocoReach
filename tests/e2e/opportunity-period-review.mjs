import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));const {chromium,expect}=require('@playwright/test');
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{const page=await browser.newPage({viewport:{width:1600,height:1000}});await page.addInitScript(t=>localStorage.setItem('NOCOBASE_TOKEN',t),process.env.NR_API_TOKEN);await page.goto(process.env.NR_PORTAL_URL+'/home');const select=page.getByLabel('观察周期',{exact:true});await expect(select).toBeEnabled({timeout:30000});
 assert.equal(await page.getByRole('heading',{name:'浏览更多机会',exact:true}).count(),0);assert.equal(await page.getByRole('heading',{name:'本次观察',exact:true}).count(),0);
 let generations=0;page.on('request',r=>{if(r.url().includes('sendMessages'))generations++;});
 for(const days of ['7','90','28']){await select.selectOption(days);await expect(select).toHaveValue(days);await expect(page.getByRole('heading',{name:'值得做的优化',exact:true})).toBeVisible();}
 assert.equal(generations,0);await page.reload();await expect(page.getByLabel('观察周期',{exact:true})).toHaveValue('28');await expect(page.getByRole('heading',{name:'洞察',exact:true})).toBeVisible();
 assert.ok(await page.locator('main.nr-discovery').evaluate(e=>e.getBoundingClientRect().width)>1000);await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('PASS period selection without model calls, removed duplicate modules, refresh, desktop width and mobile overflow');
}finally{await browser.close();}
