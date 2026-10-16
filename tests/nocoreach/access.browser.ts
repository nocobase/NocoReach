// Run: pnpm exec tsx tests/nocoreach/access.browser.ts
// Uses a disposable database, artificial test credentials and the real development entry.
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';

const root = resolve(import.meta.dirname, '../..');
const directory = await mkdtemp(join(tmpdir(), 'pm453-browser-'));
const output = join(tmpdir(), 'PM-453-screenshots');
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
    AGENT_ANNOTATIONS_ENABLED: 'false',
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
      throw new Error(
        `Development server exited ${child.exitCode}; see development.log`,
      );
    try {
      ready = (await fetch(`${origin}/main/api/healthz`)).ok;
    } catch {
      /* The process has not bound its entry yet. */
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
  const signedIn = await context.request.post(
    `${origin}/main/api/auth/sign-in/username`,
    { data: DEFAULT_ADMIN_CREDENTIALS, headers: { origin } },
  );
  expect(signedIn.status()).toBe(200);
  expect(
    (await context.request.get(`${origin}/main/api/swagger`)).status(),
  ).toBe(200);
  const project = await context.request.post(
    `${origin}/main/api/nocoreach/nrProjects/create`,
    {
      data: {
        name: 'Access verification',
        domain: 'access.example.test',
        language: 'en',
      },
      headers: { origin },
    },
  );
  expect(project.status()).toBe(200);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/main/members`);
  await expect(
    page.getByRole('heading', { name: 'Member', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: join(output, 'members-admin-en.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  const memberCredentials = {
    email: 'browser-member@example.test',
    password: 'fictional-password-123',
  };
  const created = await context.request.post(`${origin}/main/api/users`, {
    data: { ...memberCredentials, name: 'Synthetic member' },
    headers: { origin },
  });
  expect(created.status()).toBe(201);
  const member = (await created.json()).data;
  const assigned = await context.request.post(
    `${origin}/main/api/nocoreach/nrMembers/setRole`,
    { data: { userId: member.id, roles: ['nr.member'] }, headers: { origin } },
  );
  expect(assigned.status()).toBe(200);
  const limited = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
  });
  expect(
    (
      await limited.request.post(`${origin}/main/api/auth/sign-in/email`, {
        data: memberCredentials,
        headers: { origin },
      })
    ).status(),
  ).toBe(200);
  const memberPage = await limited.newPage();
  await memberPage.goto(`${origin}/main/members`);
  await expect(
    memberPage.getByRole('heading', { name: 'Member', exact: true }),
  ).toBeVisible();
  await expect(
    memberPage.getByRole('link', { name: 'Network', exact: true }),
  ).toHaveCount(0);
  await memberPage.screenshot({
    path: join(output, 'members-limited-en.png'),
    fullPage: true,
  });
  expect(
    (
      await limited.request.post(
        `${origin}/main/api/nocoreach/nrProxyProfiles/list`,
        { data: {}, headers: { origin } },
      )
    ).status(),
  ).toBe(403);
  await limited.close();
  await context.close();
  console.log(`English browser evidence: ${output}`);
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
        /* Already exited. */
      }
    }
  }
  log.end();
  await rm(directory, { recursive: true, force: true });
}
