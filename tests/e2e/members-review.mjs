import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/portal/package.json',import.meta.url));const {chromium,expect}=require('@playwright/test');
// 设置 · 成员 and roles (apps/portal/tests/s1/members.html, mocked API only): 管理员 pick roles (not NocoBase admins, not
// themselves); 成员 see the list and settings pages without the change buttons; someone not joined sees one screen.
const base=process.env.NR_FIXTURE_URL||'http://127.0.0.1:14320';
const browser=await chromium.launch({headless:true,executablePath:process.env.NR_CHROMIUM_PATH});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=()=>page.evaluate(()=>window.__calls);
 // 管理员
 await page.goto(`${base}/tests/s1/members.html`);await expect(page.getByRole('heading',{name:'成员',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'去 NocoBase 添加用户'})).toHaveAttribute('href','/settings/users-permissions/users');
 await expect(page.locator('[data-admin-only]')).toHaveCount(0);
 assert.deepEqual(await page.locator('[data-member]').evaluateAll(l=>l.map(e=>e.getAttribute('data-member'))),['1','2','3','9']);
 const row=id=>page.locator(`[data-member="${id}"]`);
 await expect(row('1')).toContainText('Esther（你）');await expect(row('1').getByRole('combobox')).toHaveCount(0);await expect(row('1')).toContainText('管理员');
 await row('1').getByRole('button',{name:'为什么不能改'}).hover();await expect(page.locator('[data-info-content]')).toContainText('NocoBase 管理员，固定是管理员');
 await expect(row('9').getByRole('combobox',{name:'Mia 的角色'})).toHaveValue('');
 await row('9').getByRole('combobox').selectOption('member');await expect(page.getByText('Mia 现在是成员')).toBeVisible();
 assert.deepEqual((await calls()).at(-1),{userId:'9',role:'member'});
 assert.deepEqual(await page.locator('[data-member]').evaluateAll(l=>l.map(e=>e.getAttribute('data-member'))),['1','3','2','9'],'管理员 first, then 成员');
 await row('2').getByRole('combobox').selectOption('');await expect(page.getByText('Lin 已移出，不能再使用 NocoReach')).toBeVisible();
 assert.deepEqual((await calls()).at(-1),{userId:'2',role:null});
 await page.screenshot({path:'/tmp/nr-members-admin.png'});
 // 成员: the list without selects; 分析规则 without switches or 修改
 await page.goto(`${base}/tests/s1/members.html?as=member`);await expect(page.locator('[data-admin-only]')).toHaveText('只有管理员能修改这里的设置');
 await expect(page.getByRole('combobox')).toHaveCount(0);await expect(page.getByRole('link',{name:'去 NocoBase 添加用户'})).toHaveCount(0);
 await expect(row('2')).toContainText('Lin（你）');await expect(row('9')).toContainText('未加入');
 await page.goto(`${base}/tests/s1/members.html?as=member&page=rules`);await expect(page.getByRole('heading',{name:'分析规则',exact:true})).toBeVisible();
 await expect(page.locator('[data-admin-only]')).toBeVisible();await expect(page.getByRole('button',{name:'修改'})).toHaveCount(0);await expect(page.getByRole('switch').first()).toBeDisabled();
 await expect(page.locator('[data-rule="gsc-low-ctr"]')).toContainText('曝光至少 500');
 await page.screenshot({path:'/tmp/nr-members-member-rules.png'});
 // 通知: the bell shows the unread count; a message opens its page and is marked read; 全部已读.
 await page.goto(`${base}/tests/s1/members.html`);const bell=page.getByRole('button',{name:'通知，1 条未读'});await expect(bell).toBeVisible();await bell.click();
 const inbox=page.getByRole('list',{name:'通知列表'});await expect(inbox.locator('li')).toHaveCount(2);await expect(inbox.locator('[data-unread]')).toContainText('T-12 等你看方案');await page.screenshot({path:'/tmp/nr-bell.png'});
 await inbox.locator('[data-message="m1"]').click();await expect(page.getByRole('heading',{name:'分析规则',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'通知',exact:true})).toBeVisible();
 assert.deepEqual((await calls()).filter(c=>c.read),[{read:'m1'}]);
 // not joined
 await page.goto(`${base}/tests/s1/members.html?as=none`);await expect(page.locator('[data-not-joined]')).toContainText('你还没有加入 NocoReach');
 await expect(page.getByRole('button',{name:'退出登录'})).toBeVisible();await expect(page.getByRole('heading',{name:'成员',exact:true})).toHaveCount(0);
 await page.screenshot({path:'/tmp/nr-members-none.png'});
 assert.deepEqual(errors,[]);
 console.log('members review passed');
}finally{await browser.close();}
