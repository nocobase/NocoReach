import { expect, test } from '@playwright/test';

// Opt in against a dedicated read-only demo, using its public quick sign-in.
const base = process.env.APP_URL?.replace(/\/$/u, '') ?? '';
test.skip(
  process.env.NOCOREACH_DEMO_BROWSER_QA !== '1' || !base,
  'Requires NOCOREACH_DEMO_BROWSER_QA=1 and APP_URL for a dedicated demo',
);
test.use({
  locale: 'zh-CN',
  viewport: { width: 1440, height: 1000 },
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});

test('demo refusals keep task inputs and show only the shared toast', async ({
  page,
  context,
}, testInfo) => {
  const status = await context.request.get(`${base}/api/demoMode/status`);
  expect((await status.json()).data.enabled).toBe(true);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.addInitScript(
    (key) => localStorage.setItem(key, 'zh-CN'),
    `nocobase.locale:${new URL(base).pathname.replace(/\/$/u, '')}/`,
  );
  try {
    await page.goto(`${base}/`);
    await expect(
      page.getByRole('button', { name: '打开账户菜单' }),
    ).toBeVisible({ timeout: 45_000 });
    const configuration = await context.request.get(
      `${base}/api/demoMode/configuration`,
    );
    expect(configuration.status()).toBe(200);
    expect((await configuration.json()).data.collections).not.toContain(
      'nrTasks',
    );
    await page.goto(`${base}/actions/new`);
    const dialog = page.getByRole('dialog', { name: '新建任务' });
    await expect(dialog).toBeVisible({ timeout: 45_000 });
    // Draft generation may fail validation before writing; reproduce the demo
    // refusal independently of the configured model and its generated content.
    await page.route('**/api/nocoreachTasks/draft', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'Server-Timing': 'demo-read-only;dur=0' },
        body: JSON.stringify({
          error: {
            code: 400,
            status: 'FAILED_PRECONDITION',
            reason: 'DEMO_READ_ONLY',
            domain: 'demoMode',
            message: 'This is a demo. Changes cannot be saved.',
          },
        }),
      }),
    );
    const idea = dialog.getByRole('textbox', { name: /想做什么/u });
    await idea.fill('优化定价页面的介绍，明确展示版本差异。');
    const draftResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/nocoreachTasks/draft'),
    );
    await dialog.getByRole('button', { name: 'AI 整理', exact: true }).click();
    const refusedDraft = await draftResponse;
    expect(refusedDraft.status()).toBe(400);
    expect((await refusedDraft.json()).error.reason).toBe('DEMO_READ_ONLY');
    expect(refusedDraft.headers()['server-timing']).toContain('demo-read-only');
    await expect(
      page.getByText('演示模式不能修改', { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(idea).toHaveValue('优化定价页面的介绍，明确展示版本差异。');
    await expect(
      dialog.getByRole('button', { name: 'AI 整理', exact: true }),
    ).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath('demo-draft.png') });

    await dialog.getByRole('button', { name: '直接填写', exact: true }).click();
    const title = dialog.getByRole('textbox', { name: /任务标题/u });
    await title.fill('优化定价页面介绍');
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/nocoreachTasks') &&
        response.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: '创建', exact: true }).click();
    const refusedCreate = await createResponse;
    expect(refusedCreate.status()).toBe(400);
    expect((await refusedCreate.json()).error.reason).toBe('DEMO_READ_ONLY');
    await expect(
      page.getByText('演示模式不能修改', { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(title).toHaveValue('优化定价页面介绍');
    await expect(title).toBeEnabled();
    await expect(
      dialog.getByRole('button', { name: '创建', exact: true }),
    ).toBeEnabled();
    await expect(page).toHaveURL(`${base}/actions/new`);
    await page.screenshot({ path: testInfo.outputPath('demo-create.png') });
    expect(errors).toEqual([]);
  } finally {
    await context.request.post(`${base}/api/auth/sign-out`, {
      headers: { Origin: new URL(base).origin },
      data: {},
    });
  }
});
