// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OutboundNetwork,
  testFailureReason,
} from '../../server/nocoreach/outbound-network';
import type { ProxyProfile } from '../../server/nocoreach/proxy-profiles';

const proxy: ProxyProfile = {
  id: '86f2c028-4100-4d0e-989d-fd0b2233c58a',
  name: '默认代理',
  url: 'http://proxy.corp.example:8080',
  username: '',
  password: '',
  revision: 1,
  updatedAt: '2026-10-20T00:00:00.000Z',
};
const networks: OutboundNetwork[] = [];
function network() {
  const n = new OutboundNetwork({});
  networks.push(n);
  return n;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(networks.splice(0).map((n) => n.close()));
});

describe('Settings › Network: checking whether a data source can be reached', () => {
  it('reports a request without an answer as unreachable, with the reason and the route it took', async () => {
    const n = network();
    vi.spyOn(n, 'send').mockRejectedValue(
      Object.assign(new Error('proxy failed'), {
        status: 502,
        code: 'ECONNRESET',
      }),
    );
    expect(await n.test(proxy, 'github')).toMatchObject({
      reachable: false,
      status: 0,
      target: 'api.github.com',
      proxied: true,
      reason: 'reset',
    });
  });

  it('reports an answer as reachable, whatever its status, and says it went direct', async () => {
    const n = network();
    vi.spyOn(n, 'send').mockResolvedValue(new Response(null, { status: 401 }));
    expect(await n.test(undefined, 'x')).toMatchObject({
      reachable: true,
      status: 401,
      target: 'api.x.com',
      proxied: false,
    });
  });

  it('still fails the call for errors that are not about reaching the target', async () => {
    const n = network();
    vi.spyOn(n, 'send').mockRejectedValue(
      Object.assign(new Error('closed'), { status: 503, code: 'X' }),
    );
    await expect(n.test(proxy, 'site')).rejects.toMatchObject({ status: 503 });
  });

  it.each([
    ['ETIMEDOUT', 'timeout'],
    ['UND_ERR_CONNECT_TIMEOUT', 'timeout'],
    ['ECONNRESET', 'reset'],
    ['NR_SOCKS_CONNECTION_CLOSED', 'reset'],
    ['ECONNREFUSED', 'refused'],
    ['ENOTFOUND', 'dns'],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'certificate'],
    ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'certificate'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'certificate'],
    ['NR_NETWORK_ERROR', 'other'],
    [undefined, 'other'],
  ])('explains %s as %s', (code, reason) => {
    expect(testFailureReason(code)).toBe(reason);
  });
});
