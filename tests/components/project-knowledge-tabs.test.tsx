import '@testing-library/jest-dom/vitest';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import english from '../../shared/i18n/en.json';
import { setDictionary } from '../../client/i18n';
import { mountProjectKnowledge } from '../fixtures/project-knowledge-routes';

const { action, project } = vi.hoisted(() => ({
  action: vi.fn(),
  project: {
    id: 1,
    name: 'Example',
    memory: {
      brand: 'Example builds business apps.',
      product: 'Core and Studio.',
    },
  },
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project }),
  useUnsavedWarning: () => {},
}));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: () => {} },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));

const items = [
  {
    id: 'a1',
    title: 'Competitor pricing',
    category: 'competitor',
    kind: 'text',
    chars: 1200,
    summary: 'Plans and prices',
    addedAt: '2026-10-15T00:00:00Z',
  },
  {
    id: 'b2',
    title: 'Customer interview',
    category: 'customer',
    kind: 'file',
    fileName: 'interview.docx',
    chars: 800,
    summary: 'What customers said',
    addedAt: '2026-10-13T00:00:00Z',
  },
];
const suggestion = {
  id: 's1',
  section: 'product',
  label: '产品',
  text: 'A CLI ships with it.',
  reason: 'New docs pages',
  examples: ['CLI reference'],
  source: 'site',
  at: '2026-10-19T00:00:00Z',
};
beforeEach(() => {
  action.mockImplementation(async (resource: string, command: string) => {
    if (resource === 'nrKnowledge' && command === 'list') return { items };
    if (resource === 'nrKnowledge' && command === 'get')
      return { text: 'Full text of the material.' };
    if (resource === 'nrMemory')
      return {
        running: null,
        aiReady: true,
        draft: null,
        lastCheck: { at: '2026-10-19T00:00:00Z', ok: true, added: 1 },
        suggestions: [suggestion],
      };
    return {};
  });
});
afterEach(() => {
  setDictionary(null);
  cleanup();
  vi.clearAllMocks();
});

test('opens 记忆 from /project, keeps the query and moves between tabs through the URL', async () => {
  const user = userEvent.setup();
  const router = await mountProjectKnowledge('/project?projectId=1');
  const memoryTab = await screen.findByRole('link', { name: /记忆/ });
  expect(router.state.location.pathname).toBe('/project/memory');
  expect(router.state.location.search).toBe('?projectId=1');
  expect(router.state.historyAction).toBe('REPLACE');
  expect(memoryTab).toHaveAttribute('aria-current', 'page');
  // The pending suggestions are counted on the tab.
  expect(within(memoryTab).getByText('1 条更新建议')).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: /知识库/ }));
  expect(
    await screen.findByRole('table', { name: '知识库资料' }),
  ).toBeInTheDocument();
  expect(router.state.location.pathname).toBe('/project/knowledge');
  // The knowledge tab's own search stays in its URL and is dropped on the way back to 记忆.
  await user.type(
    screen.getByRole('textbox', { name: '搜索知识库' }),
    'pricing',
  );
  expect(new URLSearchParams(router.state.location.search).get('q')).toBe(
    'pricing',
  );
  expect(screen.getAllByRole('row')).toHaveLength(2);
  await user.click(screen.getByRole('link', { name: /记忆/ }));
  expect(router.state.location.search).toBe('?projectId=1');
  await router.navigate(-1);
  expect(
    await screen.findByRole('table', { name: '知识库资料' }),
  ).toBeInTheDocument();
});

test('edits one memory item in a dialog and sends only that item', async () => {
  const user = userEvent.setup();
  const router = await mountProjectKnowledge('/project/memory');
  // An empty item says so and offers to fill it in.
  await screen.findByText('受众');
  const audience = document.querySelector<HTMLElement>(
    '[data-memory-item="audience"]',
  )!;
  expect(within(audience).getByText('未填写')).toBeInTheDocument();
  expect(
    within(audience).getByRole('button', { name: '填写：受众' }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '编辑：产品' }));
  expect(router.state.location.pathname).toBe('/project/memory/product/edit');
  const dialog = await screen.findByRole('dialog', { name: '编辑：产品' });
  const field = within(dialog).getByRole('textbox');
  expect(field).toHaveValue('Core and Studio.');
  await user.clear(field);
  await user.type(field, 'Core, Studio and the CLI.');
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(router.state.location.pathname).toBe('/project/memory');
  expect(action).toHaveBeenCalledWith('nrKnowledge', 'saveMemory', {
    method: 'POST',
    // Only the edited item: the server merges it into what is saved now.
    body: {
      projectId: '1',
      section: 'product',
      text: 'Core, Studio and the CLI.',
    },
    unwrap: 'data',
  });
});

test('asks before closing an edited item and keeps it open on cancel', async () => {
  const user = userEvent.setup();
  const router = await mountProjectKnowledge('/project/memory/brand/edit');
  const dialog = await screen.findByRole('dialog', { name: '编辑：品牌基础' });
  await user.type(within(dialog).getByRole('textbox'), ' More.');
  await user.click(within(dialog).getByRole('button', { name: '取消' }));
  const ask = await screen.findByRole('alertdialog');
  await user.click(within(ask).getByRole('button', { name: '取消' }));
  expect(router.state.location.pathname).toBe('/project/memory/brand/edit');
  expect(
    action.mock.calls.filter(([, command]) => command === 'saveMemory'),
  ).toHaveLength(0);
});

test('an unknown memory item says it does not exist', async () => {
  await mountProjectKnowledge('/project/memory/unknown/edit');
  expect(
    await screen.findByRole('dialog', { name: '没有这一项' }),
  ).toBeInTheDocument();
});

test('opens a material in a drawer by its URL and deletes it from there', async () => {
  const user = userEvent.setup();
  const router = await mountProjectKnowledge(
    '/project/knowledge?category=customer',
  );
  expect(
    await screen.findByRole('link', { name: 'Customer interview' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Competitor pricing' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Customer interview' }));
  expect(router.state.location).toMatchObject({
    pathname: '/project/knowledge/b2',
    search: '?category=customer',
  });
  const drawer = await screen.findByRole('dialog', {
    name: 'Customer interview',
  });
  expect(
    await within(drawer).findByText('Full text of the material.'),
  ).toBeInTheDocument();
  await user.click(within(drawer).getByRole('button', { name: '删除' }));
  const ask = await screen.findByRole('alertdialog');
  await user.click(within(ask).getByRole('button', { name: '删除' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(router.state.location).toMatchObject({
    pathname: '/project/knowledge',
    search: '?category=customer',
  });
  expect(action).toHaveBeenCalledWith(
    'nrKnowledge',
    'remove',
    expect.objectContaining({ body: { projectId: '1', itemId: 'b2' } }),
  );
});

test('clears the search and category from the toolbar', async () => {
  const user = userEvent.setup();
  const router = await mountProjectKnowledge(
    '/project/knowledge?category=customer&q=interview',
  );
  expect(
    await screen.findByRole('link', { name: 'Customer interview' }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '清除筛选' }));
  expect(router.state.location.search).toBe('');
  expect(
    screen.getByRole('link', { name: 'Competitor pricing' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: '清除筛选' }),
  ).not.toBeInTheDocument();
});

test('a material that no longer exists says so', async () => {
  await mountProjectKnowledge('/project/knowledge/gone');
  expect(
    await screen.findByRole('dialog', { name: '资料不存在' }),
  ).toBeInTheDocument();
});

test('accepts a suggestion and shows its examples behind the ⓘ', async () => {
  const user = userEvent.setup();
  await mountProjectKnowledge('/project/memory');
  const region = await screen.findByRole('region', { name: '更新建议' });
  expect(within(region).getByText('A CLI ships with it.')).toBeInTheDocument();
  expect(
    within(region).getByText(/上次检查 10\/19，1 条建议/),
  ).toBeInTheDocument();
  await user.click(within(region).getByRole('button', { name: '补充' }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrMemory',
      'accept',
      expect.objectContaining({ body: { projectId: '1', ids: ['s1'] } }),
    ),
  );
});

test('the tabs and their dialogs follow a language change in place', async () => {
  await mountProjectKnowledge('/project/memory/brand/edit');
  expect(await screen.findByText(/已填 2 \/ 9 项/)).toBeInTheDocument();
  expect(
    await screen.findByRole('dialog', { name: '编辑：品牌基础' }),
  ).toBeInTheDocument();
  act(() => setDictionary(english));
  expect(await screen.findByText(/2 of 9 filled/)).toBeInTheDocument();
  expect(
    screen.getByRole('dialog', { name: 'Edit: Brand basics' }),
  ).toBeInTheDocument();
});
