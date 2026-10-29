// @vitest-environment node
import { promises as dns } from 'node:dns';
import { afterEach, expect, it, vi } from 'vitest';
import { fetch as liveFetch, request as liveRequest } from 'undici';
import { DemoProjects } from '../../server/nocoreach/demo-data/upstream.js';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network.js';
import { ProxyProfiles } from '../../server/nocoreach/proxy-profiles.js';
import { download } from '../../server/nocoreach/public-sources.js';

vi.mock('undici', async (original) => ({
  ...(await original<object>()),
  fetch: vi.fn(() => Promise.resolve(new Response('live'))),
  request: vi.fn(() => {
    throw new Error('Unexpected live request');
  }),
}));

const networks: OutboundNetwork[] = [];
afterEach(async () => {
  await Promise.all(networks.splice(0).map((network) => network.close()));
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function setup() {
  const markers = new Map([
    ['1', { id: '1', name: 'Acme', domain: 'acme.example' }],
  ]);
  const projects = new DemoProjects(async (id) => markers.get(id));
  const network = new OutboundNetwork(
    new ProxyProfiles({ all: () => ({}), set: async () => {} }),
  );
  network.useDemoUpstream(projects);
  networks.push(network);
  return { network, projects, markers };
}

it('recognizes a demo created by another process before every outbound entry point', async () => {
  for (const entry of ['fetch', 'send', 'collector'] as const) {
    const { network, projects } = setup();
    expect(projects.has('1')).toBe(false);
    const url = 'https://not-a-fixture.invalid/';
    const result =
      entry === 'fetch'
        ? network.fetch('site', url, {}, '1')
        : entry === 'collector'
          ? network.fetchCollector('1', url, {})
          : network.run('1', () => network.send(undefined, url));
    await expect(result).rejects.toMatchObject({ code: 'NR_DEMO_OFFLINE' });
    expect(projects.has('1')).toBe(true);
  }
  expect(liveFetch).not.toHaveBeenCalled();
  expect(liveRequest).not.toHaveBeenCalled();
});

it('resolves demo public pages without performing DNS', async () => {
  const { network } = setup();
  const lookup = vi.spyOn(dns, 'lookup').mockRejectedValue(new Error('No DNS'));
  const result = await network.run('1', () =>
    download('https://acme.example/', 0, { network, connection: 'site' }),
  );
  expect(result.text).toContain('Acme');
  expect(lookup).not.toHaveBeenCalled();
  expect(liveFetch).not.toHaveBeenCalled();
});

it('keeps queued work offline after clearing a demo and leaves ordinary projects on their normal route', async () => {
  const { network, projects, markers } = setup();
  await projects.recognize('1');
  projects.remove('1');
  markers.delete('1');
  await expect(
    network.fetch('site', 'https://acme.example/', {}, '1'),
  ).rejects.toMatchObject({ code: 'NR_DEMO_OFFLINE' });
  expect(liveFetch).not.toHaveBeenCalled();
  expect(
    await (await network.fetch('site', 'https://own.example/', {}, '2')).text(),
  ).toBe('live');
  expect(liveFetch).toHaveBeenCalledTimes(1);
});

it('does not reach the network if reading the project marker fails', async () => {
  const { network } = setup();
  network.useDemoUpstream(
    new DemoProjects(async () => {
      throw new Error('Database unavailable');
    }),
  );
  await expect(
    network.fetch('site', 'https://acme.example/', {}, '1'),
  ).rejects.toThrow('Database unavailable');
  expect(liveFetch).not.toHaveBeenCalled();
});

it('keeps unmarked visitor projects offline in a dedicated demo environment', async () => {
  const { network, projects } = setup();
  projects.configuration = {
    enabled: true,
    invokeMock: async () => {
      throw new Error('No fixture');
    },
  } as never;
  await expect(
    network.fetch('site', 'https://own.example/', {}, '2'),
  ).rejects.toThrow();
  expect(liveFetch).not.toHaveBeenCalled();
  expect(liveRequest).not.toHaveBeenCalled();
});
