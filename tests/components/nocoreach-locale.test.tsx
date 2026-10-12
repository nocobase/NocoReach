import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
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
import { getRanges } from '../../client/pages/range-picker';
import { getWorkColumns } from '../../client/pages/task-execution-types';
import { countryName } from '../../client/pages/countries';
import { help } from '../../client/pages/glossary';
import SourceConnections from '../../client/pages/source-connections';

vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ isAdmin: true }),
  AdminOnlyNote: () => null,
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({
    project: { id: 1, name: 'Example', domains: ['example.com'] },
  }),
}));
vi.mock('../../client/components/connection-network', () => ({
  ConnectionNetwork: () => null,
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
const { openChat, strategyRequest } = vi.hoisted(() => ({
  openChat: vi.fn(),
  strategyRequest: vi.fn(async () => ({
    project: { name: 'Example' },
    evidence: [],
  })),
}));
vi.mock('../../client/pages/strategy/service', () => ({
  request: strategyRequest,
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', () => ({
  useChatPanel: () => ({ openChat }),
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
  return <SourceConnections />;
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
      expect(cards).toHaveLength(21);
      expect(
        categories.map(
          (category) =>
            getCatalog().filter((source) => source.category === category.id)
              .length,
        ),
      ).toEqual([7, 5, 9]);
      expect(
        new Set([...cards].map((card) => card.getAttribute('data-source-id')))
          .size,
      ).toBe(21);
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
    await user.click(site.querySelector('button')!);
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
    expect(document.querySelectorAll('[data-source-id]')).toHaveLength(21);
    await act(() => i18n.changeLanguage('zh-CN'));
    expect(screen.getByRole('textbox', { name: '官网地址' })).toBe(input);
    expect(input).toHaveValue('https://example.com/draft');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the new official Agent chat draft and project pin after switching the source drawer language', async () => {
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
    const question = getCatalog().find((source) => source.id === 'site')!.guide
      .questions[0];
    await user.click(screen.getByRole('button', { name: question }));
    expect(openChat).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: null,
        draft: expect.stringContaining(question),
        pin: { kind: 'nocoreachProject', id: '1', label: 'Example' },
      }),
    );
    expect(openChat.mock.calls[0][0].draft).toContain(
      $t('sourceConnections.projectDataReference'),
    );
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
