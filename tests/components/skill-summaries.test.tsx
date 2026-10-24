import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { $t, setDictionary } from '../../client/i18n';
import enDictionary from '../../shared/i18n/en.json';
import SkillsPage from '../../client/pages/skills';
import type { Skill } from '../../client/pages/skill-model';

vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, name: 'Example' } }),
  useUnsavedWarning: () => {},
}));
const original =
  'When the user wants to audit, review, or diagnose SEO issues on their site.';
const library: Skill[] = [
  {
    id: 'sk-1',
    name: 'seo-audit',
    description: original,
    summaryKey: 'skillSummaries.seoAudit',
    files: [],
    chars: 1,
    enabled: true,
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
  },
  {
    id: 'sk-2',
    name: 'my-skill',
    description: 'Mine, as written',
    files: [],
    chars: 1,
    enabled: false,
    createdAt: '2026-10-01',
    updatedAt: '2026-10-02',
  },
];
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    wrapRequests: () => {},
    action: vi.fn(async (resource: string, action: string) => {
      if (resource === 'nrSkills' && action === 'list')
        return { revision: 1, skills: library };
      if (resource === 'nrSkills' && action === 'get')
        return { skill: library[0], body: '# SEO Audit', files: [] };
      if (resource === 'nrPlaybooks') return { revision: 1, playbooks: [] };
      throw new Error(`Unexpected mock ${resource}/${action}`);
    }),
  },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));
afterEach(() => {
  cleanup();
  setDictionary(null);
});
const page = () =>
  render(
    <MemoryRouter>
      <SkillsPage />
    </MemoryRouter>,
  );
const row = async (name: string) =>
  (await screen.findByRole('button', { name, exact: true })).closest('tr')!;

it('shows a product Skill in the UI language and other Skills as written', async () => {
  page();
  const audit = await row('seo-audit');
  expect(within(audit).getByText($t('skillSummaries.seoAudit'))).toBeVisible();
  expect(within(audit).queryByText(original)).toBeNull();
  expect(
    within(await row('my-skill')).getByText('Mine, as written'),
  ).toBeVisible();
  cleanup();
  act(() => setDictionary(enDictionary));
  page();
  expect(
    within(await row('seo-audit')).getByText(
      enDictionary['skillSummaries.seoAudit'],
    ),
  ).toBeVisible();
});

it('finds a Skill by its summary and shows the original text for the Agent in its ⓘ', async () => {
  const user = userEvent.setup();
  page();
  await row('seo-audit');
  await user.type(
    screen.getByRole('textbox', { name: $t('skills.searchSkills') }),
    '收录',
  );
  expect(
    screen.queryByRole('button', { name: 'my-skill', exact: true }),
  ).toBeNull();
  await user.click(
    screen.getByRole('button', { name: 'seo-audit', exact: true }),
  );
  await user.click(
    await screen.findByRole('button', {
      name: $t('common.what', { 0: $t('skills.whenUse') }),
    }),
  );
  expect(
    await screen.findByText($t('skills.originalForAgent', { 0: original })),
  ).toBeVisible();
});
