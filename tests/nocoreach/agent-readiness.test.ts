import { describe, expect, it } from 'vitest';
import {
  agentBlocker,
  runtimeReadiness,
} from '../../server/nocoreach/execution/agent-readiness';

// Why a local agent cannot start a task now, from what the runtimes report (2026-11-10 user report: CheeseMac-Isolated
// was online with Claude Code and Codex signed out, and the Agent page said the runtime was offline).
const NOW = Date.parse('2026-11-10T12:00:00Z');
type Tool = {
  kind: string;
  authenticated: boolean;
  status?: string;
  models?: { id: string }[];
};
const runner = (over: Record<string, unknown> = {}) =>
  ({
    id: 'mac',
    name: 'CheeseMac-Isolated',
    status: 'online',
    trust: 'team',
    ownerUserId: 'owner',
    enabledTools: null,
    unavailableModels: null,
    policy: null,
    workspaceUsage: null,
    lastSeenAt: '2026-11-10T11:59:00Z',
    tools: [
      { kind: 'claude', authenticated: false, status: 'needsLogin' },
      { kind: 'codex', authenticated: false, status: 'needsLogin' },
    ] as Tool[],
    ...over,
  }) as never;
const signedIn = (kind: string, models: string[] = []): Tool => ({
  kind,
  authenticated: true,
  status: 'ready',
  models: models.map((id) => ({ id })),
});
const opus = {
  id: 'opus',
  name: 'Claude · Opus 5.5',
  modelEntries: [{ tool: 'claude', model: 'claude-opus-5-5' }],
} as never;
const admin = { actor: 'admin', seesMachines: true };
const member = { actor: 'member', seesMachines: false };
const owner = { actor: 'owner', seesMachines: false };

describe('why a local agent cannot start', () => {
  it('names the runtime and the tool that needs sign-in for those who may see the computer', () => {
    expect(agentBlocker(opus, [runner()], admin, NOW)).toEqual({
      kind: 'signIn',
      runtime: 'CheeseMac-Isolated',
      tool: 'claude',
    });
    expect(agentBlocker(opus, [runner()], member, NOW)).toEqual({
      kind: 'signIn',
      runtime: null,
      tool: 'claude',
    });
    // Its owner sees their own computer.
    expect(agentBlocker(opus, [runner()], owner, NOW)).toMatchObject({
      runtime: 'CheeseMac-Isolated',
    });
  });

  it('tells no runtime, only others’ personal ones and all offline apart', () => {
    expect(agentBlocker(opus, [], admin, NOW)).toEqual({ kind: 'noRuntime' });
    expect(
      agentBlocker(opus, [runner({ trust: 'ownerOnly' })], admin, NOW),
    ).toEqual({ kind: 'othersPersonal' });
    expect(
      agentBlocker(opus, [runner({ status: 'revoked' })], admin, NOW),
    ).toEqual({ kind: 'noRuntime' });
    expect(
      agentBlocker(
        opus,
        [
          runner({
            id: 'old',
            name: 'old-box',
            status: 'offline',
            lastSeenAt: '2026-09-01T00:00:00Z',
          }),
          runner({
            id: 'omarchy',
            name: 'omarchy-186',
            status: 'offline',
            lastSeenAt: '2026-10-19T08:00:00Z',
          }),
        ],
        admin,
        NOW,
      ),
    ).toEqual({
      kind: 'offline',
      runtime: 'omarchy-186',
      lastSeenAt: '2026-10-19T08:00:00Z',
    });
  });

  it('says when the quota is used up and when it comes back', () => {
    expect(
      agentBlocker(
        opus,
        [
          runner({
            tools: [signedIn('claude', ['claude-opus-5-5'])],
            unavailableModels: [
              {
                reason: 'toolQuota',
                scope: 'tool',
                tool: 'claude',
                model: '',
                resetsAt: '2026-11-10T18:00:00Z',
                at: '2026-11-10T10:00:00Z',
                reported: [],
              },
            ],
          }),
        ],
        admin,
        NOW,
      ),
    ).toEqual({
      kind: 'quota',
      runtime: 'CheeseMac-Isolated',
      tool: 'claude',
      resetsAt: '2026-11-10T18:00:00.000Z',
    });
  });

  it('says when the signed-in tool does not offer the agent’s model', () => {
    expect(
      agentBlocker(
        opus,
        [runner({ tools: [signedIn('claude', ['claude-sonnet-5-5'])] })],
        admin,
        NOW,
      ),
    ).toEqual({
      kind: 'model',
      runtime: 'CheeseMac-Isolated',
      tool: 'claude',
      model: 'claude-opus-5-5',
    });
  });

  it('says when the tool is not installed or turned off', () => {
    expect(
      agentBlocker(
        opus,
        [
          runner({
            tools: [
              { kind: 'claude', authenticated: false, status: 'notInstalled' },
            ],
          }),
        ],
        admin,
        NOW,
      ),
    ).toMatchObject({ kind: 'missingTool', tool: 'claude' });
    expect(
      agentBlocker(opus, [runner({ enabledTools: ['codex'] })], admin, NOW),
    ).toMatchObject({ kind: 'toolOff', tool: 'claude' });
  });

  it('gives the most actionable reason across runtimes', () => {
    expect(
      agentBlocker(
        opus,
        [
          runner({
            id: 'a',
            name: 'no-claude',
            tools: [
              { kind: 'claude', authenticated: false, status: 'notInstalled' },
            ],
          }),
          runner({ id: 'b', name: 'signed-out' }),
        ],
        admin,
        NOW,
      ),
    ).toEqual({ kind: 'signIn', runtime: 'signed-out', tool: 'claude' });
  });
});

describe('runtimes the person’s work could use', () => {
  it('counts an online runtime without a usable tool as not ready, and says which tools need sign-in', () => {
    expect(runtimeReadiness([runner()], admin)).toEqual({
      total: 1,
      online: 1,
      ready: 0,
      issue: {
        kind: 'signIn',
        runtime: 'CheeseMac-Isolated',
        tools: ['claude', 'codex'],
      },
    });
    expect(
      runtimeReadiness(
        [
          runner({
            tools: [
              signedIn('codex'),
              { kind: 'claude', authenticated: false, status: 'needsLogin' },
            ],
          }),
        ],
        member,
      ),
    ).toEqual({ total: 1, online: 1, ready: 1, issue: null });
    expect(
      runtimeReadiness(
        [
          runner({ status: 'offline' }),
          runner({ id: 'p', trust: 'ownerOnly', ownerUserId: 'someone' }),
        ],
        member,
      ),
    ).toEqual({ total: 1, online: 0, ready: 0, issue: null });
  });
});
