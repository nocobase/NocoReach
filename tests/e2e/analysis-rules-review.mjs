import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));const {chromium,expect}=require('@playwright/test');
// 分析规则 (apps/portal/tests/s1/rules.html, mocked API only): the three steps with the last run, rules by source with
// their numbers and counts, switch on and off, change numbers in a dialog and back to default, team focus, longest watch.
const base=process.env.NR_FIXTURE_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=()=>page.evaluate(()=>window.__calls);
 await page.goto(`${base}/tests/s1/rules.html`);await expect(page.getByRole('heading',{name:'分析规则',exact:true})).toBeVisible();
 await expect(page.locator('[data-step="find"]')).toContainText('规则从数据里找出 52 条变化');await expect(page.locator('[data-step="pick"]')).toContainText('交给 AI 40 条');await expect(page.locator('[data-step="judge"]')).toContainText('值得做 13 · 先观察 9 · 不用做 18');
 // rules grouped by source, a source without data marked; numbers and this run's count on each rule
 assert.deepEqual(await page.locator('[data-source]').evaluateAll(l=>l.map(e=>e.getAttribute('data-source'))),['gsc','github','discourse','packages']);
 await expect(page.locator('[data-source="packages"]')).toContainText('没有数据');
 const low=page.locator('[data-rule="gsc-low-ctr"]');await expect(low.locator('[data-numbers]')).toHaveText('曝光至少 500 · 点击率低于 2%');await expect(low.locator('[data-found]')).toHaveText('这次 4 条');
 await expect(page.locator('[data-rule="community-category"] [data-found]')).toHaveText('—');await expect(page.locator('[data-rule="community-category"] [data-numbers]')).toHaveText('至少 5 个主题 · 是之前的 1.5 倍');await expect(page.locator('[data-rule="github-release"]').getByRole('button',{name:'修改'})).toHaveCount(0);
 // switch a rule off: the whole rule settings are saved
 await page.locator('[data-rule="gsc-near-first"]').getByRole('switch').click();await expect(page.getByText('已保存，从下一次分析起生效')).toBeVisible();
 let c=(await calls()).at(-1);assert.deepEqual(c.rules['gsc-near-first'],{enabled:false,values:{}});assert.deepEqual(c.rules['community-category'],{enabled:false,values:{}});assert.deepEqual(c.rules['gsc-low-ctr'],{values:{}});
 // change numbers in a dialog; out of range is refused; back to default
 await low.getByRole('button',{name:'修改'}).click();let d=page.getByRole('dialog');await d.getByLabel('点击率低于').fill('50');await expect(d.getByRole('alert')).toContainText('点击率低于要在 0.1–20 之间');await expect(d.getByRole('button',{name:'保存'})).toBeDisabled();
 await d.getByLabel('点击率低于').fill('3');await d.getByLabel('曝光至少').fill('800');await d.getByRole('button',{name:'保存'}).click();await expect(d).toHaveCount(0);
 assert.deepEqual((await calls()).at(-1).rules['gsc-low-ctr'],{values:{minImpressions:800,maxCtr:3}});await expect(low.locator('[data-numbers]')).toContainText('曝光至少 800 · 点击率低于 3%');await expect(low.locator('[data-numbers]')).toContainText('已改');
 await low.getByRole('button',{name:'修改'}).click();d=page.getByRole('dialog');await d.getByRole('button',{name:'恢复默认'}).click();await expect(d.getByLabel('曝光至少')).toHaveValue('500');await d.getByRole('button',{name:'保存'}).click();
 assert.deepEqual((await calls()).at(-1).rules['gsc-low-ctr'],{values:{}});
 // the AI's standards, the team focus and the longest watch
 await expect(page.locator('[data-verdict-rules]')).toContainText('最多 14 天');
 await page.locator('[data-focus]').getByRole('button',{name:'修改'}).click();d=page.getByRole('dialog');await d.getByLabel('你们的侧重点').fill('社区问题优先；竞品动态只看不做');await d.getByRole('button',{name:'保存'}).click();
 assert.equal((await calls()).at(-1).focus,'社区问题优先；竞品动态只看不做');await expect(page.locator('[data-focus]')).toContainText('社区问题优先；竞品动态只看不做');
 await page.locator('[data-watch-days]').getByRole('button',{name:'修改'}).click();d=page.getByRole('dialog');await d.getByLabel('先观察最长天数').fill('40');await expect(d.getByRole('button',{name:'保存'})).toBeDisabled();await d.getByLabel('先观察最长天数').fill('21');await d.getByRole('button',{name:'保存'}).click();
 assert.equal((await calls()).at(-1).watchDays,21);await expect(page.locator('[data-watch-days]')).toContainText('先观察最长 21 天');await expect(page.locator('[data-verdict-rules]')).toContainText('最多 21 天');
 for(const [w,h,dark] of [[1440,900,false],[390,844,true]]){await page.setViewportSize({width:w,height:h});await page.goto(`${base}/tests/s1/rules.html${dark?'?dark':''}`);await expect(page.locator('[data-rule]').first()).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`no horizontal overflow at ${w}`);}
 assert.deepEqual(errors,[]);
 console.log('PASS: 分析规则 (three steps with the last run, rules by source with numbers and counts, a source without data marked, switch off saves the whole settings, numbers changed in a dialog with range check and back to default, team focus, longest watch; 1440 light and 390 dark without overflow). Mocked API only.');
}finally{await browser.close();}
