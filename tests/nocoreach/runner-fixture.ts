import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';

/** Report models through the Runner protocol and explicitly create disabled agents for each test to enable. */
export async function discoverAgents(
  agents: Agents,
  actor: string,
  models: string[],
  trust: 'team' | 'ownerOnly' = 'team',
) {
  const registration = await agents.runners.createRegistrationToken(actor, {
    trust,
  });
  const connected = await agents.runners.register({
    registrationToken: registration.token,
    name: 'Contract Runner',
    hostname: 'test',
    os: 'linux',
    arch: 'x64',
    version: '0.1.0-beta.9',
    protocolVersion: 11,
    features: [
      'archives',
      'input',
      'steer',
      'attachments',
      'checkout',
      'directories',
      'secrets',
      'skills',
      'mounts',
    ],
    tools: [
      {
        kind: 'claude',
        authenticated: true,
        models: models.map((id) => ({ id })),
      },
    ],
  });
  const existing = await agents.agents.list();
  const discovered = [];
  for (const model of models) {
    const found = existing.find(
      (agent) => agent.tool === 'claude' && agent.model === model,
    );
    if (found) {
      discovered.push(found);
      continue;
    }
    const created = await agents.agents.createFromAvailable(
      { tool: 'claude', model, description: 'Contract test agent' },
      actor,
    );
    discovered.push(
      await agents.agents.update(created.id, actor, {
        expectedRevision: created.revision,
        enabled: false,
      }),
    );
  }
  return { connected, discovered };
}
