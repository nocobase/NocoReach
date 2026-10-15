import {
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
  await screen.findByText('当前分析规则');
  return ui;
};
const calls = (op: string) => action.mock.calls.filter((c) => c[1] === op);
async function preview() {
  await userEvent.click(screen.getByRole('button', { name: '填入示例' }));
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
  await userEvent.click(screen.getByRole('button', { name: '填入示例' }));
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
  await userEvent.click(screen.getByRole('button', { name: '填入示例' }));
  await userEvent.click(screen.getByRole('button', { name: '预览修改' }));
  await waitFor(() => expect(calls('propose')).toHaveLength(1));
  context.projectId = 2;
  ui.rerender(<AnalysisRules />);
  await screen.findByText('当前分析规则');
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
  await userEvent.click(screen.getByRole('button', { name: '高级设置' }));
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

test('keeps the top focused on AI rule adjustments and hides observation settings by default', async () => {
  const { container } = await start();
  const area = screen.getByRole('region', { name: '用 AI 调整规则' });
  expect(within(area).getByRole('textbox', { name: '调整要求' })).toBeVisible();
  expect(container.querySelector('[data-focus]')).toBeNull();
  expect(container.querySelector('[data-watch-days]')).toBeNull();
  expect(container.querySelector('[data-verdict-rules]')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: '高级设置' }));
  expect(screen.getByText('待观察信号的跟踪期限：14 天')).toBeVisible();
  expect(area.querySelector('[data-watch-days]')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: '高级设置' }));
  expect(container.querySelector('[data-watch-days]')).toBeNull();
  expect(calls('save')).toHaveLength(0);
  expect(data.focus).toBe('团队重点');
});
