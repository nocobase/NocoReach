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
  const row = page.getByRole('row').filter({
    has: page.getByText('Daily analysis', { exact: true }),
  });
  // Changing the time is in the row's "…" menu.
  const changeTime = async (more: string, name: string) => {
    await row.getByRole('button', { name: more }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  };
  await changeTime('More actions', 'Change time');
  const dialog = page.getByRole('dialog', {
    name: 'Change the time of “Daily analysis”',
  });
  await expect(dialog.getByLabel('Every day at')).toHaveValue('09:00');
  await dialog.getByRole('combobox', { name: 'Timezone' }).click();
  await page
    .getByPlaceholder('Search timezones, e.g. Shanghai')
    .fill('Shanghai');
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
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  const result = (await response.json()).data;
  expect(result.timezone).toBe('Asia/Shanghai');
  expect(result.cron).toBe('0 9 * * *');
  expect(new Date(result.nextRunAt).getUTCHours()).toBe(1);
  await expect(dialog).toHaveCount(0);
  await page.reload();
  // The row names the timezone plainly; the IANA id is under Technical details.
  await expect(row.getByText('Daily at 09:00')).toBeVisible();
  await expect(row.getByText('China Standard Time')).toBeVisible();
  // Last and next runs are in the browser's timezone, said in the ⓘ beside Last run.
  await page.getByRole('button', { name: 'About these times' }).click();
  await expect(page.getByText(/Times shown in Eastern Time/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({
    path: testInfo.outputPath('timezone-saved-en.png'),
    animations: 'disabled',
  });
  await row.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Technical details' }).click();
  const details = page.getByRole('dialog', { name: 'Technical details' });
  await expect(
    details.getByText('Asia/Shanghai', { exact: true }),
  ).toBeVisible();
  await expect(details.getByText('0 9 * * *')).toBeVisible();
  await details.getByRole('button', { name: 'Close' }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await changeTime('More actions', 'Change time');
  await expect(dialog.getByRole('combobox', { name: 'Timezone' })).toHaveText(
    'China Standard Time · Asia/Shanghai',
  );
  await expect(
    dialog.getByRole('button', { name: 'Save', exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath('timezone-mobile-dark-en.png'),
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('menuitem', { name: /Language/ }).hover();
  await page
    .getByRole('menuitemradio', { name: '简体中文', exact: true })
    .click();
  await changeTime('更多操作', '修改时间');
  const chinese = page.getByRole('dialog', { name: '修改“每日分析”的时间' });
  await expect(chinese.getByRole('combobox', { name: '时区' })).toHaveText(
    '中国标准时间 · Asia/Shanghai',
  );
  await expect(chinese.getByText(/多数数据源每天约 08:00 更新/)).toBeVisible();
  await chinese.getByRole('combobox', { name: '时区' }).click();
  await page.getByPlaceholder('搜索时区，例如 Shanghai').fill('UTC');
  await expect(
    page.getByRole('option', { name: 'UTC', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
