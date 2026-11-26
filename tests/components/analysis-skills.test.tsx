import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import SkillsPage from '../../client/pages/skills';
import { AnalysisSkills } from '../../client/pages/analysis-rules/skills';
import type { Skill, SkillAnalysis } from '../../client/pages/skill-model';
import type { View } from '../../client/pages/analysis-rules/types';

// Skills in the daily analysis (2026-11-17): the Skill block of Analysis rules, and Used in daily analysis on Skills.

vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true }),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, name: 'Example' } }),
  useUnsavedWarning: () => {},
}));
const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { wrapRequests: () => {}, action },
  resolvePortalUrl: (p: string) => p,
  getPortalBase: () => '/',
}));
vi.mock('../../client/lib/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const skill = (id: string, extra: Partial<Skill> = {}): Skill => ({
  id,
  name: id,
  description: `Use for ${id}.`,
  files: [],
  chars: 1,
  enabled: true,
  createdAt: '2026-10-01',
  updatedAt: '2026-10-01',
  ...extra,
});
let library: Skill[];
let analysis: Record<string, SkillAnalysis>;
beforeEach(() => {
  setDictionary(null);
  library = [
    skill('content-strategy', { analysis: true }),
    skill('competitors', { analysis: true }),
    skill('seo-audit'),
  ];
  const base = {
    schemeId: 'default',
    schemeName: '默认分析',
    used: 2,
    max: 5,
    monthlyTokens: 486_000,
    found: 0,
    handedOff: 0,
  };
  analysis = {
    'content-strategy': { ...base, on: true, found: 6, handedOff: 2 },
    competitors: { ...base, on: true },
    'seo-audit': { ...base, on: false },
  };
  action.mockReset();
  action.mockImplementation(
    async (
      resource: string,
      op: string,
      { body }: { body: Record<string, unknown> } = { body: {} },
    ) => {
      if (resource === 'nrSkills' && op === 'list')
        return { revision: 1, skills: library };
      if (resource === 'nrSkills' && op === 'get')
        return {
          skill: library.find((s) => s.id === body.skillId),
          body: '# Skill',
          files: [],
          analysis: analysis[String(body.skillId)],
        };
      if (resource === 'nrPlaybooks') return { revision: 1, playbooks: [] };
      if (resource === 'nrAnalysisRules' && op === 'setSkill') return {};
      if (resource === 'nrAnalysisRules' && op === 'skillChoices')
        return {
          schemeId: 'default',
          max: 5,
          used: 3,
          skills: [
            {
              id: 'content-strategy',
              name: 'content-strategy',
              description: 'x',
              monthlyTokens: 480_000,
              selected: true,
            },
            {
              id: 'sk-1a2b3c4d',
              name: 'comparison-pages',
              description: '写对比页时用',
              monthlyTokens: 362_100,
              selected: false,
            },
          ],
        };
      throw new Error(`Unexpected mock ${resource}/${op}`);
    },
  );
});
afterEach(cleanup);

const skillsPage = () =>
  render(
    <MemoryRouter>
      <SkillsPage />
    </MemoryRouter>,
  );
const row = async (name: string) =>
  (await screen.findByRole('button', { name, exact: true })).closest('tr')!;

it('Skills marks the ones in the daily analysis and filters by them', async () => {
  skillsPage();
  expect(
    within(await row('content-strategy')).getByText('✦ 每日分析'),
  ).toBeVisible();
  expect(within(await row('seo-audit')).queryByText('✦ 每日分析')).toBeNull();
  expect(screen.getByRole('columnheader', { name: '用在' })).toBeVisible();
  expect(screen.getByText(/用在每日分析的，每天用来找机会。/)).toBeVisible();
});

it('a Skill in use says what it found, links to those opportunities and can be turned off', async () => {
  skillsPage();
  await userEvent.click(
    await screen.findByRole('button', {
      name: 'content-strategy',
      exact: true,
    }),
  );
  const use = await waitFor(() => {
    const el = document.querySelector('[data-daily-analysis-use]');
    expect(el).not.toBeNull();
    return el as HTMLElement;
  });
  expect(
    within(use).getByText('当前方案：默认分析 · 已用 2 / 5 个'),
  ).toBeVisible();
  expect(use.textContent).toContain('最近 30 天找出 6 个机会，交给 Agent 2 个');
  expect(within(use).getByRole('link', { name: '查看 ›' })).toHaveAttribute(
    'href',
    '/opportunities?skill=content-strategy',
  );
  const toggle = within(use).getByRole('switch', {
    name: '每天用这个 Skill 找机会',
  });
  expect(toggle).toBeChecked();
  await userEvent.click(toggle);
  await waitFor(() =>
    expect(
      action.mock.calls.find((c) => c[1] === 'setSkill')?.[2].body,
    ).toEqual({ projectId: 1, skillId: 'content-strategy', on: false }),
  );
});

it('a Skill not in use shows what it would add, or why it cannot be added while the scheme is full', async () => {
  skillsPage();
  await userEvent.click(
    await screen.findByRole('button', { name: 'seo-audit', exact: true }),
  );
  const use = await waitFor(() => {
    const el = document.querySelector('[data-daily-analysis-use]');
    expect(el).not.toBeNull();
    return el as HTMLElement;
  });
  expect(use.textContent).toMatch(/每月约多.+输入 token/);
  expect(within(use).getByRole('switch')).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
  cleanup();
  analysis['seo-audit'] = { ...analysis['seo-audit'], used: 5 };
  skillsPage();
  await userEvent.click(
    await screen.findByRole('button', { name: 'seo-audit', exact: true }),
  );
  const full = await waitFor(() => {
    const el = document.querySelector('[data-daily-analysis-use]');
    expect(el).not.toBeNull();
    return el as HTMLElement;
  });
  expect(full.textContent).toContain(
    '当前方案已选 5 个，先在分析规则里移除一个',
  );
  expect(within(full).getByRole('switch')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

const view = (selected: string[]): View =>
  ({
    schemeId: 'default',
    revision: 'v1',
    rules: [],
    focus: '',
    watchDays: 14,
    watchLimits: { default: 14, min: 7, max: 28 },
    last: null,
    skills: {
      max: 5,
      selected: selected.map((id, i) => ({
        id,
        name: id,
        description: `Use for ${id}.`,
        run:
          i === 0
            ? { status: 'ok', found: 1 }
            : i === 1
              ? { status: 'error', found: 0, error: 'timeout' }
              : null,
      })),
    },
  }) as View;
const block = (selected: string[], execute = vi.fn(async () => true)) => {
  render(
    <MemoryRouter>
      <AnalysisSkills
        view={view(selected)}
        projectId={1}
        canEdit
        disabled={false}
        execute={execute}
      />
    </MemoryRouter>,
  );
  return execute;
};

it("Analysis rules lists the scheme's Skills with their last run; Remove turns one off", async () => {
  const execute = block(['content-strategy', 'competitors', 'ai-seo']);
  expect(screen.getByText('3 / 5 个')).toBeVisible();
  const rows = document.querySelectorAll('[data-skill]');
  expect([...rows].map((r) => r.getAttribute('data-skill'))).toEqual([
    'content-strategy',
    'competitors',
    'ai-seo',
  ]);
  expect(within(rows[0] as HTMLElement).getByText('这次 1 条')).toBeVisible();
  expect(
    within(rows[1] as HTMLElement).getByText('这次失败：模型超时'),
  ).toBeVisible();
  expect(within(rows[2] as HTMLElement).getByText('还没有算过')).toBeVisible();
  expect(
    within(rows[0] as HTMLElement).getByRole('link', {
      name: 'content-strategy',
    }),
  ).toHaveAttribute('href', '/skills?skill=content-strategy');
  await userEvent.click(
    screen.getByRole('button', { name: '移除 competitors' }),
  );
  expect(execute).toHaveBeenCalledWith({ skillId: 'competitors', on: false });
});

it('Add Skill lists the Skills not picked yet with what each adds a month; a full scheme cannot add', async () => {
  const execute = block(['content-strategy', 'competitors', 'ai-seo']);
  await userEvent.click(screen.getByRole('button', { name: '添加 Skill' }));
  const dialog = await screen.findByRole('dialog');
  const choice = await within(dialog).findByText('comparison-pages');
  expect(within(dialog).queryByText('content-strategy')).toBeNull();
  expect(within(dialog).getByText('还能加 2 个')).toBeVisible();
  expect(dialog.textContent).toMatch(/每月约多.+输入 token/);
  await userEvent.type(within(dialog).getByRole('textbox'), 'nothing-like');
  expect(within(dialog).queryByText('comparison-pages')).toBeNull();
  await userEvent.clear(within(dialog).getByRole('textbox'));
  await userEvent.click(
    (await within(dialog).findByText('comparison-pages')).closest('button')!,
  );
  expect(execute).toHaveBeenCalledWith({ skillId: 'sk-1a2b3c4d', on: true });
  void choice;
  cleanup();
  block(['a', 'b', 'c', 'd', 'e']);
  expect(screen.getByRole('button', { name: '添加 Skill' })).toBeDisabled();
});
