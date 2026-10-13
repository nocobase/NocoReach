import { randomUUID } from 'node:crypto';
import type { MockRunContext } from '../../app-plugins/nocoreach-mock/server/types.js';
import type { Connection, ProxyProfile } from './proxy-profiles.js';

export type MockProfileSettings = Pick<
  MockRunContext,
  'scenario' | 'seed' | 'clock'
>;

/** Empty legacy transport fields keep older read-only clients compatible without storing credentials. */
export interface MockProfile {
  kind: 'mock';
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
  url: '';
  username: '';
  password: '';
  mock: MockProfileSettings;
}
export type NetworkProfile = ProxyProfile | MockProfile;

export class NetworkProfileError extends Error {
  readonly status = 409;
  constructor(readonly code: string) {
    super(code);
    this.name = 'NetworkProfileError';
  }
}

/** Deployment isolation is a guard, never a hidden routing override. */
export function requireProfileRoute(
  profile: NetworkProfile | undefined,
  simulationEnabled: boolean,
): 'direct' | 'proxy' | 'mock' {
  if (profile?.kind === 'mock') {
    if (!simulationEnabled)
      throw new NetworkProfileError('NR_MOCK_PROFILE_UNAVAILABLE');
    return 'mock';
  }
  if (simulationEnabled)
    throw new NetworkProfileError('NR_MOCK_PROFILE_REQUIRED');
  return profile ? 'proxy' : 'direct';
}

export function mockProfileSnapshot(
  profile: MockProfile,
  projectId: string,
  connection?: Connection,
  runId = randomUUID(),
): Readonly<MockRunContext> {
  if (!/^[1-9]\d{0,15}$/.test(projectId))
    throw new NetworkProfileError('NR_MOCK_PROJECT_REQUIRED');
  return Object.freeze({
    projectId,
    enabled: true,
    ...profile.mock,
    revision: profile.revision,
    runId,
    profileId: profile.id,
    connection,
  });
}

export function freezeProfile(
  profile: NetworkProfile,
): Readonly<NetworkProfile> {
  return profile.kind === 'mock'
    ? Object.freeze({ ...profile, mock: Object.freeze({ ...profile.mock }) })
    : Object.freeze({ ...profile });
}
