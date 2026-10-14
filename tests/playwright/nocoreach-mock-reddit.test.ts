import { readFile } from 'node:fs/promises';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { z } from 'zod';
import type { MockScenario } from '../../app-plugins/nocoreach-mock/server/types.js';

const expect = baseExpect.configure({ timeout: 45000 });
const base = process.env.APP_URL?.replace(/\/$/, '') ?? '';
const credentialsFile = process.env.NOCOREACH_TEST_CREDENTIALS;
test.skip(
  !base || !credentialsFile || process.env.NOCOREACH_MOCK_ACCEPTANCE !== 'true',
  'Requires an explicitly isolated mock app and its synthetic credentials',
);
test.use({
  viewport: { width: 1440, height: 1000 },
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});
test.setTimeout(480_000);

// Scenario setup uses the application's authoritative Profile API; the old URL is only a redirect.
async function settings(page: Page, scenario: MockScenario, enabled = true) {
  await page.goto(`${base}/connections`);
  const projectId = await page.evaluate(
    () => localStorage.getItem('nocoreach:project') || '1',
  );
  const request = async <T>(
    action: string,
    values: object = {},
  ): Promise<T> => {
    const response = await page.request.post(
      `${base}/api/nocoreach/nrProxyProfiles/${action}`,
      {
        headers: { origin: new URL(base).origin },
        data: values,
      },
    );
    expect(response.status()).toBe(200);
    return (await response.json()).data;
  };
  const capabilities = await request<{ mockEnabled: boolean }>('capabilities');
  expect(capabilities.mockEnabled).toBe(true);
  type Profile = { id: string; name: string; revision: number };
  const name = `Reddit acceptance ${projectId}`;
  const current = (await request<Profile[]>('list')).find(
    (profile) => profile.name === name,
  );
  const saved = await request<Profile>('save', {
    ...(current ? { id: current.id, revision: current.revision } : {}),
    kind: 'mock',
    name,
    mock: {
      scenario,
      seed: `reddit-acceptance-${projectId}`,
      clock: '2026-09-20T00:00:00.000Z',
    },
  });
  await request('selectAll', {
    projectId,
    profileId: enabled ? saved.id : null,
  });
}
async function language(page: Page, name: string) {
  await page
    .getByRole('button', { name: /Open account menu|打开账户菜单/ })
    .click();
  await page.getByRole('menuitem', { name: /Language|语言/ }).hover();
  await page.getByRole('menuitemradio', { name, exact: true }).click();
  await page.keyboard.press('Escape');
}
async function connect(page: Page, term: string) {
  await page.goto(`${base}/connections?source=reddit`);
  await expect(
    page.getByRole('button', {
      name: /^Stop$|^停止$|^Connect and start searching$|^接入并开始查找$/,
    }),
  ).toBeVisible();
  const stop = page.getByRole('button', { name: /^Stop$|^停止$/, exact: true });
  if (await stop.isVisible()) {
    await stop.click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^Cancel$|^取消$/ })
      .click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(stop).toBeVisible();
    await stop.click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^Stop$|^停止$/ })
      .click();
  }
  await page.getByLabel(/^Product name$|^产品名$/).fill(term);
  await page
    .getByRole('button', {
      name: /^Connect and start searching$|^接入并开始查找$/,
    })
    .click();
  await expect(
    page.getByRole('button', { name: /^Search now$|^立即查找$/ }),
  ).toBeEnabled();
}

test('Reddit failures stay visible, preserve successful history, and recover with a fresh query', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(45000);
  const credentials = z
    .object({ username: z.string(), password: z.string() })
    .parse(JSON.parse(await readFile(credentialsFile!, 'utf8')));
  await page.goto(`${base}/login`);
  await page
    .getByLabel(/Username or email|用户名或邮箱/, { exact: true })
    .fill(credentials.username);
  await page
    .getByLabel(/Password|密码/, { exact: true })
    .fill(credentials.password);
  await page.getByRole('button', { name: /^Sign in$|^登录$/ }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
  await settings(page, 'normal');
  await language(page, 'English');
  // The disposable app is bootstrapped with project 1; configure the documented fake account through its real UI if needed.
  const keywordStatus = page.waitForResponse((r) =>
    r.url().endsWith('/nrKeywords/status'),
  );
  await page.goto(`${base}/connections?source=keywords`);
  const configured = (await (await keywordStatus).json()).data.configured;
  const login = page.getByLabel('DataForSEO API Login');
  await expect(page.locator('#dataforseo')).toBeVisible();
  if (!configured) {
    await login.fill('demo@nocobloom.example');
    await page
      .getByLabel('DataForSEO API Password')
      .fill('nocobloom-demo-password');
    await page
      .locator('#dataforseo')
      .getByRole('button', { name: 'Save', exact: true })
      .click();
  }
  await page
    .getByRole('button', { name: 'Verify connection', exact: true })
    .click();
  await expect(
    page.getByText('Account credentials verified.', { exact: true }),
  ).toBeVisible();
  const term = `NocoBloom ${Date.now()}`;
  // Wait for the real connection state before deciding whether to stop the previous test source.
  await page.goto(`${base}/connections?source=reddit`);
  await expect(
    page.getByRole('button', { name: /^Stop$|^Connect and start searching$/ }),
  ).toBeVisible();
  await connect(page, term);
  const read = async (resource: string, action: string) => {
    const response = await page.request.post(
      `${base}/api/nocoreach/${resource}/${action}`,
      { headers: { origin: new URL(base).origin }, data: { projectId: '1' } },
    );
    expect(response.status()).toBe(200);
    return (await response.json()).data;
  };
  await expect
    .poll(async () => (await read('nrReddit', 'status')).checking)
    .toBe(false);
  const good = await read('nrReddit', 'status');
  expect(good.lastRun.ok).toBe(true);
  expect(good.total).toBeGreaterThan(0);
  expect(
    (await read('nrHealth', 'list')).items.find(
      (i: { id: string }) => i.id === 'reddit',
    ).dataThrough,
  ).toBe('2026-09-20');
  // The first run searches all indexed posts; the next run uses a distinct recent-month query and cannot hit its cache.
  await settings(page, 'error');
  await page.goto(`${base}/data/reddit`);
  await page.getByRole('button', { name: 'Search now', exact: true }).click();
  await expect(
    page.locator('[data-slot="toast"][data-type="error"]'),
  ).toContainText('Reddit search did not complete');
  await expect(page.getByRole('alert')).toContainText(
    'Reddit search did not complete',
  );
  await page.screenshot({
    path: testInfo.outputPath('failed-en.png'),
    fullPage: true,
  });
  const failed = await read('nrReddit', 'status');
  const health = (await read('nrHealth', 'list')).items.find(
    (i: { id: string }) => i.id === 'reddit',
  );
  expect(failed.lastRun.ok).toBe(false);
  expect(failed.total).toBe(good.total);
  expect(health.lastSuccessAt).toBe(good.lastRun.at);
  expect(health.dataThrough).toBe('2026-09-20');
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(
    'Reddit search did not complete',
  );
  await language(page, '中文');
  await expect(page.getByRole('alert')).toContainText('Reddit 查找未完成');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: testInfo.outputPath('failed-zh-mobile.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await language(page, 'English');
  await page.goto(`${base}/connections?source=reddit`);
  await expect(page.getByRole('alert')).toContainText(
    'Reddit search did not complete',
  );
  await settings(page, 'normal');
  await connect(page, `${term} recovery`);
  await expect
    .poll(async () => (await read('nrReddit', 'status')).checking)
    .toBe(false);
  expect((await read('nrReddit', 'status')).lastRun.ok).toBe(true);
  await page.goto(`${base}/data/reddit`);
  await expect(
    page.getByRole('button', { name: 'Search now', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Search now', exact: true }).click();
  await expect(
    page.locator('[data-slot="toast"][data-type="success"]'),
  ).toContainText('No new posts');
  await page.screenshot({
    path: testInfo.outputPath('recovered-en.png'),
    fullPage: true,
  });
});

test('disabled project keeps the upstream block and shows an actionable explanation', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(45000);
  const credentials = z
    .object({ username: z.string(), password: z.string() })
    .parse(JSON.parse(await readFile(credentialsFile!, 'utf8')));
  await page.goto(`${base}/login`);
  await page
    .getByLabel(/Username or email|用户名或邮箱/, { exact: true })
    .fill(credentials.username);
  await page
    .getByLabel(/Password|密码/, { exact: true })
    .fill(credentials.password);
  await page.getByRole('button', { name: /^Sign in$|^登录$/ }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
  await settings(page, 'normal', false);
  await language(page, 'English');
  await page.goto(`${base}/connections?source=github`);
  await page
    .getByLabel('Repository link', { exact: true })
    .fill('https://github.com/nocobloom/nocobloom');
  const pending = page.waitForResponse((r) =>
    r.url().endsWith('/nrGitHub/preview'),
  );
  await page
    .getByRole('button', { name: 'Read repository', exact: true })
    .click();
  const response = await pending;
  expect(response.status()).toBe(409);
  expect((await response.json()).error.message).toBe(
    'NR_MOCK_PROFILE_REQUIRED',
  );
  await expect(page.getByRole('alert')).toContainText(
    'Choose a simulated network profile',
  );
  await page.screenshot({
    path: testInfo.outputPath('disabled-en.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await language(page, '中文');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}/connections?source=github`);
  await page
    .getByLabel('仓库链接', { exact: true })
    .fill('https://github.com/nocobloom/nocobloom');
  await page.getByRole('button', { name: '读取仓库', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    '请先选择模拟网络 Profile',
  );
  await page.screenshot({
    path: testInfo.outputPath('disabled-zh-mobile.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),
  ).toBe(true);
});
