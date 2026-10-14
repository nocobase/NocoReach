// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks';
import { promises as dns } from 'node:dns';
import https from 'node:https';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OutboundNetwork,
  type SimulatedUpstream,
} from '../../server/nocoreach/outbound-network.js';
import type { MockRunContext } from '../../app-plugins/nocoreach-mock/server/types.js';
import { ProxyProfiles } from '../../server/nocoreach/proxy-profiles.js';
import { download } from '../../server/nocoreach/public-sources.js';

afterEach(() => vi.restoreAllMocks());
function setup(
  handler: (url: URL, init: RequestInit) => Response | Promise<Response> = () =>
    new Response('<html>NocoBloom simulated website</html>', {
      headers: { 'Content-Type': 'text/html' },
    }),
) {
  const scopes = new AsyncLocalStorage<string>();
  const snapshots = new AsyncLocalStorage<Readonly<MockRunContext>>();
  const seen: string[] = [];
  const simulation: SimulatedUpstream = {
    enabled: true,
    run: (project, fn) => scopes.run(project, fn),
    runSnapshot: (snapshot, fn) =>
      snapshots.run(snapshot as Readonly<MockRunContext>, fn),
    currentSnapshot: () => snapshots.getStore(),
    request: async (project, url, init = {}) => {
      const id = project || scopes.getStore();
      if (!id) throw Object.assign(new Error('no project'), { status: 400 });
      seen.push(id);
      return handler(new URL(url), init);
    },
  };
  const profile = {
    kind: 'mock',
    id: '505cffd5-7a29-4e4b-82e4-3350a5105142',
    name: 'Mock',
    url: '',
    username: '',
    password: '',
    revision: 1,
    updatedAt: '2026-10-13T00:00:00Z',
    mock: { scenario: 'normal', seed: 'test', clock: '2026-10-13T00:00:00Z' },
  };
  const choices = {
    github: profile.id,
    site: profile.id,
    bilibili: profile.id,
  };
  const values = {
    NOREACH_PROXY_PROFILES: JSON.stringify({
      profiles: [profile],
      selections: { 1: choices, 2: choices },
    }),
  };
  const profiles = new ProxyProfiles({
    all: () => values,
    set: async () => {},
  });
  const network = new OutboundNetwork(profiles, simulation);
  return { network, profiles, seen };
}

describe('explicit simulated NocoReach transport', () => {
  it('routes API, public read, collector and direct send through explicit mock profiles without DNS or live HTTP', async () => {
    const lookup = vi
      .spyOn(dns, 'lookup')
      .mockRejectedValue(new Error('live DNS forbidden'));
    const get = vi.spyOn(https, 'get').mockImplementation(() => {
      throw new Error('live HTTPS forbidden');
    });
    const { network, profiles, seen } = setup();
    const selections = vi.spyOn(profiles, 'snapshot');
    await network.run('1', async () => {
      expect(
        (
          await network.fetch(
            'github',
            'https://api.github.com/repos/nocobloom/nocobloom',
          )
        ).status,
      ).toBe(200);
      const page = await download('https://nocobloom.example/docs', 0, {
        network,
        connection: 'site',
      });
      expect(page).toMatchObject({
        url: 'https://nocobloom.example/docs',
        type: 'text/html',
      });
      expect(page.text).toContain('NocoBloom');
      expect(
        (
          await network.fetchCollector(
            '1',
            'https://collector.nocobloom.example',
            {},
            'bilibili',
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await network.send(
            profiles.resolve('1', 'site'),
            'https://nocobloom.example',
          )
        ).status,
      ).toBe(200);
    });
    expect(seen).toEqual(['1', '1', '1', '1']);
    expect(lookup).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(selections).toHaveBeenCalledWith('1');
    await network.close();
  });
  it('fails closed on unsupported URLs, missing scope and closed instance', async () => {
    const { network } = setup(() => {
      throw Object.assign(new Error('unsupported'), {
        code: 'NR_MOCK_UNMATCHED_REQUEST',
      });
    });
    await expect(
      network.run('1', () =>
        network.fetch('github', 'https://unmatched.example'),
      ),
    ).rejects.toMatchObject({ code: 'NR_MOCK_UNMATCHED_REQUEST' });
    await expect(
      network.fetch('github', 'https://api.github.com'),
    ).rejects.toMatchObject({ status: 400 });
    await network.close();
    await expect(
      network.fetch('github', 'https://api.github.com', {}, '1'),
    ).rejects.toThrow('采集网络已关闭');
  });
  it('keeps concurrent project scopes isolated', async () => {
    const { network, seen } = setup();
    await Promise.all(
      ['1', '2'].map((id) =>
        network.run(id, async () => {
          await Promise.resolve();
          await network.fetch('site', 'https://nocobloom.example');
        }),
      ),
    );
    expect(seen.sort()).toEqual(['1', '2']);
  });
  it('preserves URL safety, response limits and abort checks for simulated public downloads', async () => {
    const { network } = setup(
      () => new Response('x'.repeat(2 * 1024 * 1024 + 1)),
    );
    await expect(
      network.run('1', () =>
        download('http://nocobloom.example', 0, {
          network,
          connection: 'site',
        }),
      ),
    ).rejects.toThrow('不支持');
    await expect(
      network.run('1', () =>
        download('https://nocobloom.example', 0, {
          network,
          connection: 'site',
        }),
      ),
    ).rejects.toThrow('2MB');
    const controller = new AbortController();
    controller.abort(new DOMException('stop', 'AbortError'));
    await expect(
      network.run('1', () =>
        download('https://nocobloom.example', 0, {
          network,
          connection: 'site',
          signal: controller.signal,
        }),
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('retains production SSRF rejection when simulation is disabled', async () => {
    vi.spyOn(dns, 'lookup').mockResolvedValue([
      { address: '127.0.0.1', family: 4 },
    ] as never);
    const get = vi.spyOn(https, 'get').mockImplementation(() => {
      throw new Error('must reject before HTTPS');
    });
    const network = new OutboundNetwork(
      new ProxyProfiles({ all: () => ({}), set: async () => {} }),
    );
    await expect(
      network.run('1', () =>
        download('https://nocobloom.example', 0, {
          network,
          connection: 'site',
        }),
      ),
    ).rejects.toThrow('公开互联网');
    expect(get).not.toHaveBeenCalled();
  });
});
