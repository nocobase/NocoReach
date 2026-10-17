// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { CollectorConnections } from '../../server/nocoreach/collector-connections';
import type { LegacyDatabase } from '../../server/nocoreach/legacy/database';
import type { LegacyVariables } from '../../server/nocoreach/legacy/variables';

const token = 'isolated-test-collector-token-12345678';
function fixture(mock = false) {
  const values: Record<string, string> = {};
  const variables = {
    get: (key: string) => values[key],
    cannotRead: vi.fn(() => false),
    set: vi.fn(async (key: string, value: string, secret: boolean) => {
      expect(secret).toBe(true);
      values[key] = value;
    }),
  };
  const db = {
    sequelize: { transaction: async (fn: () => Promise<unknown>) => fn() },
  };
  const registry = new CollectorConnections(
    variables as unknown as LegacyVariables,
    db as unknown as LegacyDatabase,
    [
      {
        id: 'project-xiaohongshu-team',
        name: 'Configured',
        url: 'https://deployed.example',
        token,
        platforms: ['xiaohongshu', 'youtube'],
        projectIds: ['1'],
      },
    ],
    mock,
  );
  const source = {
    isCollectorBusy: vi.fn(() => false),
    resetCollector: vi.fn(async () => {}),
    search: vi.fn(async (_id: string) => {}),
  };
  registry.attach('xiaohongshu', source, ['search']);
  registry.attach('youtube', { ...source }, []);
  return { registry, source, variables, values };
}
describe('project collector configuration', () => {
  it('isolates project/platform settings, retains deployment fallback only before explicit selection, and never returns tokens', async () => {
    const { registry, source, variables, values } = fixture();
    expect(registry.status('1', 'xiaohongshu').source).toBe('deployment');
    expect(registry.status('2', 'xiaohongshu').source).toBe('none');
    expect(registry.allowed('1', 'xiaohongshu')[0]).toMatchObject({
      id: 'project-xiaohongshu-team',
      name: 'Configured',
    });
    expect(registry.allowed('1', 'xiaohongshu')[0].nameKey).toBeUndefined();
    const saved = await registry.save('1', 'xiaohongshu', {
      revision: 0,
      url: 'https://collector.example/',
      token,
    });
    expect(saved).toEqual({
      revision: 1,
      source: 'project',
      url: 'https://collector.example',
      hasToken: true,
    });
    expect(JSON.stringify(saved)).not.toContain(token);
    expect(JSON.parse(values.NOREACH_COLLECTOR_xiaohongshu_1)).toEqual({
      revision: 1,
      url: saved.url,
      token,
    });
    expect(registry.allowed('1', 'xiaohongshu')[0]).toMatchObject({
      id: 'project-xiaohongshu-1',
      nameKey: 'collectorConnection.projectSource',
      url: saved.url,
      token,
      platforms: ['xiaohongshu'],
      projectIds: ['1'],
    });
    expect(registry.allowed('1', 'youtube')[0].id).toBe(
      'project-xiaohongshu-team',
    );
    expect(registry.allowed('1', 'bilibili')).toEqual([]);
    expect(registry.allowed('2', 'xiaohongshu')).toEqual([]);
    expect(
      (await registry.save('1', 'xiaohongshu', { revision: 1, url: saved.url }))
        .revision,
    ).toBe(1);
    expect(variables.set).toHaveBeenCalledTimes(1);
    expect(source.resetCollector).toHaveBeenCalledExactlyOnceWith(
      '1',
      'project-xiaohongshu-1',
    );
    await expect(
      registry.save('1', 'xiaohongshu', { revision: 0, url: saved.url, token }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      registry.save('1', 'xiaohongshu', {
        revision: 1,
        url: 'https://different.example',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(registry.allowed('1', 'xiaohongshu')[0].url).toBe(saved.url);
    variables.cannotRead.mockReturnValue(true);
    expect(() => registry.allowed('1', 'xiaohongshu')).toThrow(
      'collectorConnection.unreadable',
    );
  });
  it('keeps simulated collectors independent of project credentials and rejects credential writes', async () => {
    const { registry, source, variables, values } = fixture(true);
    const deployed = registry.allowed('1', 'xiaohongshu');
    values.NOREACH_COLLECTOR_xiaohongshu_1 = JSON.stringify({
      revision: 1,
      url: 'https://previous-collector.example',
      token,
    });
    variables.cannotRead.mockReturnValue(true);
    expect(registry.status('1', 'xiaohongshu')).toEqual({
      source: 'mock',
      revision: 0,
      url: '',
      hasToken: false,
    });
    expect(registry.allowed('1', 'xiaohongshu')).toEqual(deployed);
    await expect(
      registry.save('1', 'xiaohongshu', {
        revision: 0,
        url: 'https://collector.example',
        token,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'collectorConnection.mockSource',
    });
    expect(variables.set).not.toHaveBeenCalled();
    expect(source.resetCollector).not.toHaveBeenCalled();
    expect(registry.allowed('1', 'xiaohongshu')).toEqual(deployed);
  });
  it('reserves synchronously against saves and reads, including background work that outlives its start call', async () => {
    const { registry, variables, source } = fixture();
    let finish!: () => void;
    variables.set.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = registry.save('1', 'xiaohongshu', {
      revision: 0,
      url: 'https://collector.example',
      token,
    });
    await expect(source.search('1')).rejects.toMatchObject({
      status: 409,
      message: 'collectorConnection.activeRun',
    });
    await expect(
      registry.save('1', 'xiaohongshu', {
        revision: 0,
        url: 'https://collector.example',
        token,
      }),
    ).rejects.toMatchObject({ status: 409 });
    finish();
    await pending;
    source.isCollectorBusy.mockReturnValue(true);
    await expect(
      registry.save('1', 'xiaohongshu', {
        revision: 0,
        url: 'https://collector.example',
        token,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rejects invalid addresses and credentials before persistence', async () => {
    const { registry, variables } = fixture();
    for (const url of [
      'http://remote.example',
      'https://user:pass@example.com',
      'https://example.com?q=x',
      'https://example.com#hash',
    ]) {
      await expect(
        registry.save('1', 'xiaohongshu', { revision: 0, url, token }),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      registry.save('1', 'xiaohongshu', {
        revision: 0,
        url: 'https://example.com',
        token: 'short',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(variables.set).not.toHaveBeenCalled();
  });
});
