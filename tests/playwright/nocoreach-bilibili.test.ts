import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { z } from 'zod';
const statusSchema = z
  .object({
    connected: z.boolean(),
    configured: z.boolean(),
    revision: z.string().nullable(),
    total: z.number(),
    verifiedAt: z.string().nullable(),
    checking: z.boolean(),
    recent: z.array(
      z
        .object({
          id: z.string(),
          title: z.string().nullable(),
          completeness: z.string(),
          fromEarlierConfig: z.boolean(),
          sources: z.array(z.unknown()),
        })
        .passthrough(),
    ),
    lastRun: z
      .object({ ok: z.boolean(), errorCode: z.string().nullable() })
      .passthrough()
      .nullable(),
  })
  .passthrough();
type BilibiliStatus = z.infer<typeof statusSchema>;
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
const fixturesFile = process.env.NOCOREACH_BILIBILI_FIXTURES;
const controlFile = process.env.NOCOREACH_BILIBILI_MOCK_CONTROL;
const credentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
});
test.skip(
  !base || !credentialsFile || !fixturesFile || !controlFile,
  'Requires isolated Bilibili app, synthetic accounts and local collector control',
);
test.use({
  viewport: { width: 1440, height: 1000 },
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});
test.setTimeout(240_000);
test.describe.configure({ mode: 'serial' });

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
  context.request.post(`${base}/api/nocoreach/nrBilibili/${action}`, {
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
const panel = (page: Page) => page.locator('[data-bilibili-connection]');
const button = (page: Page, name: RegExp) =>
  panel(page).getByRole('button', { name });
async function open(page: Page) {
  await page.locator('[data-source-id="bilibili"]').getByRole('button').click();
  await expect(panel(page)).toBeVisible();
}
async function close(page: Page) {
  await page
    .getByRole('dialog', { name: /Connect Bilibili|接入 Bilibili/ })
    .getByRole('button', { name: /^Close$|^关闭$/ })
    .click();
  await expect(
    page.getByRole('dialog', { name: /Connect Bilibili|接入 Bilibili/ }),
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
      name: locale === 'en' ? 'English' : '简体中文',
      exact: true,
    })
    .click();
  await page.mouse.move(600, 300, { steps: 8 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}
async function chooseCollector(page: Page, name: string) {
  await panel(page).getByRole('combobox').click();
  await page.getByRole('option', { name, exact: true }).click();
}
async function configure(
  page: Page,
  collector = 'Synthetic Bilibili collector',
  terms = 'NocoBase',
  bvids = 'BV1MW421X7gM',
) {
  if (await button(page, /^Change$|^修改$/).count())
    await button(page, /^Change$|^修改$/).click();
  await chooseCollector(page, collector);
  await panel(page)
    .getByRole('textbox', { name: /^Search term$|^搜索词$/ })
    .fill(terms);
  await panel(page)
    .getByRole('textbox', { name: /BV IDs or video links|BV 号或视频链接/ })
    .fill(bvids);
  const saved = page.waitForResponse((r) =>
    r.url().endsWith('/nrBilibili/connect'),
  );
  await button(page, /^Save configuration$|^保存配置$/).click();
  expect((await saved).status()).toBe(200);
  await expect(button(page, /^Read now$|^立即读取$/)).toBeVisible();
}
async function collect(page: Page) {
  const result = page.waitForResponse((r) =>
    r.url().endsWith('/nrBilibili/sync'),
  );
  await button(page, /^Read now$|^立即读取$/).click();
  return result;
}

test('real app and SQLite: bilingual mock collection, persistence, errors, cancellation, projects and permissions', async ({
  page,
  context,
  browser,
}, info) => {
  const { admin, fixtures } = await accounts();
  await writeFile(controlFile!, JSON.stringify({ mode: 'success' }));
  await signIn(page, admin);
  const schema = await context.request.get(`${base}/api/swagger`);
  expect(schema.status()).toBe(200);
  await page.goto(`${base}/connections`);
  await language(page, 'zh');
  await open(page);
  await button(page, /^检查采集器$/).click();
  await expect(panel(page)).toContainText('OpenCLI 可用，平台尚未验证');
  await configure(page);
  expect((await collect(page)).status()).toBe(200);
  await expect(
    panel(page).getByRole('link', { name: 'NocoBase 合成公开视频' }),
  ).toBeVisible();
  const saved = await status(context);
  expect(saved).toMatchObject({ total: 1, lastRun: { ok: true, found: 1 } });
  expect(saved.recent[0]).toMatchObject({
    id: 'BV1MW421X7gM',
    completeness: 'video_metadata',
    views: 123,
    likes: 0,
  });
  expect(saved.recent[0].sources).toHaveLength(2);
  await page.screenshot({ path: info.outputPath('mock-zh-saved.png') });
  await close(page);
  await language(page, 'en');
  await open(page);
  await expect(panel(page)).toContainText('Recently collected videos');
  await expect(
    panel(page).getByRole('link', { name: 'NocoBase 合成公开视频' }),
  ).toBeVisible();
  await writeFile(controlFile!, JSON.stringify({ mode: 'security_block' }));
  expect((await collect(page)).status()).toBe(200);
  await expect(panel(page)).toContainText(
    'Bilibili requires verification or denied access. Collection has stopped.',
  );
  const failed = await status(context);
  expect(failed.total).toBe(saved.total);
  expect(failed.verifiedAt).toBe(saved.verifiedAt);
  expect(failed.recent).toEqual(saved.recent);
  await page.screenshot({
    path: info.outputPath('mock-en-error-retained.png'),
  });
  await writeFile(controlFile!, JSON.stringify({ mode: 'delay' }));
  const pending = collect(page);
  await expect(button(page, /^Stop collection$/)).toBeEnabled();
  await button(page, /^Stop collection$/).click();
  expect((await pending).status()).toBe(409);
  await expect.poll(async () => (await status(context)).checking).toBe(false);
  expect((await status(context)).recent).toEqual(saved.recent);
  await writeFile(controlFile!, JSON.stringify({ mode: 'success' }));
  await close(page);
  const switcher = page.getByRole('button', { name: /^Switch project$/ });
  await switcher.click();
  await page
    .getByRole('menuitem')
    .filter({ hasText: 'Bilibili isolated QA B' })
    .click();
  await expect(switcher).toContainText('Bilibili isolated QA B');
  expect(await status(context, 2)).toMatchObject({
    total: 0,
    configured: false,
    connected: false,
  });
  await switcher.click();
  await page
    .getByRole('menuitem')
    .filter({ hasText: 'Bilibili isolated QA A' })
    .click();
  await expect(switcher).toContainText('Bilibili isolated QA A');
  await page.goto(`${base}/connections`);
  await open(page);
  expect((await status(context)).recent).toEqual(saved.recent);
  await page.screenshot({ path: info.outputPath('mock-en-restored.png') });
  const member = fixtures.users.find((u) => u.role === 'member')!;
  const limited = await browser.newContext();
  try {
    const tab = await limited.newPage();
    await signIn(tab, member);
    await tab.goto(`${base}/connections`);
    await open(tab);
    await expect(
      panel(tab).getByRole('link', { name: 'NocoBase 合成公开视频' }),
    ).toBeVisible();
    for (const action of [
      /^Change$|^修改$/,
      /^Read now$|^立即读取$/,
      /^Disconnect$|^断开$/,
    ])
      await expect(button(tab, action)).toHaveCount(0);
    const session = (await (
      await limited.request.get(`${base}/api/auth/get-session`)
    ).json()) as { session: { id: string } };
    for (const action of ['connect', 'test', 'sync', 'cancel', 'disconnect'])
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
    body: JSON.stringify(
      { saved, failed, projectB: await status(context, 2) },
      null,
      2,
    ),
    contentType: 'application/json',
  });
});

test('a failed sync request stays visible after real status reads without replacing saved results', async ({
  page,
  context,
}, info) => {
  const { admin } = await accounts();
  await writeFile(controlFile!, JSON.stringify({ mode: 'success' }));
  await signIn(page, admin);
  await page.goto(`${base}/connections`);
  await language(page, 'en');
  await open(page);
  expect((await collect(page)).status()).toBe(200);
  for (const [fault, locale] of [
    ['http500', 'en'],
    ['network', 'en'],
    ['network', 'zh'],
  ] as const) {
    await close(page);
    await language(page, locale);
    await open(page);
    const saved = await status(context);
    expect(saved).toMatchObject({ total: 1, lastRun: { ok: true } });
    await page.route('**/nrBilibili/sync', (route) =>
      fault === 'http500'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { message: 'QA_SYNC_HTTP_FAILURE' },
            }),
          })
        : route.abort('failed'),
    );
    try {
      // Only the mutation fails. Status requests still reach the real app/SQLite.
      const refreshed = page.waitForResponse(
        (r) => r.url().endsWith('/nrBilibili/status') && r.status() === 200,
      );
      const failed =
        fault === 'http500'
          ? page.waitForResponse(
              (r) => r.url().endsWith('/nrBilibili/sync') && r.status() === 500,
            )
          : page.waitForEvent('requestfailed', (r) =>
              r.url().endsWith('/nrBilibili/sync'),
            );
      await button(page, /^Read now$|^立即读取$/).click();
      await failed;
      await refreshed;
      const failure = panel(page)
        .getByRole('alert')
        .filter({
          has: page.getByRole('button', {
            name: /^Reload status$|^重新载入状态$/,
          }),
        });
      // Let the successful status response render before checking the feedback.
      await page.evaluate(
        'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      );
      await expect(failure).toBeVisible();
      if (fault === 'http500')
        await expect(failure).toContainText('QA_SYNC_HTTP_FAILURE');
      if (fault === 'network') {
        const expectedMessage =
          locale === 'zh'
            ? '网络请求未完成，请检查网络连接后重试。'
            : 'The network request failed. Check your connection and try again.';
        await expect(failure).toContainText(expectedMessage);
        await expect(failure).not.toContainText('Failed to fetch');
      }
      const reloaded = page.waitForResponse(
        (r) => r.url().endsWith('/nrBilibili/status') && r.status() === 200,
      );
      await failure
        .getByRole('button', { name: /^Reload status$|^重新载入状态$/ })
        .click();
      await reloaded;
      await page.evaluate(
        'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      );
      await expect(failure).toBeVisible();
      // Exceed the prior reproduction window; the success read must not erase the error.
      await page.waitForTimeout(5200);
      if (fault === 'network')
        await expect(failure).toContainText(
          locale === 'zh'
            ? '网络请求未完成，请检查网络连接后重试。'
            : 'The network request failed. Check your connection and try again.',
        );
      const retained = await status(context);
      expect(retained.recent).toEqual(saved.recent);
      expect(retained.lastRun).toEqual(saved.lastRun);
      expect(retained.verifiedAt).toEqual(saved.verifiedAt);
      await expect(
        panel(page).getByRole('link', { name: 'NocoBase 合成公开视频' }),
      ).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`${fault}-${locale}-after-status.png`),
      });
      await info.attach(`${fault}-${locale}-preserved-failure`, {
        body: JSON.stringify({
          message: await failure.innerText(),
          saved,
          retained,
        }),
        contentType: 'application/json',
      });
    } finally {
      await page.unroute('**/nrBilibili/sync');
    }
    expect((await collect(page)).status()).toBe(200);
    await expect(
      panel(page).getByRole('button', {
        name: /^Reload status$|^重新载入状态$/,
      }),
    ).toHaveCount(0);
    const recovered = await status(context);
    expect(recovered.lastRun?.ok).toBe(true);
    expect(recovered.verifiedAt).not.toBe(saved.verifiedAt);
  }
});

test('stopping a collection keeps saved results without reporting a conflict in either language', async ({
  page,
  context,
}, info) => {
  const { admin } = await accounts();
  await signIn(page, admin);
  await page.goto(`${base}/connections`);
  await language(page, 'en');
  await open(page);
  await writeFile(controlFile!, JSON.stringify({ mode: 'success' }));
  expect((await collect(page)).status()).toBe(200);
  for (const locale of ['zh', 'en'] as const) {
    await close(page);
    await language(page, locale);
    await open(page);
    const saved = await status(context);
    expect(saved.lastRun?.ok).toBe(true);
    await writeFile(controlFile!, JSON.stringify({ mode: 'delay' }));
    const pending = collect(page);
    await expect(button(page, /^Stop collection$|^停止读取$/)).toBeEnabled();
    const cancel = page.waitForResponse((r) =>
      r.url().endsWith('/nrBilibili/cancel'),
    );
    await button(page, /^Stop collection$|^停止读取$/).click();
    expect((await cancel).status()).toBe(200);
    const stopped = await pending;
    expect(stopped.status()).toBe(409);
    const payload = (await stopped.json()) as { error: { message: string } };
    expect(payload.error.message).toBe(
      'Bilibili 读取已停止，已保存数据保持不变。',
    );
    await expect.poll(async () => (await status(context)).checking).toBe(false);
    await expect(button(page, /^Read now$|^立即读取$/)).toBeEnabled();
    await page.waitForTimeout(5200);
    await expect(button(page, /^Reload status$|^重新载入状态$/)).toHaveCount(0);
    await expect(panel(page)).not.toContainText('配置已变更或操作正在运行');
    await expect(panel(page)).not.toContainText(
      'The configuration changed or an operation is running',
    );
    const reloaded = page.waitForResponse(
      (r) => r.url().endsWith('/nrBilibili/status') && r.status() === 200,
    );
    await button(page, /^Refresh$|^刷新$/).click();
    await reloaded;
    await expect(button(page, /^Reload status$|^重新载入状态$/)).toHaveCount(0);
    const retained = await status(context);
    expect(retained.recent).toEqual(saved.recent);
    expect(retained.lastRun).toEqual(saved.lastRun);
    expect(retained.verifiedAt).toEqual(saved.verifiedAt);
    await page.screenshot({
      animations: 'disabled',
      path: info.outputPath(`cancel-${locale}-no-conflict.png`),
    });
    await info.attach(`cancel-${locale}`, {
      body: JSON.stringify({
        cancelStatus: 200,
        syncStatus: 409,
        serverMessage: payload.error.message,
        saved,
        retained,
      }),
      contentType: 'application/json',
    });
    await writeFile(controlFile!, JSON.stringify({ mode: 'success' }));
    expect((await collect(page)).status()).toBe(200);
    const recovered = await status(context);
    expect(recovered.lastRun?.ok).toBe(true);
    expect(recovered.verifiedAt).not.toBe(saved.verifiedAt);
  }
  // A real second operation owns the collector; its concurrent request must still be a visible conflict.
  await writeFile(controlFile!, JSON.stringify({ mode: 'delay' }));
  const background = call(context, 'sync');
  await expect.poll(async () => (await status(context)).checking).toBe(true);
  expect((await collect(page)).status()).toBe(409);
  await expect(panel(page)).toContainText(
    'The configuration changed or an operation is running. Reload its status.',
  );
  const running = await status(context);
  expect(
    (await call(context, 'cancel', { requestId: running.requestId })).status(),
  ).toBe(200);
  expect((await background).status()).toBe(409);
  await expect.poll(async () => (await status(context)).checking).toBe(false);
  await button(page, /^Reload status$/).click();
  await expect(panel(page)).toContainText(
    'The configuration changed or an operation is running. Reload its status.',
  );
  await writeFile(controlFile!, JSON.stringify({ mode: 'success' }));
  expect((await collect(page)).status()).toBe(200);
  await expect(button(page, /^Reload status$/)).toHaveCount(0);
});

test('a delayed old-session409 cannot dismiss the new admin confirmation in the real application', async ({
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
  await signIn(tab, member);
  await page.bringToFront();
  let seen = 0,
    sessionReads = 0;
  const held = deferred(),
    release = deferred();
  const outcomes: number[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/auth/get-session')) sessionReads++;
  });
  await page.route('**/nrBilibili/disconnect', async (route) => {
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
      page.getByRole('dialog', { name: /Connect Bilibili|接入 Bilibili/ }),
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

test('optional anonymous HTTP: public Bilibili search through app storage and UI, stopping on refusal', async ({
  page,
  context,
}, info) => {
  test.skip(
    process.env.NOCOREACH_BILIBILI_LIVE !== '1',
    'Public upstream explicitly opt-in',
  );
  const { admin } = await accounts();
  await signIn(page, admin);
  await page.goto(`${base}/connections`);
  await open(page);
  await configure(page, 'Public Bilibili anonymous HTTP', 'NocoBase', '');
  const response = await collect(page);
  expect(response.status()).toBe(200);
  const first = await status(context);
  const report: {
    outcome: string;
    search: BilibiliStatus;
    detail?: BilibiliStatus;
  } = { outcome: 'public-collection-not-verified', search: first };
  if (first.lastRun?.ok) {
    const video = first.recent.find((v) => !v.fromEarlierConfig);
    expect(video).toBeTruthy();
    await expect(
      panel(page).getByRole('link', {
        name: video!.title || video!.id,
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({ path: info.outputPath('live-search-saved.png') });
    await configure(page, 'Public Bilibili anonymous HTTP', '', video!.id);
    expect((await collect(page)).status()).toBe(200);
    report.detail = await status(context);
    report.outcome = 'public-detail-not-verified';
    if (report.detail.lastRun?.ok) {
      expect(
        report.detail.recent.some(
          (v) =>
            v.id === video!.id &&
            v.completeness === 'video_metadata' &&
            !v.fromEarlierConfig,
        ),
      ).toBe(true);
      report.outcome = 'search-and-detail-persisted-and-rendered';
    }
  }
  await page.screenshot({ path: info.outputPath('live-final-state.png') });
  await info.attach('live-app-result', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  await writeFile(
    info.outputPath('live-app-result.json'),
    JSON.stringify(report, null, 2),
  );
  test.skip(
    report.outcome !== 'search-and-detail-persisted-and-rendered',
    `Public collection unverified: ${(report.detail || report.search).lastRun?.errorCode || 'no confirmed results'}`,
  );
});
