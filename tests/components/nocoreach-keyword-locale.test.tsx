import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  $t,
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import { KeywordSuggestions } from '../../client/pages/keyword-suggestions';
import {
  localizePlaybook,
  type Playbook,
} from '../../client/pages/playbook-model';

vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({
    project: { id: 1, name: 'Example', domains: ['example.com'] },
  }),
}));
vi.mock('../../client/pages/keyword-hand-off', () => ({
  KeywordHandOffDialog: () => null,
}));
vi.mock('../../client/pages/strategy/hand-off', () => ({
  HandOffNotice: () => null,
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    wrapRequests: () => {},
    action: vi.fn(async () => ({
      dataforseo: false,
      market: { locationCode: 2840, language: 'en' },
      items: [
        {
          id: 'product',
          keyword: 'product keyword',
          group: '产品与功能词',
          reason: 'User-authored product description',
          intent: null,
          page: null,
          site: null,
          metrics: null,
        },
        {
          id: 'comparison',
          keyword: 'comparison keyword',
          group: '对比与替代词',
          reason: 'User-authored comparison description',
          intent: null,
          page: null,
          site: null,
          metrics: null,
        },
      ],
    })),
  },
  resolvePortalUrl: (path: string) => path,
}));
let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = undefined;
  setDictionary(null);
});
function Page() {
  useNocoReachLocale();
  return <KeywordSuggestions onSaved={() => {}} />;
}
async function setup(locale: 'en-US' | 'zh-CN') {
  const runtime = new I18nRuntime({
    defaultLocale: locale,
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
  await screen.findByText('product keyword');
  return runtime;
}

describe('keyword grouping and stored business copy', () => {
  it.each(['en-US', 'zh-CN'] as const)(
    'shows backend groups and filters them in %s',
    async (locale) => {
      await setup(locale);
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('tab', {
          name: `${$t('keywordSuggestions.groups.comparison')} 1`,
        }),
      );
      expect(screen.getByText('comparison keyword')).toBeVisible();
      expect(screen.queryByText('product keyword')).not.toBeInTheDocument();
      expect(
        screen.getByText('User-authored comparison description'),
      ).toBeVisible();
    },
  );

  it('retains the selected backend group and row across both language changes', async () => {
    const runtime = await setup('en-US');
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('tab', {
        name: `${$t('keywordSuggestions.groups.comparison')} 1`,
      }),
    );
    const row = screen.getByText('comparison keyword').closest('tr')!;
    await user.click(within(row).getByRole('checkbox'));
    await act(() => runtime.changeLanguage('zh-CN'));
    expect(screen.getByRole('tab', { name: '对比与替代词 1' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(row).getByRole('checkbox')).toBeChecked();
    expect(screen.queryByText('product keyword')).not.toBeInTheDocument();
    await act(() => runtime.changeLanguage('en-US'));
    expect(
      screen.getByRole('tab', {
        name: `${$t('keywordSuggestions.groups.comparison')} 1`,
      }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(within(row).getByRole('checkbox')).toBeChecked();
  });

  it('translates only unedited built-ins at display time without changing the stored playbook', async () => {
    const runtime = await setup('zh-CN');
    const builtin: Playbook = {
      id: 'p',
      name: '调研分析',
      description: '不改仓库，写出一份文档',
      category: 'research',
      kind: 'plan',
      next: [],
      version: 1,
      system: true,
      steps: [
        {
          key: 's',
          name: '分析',
          kind: 'analyze',
          instruction: '先确认搜索意图与产品相关性，再决定是否投入内容。',
        },
      ],
    };
    const original = structuredClone(builtin);
    expect(localizePlaybook(builtin).name).toBe('调研分析');
    await act(() => runtime.changeLanguage('en-US'));
    expect(localizePlaybook(builtin).name).toBe($t('common.researchAnalysis'));
    expect(localizePlaybook({ ...builtin, edited: true }).name).toBe(
      '调研分析',
    );
    expect(localizePlaybook({ ...builtin, system: false }).name).toBe(
      '调研分析',
    );
    expect(builtin).toEqual(original);
    await act(() => runtime.changeLanguage('zh-CN'));
    expect(localizePlaybook(builtin)).toEqual(original);
  });
});
