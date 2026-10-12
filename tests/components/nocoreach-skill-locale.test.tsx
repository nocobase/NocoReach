import '@testing-library/jest-dom/vitest';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { $t, connectLocale, setDictionary } from '../../client/i18n';
import locales from '../../client/locales';
import SkillsPage from '../../client/pages/skills';
vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ isAdmin: true }),
  AdminOnlyNote: () => null,
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, name: 'Example' } }),
  useUnsavedWarning: () => {},
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    wrapRequests: () => {},
    action: vi.fn(async (resource: string, action: string) => {
      if (resource === 'nrSkills' && action === 'list')
        return {
          revision: 1,
          skills: [
            {
              id: 'builtin',
              name: 'research-report',
              description:
                '写调研报告、竞品对比、数据变化原因分析等文档时使用：报告的结构、证据和结论的写法。',
              builtIn: true,
              enabled: false,
              files: [],
              chars: 8,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
            },
            {
              id: 'edited-builtin',
              name: 'edited-builtin',
              description: '分析。任务。',
              builtIn: true,
              enabled: false,
              files: [],
              chars: 8,
              createdAt: '2026-01-01',
              updatedAt: '2026-02-01',
            },
            {
              id: 'fixture',
              name: 'custom-fixture',
              description: '分析。任务。',
              builtIn: false,
              enabled: false,
              files: [],
              chars: 8,
              createdAt: '2026-01-01',
              updatedAt: '2026-01-01',
            },
          ],
        };
      if (resource === 'nrPlaybooks') return { revision: 1, playbooks: [] };
      throw new Error(`Unexpected mock ${resource}/${action}`);
    }),
  },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));
let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  disconnect?.();
  setDictionary(null);
});
it('preserves a custom Skill description after switching the UI to English', async () => {
  const runtime = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter>
        <SkillsPage />
      </MemoryRouter>
    </I18nProvider>,
  );
  await screen.findByRole('button', { name: 'custom-fixture', exact: true });
  const row = document.querySelector('[data-skill-id="fixture"]')!;
  await userEvent
    .setup()
    .click(within(row as HTMLElement).getByRole('checkbox'));
  for (const locale of ['en-US', 'zh-CN', 'en-US']) {
    await act(() => runtime.changeLanguage(locale));
    expect(
      document.querySelector('[data-skill-id="fixture"]'),
    ).toHaveTextContent('分析。任务。');
    expect(
      document.querySelector('[data-skill-id="edited-builtin"]'),
    ).toHaveTextContent('分析。任务。');
    expect(
      document.querySelector('[data-skill-id="builtin"]'),
    ).toHaveTextContent(
      $t(
        '写调研报告、竞品对比、数据变化原因分析等文档时使用：报告的结构、证据和结论的写法。',
      ),
    );
    expect(within(row as HTMLElement).getByRole('checkbox')).toBeChecked();
  }
});
