import { expect, test, type Page } from '@playwright/test';

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
// Day buttons are named by their full date, e.g. "Thursday, September 17th, 2026".
const day = (page: Page, date: string) =>
  page.getByRole('button', { name: new RegExp(`, ${date}, 2026`) });
// The draft lives in the calendar; the neighbouring month's hidden outside days are skipped.
const selected = (page: Page) =>
  page.locator('[role=gridcell][aria-selected=true]:not([data-outside])');

for (const source of ['github', 'downloads']) {
  test(`${source}: calendar drafts, Apply, validation and navigation`, async ({
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
    const committed = page.getByRole('button', {
      name: 'Sep 1, 2026 – Sep 20, 2026',
      exact: true,
    });
    await expect(committed).toBeVisible();
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    await expect(page.locator('.nr-range-summary')).toContainText('2026-09-01');
    const before = requests.length;

    // The first click starts a new range and the second ends it; nothing is sent before Apply.
    await committed.click();
    await expect(
      page.getByRole('grid', { name: 'August 2026', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('grid', { name: 'September 2026', exact: true }),
    ).toBeVisible();
    await day(page, 'September 17th').click();
    await expect(selected(page)).toHaveCount(1);
    // The trigger keeps the committed range, so the calendar stays put between the clicks.
    await expect(committed).toBeVisible();
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Enter a complete, valid end date.',
    );
    await day(page, 'September 21st').click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(selected(page)).toHaveCount(5);
    expect(page.url()).toBe(url);
    expect(requests).toHaveLength(before);
    await page.screenshot({
      animations: 'disabled',
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
    await expect(page.getByRole('grid')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Sep 17, 2026 – Sep 21, 2026' }),
    ).toBeFocused();
    await expect(page.locator('.nr-range-summary')).toContainText('2026-09-17');
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Sep 17, 2026 – Sep 21, 2026' }),
    ).toBeVisible();

    // Oversized linked ranges stay local and explain the limit.
    const longUrl = `${base}/data/${source}?days=custom&from=2025-01-01&to=2026-05-06`;
    await page.goto(longUrl);
    await page
      .getByRole('button', { name: 'Jan 1, 2025 – May 6, 2026' })
      .click();
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('490 days');
    expect(page.url()).toBe(longUrl);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`${source}-validation-en.png`),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('grid')).toHaveCount(0);

    const presetResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/nrDataViews/${source}`) &&
        response.request().postDataJSON().range === '7',
    );
    await page
      .getByRole('button', { name: 'Last 7 days', exact: true })
      .click();
    expect((await presetResponse).ok()).toBe(true);
    expect(new URL(page.url()).searchParams.has('from')).toBe(false);
    const presetUrl = page.url();
    const presetRequests = requests.length;
    // Custom opens on the last 28 days without sending them, and stops at this month.
    await page.getByRole('button', { name: 'Custom', exact: true }).click();
    await expect(page.getByRole('grid')).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: 'Go to the Next Month' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(page.url()).toBe(presetUrl);
    expect(requests).toHaveLength(presetRequests);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`${source}-calendar-en.png`),
    });
    await page.keyboard.press('Escape');

    await page.goto(url);
    await page.goBack();
    await expect(committed).toHaveCount(0);
    await page.goForward();
    await expect(committed).toBeVisible();
    await testInfo.attach('environment', {
      body: `${browser.version()}; en-US; Linux; headless Chromium`,
      contentType: 'text/plain',
    });
  });
}

test('Chinese validation and the narrow light/dark calendar', async ({
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
  await expect(
    page.getByRole('button', { name: 'Sep 1, 2026 – Sep 20, 2026' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: /Language/ }).hover();
  await page.getByRole('menuitemradio', { name: '中文', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 375, height: 812 });
  await page
    .getByRole('button', { name: '2026年9月1日 – 2026年9月20日' })
    .click();
  // One month at a time on a phone.
  await expect(page.getByRole('grid')).toHaveCount(1);
  await expect(
    page.getByRole('grid', { name: '2026年9月', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^2026年9月5日/ }).click();
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    '请输入完整且有效的结束日期。',
  );
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('github-mobile-light-zh.png'),
  });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({
    animations: 'disabled',
    path: testInfo.outputPath('github-mobile-dark-zh.png'),
  });
  const bounds = await page
    .locator('[data-slot=popover-content]')
    .boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
});
