import { readFile } from 'node:fs/promises';
import {
  expect,
  test as baseTest,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { z } from 'zod';
import { SYSTEM_PLAYBOOKS } from '../../shared/playbook-catalog';

// Opt-in acceptance against an isolated running app. Sign in afresh; never load
// storageState or an existing browser profile. Credentials stay outside the repo.
const base = process.env.APP_URL?.replace(/\/$/, '') ?? '';
const credentialsFile = process.env.NOCOREACH_TEST_CREDENTIALS;
const fixturesFile = process.env.NOCOREACH_LEGACY_FIXTURES;
const variants = [
  'canonical',
  'instruction-changed',
  'extra-field',
  'custom',
  'edited',
  'renamed',
] as const;
const snapshot = z.object({ name: z.string() }).passthrough();
const fixturesSchema = z.array(
  z.object({
    variant: z.enum(variants),
    id: z.string(),
    work: z.object({ flow: snapshot, playbook: snapshot }),
  }),
);

// One newly authenticated context per worker avoids hammering the real sign-in
// rate limit. Pages are isolated and closed per test; no session is imported.
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
  !base || !credentialsFile || !fixturesFile,
  'Requires APP_URL, NOCOREACH_TEST_CREDENTIALS and NOCOREACH_LEGACY_FIXTURES for an isolated test app',
);
test.use({
  locale: 'en-US',
  viewport: { width: 1440, height: 1000 },
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});

async function fixtures() {
  return fixturesSchema.parse(
    JSON.parse(await readFile(fixturesFile!, 'utf8')),
  );
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
  await page.mouse.move(600, 90);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}
async function taskWork(page: Page, id: string) {
  const response = await page.request.post(
    `${base}/api/nocoreach/nrTaskWork/get`,
    {
      headers: { origin: new URL(base).origin },
      data: {
        projectId: process.env.NOCOREACH_TEST_PROJECT_ID ?? '1',
        taskId: id,
      },
    },
  );
  expect(response.ok()).toBe(true);
  return z
    .object({
      data: z.object({
        work: z
          .object({
            flow: snapshot,
            playbook: snapshot,
          })
          .passthrough(),
      }),
    })
    .parse(await response.json()).data.work;
}

async function signIn(page: Page) {
  const credentials = z
    .object({ username: z.string(), password: z.string() })
    .parse(JSON.parse(await readFile(credentialsFile!, 'utf8')));
  await page.goto(`${base}/login`);
  await page
    .getByLabel('Username or email', { exact: true })
    .fill(credentials.username);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  const [response] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/api/auth/sign-in/'),
    ),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ]);
  expect(
    response.status(),
    'Fresh test sign-in must succeed without bypassing rate limits',
  ).toBe(200);
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
}

test.beforeEach(async ({ page }) => {
  await page.goto(base);
  await language(page, 'en');
});

test('rapid view and filter changes retain the latest choices', async ({
  page,
}) => {
  const fixture = (await fixtures()).find((f) => f.variant === 'renamed')!;
  const filter = page.getByRole('combobox', { name: 'Filter by playbook' });
  const value = JSON.stringify(['name', fixture.work.playbook.name]);
  for (let i = 0; i < 3; i++) {
    await page.goto(`${base}/actions?view=board&keep=1`);
    await expect(
      page.getByRole('button', { name: 'Board', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await filter.selectOption(value);
    await expect(
      page.getByRole('button', { name: 'List', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('tbody tr[data-task-id]')).toHaveCount(1);
    await expect(
      page.locator(`tbody tr[data-task-id="${fixture.id}"]`),
    ).toBeVisible();
    await filter.selectOption(JSON.stringify(['name', '技术修复']));
    await filter.selectOption(value);
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await expect(page.locator('article[data-task-id]')).toHaveCount(1);
    await expect(
      page.locator(`article[data-task-id="${fixture.id}"]`),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get('playbookName')).toBe(
      fixture.work.playbook.name,
    );
    expect(new URL(page.url()).searchParams.get('keep')).toBe('1');
  }
});

test('back and forward are the source for the next filter change', async ({
  page,
}) => {
  const fixture = (await fixtures()).find((f) => f.variant === 'renamed')!;
  const filter = page.getByRole('combobox', { name: 'Filter by playbook' });
  const value = JSON.stringify(['name', fixture.work.playbook.name]);
  await page.goto(`${base}/actions?view=board&keep=1`);
  await filter.selectOption(value);
  await expect(page.locator('article[data-task-id]')).toHaveCount(1);
  await page.goBack();
  await expect(filter).toHaveValue('');
  await page.goForward();
  await expect(filter).toHaveValue(value);
  await page.goBack();
  await page
    .getByRole('combobox', { name: 'Filter by status' })
    .selectOption('doing');
  await expect(page).toHaveURL(/status=doing/);
  expect(new URL(page.url()).searchParams.get('playbookName')).toBeNull();
  expect(new URL(page.url()).searchParams.get('view')).toBe('board');
  expect(new URL(page.url()).searchParams.get('keep')).toBe('1');
});

for (const variant of variants) {
  test(`legacy ${variant} snapshots preserve data while switching language`, async ({
    page,
  }, info) => {
    const fixture = (await fixtures()).find((f) => f.variant === variant)!;
    const before = await taskWork(page, fixture.id);
    expect(before.flow).toEqual(fixture.work.flow);
    expect(before.playbook).toEqual(fixture.work.playbook);
    await page.goto(`${base}/actions/${fixture.id}`);
    const name =
      variant === 'canonical' ? 'Technical fix' : fixture.work.playbook.name;
    const step = variant === 'canonical' ? 'Write plan' : '出方案';
    await expect(page.locator('.nr-td-meta')).toContainText(name);
    await expect(page.locator('.nr-td-steps')).toContainText(step);
    await page.screenshot({
      path: info.outputPath('english.png'),
      fullPage: true,
    });
    await language(page, 'zh');
    await expect(page.locator('.nr-td-meta')).toContainText(
      fixture.work.playbook.name,
    );
    await expect(page.locator('.nr-td-steps')).toContainText('出方案');
    await page.screenshot({
      path: info.outputPath('chinese.png'),
      fullPage: true,
    });
    await language(page, 'en');
    await expect(page.locator('.nr-td-meta')).toContainText(name);
    await expect(page.locator('.nr-td-steps')).toContainText(step);
    expect(await taskWork(page, fixture.id)).toEqual(before);
  });
}

test('all unedited built-in detail panels render English instructions', async ({
  page,
}) => {
  // Use canonical, unedited definitions in the isolated fixture project.
  for (const playbook of SYSTEM_PLAYBOOKS) {
    await page.goto(`${base}/playbooks?id=${playbook.id}`);
    const detail = page.getByRole('region', { name: 'Playbook details' });
    await expect(detail).toBeVisible();
    await expect(detail).not.toContainText(/[一-鿿]/u);
    if (playbook.id === 'tech-fix')
      await expect(detail).toContainText('Do not edit files yet.');
    if (playbook.id === 'community-reply')
      await expect(detail).toContainText('Draft one reply for each post');
  }
});

test('character typing during loading and filter transitions does not lose text', async ({
  page,
}, info) => {
  const observations: {
    phase: string;
    delay: number;
    input: string;
    query: string | null;
  }[] = [];
  for (const phase of ['loading', 'filter']) {
    for (const delay of [0, 10, 30, 100]) {
      for (let iteration = 0; iteration < 5; iteration++) {
        // Use real requests without delay injection, CPU throttling or mocked data.
        // Do not wait for business requests or task rows before typing.
        await page.goto(
          `${base}/actions?view=${phase === 'loading' ? 'list' : 'board'}&keep=typing`,
        );
        const input = page.getByRole('textbox', { name: 'Search tasks' });
        await expect(input).toHaveValue('');
        if (phase === 'filter') {
          await page.getByRole('button', { name: 'List', exact: true }).click();
          await page
            .getByRole('combobox', { name: 'Filter by playbook' })
            .selectOption(JSON.stringify(['name', '技术修复']));
          await page
            .getByRole('combobox', { name: 'Filter by status' })
            .selectOption('doing');
        }
        // fill() would conceal a controlled input reset between characters.
        await input.pressSequentially('Review', { delay });
        const text = await input.inputValue();
        await page.waitForTimeout(400); // Allow the documented 300ms URL debounce.
        observations.push({
          phase,
          delay,
          input: text,
          query: new URL(page.url()).searchParams.get('q'),
        });
        expect(new URL(page.url()).searchParams.get('keep')).toBe('typing');
      }
    }
  }
  await info.attach('search-observations', {
    body: JSON.stringify(observations, null, 2),
    contentType: 'application/json',
  });
  expect(
    observations.filter(
      (result) => result.input !== 'Review' || result.query !== 'Review',
    ),
  ).toEqual([]);
});

test('search preserves caret, IME text and browser history', async ({
  page,
  context,
}, info) => {
  await page.goto(`${base}/actions?view=list&q=Task&keep=history`);
  const input = page.getByRole('textbox', { name: 'Search tasks' });
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await input.press('ControlOrMeta+A');
  await input.press('Backspace');
  await input.pressSequentially('Review');
  await expect(page).toHaveURL(/q=Review/);
  await input.press('Home');
  await input.press('ArrowRight');
  await input.press('ArrowRight');
  await input.pressSequentially('X');
  await expect(input).toHaveValue('ReXview');
  expect(
    await input.evaluate((element) =>
      'selectionStart' in element ? element.selectionStart : null,
    ),
  ).toBe(3);
  await input.press('Backspace');
  await expect(input).toHaveValue('Review');
  await page.goBack();
  await expect(input).toHaveValue('Task');
  await page.goForward();
  await expect(input).toHaveValue('Review');
  await input.press('ControlOrMeta+A');
  await input.pressSequentially('pending');
  await page.goBack();
  await expect(input).toHaveValue('Task');
  await page.waitForTimeout(400);
  expect(new URL(page.url()).searchParams.get('q')).toBe('Task');

  await input.press('ControlOrMeta+A');
  await input.press('Backspace');
  const cdp = await context.newCDPSession(page);
  try {
    // Chromium's actual composition protocol emits native IME events.
    await cdp.send('Input.imeSetComposition', {
      text: 'zhongwen',
      selectionStart: 8,
      selectionEnd: 8,
    });
    await expect(input).toHaveValue('zhongwen');
    await page.waitForTimeout(400);
    expect(new URL(page.url()).searchParams.get('q')).toBe('Task');
    await cdp.send('Input.insertText', { text: '中文 {0}' });
    await expect(input).toHaveValue('中文 {0}');
    await expect
      .poll(() => new URL(page.url()).searchParams.get('q'))
      .toBe('中文 {0}');
  } finally {
    await cdp.detach();
  }
  await language(page, 'zh');
  await expect(page.getByRole('textbox', { name: '搜索任务' })).toHaveValue(
    '中文 {0}',
  );
  await page.screenshot({
    path: info.outputPath('search-ime.png'),
    fullPage: true,
  });
  await language(page, 'en');
  await expect(input).toHaveValue('中文 {0}');
});
