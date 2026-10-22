import { describe, expect, it, vi } from 'vitest';
import { AgentStore } from '../../server/nocoreach/execution/agent';

// The Agent page reads how each local agent's latest tasks ended (2026-10-21 user report: the page said the agent
// worked while every task failed because Claude Code was not signed in on the computer).
const execution = (runnerName: string) => ({
  attempt: 1,
  runnerId: 'r1',
  runnerName,
  runnerOwnerUserId: 'owner',
  runnerOwnerName: 'Owner',
  runnerTrust: 'team',
  tool: 'claude',
});
const run = (
  status: 'completed' | 'failed' | 'cancelled',
  failureReason: string | null = null,
  finishedAt = '2026-10-21T11:30:38.000Z',
) => ({
  id: `${status}-${failureReason}-${finishedAt}`,
  agentId: 'claude',
  status,
  failureReason,
  finishedAt,
  tool: 'claude',
  executions: [execution('CheeseMacBook-Pro')],
});

function store(runs: ReturnType<typeof run>[]) {
  const list = vi.fn(async () => runs);
  const agents = {
    tx: { read: () => 'connection' },
    agents: {
      listActive: async () => [{ id: 'claude', name: 'Claude · Fable 5.1' }],
    },
    availability: async () => new Map([['claude', { online: true, busy: 0 }]]),
    runs: { list },
    views: async () => [
      {
        id: 'claude',
        runners: {
          team: 1,
          personal: 0,
          mine: 0,
          names: ['CheeseMacBook-Pro'],
        },
      },
    ],
  };
  const host = {
    p: { agents },
    snapshot: async () => ({ revision: 1, agentId: 'claude', repo: null }),
    put: async () => undefined,
    lock: async () => undefined,
  };
  return { store: new AgentStore(host as never), list };
}
const admin = { userId: 'admin', seesMachines: true };
const member = { userId: 'member', seesMachines: false };

describe('local agent health', () => {
  it('counts the failures in a row that last until someone signs the tool in', async () => {
    const { store: s, list } = store([
      run('failed', 'toolAuth'),
      run('cancelled'),
      run('failed', 'toolAuth'),
      run('failed', 'toolAuth'),
      run('completed'),
      run('failed', 'toolAuth'),
    ]);
    expect(await s.health('claude', admin)).toEqual({
      state: 'attention',
      group: 'toolLogin',
      count: 3,
      at: '2026-10-21T11:30:38.000Z',
      runnerName: 'CheeseMacBook-Pro',
      tool: 'claude',
    });
    expect(list).toHaveBeenCalledWith({
      agentId: 'claude',
      subjectKind: 'nocoreachTask',
      limit: 10,
    });
  });

  it('hides the computer from a member who may not see machines', async () => {
    const { store: s } = store([run('failed', 'setupFailed')]);
    expect(await s.health('claude', member)).toMatchObject({
      state: 'attention',
      group: 'setup',
      count: 1,
      runnerName: null,
    });
  });

  it('is ok after a success, or after a failure a retry may fix', async () => {
    expect(
      await store([run('completed'), run('failed', 'toolAuth')]).store.health(
        'claude',
        admin,
      ),
    ).toEqual({
      state: 'ok',
      at: '2026-10-21T11:30:38.000Z',
      outcome: 'completed',
    });
    expect(
      await store([run('failed', 'toolNetwork')]).store.health('claude', admin),
    ).toMatchObject({
      state: 'ok',
      outcome: 'failed',
    });
    expect(await store([]).store.health('claude', admin)).toEqual({
      state: 'unknown',
    });
  });

  it('adds health and where the agent runs only when the Agent page asks', async () => {
    const { store: s, list } = store([run('failed', 'toolAuth')]);
    const plain = await s.status('1', undefined, 'admin');
    expect(plain.options[0]).not.toHaveProperty('health');
    expect(plain).not.toHaveProperty('runners');
    expect(list).not.toHaveBeenCalled();

    const page = await s.status('1', undefined, 'admin', {
      seesMachines: true,
    });
    expect(page.options[0]).toMatchObject({
      id: 'claude',
      online: true,
      health: { state: 'attention', group: 'toolLogin' },
    });
    expect(page.runners).toEqual({
      team: 1,
      personal: 0,
      mine: 0,
      names: ['CheeseMacBook-Pro'],
    });
    expect(
      (await s.status('1', undefined, 'member', { seesMachines: false }))
        .runners,
    ).toEqual({
      team: 1,
      personal: 0,
      mine: 0,
      names: [],
    });
  });
});
