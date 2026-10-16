import { NavigationGuardProvider } from '@nocobase/app-client';
import '@testing-library/jest-dom/vitest';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  $t,
  $legacyText,
  connectLocale,
  setDictionary,
  useNocoReachLocale,
  useMessageState,
} from '../../client/i18n';
import locales from '../../client/locales';
import AiSearch from '../../client/pages/ai-search';
import { TaskDetail } from '../../client/pages/task-detail';
import { TaskDraftProvider } from '../../client/pages/task-detail/drafts';
import type { TaskData } from '../../client/pages/task-execution-types';
import { WorkspaceCacheProvider } from '../../client/pages/workspace-cache';
import { SiteContentConnect } from '../../client/pages/site-content-connect';
import { SyncPanel } from '../../client/pages/sync-panel';
import { HealthPanel } from '../../client/pages/data-health';
import { confirmAction } from '../../client/components/reach/confirm';
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'u' }, session: { id: 'locale-test' } },
    isPending: false,
  }),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationRevision: () => 0,
}));
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: 'root' }, isAdmin: true, can: () => true }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useUnsavedWarning: () => {},
  useProject: () => ({
    project: { id: 1, name: 'Example', domains: ['example.com'] },
  }),
}));
vi.mock('../../client/pages/keyword-hand-off', () => ({
  DraftHandOffDialog: () => null,
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    wrapRequests: () => {},
    action: vi.fn(async (resource: string, action: string) => {
      if (resource === 'nrPlaybooks') return { revision: 1, playbooks: [] };
      if (resource === 'nrTaskWork' && action === 'members') return [];
      if (resource === 'nrGoogle' && action === 'syncStatus')
        return {
          jobs: [],
          scheduleEnabled: false,
          nextSyncAt: null,
          lastSyncAt: null,
          coverage: [],
        };
      if (resource === 'nrGoogle' && action === 'syncNow') return {};
      if (resource === 'nrHealth')
        return {
          checkedAt: '2026-10-10T00:00:00Z',
          items: [
            {
              id: 'site',
              name: '网站内容',
              nameText: { key: '网站内容' },
              state: 'healthy',
              message: '正常',
              lastSuccessAt: '2026-10-09T00:00:00Z',
              dataThrough: null,
              nextSyncAt: null,
              retry: null,
            },
          ],
        };
      if (resource === 'nrSiteContent')
        throw new Error('读取网站内容状态失败。');
      if (action === 'status')
        return {
          configured: true,
          verifiedAt: '2026-10-01',
          monthlyBudgetUsd: 5,
        };
      if (action === 'list') return [];
      if (action === 'open')
        return {
          runs: [
            {
              id: 'run-1',
              status: 'completed',
              createdAt: '2026-10-01T01:00:00Z',
              spec: {
                kind: 'ai-brand',
                platform: 'google',
                target: 'Example',
                competitors: [],
                locationCode: 2840,
                language: 'en',
                group: 'fixture',
              },
              result: {
                platform: 'google',
                mentions: 1,
                aiSearchVolume: 10,
                questions: [
                  {
                    question: 'Fixture question',
                    volume: 10,
                    sources: [],
                    ownCited: false,
                    brands: ['Example'],
                    excerpt: 'Fixture excerpt',
                    at: null,
                  },
                ],
                pages: [],
                share: null,
              },
            },
          ],
        };
      throw new Error(`Unexpected mock call ${resource}/${action}`);
    }),
  },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));
const customTask: TaskData = {
  task: { id: 1, title: '用户标题', brief: '用户说明' },
  work: {
    revision: 1,
    stage: 'flow',
    plan: null,
    planVersion: 1,
    step: 0,
    results: [],
    history: [],
    note: '分析。任务。',
    flow: {
      id: 'custom',
      name: '任务',
      version: 1,
      stages: [
        {
          key: 'custom-step',
          name: '分析',
          kind: 'agent',
          mode: 'analyze',
          instruction: '任务。分析。',
        },
      ],
    },
    stageIndex: 0,
  },
  runs: [],
  artifacts: [],
  reviews: [],
  agent: { repo: null, online: false },
};
let disconnect: undefined | (() => void);
afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = undefined;
  setDictionary(null);
});
async function setup(
  locale: 'en-US' | 'zh-CN',
  mode: 'search' | 'site' | 'health' | 'sync' | 'task',
) {
  const runtime = new I18nRuntime({
    defaultLocale: locale,
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  function Page() {
    useNocoReachLocale();
    return mode === 'task' ? (
      <NavigationGuardProvider>
        <TaskDraftProvider>
          <TaskDetail projectId={1} taskId='1' initial={customTask} />
        </TaskDraftProvider>
      </NavigationGuardProvider>
    ) : mode === 'search' ? (
      <AiSearch />
    ) : mode === 'sync' ? (
      <SyncPanel projectId='1' ready />
    ) : mode === 'health' ? (
      <HealthPanel projectId={1} reloadKey={0} onChange={() => {}} />
    ) : (
      <WorkspaceCacheProvider>
        <SiteContentConnect projectId={1} onChange={() => {}} />
      </WorkspaceCacheProvider>
    );
  }
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={['/ai-search?tab=brand&g=fixture']}>
        <Page />
      </MemoryRouter>
    </I18nProvider>,
  );
  return runtime;
}
describe('Persisted bilingual UI messages and tables', () => {
  it('translates success notices passed through helper arguments', async () => {
    const runtime = await setup('en-US', 'sync');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: $t('common.syncNow') }));
    await screen.findByRole('status');
    expect(screen.getByRole('status')).toHaveTextContent(
      $t('syncPanel.backgroundJobSubmittedClosingPage'),
    );
    await act(() => runtime.changeLanguage('zh-CN'));
    expect(screen.getByRole('status')).toHaveTextContent(
      '后台任务已提交，关闭页面不会中断。',
    );
    await act(() => runtime.changeLanguage('en-US'));
    expect(screen.getByRole('status')).toHaveTextContent(
      $t('syncPanel.backgroundJobSubmittedClosingPage'),
    );
  });
  it('preserves user-authored interpolation within deferred localized messages', async () => {
    await setup('en-US', 'site');
    await screen.findByRole('alert');
    function Deferred() {
      const [message, setMessage] = useMessageState();
      return (
        <>
          <button
            onClick={() =>
              setMessage(() =>
                $t('playbooks.deletePlaybook', { 0: '分析。任务。' }),
              )
            }
          >
            defer fixture
          </button>
          <output aria-label='deferred fixture'>{message}</output>
        </>
      );
    }
    render(<Deferred />);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'defer fixture' }));
    expect(screen.getByLabelText('deferred fixture')).toHaveTextContent(
      $t('playbooks.deletePlaybook', { 0: '分析。任务。' }),
    );
  });
  it('translates known system source names in the expanded health table', async () => {
    await setup('en-US', 'health');
    await userEvent.setup().click(
      await screen.findByRole('button', {
        name: $t('dataHealth.viewSyncStatus'),
      }),
    );
    expect(screen.getByRole('table')).toHaveTextContent(
      $t('common.websiteContent'),
    );
  });
  it('translates existing brand result table headers after language change', async () => {
    const runtime = await setup('zh-CN', 'search');
    await screen.findByText('Fixture question');
    expect(screen.getByRole('columnheader', { name: '平台' })).toBeVisible();
    const row = screen.getByText('Fixture question').closest('tr')!;
    await userEvent.setup().click(within(row).getByRole('checkbox'));
    await act(() => runtime.changeLanguage('en-US'));
    for (const key of ['问题', '平台', '引用本站'])
      expect(
        screen.getByRole('columnheader', { name: $legacyText(key) }),
      ).toBeVisible();
    expect(within(row).getByRole('checkbox')).toBeChecked();
    await act(() => runtime.changeLanguage('zh-CN'));
    for (const key of ['问题', '平台', '引用本站'])
      expect(screen.getByRole('columnheader', { name: key })).toBeVisible();
    expect(within(row).getByRole('checkbox')).toBeChecked();
  });
  it('translates an existing website connection load error after language change', async () => {
    const runtime = await setup('zh-CN', 'site');
    const input = screen.getByRole('textbox', { name: '官网地址' });
    await userEvent.setup().type(input, 'https://example.com/draft');
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(
      '读取网站内容状态失败。',
    );
    await act(() => runtime.changeLanguage('en-US'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      $t('siteContent.notLoadWebsiteContentStatus'),
    );
    expect(screen.getByRole('textbox', { name: $t('common.websiteUrl') })).toBe(
      input,
    );
    expect(input).toHaveValue('https://example.com/draft');
    await act(() => runtime.changeLanguage('zh-CN'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      '读取网站内容状态失败。',
    );
    expect(input).toHaveValue('https://example.com/draft');
  });
  it('translates an already open English confirmation title when switched back to Chinese', async () => {
    const runtime = await setup('en-US', 'site');
    await screen.findByRole('alert');
    let promise: Promise<boolean>;
    await act(async () => {
      promise = confirmAction({
        title: () => $t('common.discardUnsavedChanges'),
        action: '放弃',
      });
    });
    await screen.findByRole('alertdialog');
    await act(() => runtime.changeLanguage('zh-CN'));
    const dialog = screen.getByRole('alertdialog');
    const text = dialog.textContent;
    await userEvent
      .setup()
      .click(within(dialog).getByRole('button', { name: '取消' }));
    await promise!;
    expect(text).toContain('放弃未保存的修改？');
  });
});

it('updates a displayed toast in both directions without translating the user value', async () => {
  const { connectToaster, toast } = await import('../../client/lib/toast');
  const runtime = await setup('en-US', 'site');
  const show = vi.fn(() => 'toast-fixture');
  connectToaster({
    show,
    close: vi.fn(),
  } as unknown as import('@nocobase/app-client').Toaster);
  const userValue = '分析。任务。';
  toast.success(() => $t('competitorWatch.saved', { 0: userValue }));
  const options = (
    show.mock.calls[0] as unknown as [{ title: import('react').ReactNode }]
  )[0];
  render(<output aria-label='toast fixture'>{options.title}</output>);
  for (const locale of ['en-US', 'zh-CN', 'en-US']) {
    await act(() => runtime.changeLanguage(locale));
    expect(screen.getByLabelText('toast fixture')).toHaveTextContent(
      $t('competitorWatch.saved', { 0: userValue }),
    );
  }
});

it('keeps snapshot step names and event user text while translating explicit system stages', async () => {
  const { stageName, stageLabel, eventText } =
    await import('../../client/pages/playbook-model');
  const { stepOf } = await import('../../client/pages/task-list-model');
  const { workTypeLabel } = await import('../../client/pages/work-board');
  const runtime = await setup('en-US', 'site');
  for (const locale of ['en-US', 'zh-CN', 'en-US']) {
    await act(() => runtime.changeLanguage(locale));
    const snapshot = {
      stage: 'flow',
      stageIndex: 0,
      flow: {
        id: 'custom',
        name: '分析。任务。',
        version: 1,
        stages: [
          { key: 'custom', name: '分析。任务。', kind: 'agent' as const },
        ],
      },
    } as import('../../client/pages/task-execution-types').Work;
    expect(stepOf(snapshot)?.text).toContain('分析。任务。');
    expect(workTypeLabel(snapshot)).toBe('分析。任务。 · 分析。任务。');
    expect(stageName({ key: 'custom', name: '分析', kind: 'agent' })).toBe(
      '分析',
    );
    expect(stageLabel({ key: 'custom', name: '分析', kind: 'agent' })).toBe(
      'Agent 分析',
    );
    expect(stageName({ key: 'release', name: '上线', kind: 'release' })).toBe(
      $t('common.live'),
    );
    expect(stageName({ key: 'observe', name: '观察', kind: 'observe' })).toBe(
      $t('common.watch'),
    );
    expect(
      eventText({ action: 'handoff', note: '分析。任务。' }, () => '', 'Agent')
        ?.text,
    ).toBe(
      $t('playbook.handedOverTaskDocumentDelivered', {
        0: '分析。任务。',
      }),
    );
  }
});

it('preserves rendered custom task instructions, step names and supplemental notes', async () => {
  const runtime = await setup('en-US', 'task');
  for (const locale of ['en-US', 'zh-CN', 'en-US']) {
    await act(() => runtime.changeLanguage(locale));
    expect(screen.getByText('分析。任务。')).toBeVisible();
    expect(screen.getAllByText('分析').length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('任务。分析。');
    expect(screen.getByRole('heading', { name: '用户标题' })).toBeVisible();
  }
});
