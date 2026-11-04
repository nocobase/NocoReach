import { NavigationGuardProvider } from '@nocobase/app-client';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  $t,
  connectLocale,
  getCurrentLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import { nocobaseClient } from '../../client/lib/nocoreach-api';
import {
  categories,
  getCatalog,
  getStateLabels,
  sourceState,
} from '../../client/pages/data-sources';
import { getRanges } from '../../client/pages/range-state';
import { getWorkColumns } from '../../client/pages/task-execution-types';
import { countryName } from '../../client/pages/countries';
import { help } from '../../client/pages/glossary';
import SourceConnections from '../../client/pages/source-connections';
import { CONNECT_SOURCES } from '../../shared/connect-sources';
import { systemMessageText } from '../../shared/i18n/messages';

const { viewer, collector } = vi.hoisted(() => ({
  viewer: { can: true, networkOnly: false },
  collector: {
    onSavingChange: undefined as ((saving: boolean) => void) | undefined,
  },
}));
const connectionApi = vi.hoisted(() => ({
  request: vi.fn(async (): Promise<{ data: Record<string, unknown> }> => ({
    data: { publicSources: [] },
  })),
}));
vi.mock('@nocobase/app-client', async (original) => ({
  ...(await original<object>()),
  useApiClient: () => connectionApi,
}));
const workspaceCache = {
  invalidate: vi.fn(),
  revision: () => 0,
  load: async (_key: string, fetcher: () => Promise<unknown>) => fetcher(),
};
vi.mock('../../client/pages/workspace-cache', async (actual) => ({
  ...(await actual<object>()),
  useWorkspaceCache: () => workspaceCache,
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: (action: string | readonly string[]) => ({
    can:
      viewer.can || (viewer.networkOnly && action === 'nrProxyProfiles.select'),
    isPending: false,
  }),
}));
vi.mock('../../client/components/collector-connection', () => ({
  CollectorConnection: ({
    onSavingChange,
    health,
  }: {
    onSavingChange: (saving: boolean) => void;
    health?: ReactNode;
  }) => {
    collector.onSavingChange = onSavingChange;
    return (
      <>
        <Link to='/elsewhere'>Leave source page</Link>
        <p data-collector-health>{health}</p>
      </>
    );
  },
}));
vi.mock('../../client/pages/youtube-connect', () => ({
  YouTubeConnect: () => null,
}));
vi.mock('../../client/pages/xiaohongshu-connect', () => ({
  XiaohongshuConnect: () => null,
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({
    project: { id: 1, name: 'Example', domains: ['example.com'] },
  }),
}));
vi.mock('../../client/components/connection-network', () => ({
  ConnectionNetwork: ({ source }: { source: string }) => (
    <p>Network selection for {source}</p>
  ),
}));
vi.mock('../../client/pages/discovery-box', () => ({
  DiscoveryBox: () => null,
}));
vi.mock('../../client/pages/data-health', () => ({
  HealthPanel: () => null,
  HealthLine: () => null,
  loadHealth: async () => ({ items: [] }),
  healthText: (original: string) => original,
  needsAttention: () => false,
  sourceList: (names: string[]) => names.join(', '),
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: () => {},
}));
vi.mock('../../client/pages/site-content-connect', () => ({
  SiteContentConnect: function SiteForm() {
    const [value, setValue] = useState('');
    return (
      <input
        aria-label={$t('common.websiteUrl')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    wrapRequests: () => {},
    action: vi.fn(async (resource: string) =>
      resource === 'nrSources' ? { sources: [] } : {},
    ),
  },
  resolvePortalUrl: (path: string) => path,
  getPortalBase: () => '/',
}));

let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  connectionApi.request.mockReset();
  connectionApi.request.mockResolvedValue({ data: { publicSources: [] } });
  viewer.can = true;
  viewer.networkOnly = false;
  collector.onSavingChange = undefined;
  disconnect?.();
  disconnect = undefined;
  setDictionary(null);
});
async function runtime(locale: 'en-US' | 'zh-CN') {
  const i18n = new I18nRuntime({
    defaultLocale: locale,
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'nocoreach',
  });
  i18n.registerApplicationNamespace('nocoreach', locales);
  await i18n.init();
  disconnect = connectLocale(i18n);
  return i18n;
}
function Page() {
  useNocoReachLocale();
  return (
    <NavigationGuardProvider>
      <SourceConnections />
    </NavigationGuardProvider>
  );
}

describe('NocoReach language integration', () => {
  it.each(['en-US', 'zh-CN'] as const)(
    'honors the configured %s default and preserves every source group',
    async (locale) => {
      const i18n = await runtime(locale);
      render(
        <I18nProvider runtime={i18n}>
          <MemoryRouter>
            <Page />
          </MemoryRouter>
        </I18nProvider>,
      );
      await screen.findByText($t('common.websiteContent'));
      const cards = document.querySelectorAll('[data-source-id]');
      expect(cards).toHaveLength(22);
      expect(
        categories.map(
          (category) =>
            getCatalog().filter((source) => source.category === category.id)
              .length,
        ),
      ).toEqual([2, 6, 5, 9]);
      expect(
        new Set([...cards].map((card) => card.getAttribute('data-source-id')))
          .size,
      ).toBe(22);
      expect(document.body).toHaveTextContent($t('dataSources.available'));
    },
  );

  it('reads the catalog through one aggregate request per visit or close', async () => {
    const i18n = await runtime('en-US');
    const user = userEvent.setup();
    render(
      <I18nProvider runtime={i18n}>
        <MemoryRouter>
          <Page />
        </MemoryRouter>
      </I18nProvider>,
    );
    await waitFor(() => expect(connectionApi.request).toHaveBeenCalledTimes(1));
    expect(connectionApi.request).toHaveBeenLastCalledWith({
      path: 'nocoreachConnect/status?projectId=1',
      method: 'GET',
    });
    await user.click(document.querySelector('[data-source-id="site"] button')!);
    await screen.findByRole('dialog');
    expect(connectionApi.request).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(connectionApi.request).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('switches an already-open source drawer twice without losing its form or source identity', async () => {
    const i18n = await runtime('zh-CN');
    const user = userEvent.setup();
    render(
      <I18nProvider runtime={i18n}>
        <MemoryRouter>
          <Page />
        </MemoryRouter>
      </I18nProvider>,
    );
    await screen.findByText('网站内容');
    const site = document.querySelector('[data-source-id="site"]')!;
    const trigger = site.querySelector('button')!;
    await user.click(trigger);
    const input = screen.getByRole('textbox', { name: '官网地址' });
    await user.type(input, 'https://example.com/draft');
    await act(() => i18n.changeLanguage('en-US'));
    expect(screen.getByRole('textbox', { name: $t('common.websiteUrl') })).toBe(
      input,
    );
    expect(input).toHaveValue('https://example.com/draft');
    expect(screen.getByRole('dialog')).toHaveTextContent(
      $t('common.connectValue', { 0: $t('common.websiteContent') }),
    );
    expect(document.querySelectorAll('[data-source-id]')).toHaveLength(22);
    await act(() => i18n.changeLanguage('zh-CN'));
    expect(screen.getByRole('textbox', { name: '官网地址' })).toBe(input);
    expect(input).toHaveValue('https://example.com/draft');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger.tabIndex).toBe(0);
    await user.tab();
    expect(trigger).not.toHaveFocus();
    await user.tab({ shift: true });
    expect(trigger).toHaveFocus();
  });

  it('focuses the page title when a source has no opener and removes its temporary tabindex on blur', async () => {
    const i18n = await runtime('en-US');
    const user = userEvent.setup();
    viewer.can = false;
    render(
      <I18nProvider runtime={i18n}>
        <MemoryRouter initialEntries={['/?source=site']}>
          <Page />
        </MemoryRouter>
      </I18nProvider>,
    );
    await screen.findByRole('dialog');
    expect(document.querySelector('[data-source-trigger="site"]')).toBeNull();
    await user.keyboard('{Escape}');
    const title = screen.getByRole('heading', { level: 1 });
    await waitFor(() => expect(title).toHaveFocus());
    expect(title).toHaveAttribute('tabindex', '-1');
    await user.tab();
    expect(title).not.toHaveFocus();
    expect(title).not.toHaveAttribute('tabindex');
  });

  it('opens a supported source for network selection without source management permission', async () => {
    const i18n = await runtime('en-US');
    viewer.can = false;
    viewer.networkOnly = true;
    render(
      <I18nProvider runtime={i18n}>
        <MemoryRouter>
          <Page />
        </MemoryRouter>
      </I18nProvider>,
    );
    await screen.findByText($t('dataSources.githubRepository'));
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-source-trigger="github"]',
    );
    expect(trigger).toHaveTextContent('View');
    expect(document.querySelector('[data-source-trigger="repo"]')).toBeNull();
    await userEvent.click(trigger!);
    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Network selection for github',
    );
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('blocks closing and route navigation while its collector saves and releases navigation when saving settles', async () => {
    const i18n = await runtime('en-US');
    const user = userEvent.setup();
    render(
      <I18nProvider runtime={i18n}>
        <MemoryRouter initialEntries={['/?source=xiaohongshu']}>
          <NavigationGuardProvider>
            <Routes>
              <Route path='/' element={<SourceConnections />} />
              <Route path='/elsewhere' element={<h1>Other page</h1>} />
            </Routes>
          </NavigationGuardProvider>
        </MemoryRouter>
      </I18nProvider>,
    );
    const drawer = await screen.findByRole('dialog');
    act(() => collector.onSavingChange!(true));
    await user.click(screen.getByRole('link', { name: 'Leave source page' }));
    expect(screen.getByRole('dialog')).toBe(drawer);
    expect(screen.queryByText('Other page')).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBe(drawer);
    expect(document.querySelector('[data-slot="sheet-close"]')).toBeNull();
    act(() => collector.onSavingChange!(false));
    await user.click(screen.getByRole('link', { name: 'Leave source page' }));
    expect(
      await screen.findByRole('heading', { name: 'Other page' }),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    [true, '连接正常', true],
    [false, '无法连接小红书采集器，请检查采集器是否运行', false],
    // A mock deployment's project with no mock profile is paused; the row says so instead of the code.
    [
      'paused',
      '请先选择模拟网络 Profile，再采集数据。此隔离部署不会回退到真实连接',
      false,
    ],
  ])(
    'checks a saved collector no read has gone through as its drawer opens; the row and the tick agree (answers: %s)',
    async (answers, text, ticked) => {
      const action = vi.mocked(nocobaseClient.action);
      const original = action.getMockImplementation()!;
      const before = action.mock.calls.length;
      connectionApi.request.mockResolvedValue({
        data: {
          publicSources: [],
          xiaohongshu: {
            configured: true,
            connected: false,
            verifiedAt: null,
            lastRun: null,
            collectors: [{ id: 'team', name: 'Team browser' }],
          },
        },
      });
      action.mockImplementation(async (resource: string, name?: string) => {
        if (resource !== 'nrXiaohongshu') return original(resource);
        if (name === 'test') {
          if (answers === true) return {};
          throw Object.assign(new Error('unreachable'), {
            status: answers ? 409 : 502,
            payload: {
              error: answers
                ? {
                    reason: 'NOCOREACH_409',
                    message: 'NR_MOCK_PROFILE_REQUIRED',
                  }
                : { message: '无法连接小红书采集器，请检查采集器是否运行。' },
            },
          });
        }
        return {
          configured: true,
          connected: false,
          verifiedAt: null,
          lastRun: null,
          collectors: [{ id: 'team', name: 'Team browser' }],
        };
      });
      try {
        const i18n = await runtime('zh-CN');
        render(
          <I18nProvider runtime={i18n}>
            <MemoryRouter initialEntries={['/?source=xiaohongshu']}>
              <Page />
            </MemoryRouter>
          </I18nProvider>,
        );
        const health = await screen.findByText(text, { exact: false });
        expect(health.closest('[data-collector-health]')).toHaveTextContent(
          `· ${text}`,
        );
        expect(
          action.mock.calls
            .slice(before)
            .filter(
              ([resource, name]) =>
                resource === 'nrXiaohongshu' && name === 'test',
            ),
        ).toHaveLength(1);
        const need = screen.getByText($t('collectorConnection.needCollector'), {
          exact: false,
        });
        if (ticked) expect(need).toHaveTextContent('（已具备）');
        else expect(need).not.toHaveTextContent('（已具备）');
      } finally {
        action.mockImplementation(original);
      }
    },
  );

  it('describes the connection at the top of the drawer with what to prepare, and no AI', async () => {
    const i18n = await runtime('zh-CN');
    render(
      <I18nProvider runtime={i18n}>
        <MemoryRouter initialEntries={['/?source=site']}>
          <Page />
        </MemoryRouter>
      </I18nProvider>,
    );
    const dialog = await screen.findByRole('dialog');
    const guide = getCatalog().find((source) => source.id === 'site')!.guide!;
    expect(dialog).toHaveAccessibleDescription(guide.intro);
    expect(guide.intro).not.toMatch(/我/u);
    const needs = screen.getByRole('heading', { name: '需要准备' });
    expect(
      [...needs.parentElement!.querySelectorAll('li')].map(
        (item) => item.textContent,
      ),
    ).toEqual(guide.needs);
    // The drawer is set up by hand; no question buttons hand off to the AI chat.
    expect(dialog.querySelector('[data-actor="agent"]')).toBeNull();
    await act(() => i18n.changeLanguage('en-US'));
    const english = getCatalog().find((source) => source.id === 'site')!.guide!;
    expect(dialog).toHaveAccessibleDescription(english.intro);
    expect(
      screen.getByRole('heading', { name: 'What you need' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Ask AI' }),
    ).not.toBeInTheDocument();
  });

  it.each(['en-US', 'zh-CN'] as const)(
    'names every source and what it needs the same way as the connect commands in %s',
    async (locale) => {
      await runtime(locale);
      const catalog = getCatalog();
      expect(catalog.map((source) => source.id)).toEqual(
        CONNECT_SOURCES.map((source) => source.id),
      );
      for (const source of CONNECT_SOURCES) {
        const card = catalog.find((entry) => entry.id === source.id)!;
        expect(card.name).toBe(systemMessageText(source.name, {}, locale));
        expect(card.guide?.needs ?? []).toEqual(
          source.needs.map((key) => systemMessageText(key, {}, locale)),
        );
      }
    },
  );

  it('recomputes imported labels, country names, glossary and status without reimporting modules', async () => {
    const i18n = await runtime('zh-CN');
    expect(getRanges()[0]).toEqual(['7', '近 7 天']);
    expect(countryName('USA')).toBe('美国');
    expect(help('曝光')).toMatch(/Google/);
    const catalog = getCatalog().map(({ id, category }) => ({ id, category }));
    await i18n.changeLanguage('en-US');
    expect(getCurrentLocale()).toBe('en-US');
    expect(getRanges()[0][1]).toBe('Last 7 days');
    expect(countryName('USA')).toBe('United States');
    expect(help($t('common.impressions'))).not.toMatch(/[一-鿿]/u);
    expect(getStateLabels().connected).toBe('Connected');
    expect(getWorkColumns().todo).not.toMatch(/[一-鿿]/u);
    expect(getCatalog().map(({ id, category }) => ({ id, category }))).toEqual(
      catalog,
    );
    expect(
      sourceState(
        getCatalog().find(({ id }) => id === 'ga4')!,
        {
          google: {
            configured: true,
            authorized: true,
            connection: { ga4PropertyId: '123' },
          },
        },
      ),
    ).toBe('connected');
    await i18n.changeLanguage('zh-CN');
    expect(getRanges()[0]).toEqual(['7', '近 7 天']);
    expect(help('曝光')).toMatch(/[一-鿿]/u);
    expect(getWorkColumns().todo).toBe('待处理');
  });
});
