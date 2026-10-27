import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import AnalysisRules from '#pages/analysis-rules';
import { setDictionary } from '#i18n';
import english from '../../shared/i18n/en.json';
import { RULES } from '../../server/nocoreach/analysis-rules';
import type { View } from '#pages/analysis-rules/types';
import { notifyPageChange } from '../../client/online-agent/page-changes';
const { action, context, success } = vi.hoisted(() => ({
  action: vi.fn(),
  context: { allowed: true, actions: null as string[] | null, projectId: 1 },
  success: vi.fn(),
}));
vi.mock('#lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
vi.mock('#lib/toast', () => ({ toast: { success, error: vi.fn() } }));
vi.mock('#pages/reach-data', () => ({
  useProject: () => ({ project: { id: context.projectId } }),
}));
vi.mock('#hooks/use-business-access', () => ({
  useBusinessAccess: (action: string, projectId: number) => ({
    can:
      projectId === context.projectId &&
      context.allowed &&
      (!context.actions || context.actions.includes(action)),
  }),
}));
vi.mock('#pages/strategy/board', () => ({
  getSourceNames: () => ({ gsc: 'Search Console' }),
}));
// The entry itself is tested with the chat (tests/nocoreach/page-ai-entry.test.tsx); here, what the page gives it.
vi.mock('../../client/online-agent/page-entry', () => ({
  PageAiEntry: (props: {
    label: string;
    description?: string;
    presets: string[];
    subject: { page: string; item?: string };
  }) => (
    <button
      type='button'
      data-page={props.subject.page}
      data-item={props.subject.item}
      data-presets={props.presets.join('|')}
      title={props.description}
    >
      {props.label}
    </button>
  ),
}));
let data: View;
beforeEach(() => {
  setDictionary(null);
  context.allowed = true;
  context.actions = null;
  context.projectId = 1;
  success.mockReset();
  data = {
    revision: 'v1',
    rules: RULES.map((r: { params: { default: number }[] }) => ({
      ...r,
      enabled: true,
      params: r.params.map((p) => ({ ...p, value: p.default })),
      found: 0,
    })),
    focus: '团队重点',
    watchDays: 14,
    watchLimits: { default: 14, min: 7, max: 28 },
    last: null,
  } as View;
  action.mockReset();
  action.mockImplementation(
    async (
      _resource: string,
      op: string,
      { body }: { body: Record<string, any> },
    ) => {
      if (op === 'view') return structuredClone(data);
      if (op === 'save') {
        if (body.rules)
          data.rules = data.rules.map((r) => ({
            ...r,
            enabled: body.rules[r.id]?.enabled !== false,
            params: r.params.map((p) => ({
              ...p,
              value: body.rules[r.id]?.values?.[p.key] ?? p.default,
            })),
          }));
        data.revision = 'v2';
        return structuredClone(data);
      }
      throw new Error(op);
    },
  );
});
afterEach(cleanup);
const start = async () => {
  const ui = render(<AnalysisRules />);
  await screen.findByText('规则');
  return ui;
};
const calls = (op: string) => action.mock.calls.filter((c) => c[1] === op);
test('renders full catalog without native disclosures or truncated rule titles', async () => {
  const { container } = await start();
  expect(container.querySelectorAll('[data-rule]')).toHaveLength(RULES.length);
  expect(container.querySelectorAll('[data-numbers]')).toHaveLength(
    RULES.length,
  );
  expect(container.querySelector('details,summary')).toBeNull();
  expect(container.querySelector('[data-rule] h4')?.className).not.toContain(
    'truncate',
  );
});
test('manual editing validates parameters, retains all rules, and a switch does not erase custom values', async () => {
  const { container } = await start();
  const rule = within(
    container.querySelector('[data-rule="gsc-click-drop"]') as HTMLElement,
  );
  await userEvent.click(rule.getByRole('button', { name: '调整参数' }));
  const number = await rule.findByRole('spinbutton', { name: '下降至少 %' });
  fireEvent.change(number, { target: { value: '999' } });
  await userEvent.click(rule.getByRole('button', { name: '保存' }));
  expect(calls('save')).toHaveLength(0);
  expect(rule.getByRole('alert')).toBeVisible();
  fireEvent.change(number, { target: { value: '45' } });
  await userEvent.click(rule.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(calls('save')).toHaveLength(1));
  expect(Object.keys(calls('save')[0][2].body.rules)).toHaveLength(
    RULES.length,
  );
  await waitFor(() => expect(rule.queryByRole('spinbutton')).toBeNull());
  await userEvent.click(rule.getByRole('switch'));
  await waitFor(() => expect(calls('save')).toHaveLength(2));
  expect(calls('save')[1][2].body.rules['gsc-click-drop']).toEqual({
    enabled: false,
    values: { dropPct: 45 },
  });
});
test('read-only members see rules but no mutations', async () => {
  context.allowed = false;
  await start();
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByRole('button', { name: '调整参数' })).toBeNull();
});
test('a custom role can save rule settings without gaining AI or scheme actions', async () => {
  context.actions = ['nrAnalysisRules.save'];
  const { container } = await start();
  const rule = within(
    container.querySelector('[data-rule="gsc-click-drop"]')! as HTMLElement,
  );
  await userEvent.click(rule.getByRole('switch'));
  await waitFor(() => expect(calls('save')).toHaveLength(1));
  expect(calls('save')[0][2].body.projectId).toBe(1);
});
test('invalid watch days show validation and focus the field without saving', async () => {
  const { container } = await start();
  const section = within(
    container.querySelector('[data-watch-days]') as HTMLElement,
  );
  await userEvent.click(section.getByRole('button', { name: '修改' }));
  const field = await section.findByRole('spinbutton');
  fireEvent.change(field, { target: { value: '0' } });
  await userEvent.click(section.getByRole('button', { name: '保存' }));
  expect(field).toHaveFocus();
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(section.getByRole('alert')).toBeVisible();
  expect(calls('save')).toHaveLength(0);
});

test('keeps observation period visible below the grouped rules, with no AI input on the page', async () => {
  const { container } = await start();
  // The AI is in the chat panel (2026-10-27 user decision): the page keeps no request box or AI section.
  expect(screen.queryByRole('region', { name: '用 AI 调整' })).toBeNull();
  expect(container.querySelector('textarea')).toBeNull();
  expect(container.querySelector('[data-focus]')).toBeNull();
  expect(container.querySelector('[data-verdict-rules]')).toBeNull();
  expect(screen.getByText('信号观察期限：14 天')).toBeVisible();
  expect(screen.queryByRole('button', { name: '高级设置' })).toBeNull();
  expect(calls('save')).toHaveLength(0);
  expect(data.focus).toBe('团队重点');
});

test('the AI entry opens the chat about the scheme in view, with the page prompts', async () => {
  data.schemeId = 'second';
  await start();
  const entry = screen.getByRole('button', { name: '让 AI 帮你调规则' });
  expect(entry).toHaveAttribute('data-page', 'analysisRules');
  expect(entry).toHaveAttribute('data-item', 'second');
  expect(entry.getAttribute('data-presets')?.split('|')).toEqual([
    '少报一些小波动',
    '加一条竞品发布新版本的规则',
    '解释最近一次分析中规则为什么触发',
    '哪些规则最近没有触发',
  ]);
});

test('rules are tabbed by area; the area with an open editor cannot be left', async () => {
  const { container } = await start();
  const tab = screen.getByRole('tab', { name: '搜索表现' });
  expect(tab).toHaveAttribute('aria-selected', 'true');
  const group = within(
    container.querySelector('[data-source="gsc"]') as HTMLElement,
  );
  expect(group.getAllByRole('switch').length).toBeGreaterThan(0);
  await userEvent.click(
    within(
      container.querySelector('[data-rule="gsc-click-drop"]') as HTMLElement,
    ).getByRole('button', { name: '调整参数' }),
  );
  await group.findByRole('spinbutton', { name: '下降至少 %' });
  const others = screen.getAllByRole('tab').filter((other) => other !== tab);
  expect(others.length).toBeGreaterThan(0);
  for (const other of others) expect(other).toBeDisabled();
  expect(container.querySelectorAll('[data-rule]')).toHaveLength(RULES.length);
  expect(calls('save')).toHaveLength(0);
});

test('a change confirmed in the chat shows on the page without a reload', async () => {
  data.focus = '';
  const { container } = await start();
  const numbers = () =>
    container.querySelector('[data-rule="gsc-click-drop"] [data-numbers]')
      ?.textContent;
  expect(numbers()).toContain('30');
  data.rules.find((r) => r.id === 'gsc-click-drop')!.params[0].value = 50;
  data.revision = 'v2';
  // Another project's change is not this page's.
  act(() => notifyPageChange('analysisRules', 2));
  act(() => notifyPageChange('analysisRules', 1));
  await waitFor(() => expect(numbers()).toContain('50'));
  expect(calls('view')).toHaveLength(2);
  expect(
    within(screen.getByRole('region', { name: '规则' })).getByText(/^关注/, {
      selector: '[data-rules-summary]',
    }),
  ).toBeVisible();
  expect(screen.queryByText(/默认配置|已调整/)).not.toBeInTheDocument();
  expect(screen.queryByText(/当前关注 Search Console/)).not.toBeInTheDocument();
  expect(
    screen.queryByText(/内容渠道按可采集的数据自动匹配通用规则/),
  ).not.toBeInTheDocument();
});

test('rule groups omit connection health and collection times while retaining collapse and switches', async () => {
  data.sourceStatusesDemo = true;
  data.sourceStatuses = {
    youtube: {
      state: 'ready',
      sampleCount: 15,
      collectedAt: '2026-10-15T01:00:00Z',
    },
    bilibili: { state: 'stale' },
    xiaohongshu: { state: 'waiting' },
    gsc: { state: 'unknown', collectedAt: '2026-10-15T01:00:00Z' },
  };
  const { container } = await start();
  expect(container.querySelector('[data-source-status]')).toBeNull();
  expect(
    screen.queryByText(
      /最近采集|数据状态尚未检查|条内容可分析|以下渠道数据状态为演示/,
    ),
  ).not.toBeInTheDocument();
  const section = container.querySelector<HTMLElement>(
    '[data-source="youtube"]',
  )!;
  expect(section).not.toBeVisible();
  const tab = screen.getByRole('tab', { name: '内容表现' });
  expect(tab).toHaveAttribute('aria-selected', 'false');
  await userEvent.click(tab);
  expect(tab).toHaveAttribute('aria-selected', 'true');
  expect(section).toBeVisible();
  expect(within(section).getAllByRole('switch')).toHaveLength(3);
  expect(calls('save')).toHaveLength(0);
});

test('scheme selection reloads its own rules and copy opens a modal with source identity', async () => {
  Object.assign(data, {
    schemeId: 'default',
    schemeName: '默认分析',
    activeSchemeId: 'default',
    storeRevision: 0,
    schemes: [
      { id: 'default', name: '默认分析', version: 1 },
      { id: 'second', name: '第二方案', version: 1 },
    ],
  });
  const previous = action.getMockImplementation()!;
  action.mockImplementation(async (resource, op, options) => {
    if (op === 'view')
      return {
        ...structuredClone(data),
        schemeId: options.body.schemeId || 'default',
        schemeName:
          options.body.schemeId === 'second' ? '第二方案' : '默认分析',
        focus:
          options.body.schemeId === 'second' ? '第二方案的重点' : '默认重点',
      };
    return previous(resource, op, options);
  });
  render(<AnalysisRules />);
  await screen.findByText('我的方案');
  await userEvent.click(
    screen.getByRole('button', { name: /第二方案\s*未启用/ }),
  );
  // My schemes marks the scheme shown; the sections below no longer repeat its name.
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /第二方案\s*未启用/ }),
    ).toHaveAttribute('aria-pressed', 'true'),
  );
  expect(action).toHaveBeenCalledWith(
    'nrAnalysisRules',
    'view',
    expect.objectContaining({
      body: expect.objectContaining({ schemeId: 'second' }),
    }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: '复制「默认分析」' }),
  );
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('textbox')).toHaveValue('默认分析 · 副本');
  await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(action.mock.calls.some(([, op]) => op === 'create')).toBe(false);
});

test('add-rule validation messages update when switching language without clearing the form', async () => {
  Object.assign(data, {
    schemeId: 'default',
    schemeName: '默认分析',
    activeSchemeId: 'default',
    storeRevision: 0,
    schemes: [{ id: 'default', name: '默认分析', version: 1 }],
  });
  render(<AnalysisRules />);
  await userEvent.click(
    await screen.findByRole('button', { name: '添加规则', exact: true }),
  );
  const dialog = screen.getByRole('dialog');
  // The dialog is the rule's form alone; describing a rule to the AI happens in the chat.
  expect(within(dialog).queryByRole('button', { name: /AI/ })).toBeNull();
  await userEvent.type(
    within(dialog).getByRole('textbox', { name: /名称/ }),
    '保留名称',
  );
  await userEvent.click(
    within(dialog).getByRole('button', { name: '添加到方案' }),
  );
  expect(within(dialog).getAllByRole('alert')[0]).toHaveTextContent(
    '请填写此项',
  );
  act(() => setDictionary(english));
  expect(within(dialog).getAllByRole('alert')[0]).toHaveTextContent(
    english['analysisSchemes.required'],
  );
  expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveValue(
    '保留名称',
  );
  expect(calls('addRule')).toHaveLength(0);
  act(() => setDictionary(null));
});

test('rename opens a prefilled modal, keeps failures editable, and renames the scheme', async () => {
  Object.assign(data, {
    schemeId: 'copy',
    schemeName: '默认分析 · 副本',
    activeSchemeId: 'copy',
    storeRevision: 1,
    schemes: [{ id: 'copy', name: '默认分析 · 副本', version: 1 }],
  });
  const previous = action.getMockImplementation()!;
  let fail = true;
  action.mockImplementation(async (resource, op, options) => {
    if (op === 'rename') {
      if (fail) throw new Error('名称已存在');
      data.schemeName = options.body.name;
      data.schemes![0].name = options.body.name;
      return structuredClone(data);
    }
    return previous(resource, op, options);
  });
  await start();
  const open = () =>
    userEvent.click(
      screen.getByRole('button', { name: '重命名「默认分析 · 副本」' }),
    );
  await open();
  let dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('textbox')).toHaveValue('默认分析 · 副本');
  await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(calls('rename')).toHaveLength(0);
  await open();
  dialog = screen.getByRole('dialog');
  await userEvent.clear(within(dialog).getByRole('textbox'));
  await userEvent.type(within(dialog).getByRole('textbox'), '内容增长');
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    '名称已存在',
  );
  fail = false;
  await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole('button', { name: '重命名「内容增长」' }),
  ).toBeVisible();
  expect(calls('rename')[1][2].body).toMatchObject({
    schemeId: 'copy',
    name: '内容增长',
    storeRevision: 1,
  });
});
