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

function mount(d: TaskData) {
  return render(
    <MemoryRouter initialEntries={['/actions/41']}>
      <Routes>
        <Route
          path='*'
          element={
            <>
              <TaskProperties
                data={d}
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
}

it("lists the other tasks of the task's opportunity with where each stands, and links back to the opportunity", () => {
  mount(data);
  const group = document.querySelector('[data-related="same"]') as HTMLElement;
  expect(group.textContent).toContain('taskDetail.relatedSame:O-43');
  for (const [title, tag] of [
    ['Update the comparison pages', 'common.completed'],
    ['Update Top 11', 'common.inProgress'],
    ['Reply to unanswered community posts', 'common.closed'],
  ]) {
    const row = within(group).getByTitle(title);
    expect(row.textContent).toContain(tag);
  }
  // No previous or next step: these are not a playbook chain.
  expect(document.querySelector('[data-related="prev"]')).toBeNull();
  expect(document.querySelector('[data-related="next"]')).toBeNull();
  fireEvent.click(within(group).getByTitle('Update Top 11'));
  expect(screen.getByTestId('at').textContent).toBe('/actions/42');
  fireEvent.click(within(group).getByRole('button', { name: 'O-43' }));
  expect(screen.getByTestId('at').textContent).toBe('/opportunities?item=o43');
});

// 2026-10-24 user decision: T-37 was listed twice, as the previous step and under the same opportunity.
it('lists a task once, in its closest relation, and leaves out empty groups', () => {
  const view = mount({
    ...data,
    related: [
      {
        id: 37,
        title: 'Add a FAQ page',
        relation: 'prev',
        no: 37,
        state: 'done',
      },
      {
        id: 37,
        title: 'Add a FAQ page',
        relation: 'sibling',
        no: 37,
        state: 'done',
      },
      {
        id: 44,
        title: 'Add FAQ markup',
        relation: 'sibling',
        no: 44,
        state: 'doing',
      },
    ],
  } as unknown as TaskData);
  expect(screen.getAllByTitle('Add a FAQ page')).toHaveLength(1);
  expect(
    within(
      document.querySelector('[data-related="prev"]') as HTMLElement,
    ).getByTitle('Add a FAQ page'),
  ).toBeInTheDocument();
  expect(
    within(
      document.querySelector('[data-related="same"]') as HTMLElement,
    ).getByTitle('Add FAQ markup'),
  ).toBeInTheDocument();
  expect(document.querySelector('[data-related="next"]')).toBeNull();
  view.unmount();
  // Nothing related: no section at all.
  mount({ ...data, related: [] } as unknown as TaskData);
  expect(
    screen.queryByRole('region', { name: 'taskDetail.propRelated' }),
  ).toBeNull();
});
