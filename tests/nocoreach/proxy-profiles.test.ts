// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  ProxyProfiles,
  CONNECTIONS,
} from '../../server/nocoreach/proxy-profiles';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network';
import { download } from '../../server/nocoreach/public-sources';
import { promises as dns } from 'node:dns';

function fixture() {
  const values: Record<string, string> = {};
  const variables = {
    all: () => ({ ...values }),
    set: vi.fn(async (key: string, value: string | null, secret?: boolean) => {
      expect(secret).toBe(true);
      values[key] = value!;
    }),
  };
  return { values, variables, profiles: new ProxyProfiles(variables) };
}
const input = {
  name: '香港出口',
  url: 'http://localhost:7890',
  username: 'alice',
  password: 'sensitive',
};
describe('proxy profiles', () => {
  it('stores a sealed setting, redacts credentials, preserves/clears passwords and rejects stale edits', async () => {
    const { profiles, variables } = fixture();
    const p = await profiles.save(input);
    expect(variables.set).toHaveBeenCalledWith(
      'NOREACH_PROXY_PROFILES',
      expect.any(String),
      true,
    );
    expect(p).not.toHaveProperty('password');
    expect(p.hasPassword).toBe(true);
    const next = await profiles.save({
      ...p,
      password: '',
      name: '修改后的出口',
    });
    expect(profiles.profile(p.id).password).toBe('sensitive');
    await expect(profiles.save(p)).rejects.toMatchObject({ status: 409 });
    await profiles.save({ ...next, clearAuth: true });
    expect(profiles.profile(p.id)).toMatchObject({
      username: '',
      password: '',
    });
  });
  it('validates profiles, preserves concurrent writes, rejects referenced removal and separates projects', async () => {
    const { profiles } = fixture();
    for (const url of [
      'socks5://localhost:1',
      'http://user:pass@localhost',
      'http://localhost/path',
      'http://localhost/?q=x',
    ])
      await expect(profiles.save({ ...input, url })).rejects.toMatchObject({
        status: 400,
      });
    const [a, b] = await Promise.all([
      profiles.save(input),
      profiles.save({ ...input, name: '美国出口' }),
    ]);
    expect(profiles.list()).toHaveLength(2);
    await profiles.select('1', { connection: 'google', profileId: a.id });
    await profiles.select('2', { connection: 'google', profileId: b.id });
    expect(profiles.resolve('1', 'google')?.id).toBe(a.id);
    expect(profiles.resolve('2', 'google')?.id).toBe(b.id);
    expect(profiles.resolve('1', 'github')).toBeUndefined();
    await expect(profiles.remove(a.id)).rejects.toMatchObject({ status: 409 });
    await profiles.select('1', { connection: 'google', profileId: null });
    await profiles.remove(a.id);
    expect(profiles.list()).toHaveLength(1);
    await expect(
      profiles.select('1', { connection: 'bad', profileId: b.id }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('fails closed on unreadable or dangling settings', async () => {
    const { profiles, values, variables } = fixture();
    values.NOREACH_PROXY_PROFILES = 'broken';
    expect(() => profiles.list()).toThrow('无法读取');
    values.NOREACH_PROXY_PROFILES = JSON.stringify({
      profiles: [],
      selections: { '1': { google: 'deleted' } },
    });
    expect(() => profiles.resolve('1', 'google')).toThrow('不存在');
    expect(() =>
      new ProxyProfiles({ ...variables, cannotRead: () => true }).resolve(
        '1',
        'google',
      ),
    ).toThrow('无法解密');
  });
  it('all actions require an administrator; anonymous users are rejected', async () => {
    const { profiles } = fixture();
    let actions: Record<string, (...args: any[]) => Promise<void>> = {};
    profiles.register({
      app: {
        resourceManager: {
          define: (v: any) => {
            actions = v.actions;
          },
        },
        acl: { allow() {} },
      },
      project: async () => ({}),
      network: {},
    });
    for (const [name, action] of Object.entries(actions)) {
      const ctx = (user: string | null, role: string) => ({
        action: {
          resourceName: 'nrProxyProfiles',
          actionName: name,
          params: { values: {} },
        },
        auth: { user: user ? { id: user } : null },
        state: { currentRoles: role === 'root' ? ['root'] : [] },
        db: {
          getRepository: (table: string) => ({
            findOne: async () =>
              table === 'users'
                ? { id: user }
                : { payload: { users: { member: 'member' } } },
          }),
        },
        throw: (status: number, message: string) => {
          throw Object.assign(new Error(message), { status });
        },
        set() {},
      });
      await expect(action(ctx(null, ''), async () => {})).rejects.toMatchObject(
        { status: 401 },
      );
      await expect(
        action(ctx('member', 'member'), async () => {}),
      ).rejects.toMatchObject({ status: 403 });
    }
    const admin: any = {
      auth: { user: { id: '1' } },
      state: { currentRoles: ['root'] },
      action: { params: {} },
      set() {},
      throw(status: number) {
        throw Object.assign(new Error(), { status });
      },
    };
    await actions.list(admin, async () => {});
    expect(admin.body).toEqual([]);
  });
  it('keeps asynchronous project scopes isolated and reloads selections on the next request', async () => {
    const { profiles } = fixture(),
      network = new OutboundNetwork(profiles);
    const p = await profiles.save(input);
    await profiles.select('1', { connection: 'github', profileId: p.id });
    const send = vi
      .spyOn(network, 'send')
      .mockResolvedValue(new Response('{}'));
    await Promise.all(
      ['1', '2'].map((id) =>
        network.run(id, async () => {
          await new Promise((r) => setTimeout(r, id === '1' ? 10 : 0));
          await network.fetch('github', 'https://api.github.com/');
        }),
      ),
    );
    expect(send.mock.calls.map((c) => c[0]?.id)).toEqual([undefined, p.id]);
    await profiles.select('1', { connection: 'github', profileId: null });
    await network.run('1', () =>
      network.fetch('github', 'https://api.github.com/'),
    );
    expect(send.mock.calls.at(-1)?.[0]).toBeUndefined();
    expect(() => network.fetch('github', 'https://api.github.com/')).toThrow(
      '项目范围',
    );
    expect(CONNECTIONS).toContain('dataforseo');
  });
  it('public downloads reject internal destinations and preserve checked IP, hostname and redirect policy', async () => {
    const { profiles } = fixture(),
      network = new OutboundNetwork(profiles);
    const p = await profiles.save(input);
    await profiles.select('1', { connection: 'site', profileId: p.id });
    const lookup = vi.spyOn(dns, 'lookup');
    const send = vi.spyOn(network, 'send');
    try {
      lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as any);
      await expect(
        network.run('1', () =>
          download('https://example.com/', 0, { network, connection: 'site' }),
        ),
      ).rejects.toThrow('公开互联网');
      expect(send).not.toHaveBeenCalled();
      lookup.mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ] as any);
      send.mockResolvedValue(
        new Response('hello', { headers: { 'content-type': 'text/plain' } }),
      );
      const data = await network.run('1', () =>
        download('https://example.com/', 0, { network, connection: 'site' }),
      );
      expect(data.text).toBe('hello');
      expect(send.mock.calls[0][3]).toEqual({
        address: '93.184.216.34',
        hostname: 'example.com',
      });
      send.mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'https://other.example/' },
        }),
      );
      await expect(
        network.run('1', () =>
          download('https://example.com/', 0, { network, connection: 'site' }),
        ),
      ).rejects.toThrow('其他域名');
    } finally {
      lookup.mockRestore();
      send.mockRestore();
    }
  });
});

it('competitor helpers keep the competitor exit for sitemaps, metadata and GitHub in a background entry', async () => {
  const { CompetitorWatch } =
    await import('../../server/nocoreach/competitor-watch');
  const { profiles } = fixture(),
    network = new OutboundNetwork(profiles);
  const profile = await profiles.save(input);
  await profiles.select('1', {
    connection: 'competitors',
    profileId: profile.id,
  });
  const send = vi
    .spyOn(network, 'send')
    .mockImplementation(async (_profile, url) => {
      const u = String(url);
      if (u.includes('robots.txt'))
        return new Response('Sitemap: https://example.com/sitemap.xml');
      if (u.includes('sitemap'))
        return new Response(
          '<urlset><url><loc>https://example.com/new</loc></url></urlset>',
        );
      if (u.includes('api.github.com'))
        return new Response(
          JSON.stringify(
            u.includes('releases')
              ? []
              : { stargazers_count: 1, forks_count: 0 },
          ),
        );
      return new Response('<title>New page</title>', {
        headers: { 'content-type': 'text/html' },
      });
    });
  const lookup = vi
    .spyOn(dns, 'lookup')
    .mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);
  try {
    const p = { network, env: () => '', github: { token: () => '' } };
    const collector = new CompetitorWatch(p);
    await collector.look(
      '1',
      {
        id: 'other',
        name: 'Other',
        site: 'https://example.com',
        repo: 'org/repo',
      },
      {},
      new Date().toISOString(),
    );
    expect(send.mock.calls.some((c) => String(c[1]).includes('sitemap'))).toBe(
      true,
    );
    expect(
      send.mock.calls.some((c) => String(c[1]).includes('api.github.com')),
    ).toBe(true);
    expect(send.mock.calls.every((c) => c[0]?.id === profile.id)).toBe(true);
  } finally {
    send.mockRestore();
    lookup.mockRestore();
  }
});
