import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';

// Opt-in, destructive only to a disposable test connection. Both accounts are
// freshly signed in through the UI; never import a browser profile or cookies.
const base = process.env.APP_URL?.replace(/\/$/, '') ?? '';
const credentialsFile = process.env.NOCOREACH_TEST_CREDENTIALS;
const fixturesFile = process.env.NOCOREACH_XHS_SESSION_FIXTURES;
const projectId = process.env.NOCOREACH_TEST_PROJECT_ID ?? '1';
const credentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
});
test.skip(
  !base || !credentialsFile || !fixturesFile,
  'Requires an isolated app and synthetic XHS session fixtures',
);
test.use({
  viewport: { width: 1440, height: 1000 },
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});

async function signIn(
  page: Page,
  credentials: z.infer<typeof credentialsSchema>,
) {
  await page.goto(`${base}/login`);
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
  expect(
    (await response).status(),
    'Fresh UI sign-in; never bypass rate limits',
  ).toBe(200);
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
}

test('a confirmation cannot move to another tab’s new session; the new admin can confirm afresh', async ({
  context,
  page,
}, testInfo) => {
  const admin = credentialsSchema.parse(
    JSON.parse(await readFile(credentialsFile!, 'utf8')),
  );
  const fixtures = z
    .object({
      users: z.array(
        credentialsSchema.extend({ id: z.string(), role: z.string() }),
      ),
    })
    .parse(JSON.parse(await readFile(fixturesFile!, 'utf8')));
  const member = fixtures.users.find((user) => user.role === 'member');
  if (!member) throw new Error('Requires a disposable member account');
  const origin = new URL(base).origin;
  const call = (resource: string, action: string, values: object = {}) =>
    context.request.post(`${base}/api/nocoreach/${resource}/${action}`, {
      headers: { origin },
      data: { projectId, ...values },
    });
  const view = async () => {
    const response = await call('nrXiaohongshu', 'view');
    expect(response.status()).toBe(200);
    return z
      .object({
        data: z.object({ connected: z.boolean(), revision: z.number() }),
      })
      .parse(await response.json()).data;
  };
  const disconnect = (tab: Page) =>
    tab
      .locator('[data-xiaohongshu-connect]')
      .getByRole('button', { name: /^Disconnect$|^断开$/ });
  try {
    await signIn(page, admin);
    expect(
      (
        await call('nrMembers', 'setRole', { userId: member.id, role: 'admin' })
      ).status(),
    ).toBe(200);
    const original = await view();
    expect(
      (
        await call('nrXiaohongshu', 'connect', {
          collectorId: process.env.NOCOREACH_TEST_COLLECTOR_ID ?? 'qa-xhs',
          query: 'Cross-tab ownership QA',
          authorized: true,
          revision: original.revision,
        })
      ).status(),
    ).toBe(200);
    await page.goto(`${base}/connections?source=xiaohongshu`);
    await disconnect(page).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    const before = await view();
    await page.screenshot({
      path: testInfo.outputPath('a-confirmation-open.png'),
    });

    // These pages share the real cookie jar, but retain independent React providers.
    const tabB = await context.newPage();
    await tabB.goto(base);
    await tabB
      .getByRole('button', { name: /Open account menu|打开账户菜单/ })
      .click();
    await tabB.getByRole('menuitem', { name: /Sign out|退出登录/ }).click();
    await tabB.waitForURL((url) => url.pathname.endsWith('/login'));
    await signIn(tabB, member);
    await page.bringToFront();
    await page.evaluate('window.focus()');
    await page.waitForTimeout(1800);
    const current = await call('nrMembers', 'me');
    expect(await current.json()).toMatchObject({
      data: { id: member.id, role: 'admin' },
    });
    await expect(page.getByRole('alertdialog')).toBeVisible();
    const rejected = page.waitForResponse((r) =>
      r.url().endsWith('/nrXiaohongshu/disconnect'),
    );
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: /^Disconnect$|^断开$/ })
      .click();
    const stale = await rejected;
    expect(stale.status()).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { reason: 'NOCOREACH_CONFIRMATION_SESSION_CHANGED' },
    });
    expect(await view()).toEqual(before);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('a-stale-rejected.png'),
    });

    // First visit to the XHS panel in B's tab; no reload or forced click workaround.
    await tabB.bringToFront();
    await tabB.goto(`${base}/connections?source=xiaohongshu`);
    await disconnect(tabB).click();
    const accepted = tabB.waitForResponse((r) =>
      r.url().endsWith('/nrXiaohongshu/disconnect'),
    );
    await tabB
      .getByRole('alertdialog')
      .getByRole('button', { name: /^Disconnect$|^断开$/ })
      .click();
    expect((await accepted).status()).toBe(200);
    expect(await view()).toEqual({
      connected: false,
      revision: before.revision + 1,
    });
    await tabB.screenshot({
      path: testInfo.outputPath('b-fresh-confirmation.png'),
    });
  } finally {
    // The fixture runner revokes all synthetic accounts' sessions after the test.
    await context.request.post(`${base}/api/auth/sign-out`, {
      headers: { origin },
      data: {},
    });
  }
});
