import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { z } from 'zod';
const statusSchema = z
  .object({
    configured: z.boolean(),
    connected: z.boolean(),
    revision: z.string().nullable(),
    total: z.number(),
    syncing: z.boolean(),
    autoSync: z.boolean(),
    videos: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          likes: z.number().nullable(),
          comments: z.number().nullable(),
          transcript: z
            .object({
              status: z.string(),
              text: z.string(),
              truncated: z.boolean(),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
    lastSync: z
      .object({ ok: z.boolean(), errors: z.array(z.string()) })
      .passthrough()
      .nullable(),
  })
  .passthrough();
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve() };
}

// Opt-in against a fresh, disposable app. Credentials come only from its setup.
const base = process.env.APP_URL?.replace(/\/$/, '') ?? '';
const credentialsFile = process.env.NOCOREACH_TEST_CREDENTIALS;
const fixturesFile = process.env.NOCOREACH_YOUTUBE_FIXTURES;
const controlFile = process.env.NOCOREACH_YOUTUBE_MOCK_CONTROL;
const credentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
});
test.skip(
  !base || !credentialsFile || !fixturesFile || !controlFile,
  'Requires isolated YouTube app, synthetic accounts and local collector control',
);
test.use({
  viewport: { width: 1440, height: 1000 },
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});
test.setTimeout(240_000);
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page }) => {
  page.setDefaultTimeout(15000);
});
test.afterEach(async ({ page, browser }, info) => {
  await info.attach('browser-version', {
    body: browser.version(),
    contentType: 'text/plain',
  });
  await writeFile(
    info.outputPath('final-dom.txt'),
    await page.locator('body').innerText(),
  ).catch(() => {});
  if (info.status !== info.expectedStatus) {
    await page
      .screenshot({ path: info.outputPath('failure.png') })
      .catch(() => {});
    await writeFile(
      info.outputPath('failure-dom.txt'),
      await page.locator('body').innerText(),
    ).catch(() => {});
  }
});

async function accounts() {
  return {
    admin: credentialsSchema.parse(
      JSON.parse(await readFile(credentialsFile!, 'utf8')),
    ),
    fixtures: z
      .object({
        users: z.array(
          credentialsSchema.extend({ id: z.string(), role: z.string() }),
        ),
      })
      .parse(JSON.parse(await readFile(fixturesFile!, 'utf8'))),
  };
}
async function signIn(
  page: Page,
  credentials: z.infer<typeof credentialsSchema>,
) {
  await page.goto(`${base}/login`);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page
      .getByLabel(/Username or email|用户名或邮箱/, { exact: true })
      .fill(credentials.username);
    await page
      .getByLabel(/Password|密码/, { exact: true })
      .fill(credentials.password);
    const response = page.waitForResponse((r) =>
      r.url().includes('/api/auth/sign-in/'),
    );
    await page.getByRole('button', { name: /^Sign in$|^登录$/ }).click();
    const result = await response;
    if (result.status() === 429) {
      const seconds = Number(result.headers()['retry-after'] || 60);
      expect(seconds).toBeLessThanOrEqual(120);
      await page.waitForTimeout((seconds + 1) * 1000);
      continue;
    }
    expect(result.status()).toBe(200);
    await page.waitForURL((url) => !url.pathname.endsWith('/login'));
    return;
  }
  throw new Error('Synthetic login remains rate limited; no bypass attempted');
}
const call = (
  context: BrowserContext,
  action: string,
  values: object = {},
  headers: Record<string, string> = {},
) =>
  context.request.post(`${base}/api/nocoreach/nrYouTube/${action}`, {
    headers: { origin: new URL(base).origin, ...headers },
    data: { projectId: 1, ...values },
  });
async function status(context: BrowserContext, projectId = 1) {
  const response = await call(context, 'status', { projectId });
  expect(response.status()).toBe(200);
  return statusSchema.parse(
    ((await response.json()) as { data: unknown }).data,
  );
}
const panel = (page: Page) => page.locator('[data-youtube-connection]');
const button = (page: Page, name: RegExp) =>
  panel(page).getByRole('button', { name });
async function open(page: Page) {
  await page.locator('[data-source-id="youtube"]').getByRole('button').click();
  await expect(panel(page)).toBeVisible();
}
async function close(page: Page) {
  await page
    .getByRole('dialog', { name: /Connect YouTube|接入 YouTube/ })
    .getByRole('button', { name: /^Close$|^关闭$/ })
    .click();
  await expect(
    page.getByRole('dialog', { name: /Connect YouTube|接入 YouTube/ }),
  ).toHaveCount(0);
  // A stationary mouse can hover the account menu beneath the Sheet's Close.
  await page.mouse.move(700, 300, { steps: 12 });
  await expect
    .poll(() =>
      page.evaluate<string>('getComputedStyle(document.body).pointerEvents'),
    )
    .not.toBe('none');
}
async function language(page: Page, locale: 'en' | 'zh') {
  await page
    .getByRole('button', { name: /Open account menu|打开账户菜单/ })
    .click();
  await page.getByRole('menuitem', { name: /Language|语言/ }).hover();
  await page
    .getByRole('menuitemradio', {
      name: locale === 'en' ? 'English' : '中文',
      exact: true,
    })
    .click();
  await page.mouse.move(600, 300, { steps: 8 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}
async function configure(page: Page, terms = 'NocoBase 合成研究') {
  if (await button(page, /^Change$|^修改$/).count())
    await button(page, /^Change$|^修改$/).click();
  await panel(page)
    .getByRole('textbox', { name: /YouTube keywords|YouTube 搜索词/ })
    .fill(terms);
  const response = page.waitForResponse((r) =>
    r.url().endsWith('/nrYouTube/connect'),
  );
  await button(page, /^Save and read$|^保存并读取$/).click();
  expect((await response).status()).toBe(200);
}
async function collect(page: Page) {
  const response = page.waitForResponse((r) =>
    r.url().endsWith('/nrYouTube/sync'),
  );
  await button(page, /^Read now$|^立即读取$/).click();
  return response;
}
test('real app and SQLite: bilingual upstream fixtures, captions, editing, cancellation, projects and permissions', async ({
  page,
  context,
  browser,
}, info) => {
  const { admin, fixtures } = await accounts();
  await writeFile(controlFile!, JSON.stringify({ mode: 'success' }));
  await signIn(page, admin);
  await page.goto(`${base}/connections`);
  await language(page, 'zh');
  await open(page);
  await button(page, /^保存并读取$/).click();
  const terms = panel(page).getByRole('textbox', {
    name: 'YouTube 搜索词',
    exact: true,
  });
  await expect(terms).toBeFocused();
  await expect(panel(page)).toContainText('请填写搜索词或 YouTube 视频链接');
  await terms.pressSequentially('NocoBase ', { delay: 35 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition', {
    text: '合成研究',
    selectionStart: 4,
    selectionEnd: 4,
  });
  await cdp.send('Input.insertText', { text: '合成研究' });
  await cdp.detach();
  await expect(terms).toHaveValue('NocoBase 合成研究');
  await expect(terms).toBeFocused();
  const connected = page.waitForResponse((r) =>
    r.url().endsWith('/nrYouTube/connect'),
  );
  await button(page, /^保存并读取$/).click();
  expect((await connected).status()).toBe(200);
  await expect.poll(async () => (await status(context)).total).toBe(4);
  await expect(
    panel(page).getByRole('link', { name: 'Synthetic manual 分析。任务。' }),
  ).toBeVisible();
  const saved = await status(context);
  expect(saved.lastSync).toMatchObject({ ok: true });
  expect(saved.videos.map((v) => v.transcript.status)).toEqual([
    'manual',
    'automatic',
    'missing',
    'failed',
  ]);
  expect(saved.videos[0]).toMatchObject({ likes: 0, comments: null });
  expect(saved.videos[1].transcript).toMatchObject({ truncated: true });
  expect(saved.videos[1].transcript.text).toHaveLength(30000);
  await page.screenshot({ path: info.outputPath('mock-zh-captions.png') });
  await button(page, /^修改$/).click();
  const draft = panel(page).getByRole('textbox', {
    name: 'YouTube 搜索词',
    exact: true,
  });
  await draft.fill('Replacement draft');
  await button(page, /^保存并读取$/).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(1);
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^Cancel$|^取消$/ })
    .click();
  await expect(draft).toHaveValue('Replacement draft');
  expect((await status(context)).videos).toEqual(saved.videos);
  await button(page, /^取消$/).click();
  await button(page, /^断开$/).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^Cancel$|^取消$/ })
    .click();
  expect((await status(context)).configured).toBe(true);
  await close(page);
  await language(page, 'en');
  await open(page);
  await expect(panel(page)).toContainText('Manual captions');
  await expect(panel(page)).toContainText('Automatic captions');
  await expect(
    panel(page).getByRole('link', { name: 'Synthetic manual 分析。任务。' }),
  ).toBeVisible();
  await writeFile(controlFile!, JSON.stringify({ mode: 'restricted' }));
  expect((await collect(page)).status()).toBe(200);
  await expect.poll(async () => (await status(context)).syncing).toBe(false);
  await expect(panel(page)).toContainText(
    'YouTube requires sign-in or verification, or has restricted requests.',
  );
  const failed = await status(context);
  expect(failed.videos).toEqual(saved.videos);
  await page.screenshot({
    path: info.outputPath('mock-en-error-retained.png'),
  });
  await writeFile(controlFile!, JSON.stringify({ mode: 'slow' }));
  expect((await collect(page)).status()).toBe(200);
  await button(page, /^Stop and pause automatic reads$/).click();
  await expect.poll(async () => (await status(context)).syncing).toBe(false);
  expect((await status(context)).videos).toEqual(saved.videos);
  expect((await status(context)).autoSync).toBe(false);
  await writeFile(controlFile!, JSON.stringify({ mode: 'success' }));
  await close(page);
  const switcher = page.getByRole('button', { name: /^Switch project$/ });
  await switcher.click();
  await page
    .getByRole('menuitem')
    .filter({ hasText: 'YouTube isolated QA B' })
    .click();
  await expect(switcher).toContainText('YouTube isolated QA B');
  await page.goto(`${base}/connections`);
  await open(page);
  await expect(
    panel(page).getByRole('textbox', {
      name: 'YouTube keywords',
      exact: true,
    }),
  ).toHaveValue('');
  expect(await status(context, 2)).toMatchObject({
    configured: false,
    total: 0,
  });
  await close(page);
  await switcher.click();
  await page
    .getByRole('menuitem')
    .filter({ hasText: 'YouTube isolated QA A' })
    .click();
  await page.goto(`${base}/connections`);
  await open(page);
  expect((await status(context)).videos).toEqual(saved.videos);
  await close(page);
  await page.getByRole('button', { name: /^Appearance$/ }).click();
  await page.getByText('Dark', { exact: true }).click();
  await expect(page.getByRole('radio', { name: /^Dark$/ })).toBeChecked();
  await page.keyboard.press('Escape');
  await page.mouse.move(600, 300, { steps: 8 });
  await expect
    .poll(() => page.evaluate<string>('document.documentElement.className'))
    .toContain('dark');
  await page.setViewportSize({ width: 375, height: 900 });
  await open(page);
  await expect
    .poll(() =>
      page.evaluate<boolean>(
        'document.documentElement.scrollWidth <= window.innerWidth',
      ),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath('mock-mobile-dark.png') });
  const limited = await browser.newContext();
  try {
    const tab = await limited.newPage();
    await signIn(
      tab,
      fixtures.users.find((u) => u.role === 'member')!,
    );
    await tab.goto(`${base}/connections`);
    await open(tab);
    await expect(
      panel(tab).getByRole('link', { name: 'Synthetic manual 分析。任务。' }),
    ).toBeVisible();
    for (const name of [
      /^Change$|^修改$/,
      /^Read now$|^立即读取$/,
      /^Disconnect$|^断开$/,
    ])
      await expect(button(tab, name)).toHaveCount(0);
    const session = (await (
      await limited.request.get(`${base}/api/auth/get-session`)
    ).json()) as { session: { id: string } };
    for (const action of ['connect', 'sync', 'cancel', 'disconnect'])
      expect(
        (
          await call(
            limited,
            action,
            { revision: saved.revision },
            { 'X-NocoReach-Confirmation-Session': session.session.id },
          )
        ).status(),
      ).toBe(403);
    await limited.request.post(`${base}/api/auth/sign-out`, {
      headers: { origin: new URL(base).origin },
      data: {},
    });
    expect((await call(limited, 'status')).status()).toBe(401);
  } finally {
    await limited.close();
  }
  await info.attach('mock-app-state', {
    body: JSON.stringify({ saved, failed, projectB: await status(context, 2) }),
    contentType: 'application/json',
  });
});
for (const identity of ['new-admin', 'same-admin-new-session'] as const) {
  test(`a delayed old-session409 cannot dismiss ${identity} confirmation in the real application`, async ({
    page,
    context,
  }, info) => {
    const { admin, fixtures } = await accounts();
    const member = fixtures.users.find((u) => u.role === 'member')!;
    await signIn(page, admin);
    const granted = await context.request.post(
      `${base}/api/nocoreach/nrMembers/setRole`,
      {
        headers: { origin: new URL(base).origin },
        data: { userId: member.id, role: 'admin' },
      },
    );
    expect(granted.status()).toBe(200);
    await page.goto(`${base}/connections`);
    await open(page);
    await button(page, /^Disconnect$|^断开$/).click();
    const tab = await context.newPage();
    await tab.goto(base);
    await tab
      .getByRole('button', { name: /Open account menu|打开账户菜单/ })
      .click();
    await tab.getByRole('menuitem', { name: /Sign out|退出登录/ }).click();
    await tab.waitForURL((url) => url.pathname.endsWith('/login'));
    await signIn(tab, identity === 'new-admin' ? member : admin);
    await page.bringToFront();
    let seen = 0,
      sessionReads = 0;
    const held = deferred(),
      release = deferred();
    const outcomes: number[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/get-session')) sessionReads++;
    });
    await page.route('**/nrYouTube/disconnect', async (route) => {
      const response = await route.fetch();
      outcomes.push(response.status());
      if (++seen === 1) {
        held.resolve();
        await release.promise;
      }
      await route.fulfill({ response });
    });
    try {
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: /^Disconnect$|^断开$/ })
        .click();
      await held.promise;
      expect(outcomes).toEqual([409]);
      await close(page);
      await open(page);
      await button(page, /^Disconnect$|^断开$/).click();
      // This active replacement panel receives a normal409 and refreshes the real provider.
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: /^Disconnect$|^断开$/ })
        .click();
      await expect.poll(() => sessionReads).toBe(1);
      await expect(
        page.getByRole('dialog', { name: /Connect YouTube|接入 YouTube/ }),
      ).toHaveCount(0);
      await page.mouse.move(700, 300, { steps: 10 });
      await open(page);
      await button(page, /^Disconnect$|^断开$/).click();
      const newDialog = page.getByRole('alertdialog');
      await expect(newDialog).toBeVisible();
      release.resolve();
      await page.waitForTimeout(600);
      expect(sessionReads).toBe(1);
      await expect(newDialog).toBeVisible();
      expect((await status(context)).connected).toBe(true);
      await page.screenshot({
        path: info.outputPath('new-owner-survives-late409.png'),
      });
      await newDialog
        .getByRole('button', { name: /^Disconnect$|^断开$/ })
        .click();
      await expect
        .poll(async () => (await status(context)).connected)
        .toBe(false);
      expect(outcomes).toEqual([409, 409, 200]);
      await configure(page);
      await collect(page);
      await expect.poll(async () => (await status(context)).total).toBe(4);
      await info.attach('session-race', {
        body: JSON.stringify({
          outcomes,
          sessionReads,
          lateResponseExtraRefreshes: 0,
        }),
        contentType: 'application/json',
      });
    } finally {
      release.resolve();
      await page.unrouteAll({ behavior: 'wait' });
    }
  });
}
