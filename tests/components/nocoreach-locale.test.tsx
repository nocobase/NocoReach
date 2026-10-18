import { NavigationGuardProvider } from '@nocobase/app-client';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
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
import {
  categories,
  getCatalog,
  getStateLabels,
  getUseLabels,
  sourceState,
} from '../../client/pages/data-sources';
import { getRanges } from '../../client/pages/range-state';
import { getWorkColumns } from '../../client/pages/task-execution-types';
import { countryName } from '../../client/pages/countries';
import { help } from '../../client/pages/glossary';
import SourceConnections from '../../client/pages/source-connections';

const { viewer, collector } = vi.hoisted(() => ({
  viewer: { can: true, networkOnly: false },
  collector: {
    onSavingChange: undefined as ((saving: boolean) => void) | undefined,
  },
}));
vi.mock('../../client/pages/workspace-cache', async (actual) => ({
  ...(await actual<object>()),
  useWorkspaceCache: () => ({ invalidate: vi.fn() }),
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
  }: {
    onSavingChange: (saving: boolean) => void;
  }) => {
    collector.onSavingChange = onSavingChange;
    return <Link to='/elsewhere'>Leave source page</Link>;
  },
}));
vi.mock('../../client/pages/youtube-connect', () => ({
  YouTubeConnect: () => null,
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
}));
vi.mock('../../client/components/app-shell/nav-badges', () => ({
  refreshNavBadges: () => {},
}));
const { openChat } = vi.hoisted(() => ({ openChat: vi.fn() }));
vi.mock('../../client/online-agent/context.js', () => ({
  useOnlineChat: () => ({ open: openChat }),
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
  openChat.mockClear();
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
      ).toEqual([8, 5, 9]);
      expect(
        new Set([...cards].map((card) => card.getAttribute('data-source-id')))
          .size,
      ).toBe(22);
      expect(document.body).toHaveTextContent($t('dataSources.available'));
    },
  );

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
        <MemoryRouter initialEntries={['/?source=youtube']}>
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

  it('opens an online chat draft in the source project after switching the drawer language', async () => {
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
    const card = document.querySelector('[data-source-id="site"]')!;
    await user.click(card.querySelector('button')!);
    await act(() => i18n.changeLanguage('en-US'));
    const question = getCatalog().find((source) => source.id === 'site')!.guide!
      .questions[0];
    await user.click(screen.getByRole('button', { name: question }));
    expect(openChat).toHaveBeenCalledWith({ draft: question, projectId: '1' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

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
    expect(getUseLabels().analyze).not.toMatch(/[一-鿿]/u);
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
