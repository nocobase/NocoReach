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
const access = vi.hoisted(() => ({ grants: null as string[] | null }));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: (action: string, projectId: string | number = '$app') => ({
    can: !access.grants || access.grants.includes(`${projectId}:${action}`),
  }),
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
  access.grants = null;
  disconnect?.();
  setDictionary(null);
});
it('project permission enables Skills without exposing shared library mutations', async () => {
  access.grants = [
    '1:nrSkills.setEnabled',
    '1:nrSkills.create',
    '1:nrSkills.remove',
  ];
  render(
    <MemoryRouter>
      <SkillsPage />
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'custom-fixture', exact: true });
  expect(
    screen.queryByRole('button', { name: $t('skills.newSkill') }),
  ).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(
    screen.getByRole('switch', {
      name: $t('skills.enableProjectValue', { 0: 'custom-fixture' }),
    }),
  ).not.toHaveAttribute('aria-disabled', 'true');
});

it('an application grant exposes only its shared Skill creation mode', async () => {
  access.grants = ['$app:nrSkills.create'];
  render(
    <MemoryRouter>
      <SkillsPage />
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'custom-fixture', exact: true });
  expect(
    screen.getByRole('switch', {
      name: $t('skills.enableProjectValue', { 0: 'custom-fixture' }),
    }),
  ).toHaveAttribute('aria-disabled', 'true');
  await userEvent.click(
    screen.getByRole('button', { name: $t('skills.newSkill') }),
  );
  expect(
    screen.getByRole('button', { name: $t('skills.write') }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: $t('skills.uploadFolder') }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: $t('skills.enterLink') }),
  ).toBeNull();
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
    ).toHaveTextContent($t('skillsBuiltin.useWhenWritingResearchReports'));
    expect(within(row as HTMLElement).getByRole('checkbox')).toBeChecked();
  }
});
