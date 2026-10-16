import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';

/** Discover through the public Runner protocol; enabling remains an explicit administrator action. */
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
  const discovered = (await agents.agents.list()).filter((agent) =>
    models.includes(agent.model ?? ''),
  );
  return {
    connected,
    discovered: models.map((model) =>
      discovered.find((agent) => agent.model === model)!,
    ),
  };
}
