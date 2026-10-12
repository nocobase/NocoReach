import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';
import {
  systemSchedule,
  systemOccurrence,
  missingModelEnglish,
  unknownError,
} from '../fixtures/nocoreach-schedule.js';

const base = process.env.APP_URL?.replace(/\/$/, '') ?? '';
const credentialsFile = process.env.NOCOREACH_TEST_CREDENTIALS;
test.skip(
  !base || !credentialsFile,
  'Requires an isolated app and synthetic credentials',
);
test.use({
  locale: 'en-US',
  viewport: { width: 1440, height: 1000 },
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});
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
  await expect(page.locator('html')).toHaveAttribute(
    'lang',
    locale === 'en' ? /^en/ : /^zh/,
  );
}
const scheduleSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  description: z.string().optional(),
  targetType: z.string(),
  targetSummary: z.object({
    targetLabel: z.string(),
    description: z.string().optional(),
  }),
});

test('Scheduler localizes system copy and preserves custom fields and upstream history', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const credentials = z
    .object({ username: z.string(), password: z.string() })
    .parse(JSON.parse(await readFile(credentialsFile!, 'utf8')));
  await page.goto(`${base}/login`);
  await page
    .getByLabel(/Username or email|用户名或邮箱/, { exact: true })
    .fill(credentials.username);
  await page
    .getByLabel(/Password|密码/, { exact: true })
    .fill(credentials.password);
  const [signedIn] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/sign-in/')),
    page.getByRole('button', { name: /^Sign in$|^登录$/ }).click(),
  ]);
  expect(signedIn.status()).toBe(200);
  await page.waitForURL((u) => !u.pathname.endsWith('/login'));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const observations: { name: string; result: string }[] = [];
  const readSchedules = async () => {
    const response = await page.request.get(`${base}/api/scheduler/schedules`);
    expect(response.status()).toBe(200);
    return z
      .object({ data: z.array(scheduleSchema) })
      .parse(await response.json()).data;
  };
  try {
    const before = await readSchedules();
    const system = before.find((s) => s.key === systemSchedule.key);
    expect(system).toBeDefined();
    await page.goto(`${base}/settings/schedules`);
    await language(page, 'en');
    await page
      .getByRole('searchbox', { name: 'Search schedules' })
      .pressSequentially('NocoReach daily analysis', { delay: 30 });
    await expect(
      page.getByRole('link', { name: 'NocoReach daily analysis', exact: true }),
    ).toBeVisible();
    await language(page, 'zh');
    await expect(
      page.getByRole('link', { name: 'NocoReach 每日分析', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'NocoReach 每日分析', exact: true })
      .click();
    for (const locale of ['en', 'zh', 'en'] as const) {
      await language(page, locale);
      await expect(
        page.getByRole('heading', {
          name:
            locale === 'en' ? 'NocoReach daily analysis' : 'NocoReach 每日分析',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText(
          locale === 'en'
            ? 'Calculate signals for each project and ask online AI for observations and recommendations.'
            : systemSchedule.targetSummary.description,
          { exact: true },
        ),
      ).toBeVisible();
      if (locale === 'en') {
        await expect(
          page.getByText(systemSchedule.description, { exact: true }),
        ).toHaveCount(0);
        await expect(
          page.getByText(
            new RegExp(
              missingModelEnglish.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            ),
          ),
        ).toBeVisible();
      }
      await page.screenshot({
        path: info.outputPath(`real-detail-${locale}.png`),
        fullPage: true,
      });
    }
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: 'NocoReach daily analysis',
        exact: true,
      }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/settings\/schedules$/);
    expect(await readSchedules()).toEqual(before);
    observations.push({
      name: 'real schedule language switch, search, reload, Back and unchanged API data',
      result: 'passed',
    });

    // Additional histories and edited schedules are browser-only response fixtures;
    // Scheduler storage, cron definitions and execution state are never written.
    const customText = '用户自定义 {{id}} {0}';
    const custom = {
      ...systemSchedule,
      id: 'custom',
      key: 'custom',
      title: systemSchedule.title,
    };
    const edited = {
      ...systemSchedule,
      id: 'edited',
      title: customText,
      description: customText,
      targetSummary: {
        ...systemSchedule.targetSummary,
        targetLabel: customText,
        description: customText,
      },
    };
    const schedules = [systemSchedule, custom, edited];
    await page.route('**/api/scheduler/schedules**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const id = path.split('/schedules/')[1]?.split('/')[0];
      if (path.endsWith('/occurrences')) {
        const target = { type: systemSchedule.targetType };
        await route.fulfill({
          json: {
            data: [
              { ...systemOccurrence, scheduleId: id },
              {
                ...systemOccurrence,
                id: 'interrupted',
                scheduleId: id,
                reason: '运行被中断（服务重启）',
              },
              {
                ...systemOccurrence,
                id: 'unknown',
                scheduleId: id,
                reason: unknownError,
              },
              {
                ...systemOccurrence,
                id: 'other-target',
                scheduleId: id,
                target: { type: 'external.custom' },
                reason: '分析失败',
              },
              {
                ...systemOccurrence,
                id: 'legacy-no-summary',
                scheduleId: id,
                target,
                resultSummary: undefined,
                reason: `项目 1：${unknownError}`,
              },
            ],
          },
        });
        return;
      }
      await route.fulfill({
        json: id
          ? { data: schedules.find((s) => s.id === id) }
          : { data: schedules, meta: { total: schedules.length } },
      });
    });
    for (const locale of ['en', 'zh'] as const) {
      await language(page, locale);
      await page.goto(`${base}/settings/schedules/system-schedule`);
      await expect(
        page.getByText(
          locale === 'en'
            ? `Project 1: ${missingModelEnglish}; Project 2: ${unknownError}; Project 3: Analysis failed`
            : systemOccurrence.reason,
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByText(
          locale === 'en'
            ? 'Execution was interrupted by a server restart.'
            : '运行被中断（服务重启）',
          { exact: true },
        ),
      ).toBeVisible();
      for (const raw of [unknownError, '分析失败', `项目 1：${unknownError}`])
        await expect(page.getByText(raw, { exact: true })).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`fixture-history-${locale}.png`),
        fullPage: true,
      });
      await page.goto(`${base}/settings/schedules/custom`);
      await expect(
        page.getByRole('heading', { name: systemSchedule.title, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(systemSchedule.description, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(systemOccurrence.reason, { exact: true }),
      ).toBeVisible();
      await page.goto(`${base}/settings/schedules/edited`);
      await expect(
        page.getByRole('heading', { name: customText, exact: true }),
      ).toBeVisible();
      await expect(page.getByText(customText, { exact: true })).toHaveCount(4);
      observations.push({
        name: `${locale}: known history, upstream text, unknown provenance, custom and edited fields`,
        result: 'passed',
      });
    }
    await page.unrouteAll({ behavior: 'wait' });
    await language(page, 'en');
    await page.setViewportSize({ width: 375, height: 1000 });
    await page.goto(`${base}/settings/schedules/${system!.id}`);
    await expect(
      page.getByRole('heading', {
        name: 'NocoReach daily analysis',
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.locator('html').evaluate((element) => element.scrollWidth),
    ).toBeLessThanOrEqual(376);
    await page.screenshot({
      path: info.outputPath('real-detail-mobile.png'),
      fullPage: true,
    });
    expect(await readSchedules()).toEqual(before);
    expect(errors).toEqual([]);
    for (const [path, operation] of [
      ['/members', '/nrMembers/list'],
      ['/keywords?tab=saved', '/nrKeywords/saved'],
      ['/keywords?tab=tracking', '/nrRankTracking/status'],
    ]) {
      let requests = 0;
      const count = (request: import('@playwright/test').Request) => {
        if (new URL(request.url()).pathname.endsWith(operation)) requests++;
      };
      page.on('request', count);
      try {
        await page.goto(`${base}${path}`);
        await page.waitForLoadState('networkidle');
        expect(requests).toBeGreaterThan(0);
        const initial = requests;
        await language(page, 'zh');
        await language(page, 'en');
        await page.waitForTimeout(350);
        expect(requests).toBe(initial);
        observations.push({
          name: `${path}: language changes do not reload stable callbacks`,
          result: 'passed',
        });
      } finally {
        page.off('request', count);
      }
    }
    expect(errors).toEqual([]);
    await info.attach('scheduler-observations', {
      body: JSON.stringify({ observations, errors }, null, 2),
      contentType: 'application/json',
    });
  } catch (error) {
    await info.attach('failure-dom', {
      body: await page.locator('body').innerText(),
      contentType: 'text/plain',
    });
    throw error;
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    await page
      .getByRole('button', { name: /Open account menu|打开账户菜单/ })
      .click();
    await page.getByRole('menuitem', { name: /^Sign out$|^退出登录$/ }).click();
    await page.waitForURL((u) => u.pathname.endsWith('/login'));
    expect(
      await (await page.request.get(`${base}/api/auth/get-session`)).json(),
    ).toBeNull();
  }
});
