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
import { $t, setDictionary } from '../../client/i18n';
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

test('the list says how it was made: seeds, real keywords found, picked, the volume floor and the groups dug', async () => {
  mount();
  await screen.findByText('open source low code platform');
  const basis = document.querySelector('[data-suggest-basis]') as HTMLElement;
  expect(basis.textContent).toContain(
    $t('keywordSuggestions.madeByAi', {
      0: 3,
      1: 386,
      2: 2,
      3: $t('keywordSuggestions.dugLater', { 0: 1 }),
      4: 50,
    }),
  );
  expect(
    within(
      within(basis).getByRole('list', {
        name: $t('keywordSuggestions.seedsTitle'),
      }),
    )
      .getAllByRole('listitem')
      .map((li) => li.textContent),
  ).toEqual(LIST.seeds);
  expect(
    screen.getByRole('tab', { name: `${$t('common.allCount', { 0: 3 })}` }),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('tab', {
      name: `${$t('keywordSuggestions.digTab', { 0: 'approval workflow' })} 1`,
    }),
  );
  const table = screen.getByRole('table');
  expect(within(table).getByText('approval workflow software')).toBeVisible();
  expect(within(table).queryByText('retool alternative')).toBeNull();
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

test('the page entry offers the prompts for this list, and a group dug in the chat appears without a reload', async () => {
  mount();
  await screen.findByText('open source low code platform');
  fireEvent.click(
    screen.getByRole('button', { name: $t('keywordSuggestions.aiEntry') }),
  );
  const prompts = within(screen.getByRole('log')).getByRole('list', {
    name: $t('onlineAgent.suggestions'),
  });
  expect(
    within(prompts)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual([
    $t('keywordSuggestions.presetMore', { 0: 'retool alternative' }),
    $t('keywordSuggestions.presetCompetitors'),
    $t('keywordSuggestions.presetJapan'),
    $t('keywordSuggestions.presetExplain'),
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
      name: `${$t('keywordSuggestions.digTab', { 0: 'crm' })} 1`,
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

test('the seed words are read-only: no dialog or Find again on the page; Adjust seed words with AI opens the chat on them', async () => {
  mount();
  await screen.findByText('open source low code platform');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Find again' })).toBeNull();
  expect(
    screen.queryByRole('textbox', {
      name: $t('keywordSuggestions.seedsTitle'),
    }),
  ).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: $t('keywordSuggestions.adjustSeeds') }),
  );
  expect(panel.openChat).toHaveBeenCalled();
  const log = screen.getByRole('log');
  expect(
    within(log).getByText($t('keywordSuggestions.seedsEntryDescription')),
  ).toBeVisible();
  const prompts = within(log).getByRole('list', {
    name: $t('onlineAgent.suggestions'),
  });
  expect(
    within(prompts)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual([
    $t('keywordSuggestions.presetExplainSeeds'),
    $t('keywordSuggestions.presetLeanSeeds'),
    $t('keywordSuggestions.presetAddRemoveSeed'),
    $t('keywordSuggestions.presetFindAgain'),
    $t('keywordSuggestions.presetOtherMarket'),
  ]);
  fireEvent.click(
    within(prompts).getByRole('button', {
      name: $t('keywordSuggestions.presetExplainSeeds'),
    }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'conversations',
      expect.objectContaining({
        subject: { kind: 'page', page: 'keywords', item: 'seeds:' },
        text: $t('keywordSuggestions.presetExplainSeeds'),
      }),
    ),
  );
});

test('a seed chip opens the chat on that seed word', async () => {
  mount();
  await screen.findByText('open source low code platform');
  const basis = document.querySelector('[data-suggest-basis]') as HTMLElement;
  fireEvent.click(
    within(basis).getByRole('button', { name: 'retool alternative' }),
  );
  const log = screen.getByRole('log');
  expect(
    within(log).getByText(
      $t('keywordSuggestions.seedEntry', { 0: 'retool alternative' }),
    ),
  ).toBeVisible();
  fireEvent.click(
    within(log).getByRole('button', {
      name: $t('keywordSuggestions.presetSeedFound'),
    }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'conversations',
      expect.objectContaining({
        subject: {
          kind: 'page',
          page: 'keywords',
          item: 'seeds:retool alternative',
        },
        text: $t('keywordSuggestions.presetSeedFound'),
      }),
    ),
  );
});
