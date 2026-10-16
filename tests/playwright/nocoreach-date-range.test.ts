import { expect, test, type Locator, type Page } from '@playwright/test';

// Use only a fresh isolated demo app and its synthetic administrator.
const base = process.env.APP_URL?.replace(/\/$/, '') ?? '';
test.skip(
  !base || !process.env.E2E_USERNAME || !process.env.E2E_PASSWORD,
  'Requires APP_URL and synthetic E2E_USERNAME/E2E_PASSWORD',
);
test.use({
  locale: 'en-US',
  viewport: { width: 1440, height: 1000 },
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});

async function segment(input: Locator, index: number) {
  await input.focus();
  // Chromium/en-US uses month, day, year. Move to the first segment from any current segment.
  for (let i = 0; i < 4; i++) await input.press('ArrowLeft');
  for (let i = 0; i < index; i++) await input.press('ArrowRight');
}
async function signIn(page: Page) {
  await page.goto(`${base}/login`);
  await page
    .getByLabel('Username or email', { exact: true })
    .fill(process.env.E2E_USERNAME!);
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
  // Let sign-in's locale/session/authorization bootstrap finish before navigating and counting report requests.
  await page.waitForLoadState('networkidle');
}

for (const source of ['github', 'downloads']) {
  test(`${source}: segmented drafts, Apply, validation and navigation`, async ({
    page,
    browser,
  }, testInfo) => {
    await signIn(page);
    const requests: object[] = [];
    page.on('request', (request) => {
      if (request.url().includes(`/nrDataViews/${source}`))
        requests.push(request.postDataJSON());
    });
    const url = `${base}/data/${source}?days=custom&from=2026-09-01&to=2026-09-20&view=repo`;
    const initialResponse = page.waitForResponse((response) =>
      response.url().includes(`/nrDataViews/${source}`),
    );
    await page.goto(url);
    expect((await initialResponse).ok()).toBe(true);
    await page.waitForLoadState('networkidle');
    const start = page.getByLabel('Start date', { exact: true });
    const end = page.getByLabel('End date', { exact: true });
    await expect(start).toHaveValue('2026-09-01');
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    await expect(page.locator('.nr-range-summary')).toContainText('2026-09-01');
    const before = requests.length;
    // Delete just the day, observe empty DOM value, then retype. No fill() in the reproduction.
    await segment(start, 1);
    await start.press('Delete');
    await expect(start).toHaveValue('');
    await expect(end).toHaveValue('2026-09-20');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Enter a complete, valid start date.',
    );
    await segment(start, 1);
    await page.keyboard.type('18');
    await expect(start).toHaveValue('2026-09-18');
    // Overwrite year, month and day independently at both endpoints.
    for (const input of [start, end]) {
      await segment(input, 2);
      await input.press('Delete');
      await page.keyboard.type('2026');
      await segment(input, 0);
      await input.press('Delete');
      await page.keyboard.type('09');
      await segment(input, 1);
      await input.press('Delete');
      await page.keyboard.type(input === start ? '17' : '21');
    }
    await expect(start).toHaveValue('2026-09-17');
    await expect(end).toHaveValue('2026-09-21');
    expect(page.url()).toBe(url);
    expect(requests).toHaveLength(before);
    await page.screenshot({
      path: testInfo.outputPath(`${source}-draft-en.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect.poll(() => requests.length).toBe(before + 1);
    expect(requests.at(-1)).toMatchObject({
      range: 'custom',
      from: '2026-09-17',
      to: '2026-09-21',
    });
    await expect(page.locator('.nr-range-summary')).toContainText('2026-09-17');
    await page.reload();
    await expect(start).toHaveValue('2026-09-17');
    await expect(end).toHaveValue('2026-09-21');

    // Invalid calendar day and reversed/oversized ranges stay local.
    await segment(start, 0);
    await page.keyboard.type('02');
    await segment(start, 1);
    await page.keyboard.type('30');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('valid start date');
    await start.fill('2026-09-22');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'on or before end date',
    );
    await start.fill('0001-09-18');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('490 days');
    await page.screenshot({
      path: testInfo.outputPath(`${source}-validation-en.png`),
      fullPage: true,
    });

    const presetResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/nrDataViews/${source}`) &&
        response.request().postDataJSON().range === '7',
    );
    await page
      .getByRole('button', { name: 'Last 7 days', exact: true })
      .click();
    expect((await presetResponse).ok()).toBe(true);
    expect(new URL(page.url()).searchParams.get('view')).toBe('repo');
    expect(new URL(page.url()).searchParams.has('from')).toBe(false);
    const presetUrl = page.url();
    const presetRequests = requests.length;
    await page.getByRole('button', { name: 'Custom', exact: true }).click();
    expect(page.url()).toBe(presetUrl);
    expect(requests).toHaveLength(presetRequests);
    await page.goto(url);
    await page.goBack();
    await expect(start).toHaveCount(0);
    await page.goForward();
    await expect(start).toHaveValue('2026-09-01');
    await expect(end).toHaveValue('2026-09-20');
    // Open the real native calendar indicator and select the next day with its keyboard navigation.
    const bounds = await end.boundingBox();
    await end.click({
      position: { x: bounds!.width - 15, y: bounds!.height / 2 },
    });
    await page.screenshot({
      path: testInfo.outputPath(`${source}-calendar-en.png`),
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(end).toHaveValue('2026-09-21');
    expect(page.url()).toBe(url);
    const startBounds = await start.boundingBox();
    await start.click({
      position: { x: startBounds!.width - 15, y: startBounds!.height / 2 },
    });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(start).toHaveValue('2026-09-02');
    expect(page.url()).toBe(url);
    await testInfo.attach('environment', {
      body: `${browser.version()}; en-US; Linux; headless Chromium`,
      contentType: 'text/plain',
    });
  });
}

test('Chinese validation and narrow light/dark date controls', async ({
  page,
}, testInfo) => {
  await signIn(page);
  const initialResponse = page.waitForResponse((response) =>
    response.url().includes('/nrDataViews/github'),
  );
  await page.goto(
    `${base}/data/github?days=custom&from=2026-09-01&to=2026-09-20`,
  );
  expect((await initialResponse).ok()).toBe(true);
  await expect(page.getByLabel('Start date', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: /Language/ }).hover();
  await page.getByRole('menuitemradio', { name: '中文', exact: true }).click();
  await page.keyboard.press('Escape');
  const end = page.getByLabel('结束日期', { exact: true });
  await segment(end, 1);
  await end.press('Delete');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    '请输入完整且有效的结束日期。',
  );
  await expect(page.getByLabel('开始日期', { exact: true })).toHaveValue(
    '2026-09-01',
  );
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: testInfo.outputPath('github-mobile-light-zh.png'),
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({
    path: testInfo.outputPath('github-mobile-dark-zh.png'),
  });
  for (const input of [page.getByLabel('开始日期', { exact: true }), end]) {
    const bounds = await input.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  }
});
