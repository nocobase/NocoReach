import { StrictMode, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router';
import { setDictionary } from '../../client/i18n/index.js';
import english from '../../shared/i18n/en.json';
import CreateFollowUp from '../../client/pages/results/create.js';
const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api.js', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
vi.mock('../../client/pages/reach-data.js', () => ({
  useUnsavedWarning: () => {},
}));
vi.mock('../../client/components/route-dialog.js', () => ({
  RouteDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../client/components/use-route-overlay.js', () => ({
  useRouteOverlay: () => ({ close: async () => {} }),
}));
vi.mock('react-router', async (original) => ({
  ...(await original<typeof import('react-router')>()),
  useOutletContext: () => ({
    projectId: '1',
    day: 7,
    data: {
      task: {
        id: '11',
        no: 11,
        title: 'Completed task',
        state: 'done',
        closed: false,
        simulated: false,
        summary: '',
      },
      taskRevision: 0,
      observeFrom: null,
      pages: [],
      results: [],
      followUps: [],
      strategyRevision: 0,
    },
  }),
}));
afterEach(cleanup);
it('navigates to the pending task after a confirmed submission under StrictMode effect replay', async () => {
  setDictionary(english);
  action.mockResolvedValue({ kind: 'task', id: '99' });
  render(
    <StrictMode>
      <MemoryRouter initialEntries={['/create']}>
        <Routes>
          <Route path='/create' element={<CreateFollowUp />} />
          <Route path='/actions/99' element={<p>Created task</p>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('combobox', { name: english['results.kind'] }),
  );
  await user.click(
    await screen.findByRole('option', { name: english['results.taskKind'] }),
  );
  fireEvent.change(screen.getByLabelText(english['results.titleField']), {
    target: { value: 'Investigate data' },
  });
  fireEvent.change(screen.getByLabelText(english['results.objective']), {
    target: { value: 'Understand the change' },
  });
  fireEvent.change(screen.getByLabelText(english['results.brief']), {
    target: { value: 'Verify evidence before execution' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: english['results.confirmTask'] }),
  );
  expect(await screen.findByText('Created task')).toBeInTheDocument();
  expect(action).toHaveBeenCalledTimes(1);
  expect(action).toHaveBeenCalledWith(
    'nrStrategy',
    'createFromResult',
    expect.objectContaining({
      body: expect.objectContaining({
        kind: 'task',
        source: { taskId: '11', taskRevision: 0, day: null, computedAt: null },
      }),
    }),
  );
});
