import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import {
  $t,
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import { timeZoneName } from '../../client/lib/time-zone-name';
import {
  HealthPanel,
  HealthAlert,
  HealthLine,
  type HealthItem,
} from '../../client/pages/data-health';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
// The daily analysis row links to Settings › Automatic runs only for people who may open it.
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<
    typeof import('@nocobase/app-plugin-authorization/client')
  >()),
  useCan: () => ({ can: true, isPending: false, retry: () => {} }),
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
const raw = '分析。任务。';
const modelError = '请先在“AI 团队 → 模型”配置默认模型';
const modelErrorEn =
  'Configure a default model under "AI team → Models" first.';
const item = (
  id: string,
  name: string,
  extra: Partial<HealthItem> = {},
): HealthItem => ({
  id,
  name,
  state: 'failing',
  message: `同步失败超过 1 天：${raw}`,
  messageText: {
    key: '同步失败超过 1 天：{0}',
    params: { 0: { systemError: raw } },
  },
  lastSuccessAt: null,
  dataThrough: null,
  nextSyncAt: null,
  retry: null,
  ...extra,
});
const items = [
  item('discourse', '社区论坛', { note: raw }),
  item('packages', '下载量', { nameText: { key: '下载量' }, note: raw }),
  item('hackernews', 'Hacker News 提及', {
    nameText: { key: 'Hacker News 提及' },
    note: `搜索 ${raw}，已保存 1 条，从 2026-10-01 开始`,
    noteText: {
      key: '搜索 {0}，已保存 {1} 条{2}',
      params: {
        0: raw,
        1: 1,
        2: { key: '，从 {0} 开始', params: { 0: '2026-10-01' } },
      },
    },
  }),
  item('competitors', '竞品动态', {
    nameText: { key: '竞品动态' },
    note: `每周看 ${raw} 的官网和 GitHub`,
    noteText: { key: '每周看 {0} 的官网和 GitHub', params: { 0: raw } },
  }),
  item('daily-analysis', '每日分析', {
    nameText: { key: '每日分析' },
    message: `同步失败超过 1 天：${modelError}`,
    messageText: {
      key: '同步失败超过 1 天：{0}',
      params: { 0: { systemError: modelError } },
    },
  }),
  item('legacy', 'Legacy source', {
    note: raw,
    message: raw,
    messageText: undefined,
  }),
];
let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = undefined;
  setDictionary(null);
  action.mockReset();
  vi.useRealTimers();
});
function Page() {
  useNocoReachLocale();
  return (
    <>
      <HealthPanel projectId={1} reloadKey={0} onChange={() => {}} />
      <HealthAlert projectId={1} />
      <div data-testid='health-line'>
        <HealthLine item={items[4]} />
      </div>
    </>
  );
}

test('health panel, expanded table, alert and card preserve user content while system templates switch', async () => {
  action.mockResolvedValue({ checkedAt: new Date().toISOString(), items });
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
        <Page />
      </MemoryRouter>
    </I18nProvider>,
  );
  await screen.findByRole('table');
  const requestCount = action.mock.calls.length;
  for (const locale of ['en-US', 'zh-CN', 'en-US']) {
    await act(() => runtime.changeLanguage(locale));
    const table = screen.getByRole('table');
    const forum = within(table).getByText('社区论坛').closest('tr')!;
    expect(forum).toHaveTextContent(raw);
    expect(screen.getByRole('alert')).toHaveTextContent('社区论坛');
    expect(table).toHaveTextContent($t('common.downloads'));
    expect(table).toHaveTextContent(
      $t('dataHealth.searchingSaved', {
        0: raw,
        1: 1,
        2: $t('dataHealth.retainedFromSuffix', { 0: '2026-10-01' }),
      }),
    );
    expect(table).toHaveTextContent(
      $t('dataHealth.checksWebsiteGithubWeekly', { 0: raw }),
    );
    expect(screen.getByTestId('health-line')).toHaveTextContent(
      $t('dataHealth.extendedFailure', {
        0: locale === 'zh-CN' ? modelError : modelErrorEn,
      }),
    );
    expect(document.body).not.toHaveTextContent('Analysis. Tasks.');
    expect(document.body).toHaveTextContent(raw);
  }
  expect(action.mock.calls.length).toBe(requestCount);
  expect(items[0].name).toBe('社区论坛');
  expect(items[0].note).toBe(raw);
});

test('the sync table says how often each source runs and links the daily analysis time to its setting', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-29T00:00:00Z'));
  const analysis = item('daily-analysis', '每日分析', {
    nameText: { key: 'dailyAnalysis.dailyAnalysis' },
    state: 'healthy',
    cadence: 'daily',
    note: '每天 07:30 运行（Asia/Shanghai）',
    schedule: { time: '07:30', timezone: 'Asia/Shanghai', enabled: true },
  });
  action.mockResolvedValue({
    checkedAt: new Date().toISOString(),
    items: [
      analysis,
      item('reddit', 'Reddit', { state: 'healthy', cadence: 'weekly' }),
      item('youtube', 'YouTube', { state: 'healthy', cadence: 'manual' }),
    ],
  });
  const runtime = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </I18nProvider>,
  );
  await screen.findByRole('table');
  const table = screen.getByRole('table');
  expect(
    within(table).getByRole('columnheader', { name: '频率' }),
  ).toBeInTheDocument();
  const row = (name: string) => within(table).getByText(name).closest('tr')!;
  const localClock = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date('2026-10-29T23:30:00Z'));
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  expect(row('每日分析')).toHaveTextContent(
    `每天 ${localClock} 运行（${timeZoneName(browserZone, 'zh-CN')}）`,
  );
  expect(row('每日分析')).not.toHaveTextContent('Asia/Shanghai');
  expect(row('每日分析')).toHaveTextContent('每天');
  expect(row('Reddit')).toHaveTextContent('每周');
  expect(row('YouTube')).toHaveTextContent('手动');
  expect(
    await within(row('每日分析')).findByRole('link', { name: '修改时间' }),
  ).toHaveAttribute('href', '/schedules');
});

test('a used-up YouTube budget says the day reading resumes, in each language, and offers no setting or retry', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T00:00:00Z'));
  const paused = item('youtube', 'YouTube', {
    state: 'warning',
    fix: 'wait',
    message:
      'DataForSEO 本月预算已用完，可以调高预算，或等 2026-12-01 自动恢复',
    messageText: {
      key: 'youtube.budgetPausedHealth',
      params: { 0: { date: '2026-12-01T00:00:00.000Z' } },
    },
  });
  action.mockResolvedValue({
    checkedAt: new Date().toISOString(),
    items: [paused],
  });
  const runtime = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter>
        <HealthPanel projectId={1} reloadKey={0} onChange={() => {}} />
      </MemoryRouter>
    </I18nProvider>,
  );
  const row = await screen.findByText(/可以调高预算，或等 12-01 自动恢复/);
  const line = row.closest('[data-health-row]')!;
  expect(line).toHaveAttribute('data-fix', 'wait');
  expect(within(line as HTMLElement).queryByRole('button')).toBeNull();
  expect(line).not.toHaveTextContent($t('dataHealth.settingsFirst'));
  await act(() => runtime.changeLanguage('en-US'));
  expect(line).toHaveTextContent(
    'raise the budget, or reading resumes on Dec 1',
  );
});

test('a Google row says when and why authorizing again last failed, in each language', async () => {
  const at = '2026-11-04T12:02:00.000Z';
  const refused = item('gsc', 'Google Search Console', {
    fix: 'settings',
    message: '同步失败超过 1 天：Google 授权已失效，请重新授权',
    messageText: {
      key: 'dataHealth.extendedFailure',
      params: { 0: { systemError: 'Google 授权已失效，请重新授权' } },
    },
    attempt: `${at} 的授权未成功。本次授权缺少 Analytics 或 Search Console 只读权限，请重新授权并勾选这两项权限。`,
    attemptText: {
      key: 'google.authorizationAttemptFailedAt',
      params: {
        0: { dateTime: at },
        1: { key: 'google.authorizationLacksReadAccessAnalytics' },
      },
    },
  });
  action.mockResolvedValue({
    checkedAt: new Date().toISOString(),
    items: [refused, item('ga4', 'GA4', { state: 'healthy' })],
  });
  const runtime = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter>
        <HealthPanel projectId={1} reloadKey={0} onChange={() => {}} />
      </MemoryRouter>
    </I18nProvider>,
  );
  const line = await screen.findByText(/的授权未成功。/);
  expect(line).toHaveTextContent(
    /^(\d{4}-)?11-04 \d\d:\d\d 的授权未成功。本次授权缺少 Analytics 或 Search Console 只读权限，请重新授权并勾选这两项权限。$/,
  );
  // The ISO time is for older clients only.
  expect(line).not.toHaveTextContent('2026-11-04T');
  expect(line.closest('[data-health-row]')).toHaveAttribute(
    'data-health-row',
    'gsc',
  );
  expect(document.querySelectorAll('[data-health-attempt]')).toHaveLength(1);
  await act(() => runtime.changeLanguage('en-US'));
  expect(line).toHaveTextContent(
    /^The authorization on Nov 4, .+ didn't succeed\. This authorization lacks read-only access to Analytics or Search Console\. Authorize again and check both permissions\.$/,
  );
});
