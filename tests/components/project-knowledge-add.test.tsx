import '@testing-library/jest-dom/vitest';
import { cleanup, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { mountProjectKnowledge } from '../fixtures/project-knowledge-routes';

const { action, memory } = vi.hoisted(() => ({
  action: vi.fn(),
  memory: Array.from({ length: 20 }, (_, i) => ({
    section: 'product',
    label: '产品',
    text: `条目 ${i}：${'产品说明。'.repeat(50)}`,
    reason: '长期记忆',
  })),
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, name: 'Example' } }),
  useUnsavedWarning: () => {},
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: () => {} },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function setup() {
  action.mockImplementation(async (resource: string, command: string) => {
    if (resource === 'nrKnowledge' && command === 'list') return { items: [] };
    if (resource === 'nrMemory')
      return { running: null, suggestions: [], aiReady: false };
    if (command === 'suggest')
      return {
        kind: 'knowledge',
        draftId: 'draft',
        title: '长资料',
        category: 'product',
        chars: 5000,
        memory,
      };
    if (command === 'confirm')
      return { item: { title: '长资料' }, memory: ['产品'] };
    throw new Error(`Unexpected request ${resource}/${command}`);
  });
  const router = await mountProjectKnowledge('/project/knowledge?q=');
  const user = userEvent.setup();
  // An empty list offers adding once, in its empty state.
  expect(
    await screen.findAllByRole('button', { name: '添加资料' }),
  ).toHaveLength(1);
  await user.click(
    (await screen.findAllByRole('button', { name: '添加资料' }))[0],
  );
  expect(router.state.location.pathname).toBe('/project/knowledge/new');
  await user.click(screen.getByRole('button', { name: '填网址' }));
  await user.type(
    screen.getByRole('textbox', { name: '网址' }),
    'https://example.com/docs',
  );
  await user.click(screen.getByRole('button', { name: '下一步' }));
  await screen.findByRole('button', { name: '确认' });
  return { user, router };
}

it('keeps long link suggestions in a bounded scrolling body with accessible actions and submits selected lines', async () => {
  const { user, router } = await setup();
  const dialog = screen.getByRole('dialog', { name: '添加资料' });
  const body = dialog.querySelector<HTMLElement>(
    '[data-slot="route-overlay-body"]',
  )!;
  expect(dialog).toHaveClass('flex', 'max-h-[calc(100dvh-2rem)]', 'flex-col');
  expect(body).toHaveClass('min-h-0', 'overflow-y-auto');
  expect(body.querySelectorAll('[data-memory-line]')).toHaveLength(20);
  expect(body).not.toContainElement(
    within(dialog).getByRole('button', { name: '确认' }),
  );
  expect(body).not.toContainElement(
    within(dialog).getByRole('button', { name: '关闭' }),
  );
  const last = within(body).getAllByRole('checkbox').at(-1)!;
  await user.click(last);
  expect(last).not.toBeChecked();
  await user.click(within(dialog).getByRole('button', { name: '确认' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(router.state.location.pathname).toBe('/project/knowledge');
  expect(action).toHaveBeenCalledWith(
    'nrKnowledgeAdd',
    'confirm',
    expect.objectContaining({
      body: expect.objectContaining({
        draftId: 'draft',
        saveKnowledge: true,
        memory: memory
          .slice(0, -1)
          .map(({ section, text }) => ({ section, text })),
      }),
    }),
  );
  // The list is read again after saving.
  expect(
    action.mock.calls.filter(
      ([resource, command]) => resource === 'nrKnowledge' && command === 'list',
    ),
  ).toHaveLength(2);
  await user.click(screen.getAllByRole('button', { name: '添加资料' })[0]);
  expect(await screen.findByRole('button', { name: '下一步' })).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: '确认' }),
  ).not.toBeInTheDocument();
});

it('can go back, and asks before closing a suggestion without saving', async () => {
  const { user, router } = await setup();
  await user.click(screen.getByRole('button', { name: '返回' }));
  expect(screen.getByRole('textbox', { name: '网址' })).toHaveValue(
    'https://example.com/docs',
  );
  await user.click(screen.getByRole('button', { name: '下一步' }));
  await screen.findByRole('button', { name: '确认' });
  await user.click(screen.getByRole('button', { name: '关闭' }));
  const ask = await screen.findByRole('alertdialog');
  await user.click(within(ask).getByRole('button', { name: '放弃' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(router.state.location.pathname).toBe('/project/knowledge');
  expect(
    action.mock.calls.filter(([, command]) => command === 'confirm'),
  ).toHaveLength(0);
  expect(
    screen.getAllByRole('button', { name: '添加资料' })[0],
  ).toBeInTheDocument();
});
