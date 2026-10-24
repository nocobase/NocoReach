import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { expect, it, vi } from 'vitest';
import { TaskProperties } from '../../client/pages/task-detail/task-properties';
import type { TaskData } from '../../client/pages/task-execution-types';

// Translations show their key, with any values after a colon.
vi.mock('../../client/i18n', async () => {
  const text = (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key;
  return {
    isChinese: () => false,
    getCurrentLocale: () => 'en-US',
    $t: text,
    // Elements in the values stay elements, after the key.
    $tj: (key: string, values: Record<string, unknown>) => (
      <>
        {key}:{Object.values(values) as React.ReactNode[]}
      </>
    ),
  };
});
vi.mock('@nocobase/i18n/client', async (original) => ({
  ...(await original<typeof import('@nocobase/i18n/client')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/pages/task-detail/agent-menu', () => ({
  AgentMenu: () => <span>agent</span>,
}));

const data = {
  task: {
    id: 41,
    title: 'Update Top 15',
    createdAt: '2026-10-22T08:00:00Z',
    evidence: { insight: { id: 'o43', no: 43 } },
  },
  work: { revision: 1, stage: 'plan', history: [], results: [] },
  related: [
    {
      id: 34,
      title: 'Update the comparison pages',
      relation: 'sibling',
      no: 34,
      state: 'done',
    },
    {
      id: 42,
      title: 'Update Top 11',
      relation: 'sibling',
      no: 42,
      state: 'doing',
    },
    {
      id: 43,
      title: 'Reply to unanswered community posts',
      relation: 'sibling',
      no: 43,
      state: 'closed',
    },
  ],
} as unknown as TaskData;

function Where() {
  const at = useLocation();
  return <output data-testid='at'>{at.pathname + at.search}</output>;
}

it("lists the other tasks of the task's opportunity with where each stands, and links back to the opportunity", () => {
  render(
    <MemoryRouter initialEntries={['/actions/41']}>
      <Routes>
        <Route
          path='*'
          element={
            <>
              <TaskProperties
                data={data}
                members={[]}
                allowed={false}
                busy={false}
                runActive={false}
                onOwner={() => undefined}
                onAgent={async () => true}
              />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  const group = document.querySelector(
    '[data-same-opportunity]',
  ) as HTMLElement;
  expect(group.textContent).toContain('opportunityTasks.sameOpportunity:O-43');
  for (const [title, tag] of [
    ['T-34 Update the comparison pages', 'common.completed'],
    ['T-42 Update Top 11', 'common.inProgress'],
    ['T-43 Reply to unanswered community posts', 'common.closed'],
  ]) {
    const row = within(group).getByRole('button', { name: title })
      .parentElement as HTMLElement;
    expect(row.textContent).toContain(tag);
  }
  // No "Previous" or "Next": these are not a playbook chain.
  expect(screen.queryByText(/taskDetail.previous|taskDetail.next/)).toBeNull();
  fireEvent.click(
    within(group).getByRole('button', { name: 'T-42 Update Top 11' }),
  );
  expect(screen.getByTestId('at').textContent).toBe('/actions/42');
  fireEvent.click(within(group).getByRole('button', { name: 'O-43' }));
  expect(screen.getByTestId('at').textContent).toBe('/opportunities?item=o43');
});
