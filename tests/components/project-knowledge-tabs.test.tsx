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

test('one Edit opens every item in a dialog and sends only what changed', async () => {
  const user = userEvent.setup();
  const router = await mountProjectKnowledge('/project/memory');
  // Rows carry no edit buttons of their own; an empty item says so.
  await screen.findByText('受众');
  const audience = document.querySelector<HTMLElement>(
    '[data-memory-item="audience"]',
  )!;
  expect(within(audience).getByText('未填写')).toBeInTheDocument();
  expect(within(audience).queryByRole('button')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '编辑' }));
  expect(router.state.location.pathname).toBe('/project/memory/edit');
  const dialog = await screen.findByRole('dialog', { name: '编辑记忆' });
  const product = within(dialog).getByRole('textbox', { name: /^产品/ });
  expect(product).toHaveValue('Core and Studio.');
  expect(within(dialog).getByRole('button', { name: '保存' })).toBeDisabled();
  await user.clear(product);
  await user.type(product, 'Core, Studio and the CLI.');
  await user.type(
    within(dialog).getByRole('textbox', { name: /^受众/ }),
    'Business teams',
  );
  await user.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(router.state.location.pathname).toBe('/project/memory');
  expect(action).toHaveBeenCalledWith('nrKnowledge', 'saveMemory', {
    method: 'POST',
    // Only the changed items: the server merges them into what is saved now.
    body: {
      projectId: '1',
      sections: {
        product: 'Core, Studio and the CLI.',
        audience: 'Business teams',
      },
    },
    unwrap: 'data',
  });
});

test('asks before closing edited memory and keeps it open on cancel', async () => {
  const user = userEvent.setup();
  const router = await mountProjectKnowledge('/project/memory/edit');
  const dialog = await screen.findByRole('dialog', { name: '编辑记忆' });
  await user.type(
    within(dialog).getByRole('textbox', { name: /^品牌基础/ }),
    ' More.',
  );
  await user.click(within(dialog).getByRole('button', { name: '取消' }));
  const ask = await screen.findByRole('alertdialog');
  await user.click(within(ask).getByRole('button', { name: '取消' }));
  expect(router.state.location.pathname).toBe('/project/memory/edit');
  expect(
    action.mock.calls.filter(([, command]) => command === 'saveMemory'),
  ).toHaveLength(0);
});

const sources = {
  urls: ['https://example.com/', 'https://example.com/pricing'],
  custom: false,
  auto: ['https://example.com/', 'https://example.com/pricing'],
  items: [
    {
      id: 'a1',
      title: 'Competitor pricing',
      category: 'competitor',
      addedAt: '',
    },
    {
      id: 'b2',
      title: 'Customer interview',
      category: 'customer',
      addedAt: '',
    },
  ],
  itemIds: ['a1', 'b2'],
  itemsCustom: false,
  autoItemIds: ['a1', 'b2'],
};
function withSources(value: typeof sources) {
  const base = action.getMockImplementation()!;
  action.mockImplementation(async (resource: string, command: string, o) =>
    resource === 'nrMemory' && command === 'sources'
      ? value
      : base(resource, command, o),
  );
}

test('generating shows the pages and materials to read; an untouched choice stays automatic', async () => {
  withSources(sources);
  const user = userEvent.setup();
  const router = await mountProjectKnowledge('/project/memory');
  await user.click(
    await screen.findByRole('button', { name: '根据官网和资料生成' }),
  );
  expect(router.state.location.pathname).toBe('/project/memory/generate');
  const dialog = await screen.findByRole('dialog', {
    name: '根据官网和资料生成记忆',
  });
  expect(
    await within(dialog).findByRole('link', {
      name: 'https://example.com/pricing',
    }),
  ).toBeInTheDocument();
  expect(within(dialog).getByText('自动选择')).toBeInTheDocument();
  expect(within(dialog).getByText('最新的资料')).toBeInTheDocument();
  expect(
    within(dialog).getByRole('checkbox', { name: 'Competitor pricing' }),
  ).toBeChecked();
  await user.click(within(dialog).getByRole('button', { name: '开始生成' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(action).toHaveBeenCalledWith(
    'nrMemory',
    'draft',
    expect.objectContaining({
      body: { projectId: '1', urls: null, itemIds: null },
    }),
  );
});

test('pages and materials can be changed before generating, and the change is sent', async () => {
  withSources(sources);
  const user = userEvent.setup();
  await mountProjectKnowledge('/project/memory/generate');
  const dialog = await screen.findByRole('dialog', {
    name: '根据官网和资料生成记忆',
  });
  await user.click(
    await within(dialog).findByRole('button', {
      name: '移除 https://example.com/pricing',
    }),
  );
  const input = within(dialog).getByRole('textbox', {
    name: '添加网页',
  });
  await user.type(input, 'http://docs.example.com/');
  await user.click(within(dialog).getByRole('button', { name: '添加' }));
  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    '请填一个完整的 https 网址',
  );
  await user.clear(input);
  await user.type(input, 'https://docs.example.com/guide{Enter}');
  expect(
    within(dialog).getByRole('link', {
      name: 'https://docs.example.com/guide',
    }),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByRole('button', { name: '恢复自动选择' }),
  ).toBeInTheDocument();
  await user.click(
    within(dialog).getByRole('checkbox', { name: 'Customer interview' }),
  );
  await user.click(within(dialog).getByRole('button', { name: '开始生成' }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrMemory',
      'draft',
      expect.objectContaining({
        body: {
          projectId: '1',
          urls: ['https://example.com/', 'https://docs.example.com/guide'],
          itemIds: ['a1'],
        },
      }),
    ),
  );
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
  await mountProjectKnowledge('/project/memory/edit');
  expect(await screen.findByText(/已填 2 \/ 9 项/)).toBeInTheDocument();
  expect(
    await screen.findByRole('dialog', { name: '编辑记忆' }),
  ).toBeInTheDocument();
  act(() => setDictionary(english));
  expect(await screen.findByText(/2 of 9 filled/)).toBeInTheDocument();
  expect(
    screen.getByRole('dialog', { name: 'Edit memory' }),
  ).toBeInTheDocument();
});

test('ticking a material away and back keeps the automatic choice; a refused start keeps the dialog open', async () => {
  withSources(sources);
  const base = action.getMockImplementation()!;
  action.mockImplementation(async (resource: string, command: string, o) => {
    if (resource === 'nrMemory' && command === 'draft')
      throw new Error('正在生成或检查记忆，请等它结束后再试');
    return base(resource, command, o);
  });
  const user = userEvent.setup();
  const router = await mountProjectKnowledge('/project/memory/generate');
  const material = await screen.findByRole('checkbox', {
    name: 'Customer interview',
  });
  await user.click(material);
  expect(screen.getAllByRole('button', { name: '恢复自动选择' })).toHaveLength(
    1,
  );
  await user.click(material);
  expect(
    screen.queryByRole('button', { name: '恢复自动选择' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '开始生成' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '正在生成或检查记忆，请等它结束后再试',
  );
  expect(router.state.location.pathname).toBe('/project/memory/generate');
  expect(action).toHaveBeenCalledWith(
    'nrMemory',
    'draft',
    expect.objectContaining({
      body: { projectId: '1', urls: null, itemIds: null },
    }),
  );
});
