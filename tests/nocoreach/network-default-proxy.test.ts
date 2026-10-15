// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  ProxyProfiles,
  CONNECTIONS,
  DIRECT,
} from '../../server/nocoreach/proxy-profiles';

function fixture() {
  const values: Record<string, string> = {};
  const variables = {
    all: () => ({ ...values }),
    set: vi.fn(async (key: string, value: string | null) => {
      values[key] = value!;
    }),
  };
  return { values, variables, profiles: new ProxyProfiles(variables) };
}
const proxy = {
  url: 'http://proxy.corp.example:8080/',
  username: 'alice',
  password: 'sensitive',
};

describe('设置 › 网络: one default proxy', () => {
  it('saves, edits and clears the default proxy without returning its password', async () => {
    const { profiles } = fixture();
    expect(profiles.network()).toEqual({ proxy: null });
    const saved = (await profiles.saveNetwork(proxy)).proxy!;
    expect(saved).toEqual({
      id: expect.any(String),
      url: 'http://proxy.corp.example:8080',
      username: 'alice',
      hasPassword: true,
      revision: 1,
    });
    expect(profiles.get(saved.id).name).toBe('默认代理');
    // A blank password keeps the saved one; a stale form is refused.
    const edited = (
      await profiles.saveNetwork({
        url: 'socks5h://proxy.corp.example:1080',
        username: 'bob',
        revision: 1,
      })
    ).proxy!;
    expect(edited).toMatchObject({
      id: saved.id,
      username: 'bob',
      hasPassword: true,
      revision: 2,
    });
    expect(profiles.profile(saved.id)).toMatchObject({ password: 'sensitive' });
    await expect(
      profiles.saveNetwork({ ...proxy, revision: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    // No username and no password: no authentication. A password alone is refused.
    await expect(
      profiles.saveNetwork({ url: proxy.url, password: 'x', revision: 2 }),
    ).rejects.toThrow('用户名');
    expect(
      (await profiles.saveNetwork({ url: proxy.url, revision: 2 })).proxy,
    ).toMatchObject({ username: '', hasPassword: false });
    await expect(
      profiles.saveNetwork({ url: 'ftp://proxy', revision: 3 }),
    ).rejects.toThrow('SOCKS5');
    // An empty address means direct, and the unused proxy goes with its credentials.
    expect(await profiles.saveNetwork({ url: '', revision: 3 })).toEqual({
      proxy: null,
    });
    expect(profiles.list()).toEqual([]);
  });

  it('routes every live connection through the default unless a project turns it off', async () => {
    const { profiles } = fixture();
    const id = (await profiles.saveNetwork(proxy)).proxy!.id;
    const other = await profiles.save({ ...proxy, name: 'Reddit 住宅' });
    expect(profiles.resolve('1', 'github')?.id).toBe(id);
    expect(profiles.resolve('2', 'site')?.id).toBe(id);
    // Browser collectors use their own host's network.
    expect(profiles.resolve('1', 'bilibili')).toBeUndefined();
    expect(profiles.resolve('1', 'xiaohongshu')).toBeUndefined();
    await profiles.select('1', { connection: 'github', profileId: DIRECT });
    await profiles.select('1', { connection: 'site', profileId: other.id });
    expect(profiles.resolve('1', 'github')).toBeUndefined();
    expect(profiles.resolve('1', 'site')?.id).toBe(other.id);
    expect(profiles.resolve('2', 'github')?.id).toBe(id);
    expect(profiles.selections('1')).toEqual({
      github: DIRECT,
      site: other.id,
    });
    // A snapshot (mock and queued work) agrees with the per-request route.
    const snapshot = profiles.snapshot('1');
    expect(snapshot.github).toBeUndefined();
    expect(snapshot.site?.id).toBe(other.id);
    expect(snapshot.google?.id).toBe(id);
    // Turning the switch back on follows the default again.
    await profiles.select('1', { connection: 'github', profileId: null });
    expect(profiles.resolve('1', 'github')?.id).toBe(id);
    // The default proxy cannot be deleted from the profile list.
    await expect(profiles.remove(id)).rejects.toMatchObject({ status: 409 });
  });

  it('keeps mock deployments on their own profiles', async () => {
    const { profiles } = fixture();
    await profiles.saveNetwork(proxy);
    profiles.enableMockProfiles(true);
    // An empty choice pauses a mock deployment; the live default never applies there.
    expect(profiles.resolve('1', 'github')).toBeUndefined();
    await expect(profiles.saveNetwork(proxy)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      profiles.select('1', { connection: 'github', profileId: DIRECT }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('moving to the default proxy on upgrade', () => {
  it('makes the most used proxy the default and keeps every route', async () => {
    const { profiles } = fixture();
    const main = await profiles.save({ ...proxy, name: '公司代理' });
    const other = await profiles.save({ ...proxy, name: '香港出口' });
    await profiles.select('1', { connection: 'github', profileId: main.id });
    await profiles.select('1', { connection: 'google', profileId: main.id });
    await profiles.select('2', { connection: 'github', profileId: other.id });
    const projectIds = vi.fn(async () => ['1', '2', '3']);
    const moved = await profiles.migrateDefaultProxy(projectIds);
    expect(profiles.network().proxy?.id).toBe(main.id);
    expect(moved).toEqual([
      { projectId: '2', connection: 'github', from: '香港出口' },
    ]);
    // Connections that were direct stay direct, in every project; collectors are left alone.
    expect(profiles.resolve('1', 'github')?.id).toBe(main.id);
    expect(profiles.resolve('1', 'site')).toBeUndefined();
    expect(profiles.resolve('2', 'github')?.id).toBe(main.id);
    expect(profiles.resolve('2', 'google')).toBeUndefined();
    expect(profiles.resolve('3', 'github')).toBeUndefined();
    expect(profiles.selections('3')).toEqual(
      Object.fromEntries(
        CONNECTIONS.filter((c) => !['bilibili', 'xiaohongshu'].includes(c)).map(
          (c) => [c, DIRECT],
        ),
      ),
    );
    // A project created afterwards follows the default.
    expect(profiles.resolve('4', 'github')?.id).toBe(main.id);
    // Runs once.
    await profiles.select('3', { connection: 'site', profileId: other.id });
    expect(await profiles.migrateDefaultProxy(projectIds)).toEqual([]);
    expect(profiles.resolve('3', 'site')?.id).toBe(other.id);
    expect(projectIds).toHaveBeenCalledTimes(1);
  });

  it('leaves deployments without a selected proxy, and mock deployments, unchanged', async () => {
    const { profiles, variables } = fixture();
    await profiles.save({ ...proxy, name: '未使用' });
    const projectIds = vi.fn(async () => ['1']);
    expect(await profiles.migrateDefaultProxy(projectIds)).toEqual([]);
    expect(profiles.network().proxy).toBeNull();
    expect(profiles.resolve('1', 'github')).toBeUndefined();
    expect(projectIds).not.toHaveBeenCalled();
    const writes = variables.set.mock.calls.length;
    await profiles.migrateDefaultProxy(projectIds);
    expect(variables.set.mock.calls.length).toBe(writes);

    const mock = fixture();
    mock.profiles.enableMockProfiles(true);
    expect(await mock.profiles.migrateDefaultProxy(projectIds)).toEqual([]);
    expect(mock.variables.set).not.toHaveBeenCalled();
  });

  it('writes nothing in a fresh application, which must stay empty for the classic import', async () => {
    const { profiles, values, variables } = fixture();
    expect(await profiles.migrateDefaultProxy(async () => ['1'])).toEqual([]);
    expect(variables.set).not.toHaveBeenCalled();
    expect(values).toEqual({});
  });
});
