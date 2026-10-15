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
const { action, context, success } = vi.hoisted(() => ({
  action: vi.fn(),
  context: { admin: true, projectId: 1 },
  success: vi.fn(),
}));
vi.mock('#lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
vi.mock('#lib/toast', () => ({ toast: { success, error: vi.fn() } }));
vi.mock('#pages/reach-data', () => ({
  useProject: () => ({ project: { id: context.projectId } }),
}));
vi.mock('#pages/me', () => ({
  useMe: () => ({ isAdmin: context.admin }),
  AdminOnlyNote: () => null,
}));
vi.mock('#pages/strategy/board', () => ({
  getSourceNames: () => ({ gsc: 'Search Console' }),
}));
let data: View;
const proposal = () => ({
  revision: data.revision,
  explanation: '减少较小波动，但可能错过中等降幅。',
  changes: [
    {
      ruleId: 'gsc-click-drop',
      field: 'dropPct',
      before: 30,
      after: 50,
      reason: '提高触发门槛',
    },
  ],
});
beforeEach(() => {
  setDictionary(null);
  context.admin = true;
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
      if (op === 'propose') return proposal();
      if (op === 'apply') {
        data.rules.find((r) => r.id === 'gsc-click-drop')!.params[0].value = 50;
        data.revision = 'v2';
        return structuredClone(data);
      }
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
async function preview() {
  await userEvent.click(
    screen.getByRole('button', { name: '搜索点击下降超过 50% 再提醒我' }),
  );
  await userEvent.click(screen.getByRole('button', { name: '预览修改' }));
  await screen.findByText('待确认的规则修改');
}
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
test('AI preview is read-only; confirmation writes the reviewed changes and updates actual rule', async () => {
  const { container } = await start();
  await preview();
  expect(calls('apply')).toHaveLength(0);
  expect(calls('save')).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: '确认修改' }));
  await waitFor(() => expect(calls('apply')).toHaveLength(1));
  expect(calls('apply')[0][2].body).toMatchObject({
    projectId: 1,
    revision: 'v1',
    changes: [{ after: 50 }],
  });
  await waitFor(() =>
    expect(
      container.querySelector('[data-rule="gsc-click-drop"] [data-numbers]')
        ?.textContent,
    ).toContain('50'),
  );
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: '调整要求' })).toHaveFocus(),
  );
});
test('editing instruction invalidates preview and cancel never writes', async () => {
  await start();
  await preview();
  fireEvent.change(screen.getByRole('textbox', { name: '调整要求' }), {
    target: { value: '换一个要求' },
  });
  expect(screen.queryByRole('button', { name: '确认修改' })).toBeNull();
  await preview();
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(calls('apply')).toHaveLength(0);
  expect(screen.getByRole('textbox', { name: '调整要求' })).toHaveFocus();
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
  context.admin = false;
  await start();
  expect(screen.queryByRole('switch')).toBeNull();
  expect(screen.queryByRole('textbox', { name: '调整要求' })).toBeNull();
  expect(screen.queryByRole('button', { name: '调整参数' })).toBeNull();
});
test('model failure retains request and provides retry without writing', async () => {
  await start();
  action.mockImplementation(async (_r, op) => {
    if (op === 'view') return data;
    if (op === 'propose') throw new Error('模型暂时不可用');
  });
  await userEvent.click(
    screen.getByRole('button', { name: '搜索点击下降超过 50% 再提醒我' }),
  );
  await userEvent.click(screen.getByRole('button', { name: '预览修改' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('模型暂时不可用');
  expect(screen.getByRole('textbox', { name: '调整要求' })).not.toHaveValue('');
  expect(calls('apply')).toHaveLength(0);
});
test('conflict refreshes rules and never reports a save success', async () => {
  await start();
  await preview();
  action.mockImplementation(async (_r, op) => {
    if (op === 'apply')
      throw Object.assign(new Error('规则已发生变化'), { status: 409 });
    if (op === 'view') return { ...data, revision: 'new' };
  });
  await userEvent.click(screen.getByRole('button', { name: '确认修改' }));
  await screen.findByText('规则已发生变化');
  expect(success).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '确认修改' })).toBeNull();
});
test('switching project does not show a late preview from the old project', async () => {
  const ui = await start();
  let resolve: (v: unknown) => void = () => {};
  action.mockImplementation(async (_r, op) =>
    op === 'view'
      ? data
      : new Promise((r) => {
          resolve = r;
        }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: '搜索点击下降超过 50% 再提醒我' }),
  );
  await userEvent.click(screen.getByRole('button', { name: '预览修改' }));
  await waitFor(() => expect(calls('propose')).toHaveLength(1));
  context.projectId = 2;
  ui.rerender(<AnalysisRules />);
  await screen.findByText('规则');
  resolve(proposal());
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: '确认修改' })).toBeNull(),
  );
});

test('manual no-op saves invalidate AI preview even when configuration revision is unchanged', async () => {
  const { container } = await start();
  await preview();
  const previous = action.getMockImplementation()!;
  action.mockImplementation(async (...args) =>
    args[1] === 'save' ? structuredClone(data) : previous(...args),
  );
  const row = within(
    container.querySelector('[data-rule="gsc-click-drop"]') as HTMLElement,
  );
  await userEvent.click(row.getByRole('button', { name: '调整参数' }));
  await row.findByRole('spinbutton', { name: '下降至少 %' });
  await userEvent.click(row.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(row.queryByRole('spinbutton')).toBeNull());
  expect(screen.queryByRole('button', { name: '确认修改' })).toBeNull();
  expect(calls('apply')).toHaveLength(0);
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

test('keeps observation period visible below the grouped rules', async () => {
  const { container } = await start();
  const area = screen.getByRole('region', { name: '用 AI 调整' });
  expect(within(area).getByRole('textbox', { name: '调整要求' })).toBeVisible();
  expect(container.querySelector('[data-focus]')).toBeNull();
  expect(container.querySelector('[data-verdict-rules]')).toBeNull();
  expect(screen.getByText('信号观察期限：14 天')).toBeVisible();
  expect(area.querySelector('[data-watch-days]')).toBeNull();
  expect(screen.queryByRole('button', { name: '高级设置' })).toBeNull();
  expect(calls('save')).toHaveLength(0);
  expect(data.focus).toBe('团队重点');
});

test('groups collapse independently without changing rules or hiding an open editor', async () => {
  const { container } = await start();
  const group = within(
    container.querySelector('[data-source="gsc"]') as HTMLElement,
  );
  const toggle = group.getByRole('button', { name: /Search Console/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(group.queryByRole('switch')).toBeNull();
  await userEvent.click(toggle);
  await userEvent.click(
    within(
      container.querySelector('[data-rule="gsc-click-drop"]') as HTMLElement,
    ).getByRole('button', { name: '调整参数' }),
  );
  await group.findByRole('spinbutton', { name: '下降至少 %' });
  expect(toggle).toBeDisabled();
  expect(container.querySelectorAll('[data-rule]')).toHaveLength(RULES.length);
  expect(calls('save')).toHaveLength(0);
});

test('examples fill the request without submitting and can be changed', async () => {
  await start();
  await userEvent.click(screen.getByRole('button', { name: '换一组' }));
  await userEvent.click(
    screen.getByRole('button', { name: '只关注 GitHub 上明显增长的信号' }),
  );
  expect(screen.getByRole('textbox', { name: '调整要求' })).toHaveValue(
    '只关注 GitHub 上明显增长的信号',
  );
  expect(calls('propose')).toHaveLength(0);
  expect(calls('save')).toHaveLength(0);
});

test('rule summary describes coverage without redundant configuration labels', async () => {
  data.focus = '';
  await start();
  expect(
    within(screen.getByRole('region', { name: '规则' })).getByText(/^关注/, {
      selector: '[data-rules-summary]',
    }),
  ).toBeVisible();
  await preview();
  await userEvent.click(screen.getByRole('button', { name: '确认修改' }));
  await within(screen.getByRole('region', { name: '规则' })).findByText(
    /^关注/,
    { selector: '[data-rules-summary]' },
  );
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
  const button = section.querySelector('h3 button')!;
  expect(button).toHaveAttribute('aria-expanded', 'false');
  await userEvent.click(button);
  expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(within(section).getAllByRole('switch')).toHaveLength(3);
  await userEvent.click(button);
  expect(button).toHaveAttribute('aria-expanded', 'false');
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
  for (const name of ['用 AI 调整', '规则']) {
    const area = screen.getByRole('region', { name });
    expect(await within(area).findByText('第二方案')).toBeVisible();
    expect(within(area).queryByText('默认分析')).not.toBeInTheDocument();
  }
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

test('AI organize requires review, preserves manual values, and persists only after final confirmation', async () => {
  Object.assign(data, {
    schemeId: 'default',
    schemeName: '默认分析',
    activeSchemeId: 'default',
    storeRevision: 0,
    schemes: [{ id: 'default', name: '默认分析', version: 1 }],
  });
  const previous = action.getMockImplementation()!;
  action.mockImplementation(async (resource, op, options) => {
    if (op === 'draft')
      return {
        revision: 'v1',
        draft: {
          name: 'AI 整理的规则',
          source: 'gsc',
          condition: '条件',
          evidence: '证据',
        },
      };
    if (op === 'addRule') return structuredClone(data);
    return previous(resource, op, options);
  });
  render(<AnalysisRules />);
  await userEvent.click(
    await screen.findByRole('button', { name: '添加规则', exact: true }),
  );
  const dialog = screen.getByRole('dialog');
  await userEvent.type(
    within(dialog).getByRole('textbox', { name: /名称/ }),
    '手动输入',
  );
  await userEvent.type(
    within(dialog).getByRole('textbox', { name: '你想关注什么？' }),
    '请整理搜索变化',
  );
  await userEvent.click(
    within(dialog).getByRole('button', { name: '让 AI 帮忙整理' }),
  );
  await within(dialog).findByText('AI 整理的规则');
  expect(within(dialog).getByRole('textbox', { name: /名称/ })).toHaveValue(
    '手动输入',
  );
  expect(action.mock.calls.some(([, op]) => op === 'addRule')).toBe(false);
  await userEvent.click(
    within(dialog).getByRole('button', { name: '填入规则' }),
  );
  expect(within(dialog).getByRole('textbox', { name: /名称/ })).toHaveValue(
    'AI 整理的规则',
  );
  await userEvent.click(
    within(dialog).getByRole('button', { name: '添加到方案' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(action).toHaveBeenCalledWith(
    'nrAnalysisRules',
    'addRule',
    expect.objectContaining({
      body: expect.objectContaining({
        schemeId: 'default',
        expectedRevision: 'v1',
        rule: {
          name: 'AI 整理的规则',
          source: 'gsc',
          condition: '条件',
          evidence: '证据',
        },
      }),
    }),
  );
});

test('closing the add modal discards a late model response', async () => {
  Object.assign(data, {
    schemeId: 'default',
    schemeName: '默认分析',
    activeSchemeId: 'default',
    storeRevision: 0,
    schemes: [{ id: 'default', name: '默认分析', version: 1 }],
  });
  let resolve!: (value: unknown) => void;
  const previous = action.getMockImplementation()!;
  action.mockImplementation((resource, op, options) =>
    op === 'draft'
      ? new Promise((r) => {
          resolve = r;
        })
      : previous(resource, op, options),
  );
  render(<AnalysisRules />);
  await userEvent.click(
    await screen.findByRole('button', { name: '添加规则', exact: true }),
  );
  let dialog = screen.getByRole('dialog');
  await userEvent.type(
    within(dialog).getByRole('textbox', { name: '你想关注什么？' }),
    '规则',
  );
  await userEvent.click(
    within(dialog).getByRole('button', { name: '让 AI 帮忙整理' }),
  );
  await userEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  resolve({
    revision: 'v1',
    draft: {
      name: '迟到结果',
      source: 'gsc',
      condition: '条件',
      evidence: '证据',
    },
  });
  await userEvent.click(
    screen.getByRole('button', { name: '添加规则', exact: true }),
  );
  dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('textbox', { name: /名称/ })).toHaveValue('');
  expect(within(dialog).queryByText('迟到结果')).not.toBeInTheDocument();
});

test('AI draft cannot advance a stale form revision after another editor changes rules', async () => {
  Object.assign(data, {
    schemeId: 'default',
    schemeName: '默认分析',
    activeSchemeId: 'default',
    storeRevision: 0,
    schemes: [{ id: 'default', name: '默认分析', version: 1 }],
  });
  const previous = action.getMockImplementation()!;
  action.mockImplementation((resource, op, options) =>
    op === 'draft'
      ? Promise.resolve({
          revision: 'newer-version',
          draft: {
            name: 'New',
            source: 'gsc',
            condition: 'Condition',
            evidence: 'Evidence',
          },
        })
      : previous(resource, op, options),
  );
  render(<AnalysisRules />);
  await userEvent.click(
    await screen.findByRole('button', { name: '添加规则', exact: true }),
  );
  const dialog = screen.getByRole('dialog');
  await userEvent.type(
    within(dialog).getByRole('textbox', { name: '你想关注什么？' }),
    '规则',
  );
  await userEvent.click(
    within(dialog).getByRole('button', { name: '让 AI 帮忙整理' }),
  );
  await within(dialog).findByRole('alert');
  expect(
    within(dialog).queryByRole('button', { name: '填入规则' }),
  ).not.toBeInTheDocument();
  expect(action.mock.calls.some(([, op]) => op === 'addRule')).toBe(false);
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
  await userEvent.type(
    within(dialog).getByRole('textbox', { name: /名称/ }),
    '保留名称',
  );
  await userEvent.click(
    within(dialog).getByRole('button', { name: '让 AI 帮忙整理' }),
  );
  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    '请填写 1–2000 字的调整要求。',
  );
  act(() => setDictionary(english));
  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    english['analysisRules.instructionRequired'],
  );
  expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveValue(
    '保留名称',
  );
  act(() => setDictionary(null));
});
