import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// The 做法 page (apps/portal/tests/s1/task-detail.html?page=playbooks): mocked API, no auth or network.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320',shots=process.env.NR_SHOTS;
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());
 const open=async(q='')=>{await page.goto(`${base}/tests/s1/task-detail.html?page=playbooks${q}`);await expect(page.getByRole('heading',{name:'做法',exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'做法列表'})).toBeVisible();};
 const calls=()=>page.evaluate(()=>window.__calls.filter(c=>c.playbook));
 const nav=page.getByRole('navigation',{name:'做法列表'}),detail=page.getByRole('region',{name:'做法详情'}),editor=page.getByRole('region',{name:'编辑做法'});
 await open();
 // Grouped by the work, never by who runs it.
 assert.deepEqual(await nav.locator('h2').allTextContents(),['调研分析','内容创作','内容优化']);await expect(page.locator('body')).not.toContainText('方案类');await expect(page.locator('body')).not.toContainText('落地类');
 await expect(detail.getByRole('heading',{level:2})).toHaveText('变化原因调研');await expect(detail).toContainText('由 Agent 执行 · 内置');
 const steps=detail.getByRole('list',{name:'步骤'});await expect(steps.locator('li')).toHaveCount(2);await expect(steps.locator('li').first()).toContainText('1. Agent 分析');await expect(steps.locator('li').first()).toContainText('不改仓库，写出一份文档');await expect(steps.locator('li').nth(1)).toContainText('确认：引用的数据与事实准确');await expect(steps).not.toContainText('上线');
 await nav.getByRole('button',{name:/优化现有页面/}).click();await expect(steps.locator('li')).toHaveCount(6);await expect(steps).toContainText('Agent 出方案');await expect(steps).toContainText('3. Agent 修改');await expect(steps.locator('li').nth(4)).toContainText('上线');await expect(steps.locator('li').nth(5)).toContainText('系统');
 // A step can name Skills it always uses.
 await expect(steps.locator('li').nth(2)).toContainText('用这些 Skill：seo-title-description');await expect(steps.locator('li').first()).not.toContainText('用这些 Skill');
 if(shots)await page.screenshot({path:`${shots}/playbooks.png`,fullPage:true});
 // Built-in playbooks are edited in place: change a step, add one, move it, remove one.
 await page.evaluate(()=>{window.__calls=[];});await detail.getByRole('button',{name:'编辑'}).click();await expect(editor).toBeVisible();
 await editor.getByLabel('给 Agent 的说明').nth(1).fill('只改英文版页面');
 const picks=editor.getByRole('group',{name:'第 3 步用的 Skill'});await expect(picks).toContainText('seo-title-description');await picks.getByLabel('给第 3 步添加 Skill').selectOption('docs-page-writing');await expect(picks).toContainText('docs-page-writing');
 await picks.getByLabel('给第 3 步添加 Skill').selectOption('research-report');await picks.getByRole('button',{name:'不用 research-report'}).click();await expect(picks.getByRole('button',{name:'不用 research-report'})).toHaveCount(0);await editor.getByRole('button',{name:'Agent 分析'}).click();
 const editSteps=editor.getByRole('list',{name:'编辑步骤'}).locator(':scope > li');await expect(editSteps).toHaveCount(5);await editSteps.nth(4).getByLabel('给 Agent 的说明').fill('核对多语言版本');
 await editSteps.nth(4).getByRole('button',{name:'上移'}).click();await editSteps.nth(1).getByRole('button',{name:'删除这一步'}).click();await expect(editSteps).toHaveCount(4);
 if(shots)await page.screenshot({path:`${shots}/playbooks-edit.png`,fullPage:true});
 await editor.getByRole('button',{name:'保存'}).click();await expect(page.getByRole('status')).toContainText('已保存');
 let c=(await calls()).at(-1);assert.equal(c.playbook,'save');assert.equal(c.playbookId,'optimize-page');assert.deepEqual(c.steps.map(s=>s.kind),['analyze','change','analyze','review']);assert.equal(c.steps[1].instruction,'只改英文版页面');assert.deepEqual(c.steps[1].skills,['seo-title-description','docs-page-writing']);assert.equal(c.steps[0].skills,undefined);assert.equal(c.steps[2].instruction,'核对多语言版本');
 await expect(nav.getByRole('button',{name:/优化现有页面/})).toContainText('内置 · 已修改');
 await detail.getByRole('button',{name:'更多操作'}).click();await page.getByRole('menuitem',{name:'恢复默认'}).click();await expect(page.getByRole('status')).toContainText('已恢复默认');assert.equal((await calls()).at(-1).playbook,'restore');
 // Copies are your own and can be removed; built-in ones cannot.
 await nav.getByRole('button',{name:/新建文档页/}).click();await detail.getByRole('button',{name:'更多操作'}).click();await expect(page.getByRole('menuitem',{name:'删除'})).toHaveCount(0);await page.getByRole('menuitem',{name:'复制一份'}).click();
 await expect(detail.getByRole('heading',{level:2})).toHaveText('新建文档页（副本）');await expect(detail).toContainText('自己建的');await expect(page.getByRole('menu')).toHaveCount(0);await detail.getByRole('button',{name:'更多操作'}).click();await expect(page.getByRole('menuitem',{name:'删除'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);
 // 新建做法: one sentence, AI drafts it, the draft opens in the editor to check and save.
 await page.evaluate(()=>{window.__calls=[];});await page.getByRole('button',{name:'新建做法'}).click();const dlg=page.getByRole('dialog');
 await dlg.getByRole('button',{name:'让 AI 起草'}).click();await expect(dlg.getByRole('alert')).toContainText('先用一句话');
 await dlg.getByLabel('这个做法要做什么？').fill('每个新版本发布后，把更新内容同步到中英文更新日志页面');await dlg.getByRole('button',{name:'让 AI 起草'}).click();await expect(dlg).toHaveCount(0);
 await expect(editor).toContainText('新做法（还没保存）');await expect(editor.getByLabel('名称',{exact:true})).toHaveValue('同步更新日志');await expect(editor.getByLabel('分类')).toHaveValue('create');await expect(editor.getByRole('list',{name:'编辑步骤'}).locator(':scope > li')).toHaveCount(4);
 assert.deepEqual((await calls()).map(x=>[x.playbook,x.request]),[['draft','每个新版本发布后，把更新内容同步到中英文更新日志页面']]);
 if(shots)await page.screenshot({path:`${shots}/playbooks-draft.png`,fullPage:true});
 await editor.getByRole('button',{name:'保存'}).click();await expect(page.getByRole('status')).toContainText('已新建做法');c=(await calls()).at(-1);assert.equal(c.playbook,'save');assert.equal(c.playbookId,undefined);assert.equal(c.name,'同步更新日志');
 await expect(nav.getByRole('button',{name:/同步更新日志/})).toBeVisible();
 // An unusable draft says so in the dialog; a blank playbook needs no AI.
 await open('&draftFail=1');await page.getByRole('button',{name:'新建做法'}).click();await dlg.getByLabel('这个做法要做什么？').fill('x');await dlg.getByRole('button',{name:'让 AI 起草'}).click();await expect(dlg.getByRole('alert')).toContainText('直接手动填写');
 await dlg.getByRole('button',{name:'不用 AI，直接新建'}).click();await expect(editor).toContainText('新做法（还没保存）');await expect(editor.getByLabel('名称',{exact:true})).toHaveValue('');await editor.getByRole('button',{name:'取消'}).click();await expect(detail).toBeVisible();
 await page.setViewportSize({width:390,height:844});await open('&dark=1');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'fits 390');
 assert.deepEqual(errors,[]);
 console.log('PASS 做法: grouped by work (no executor categories); steps of the Agent and you with 上线/观察 added by the system; a step names the Skills it uses (shown, added, removed, saved); built-in edited in place (change, add, move, remove steps) and restored; copy and remove own; 新建做法 drafted by AI from one sentence into the editor, then saved; unusable draft and blank start; 390 dark without overflow. Mocked API only.');
}finally{await browser.close();}
