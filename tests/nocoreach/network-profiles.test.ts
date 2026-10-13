// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetch as liveFetch, request as liveRequest } from 'undici';
import { MockEngine } from '../../app-plugins/nocoreach-mock/server/engine.js';
import {
  ProxyProfiles,
  CONNECTIONS,
} from '../../server/nocoreach/proxy-profiles.js';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';
import { requireProfileRoute } from '../../server/nocoreach/profile-routing.js';

vi.mock('undici', async (original) => ({
  ...(await original<object>()),
  fetch: vi.fn(() => {
    throw new Error('Unexpected live fetch');
  }),
  request: vi.fn(() => {
    throw new Error('Unexpected live request');
  }),
}));
afterEach(() => {
  vi.clearAllMocks();
});
const clock = '2026-10-13T00:00:00.000Z';
function variables(initial: Record<string, string> = {}) {
  const values = { ...initial };
  const writes: { name: string; secret?: boolean }[] = [];
  return {
    values,
    writes,
    all: () => values,
    set: async (name: string, value: string, secret?: boolean) => {
      values[name] = value;
      writes.push({ name, secret });
    },
  };
}
async function setup() {
  const store = variables();
  const profiles = new ProxyProfiles(store);
  const mock = new MockEngine({ enabled: true, environment: 'test' }, 5);
  const network = new OutboundNetwork(profiles, mock);
  await mock.attach({
    variables: store,
    assertPristine: async () => {},
    app: { resourceManager: { define: () => {} }, acl: { allow: () => {} } },
    project: async () => ({}),
    requireAccess: async () => 'admin',
    projectSettings: (id, legacy) => profiles.mockStatus(id, legacy),
  });
  await profiles.migrateMockSettings();
  const saved = await profiles.save({
    kind: 'mock',
    name: 'Demo',
    mock: { scenario: 'normal', seed: 'profiles', clock },
  });
  await profiles.selectAll('1', { profileId: saved.id });
  return { store, profiles, mock, network, saved };
}
const url = 'https://api.github.com/repos/nocobloom/nocobloom';

describe('network profile configuration', () => {
  it('keeps legacy real proxy credentials and selections unchanged when mock is disabled', async () => {
    const store = variables(),
      profiles = new ProxyProfiles(store);
    const real = await profiles.save({
      name: 'Proxy',
      url: 'socks5h://proxy.example:1080',
      username: 'alice',
      password: 'secret',
    });
    await profiles.select('1', { connection: 'github', profileId: real.id });
    await profiles.migrateMockSettings();
    await profiles.save({ ...real, password: '' });
    expect(profiles.resolve('1', 'github')).toMatchObject({
      url: 'socks5h://proxy.example:1080',
      password: 'secret',
      revision: 2,
    });
    expect(profiles.list()[0]).not.toHaveProperty('password');
    expect(store.writes.every((write) => write.secret)).toBe(true);
    expect(requireProfileRoute(profiles.resolve('1', 'github'), false)).toBe(
      'proxy',
    );
    expect(requireProfileRoute(undefined, false)).toBe('direct');
  });
  it('requires an enabled plugin and rejects credentials or invalid clocks on mock profiles', async () => {
    const profiles = new ProxyProfiles(variables());
    const input = {
      kind: 'mock',
      name: 'Mock',
      mock: { scenario: 'normal', seed: 'test', clock },
    };
    await expect(profiles.save(input)).rejects.toMatchObject({ status: 409 });
    profiles.enableMockProfiles(true);
    await expect(
      profiles.save({ ...input, password: 'do-not-store' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      profiles.save({
        ...input,
        mock: { ...input.mock, clock: '2026-10-13T00:00:00' },
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      profiles.save({
        ...input,
        mock: { ...input.mock, scenario: 'invented' },
      }),
    ).rejects.toMatchObject({ status: 400 });
    const profile = await profiles.save(input);
    expect(profiles.profile(profile.id)).toMatchObject({
      kind: 'mock',
      url: '',
      username: '',
      password: '',
    });
    await expect(
      profiles.save({
        kind: 'proxy',
        id: profile.id,
        revision: profile.revision,
        name: profile.name,
        url: 'https://proxy.example',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('migrates enabled/paused projects once without dropping old real proxy secrets', async () => {
    const store = variables({
      NOREACH_MOCK_SETTINGS: JSON.stringify({
        1: {
          enabled: true,
          scenario: 'pagination',
          seed: 'old-seed',
          clock,
          revision: 7,
        },
        2: {
          enabled: false,
          scenario: 'normal',
          seed: 'paused',
          clock,
          revision: 3,
        },
      }),
    });
    const profiles = new ProxyProfiles(store);
    const real = await profiles.save({
      name: 'Proxy',
      url: 'https://proxy.example',
      username: 'alice',
      password: 'secret',
    });
    await profiles.select('1', { connection: 'google', profileId: real.id });
    await profiles.select('2', { connection: 'github', profileId: real.id });
    profiles.enableMockProfiles(true);
    await profiles.migrateMockSettings();
    const first = profiles.resolve('1', 'google');
    expect(first).toMatchObject({
      kind: 'mock',
      mock: { scenario: 'pagination', seed: 'old-seed', clock },
    });
    expect(new Set(Object.values(profiles.selections('1')))).toEqual(
      new Set([first!.id]),
    );
    expect(Object.keys(profiles.selections('1'))).toHaveLength(
      CONNECTIONS.length,
    );
    expect(profiles.selections('2')).toEqual({});
    expect(profiles.profile(real.id)).toMatchObject({ password: 'secret' });
    await profiles.selectAll('1', { profileId: null });
    await profiles.migrateMockSettings();
    expect(profiles.selections('1')).toEqual({});
    expect(profiles.list()).toHaveLength(2);
  });
  it('rejects corrupt legacy state and supports explicit demo initialization without overriding a deliberate pause', async () => {
    const corrupt = new ProxyProfiles(
      variables({ NOREACH_MOCK_SETTINGS: 'broken' }),
    );
    corrupt.enableMockProfiles(true);
    await expect(corrupt.migrateMockSettings()).rejects.toMatchObject({
      code: 'NR_PROXY_CONFIG_UNREADABLE',
    });
    const profiles = new ProxyProfiles(variables());
    profiles.enableMockProfiles(true);
    await profiles.migrateMockSettings();
    await profiles.initializeMockProject('1', {
      scenario: 'normal',
      seed: 'demo',
      clock,
    });
    expect(profiles.resolve('1', 'bilibili')?.kind).toBe('mock');
    await profiles.selectAll('1', { profileId: null });
    await profiles.initializeMockProject('1', {
      scenario: 'normal',
      seed: 'demo',
      clock,
    });
    expect(profiles.selections('1')).toEqual({});
  });
  it('keeps revision, reference and collector-proxy guards on the new API', async () => {
    const { profiles, saved, network } = await setup();
    await expect(profiles.remove(saved.id)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      profiles.save({
        kind: 'mock',
        name: saved.name,
        id: saved.id,
        revision: 0,
        mock: saved.mock,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const real = await profiles.save({
      name: 'Real',
      url: 'https://proxy.example',
    });
    await expect(
      profiles.select('1', { connection: 'bilibili', profileId: real.id }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      profiles.selectAll('1', { profileId: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    await network.close();
  });
});

describe('profile-authoritative outbound requests', () => {
  it('returns raw provider responses without touching the live transport and reports configuration validation honestly', async () => {
    const { network, profiles, saved } = await setup();
    const response = await network.fetch('github', url, {}, '1');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      full_name: 'nocobloom/nocobloom',
    });
    expect(
      await network.test(profiles.profile(saved.id), 'github'),
    ).toMatchObject({
      simulated: true,
      reachable: false,
      validation: 'configuration',
    });
    expect(liveFetch).not.toHaveBeenCalled();
    expect(liveRequest).not.toHaveBeenCalled();
    await network.close();
  });
  it('fails closed for missing selections, live selections, unmatched requests, unavailable plugin and missing scope', async () => {
    const { profiles, network, saved } = await setup();
    await expect(
      network.fetch('github', 'https://unknown.example', {}, '1'),
    ).rejects.toBeTruthy();
    await expect(network.fetch('github', url)).rejects.toMatchObject({
      status: 400,
    });
    await profiles.selectAll('1', { profileId: null });
    expect(() => network.fetch('github', url, {}, '1')).toThrow(
      'NR_MOCK_PROFILE_REQUIRED',
    );
    const real = await profiles.save({
      name: 'Real',
      url: 'https://proxy.example',
    });
    await profiles.select('1', { connection: 'github', profileId: real.id });
    expect(() => network.fetch('github', url, {}, '1')).toThrow(
      'NR_MOCK_PROFILE_REQUIRED',
    );
    await profiles.selectAll('1', { profileId: saved.id });
    const unavailable = new OutboundNetwork(profiles);
    expect(() => unavailable.fetch('github', url, {}, '1')).toThrow(
      'NR_MOCK_PROFILE_UNAVAILABLE',
    );
    expect(liveFetch).not.toHaveBeenCalled();
    expect(liveRequest).not.toHaveBeenCalled();
    await network.close();
    await unavailable.close();
  });
  it('freezes profile edits within an operation and captures credential-free snapshots for queued work', async () => {
    const { profiles, network, mock, saved } = await setup();
    const snapshot = await network.run('1', async () => {
      const original = network.mockContext('github');
      const key = network.mockCacheKey('github');
      await profiles.save({
        kind: 'mock',
        id: saved.id,
        name: saved.name,
        revision: saved.revision,
        mock: { scenario: 'error', seed: 'changed', clock },
      });
      expect(network.mockContext('github')).toEqual(original);
      expect(network.mockCacheKey('github')).toBe(key);
      expect((await network.fetch('github', url)).status).toBe(200);
      return original;
    });
    expect(snapshot).not.toHaveProperty('password');
    expect(snapshot.profileId).toBe(saved.id);
    expect((await network.fetch('github', url, {}, '1')).status).toBe(503);
    await profiles.selectAll('1', { profileId: null });
    const frozen = await mock.runSnapshot(snapshot, () =>
      network.run('1', () => network.fetch('github', url)),
    );
    expect(frozen.status).toBe(200);
    await network.close();
  });
  it('keeps different projects and connections isolated, including cancellation and shutdown', async () => {
    const { profiles, network, saved } = await setup();
    const other = await profiles.save({
      kind: 'mock',
      name: 'Errors',
      mock: { scenario: 'error', seed: 'other', clock },
    });
    await profiles.selectAll('2', { profileId: other.id });
    await profiles.select('1', { connection: 'slack', profileId: other.id });
    const values = await Promise.all(
      ['1', '2'].map((id) =>
        network.run(id, async () => {
          await Promise.resolve();
          return [
            network.mockContext('github').projectId,
            (await network.fetch('github', url)).status,
          ];
        }),
      ),
    );
    expect(values).toEqual([
      ['1', 200],
      ['2', 503],
    ]);
    expect(network.mockContext('slack', '1').profileId).toBe(other.id);
    expect(network.mockContext('github', '1').profileId).toBe(saved.id);
    const signal = AbortSignal.abort(
      new DOMException('Cancelled', 'AbortError'),
    );
    await expect(
      network.fetch('github', url, { signal }, '1'),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await network.close();
    await expect(network.fetch('github', url, {}, '1')).rejects.toMatchObject({
      code: 'NR_NETWORK_CLOSED',
    });
    expect(liveFetch).not.toHaveBeenCalled();
    expect(liveRequest).not.toHaveBeenCalled();
  });
});
