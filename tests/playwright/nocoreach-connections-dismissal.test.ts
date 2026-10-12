import { readFile } from 'node:fs/promises';
import {
  expect,
  test as baseTest,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { z } from 'zod';

// Opt in only against a disposable mock app with a project and synthetic admin.
// Sign in once; do not import a personal browser profile or saved session.
const base = process.env.APP_URL?.replace(/\/$/, '') ?? '';
const credentialsFile = process.env.NOCOREACH_TEST_CREDENTIALS;
const enabled = process.env.NOCOREACH_MOCK_BROWSER_QA === '1';
const credentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
});

async function signIn(page: Page) {
  const credentials = credentialsSchema.parse(
    JSON.parse(await readFile(credentialsFile!, 'utf8')),
  );
  await page.goto(`${base}/login`);
  await page
    .getByLabel(/Username or email|用户名或邮箱/, { exact: true })
    .fill(credentials.username);
  await page
    .getByLabel(/Password|密码/, { exact: true })
    .fill(credentials.password);
  const response = page.waitForResponse((result) =>
    result.url().includes('/api/auth/sign-in/'),
  );
  await page.getByRole('button', { name: /^Sign in$|^登录$/ }).click();
  expect((await response).status()).toBe(200);
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
}

const test = baseTest.extend<object, { sessionContext: BrowserContext }>({
  sessionContext: [
    async ({ browser }, provide) => {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        await signIn(page);
        await page.close();
        await provide(context);
      } finally {
        await context.close();
      }
    },
    { scope: 'worker' },
  ],
  context: async ({ sessionContext }, provide) => {
    await provide(sessionContext);
  },
  page: async ({ context }, provide) => {
    const page = await context.newPage();
    try {
      await provide(page);
    } finally {
      await page.close();
    }
  },
});

test.skip(
  !enabled || !base || !credentialsFile,
  'Requires NOCOREACH_MOCK_BROWSER_QA=1, APP_URL and synthetic NOCOREACH_TEST_CREDENTIALS',
);
test.use({
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});
test.describe.configure({ mode: 'serial' });

for (const width of [1440, 375]) {
  for (const preset of ['compact', 'default'] as const) {
    test(`single Close keeps the account menu closed at ${width}px / ${preset}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/connections`);
      await expect(page.getByTestId('mock-environment-banner')).toBeVisible();

      const account = page.getByRole('button', {
        name: /Open account menu|打开账户菜单/,
      });
      const appearance = page.getByRole('button', { name: /Appearance|外观/ });
      await appearance.focus();
      await page.keyboard.press('Enter');
      await page
        .getByRole('dialog')
        .locator('label')
        .filter({ has: page.locator(`input[type="radio"][value="${preset}"]`) })
        .click();
      await page.keyboard.press('Escape');
      await expect(page.locator('html')).toHaveAttribute('data-theme', preset);
      const header = await page
        .locator('header')
        .filter({ has: account })
        .boundingBox();
      expect(header).not.toBeNull();

      // Successive clicks also prove the next connection remains usable. No
      // pointer movement, Escape or force-click is allowed after closing.
      for (const source of [
        'ga4',
        'social',
        'discord',
        'xiaohongshu',
        'bilibili',
      ]) {
        const opener = page
          .locator(`[data-source-id="${source}"]`)
          .getByRole('button');
        await opener.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        const close = dialog.getByRole('button', { name: /^Close$|^关闭$/ });
        await expect(close).toHaveCount(1);
        const closeBox = await close.boundingBox();
        expect(closeBox).not.toBeNull();
        expect(closeBox!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
        await close.click();
        await expect(dialog).toHaveCount(0);
        // Cover both the closing animation and the reported delayed hover.
        // This wait deliberately keeps the mouse at the former Close position.
        await page.waitForTimeout(2200);
        await expect(account).toHaveAttribute('aria-expanded', 'false');
        await expect(page.getByRole('menu')).toHaveCount(0);
        expect(
          await page.evaluate<string>(
            'getComputedStyle(document.body).pointerEvents',
          ),
        ).not.toBe('none');
        await expect(opener).toBeFocused();
      }

      // Dismissal must not disable the intentional header hover behavior.
      await account.hover();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.keyboard.press('Escape');
    });
  }
}
