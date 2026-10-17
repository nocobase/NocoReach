import { expect, test } from '@playwright/test';

// Run only against a fresh test application with synthetic administrator credentials.
const base = process.env.APP_URL?.replace(/\/$/, '') ?? '';
test.skip(
  !base || !process.env.E2E_USERNAME || !process.env.E2E_PASSWORD,
  'Requires APP_URL and synthetic E2E_USERNAME/E2E_PASSWORD',
);
test.use({
  locale: 'en-US',
  timezoneId: 'America/New_York',
  viewport: { width: 1440, height: 1000 },
  colorScheme: 'light',
});

test('selects a scheduling timezone, recalculates the next run, and retains it on reload', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/login`);
  await page
    .getByLabel('Username or email', { exact: true })
    .fill(process.env.E2E_USERNAME!);
  await page
    .getByLabel('Password', { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'));
  await page.goto(`${base}/schedules`);
  await page.getByRole('button', { name: 'Edit time', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit time' });
  await expect(dialog.getByLabel('Daily run time')).toHaveValue('09:00');
  await dialog.getByRole('combobox', { name: 'Schedule timezone' }).click();
  await page.getByPlaceholder('Search IANA timezones…').fill('Shanghai');
  await expect(
    page.getByRole('option', { name: 'Asia/Shanghai' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('timezone-search-en.png'),
    animations: 'disabled',
  });
  await page.getByRole('option', { name: 'Asia/Shanghai' }).click();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/timing') &&
      response.request().method() === 'PUT',
  );
  await dialog.getByRole('button', { name: 'Save schedule' }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  const result = (await response.json()).data;
  expect(result.timezone).toBe('Asia/Shanghai');
  expect(result.cron).toBe('0 9 * * *');
  expect(new Date(result.nextRunAt).getUTCHours()).toBe(1);
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const configuration = page.locator('[data-slot="card"]').filter({
    has: page.getByText(/^(Task configuration|任务配置)$/),
  });
  await expect(
    configuration.getByText('Asia/Shanghai', { exact: true }),
  ).toBeVisible();
  await expect(
    configuration.getByText(
      'Execution timestamps are shown in America/New_York.',
    ),
  ).toBeVisible();
  await expect(
    configuration.getByText('Next run', { exact: true }),
  ).toBeVisible();
  await expect(
    configuration
      .getByText('Next run', { exact: true })
      .locator('..')
      .locator('dd'),
  ).toHaveText(
    new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'America/New_York',
    }).format(new Date(result.nextRunAt)),
  );
  await page.screenshot({
    path: testInfo.outputPath('timezone-saved-en.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await configuration.getByText('Edit time', { exact: true }).click();
  await expect(
    dialog.getByRole('combobox', { name: 'Schedule timezone' }),
  ).toHaveText('Asia/Shanghai');
  await expect(
    dialog.getByRole('button', { name: 'Save schedule' }),
  ).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath('timezone-mobile-dark-en.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: /Language/ }).hover();
  await page.getByRole('menuitemradio', { name: /中文|Chinese/ }).click();
  await configuration.getByText('编辑时间', { exact: true }).click();
  const chinese = page.getByRole('dialog', { name: '编辑时间' });
  await expect(chinese.getByRole('combobox', { name: '调度时区' })).toHaveText(
    'Asia/Shanghai',
  );
  await expect(chinese.getByText(/夏令时切换时/)).toBeVisible();
  await chinese.getByRole('combobox', { name: '调度时区' }).click();
  await page.getByPlaceholder('搜索 IANA 时区…').fill('UTC');
  await expect(
    page.getByRole('option', { name: 'UTC', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
