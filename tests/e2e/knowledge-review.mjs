import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// The 项目知识 page (apps/portal/tests/s1/task-detail.html?page=knowledge): mocked API, no auth or network.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320',shots=process.env.NR_SHOTS;
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.addLocatorHandler(page.getByRole('alertdialog'),async d=>{await d.getByRole('button').last().click();});
 const open=async(q='')=>{await page.goto(`${base}/tests/s1/task-detail.html?page=knowledge${q}`);await expect(page.getByRole('heading',{name:'项目知识',exact:true})).toBeVisible();};
 const calls=()=>page.evaluate(()=>window.__calls.filter(c=>c.knowledge||c.knowledgeAdd));
 const memory=page.getByRole('region',{name:'记忆'}),kb=page.getByRole('region',{name:'知识库'}),table=page.getByRole('table',{name:'知识库资料'});
 await open();
 // 记忆: nine handbook sections; a project saved with the older fields is read into them.
 assert.deepEqual(await memory.locator('dt').allTextContents(),['项目名称','品牌基础','产品','受众','市场与语言','语气与风格','用词','核心信息','竞品','规矩与禁区']);
 await expect(memory.locator('dd').nth(1)).toHaveText('开源无代码平台\n定位：面向企业内部系统');await expect(memory.locator('dd').nth(2)).toContainText('关键页面：');await expect(memory.locator('dd').nth(9)).toHaveText('定价页');
 await expect(memory.locator('dd').nth(7)).toContainText('未填写');await expect(memory).toContainText('建议 3,000 字以内');
 // 知识库: newest first, search and category filter, row opens the full text.
 await expect(table.locator('tbody tr')).toHaveCount(2);await expect(table.locator('tbody tr').first()).toContainText('客户访谈纪要');await expect(table.locator('tbody tr').first()).toContainText('文件 · 12,800 字');await expect(table.locator('tbody tr').nth(1)).toContainText('文字 · 5,200 字');
 await kb.getByLabel('搜索知识库').fill('Retool');await expect(table.locator('tbody tr')).toHaveCount(1);await kb.getByLabel('搜索知识库').fill('');
 await kb.getByLabel('按分类筛选').selectOption('customer');await expect(table.locator('tbody tr')).toHaveCount(1);await expect(table).toContainText('客户访谈纪要');await kb.getByLabel('按分类筛选').selectOption('');
 await expect(kb).toContainText('Agent 本来就能读');
 if(shots)await page.screenshot({path:`${shots}/knowledge.png`,fullPage:true});
 // 编辑记忆 in place and save: all nine sections go to saveMemory, and the page reads them back.
 await page.evaluate(()=>{window.__calls=[];});await memory.getByRole('button',{name:'编辑'}).click();
 await memory.getByLabel('核心信息').fill('开源、可私有部署');await memory.getByLabel('语气与风格').fill('简洁、具体');
 if(shots)await page.screenshot({path:`${shots}/knowledge-memory-edit.png`,fullPage:true});
 await memory.getByRole('button',{name:'保存'}).click();await expect(page.getByRole('status')).toContainText('记忆已保存');
 let c=(await calls()).at(-1);assert.equal(c.knowledge,'saveMemory');assert.equal(c.name,'Demo');assert.equal(c.memory.messages,'开源、可私有部署');assert.equal(c.memory.voice,'简洁、具体');assert.equal(c.memory.brand,'开源无代码平台\n定位：面向企业内部系统');assert.equal(Object.keys(c.memory).length,9);
 await expect(memory.locator('dd').nth(7)).toHaveText('开源、可私有部署');
 // 添加: paste text (needs content); the AI suggests the 知识库 title and category and a 记忆 line; both kept on 确认.
 await page.getByRole('button',{name:'添加'}).click();const dlg=page.getByRole('dialog');await expect(dlg.getByRole('heading',{name:'添加'})).toBeVisible();
 await dlg.getByRole('button',{name:'下一步'}).click();await expect(dlg.getByRole('alert')).toContainText('请粘贴');
 await dlg.getByLabel('内容').fill('行业报告：低代码市场 2026\n市场规模继续增长。');await dlg.getByRole('button',{name:'下一步'}).click();
 await expect(dlg.getByRole('checkbox',{name:/存进知识库/})).toBeChecked();await expect(dlg.getByLabel('标题')).toHaveValue('行业报告：低代码市场 2026');await expect(dlg.getByLabel('分类')).toHaveValue('industry');
 await expect(dlg.locator('[data-memory-line="competitors"]')).toContainText('Appsmith 按人收费');await expect(dlg.locator('[data-memory-line="competitors"] input')).toBeChecked();
 await dlg.getByRole('button',{name:'确认'}).click();await expect(dlg).toHaveCount(0);await expect(page.getByRole('status')).toContainText('已存进知识库：行业报告：低代码市场 2026；记忆补充了：竞品');await expect(table.locator('tbody tr')).toHaveCount(3);
 c=(await calls()).filter(x=>x.knowledgeAdd==='confirm').at(-1);assert.equal(c.category,'industry');assert.equal(c.projectId,'1');assert.deepEqual(c.memory.map(m=>m.section),['competitors']);
 await expect(memory.locator('dd').nth(8)).toContainText('Appsmith 按人收费');
 // A file is sent as base64; the title can be changed and a 记忆 line left out.
 await page.getByRole('button',{name:'添加'}).click();await dlg.getByRole('button',{name:'上传文件'}).click();
 await dlg.getByLabel('文件').setInputFiles({name:'访谈.md',mimeType:'text/markdown',buffer:Buffer.from('# 访谈\n要点')});await dlg.getByRole('button',{name:'下一步'}).click();
 await expect(dlg.getByLabel('标题')).toHaveValue('访谈');await dlg.getByLabel('标题').fill('第二轮访谈');await dlg.locator('[data-memory-line="competitors"] input').uncheck();await dlg.getByRole('button',{name:'确认'}).click();
 await expect(page.getByRole('status')).toContainText('已存进知识库：第二轮访谈');await expect(page.getByRole('status')).not.toContainText('记忆补充了');
 c=(await calls()).filter(x=>x.knowledgeAdd==='suggest').at(-1);assert.equal(c.file.name,'访谈.md');assert.equal(Buffer.from(c.file.data,'base64').toString(),'# 访谈\n要点');
 // A Skill link goes to Skills; 返回 goes back to the input.
 await page.getByRole('button',{name:'添加'}).click();await dlg.getByRole('button',{name:'填网址'}).click();await dlg.getByLabel('网址').fill('https://github.com/org/repo/tree/main/skills/seo');await dlg.getByRole('button',{name:'下一步'}).click();
 await expect(dlg).toContainText('这是一个 Skill：seo-check');await dlg.getByRole('button',{name:'返回'}).click();await expect(dlg.getByLabel('网址')).toBeVisible();await dlg.getByRole('button',{name:'下一步'}).click();await dlg.getByRole('button',{name:'确认'}).click();
 await expect(page.getByRole('status')).toContainText('已导入 Skill：seo-check');
 // 记忆 that keeps up: the first draft says what it read; weekly suggestions are accepted (a replacement swaps the line)
 // or ignored; 立即检查 runs once and the page waits for it.
 const draftNote=memory.locator('[data-memory-draft]');await expect(draftNote).toContainText('AI 初稿：读了官网 2 个页面和 1 份资料');await expect(draftNote).toContainText('填了核心信息');
 await draftNote.getByRole('button',{name:'读了哪些'}).click();await expect(draftNote.getByRole('link',{name:'定价'})).toBeVisible();await expect(draftNote).toContainText('知识库：竞品功能对比 2026');
 const sugg=memory.getByRole('region',{name:'更新建议'});await expect(sugg).toContainText('2 条更新建议');await expect(sugg).toContainText('来自任务修改意见：修改意见出现了 3 次（例如：Nocobase 拼错了）');await expect(sugg.locator('.line-through')).toHaveText('IT 团队和开发者');
 if(shots){await page.waitForTimeout(300);await page.screenshot({path:`${shots}/knowledge-memory-updates.png`,fullPage:true});}
 await draftNote.getByRole('button',{name:'知道了'}).click();await expect(draftNote).toHaveCount(0);
 await sugg.locator('[data-suggestion="m2"]').getByRole('button',{name:'替换'}).click();await expect(page.getByRole('status')).toContainText('记忆更新了：受众');await expect(memory.locator('dd').nth(3)).toHaveText('IT 团队、开发者和业务分析师');
 await sugg.locator('[data-suggestion="m1"]').getByRole('button',{name:'忽略'}).click();await expect(sugg).toHaveCount(0);
 await memory.getByRole('button',{name:'立即检查'}).click();await expect(memory).toContainText('正在检查');await expect(memory).toContainText('没有要更新的',{timeout:10000});
 assert.deepEqual(await page.evaluate(()=>window.__calls.filter(c=>c.memoryUpdate&&c.memoryUpdate!=='status').map(c=>[c.memoryUpdate,c.ids||null])),[['seen',null],['accept',['m2']],['dismiss',['m1']],['check',null]]);
 // A row opens the drawer: full text, rename and recategorise, delete.
 await table.getByRole('button',{name:'竞品功能对比 2026',exact:true}).click();const drawer=page.getByRole('region',{name:'资料详情'});await expect(drawer).toContainText('权限：我们支持字段级权限。');
 await expect(drawer).toContainText('粘贴的文字 · 5,200 字');if(shots){await page.waitForTimeout(400);await page.screenshot({path:`${shots}/knowledge-item.png`});}
 await drawer.getByLabel('标题').fill('竞品对比（2026）');await drawer.getByRole('button',{name:'保存'}).click();await expect(page.getByRole('status')).toContainText('已保存');await expect(table).toContainText('竞品对比（2026）');
 assert.deepEqual((await calls()).filter(x=>x.knowledge==='edit').map(x=>[x.itemId,x.title,x.category]),[['k1','竞品对比（2026）','competitor']]);
 await table.getByRole('button',{name:'竞品对比（2026）',exact:true}).click();await drawer.getByRole('button',{name:'删除'}).click();await expect(page.getByRole('status')).toContainText('已删除');await expect(table.locator('tbody tr')).toHaveCount(3);await expect(table).not.toContainText('竞品对比');
 // straight from the row, without opening it
 const first=table.locator('tbody tr').first(),firstTitle=(await first.locator('td button').first().textContent());await first.getByRole('button',{name:`删除 ${firstTitle}`}).click();await expect(page.getByRole('status')).toContainText(`已删除：${firstTitle}`);await expect(table.locator('tbody tr')).toHaveCount(2);await expect(drawer).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await open('&dark=1');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'fits 390');
 if(shots)await page.screenshot({path:`${shots}/knowledge-390.png`,fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS 项目知识: 记忆 in nine handbook sections with older fields read in, edited in place and saved; 知识库 newest first with search and category filter; 添加 in two steps (paste, file as base64 or a Skill link; AI suggests title, category and 记忆 lines, kept on 确认); 记忆 first draft note (what it read) and weekly suggestions accepted, replaced or ignored, 立即检查 waited for; item drawer with full text, rename and delete; delete from a row; 390 dark without overflow. Mocked API only.');
}finally{await browser.close();}
