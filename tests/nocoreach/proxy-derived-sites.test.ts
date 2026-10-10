// @vitest-environment node
import { promises as dns } from 'node:dns';
import { get } from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { TaskService } from '../../server/nocoreach/execution/service';
import { projectWork, type Work } from '../../server/nocoreach/execution/model';
import { SiteContent } from '../../server/nocoreach/site-content';
import { afterEach, expect, it, vi } from 'vitest';
import { KnowledgeSuggest } from '../../server/nocoreach/knowledge-suggest';
import { KeywordSuggest } from '../../server/nocoreach/keyword-suggest';
import { MemoryUpdate } from '../../server/nocoreach/memory-update';
import { OutboundNetwork } from '../../server/nocoreach/outbound-network';
import { ProxyProfiles } from '../../server/nocoreach/proxy-profiles';

vi.mock('node:https', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:https')>()),
  get: vi.fn(() => {
    throw new Error('Unexpected direct request');
  }),
}));

afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const values: Record<string, string> = {};
  const profiles = new ProxyProfiles({
    all: () => values,
    set: async (key, value) => {
      values[key] = value!;
    },
  });
  const exits = await Promise.all(
    ['1', '2'].map(async (id) => {
      const profile = await profiles.save({
        name: id,
        url: `http://proxy${id}.example:7890`,
      });
      await profiles.select(id, { connection: 'site', profileId: profile.id });
      return profile;
    }),
  );
  const network = new OutboundNetwork(profiles);
  vi.spyOn(dns, 'lookup').mockResolvedValue([
    { address: '93.184.216.34', family: 4 },
  ]);
  const direct = vi.mocked(get).mockClear();
  const send = vi.spyOn(network, 'send').mockImplementation(async () => {
    await Promise.resolve();
    return new Response(
      '<title>Product</title><p>Public product information</p><a href="/about">About</a>',
      { headers: { 'content-type': 'text/html' } },
    );
  });
  return { network, profiles, exits, send, direct };
}

it('reads knowledge links through the project site profile', async () => {
  const { network, exits, send, direct } = await fixture();
  const service = new KnowledgeSuggest({
    network,
    projects: { row: async () => null },
  });
  vi.spyOn(service, 'memory').mockResolvedValue({});
  vi.spyOn(service, 'saveDraft').mockResolvedValue('draft');
  const result = await service.suggest('1', { url: 'https://one.example/' });
  expect(result.kind).toBe('knowledge');
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]?.id).toBe(exits[0].id);
  expect(direct).not.toHaveBeenCalled();
});

it('uses the site profile for keyword homepage fallback, independently for concurrent projects', async () => {
  const { network, exits, send, direct } = await fixture();
  const service = new KeywordSuggest({
    network,
    projects: {
      get: async (id: string) => ({ domains: [`project${id}.example`] }),
    },
    siteContent: { state: async () => null },
    sync: { snapshots: async () => [] },
  });
  const results = await Promise.all(['1', '2'].map((id) => service.inputs(id)));
  expect(
    results.every((result) => result.home.includes('Public product')),
  ).toBe(true);
  expect(send).toHaveBeenCalledTimes(2);
  for (const [profile, url] of send.mock.calls) {
    const id = new URL(url).hostname === 'project1.example' ? 0 : 1;
    expect(profile?.id).toBe(exits[id].id);
  }
  expect(direct).not.toHaveBeenCalled();
});

function memoryService(network: OutboundNetwork) {
  const service = new MemoryUpdate({
    network,
    projectIds: async () => ['1', '2'],
    taskExecution: { provider: { complete: async () => '{"memory":[]}' } },
    siteContent: { state: async () => null },
  });
  vi.spyOn(service, 'state').mockResolvedValue({
    suggestions: [],
    dismissed: [],
  });
  vi.spyOn(service, 'project').mockImplementation(async (id: string) => ({
    domains: [`project${id}.example`],
  }));
  vi.spyOn(service, 'comments').mockResolvedValue([]);
  vi.spyOn(service, 'results').mockResolvedValue([]);
  vi.spyOn(service, 'items').mockResolvedValue([]);
  vi.spyOn(service, 'mutate').mockImplementation(
    async (_id: string, update: (state: object) => unknown) =>
      update({ suggestions: [], dismissed: [] }),
  );
  return service;
}

it('binds hourly memory checks to each project and routes homepage and discovered pages through its site profile', async () => {
  const { network, exits, send, direct } = await fixture();
  const service = memoryService(network);
  await service.tick();
  expect(send).toHaveBeenCalledTimes(4);
  for (const [profile, url] of send.mock.calls) {
    const id = new URL(url).hostname === 'project1.example' ? 0 : 1;
    expect(profile?.id).toBe(exits[id].id);
  }
  expect(service.mutate).toHaveBeenCalledTimes(2);
  expect(direct).not.toHaveBeenCalled();
});

it('preserves project scope for fire-and-forget memory drafts started outside an HTTP request', async () => {
  const { network, exits, send, direct } = await fixture();
  const service = memoryService(network);
  expect(service.start('2', 'draft')).toBe(true);
  await vi.waitFor(() => expect(service.running.size).toBe(0));
  expect(send).toHaveBeenCalledTimes(2);
  expect(
    send.mock.calls.every(([profile]) => profile?.id === exits[1].id),
  ).toBe(true);
  expect(direct).not.toHaveBeenCalled();
});

it('retains explicitly injected readers instead of replacing them with proxy transport', async () => {
  const { network, send } = await fixture();
  const read = vi.fn(async () => ({
    text: 'Custom content',
    type: 'text/plain',
  }));
  const knowledge = new KnowledgeSuggest(
    { network, projects: { row: async () => null } },
    read,
  );
  vi.spyOn(knowledge, 'memory').mockResolvedValue({});
  vi.spyOn(knowledge, 'saveDraft').mockResolvedValue('draft');
  await knowledge.suggest('1', { url: 'https://one.example/' });
  const keywords = new KeywordSuggest(
    { network, projects: { get: async () => ({ domains: ['one.example'] }) } },
    read,
  );
  await keywords.inputs('1');
  const memory = new MemoryUpdate({ network }, read);
  await memory.website('1', { domains: ['one.example'] });
  expect(read).toHaveBeenCalledTimes(3);
  expect(send).not.toHaveBeenCalled();
});

it('verifies releases outside HTTP scope using each task project, including direct connections', async () => {
  const { network, exits, send, direct } = await fixture();
  direct.mockImplementationOnce((_url, _options, callback) => {
    const req = new EventEmitter();
    const res = Object.assign(
      Readable.from([Buffer.from('Public product information')]),
      {
        statusCode: 200,
        headers: { 'content-type': 'text/html' },
      },
    );
    queueMicrotask(() => {
      (callback as (res: unknown) => void)(res);
      res.on('end', () => req.emit('close'));
    });
    return req as ReturnType<typeof get>;
  });
  const tasks = ['1', '2', '3'].map((projectId) => ({
    id: projectId,
    projectId,
    evidence: {
      work: {
        ...projectWork({}),
        stage: 'flow',
        stageIndex: 0,
        flow: {
          id: 'release',
          name: 'Release',
          version: 1,
          stages: [
            { key: 'release', name: 'Release', kind: 'release' },
            { key: 'observe', name: 'Observe', kind: 'observe' },
          ],
        },
        release: {
          state: 'verifying',
          pages: [`https://project${projectId}.example/`],
          verifyText: 'Public product information',
        },
      },
    },
  }));
  const plugin = {
    network,
    siteContent: new SiteContent({ network }),
    db: {
      getRepository: () => ({
        find: async () => tasks,
        findOne: async ({
          filter,
        }: {
          filter: { id: string; projectId: string };
        }) => {
          const task = tasks.find(
            (t) => t.id === filter.id && t.projectId === filter.projectId,
          );
          return task && { toJSON: () => structuredClone(task) };
        },
        update: async ({
          filterByTk,
          values,
        }: {
          filterByTk: string;
          values: { evidence: { work: Work } };
        }) => {
          Object.assign(
            tasks.find((t) => t.id === filterByTk)!,
            values,
          );
        },
      }),
      sequelize: {
        query: async () => {},
        transaction: async (run: (tx: object) => unknown) => run({}),
      },
    },
  };
  await new TaskService(plugin).verifyReleases();
  expect(tasks.map((t) => t.evidence.work.release.state)).toEqual([
    'live',
    'live',
    'live',
  ]);
  expect(send.mock.calls.map(([profile]) => profile?.id)).toEqual(
    exits.map((p) => p.id),
  );
  expect(direct).toHaveBeenCalledTimes(1);
  expect(String(direct.mock.calls[0][0])).toBe('https://project3.example/');
  expect(() => network.selected('site')).toThrow('缺少项目范围');
});
