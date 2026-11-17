import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { $t } from '../../client/i18n';
import { nocobaseClient } from '../../client/lib/nocoreach-api';
import { toast } from '../../client/lib/toast';
import PlaybooksPage from '../../client/pages/playbooks';
import SkillsPage from '../../client/pages/skills';

// Saving in the Playbooks and Skills drawers: a failure is said in the drawer, by Save, with each missing field marked,
// and the drawer keeps what was typed; a success is a toast, which shows above the drawer's overlay.
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, name: 'Example' } }),
  useUnsavedWarning: () => {},
}));
vi.mock('../../client/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));
const playbooks = {
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
        { key: 'build', name: 'Change', kind: 'change', instruction: 'Fix it' },
      ],
    },
  ],
};
const skill = {
  id: 'sk-1',
  name: 'seo-audit',
  description: 'When auditing',
  files: [],
  chars: 1,
  enabled: false,
  createdAt: '2026-10-01',
  updatedAt: '2026-10-01',
};
// Each test answers the save-like actions itself.
const failing = new Map<string, Error>();
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    wrapRequests: () => {},
    action: vi.fn(async (resource: string, action: string) => {
      const failure = failing.get(`${resource}.${action}`);
      if (failure) throw failure;
      if (resource === 'nrPlaybooks') return playbooks;
      if (resource === 'nrSkills' && action === 'list')
        return { revision: 1, skills: [skill] };
      if (resource === 'nrSkills' && action === 'get')
        return { body: '# Audit', files: [] };
      if (resource === 'nrSkills') return {};
      throw new Error(`Unexpected mock ${resource}/${action}`);
    }),
  },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));
const action = vi.mocked(nocobaseClient.action);
const sent = (resource: string, name: string) =>
  action.mock.calls.filter(([r, a]) => r === resource && a === name);
beforeEach(() => {
  failing.clear();
  action.mockClear();
  vi.mocked(toast.success).mockClear();
});
afterEach(() => cleanup());

async function openPlaybookEditor() {
  render(
    <MemoryRouter initialEntries={['/playbooks?id=tech-fix']}>
      <PlaybooksPage />
    </MemoryRouter>,
  );
  const drawer = await screen.findByRole('dialog');
  await userEvent.click(
    within(drawer).getByRole('button', { name: $t('common.edit') }),
  );
  return drawer;
}

it('marks a playbook step without instructions in the drawer and sends nothing', async () => {
  const drawer = await openPlaybookEditor();
  const instructions = within(drawer).getByRole('textbox', {
    name: $t('playbooks.instructionsAgent'),
  });
  await userEvent.clear(instructions);
  await userEvent.click(
    within(drawer).getByRole('button', { name: $t('common.save') }),
  );
  expect(
    within(drawer).getByText($t('common.fillHighlightedFields')),
  ).toBeVisible();
  expect(
    within(drawer).getByText($t('playbooks.stepInstructionRequired')),
  ).toBeVisible();
  expect(instructions).toHaveAttribute('aria-invalid', 'true');
  expect(sent('nrPlaybooks', 'save')).toHaveLength(0);
});

it('keeps a playbook drawer open with its input when the save fails, and toasts a success', async () => {
  failing.set(
    'nrPlaybooks.save',
    new Error('Updated in another window. Refresh first.'),
  );
  const drawer = await openPlaybookEditor();
  const name = within(drawer).getByRole('textbox', { name: $t('common.name') });
  await userEvent.type(name, ' 2');
  await userEvent.click(
    within(drawer).getByRole('button', { name: $t('common.save') }),
  );
  expect(
    await within(drawer).findByText(
      'Updated in another window. Refresh first.',
    ),
  ).toBeVisible();
  expect(name).toHaveValue('Technical fix 2');
  expect(toast.success).not.toHaveBeenCalled();

  failing.clear();
  await userEvent.click(
    within(drawer).getByRole('button', { name: $t('common.save') }),
  );
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
});

async function openSkillDrawer() {
  render(
    <MemoryRouter>
      <SkillsPage />
    </MemoryRouter>,
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'seo-audit', exact: true }),
  );
  return screen.findByRole('region', { name: $t('skills.skillDetails') });
}

it('marks a Skill edit without how-to in the drawer, then toasts the save', async () => {
  const drawer = await openSkillDrawer();
  await userEvent.click(
    await within(drawer).findByRole('button', { name: $t('common.edit') }),
  );
  const how = within(drawer).getByRole('textbox', { name: $t('skills.how') });
  await userEvent.clear(how);
  await userEvent.click(
    within(drawer).getByRole('button', { name: $t('common.save') }),
  );
  expect(within(drawer).getByText($t('skills.describeHow'))).toBeVisible();
  expect(how).toHaveAttribute('aria-invalid', 'true');
  expect(sent('nrSkills', 'edit')).toHaveLength(0);

  await userEvent.type(how, 'Check the titles');
  await userEvent.click(
    within(drawer).getByRole('button', { name: $t('common.save') }),
  );
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
  expect(sent('nrSkills', 'edit')).toHaveLength(1);
});

it('says in the Skill drawer why enabling failed, and toasts a success', async () => {
  failing.set('nrSkills.setEnabled', new Error('Not allowed in this project'));
  const drawer = await openSkillDrawer();
  // Labelled by its aria-label and the label around it with the hint.
  const toggle = within(drawer).getByRole('switch', {
    name: (name) => name.startsWith($t('skills.enableProject')),
  });
  await userEvent.click(toggle);
  expect(
    await within(drawer).findByText('Not allowed in this project'),
  ).toBeVisible();

  failing.clear();
  await userEvent.click(toggle);
  await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
});
