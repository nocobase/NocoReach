// @vitest-environment node
import { promises as dnsPromises } from 'node:dns';
import { createServer } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  OutboundNetwork,
  networkFailure,
  unreachableOf,
} from '../../server/nocoreach/outbound-network';
import { download } from '../../server/nocoreach/public-sources.js';
import { googleJson } from '../../server/nocoreach/google-client.js';
import { SiteContent } from '../../server/nocoreach/site-content.js';
import { Skills } from '../../server/nocoreach/skills.js';
import { systemMessageText } from '../../shared/i18n/messages';
import {
  networkFailureEntries,
  networkFailureKey,
} from '../../shared/network-failures';
import type { ProxyProfile } from '../../server/nocoreach/proxy-profiles';

const refusingProxy: ProxyProfile = {
  id: '86f2c028-4100-4d0e-989d-fd0b2233c58a',
  name: '默认代理',
  url: 'http://127.0.0.1:9',
  username: '',
  password: '',
  revision: 1,
  updatedAt: '2026-10-20T00:00:00.000Z',
};
// A local port nothing listens on.
async function closedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const networks: OutboundNetwork[] = [];
function network() {
  const n = new OutboundNetwork({} as never);
  networks.push(n);
  return n;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(networks.splice(0).map((n) => n.close()));
});

describe('a request that gets no answer says why and which way it went (NETWORK-EGRESS §3.3)', () => {
  it.each([
    ['ETIMEDOUT', 'timeout', '连接超时'],
    ['ECONNRESET', 'reset', '连接被中断'],
    ['ECONNREFUSED', 'refused', '连接被拒绝'],
    ['ENOTFOUND', 'dns', '找不到'],
    ['NR_NETWORK_ERROR', 'other', '没有收到响应'],
  ])(
    '%s directly: names the host and the reason, and points to Settings › Network',
    (code, reason, words) => {
      const e = networkFailure(code, 'Error', 'github.com', false);
      expect(e).toMatchObject({
        status: 502,
        code,
        reason,
        proxied: false,
        host: 'github.com',
      });
      expect(e.message).toBe(
        systemMessageText(networkFailureKey(reason as never, false), {
          0: 'github.com',
        }),
      );
      expect(e.message).toContain('服务器连不上 github.com');
      expect(e.message).toContain(words);
      expect(e.message).toContain('“设置 → 网络”');
    },
  );

  it.each([
    ['ETIMEDOUT', 'timeout', '连接超时'],
    ['ECONNRESET', 'reset', '连接被中断'],
    ['ECONNREFUSED', 'refused', '连接被拒绝'],
    ['ENOTFOUND', 'dns', '找不到'],
    ['NR_SOCKS_FAILED', 'other', '没有收到响应'],
  ])(
    '%s through the proxy: says so, and that it was not retried directly',
    (code, reason, words) => {
      const e = networkFailure(code, 'Error', 'api.github.com', true);
      expect(e).toMatchObject({
        status: 502,
        code,
        reason,
        proxied: true,
        host: 'api.github.com',
      });
      expect(e.message).toContain('通过代理连不上 api.github.com');
      expect(e.message).toContain(words);
      expect(e.message).toContain('没有改为直接访问');
    },
  );

  it('explains an untrusted certificate with the company root certificate, whichever way it went', () => {
    for (const proxied of [false, true]) {
      const e = networkFailure(
        'SELF_SIGNED_CERT_IN_CHAIN',
        'Error',
        'github.com',
        proxied,
      );
      expect(e).toMatchObject({ reason: 'certificate', proxied });
      expect(e.message).toBe(
        'github.com 的证书不受信任。如果公司代理会检查 HTTPS，需要在部署时添加公司根证书。',
      );
    }
  });

  it('has a distinct sentence in both languages for every reason and route', () => {
    const texts = networkFailureEntries.map((entry) =>
      systemMessageText(entry.key, { 0: 'h' }),
    );
    expect(new Set(texts).size).toBe(11);
    for (const entry of networkFailureEntries) {
      expect(systemMessageText(entry.key, { 0: 'h' }, 'en-US')).toMatch(/h/);
      expect(systemMessageText(entry.key, { 0: 'h' }, 'en-US')).not.toMatch(
        /[一-鿿]/u,
      );
    }
  });

  it('send(): a refused direct connection keeps status 502 and its code, and names the host', async () => {
    const e = await network()
      .send(undefined, `https://127.0.0.1:${await closedPort()}/`)
      .catch((error) => error);
    expect(e).toMatchObject({
      status: 502,
      code: 'ECONNREFUSED',
      reason: 'refused',
      proxied: false,
      host: '127.0.0.1',
    });
    expect(e.message).toContain('服务器连不上 127.0.0.1（连接被拒绝）');
  });

  it('send(): a public read pinned to an address names the site, not the address', async () => {
    const e = await network()
      .send(
        undefined,
        `https://example.com:${await closedPort()}/`,
        {},
        { address: '127.0.0.1', hostname: 'example.com' },
      )
      .catch((error) => error);
    expect(e).toMatchObject({
      status: 502,
      reason: 'refused',
      host: 'example.com',
    });
  });

  it('send(): a proxy that cannot be reached is reported as a proxy failure', async () => {
    const e = await network()
      .send(refusingProxy, 'https://example.com/')
      .catch((error) => error);
    expect(e).toMatchObject({
      status: 502,
      proxied: true,
      host: 'example.com',
    });
    expect(e.message).toContain('通过代理连不上 example.com');
  });

  it('a direct public read whose address cannot be found fails the same way', async () => {
    vi.spyOn(dnsPromises, 'lookup').mockRejectedValue(
      Object.assign(new Error('getaddrinfo ENOTFOUND github.com'), {
        code: 'ENOTFOUND',
      }),
    );
    const e = await download('https://github.com/acme/skills').catch(
      (error) => error,
    );
    expect(e).toMatchObject({
      status: 502,
      code: 'ENOTFOUND',
      reason: 'dns',
      proxied: false,
      host: 'github.com',
    });
  });

  it('a cancelled direct read stays a cancellation', async () => {
    const cancelled = Object.assign(new Error('aborted'), {
      name: 'AbortError',
      code: 'ABORT_ERR',
    });
    vi.spyOn(dnsPromises, 'lookup').mockRejectedValue(cancelled);
    await expect(download('https://github.com/acme/skills')).rejects.toBe(
      cancelled,
    );
  });
});

describe('connection errors keep the failure where callers used to drop it', () => {
  const failure = () =>
    networkFailure('ECONNRESET', 'Error', 'oauth2.googleapis.com', false);

  it('Google: keeps its own code and carries the failure as the cause', async () => {
    const e = await googleJson(
      'https://oauth2.googleapis.com/token',
      {},
      async () => {
        throw failure();
      },
    ).catch((error: unknown) => error);
    expect(e).toMatchObject({ status: 502, code: 'network_unreachable' });
    expect(unreachableOf(e)?.message).toBe(failure().message);
    expect(unreachableOf(new Error('other'))).toBeUndefined();
  });

  it('website content: a site that gives no answer says why instead of "network unavailable"', async () => {
    const site = new SiteContent({}, async (url: string) => {
      throw networkFailure(
        'ETIMEDOUT',
        'TimeoutError',
        new URL(url).hostname,
        false,
      );
    });
    await expect(
      site.discover('https://www.example.com'),
    ).rejects.toMatchObject({
      status: 503,
      message: systemMessageText('outboundNetwork.failures.directTimeout', {
        0: 'www.example.com',
      }),
    });
  });

  it('Skill link import: the reason reaches the dialog', async () => {
    const skills = new Skills({ db: {} }, async () => {
      throw networkFailure('ECONNRESET', 'Error', 'api.github.com', false);
    });
    await expect(
      skills.readLink({
        url: 'https://github.com/acme/skills/tree/main/skills/brand-voice',
      }),
    ).rejects.toMatchObject({
      status: 502,
      reason: 'reset',
      message: systemMessageText('outboundNetwork.failures.directReset', {
        0: 'api.github.com',
      }),
    });
  });
});
