// Run: pnpm exec tsx tests/nocoreach/member-access.browser.ts
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
const directory = await mkdtemp(join(tmpdir(), 'pm453-members-'));
const output = join(tmpdir(), 'PM-453-members-screenshots');
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
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
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
  const createdProject = await post('/nocoreach/nrProjects/create', {
    name: 'Access demonstration',
    domain: 'access.example.test',
    language: 'en',
  });
  expect(createdProject.status()).toBe(200);
  const projectId = String((await createdProject.json()).data.id);
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
  const applicationNavigation = page.getByRole('navigation').first();
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.log('BROWSER_PAGE_ERROR', page.url(), error.stack);
  });
  const shot = async (name: string) =>
    page.screenshot({
      path: join(output, name),
      fullPage: true,
      mask: [page.locator('[data-invitation-link]')],
    });
  await page.goto(`${origin}/main/members`);
  await expect(
    page.getByRole('heading', { name: 'Members & roles', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Synthetic reader', { exact: true }),
  ).toBeVisible();
  await shot('members-multiple-roles-en.png');
  for (const label of ['Members & roles', 'API keys']) {
    await expect(
      applicationNavigation.getByRole('link', { name: label, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByText('Members and permissions', { exact: true }),
  ).toHaveCount(0);
  await expect(
    applicationNavigation.getByRole('link', {
      name: 'Members & roles',
      exact: true,
    }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    applicationNavigation.getByRole('link', { name: 'Roles', exact: true }),
  ).toHaveCount(0);
  await shot('settings-flat-entries-en.png');

  const memberContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
  });
  await memberContext.addInitScript(() => {
    localStorage.setItem('nocobase.locale', 'en-US');
  });
  expect(
    (
      await memberContext.request.post(
        `${origin}/main/api/auth/sign-in/email`,
        { data: personCredentials, headers: { origin } },
      )
    ).status(),
  ).toBe(200);
  const memberPage = await memberContext.newPage();
  const memberNavigation = memberPage.getByRole('navigation').first();
  const memberErrors: string[] = [];
  memberPage.on('pageerror', (error) => memberErrors.push(error.message));
  for (const [path, label] of [
    ['/members', 'Members & roles'],
    ['/members?tab=roles', 'Members & roles'],
    ['/keys', 'API keys'],
  ]) {
    await memberPage.goto(`${origin}/main${path}`);
    await expect(
      memberPage.getByRole('heading', { name: label, exact: true }),
    ).toBeVisible();
    await expect(
      memberNavigation.getByRole('link', { name: label, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      memberPage.getByText('Members and permissions', { exact: true }),
    ).toHaveCount(0);
  }
  expect(memberErrors).toEqual([]);
  await memberContext.close();

  await page.goto(`${origin}/main/keys`);
  await expect(
    page.getByRole('heading', { name: 'API keys', exact: true }),
  ).toBeVisible();
  await expect(
    applicationNavigation.getByRole('link', {
      name: 'API keys',
      exact: true,
    }),
  ).toHaveAttribute('aria-current', 'page');
  await page.goto(`${origin}/main/members`);
  await page
    .getByRole('button', { name: 'Actions for Synthetic reader' })
    .click();
  await page.getByRole('menuitem', { name: 'Edit member' }).click();
  await expect(page.getByRole('dialog', { name: 'Edit member' })).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Member', exact: true }),
  ).toBeChecked();
  await shot('member-role-editor-en.png');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page
    .getByRole('button', { name: 'Pending invitations', exact: true })
    .click();
  await expect(
    page.getByText('No pending invitations', { exact: true }),
  ).toBeVisible();
  await shot('invitations-empty-en.png');
  await page.getByText('Invite member', { exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Invite member' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Send invitations', exact: true })
    .click();
  await expect(
    page.getByText('Enter at least one email address.', { exact: true }),
  ).toBeVisible();
  await shot('invite-validation-en.png');
  await page
    .getByLabel('Email', { exact: true })
    .pressSequentially('new-browser@example.test');
  await page.getByRole('combobox', { name: 'Projects' }).click();
  await page.getByRole('option', { name: 'Access demonstration' }).click();
  await page.keyboard.press('Escape');
  await shot('invite-form-en.png');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/nocoreachAccess/invitations', async (route) => {
    if (route.request().method() === 'POST') await held;
    await route.continue();
  });
  await page
    .getByRole('button', { name: 'Send invitations', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Sending…', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByText('Not emailed; copy the link', { exact: true }),
  ).toBeVisible();
  const newLink = await page
    .getByLabel('Invitation link', { exact: true })
    .inputValue();
  await shot('invite-copy-delivery-en.png');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/members\?tab=invitations$/);
  await expect(
    page
      .getByRole('table', { name: 'Pending invitations' })
      .getByText('new-browser@example.test', { exact: true }),
  ).toBeVisible();
  await shot('invitations-pending-en.png');
  await page
    .getByRole('textbox', { name: 'Search invitation emails' })
    .fill('new-browser');
  await page
    .getByRole('textbox', { name: 'Search invitation emails' })
    .press('Enter');
  await page.getByText('Invite member', { exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/tab=invitations.*q=new-browser/);
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Search invitation emails' }),
  ).toHaveValue('new-browser');
  await page
    .getByRole('textbox', { name: 'Search invitation emails' })
    .fill('no-such-invite');
  await expect(
    page.getByText('No matching records', { exact: true }),
  ).toBeVisible();
  await shot('invitations-no-results-en.png');
  await page.goto(`${origin}/main/members?tab=roles`);
  await expect(
    page.getByRole('button', { name: 'Roles', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    applicationNavigation.getByRole('link', {
      name: 'Members & roles',
      exact: true,
    }),
  ).toHaveAttribute('aria-current', 'page');
  await shot('roles-list-en.png');
  await page.getByText('New role', { exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'New role', exact: true }),
  ).toBeVisible();
  await page.locator('#role-title').pressSequentially('Project reader');
  await page
    .getByLabel('Role identifier', { exact: false })
    .pressSequentially('browser-reader');
  await expect(
    page.getByRole('radio', { name: /^Projects they belong to/ }),
  ).toBeChecked();
  await page.getByRole('checkbox', { name: /^View project data/ }).check();
  await page.getByRole('checkbox', { name: 'YouTube', exact: true }).check();
  await shot('role-permissions-scope-en.png');
  await expect(page.locator('#role-title')).toHaveValue('Project reader');
  await expect(
    page.getByLabel('Role identifier', { exact: false }),
  ).toHaveValue('browser-reader');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Roles', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('link', { name: 'Project reader', exact: true }),
  ).toBeVisible();
  await page.goto(`${origin}/main/members/${person.id}/roles`);
  await page.getByRole('checkbox', { name: 'Project reader' }).check();
  await page.getByRole('combobox', { name: 'Projects' }).click();
  await page.getByRole('option', { name: 'Access demonstration' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Edit member', exact: true }),
  ).toBeHidden();
  await expect(page.getByText('Project reader', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('row', { name: /Synthetic reader/ })
      .getByText('Access demonstration', { exact: true }),
  ).toBeVisible();
  await shot('members-multiple-roles-en.png');
  const existingCredentials = {
    email: 'existing-browser@example.test',
    password: 'fictional-password-123',
  };
  expect(
    (
      await post('/users', {
        ...existingCredentials,
        name: 'Synthetic invitee',
      })
    ).status(),
  ).toBe(201);
  const invitation = await post('/nocoreachAccess/invitations', {
    emails: [existingCredentials.email],
    projectIds: [projectId],
  });
  expect(invitation.status()).toBe(200);
  expect((await invitation.json()).data[0].outcome).toBe('invited');
  const inviteeContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
  });
  await inviteeContext.addInitScript(() => {
    localStorage.setItem('nocobase.locale', 'en-US');
  });
  expect(
    (
      await inviteeContext.request.post(
        `${origin}/main/api/auth/sign-in/email`,
        { data: existingCredentials, headers: { origin } },
      )
    ).status(),
  ).toBe(200);
  const inviteePage = await inviteeContext.newPage();
  const inviteeErrors: string[] = [];
  inviteePage.on('pageerror', (error) => inviteeErrors.push(error.message));
  await inviteePage.goto(`${origin}/main/home`);
  await expect(
    inviteePage.getByRole('heading', {
      name: 'Access denied',
      exact: true,
    }),
  ).toBeVisible();
  await inviteePage
    .getByRole('button', { name: 'Open account menu', exact: true })
    .click();
  await expect(
    inviteePage.getByRole('menuitem', {
      name: 'Your invitations',
      exact: true,
    }),
  ).toBeVisible();
  await inviteePage.screenshot({
    path: join(output, 'existing-invitation-account-menu-en.png'),
    fullPage: true,
  });
  await inviteePage
    .getByRole('menuitem', { name: 'Your invitations', exact: true })
    .click();
  await expect(inviteePage).toHaveURL(`${origin}/main/member-invitations`);
  await expect(
    inviteePage.getByRole('heading', { name: 'Your invitations', exact: true }),
  ).toBeVisible();
  const ownInvitation = inviteePage.locator('section').filter({
    has: inviteePage.getByRole('heading', {
      name: existingCredentials.email,
      exact: true,
    }),
  });
  await expect(
    ownInvitation.getByRole('button', {
      name: 'Accept invitation',
      exact: true,
    }),
  ).toBeVisible();
  await inviteePage.screenshot({
    path: join(output, 'existing-invitation-accept-en.png'),
    fullPage: true,
  });
  await ownInvitation
    .getByRole('button', { name: 'Accept invitation', exact: true })
    .click();
  await expect(
    inviteePage.getByText('You have joined NocoReach', { exact: true }),
  ).toBeVisible();
  await inviteePage.reload();
  await expect(
    inviteePage.getByText('You have joined NocoReach', { exact: true }),
  ).toBeVisible();
  await inviteePage.screenshot({
    path: join(output, 'existing-invitation-accepted-en.png'),
    fullPage: true,
  });
  expect(inviteeErrors).toEqual([]);
  await inviteeContext.close();
  const guestContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
  });
  await guestContext.addInitScript(() => {
    localStorage.setItem('nocobase.locale', 'en-US');
  });
  const guest = await guestContext.newPage();
  await guest.goto(newLink);
  await expect(
    guest.getByRole('textbox', { name: 'Email', exact: true }),
  ).toHaveValue('new-browser@example.test');
  await guest.screenshot({
    path: join(output, 'new-invitation-register-en.png'),
    fullPage: true,
  });
  await guest
    .getByRole('textbox', { name: 'Name', exact: true })
    .pressSequentially('Synthetic new invitee');
  await guest
    .getByRole('textbox', { name: 'Password', exact: true })
    .fill('fictional-password-123');
  await guest
    .getByRole('button', { name: 'Create account and join', exact: true })
    .click();
  await expect(guest).toHaveURL(`${origin}/main/home`);
  await guestContext.close();
  await page.goto(`${origin}/main/members`);
  await expect(
    page.getByText('Synthetic invitee', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Actions for Synthetic invitee' })
    .click();
  await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await shot('member-removal-confirm-en.png');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove', exact: true })
    .click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await expect(
    page.getByText('Synthetic invitee', { exact: true }),
  ).toBeHidden();
  await expect(
    page.getByText('Synthetic reader', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByText('Dark', { exact: true }).click();
  await expect(
    page.getByRole('radio', { name: 'Dark', exact: true }),
  ).toBeChecked();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(
    page.getByText('Synthetic reader', { exact: true }),
  ).toBeVisible();
  await shot('members-mobile-dark-en.png');
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const status of [403, 500]) {
    await page.route('**/api/nocoreachAccess/members', (route) =>
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
    if (status === 403)
      await expect(
        page.getByRole('button', { name: 'Retry', exact: true }),
      ).toBeHidden();
    else
      await expect(
        page.getByRole('button', { name: 'Retry', exact: true }),
      ).toBeVisible();
    await shot(`members-error-${status}-en.png`);
    await page.unroute('**/api/nocoreachAccess/members');
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => {
    localStorage.setItem('nocobase:main:theme:color-scheme', 'light');
    document.documentElement.classList.remove('dark');
    localStorage.setItem('nocobase.locale', 'zh-CN');
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '成员与角色', exact: true }),
  ).toBeVisible();
  for (const label of ['成员与角色', 'API 密钥']) {
    await expect(
      applicationNavigation.getByRole('link', { name: label, exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByText('成员与权限', { exact: true })).toHaveCount(0);
  await expect(
    applicationNavigation.getByRole('link', {
      name: '成员与角色',
      exact: true,
    }),
  ).toHaveAttribute('aria-current', 'page');
  await shot('members-zh.png');
  for (const [path, label] of [
    ['/members?tab=roles', '成员与角色'],
    ['/keys', 'API 密钥'],
    ['/members', '成员与角色'],
  ]) {
    await page.goto(`${origin}/main${path}`);
    await expect(
      page.getByRole('heading', { name: label, exact: true }),
    ).toBeVisible();
    await expect(
      applicationNavigation.getByRole('link', { name: label, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  }
  await page.goto(`${origin}/main/members/roles/new?tab=roles`);
  await expect(
    page.getByRole('heading', { name: '新建角色', exact: true }),
  ).toBeVisible();
  const input = page.locator('#role-title');
  await input.focus();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', {
    text: 'cheng',
    selectionStart: 5,
    selectionEnd: 5,
  });
  await cdp.send('Input.insertText', { text: '成员' });
  await expect(input).toHaveValue('成员');
  await input.press('Home');
  await input.pressSequentially('A');
  await expect(input).toHaveValue('A成员');
  await shot('role-permissions-zh.png');
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
          'members',
          'multirole',
          'invite-new',
          'invite-existing',
          'invite-existing-discovered-from-account-menu',
          'no-mail',
          'validation',
          'pending',
          'roles-create',
          'capability-role',
          'project-membership',
          'en',
          'zh',
          '375px',
          'dark',
          'IME',
          'filtered-overlay-return-and-reload',
          'no-results',
          'submitting-disabled',
          'HTTP-403-and-500',
          'remove-member',
          'settings-membership-navigation',
          'member-navigation',
          'English-and-Chinese-direct-routes-and-selected-state',
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
