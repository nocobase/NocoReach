import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { $t } from '../../client/i18n';
import SkillsPage from '../../client/pages/skills';
import { PickSkills } from '../../client/pages/playbooks';
import { PlaybookSteps } from '../../client/pages/playbook-steps';
import { skillFor, type Skill } from '../../client/pages/skill-model';

vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, name: 'Example' } }),
  useUnsavedWarning: () => {},
}));
// A library where seo-audit was imported by hand (so its id is not the built-in id) and schema is the built-in.
const skill = (id: string, name: string): Skill => ({
  id,
  name,
  description: `${name} description`,
  files: [],
  chars: 1,
  enabled: true,
  createdAt: '2026-10-01',
  updatedAt: '2026-10-01',
});
const library = [skill('sk-1a2b3c4d', 'seo-audit'), skill('schema', 'schema')];
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    wrapRequests: () => {},
    action: vi.fn(async (resource: string, action: string) => {
      if (resource === 'nrSkills' && action === 'list')
        return { revision: 1, skills: library };
      if (resource === 'nrPlaybooks')
        return {
          revision: 1,
          playbooks: [
            {
              id: 'tech-fix',
              name: 'Technical fix',
              category: 'technical',
              description: '',
              kind: 'build',
              next: [],
              system: true,
              version: 3,
              steps: [
                {
                  key: 'build',
                  name: 'Change',
                  kind: 'change',
                  instruction: 'Fix it',
                  skills: ['seo-audit', 'schema'],
                },
              ],
            },
          ],
        };
      throw new Error(`Unexpected mock ${resource}/${action}`);
    }),
  },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));
afterEach(() => cleanup());

it('finds a step Skill by id, then by name', () => {
  expect(skillFor(library, 'schema')?.id).toBe('schema');
  expect(skillFor(library, 'seo-audit')?.id).toBe('sk-1a2b3c4d');
  expect(skillFor(library, 'sk-1a2b3c4d')?.name).toBe('seo-audit');
  expect(skillFor(library, 'gone')).toBeUndefined();
});

it('lists the playbook steps that use a Skill imported under a built-in name', async () => {
  render(
    <MemoryRouter>
      <SkillsPage />
    </MemoryRouter>,
  );
  const row = (
    await screen.findByRole('button', { name: 'seo-audit', exact: true })
  ).closest('tr')!;
  expect(within(row).getByText('Technical fix · Change')).toBeVisible();
  const schema = screen
    .getByRole('button', { name: 'schema', exact: true })
    .closest('tr')!;
  expect(within(schema).getByText('Technical fix · Change')).toBeVisible();
});

it('shows a step Skill named by a built-in name in the playbook steps', () => {
  const steps = (skills: string[]) => [
    { key: 'build', name: 'Change', kind: 'change' as const, skills },
  ];
  const { rerender } = render(
    <PlaybookSteps steps={steps(['seo-audit', 'gone'])} skills={library} />,
  );
  expect(screen.getByText('seo-audit')).toBeVisible();
  // A deleted Skill is left out.
  expect(screen.queryByText('gone')).toBeNull();
  // Named twice (by name and by id), it shows once.
  rerender(
    <PlaybookSteps
      steps={steps(['seo-audit', 'sk-1a2b3c4d'])}
      skills={library}
    />,
  );
  expect(screen.getAllByText('seo-audit')).toHaveLength(1);
});

it('keeps a step Skill named by a built-in name when another is added or removed', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(
    <PickSkills
      index={0}
      ids={['seo-audit', 'gone']}
      skills={library}
      onChange={onChange}
    />,
  );
  expect(screen.getByText('seo-audit')).toBeVisible();
  await user.click(
    screen.getByRole('combobox', {
      name: $t('playbooks.addSkillsStep', { 0: 1 }),
    }),
  );
  await user.click(await screen.findByRole('option', { name: 'schema' }));
  // The deleted Skill is dropped; the built-in name stays as it was saved.
  expect(onChange).toHaveBeenLastCalledWith(['seo-audit', 'schema']);
  rerender(
    <PickSkills
      index={0}
      ids={['seo-audit', 'schema']}
      skills={library}
      onChange={onChange}
    />,
  );
  await user.click(
    screen.getByRole('button', {
      name: $t('playbooks.notUse', { 0: 'schema' }),
    }),
  );
  expect(onChange).toHaveBeenLastCalledWith(['seo-audit']);
});
