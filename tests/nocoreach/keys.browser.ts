// Run: pnpm exec tsx tests/nocoreach/keys.browser.ts
// Uses an isolated database and synthetic identities; screenshots mask invitation credentials.
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';

const root = resolve(import.meta.dirname, '../..');
const directory = await mkdtemp(join(tmpdir(), 'pm453-keys-'));
const output = join(tmpdir(), 'PM-453-keys-screenshots');
await mkdir(output, { recursive: true });
const origin = 'http://127.0.0.1:14053';
const config = join(directory, 'config.yml');
await writeFile(
  config,
  JSON.stringify({
    app: { publicOrigin: origin },
    users: {
      initialAdmin: {
        ...DEFAULT_ADMIN_CREDENTIALS,
        name: 'Synthetic administrator',
      },
    },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  }),
);
const log = createWriteStream(join(output, 'development.log'));
const child = spawn('pnpm', ['dev'], {
  cwd: root,
  detached: true,
  env: {
    ...process.env,
    APP_CONFIG_FILE: config,
    APP_STORAGE_DIR: directory,
    DB_FILENAME: join(directory, 'application.sqlite'),
    APP_SERVER_PORT: '14053',
    APP_PUBLIC_ORIGIN: origin,
    APP_BASE_PATH: '/main',
    NOCOBASE_STRICT_STARTUP: 'true',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.pipe(log);
child.stderr.pipe(log);
let browser;
try {
  const deadline = Date.now() + 90000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Development server exited ${child.exitCode}`);
    try {
      ready = (await fetch(`${origin}/main/api/healthz`)).ok;
    } catch {
      /* Startup has not bound its port yet. */
    }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready)
    throw new Error(
      'Development server did not become ready; see development.log',
    );
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
  });
  await context.addInitScript(() => {
    if (!localStorage.getItem('nocobase.locale'))
      localStorage.setItem('nocobase.locale', 'en-US');
  });
  expect(
    (
      await context.request.post(`${origin}/main/api/auth/sign-in/username`, {
        data: DEFAULT_ADMIN_CREDENTIALS,
        headers: { origin },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await context.request.get(`${origin}/main/api/swagger`)).status(),
  ).toBe(200);
  const post = (path: string, data: unknown) =>
    context.request.post(`${origin}/main/api${path}`, {
      data,
      headers: { origin },
    });
  expect(
    (
      await post('/nocoreach/nrProjects/create', {
        name: 'Access demonstration',
        domain: 'access.example.test',
        language: 'en',
      })
    ).status(),
  ).toBe(200);
  const personCredentials = {
    email: 'synthetic-reader@example.test',
    password: 'fictional-password-123',
  };
  const created = await post('/users', {
    ...personCredentials,
    name: 'Synthetic reader',
  });
  expect(created.status()).toBe(201);
  const person = (await created.json()).data;
  expect(
    (
      await post('/nocoreach/nrMembers/setRole', {
        userId: person.id,
        role: 'member',
      })
    ).status(),
  ).toBe(200);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.log('BROWSER_PAGE_ERROR', page.url(), error.stack);
  });
  const shot = async (name: string) =>
    page.screenshot({
      path: join(output, name),
      fullPage: true,
      mask: [page.locator('[data-key-secret]')],
    });
  await page.goto(`${origin}/main/keys`);
  await expect(
    page.getByRole('heading', { name: 'API keys', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('No API keys', { exact: true })).toBeVisible();
  await shot('keys-empty-en.png');
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await expect(
    page.getByText('Enter a key name (up to 100 characters).', { exact: true }),
  ).toBeVisible();
  await shot('key-validation-en.png');
  await page.locator('#key-name').pressSequentially('Personal reader');
  await page.locator('#key-days').fill('7');
  await page
    .getByRole('combobox', { name: 'Project scope', exact: true })
    .click();
  await page
    .getByRole('option', { name: 'Selected projects', exact: true })
    .click();
  await page
    .getByRole('checkbox', { name: 'Access demonstration', exact: true })
    .check();
  await shot('key-create-personal-en.png');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/nocoreachKeys', async (route) => {
    await held;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Saving…', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeDisabled();
  release();
  await expect(page.locator('[data-key-secret]')).toBeVisible();
  const oldSecret = await page.locator('[data-key-secret]').inputValue();
  await shot('key-secret-once-en.png');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('[data-key-secret]')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Personal reader', exact: true }),
  ).toBeVisible();
  await shot('keys-personal-en.png');
  await page
    .getByRole('button', { name: 'Actions for Personal reader', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Rotate', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await shot('key-rotate-confirm-en.png');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Rotate', exact: true })
    .click();
  await expect(page.locator('[data-key-secret]')).toBeVisible();
  const replacement = await page.locator('[data-key-secret]').inputValue();
  expect(replacement).not.toBe(oldSecret);
  const business = (secret: string) =>
    context.request.post(`${origin}/main/api/nocoreach/nrTaskWork/list`, {
      headers: { 'x-api-key': secret, origin },
      data: { projectId: '1' },
    });
  expect((await business(oldSecret)).status()).toBe(401);
  expect((await business(replacement)).status()).toBe(200);
  await shot('key-rotated-secret-en.png');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page
    .getByRole('button', { name: 'Actions for Personal reader', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Stop', exact: true }).click();
  await shot('key-stop-confirm-en.png');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Stop', exact: true })
    .click();
  await expect(page.getByText('Stopped', { exact: true })).toBeVisible();
  expect((await business(replacement)).status()).toBe(401);
  await page
    .getByRole('link', { name: 'Personal reader', exact: true })
    .click();
  await expect(page.getByText('Key rotated', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('list').getByText('Key stopped', { exact: true }),
  ).toBeVisible();
  await shot('key-history-after-stop-en.png');
  await page.keyboard.press('Escape');
  await page
    .getByRole('tab', { name: 'Organization keys', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Create key', exact: true })
    .first()
    .click();
  await page.locator('#key-name').pressSequentially('Application integration');
  await page.getByRole('checkbox', { name: 'Member', exact: true }).check();
  await shot('key-create-organization-en.png');
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await expect(page.locator('[data-key-secret]')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Application integration', exact: true }),
  ).toBeVisible();
  await shot('keys-organization-en.png');
  await page
    .getByRole('textbox', { name: 'Search keys', exact: true })
    .pressSequentially('missing');
  await expect(
    page.getByText('No matching records', { exact: true }),
  ).toBeVisible();
  await shot('keys-no-results-en.png');
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => {
    localStorage.setItem('nocobase:main:theme:color-scheme', 'dark');
    document.documentElement.classList.add('dark');
  });
  await page.setViewportSize({ width: 375, height: 900 });
  await shot('keys-mobile-dark-en.png');
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const status of [403, 500]) {
    await page.route('**/api/nocoreachKeys/list?*', (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Synthetic failure', status },
        }),
      }),
    );
    await page.reload();
    await expect(page.getByRole('alert')).toBeVisible();
    if (status === 500)
      await expect(
        page.getByRole('button', { name: 'Retry', exact: true }),
      ).toBeVisible();
    else
      await expect(
        page.getByRole('button', { name: 'Retry', exact: true }),
      ).toHaveCount(0);
    await shot(`keys-error-${status}-en.png`);
    await page.unroute('**/api/nocoreachKeys/list?*');
  }
  await page.evaluate(() => {
    localStorage.setItem('nocobase.locale', 'zh-CN');
    localStorage.setItem('nocobase:main:theme:color-scheme', 'light');
    document.documentElement.classList.remove('dark');
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'API 密钥', exact: true }),
  ).toBeVisible();
  await shot('keys-zh.png');
  await page.getByRole('button', { name: '创建密钥', exact: true }).click();
  const input = page.locator('#key-name');
  await input.focus();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.imeSetComposition', {
    text: 'mi',
    selectionStart: 2,
    selectionEnd: 2,
  });
  await cdp.send('Input.insertText', { text: '密钥' });
  await input.press('Home');
  await input.pressSequentially('A');
  await expect(input).toHaveValue('A密钥');
  await shot('key-form-zh.png');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  const ownContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await ownContext.addInitScript(() =>
    localStorage.setItem('nocobase.locale', 'en-US'),
  );
  expect(
    (
      await ownContext.request.post(`${origin}/main/api/auth/sign-in/email`, {
        data: personCredentials,
        headers: { origin },
      })
    ).status(),
  ).toBe(200);
  const own = await ownContext.newPage();
  own.on('pageerror', (error) => errors.push(error.message));
  await own.goto(`${origin}/main/keys`);
  await expect(
    own.getByRole('heading', { name: 'API keys', exact: true }),
  ).toBeVisible();
  await expect(
    own.getByRole('tab', { name: 'Organization keys', exact: true }),
  ).toHaveCount(0);
  await own
    .getByRole('button', { name: 'Create key', exact: true })
    .first()
    .click();
  await own.locator('#key-name').pressSequentially('Member self service');
  await own.getByRole('button', { name: 'Create key', exact: true }).click();
  await expect(own.locator('[data-key-secret]')).toBeVisible();
  await own.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    own.getByRole('link', { name: 'Member self service', exact: true }),
  ).toBeVisible();
  await own.screenshot({
    path: join(output, 'keys-member-self-service-en.png'),
    fullPage: true,
    mask: [own.locator('[data-key-secret]')],
  });
  expect(
    (
      await ownContext.request.get(
        `${origin}/main/api/nocoreachKeys/list?type=organization`,
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await ownContext.request.get(`${origin}/main/api/nocoreachKeys/inventory`)
    ).status(),
  ).toBe(403);
  await ownContext.close();
  expect(errors).toEqual([]);
  await context.close();
  await writeFile(
    join(output, 'verification.json'),
    JSON.stringify(
      {
        screenshots: (await readdir(output)).filter((name) =>
          name.endsWith('.png'),
        ).length,
        browserErrors: errors,
        verified: [
          'personal',
          'organization',
          'member-self-service',
          'expiry-form',
          'scope',
          'immediate-rotation',
          'revocation',
          'retained-history',
          'secret-masked',
          'en',
          'zh',
          'dark',
          '375px',
          'IME',
          '403',
          '500',
          'no-results',
          'submitting-disabled',
        ],
      },
      null,
      2,
    ),
  );
  console.log(`Browser evidence: ${output}`);
} finally {
  await browser?.close();
  if (child.pid && child.exitCode === null) {
    process.kill(-child.pid, 'SIGTERM');
    await new Promise<void>((resolve) => {
      child.once('close', () => resolve());
      setTimeout(resolve, 5000);
    });
    if (child.exitCode === null) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* Already stopped. */
      }
    }
  }
  log.end();
  await rm(directory, { recursive: true, force: true });
}
