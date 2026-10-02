import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));
const {chromium,expect}=require('@playwright/test');
// The Skills page (apps/portal/tests/s1/task-detail.html?page=skills): mocked API, no auth or network.
const base=process.env.NR_S1_PREVIEW_URL||'http://127.0.0.1:14320',shots=process.env.NR_SHOTS;
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'nr-skill-folder-')),skillDir=path.join(folder,'brand-voice');
fs.mkdirSync(path.join(skillDir,'references'),{recursive:true});
fs.writeFileSync(path.join(skillDir,'SKILL.md'),'---\nname: brand-voice\ndescription: 写任何对外文字时用\n---\n\n# 品牌语气\n不用感叹号');
fs.writeFileSync(path.join(skillDir,'references/words.md'),'禁用词：赋能');fs.writeFileSync(path.join(skillDir,'logo.png'),Buffer.from([0x89,0x50,0x4e,0x47,0,0,0,1]));fs.writeFileSync(path.join(skillDir,'.DS_Store'),'x');
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());
 const open=async(q='')=>{await page.goto(`${base}/tests/s1/task-detail.html?page=skills${q}`);await expect(page.getByRole('heading',{name:'Skills',exact:true})).toBeVisible();};
 const calls=()=>page.evaluate(()=>window.__calls.filter(c=>c.skill));
 const table=page.getByRole('table',{name:'Skills'}),rows=table.locator('tbody tr'),row=n=>table.locator(`tr[data-skill-id="${n}"]`),drawer=page.getByRole('region',{name:'Skill 详情'});
 await open();
 // The library: names with when to use them, the 做法 steps that name them, files, and the switch for this project.
 await expect(rows).toHaveCount(3);assert.deepEqual(await rows.locator('td:first-child button').allTextContents(),['docs-page-writing','research-report','seo-title-description']);
 await expect(row('seo-title-description')).toContainText('优化现有页面 · 修改');await expect(row('research-report').locator('td').nth(2)).toHaveText('1');
 await expect(row('docs-page-writing').getByRole('switch')).toBeChecked();await expect(row('seo-title-description').getByRole('switch')).not.toBeChecked();
 await expect(page.locator('body')).toContainText('做法步骤里指定的 Skill 不管是否启用，那一步都会用');
 await page.getByLabel('搜索 Skill').fill('标题');await expect(rows).toHaveCount(1);await page.getByLabel('搜索 Skill').fill('');
 await page.getByLabel('按启用筛选').selectOption('on');await expect(rows).toHaveCount(1);await page.getByLabel('按启用筛选').selectOption('off');await expect(rows).toHaveCount(2);await page.getByLabel('按启用筛选').selectOption('');
 if(shots)await page.screenshot({path:`${shots}/skills.png`,fullPage:true});
 // Turning one on in this project does not open it.
 await page.evaluate(()=>{window.__calls=[];});await row('seo-title-description').getByRole('switch').click();await expect(page.getByRole('status')).toContainText('已在本项目启用 seo-title-description');
 assert.deepEqual((await calls()).map(c=>[c.skill,c.skillId,c.enabled,c.projectId]),[['setEnabled','seo-title-description',true,'1']]);await expect(drawer).toHaveCount(0);
 // 新建 by filling in: the name follows the SKILL.md rule; the new Skill opens.
 await page.getByRole('button',{name:'新建 Skill'}).click();const dlg=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'新建 Skill'})});await expect(dlg).toBeVisible();
 await dlg.getByLabel('名称').fill('SEO 标题');await dlg.getByRole('button',{name:'保存'}).click();await expect(dlg.getByRole('alert')).toContainText('英文小写');
 await dlg.getByLabel('名称').fill('Faq-Writing');await dlg.getByLabel('什么时候用').fill('写常见问题时用');await dlg.getByRole('button',{name:'保存'}).click();await expect(dlg.getByRole('alert')).toContainText('请写怎么做');
 await dlg.getByLabel('怎么做').fill('## 问题\n- 用读者的原话');if(shots)await page.screenshot({path:`${shots}/skills-new.png`});
 await dlg.getByRole('button',{name:'保存'}).click();await expect(dlg).toHaveCount(0);
 let c=(await calls()).filter(x=>x.skill==='create').at(-1);assert.deepEqual([c.name,c.description,c.body],['faq-writing','写常见问题时用','## 问题\n- 用读者的原话']);
 await expect(drawer).toContainText('用读者的原话');await expect(drawer).toContainText('本项目未启用');await page.keyboard.press('Escape');await expect(drawer).toHaveCount(0);await expect(rows).toHaveCount(4);await expect(page.getByRole('status')).toContainText('已新建 faq-writing');
 // 上传文件夹: SKILL.md and text files go in; hidden and non-text files are skipped; a clash of names is reported.
 await page.getByRole('button',{name:'新建 Skill'}).click();await dlg.getByRole('button',{name:'上传文件夹'}).click();
 await dlg.getByLabel('Skill 文件夹（里面有 SKILL.md）').setInputFiles(skillDir);await expect(dlg.getByRole('status')).toContainText('读到 SKILL.md和 1 个附带文件；跳过 1 个不是文字或太大的文件（logo.png）');
 if(shots)await page.screenshot({path:`${shots}/skills-import.png`});
 await dlg.getByRole('button',{name:'导入'}).click();await expect(dlg).toHaveCount(0);
 c=(await calls()).filter(x=>x.skill==='import').at(-1);assert.deepEqual(c.files.map(f=>f.path).sort(),['SKILL.md','references/words.md']);
 await expect(drawer.getByRole('list',{name:'附带文件'})).toContainText('references/words.md');await page.keyboard.press('Escape');await expect(page.getByRole('status').filter({hasText:'已新建 brand-voice'})).toBeVisible();
 await page.getByRole('button',{name:'新建 Skill'}).click();await dlg.getByRole('button',{name:'上传文件夹'}).click();
 await dlg.getByLabel('或者只选一个 SKILL.md 文件').setInputFiles({name:'brand.md',mimeType:'text/markdown',buffer:Buffer.from('---\nname: brand-voice\ndescription: x\n---\nbody')});
 await dlg.getByRole('button',{name:'导入'}).click();await expect(dlg.getByRole('alert')).toContainText('已经有叫 brand-voice 的 Skill');assert.equal((await calls()).filter(x=>x.skill==='import').at(-1).files[0].path,'SKILL.md','a single file is the SKILL.md');
 await dlg.getByLabel('或者只选一个 SKILL.md 文件').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('x')});await expect(dlg.getByRole('alert')).toContainText('没有找到 SKILL.md');await dlg.getByRole('button',{name:'取消'}).click();
 // 填链接: read first. A repository lists every Skill to tick any number of (those already here cannot be), with a filter and
 // tick-all; the ticked ones are imported together, each with its source. One folder is read whole and imported.
 await page.getByRole('button',{name:'新建 Skill'}).click();await dlg.getByRole('button',{name:'填链接'}).click();
 await dlg.getByRole('button',{name:'导入'}).click();await expect(dlg.getByRole('alert')).toContainText('请先贴链接');
 await dlg.getByLabel('Skill 的链接').fill('https://example.com/blog/post');await dlg.getByRole('button',{name:'读取'}).click();await expect(dlg.getByRole('alert')).toContainText('不是 SKILL.md');
 await dlg.getByLabel('Skill 的链接').fill('https://github.com/acme/skills');await dlg.getByLabel('Skill 的链接').press('Enter');
 const choices=dlg.getByRole('list',{name:'链接里的 Skill'});await expect(choices.locator('li')).toHaveCount(10);await expect(dlg).toContainText('这个链接里有 10 个 Skill，勾选要导入的（已有的不能重复导入）');
 await expect(choices.getByRole('checkbox',{name:/docs-page-writing/})).toBeDisabled();await expect(choices.locator('li').filter({hasText:'docs-page-writing'})).toContainText('已有');
 await dlg.getByRole('button',{name:'导入 0 个'}).click();await expect(dlg.getByRole('alert')).toContainText('请至少勾选一个');
 await choices.getByRole('checkbox',{name:/brand-voice/}).check();await choices.getByRole('checkbox',{name:/faq/}).check();await expect(dlg.getByRole('button',{name:'导入 2 个'})).toBeVisible();
 await dlg.getByLabel('筛选链接里的 Skill').fill('页');await expect(choices.locator('li')).toHaveCount(4);await dlg.getByRole('button',{name:'全选筛出的'}).click();await expect(dlg.getByRole('button',{name:'导入 5 个'})).toBeVisible();
 await dlg.getByLabel('筛选链接里的 Skill').fill('');await dlg.getByRole('button',{name:'全选'}).click();await expect(dlg.getByRole('button',{name:'导入 9 个'})).toBeVisible();
 await dlg.getByRole('button',{name:'全不选'}).click();await expect(dlg.getByRole('button',{name:'导入 0 个'})).toBeVisible();
 for(const n of ['brand-voice','cold-email','seo-audit'])await choices.getByRole('checkbox',{name:new RegExp(n)}).check();
 if(shots)await page.screenshot({path:`${shots}/skills-link-choices.png`});
 await dlg.getByRole('button',{name:'导入 3 个'}).click();await expect(dlg).toHaveCount(0);
 c=(await calls()).filter(x=>x.skill==='importLink').at(-1);assert.deepEqual([c.url,c.paths],['https://github.com/acme/skills',['skills/brand-voice','skills/cold-email','skills/seo-audit']]);
 const msg=await page.getByRole('status').filter({hasText:'已导入'}).textContent();assert.match(msg,/已导入 2 个 Skill：cold-email、seo-audit。在本项目启用后/);assert.match(msg,/跳过 1 个：brand-voice（已有同名的 Skill）/);
 await expect(row('sk-cold-email')).toBeVisible();await table.getByRole('button',{name:'cold-email'}).click();await expect(drawer.getByRole('link',{name:/来源：https:\/\/github\.com\/acme\/skills\/tree\/main\/skills\/cold-email/})).toHaveAttribute('target','_blank');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'新建 Skill'}).click();await dlg.getByRole('button',{name:'填链接'}).click();await dlg.getByLabel('Skill 的链接').fill('https://github.com/acme/skills/tree/main/skills/release-notes');await dlg.getByRole('button',{name:'读取'}).click();
 await expect(dlg.getByRole('status')).toContainText('release-notes · 1 个附带文件，跳过 1 个不是文字或太大的文件（logo.png）');if(shots)await page.screenshot({path:`${shots}/skills-link.png`});
 await dlg.getByRole('button',{name:'导入',exact:true}).click();await expect(dlg).toHaveCount(0);c=(await calls()).filter(x=>x.skill==='import').at(-1);assert.equal(c.source,'https://github.com/acme/skills/tree/main/skills/release-notes');assert.deepEqual(c.files.map(f=>f.path),['SKILL.md','refs/words.md']);
 await expect(drawer).toContainText('release-notes');await page.keyboard.press('Escape');
 // A row opens the drawer: body and files; look at a file, add one, remove one; edit in place; delete.
 await table.getByRole('button',{name:'research-report'}).click();await expect(drawer).toContainText('按 templates/report.md 的结构写');
 const files=drawer.getByRole('list',{name:'附带文件'});await files.getByRole('button',{name:'templates/report.md',exact:true}).click();await expect(files).toContainText('## 结论');
 if(shots){await page.waitForTimeout(400);await page.screenshot({path:`${shots}/skills-drawer.png`});}
 await drawer.getByLabel('添加附带文件').setInputFiles({name:'example.md',mimeType:'text/markdown',buffer:Buffer.from('# 例子')});await expect(drawer.getByRole('status')).toContainText('已添加 1 个文件');await expect(files).toContainText('example.md');
 await files.getByRole('button',{name:'删除 templates/report.md'}).click();await expect(drawer.getByRole('status')).toContainText('已删除 templates/report.md');await expect(files).not.toContainText('templates/report.md');
 await drawer.getByRole('button',{name:'编辑'}).click();await drawer.getByLabel('怎么做').fill('# 调研报告\n先写结论');await drawer.getByRole('button',{name:'保存'}).click();await expect(drawer.getByRole('status')).toContainText('已保存');await expect(drawer).toContainText('先写结论');
 c=(await calls()).filter(x=>x.skill==='update').at(-1);assert.deepEqual([c.skillId,c.name,c.body],['research-report','research-report','# 调研报告\n先写结论']);
 await drawer.getByRole('switch',{name:'在本项目启用'}).click();await expect(drawer).toContainText('本项目已启用');
 await drawer.getByRole('button',{name:'更多操作'}).click();await page.getByRole('menuitem',{name:'删除'}).click();await expect(page.getByRole('status')).toContainText('已删除 research-report');await expect(drawer).toHaveCount(0);await expect(row('research-report')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await open('&dark=1');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'fits 390');
 if(shots)await page.screenshot({path:`${shots}/skills-390.png`,fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS Skills: library with when-to-use, 做法 usage, files and a per-project switch; search and filter; turn on without opening; 新建 by filling in (name rule) or uploading a folder (text files only, hidden and binary skipped) or one SKILL.md or a link (read first; a repository lists every Skill to tick, filter and tick all, those already here marked; source kept); name clash reported; drawer with body, files (view, add, remove), edit in place, switch and delete; 390 dark without overflow. Mocked API only.');
}finally{await browser.close();fs.rmSync(folder,{recursive:true,force:true});}
