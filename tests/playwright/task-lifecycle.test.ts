import { readFile, writeFile } from 'node:fs/promises';

import {
  expect,
  test as baseTest,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
  type TestInfo,
} from '@playwright/test';
import { z } from 'zod';

// Opt in against a disposable mock deployment. Fixture setup creates two fresh
// tasks, an accessible offline Runner Agent, and no repository or live model.
// All task mutations below are browser clicks; the API is only observed.
const base = process.env.APP_URL?.replace(/\/$/, '') ?? '';
const credentialsFile = process.env.NOCOREACH_TEST_CREDENTIALS;
const fixturesFile = process.env.NOCOREACH_LIFECYCLE_FIXTURES;
const restartDirectory = process.env.NOCOREACH_LIFECYCLE_RESTART_DIRECTORY;
const enabled = process.env.NOCOREACH_MOCK_BROWSER_QA === '1';
const credentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
});
const fixturesSchema = z.object({
  projectId: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  cancelTaskId: z.string(),
  completeTaskId: z.string(),
});
const artifactSchema = z
  .object({
    id: z.string(),
    content: z.string(),
    version: z.number(),
    manual: z.boolean().optional(),
    rejectedAt: z.string().optional(),
    approvedAt: z.string().optional(),
  })
  .passthrough();
const dataSchema = z.object({
  task: z
    .object({ id: z.union([z.string(), z.number()]), title: z.string() })
    .passthrough(),
  work: z
    .object({
      revision: z.number(),
      stage: z.string(),
      stageIndex: z.number().optional(),
      flow: z
        .object({
          id: z.string(),
          stages: z.array(
            z
              .object({ key: z.string(), kind: z.string(), name: z.string() })
              .passthrough(),
          ),
        })
        .optional(),
      results: z.array(artifactSchema.nullable()),
      history: z.array(z.object({ action: z.string() }).passthrough()),
      cancelledAt: z.string().optional(),
      observeFrom: z.string().optional(),
      release: z.object({ state: z.string() }).passthrough().optional(),
    })
    .passthrough(),
  lifecycle: z
    .object({
      name: z.string(),
      engine: z.string(),
      state: z.string(),
      version: z.number(),
    })
    .nullable(),
  runs: z.array(z.object({ id: z.string() }).passthrough()),
  agent: z
    .object({ agentId: z.string().nullable().optional(), repo: z.unknown() })
    .passthrough(),
});
type TaskData = z.infer<typeof dataSchema>;

async function attachJson(info: TestInfo, name: string, value: unknown) {
  const path = info.outputPath(`${name}.json`);
  await writeFile(path, JSON.stringify(value, null, 2));
  await info.attach(name, { path, contentType: 'application/json' });
}

// Same fresh, one-per-worker sign-in used by the existing mock browser checks.
// The synthetic password is loaded at runtime and no storageState is saved.
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
  await page
    .getByRole('button', { name: /Open account menu|打开账户菜单/ })
    .click();
  await page.getByRole('menuitem', { name: /Language|语言/ }).hover();
  await page
    .getByRole('menuitemradio', { name: 'English', exact: true })
    .click();
  await page.mouse.move(600, 90);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}

const test = baseTest.extend<object, { sessionContext: BrowserContext }>({
  sessionContext: [
    async ({ browser }, provide) => {
      const context = await browser.newContext({
        locale: 'en-US',
        viewport: { width: 1440, height: 1000 },
      });
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
  !enabled || !base || !credentialsFile || !fixturesFile,
  'Requires NOCOREACH_MOCK_BROWSER_QA=1, APP_URL, synthetic NOCOREACH_TEST_CREDENTIALS and NOCOREACH_LIFECYCLE_FIXTURES',
);
test.use({
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});
test.describe.configure({ mode: 'serial' });

const browserIssues = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const issues: string[] = [];
  browserIssues.set(page, issues);
  page.on('pageerror', (error) => issues.push(`Page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`Console: ${message.text()}`);
  });
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.includes('/api/') && response.status() >= 400) {
      issues.push(`API: ${response.status()} ${path}`);
    }
  });
});

async function fixtures() {
  return fixturesSchema.parse(
    JSON.parse(await readFile(fixturesFile!, 'utf8')),
  );
}

function taskResponse(
  response: Response,
  taskId: string,
  action: string,
  command?: string,
) {
  if (
    !response.url().endsWith(`/api/nocoreach/nrTaskWork/${action}`) ||
    response.request().method() !== 'POST'
  )
    return false;
  const body = z
    .object({
      taskId: z.union([z.string(), z.number()]),
      command: z.string().optional(),
    })
    .safeParse(response.request().postDataJSON());
  return (
    body.success &&
    String(body.data.taskId) === taskId &&
    (!command || body.data.command === command)
  );
}

async function readResponse(response: Response): Promise<TaskData> {
  expect(
    response.status(),
    'The UI command must commit through the real application',
  ).toBe(200);
  return z.object({ data: dataSchema }).parse(await response.json()).data;
}

async function clickCommand(
  page: Page,
  taskId: string,
  command: string,
  button: Locator,
) {
  const response = page.waitForResponse((result) =>
    taskResponse(result, taskId, 'advance', command),
  );
  await button.click();
  const data = await readResponse(await response);
  await expect(page.locator('.nr-task-page [role="alert"]')).toHaveCount(0);
  expect(
    data.runs,
    'Manual mock acceptance must never enqueue a Runner or model run',
  ).toHaveLength(0);
  return data;
}

async function reloadTask(page: Page, taskId: string) {
  const response = page.waitForResponse((result) =>
    taskResponse(result, taskId, 'get'),
  );
  await page.reload();
  const data = await readResponse(await response);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    data.task.title,
  );
  return data;
}

function expectState(data: TaskData, state: string, index?: number) {
  expect(data.lifecycle).toMatchObject({
    name: 'nocoreach.task.v1',
    engine: 'lifecycle-v1',
    state,
  });
  expect(data.lifecycle!.version).toBeGreaterThan(0);
  if (index !== undefined) expect(data.work.stageIndex).toBe(index);
  expect(data.runs).toHaveLength(0);
}

async function startTask(page: Page, taskId: string) {
  const fixture = await fixtures();
  const response = page.waitForResponse((result) =>
    taskResponse(result, taskId, 'get'),
  );
  await page.goto(`${base}/actions/${taskId}`);
  let data = await readResponse(await response);
  await expect(page.getByTestId('mock-environment-banner')).toBeVisible();
  expect(data.work.stage).toBe('plan');
  expect(
    data.agent.repo,
    'A manual technical fix must not have a connected repository',
  ).toBeFalsy();
  expect(data.runs).toHaveLength(0);
  await page
    .getByRole('combobox', { name: 'Playbook', exact: true })
    .selectOption('tech-fix');
  if (data.agent.agentId !== fixture.agentId) {
    await page
      .getByRole('combobox', { name: 'Execution agent', exact: true })
      .click();
    data = await clickCommand(
      page,
      taskId,
      'setAgent',
      page.getByRole('option').filter({ hasText: fixture.agentName }),
    );
    expect(data.agent.agentId).toBe(fixture.agentId);
  }
  await page
    .getByRole('textbox', { name: 'Additional notes', exact: true })
    .pressSequentially('Browser acceptance: record the work manually.');
  data = await clickCommand(
    page,
    taskId,
    'startTask',
    page.getByRole('button', { name: 'Start', exact: true }),
  );
  expectState(data, 'ready', 0);
  expect(data.work.flow?.id).toBe('tech-fix');
  await expect(
    page.locator('.nr-td-await').getByRole('heading', { level: 3 }),
  ).toHaveText('Write plan');
  return data;
}

async function recordManual(
  page: Page,
  taskId: string,
  content: string,
  index: number,
) {
  await page
    .getByRole('button', { name: "I'll do it myself", exact: true })
    .click();
  const field = page.getByRole('textbox', {
    name: index === 0 ? 'Analysis result' : 'Change history',
    exact: true,
  });
  await field.pressSequentially(content);
  const data = await clickCommand(
    page,
    taskId,
    'recordManual',
    page.getByRole('button', { name: 'Record and continue', exact: true }),
  );
  expectState(data, 'review', index + 1);
  expect(data.work.results[index]).toMatchObject({ content, manual: true });
  await expect(page.locator('.nr-td-await')).toContainText(content);
  return data;
}

test.afterEach(async ({ page, browser }, info) => {
  await info.attach('browser-version', {
    body: browser.version(),
    contentType: 'text/plain',
  });
  await writeFile(
    info.outputPath('final-dom.txt'),
    await page.locator('body').innerText(),
  );
  await page.screenshot({
    path: info.outputPath(
      info.status === info.expectedStatus ? 'final.png' : 'failure.png',
    ),
    fullPage: true,
  });
  await attachJson(info, 'browser-checks', {
    browserVersion: browser.version(),
    issues: browserIssues.get(page) ?? [],
  });
  expect(browserIssues.get(page)).toEqual([]);
});

test('manual technical fix survives return, another review, cancellation and refresh', async ({
  page,
}, info) => {
  const fixture = await fixtures();
  const taskId = fixture.cancelTaskId;
  const started = await startTask(page, taskId);
  expectState(await reloadTask(page, taskId), 'ready', 0);

  const first = await recordManual(
    page,
    taskId,
    'Plan v1: inspect the redirect and add a regression check.',
    0,
  );
  await page.screenshot({
    path: info.outputPath('plan-review.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Request changes', exact: true })
    .click();
  const feedback = page.getByRole('textbox', {
    name: 'Note to the executor',
    exact: true,
  });
  await expect(feedback).toBeFocused();
  await feedback.pressSequentially(
    'Also preserve query parameters and document the rollback.',
  );
  const returned = await clickCommand(
    page,
    taskId,
    'requestStageChanges',
    page.getByRole('button', { name: 'Send and request changes', exact: true }),
  );
  expectState(returned, 'ready', 0);
  expect(returned.work.results[0]?.id).toBe(first.work.results[0]?.id);
  expect(returned.work.results[0]?.rejectedAt).toBeTruthy();
  expectState(await reloadTask(page, taskId), 'ready', 0);
  await expect(
    page.getByText(
      'Also preserve query parameters and document the rollback.',
      { exact: true },
    ),
  ).toBeVisible();

  const second = await recordManual(
    page,
    taskId,
    'Plan v2: preserve query parameters, test the redirect, and record rollback steps.',
    0,
  );
  expect(second.work.results[0]?.version).toBe(2);
  expect(second.work.results[0]?.id).not.toBe(first.work.results[0]?.id);
  const approved = await clickCommand(
    page,
    taskId,
    'approveStage',
    page.getByRole('button', { name: /^Approve and hand to / }),
  );
  expectState(approved, 'ready', 2);
  await recordManual(
    page,
    taskId,
    'Manual change: corrected the redirect locally and checked the regression.',
    2,
  );

  await page.getByRole('button', { name: 'Close task', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(approved.task.title);
  const cancelled = await clickCommand(
    page,
    taskId,
    'cancelTask',
    dialog.getByRole('button', { name: 'Close task', exact: true }),
  );
  expectState(cancelled, 'cancelled', 3);
  expect(cancelled.work.cancelledAt).toBeTruthy();
  expect(cancelled.lifecycle!.version).toBeGreaterThan(
    started.lifecycle!.version,
  );
  const refreshed = await reloadTask(page, taskId);
  expectState(refreshed, 'cancelled', 3);
  expect(refreshed.work.results.filter(Boolean)).toHaveLength(2);
  await expect(page.locator('.nr-td-await')).toHaveAttribute(
    'data-tone',
    'closed',
  );
  await expect(
    page.getByRole('button', { name: 'Start', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: "I'll do it myself", exact: true }),
  ).toHaveCount(0);
  await attachJson(info, 'persisted-lifecycle', refreshed.lifecycle);
});

test('manual publication completes the task while 7/28-day observations remain pending', async ({
  page,
}, info) => {
  const fixture = await fixtures();
  const taskId = fixture.completeTaskId;
  await startTask(page, taskId);
  await recordManual(
    page,
    taskId,
    'Plan: fix the broken internal link and verify the published page.',
    0,
  );
  expectState(
    await clickCommand(
      page,
      taskId,
      'approveStage',
      page.getByRole('button', { name: /^Approve and hand to / }),
    ),
    'ready',
    2,
  );
  await recordManual(
    page,
    taskId,
    'Manual change: replaced the broken link and verified the destination.',
    2,
  );
  const release = await clickCommand(
    page,
    taskId,
    'approveStage',
    page.getByRole('button', { name: 'Publish', exact: true }),
  );
  expectState(release, 'release', 4);
  expect(release.work.release?.state).toBe('not_seen');
  expectState(await reloadTask(page, taskId), 'release', 4);
  const done = await clickCommand(
    page,
    taskId,
    'confirmLive',
    page.getByRole('button', { name: "I confirm it's live", exact: true }),
  );
  expectState(done, 'completed', 5);
  expect(done.work.stage).toBe('done');
  expect(done.work.observeFrom).toBeTruthy();
  expect(done.work.release?.state).toBe('live');
  const refreshed = await reloadTask(page, taskId);
  expectState(refreshed, 'completed', 5);
  expect(refreshed.work.observeFrom).toBe(done.work.observeFrom);
  await expect(
    page.locator('.nr-td-await').getByRole('heading', { level: 3 }),
  ).toHaveText('Live');
  await expect(page.getByText(/^Day 7: results about /)).toBeVisible();
  await expect(page.getByText(/^Day 28: results about /)).toBeVisible();
  expect(
    refreshed.work.history.filter((event) => event.action === 'startTask'),
  ).toHaveLength(1);
  expect(
    refreshed.work.history.filter((event) => event.action === 'confirmLive'),
  ).toHaveLength(1);
  await attachJson(info, 'persisted-lifecycle', {
    lifecycle: refreshed.lifecycle,
    observeFrom: refreshed.work.observeFrom,
  });
});

test('published and cancelled tasks survive an application restart', async ({
  page,
}, info) => {
  test.skip(
    !restartDirectory,
    'The disposable deployment wrapper must handle the restart request',
  );
  const fixture = await fixtures();
  // Leave the page before shutting down the server. The wrapper restarts the
  // same build and database; this worker keeps the same Chromium instance.
  await page.goto('about:blank');
  await writeFile(`${restartDirectory}/request.json`, '{}', { flag: 'wx' });
  await expect
    .poll(
      async () => {
        try {
          return z
            .object({ ok: z.boolean() })
            .parse(
              JSON.parse(
                await readFile(`${restartDirectory}/ready.json`, 'utf8'),
              ),
            );
        } catch (error) {
          if (
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
          )
            return undefined;
          throw error;
        }
      },
      { timeout: 30_000, message: 'The production build must restart cleanly' },
    )
    .toEqual({ ok: true });
  await page.context().clearCookies();
  await signIn(page);

  async function readTask(taskId: string) {
    const response = page.waitForResponse((result) =>
      taskResponse(result, taskId, 'get'),
    );
    await page.goto(`${base}/actions/${taskId}`);
    return readResponse(await response);
  }
  const cancelled = await readTask(fixture.cancelTaskId);
  expectState(cancelled, 'cancelled', 3);
  expect(cancelled.work.cancelledAt).toBeTruthy();
  expect(cancelled.work.results.filter(Boolean)).toHaveLength(2);
  expect(cancelled.work.results[0]?.version).toBe(2);
  await expect(page.locator('.nr-td-await')).toHaveAttribute(
    'data-tone',
    'closed',
  );
  await page.screenshot({
    path: info.outputPath('cancelled-after-restart.png'),
    fullPage: true,
  });

  const completed = await readTask(fixture.completeTaskId);
  expectState(completed, 'completed', 5);
  expect(completed.work.stage).toBe('done');
  expect(completed.work.observeFrom).toBeTruthy();
  expect(completed.work.release?.state).toBe('live');
  expect(completed.work.results.filter(Boolean)).toHaveLength(2);
  expect(
    completed.work.history.filter((event) => event.action === 'startTask'),
  ).toHaveLength(1);
  expect(
    completed.work.history.filter((event) => event.action === 'confirmLive'),
  ).toHaveLength(1);
  await expect(
    page.locator('.nr-td-await').getByRole('heading', { level: 3 }),
  ).toHaveText('Live');
  await expect(page.getByText(/^Day 7: results about /)).toBeVisible();
  await expect(page.getByText(/^Day 28: results about /)).toBeVisible();
  await attachJson(info, 'lifecycle-after-restart', {
    cancelled: cancelled.lifecycle,
    completed: completed.lifecycle,
    observeFrom: completed.work.observeFrom,
  });
});
