import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import StrategyPage from '../../client/pages/strategy/index';
import { WorkspaceCacheProvider } from '../../client/pages/workspace-cache';
import { HealthPanel } from '../../client/pages/data-health';

const modelError = '请先在“AI 团队 → 模型”配置默认模型';
const modelErrorEn =
  'Configure a default model under "AI team → Models" first.';
const { action, fixture } = vi.hoisted(() => ({
  action: vi.fn(),
  fixture: {
    mode: 'automatic',
    error: '',
    health: false,
    tasks: [] as unknown[],
  },
}));
vi.mock('../../client/lib/nocoreach-api', async (original) => ({
  ...(await original<typeof import('../../client/lib/nocoreach-api')>()),
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({
    project: { id: 1, name: '分析。任务。', domains: ['example.invalid'] },
  }),
  taskRecords: async () => fixture.tasks,
  useUnsavedWarning: () => {},
}));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({
    me: { id: 'root' },
    isAdmin: true,
    mine: () => true,
    can: () => true,
  }),
  taskOwner: () => 'root',
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: vi.fn(),
}));

let disconnect: (() => void) | undefined;
beforeEach(() => {
  fixture.mode = 'automatic';
  fixture.error = modelError;
  fixture.health = false;
  fixture.tasks = [];
  action.mockReset();
  action.mockImplementation(async (resource: string, operation: string) => {
    if (resource === 'nrStrategy') {
      if (operation === 'state')
        return { revision: 1, goal: null, proposals: [] };
      return {
        project: { name: '分析。任务。' },
        evidence: {
          capturedAt: new Date().toISOString(),
          availableThrough: null,
          periodDays: 28,
          searchQueries: [],
          pages: [],
          industryCandidates: [],
          limitations: [],
        },
      };
    }
    if (resource === 'nrAnalysis') {
      const at = new Date().toISOString();
      return {
        running: false,
        last: { at, ok: false, errors: [fixture.error], lastSuccessAt: null },
        retry:
          fixture.mode === 'retry'
            ? {
                attempt: 1,
                nextAt: new Date(Date.now() + 60000).toISOString(),
                reason: fixture.error,
              }
            : null,
        runs: [
          {
            at,
            trigger: fixture.mode === 'manual' ? 'manual' : 'workflow',
            ok: false,
            error: fixture.error,
            retryable: fixture.mode === 'exhausted',
          },
        ],
        schedule: null,
      };
    }
    if (resource === 'nrPlaybooks') return { revision: 1, playbooks: [] };
    if (resource === 'nrHealth')
      return {
        checkedAt: new Date().toISOString(),
        items: fixture.health
          ? [
              {
                id: 'daily-analysis',
                name: '每日分析',
                nameText: { key: '每日分析' },
                state: 'failing',
                message: '同步失败超过 1 天：' + fixture.error,
                messageText: {
                  key: '同步失败超过 1 天：{0}',
                  params: { 0: { systemError: fixture.error } },
                },
                lastSuccessAt: null,
                dataThrough: null,
                nextSyncAt: null,
                retry: null,
              },
            ]
          : [],
      };
    if (resource === 'nrInsights') return { areas: [] };
    if (resource === 'nrDataViews') return { cards: [] };
    throw new Error(`Unexpected fixture request: ${resource}/${operation}`);
  });
});
afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = undefined;
  setDictionary(null);
});
function Page({ health = false }: { health?: boolean }) {
  useNocoReachLocale();
  return health ? (
    <HealthPanel projectId={1} reloadKey={0} onChange={() => {}} />
  ) : (
    <StrategyPage />
  );
}
async function setup(health = false) {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter>
        <WorkspaceCacheProvider>
          <Page health={health} />
        </WorkspaceCacheProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
  return runtime;
}
async function analysisNotice() {
  if (fixture.mode === 'manual') {
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Update analysis' }));
    return screen.findByRole('alert');
  }
  const selector =
    fixture.mode === 'retry'
      ? '[data-analysis-retry]'
      : '[data-analysis-failed]';
  await waitFor(() => expect(document.querySelector(selector)).not.toBeNull());
  return document.querySelector(selector)!;
}

test.each(['automatic', 'exhausted', 'retry', 'manual'])(
  'renders known daily analysis errors in the current language for %s without rerunning the job',
  async (mode) => {
    fixture.mode = mode;
    const runtime = await setup();
    const notice = await analysisNotice();
    const requestCount = action.mock.calls.length;
    for (const locale of ['en-US', 'zh-CN', 'en-US']) {
      await act(() => runtime.changeLanguage(locale));
      expect(notice).toHaveTextContent(
        locale === 'zh-CN' ? modelError : modelErrorEn,
      );
      expect(fixture.error).toBe(modelError);
    }
    expect(action.mock.calls.length).toBe(requestCount);
  },
);

test.each(['automatic', 'retry', 'manual'])(
  'keeps unknown analysis errors and their user-authored text intact for %s',
  async (mode) => {
    fixture.mode = mode;
    fixture.error = '分析。任务。';
    const runtime = await setup();
    const notice = await analysisNotice();
    for (const locale of ['en-US', 'zh-CN', 'en-US']) {
      await act(() => runtime.changeLanguage(locale));
      expect(notice).toHaveTextContent('分析。任务。');
      expect(notice).not.toHaveTextContent('Analysis. Tasks.');
    }
  },
);

test('data health localizes the same persisted default-model error without refetching', async () => {
  fixture.health = true;
  const runtime = await setup(true);
  await screen.findByText(modelErrorEn, { exact: false });
  const requestCount = action.mock.calls.length;
  for (const locale of ['zh-CN', 'en-US']) {
    await act(() => runtime.changeLanguage(locale));
    expect(
      screen.getByRole('region', {
        name: locale === 'zh-CN' ? '数据健康' : 'Data health',
      }),
    ).toHaveTextContent(locale === 'zh-CN' ? modelError : modelErrorEn);
  }
  expect(action.mock.calls.length).toBe(requestCount);
});

test('home waiting tasks retain custom snapshot step names while system publication labels switch', async () => {
  const task = (id: number, title: string, kind: string) => ({
    id,
    title,
    status: '进行中',
    evidence: {
      work: {
        stage: 'flow',
        stageIndex: 0,
        flow: {
          id: 'custom',
          name: 'Custom flow',
          version: 1,
          stages: [{ key: 'step', kind, name: '分析。任务。' }],
        },
      },
    },
  });
  fixture.tasks = [
    task(1, 'Custom task', 'review'),
    task(2, 'System task', 'publish'),
  ];
  const runtime = await setup();
  await screen.findByRole('button', { name: 'Custom task · 分析。任务。' });
  for (const locale of ['en-US', 'zh-CN', 'en-US']) {
    await act(() => runtime.changeLanguage(locale));
    expect(
      screen.getByRole('button', { name: 'Custom task · 分析。任务。' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name:
          'System task · ' +
          (locale === 'zh-CN' ? '确认发布' : 'Confirm publish'),
      }),
    ).toBeVisible();
  }
});

test('an upstream error identical to a UI dictionary key is still kept verbatim', async () => {
  fixture.error = '分析';
  const runtime = await setup();
  const notice = await analysisNotice();
  for (const locale of ['en-US', 'zh-CN', 'en-US']) {
    await act(() => runtime.changeLanguage(locale));
    expect(notice).toHaveTextContent('分析');
    expect(notice).not.toHaveTextContent('Analysis');
  }
});
