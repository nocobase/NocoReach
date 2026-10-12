import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { z } from 'zod';

// Opt in only against a disposable application whose external QA launcher gates
// a real repository read. There are no timing hooks in production application code.
const base = process.env.APP_URL?.replace(/\/$/, '') ?? '';
const credentialsFile = process.env.NOCOREACH_TEST_CREDENTIALS;
const collectorControl = process.env.NOCOREACH_BILIBILI_MOCK_CONTROL;
const gateUrl = process.env.NOCOREACH_BILIBILI_SNAPSHOT_GATE_URL;
const tokenFile = process.env.NOCOREACH_BILIBILI_SNAPSHOT_GATE_TOKEN_FILE;
test.skip(
  !base || !credentialsFile || !collectorControl || !gateUrl || !tokenFile,
  'Requires a disposable SQLite app, mock collector and external read gate',
);
test.use({
  viewport: { width: 1440, height: 1000 },
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});

test('another tab keeps polling across a Bilibili commit and renders the final archive', async ({
  context,
  page,
}, testInfo) => {
  const credentials = z
    .object({ username: z.string(), password: z.string() })
    .parse(JSON.parse(await readFile(credentialsFile!, 'utf8')));
  const { token } = z
    .object({ token: z.string() })
    .parse(JSON.parse(await readFile(tokenFile!, 'utf8')));
  const gate = async (action: string) => {
    const response = await context.request.post(`${gateUrl}/${action}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    return z
      .object({
        held: z.boolean(),
        transaction: z.boolean(),
        writeRequested: z.boolean(),
        writeFinished: z.boolean(),
      })
      .parse(await response.json());
  };
  const control = (value: object) =>
    writeFile(collectorControl!, JSON.stringify(value));
  const other = await context.newPage();
  await other.route(`${base}/api/nocoreach/nrBilibili/status`, (route) =>
    route.continue({
      headers: { ...route.request().headers(), 'x-nocoreach-qa-reader': token },
    }),
  );
  try {
    await page.goto(`${base}/login`);
    await page
      .getByLabel(/Username or email|用户名或邮箱/, { exact: true })
      .fill(credentials.username);
    await page
      .getByLabel(/Password|密码/, { exact: true })
      .fill(credentials.password);
    const signedIn = page.waitForResponse((r) =>
      r.url().includes('/api/auth/sign-in/'),
    );
    await page.getByRole('button', { name: /^Sign in$|^登录$/ }).click();
    expect((await signedIn).status()).toBe(200);
    await page.waitForURL((url) => !url.pathname.endsWith('/login'));
    await page
      .getByRole('button', { name: /Open account menu|打开账户菜单/ })
      .click();
    await page.getByRole('menuitem', { name: /Language|语言/ }).hover();
    await page
      .getByRole('menuitemradio', { name: 'English', exact: true })
      .click();
    await page.mouse.move(600, 90);
    await page.keyboard.press('Escape');
    await page.goto(`${base}/connections?source=bilibili`);
    await page
      .getByRole('textbox', { name: 'Search term', exact: true })
      .fill('Snapshot race QA');
    await page.getByRole('combobox').click();
    await page
      .getByRole('option', {
        name: 'Synthetic Bilibili collector',
        exact: true,
      })
      .click();
    await page
      .getByRole('textbox', { name: 'BV IDs or video links', exact: true })
      .fill('');
    await page
      .getByRole('button', { name: 'Save configuration', exact: true })
      .click();
    await control({ mode: 'success', label: 'Old Bilibili snapshot' });
    await page.getByRole('button', { name: 'Read now', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Old Bilibili snapshot' }),
    ).toBeVisible();

    await control({
      mode: 'success',
      label: 'New Bilibili snapshot',
      bvid: 'BV1ABcsztEcY',
      waitForRelease: true,
    });
    const collection = page.waitForResponse((r) =>
      r.url().endsWith('/nrBilibili/sync'),
    );
    await page.getByRole('button', { name: 'Read now', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Stop collection', exact: true }),
    ).toBeVisible();
    await other.goto(`${base}/connections?source=bilibili`);
    await expect(
      other.getByRole('button', { name: 'Stop collection', exact: true }),
    ).toBeVisible();
    await gate('arm');
    const heldRequest = other.waitForRequest((r) =>
      r.url().endsWith('/nrBilibili/status'),
    );
    await expect.poll(async () => (await gate('status')).held).toBe(true);
    await control({ release: true });
    await expect
      .poll(async () => (await gate('status')).writeRequested, {
        timeout: 15000,
      })
      .toBe(true);
    const boundary = await gate('status');
    // A genuine transaction-held read blocks the writer. On the old tree let
    // that writer finish, exposing the same late snapshot through real HTTP.
    if (boundary.transaction) expect(boundary.writeFinished).toBe(false);
    else
      await expect
        .poll(async () => (await gate('status')).writeFinished)
        .toBe(true);
    await gate('release');
    const response = await (await heldRequest).response();
    if (!response)
      throw new Error('The held view request did not receive a response');
    expect(response.status()).toBe(200);
    const held = z
      .object({
        data: z.object({
          total: z.number(),
          checking: z.boolean(),
          requestId: z.string().nullable(),
          recent: z.array(z.object({ id: z.string(), title: z.string() })),
        }),
      })
      .parse(await response.json()).data;
    await writeFile(
      testInfo.outputPath('held-view.json'),
      JSON.stringify({ boundary, held }, null, 2),
    );
    expect((await collection).status()).toBe(200);
    await expect(
      other.getByRole('link', { name: 'New Bilibili snapshot' }),
    ).toBeVisible({ timeout: 6000 });
    expect(held.total).toBe(held.recent.length);
    expect(held.requestId === null).toBe(!held.checking);
    if (!held.checking)
      expect(held.recent.map((video) => video.title)).toContain(
        'New Bilibili snapshot',
      );
    else
      expect(held.recent.map((video) => video.title)).toContain(
        'Old Bilibili snapshot',
      );
    await expect(
      other.getByRole('button', { name: 'Stop collection', exact: true }),
    ).toHaveCount(0);
    await other.screenshot({
      path: testInfo.outputPath('other-tab-final.png'),
      fullPage: true,
    });
    await writeFile(
      testInfo.outputPath('other-tab-dom.txt'),
      await other.locator('body').innerText(),
    );
  } catch (error) {
    await other
      .screenshot({
        path: testInfo.outputPath('other-tab-failure.png'),
        fullPage: true,
      })
      .catch(() => undefined);
    await writeFile(
      testInfo.outputPath('other-tab-failure-dom.txt'),
      await other.locator('body').innerText(),
    ).catch(() => undefined);
    throw error;
  } finally {
    await gate('release').catch(() => undefined);
    await context.request
      .post(`${base}/api/auth/sign-out`, {
        headers: { origin: new URL(base).origin },
        data: {},
      })
      .catch(() => undefined);
    await other.close();
  }
});
