import {
  ClientApplicationContext,
  type ClientApplication,
} from '@nocobase/app-client';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import locales from '../../client/locales/index.js';
import SchedulesPage from '../../client/pages/settings/scheduler/pages/schedules-page.js';
import ScheduleDetailPage from '../../client/pages/settings/scheduler/pages/schedule-detail-page.js';
import {
  systemSchedule,
  systemOccurrence,
  missingModelEnglish,
  unknownError,
} from '../fixtures/nocoreach-schedule.js';

afterEach(cleanup);
async function setup(
  detail = false,
  item = {
    ...systemSchedule,
    title: String(systemSchedule.title),
    description: String(systemSchedule.description),
  },
) {
  // Incoming custom target labels and unknown errors deliberately have no translation key.
  const runtime = await createTestI18nRuntime({
    application: { namespace: 'nocoreach', resources: locales },
    strict: false,
  });
  const request = vi.fn(({ path }: { path: string }) =>
    Promise.resolve(
      path.endsWith('/occurrences')
        ? { data: [systemOccurrence] }
        : path === 'scheduler/schedules'
          ? { data: [item], meta: { total: 1 } }
          : { data: item },
    ),
  );
  const api = { request };
  const app = {
    services: { resolve: () => api },
  } as unknown as ClientApplication;
  render(
    <TestI18nProvider runtime={runtime}>
      <ClientApplicationContext.Provider value={app}>
        <MemoryRouter
          initialEntries={[
            detail
              ? '/settings/schedules/system-schedule'
              : '/settings/schedules',
          ]}
        >
          <Routes>
            <Route path='/settings/schedules' element={<SchedulesPage />} />
            <Route
              path='/settings/schedules/:scheduleId'
              element={<ScheduleDetailPage />}
            />
          </Routes>
        </MemoryRouter>
      </ClientApplicationContext.Provider>
    </TestI18nProvider>,
  );
  return { runtime, request };
}

it('searches the displayed built-in title and switches list/detail language in place', async () => {
  const { runtime } = await setup();
  const user = userEvent.setup();
  await screen.findByRole('link', { name: 'NocoReach daily analysis' });
  await user.type(
    screen.getByRole('searchbox', { name: 'Search schedules' }),
    'NocoReach daily analysis',
  );
  await act(() => runtime.changeLanguage('zh-CN'));
  await screen.findByRole('link', { name: 'NocoReach 每日分析' });
  await user.click(screen.getByRole('link', { name: 'NocoReach 每日分析' }));
  await screen.findByRole('heading', { name: 'NocoReach 每日分析' });
  expect(screen.getByText(systemSchedule.description)).toBeVisible();
  await act(() => runtime.changeLanguage('en-US'));
  await screen.findByRole('heading', { name: 'NocoReach daily analysis' });
  expect(
    screen.queryByText(systemSchedule.description),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Calculate signals for each project/)).toBeVisible();
  expect(
    await screen.findByText(
      `Project 1: ${missingModelEnglish}; Project 2: ${unknownError}; Project 3: Analysis failed`,
    ),
  ).toBeVisible();
});

it('keeps edited names/descriptions literal while other system fields and history switch', async () => {
  const custom = '用户改名 {{id}} {0}';
  const { runtime, request } = await setup(true, {
    ...systemSchedule,
    title: custom,
    description: custom,
  });
  await screen.findByRole('heading', { name: custom });
  expect(screen.getAllByText(custom)).toHaveLength(2);
  await act(() => runtime.changeLanguage('zh-CN'));
  await waitFor(() =>
    expect(screen.getByText(systemOccurrence.reason)).toBeVisible(),
  );
  expect(screen.getByRole('heading', { name: custom })).toBeVisible();
  await act(() => runtime.changeLanguage('en-US'));
  expect(screen.getByRole('heading', { name: custom })).toBeVisible();
  expect(request.mock.calls.length).toBeLessThan(12);
});
