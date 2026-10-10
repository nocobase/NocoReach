// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { fetch as request } from 'undici';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network';
import { ProxyProfiles } from '../../server/nocoreach/proxy-profiles';

vi.mock('undici', async (original) => ({
  ...(await original<object>()),
  fetch: vi.fn(),
}));
const networks: OutboundNetwork[] = [];
afterEach(async () => {
  await Promise.all(networks.splice(0).map((n) => n.close()));
  vi.restoreAllMocks();
});
function fixture() {
  const values: Record<string, string> = {};
  const profiles = new ProxyProfiles({
    all: () => values,
    set: async (key, value) => {
      values[key] = value!;
    },
  });
  const network = new OutboundNetwork(profiles);
  networks.push(network);
  vi.mocked(request)
    .mockReset()
    .mockImplementation(async () => response('{}'));
  const fetch = (host = 'api.github.com', project = '1') =>
    network.fetch('github', `https://${host}/`, {}, project);
  return { network, profiles, fetch };
}
function response(body: string, init?: ResponseInit) {
  return new Response(body, init) as unknown as Awaited<
    ReturnType<typeof request>
  >;
}
function dispatcher(index = -1) {
  return vi.mocked(request).mock.calls.at(index)![1]!.dispatcher!;
}

it('reuses fixed API connections and separates origins, profiles and application instances', async () => {
  const { fetch, profiles } = fixture();
  await fetch();
  const direct = dispatcher();
  await fetch();
  expect(dispatcher()).toBe(direct);
  await fetch('api.other.example');
  expect(dispatcher()).not.toBe(direct);
  const profile = await profiles.save({
    name: 'proxy',
    url: 'http://proxy.example:7890',
  });
  await profiles.select('1', { connection: 'github', profileId: profile.id });
  await fetch();
  const proxy = dispatcher();
  expect(proxy).not.toBe(direct);
  await fetch();
  expect(dispatcher()).toBe(proxy);
  await fetch('api.github.com', '2');
  expect(dispatcher()).toBe(direct);
  const other = fixture();
  await other.fetch();
  expect(dispatcher()).not.toBe(direct);
});

it('keeps connectivity tests fresh instead of reusing an authenticated proxy tunnel', async () => {
  const { fetch, profiles, network } = fixture();
  const profile = await profiles.save({
    name: 'proxy',
    url: 'http://proxy.example:7890',
  });
  await profiles.select('1', { connection: 'github', profileId: profile.id });
  await fetch();
  const pooled = dispatcher();
  await network.test(profiles.profile(profile.id), 'github');
  expect(dispatcher()).not.toBe(pooled);
  await fetch();
  expect(dispatcher()).toBe(pooled);
});

it.each(['http', 'socks5', 'socks5h'])(
  'retires old %s credentials without interrupting an in-flight redirect',
  async (protocol) => {
    const { fetch, profiles } = fixture();
    const profile = await profiles.save({
      name: 'proxy',
      url: `${protocol}://proxy.example:7890`,
      username: 'alice',
      password: 'old',
    });
    await profiles.select('1', { connection: 'github', profileId: profile.id });
    const pending =
      Promise.withResolvers<Awaited<ReturnType<typeof request>>>();
    vi.mocked(request).mockImplementationOnce(() => pending.promise);
    const oldRequest = fetch();
    const old = dispatcher();
    const destroy = vi.spyOn(old, 'destroy');
    await profiles.save({ ...profile, password: 'new' });
    await fetch();
    expect(dispatcher()).not.toBe(old);
    expect(destroy).not.toHaveBeenCalled();
    pending.resolve(
      response('', { status: 301, headers: { location: '/renamed' } }),
    );
    await oldRequest;
    expect(dispatcher()).toBe(old);
    expect(destroy).toHaveBeenCalled();
    await fetch();
    expect(dispatcher()).not.toBe(old);
  },
);

it('bounds cached origins with LRU eviction and closes all transports at shutdown', async () => {
  const { fetch, network } = fixture();
  await fetch('first.example');
  const first = dispatcher();
  const evicted = vi.spyOn(first, 'destroy');
  for (let i = 0; i < 32; i++) await fetch(`api${i}.example`);
  expect(evicted).toHaveBeenCalled();
  const last = dispatcher();
  const close = vi.spyOn(last, 'destroy');
  await network.close();
  expect(close).toHaveBeenCalled();
  const closeCalls = close.mock.calls.length;
  await network.close();
  expect(close).toHaveBeenCalledTimes(closeCalls);
  const count = vi.mocked(request).mock.calls.length;
  await expect(fetch()).rejects.toMatchObject({ code: 'NR_NETWORK_CLOSED' });
  expect(request).toHaveBeenCalledTimes(count);
});
