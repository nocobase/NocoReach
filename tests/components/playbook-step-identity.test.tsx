import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { $t, setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import PlaybooksPage from '../../client/pages/playbooks';
import type { PlaybookList } from '../../client/pages/playbook-model';

const state = vi.hoisted(() => ({
  request:
    vi.fn<
      (
        action: string,
        projectId: number,
        body?: object,
      ) => Promise<PlaybookList>
    >(),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 7 }, error: '' }),
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true }),
}));
vi.mock('../../client/pages/playbook-model', async (original) => ({
  ...(await original<typeof import('../../client/pages/playbook-model')>()),
  playbookRequest: state.request,
}));
vi.mock('../../client/pages/skill-model', async (original) => ({
  ...(await original<typeof import('../../client/pages/skill-model')>()),
  skillRequest: vi.fn().mockResolvedValue({ skills: [] }),
}));
afterEach(() => {
  cleanup();
  setDictionary(null);
});

test('moving and removing steps preserves the matching editor and saves only business fields', async () => {
  setDictionary(english);
  state.request.mockResolvedValue({
    revision: 1,
    playbooks: [
      {
        id: 'research',
        name: 'Research',
        category: 'research',
        description: '',
        kind: 'plan',
        version: 1,
        next: [],
        steps: [
          {
            key: 'first',
            name: 'First',
            kind: 'analyze',
            instruction: 'First task',
          },
          {
            key: 'second',
            name: 'Second',
            kind: 'analyze',
            instruction: 'Second task',
          },
        ],
      },
    ],
  });
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/playbooks?id=research']}>
      <PlaybooksPage />
    </MemoryRouter>,
  );
  await user.click(
    await screen.findByRole('button', { name: $t('common.edit'), exact: true }),
  );
  const inputAt = (n: number) =>
    screen.getByRole('textbox', { name: $t('playbooks.nameStep', { 0: n }) });
  const first = inputAt(1),
    second = inputAt(2);
  await user.type(first, ' edited');
  await user.click(
    within(second.closest('li')!).getByRole('button', {
      name: $t('common.moveUp'),
    }),
  );
  expect(inputAt(1)).toBe(second);
  expect(inputAt(2)).toBe(first);
  expect(first).toHaveValue('First edited');
  await user.click(
    within(first.closest('li')!).getByRole('button', {
      name: $t('playbooks.deleteStep'),
    }),
  );
  expect(inputAt(1)).toBe(second);
  await user.click(
    screen.getByRole('button', {
      name: $t('playbook.agentAnalysis'),
      exact: true,
    }),
  );
  expect(inputAt(1)).toBe(second);
  expect(inputAt(2)).not.toBe(first);
  await user.click(
    screen.getByRole('button', { name: $t('common.save'), exact: true }),
  );
  await waitFor(() =>
    expect(state.request).toHaveBeenCalledWith(
      'save',
      7,
      expect.objectContaining({
        steps: [
          {
            key: 'second',
            name: 'Second',
            kind: 'analyze',
            instruction: 'Second task',
          },
          {
            key: '',
            name: $t('common.analyze'),
            kind: 'analyze',
            instruction: '',
          },
        ],
      }),
    ),
  );
});
