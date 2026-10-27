import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { OnlineChatProvider } from '../../client/online-agent/context.js';
import { OnlineChatView } from '../../client/online-agent/chat.js';
import { OnlineTranscript } from '../../client/online-agent/transcript.js';
import {
  PageAiEntry,
  RowAiEntry,
  type PageAiEntryProps,
} from '../../client/online-agent/page-entry.js';
import { usePageChange } from '../../client/online-agent/page-changes.js';
import { RULES } from '../../server/nocoreach/analysis-rules';
import type { OnlineRun } from '../../shared/online-agent.js';
import type { RuleProposal } from '../../shared/rule-proposal.js';
import type { View } from '../../client/pages/analysis-rules/types';

const { api, action, access, panel, success } = vi.hoisted(() => ({
  api: vi.fn(),
  action: vi.fn(),
  access: { can: true },
  success: vi.fn(),
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
  useBusinessAccess: () => ({ can: access.can }),
}));
vi.mock('../../client/pages/reach-data.js', () => ({
  useProject: () => ({ project: { id: 2, name: 'Project B' } }),
  useProjects: () => ({ projects: [{ id: 2, name: 'Project B' }] }),
}));
vi.mock('#lib/nocoreach-api', () => ({
  nocobaseClient: { action, wrapRequests: vi.fn() },
}));
vi.mock('#lib/toast', () => ({ toast: { success, error: vi.fn() } }));
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

const entry: PageAiEntryProps = {
  subject: { kind: 'page', page: 'analysisRules', item: 'default' },
  label: 'Let AI adjust the rules',
  description: 'The AI has read the rules.',
  presets: ['Flag fewer small fluctuations', 'Which rules have not fired?'],
};
const mount = (trigger = <PageAiEntry {...entry} />) =>
  render(
    <MemoryRouter>
      <OnlineChatProvider>
        {trigger}
        <OnlineChatView />
      </OnlineChatProvider>
    </MemoryRouter>,
  );
beforeEach(() => {
  setDictionary(null);
  vi.clearAllMocks();
  access.can = true;
  api.mockImplementation(async (path: string) =>
    path === 'conversations'
      ? { id: 'from-rules', revision: 0 }
      : {
          conversation: {
            id: 'from-rules',
            title: 'Flag fewer small fluctuations',
            agentId: 'online-default',
            projectId: '2',
            revision: 0,
          },
          runs: [],
        },
  );
});
afterEach(cleanup);

test('outside the app layout, with no chat, the entries render nothing', () => {
  const { container } = render(
    <>
      <PageAiEntry {...entry} />
      <RowAiEntry {...entry} />
    </>,
  );
  expect(container).toBeEmptyDOMElement();
});

test('the page entry opens the chat on a new conversation about the page, and a clicked prompt is sent', async () => {
  mount();
  fireEvent.click(
    screen.getByRole('button', { name: 'Let AI adjust the rules' }),
  );
  expect(panel.openChat).toHaveBeenCalled();
  // The new conversation names where it was opened and what the AI read, and offers the page's prompts.
  const log = screen.getByRole('log');
  expect(within(log).getByText('Let AI adjust the rules')).toBeVisible();
  expect(within(log).getByText('The AI has read the rules.')).toBeVisible();
  const prompts = within(log).getByRole('list', { name: '可以这样问' });
  expect(
    within(prompts)
      .getAllByRole('button')
      .map((b) => b.textContent),
  ).toEqual(entry.presets);
  fireEvent.click(
    within(prompts).getByRole('button', {
      name: 'Flag fewer small fluctuations',
    }),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'conversations',
      expect.objectContaining({
        projectId: '2',
        subject: { kind: 'page', page: 'analysisRules', item: 'default' },
        text: 'Flag fewer small fluctuations',
      }),
    ),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'conversations/from-rules',
      undefined,
      undefined,
      expect.anything(),
    ),
  );
  // Opening the entry again returns to its conversation instead of starting another.
  const created = api.mock.calls.filter(([path]) => path === 'conversations');
  fireEvent.click(
    screen.getByRole('button', { name: 'Let AI adjust the rules' }),
  );
  expect(screen.queryByRole('list', { name: '可以这样问' })).toBeNull();
  expect(api.mock.calls.filter(([path]) => path === 'conversations')).toEqual(
    created,
  );
});

test('a typed question replaces nothing: opening an entry over an unsent draft asks first', () => {
  mount();
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), {
    target: { value: 'My own question' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Let AI adjust the rules' }),
  );
  expect(screen.getByRole('alertdialog')).toBeVisible();
  expect(
    screen.getByRole('textbox', { name: '消息', hidden: true }),
  ).toHaveValue('My own question');
});

test('a row entry is the avatar alone, named by its label, and opens the chat about its row', async () => {
  mount(
    <div className='group'>
      <RowAiEntry
        subject={{ kind: 'page', page: 'keywords', item: 'nocobase crm' }}
        label='Dig from this keyword'
        presets={['Dig from this keyword']}
      />
    </div>,
  );
  const button = screen.getByRole('button', { name: 'Dig from this keyword' });
  expect(button.textContent).toBe('');
  fireEvent.click(button);
  fireEvent.click(
    within(screen.getByRole('list', { name: '可以这样问' })).getByRole(
      'button',
    ),
  );
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      'conversations',
      expect.objectContaining({
        subject: { kind: 'page', page: 'keywords', item: 'nocobase crm' },
        text: 'Dig from this keyword',
      }),
    ),
  );
});

let rules: View;
const proposal: RuleProposal = {
  kind: 'changes',
  projectId: '2',
  schemeId: 'default',
  schemeName: 'Default',
  revision: 'r1',
  changes: [
    {
      ruleId: 'gsc-click-drop',
      rule: 'Search clicks falling',
      field: 'dropPct',
      label: 'Down at least',
      unit: '%',
      before: 30,
      after: 50,
      reason: 'Only clear drops',
    },
  ],
};
const runWith = (output: unknown, ok = true): OnlineRun => ({
  id: 'reply',
  agentId: 'online-default',
  agentName: 'Online Agent',
  requestHash: 'hash',
  ownerId: 'owner',
  projectId: '2',
  conversationId: 'from-rules',
  sequence: 0,
  model: { modelService: 'service', model: 'test-model' },
  instructions: '',
  input: 'Flag fewer small fluctuations',
  status: 'completed',
  createdAt: '2026-10-27T00:00:00Z',
  startedAt: null,
  finishedAt: null,
  deadline: null,
  holder: null,
  cancelRequested: false,
  output: 'Confirm it in the card.',
  events: [
    {
      type: 'toolCall',
      id: 'p1',
      name: 'propose_rule_changes',
      args: {},
    },
    {
      type: 'toolResult',
      id: 'p1',
      name: 'propose_rule_changes',
      output: JSON.stringify(output),
      ok,
    },
    { type: 'text', text: 'Confirm it in the card.' },
  ],
  usage: { inputTokens: 1, outputTokens: 1 },
  error: null,
  revision: 0,
});
const value = () =>
  rules.rules
    .find((r) => r.id === 'gsc-click-drop')!
    .params.find((p) => p.key === 'dropPct')!;
beforeEach(() => {
  rules = {
    revision: 'r1',
    schemeId: 'default',
    schemes: [{ id: 'default', name: 'Default', version: 1 }],
    rules: RULES.map((r: View['rules'][number]) => ({
      ...r,
      enabled: true,
      params: r.params.map((p) => ({ ...p, value: p.default })),
      found: 0,
    })),
    focus: '',
    watchDays: 14,
    watchLimits: { default: 14, min: 7, max: 28 },
    last: null,
  } as View;
  action.mockImplementation(
    async (_resource: string, op: string, { body }: { body: never }) => {
      if (op === 'view') return structuredClone(rules);
      if (op === 'apply') {
        value().value = 50;
        rules.revision = 'r2';
        return structuredClone(rules);
      }
      throw new Error(`${op} ${JSON.stringify(body)}`);
    },
  );
});
function Listener({ reload }: { reload: () => void }) {
  usePageChange('analysisRules', 2, reload);
  return null;
}

test('a proposed rule change shows its before and after, and Confirm saves it through the page action', async () => {
  const reload = vi.fn();
  render(
    <>
      <Listener reload={reload} />
      <OnlineTranscript run={runWith({ proposal })} />
    </>,
  );
  const card = await screen.findByRole('region', { name: '待确认的规则修改' });
  await waitFor(() =>
    expect(card).toHaveAttribute('data-rule-proposal', 'pending'),
  );
  // The live rule names it; the old value is muted beside the new one.
  expect(within(card).getByText('页面搜索点击下降')).toBeVisible();
  expect(card).toHaveTextContent('30% → 改为 50%');
  expect(within(card).getByText('Only clear drops')).toBeVisible();
  // Proposing saved nothing.
  expect(action.mock.calls.map(([, op]) => op)).toEqual(['view']);
  fireEvent.click(within(card).getByRole('button', { name: '确认修改' }));
  await waitFor(() =>
    expect(card).toHaveAttribute('data-rule-proposal', 'saved'),
  );
  expect(action).toHaveBeenCalledWith('nrAnalysisRules', 'apply', {
    method: 'POST',
    body: {
      projectId: '2',
      schemeId: 'default',
      revision: 'r1',
      changes: [
        {
          ruleId: 'gsc-click-drop',
          field: 'dropPct',
          before: 30,
          after: 50,
          reason: 'Only clear drops',
        },
      ],
    },
    unwrap: 'data',
  });
  expect(within(card).getByText('已保存')).toBeVisible();
  expect(within(card).queryByRole('button', { name: '确认修改' })).toBeNull();
  expect(success).toHaveBeenCalled();
  // The rules page reads its rules again.
  expect(reload).toHaveBeenCalledTimes(1);
});

test('without the grant to change rules there is nothing to confirm', async () => {
  access.can = false;
  render(<OnlineTranscript run={runWith({ proposal })} />);
  const card = await screen.findByRole('region', { name: '待确认的规则修改' });
  await waitFor(() =>
    expect(card).toHaveAttribute('data-rule-proposal', 'pending'),
  );
  expect(within(card).queryByRole('button', { name: '确认修改' })).toBeNull();
  expect(card).toHaveTextContent('你没有修改分析规则的权限');
});

test('a proposal the rules moved past is out of date, and a refused confirm reads the rules again', async () => {
  rules.revision = 'r9';
  value().value = 40;
  render(<OnlineTranscript run={runWith({ proposal })} />);
  const card = await screen.findByRole('region', { name: '待确认的规则修改' });
  await waitFor(() =>
    expect(card).toHaveAttribute('data-rule-proposal', 'outdated'),
  );
  expect(within(card).getByText('已过期')).toBeVisible();
  expect(within(card).queryByRole('button', { name: '确认修改' })).toBeNull();
  cleanup();
  // Confirmed just as the rules changed elsewhere: the page action refuses it and the card follows the rules.
  rules.revision = 'r1';
  value().value = 30;
  action.mockImplementation(async (_resource: string, op: string) => {
    if (op === 'view') return structuredClone(rules);
    rules.revision = 'r3';
    throw Object.assign(new Error('changed'), { status: 409 });
  });
  render(<OnlineTranscript run={runWith({ proposal })} />);
  const again = await screen.findByRole('region', {
    name: '待确认的规则修改',
  });
  await waitFor(() =>
    expect(again).toHaveAttribute('data-rule-proposal', 'pending'),
  );
  await act(async () => {
    fireEvent.click(within(again).getByRole('button', { name: '确认修改' }));
  });
  expect(await within(again).findByRole('alert')).toHaveTextContent(
    '规则已发生变化',
  );
  await waitFor(() =>
    expect(again).toHaveAttribute('data-rule-proposal', 'outdated'),
  );
  expect(success).not.toHaveBeenCalled();
});

test('a rejected proposal stays a folded tool call', () => {
  render(
    <OnlineTranscript
      run={runWith({ rejected: true, reason: 'Out of range' })}
    />,
  );
  expect(screen.queryByRole('region', { name: '待确认的规则修改' })).toBeNull();
  expect(screen.getByText(/提出规则修改/)).toBeInTheDocument();
});
