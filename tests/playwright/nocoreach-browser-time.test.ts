import { expect, test } from '@playwright/test';

// Run against a dedicated test application with synthetic administrator credentials.
const base = process.env.APP_URL?.replace(/\/$/, '') ?? '';
test.skip(
  !base || !process.env.E2E_USERNAME || !process.env.E2E_PASSWORD,
  'Requires APP_URL and synthetic E2E_USERNAME/E2E_PASSWORD',
);
test.use({ locale: 'en-US', viewport: { width: 1440, height: 1000 } });

for (const timezoneId of [
  'Asia/Shanghai',
  'America/New_York',
  'Australia/Melbourne',
]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    test('shows run instants in browser time and saves the configured clock unchanged', async ({
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
      const apiDocs = await page.request.get(`${base}/api/swagger`);
      expect(apiDocs.ok()).toBe(true);
      const response = await page.request.get(
        `${base}/api/scheduler/schedules`,
      );
      expect(response.ok()).toBe(true);
      const schedule = (await response.json()).data.find(
        (s: { key: string }) => s.key === 'nocoreach.daily-analysis',
      );
      expect(schedule).toBeTruthy();
      const [minute, hour] = schedule.cron.trim().split(/\s+/);
      const configuredTime = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
      const localClock = new Intl.DateTimeFormat('en-US', {
        timeZone: timezoneId,
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(schedule.nextRunAt));
      await page.goto(`${base}/home`);
      await expect(
        page.getByRole('link', {
          name: `every day at ${localClock}`,
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('insights-local-en.png'),
        animations: 'disabled',
      });
      await page.goto(`${base}/rules`);
      await page
        .getByRole('button', { name: 'What is Rules', exact: true })
        .click();
      await expect(page.locator('[data-rules-schedule]')).toHaveText(
        `Analyzed every day at ${localClock}; changes apply to the next analysis.`,
      );
      await page.screenshot({
        path: testInfo.outputPath('rules-local-en.png'),
        animations: 'disabled',
      });
      await page.goto(`${base}/connections?tab=health`);
      const healthRow = page
        .getByRole('row')
        .filter({ has: page.getByText('Daily analysis', { exact: true }) });
      await expect(healthRow).toContainText(`Runs daily at ${localClock}`);
      await healthRow.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath('health-local-en.png'),
        animations: 'disabled',
      });
      await page.goto(`${base}/schedules`);
      const row = page
        .getByRole('row')
        .filter({ has: page.getByText('Daily analysis', { exact: true }) });
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: 'More actions' }).click();
      await page
        .getByRole('menuitem', { name: 'Technical details', exact: true })
        .click();
      const details = page.getByRole('dialog', {
        name: 'Technical details',
        exact: true,
      });
      const shown = new Intl.DateTimeFormat('en-US', {
        timeZone: timezoneId,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(schedule.nextRunAt));
      await expect(details.getByText(shown, { exact: true })).toBeVisible();
      await expect(
        details.getByText(schedule.timezone, { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath('run-details-en.png'),
        animations: 'disabled',
      });
      await details.getByRole('button', { name: 'Close', exact: true }).click();
      await row.getByRole('button', { name: 'More actions' }).click();
      await Promise.all([
        page.waitForResponse(
          (r) =>
            r.url().endsWith(`/scheduler/schedules/${schedule.id}`) &&
            r.request().method() === 'GET',
        ),
        page
          .getByRole('menuitem', { name: 'Change time', exact: true })
          .click(),
      ]);
      const edit = page.getByRole('dialog', {
        name: 'Change the time of “Daily analysis”',
      });
      await expect(edit.getByLabel('Every day at')).toHaveValue(configuredTime);
      await expect(
        edit.getByRole('combobox', { name: 'Timezone' }),
      ).toContainText(schedule.timezone);
      await page.screenshot({
        path: testInfo.outputPath('configured-time-en.png'),
        animations: 'disabled',
      });
      const saving = page.waitForResponse(
        (r) => r.url().endsWith('/timing') && r.request().method() === 'PUT',
      );
      await edit.getByRole('button', { name: 'Save', exact: true }).click();
      const saved = await saving;
      expect(saved.request().postDataJSON()).toEqual({
        time: configuredTime,
        timezone: schedule.timezone,
      });
      expect(saved.ok()).toBe(true);
      expect((await saved.json()).data).toMatchObject({
        cron: schedule.cron,
        timezone: schedule.timezone,
        nextRunAt: schedule.nextRunAt,
      });
      await page.reload();
      await expect(row).toContainText(`Daily at ${configuredTime}`);
      await page.screenshot({
        path: testInfo.outputPath('schedule-saved-en.png'),
        animations: 'disabled',
      });
      expect(errors).toEqual([]);
    });
  });
}
