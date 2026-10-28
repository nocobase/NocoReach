import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { $t, getCurrentLocale, setDictionary } from '../../client/i18n';
import { OnlineChatProvider } from '../../client/online-agent/context.js';
import { OnlineChatView } from '../../client/online-agent/chat.js';
import { notifyPageChange } from '../../client/online-agent/page-changes.js';
import { KeywordSuggestions } from '../../client/pages/keyword-suggestions';

const { api, action, panel } = vi.hoisted(() => ({
  api: vi.fn(),
  action: vi.fn(),
  panel: {
    available: true,
    open: true,
    mode: 'docked',
    view: 'chat',
    conversationId: null,
    openChat: vi.fn(),
    closeChat: vi.fn(),
    toggleChat: vi.fn(),
    setMode: vi.fn(),
    setView: vi.fn(),
    selectConversation: vi.fn(),
    newAgentId: null,
  },
}));
vi.mock('@nocobase/app-plugin-agents/client/chat', async (original) => ({
  ...(await original<
    typeof import('@nocobase/app-plugin-agents/client/chat')
  >()),
  useChatAgents: () => ({ data: [], isSuccess: true }),
  useConversation: () => ({ data: undefined }),
  useAgentText: () => ({ name: (agent: { name: string }) => agent.name }),
  useChatPanel: () => panel,
}));
vi.mock('../../client/hooks/use-business-access', () => ({
  useBusinessAccess: () => ({ can: true }),
}));
vi.mock('../../client/pages/reach-data.js', () => ({
  useProject: () => ({ project: { id: 2, name: 'Project B' } }),
  useProjects: () => ({ projects: [{ id: 2, name: 'Project B' }] }),
}));
vi.mock('../../client/pages/keyword-hand-off', () => ({
  KeywordHandOffDialog: () => null,
}));
vi.mock('../../client/pages/strategy/hand-off', () => ({
  HandOffNotice: () => null,
}));
vi.mock('#lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
  resolvePortalUrl: (path: string) => path,
}));
vi.mock('../../client/online-agent/api.js', async (original) => ({
  ...(await original<typeof import('../../client/online-agent/api.js')>()),
  useOnlineApi: () => api,
  useOnlineResource: (path: string) => ({
    data:
      path === 'definitions'
        ? [
            {
              id: 'online-default',
              name: 'Default',
              enabled: true,
              ready: true,
            },
          ]
        : [],
    loading: false,
  }),
}));

const metrics = (volume: number, difficulty: number) => ({
  volume,
  difficulty,
  cpc: 1.2,
  intent: 'commercial',
});
const item = (
  keyword: string,
  group: string,
  volume: number,
  dig?: string,
) => ({
  id: keyword,
  keyword,
  group,
  intent: 'commercial',
  reason: `Why ${keyword}`,
  page: null,
  site: null,
  metrics: metrics(volume, 30),
  seeds: keyword === 'retool alternative' ? ['retool alternative'] : [],
  ...(dig ? { dig } : {}),
});
const LIST = {
  version: 2,
  at: '2026-10-27T08:00:00Z',
  market: { locationCode: 2840, language: 'en' },
  seeds: ['internal tool builder', 'approval workflow', 'retool alternative'],
  seedsBy: 'ai',
  stats: { found: 386, picked: 2, minVolume: 50 },
  costUsd: 0.18,
  seedStats: [
    { seed: 'internal tool builder', found: 12, picked: 0 },
    { seed: 'approval workflow', found: 20, picked: 0 },
    { seed: 'retool alternative', found: 15, picked: 1 },
  ],
  seedNotes: [
    {
      seed: 'retool alternative',
      from: ['competitors'],
      why: 'Retool users looking to switch',
    },
  ],
  selection: {
    seeds: 3,
    directions: 1,
    found: 386,
    picked: 3,
    notPicked: 383,
    recorded: true,
    reasons: [
      {
        reason: 'unrelated',
        count: 300,
        examples: ['ai business ideas', 'vibe coding jobs'],
      },
      { reason: 'duplicate', count: 83, examples: ['internal tools builder'] },
    ],
    pick: 40,
    digPick: 20,
  },
  items: [
    item('open source low code platform', '品类与行业词', 3600),
    item('retool alternative', '对比与替代词', 1600),
  ],
  digs: [
    {
      id: 'dig1',
      direction: 'approval workflow',
      seeds: ['approval workflow'],
      at: '2026-10-27T09:00:00Z',
      found: 40,
      items: [
        item('approval workflow software', '使用场景与问题词', 1300, 'dig1'),
      ],
    },
  ],
  running: null,
  dataforseo: true,
  maxUsd: 0.291,
  minVolume: 50,
};
let view: Record<string, unknown>;
beforeEach(() => {
  setDictionary(null);
  vi.clearAllMocks();
  view = LIST;
  action.mockImplementation(async (_resource: string, name: string) =>
    name === 'suggest'
      ? {
          ...view,
          running: { stage: 'seeds', mode: 'list', direction: null },
        }
      : view,
  );
  api.mockImplementation(async (path: string) =>
    path === 'conversations'
      ? { id: 'from-keywords', revision: 0 }
      : {
          conversation: {
            id: 'from-keywords',
            title: 'Dig',
            agentId: 'online-default',
            projectId: '2',
            revision: 0,
          },
          runs: [],
        },
  );
});
afterEach(cleanup);
const mount = (url = '/keywords?tab=suggest') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <OnlineChatProvider>
        <KeywordSuggestions onSaved={() => {}} />
        <OnlineChatView />
      </OnlineChatProvider>
    </MemoryRouter>,
  );

test('the query bar: seeds sorted by how many were picked, each with its count; a seed says where it came from and what it found, and Show only these narrows the list', async () => {
  mount();
  await screen.findByText('open source low code platform');
  const bar = document.querySelector('[data-query-bar]') as HTMLElement;
  expect(bar.textContent).toContain(
    $t('keywordSuggestions.seedsLabel', { 0: 3 }),
  );
  expect(
    [...bar.querySelectorAll('[data-seed]')].map((c) => c.textContent),
  ).toEqual([
    'retool alternative1',
    'internal tool builder0',
    'approval workflow0',
  ]);
  // No sentence of AI output above the list any more.
  expect(document.body.textContent).not.toContain(
    $t('keywordSuggestions.seedsTitle') + ' (',
  );
  fireEvent.click(
    within(bar).getByRole('button', { name: /^retool alternative/ }),
  );
  const pop = await screen.findByText('Retool users looking to switch');
  const card = pop.closest('[data-slot=popover-content]') as HTMLElement;
  expect(card.textContent).toContain(
    $t('keywordSuggestions.seedFrom', {
      0: $t('keywordSuggestions.seedSource.competitors'),
    }),
  );
  expect(card.textContent).toContain(
    $t('keywordSuggestions.seedFound', { 0: 15, 1: 1 }),
  );
  fireEvent.click(
    within(card).getByRole('button', {
      name: $t('keywordSuggestions.seedOnly', { 0: 1 }),
    }),
  );
  const table = screen.getByRole('table');
  await waitFor(() =>
    expect(
      within(table).queryByText('open source low code platform'),
    ).toBeNull(),
  );
  expect(within(table).getByText('retool alternative')).toBeVisible();
  const summary = document.querySelector(
    '[data-selection-summary]',
  ) as HTMLElement;
  expect(summary.textContent).toContain(
    $t('keywordSuggestions.seedFilter', { 0: 'retool alternative' }),
  );
  fireEvent.click(
    within(summary).getByRole('button', {
      name: $t('keywordSuggestions.clearSeedFilter', {
        0: 'retool alternative',
      }),
    }),
  );
  expect(
    await within(table).findByText('open source low code platform'),
  ).toBeVisible();
});

test('the results summary follows the tab: count, monthly searches added up, average difficulty; an expanded group says its direction', async () => {
  view = { ...LIST, digs: [{ ...LIST.digs[0], name: 'Approvals' }] };
  mount();
  await screen.findByText('open source low code platform');
  const summary = document.querySelector(
    '[data-selection-summary]',
  ) as HTMLElement;
  const volume = new Intl.NumberFormat(getCurrentLocale(), {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(6500);
  expect(summary.textContent).toContain(
    $t('keywordSuggestions.summaryKeywords', { 0: 3 }),
  );
  expect(summary.textContent).toContain(
    $t('keywordSuggestions.summaryVolume', { 0: volume }),
  );
  expect(summary.textContent).toContain(
    $t('keywordSuggestions.summaryDifficulty', { 0: 30 }),
  );
  expect(summary.textContent).toContain(
    $t('keywordSuggestions.updatedAt', { 0: '10-27' }),
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Approvals 1' }));
  await waitFor(() =>
    expect(summary.textContent).toContain(
      $t('keywordSuggestions.expandedIn', { 0: 'Approvals', 1: '10-27' }),
    ),
  );
  expect(summary.textContent).toContain(
    $t('keywordSuggestions.summaryKeywords', { 0: 1 }),
  );
});

test('Selection rules: the rules, the numbers and why the others were not picked; View those not picked lists them, and Add to suggestions puts one in the group picked', async () => {
  const left = [
    {
      keyword: 'ai business ideas',
      volume: 8100,
      difficulty: 41,
      intent: 'informational',
      reason: 'unrelated',
      run: 'list',
    },
    {
      keyword: 'internal tools builder',
      volume: 390,
      difficulty: 38,
      intent: 'commercial',
      reason: 'duplicate',
      duplicateOf: 'internal tool builder',
      run: 'list',
    },
  ];
  action.mockImplementation(async (_resource: string, name: string) =>
    name === 'notPicked' ? { recorded: true, items: left } : view,
  );
  mount();
  await screen.findByText('open source low code platform');
  fireEvent.click(
    screen.getByRole('button', {
      name: $t('keywordSuggestions.selectionRules'),
    }),
  );
  const rules = (
    await screen.findByText($t('keywordSuggestions.ruleDemandTitle'))
  ).closest('[data-slot=popover-content]') as HTMLElement;
  expect(rules.textContent).toContain('Project B');
  expect(rules.textContent).toContain(
    $t('keywordSuggestions.selectionCounts', { 0: 3, 1: 1, 2: 386, 3: 3 }),
  );
  expect(rules.textContent).toContain(
    $t('keywordSuggestions.notPickedHead', { 0: 383 }),
  );
  expect(rules.textContent).toContain(
    $t('keywordSuggestions.notPickedReason.unrelated'),
  );
  expect(rules.textContent).toContain(
    $t('keywordSuggestions.examples', {
      0: ['ai business ideas', 'vibe coding jobs'].join(
        getCurrentLocale().startsWith('zh') ? '、' : ', ',
      ),
    }),
  );
  fireEvent.click(
    within(rules).getByRole('button', {
      name: $t('keywordSuggestions.viewNotPicked', { 0: 383 }),
    }),
  );
  const dialog = await screen.findByRole('dialog');
  expect(
    await within(dialog).findByText(
      $t('keywordSuggestions.duplicateOf', { 0: 'internal tool builder' }),
    ),
  ).toBeVisible();
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: `${$t('keywordSuggestions.notPickedShort.unrelated')} 1`,
    }),
  );
  expect(within(dialog).queryByText('internal tools builder')).toBeNull();
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: $t('keywordSuggestions.addToSuggestions'),
    }),
  );
  fireEvent.click(
    await screen.findByRole('menuitem', {
      name: $t('keywordSuggestions.groups.product'),
    }),
  );
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrKeywordSuggest',
      'addItems',
      expect.objectContaining({
        body: {
          projectId: 2,
          keyword: 'ai business ideas',
          group: '产品与功能词',
        },
      }),
    ),
  );
  await waitFor(() =>
    expect(within(dialog).queryByText('ai business ideas')).toBeNull(),
  );
});

test('Selection rules for a list found before reasons were kept: the totals only, no reasons and no list', async () => {
  view = {
    ...LIST,
    selection: { ...LIST.selection, recorded: false, reasons: [] },
  };
  mount();
  await screen.findByText('open source low code platform');
  fireEvent.click(
    screen.getByRole('button', {
      name: $t('keywordSuggestions.selectionRules'),
    }),
  );
  const rules = (
    await screen.findByText($t('keywordSuggestions.ruleDemandTitle'))
  ).closest('[data-slot=popover-content]') as HTMLElement;
  expect(rules.textContent).toContain(
    $t('keywordSuggestions.selectionCounts', { 0: 3, 1: 1, 2: 386, 3: 3 }),
  );
  expect(rules.textContent).not.toContain(
    $t('keywordSuggestions.notPickedHead', { 0: 383 }),
  );
  expect(
    within(rules).queryByRole('button', {
      name: $t('keywordSuggestions.viewNotPicked', { 0: 383 }),
    }),
  ).toBeNull();
});

test('the chat link to a new group opens on its tab', async () => {
  mount('/keywords?tab=suggest&group=dig1');
  await screen.findByText('approval workflow software');
  expect(screen.queryByText('open source low code platform')).toBeNull();
});

test('each row has Dig from this keyword, shown on hover, which opens the chat about that keyword', async () => {
  mount();
  const table = await screen.findByRole('table');
  const row = (await within(table).findByText('retool alternative')).closest(
    'tr',
  )!;
  expect(row).toHaveClass('group');
  const dig = within(row).getByRole('button', {
    name: $t('keywordSuggestions.digFromKeyword'),
  });
  expect(dig).toHaveClass('opacity-0', 'group-hover:opacity-100');
  fireEvent.click(dig);
  expect(panel.openChat).toHaveBeenCalled();
  const log = screen.getByRole('log');
  const prompts = within(log).getByRole('list', {
    name: $t('onlineAgent.suggestions'),
  });
  fireEvent.click(
    within(prompts).getByRole('button', {
      name: $t('keywordSuggestions.presetFromKeyword'),
    }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'conversations',
      expect.objectContaining({
        projectId: '2',
        subject: { kind: 'page', page: 'keywords', item: 'retool alternative' },
        text: $t('keywordSuggestions.presetFromKeyword'),
      }),
    ),
  );
  // Opening the row did not open the keyword's detail page.
  expect(screen.getByText('open source low code platform')).toBeVisible();
});

test('Ask AI to find keywords opens the chat with its four prompts, and a group expanded in the chat appears without a reload', async () => {
  mount();
  await screen.findByText('open source low code platform');
  expect(
    screen.getAllByRole('button', {
      name: $t('keywordSuggestions.findWithAi'),
    }),
  ).toHaveLength(1);
  fireEvent.click(
    screen.getByRole('button', { name: $t('keywordSuggestions.findWithAi') }),
  );
  const prompts = within(screen.getByRole('log')).getByRole('list', {
    name: $t('onlineAgent.suggestions'),
  });
  expect(
    within(prompts)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual([
    $t('keywordSuggestions.presetHowSeeds'),
    $t('keywordSuggestions.presetAddRemoveSeeds'),
    $t('keywordSuggestions.presetExpand'),
    $t('keywordSuggestions.presetWhyNotPicked'),
  ]);
  view = {
    ...LIST,
    digs: [
      ...LIST.digs,
      {
        id: 'dig2',
        direction: 'crm',
        seeds: ['crm'],
        at: '2026-10-27T10:00:00Z',
        found: 20,
        items: [item('self hosted crm', '品类与行业词', 720, 'dig2')],
      },
    ],
  };
  notifyPageChange('keywords', 2);
  expect(
    await screen.findByRole('tab', {
      name: 'crm 1',
    }),
  ).toBeVisible();
});

test('nothing yet: the first run shows its most possible cost and starts only on a click', async () => {
  view = { ...LIST, at: undefined, items: [], digs: [], seeds: [] };
  mount();
  await screen.findByText($t('keywordSuggestions.startTitle'));
  expect(
    screen.getByText($t('keywordSuggestions.costNote', { 0: '0.30' })),
  ).toBeVisible();
  expect(action.mock.calls.map((c) => c[1])).toEqual(['view']);
  fireEvent.click(
    screen.getByRole('button', { name: $t('keywordSuggestions.startButton') }),
  );
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrKeywordSuggest',
      'suggest',
      expect.objectContaining({ body: { projectId: 2 } }),
    ),
  );
  expect(
    await screen.findByText($t('keywordSuggestions.stage.seeds')),
  ).toBeVisible();
});

test('Remove this seed word keeps the seeds without it for the next re-find and looks nothing up', async () => {
  mount();
  await screen.findByText('open source low code platform');
  const bar = document.querySelector('[data-query-bar]') as HTMLElement;
  fireEvent.click(
    within(bar).getByRole('button', { name: /^internal tool builder/ }),
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: $t('keywordSuggestions.removeThisSeed'),
    }),
  );
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrKeywordSuggest',
      'saveSeeds',
      expect.objectContaining({
        body: {
          projectId: 2,
          seeds: ['approval workflow', 'retool alternative'],
        },
      }),
    ),
  );
  expect(action.mock.calls.map((c) => c[1])).not.toContain('suggest');
});

test('another market from the query bar opens Edit seed words to find the list again there, with no Save only', async () => {
  action.mockImplementation(async (_resource: string, name: string) =>
    name === 'estimate'
      ? { maxUsd: 0.2911, reused: 0, monthUsd: 0.7, budgetUsd: 10 }
      : view,
  );
  mount();
  await screen.findByText('open source low code platform');
  const bar = document.querySelector('[data-query-bar]') as HTMLElement;
  fireEvent.click(
    within(bar).getByRole('button', { name: $t('common.unitedStatesEnglish') }),
  );
  fireEvent.click(
    await screen.findByRole('menuitem', { name: $t('keyword.japanJapanese') }),
  );
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain(
    $t('keywordSuggestions.marketChangeHint', {
      0: $t('keyword.japanJapanese'),
    }),
  );
  expect(
    within(dialog).queryByRole('button', {
      name: $t('keywordSuggestions.saveSeedsOnly'),
    }),
  ).toBeNull();
  fireEvent.click(
    await within(dialog).findByRole('button', {
      name: $t('keywordSuggestions.saveAndFind', { 0: '0.30' }),
    }),
  );
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrKeywordSuggest',
      'suggest',
      expect.objectContaining({
        body: {
          projectId: 2,
          seeds: LIST.seeds,
          market: { locationCode: 2392, language: 'ja' },
          by: 'person',
        },
      }),
    ),
  );
});

test('Edit groups › New group shows the most its expansion may cost, and Save expands in that direction into it', async () => {
  action.mockImplementation(async (_resource: string, name: string) =>
    name === 'estimate'
      ? { maxUsd: 0.2718, reused: 0, monthUsd: 0.7, budgetUsd: 10 }
      : view,
  );
  mount();
  await screen.findByText('open source low code platform');
  fireEvent.click(
    screen.getByRole('button', { name: $t('keywordSuggestions.editGroups') }),
  );
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: $t('keywordSuggestions.addGroup'),
    }),
  );
  fireEvent.change(
    within(dialog).getByRole('textbox', {
      name: $t('keywordSuggestions.newGroupName'),
    }),
    { target: { value: 'Self-hosting' } },
  );
  const save = await within(dialog).findByRole('button', {
    name: $t('keywordSuggestions.saveAndExpand', { 0: '0.28' }),
  });
  expect(action).toHaveBeenCalledWith(
    'nrKeywordSuggest',
    'estimate',
    expect.objectContaining({ body: { projectId: 2, mode: 'dig' } }),
  );
  expect(dialog.querySelector('[data-new-group-cost]')?.textContent).toContain(
    $t('keywordSuggestions.seedsMonth', { 0: '0.70', 1: '10.00' }),
  );
  fireEvent.click(save);
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrKeywordSuggest',
      'dig',
      expect.objectContaining({
        body: {
          projectId: 2,
          direction: 'Self-hosting',
          name: 'Self-hosting',
          by: 'person',
        },
      }),
    ),
  );
  expect(action.mock.calls.map((c) => c[1])).not.toContain('editGroups');
});

test('every group tab reads as a name and a count; the group column names the group a row is listed under', async () => {
  view = {
    ...LIST,
    groupNames: { 对比与替代词: '竞品对比' },
    digs: [
      { ...LIST.digs[0], name: '审批流' },
      {
        id: 'dig2',
        direction: 'From 1 to 2 (maintenance and modernization)',
        name: null,
        seeds: ['legacy'],
        at: '2026-10-27T10:00:00Z',
        found: 9,
        items: [item('legacy modernization', '品类与行业词', 720, 'dig2')],
      },
    ],
    naming: true,
  };
  mount();
  await screen.findByText('open source low code platform');
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
    `${$t('keywordSuggestions.allTab')} 4`,
    '竞品对比 1',
    `${$t('keywordSuggestions.groups.industry')} 1`,
    '审批流 1',
    `${$t('keywordSuggestions.naming')} 1`,
  ]);
  expect(screen.getByRole('tab', { name: '审批流 1' })).toHaveAttribute(
    'title',
    $t('keywordSuggestions.dugDirection', { 0: 'approval workflow' }),
  );
  const table = screen.getByRole('table');
  const row = within(table)
    .getByText('approval workflow software')
    .closest('tr')!;
  expect(within(row).getByText('审批流')).toBeVisible();
  const retool = within(table).getByText('retool alternative').closest('tr')!;
  expect(within(retool).getByText('竞品对比')).toBeVisible();
  // Not a single "From … dig" left anywhere on the page.
  expect(document.body.textContent).not.toMatch(/从 .* 挖|From .* dig/);
});

test('Edit groups renames any group in place and deletes with undo until Save', async () => {
  action.mockImplementation(async () => view);
  mount();
  await screen.findByText('open source low code platform');
  fireEvent.click(
    screen.getByRole('button', { name: $t('keywordSuggestions.editGroups') }),
  );
  const dialog = await screen.findByRole('dialog');
  const names = within(dialog).getAllByRole('textbox', {
    name: $t('keywordSuggestions.groupName'),
  });
  expect(names.map((n) => (n as HTMLInputElement).value)).toEqual([
    $t('keywordSuggestions.groups.product'),
    $t('keywordSuggestions.groups.useCase'),
    $t('keywordSuggestions.groups.comparison'),
    $t('keywordSuggestions.groups.industry'),
    'approval workflow',
  ]);
  fireEvent.change(names[2], { target: { value: '竞品对比' } });
  const deleteIndustry = within(dialog).getByRole('button', {
    name: $t('keywordSuggestions.deleteNamedGroup', {
      0: $t('keywordSuggestions.groups.industry'),
    }),
  });
  fireEvent.click(deleteIndustry);
  expect(names[3]).toBeDisabled();
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: $t('keywordSuggestions.deleteNamedGroup', {
        0: 'approval workflow',
      }),
    }),
  );
  // Undo the industry deletion; the dug group stays deleted.
  fireEvent.click(
    within(dialog).getAllByRole('button', {
      name: $t('keywordSuggestions.undoDelete'),
    })[0],
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: $t('common.save') }),
  );
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrKeywordSuggest',
      'editGroups',
      expect.objectContaining({
        body: {
          projectId: 2,
          groups: [
            { id: '对比与替代词', name: '竞品对比' },
            { id: 'dig1', deleted: true },
          ],
        },
      }),
    ),
  );
});

test('Edit seed words: × removes a seed, Enter adds one, Save only keeps them, Save and find again shows its real cost', async () => {
  action.mockImplementation(async (_resource: string, name: string) =>
    name === 'estimate'
      ? { maxUsd: 0.0469, reused: 2, monthUsd: 0.7, budgetUsd: 10 }
      : name === 'suggest'
        ? {
            ...view,
            running: { stage: 'seeds', mode: 'list', direction: null },
          }
        : view,
  );
  mount();
  await screen.findByText('open source low code platform');
  const editSeeds = () =>
    fireEvent.click(
      screen.getByRole('button', { name: $t('keywordSuggestions.editSeeds') }),
    );
  editSeeds();
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: $t('keywordSuggestions.removeSeed', { 0: 'approval workflow' }),
    }),
  );
  const input = within(dialog).getByRole('textbox', {
    name: $t('keywordSuggestions.addSeedPlaceholder'),
  });
  fireEvent.change(input, { target: { value: 'Project Management Tool' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(
    dialog.querySelector('[data-seed-editor-hint]')?.textContent,
  ).toContain($t('keywordSuggestions.seedsChangeHint', { 0: 1, 1: 1 }));
  const find = await within(dialog).findByRole('button', {
    name: $t('keywordSuggestions.saveAndFind', { 0: '0.05' }),
  });
  expect(action).toHaveBeenLastCalledWith(
    'nrKeywordSuggest',
    'estimate',
    expect.objectContaining({
      body: {
        projectId: 2,
        seeds: [
          'internal tool builder',
          'retool alternative',
          'project management tool',
        ],
        market: LIST.market,
      },
    }),
  );
  fireEvent.click(
    within(dialog).getByRole('button', {
      name: $t('keywordSuggestions.saveSeedsOnly'),
    }),
  );
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrKeywordSuggest',
      'saveSeeds',
      expect.objectContaining({
        body: {
          projectId: 2,
          seeds: [
            'internal tool builder',
            'retool alternative',
            'project management tool',
          ],
        },
      }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  // Again, this time running a lookup: only this button spends.
  editSeeds();
  const again = await screen.findByRole('dialog');
  fireEvent.click(
    await within(again).findByRole('button', {
      name: $t('keywordSuggestions.saveAndFind', { 0: '0.05' }),
    }),
  );
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith(
      'nrKeywordSuggest',
      'suggest',
      expect.objectContaining({
        body: {
          projectId: 2,
          seeds: LIST.seeds,
          market: LIST.market,
          by: 'person',
        },
      }),
    ),
  );
  void find;
});

test('a failed dig is not shown above the list; a failed re-find newer than the list says the list is the earlier one', async () => {
  view = {
    ...LIST,
    lastError: {
      message: 'nothing new',
      mode: 'dig',
      at: '2026-10-28T00:00:00Z',
    },
  };
  mount();
  await screen.findByText('open source low code platform');
  expect(screen.queryByRole('alert')).toBeNull();
  cleanup();
  view = {
    ...LIST,
    lastError: {
      message: 'budget',
      mode: 'list',
      at: '2026-10-28T00:00:00Z',
    },
  };
  mount();
  await screen.findByText('open source low code platform');
  expect(screen.getByRole('alert').textContent).toContain(
    $t('keywordSuggestions.lastRunFailed', { 0: 'budget', 1: '10-27' }).split(
      '10-27',
    )[0],
  );
});

test('group tabs stay on one line: those that do not fit go under More, and the selected one stays shown', async () => {
  const width = vi
    .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
    .mockReturnValue(100);
  const room = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockReturnValue(500);
  try {
    mount('/keywords?tab=suggest&group=dig1');
    await screen.findByText('approval workflow software');
    // 500 wide less padding and Edit groups fits More and two tabs: All, then the selected group in place of the next one.
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      `${$t('keywordSuggestions.allTab')} 3`,
      'approval workflow 1',
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: `${$t('common.more')} 2` }),
    );
    fireEvent.click(
      await screen.findByRole('menuitem', {
        name: new RegExp($t('keywordSuggestions.groups.comparison')),
      }),
    );
    const table = screen.getByRole('table');
    await waitFor(() =>
      expect(within(table).getByText('retool alternative')).toBeVisible(),
    );
  } finally {
    width.mockRestore();
    room.mockRestore();
  }
});
