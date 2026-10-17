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
import { Skills } from '../../server/nocoreach/skills';
import { ProjectIcon } from '../../server/nocoreach/project-icon';

vi.mock('node:https', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:https')>()),
  get: vi.fn(() => {
    throw new Error('Unexpected direct request');
  }),
}));

afterEach(() => vi.restoreAllMocks());

async function fixture(cannotRead = () => false) {
  const values: Record<string, string> = {};
  const profiles = new ProxyProfiles({
    cannotRead,
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
  return { network, profiles, exits, send, direct, values };
}

it.each([
  ['decrypt', false],
  ['decrypt', true],
  ['parse', false],
  ['parse', true],
] as const)(
  'reports %s configuration errors during website discovery (after robots=%s)',
  async (kind, afterRobots) => {
    let unreadable = false;
    const { network, send, direct, values } = await fixture(() => unreadable);
    const corrupt = () => {
      if (kind === 'decrypt') unreadable = true;
      else values.NOREACH_PROXY_PROFILES = '{broken';
    };
    if (afterRobots)
      send.mockImplementationOnce(async () => {
        corrupt();
        return new Response('Sitemap: https://example.com/sitemap.xml');
      });
    else corrupt();
    const service = new SiteContent({ network });
    await expect(
      network.run('1', () => service.discover('https://example.com')),
    ).rejects.toMatchObject({
      status: 503,
      code: 'NR_PROXY_CONFIG_UNREADABLE',
      message:
        kind === 'decrypt'
          ? '代理配置无法解密，请恢复服务器加密密钥'
          : '代理配置无法读取，请联系管理员',
    });
    expect(send).toHaveBeenCalledTimes(afterRobots ? 1 : 0);
    expect(direct).not.toHaveBeenCalled();
  },
);

function knowledgeService(network: OutboundNetwork) {
  const skills = new Skills({});
  const service = new KnowledgeSuggest({
    db: { access: { requireFor: vi.fn(async () => {}) } },
    network,
    skills,
    projects: { row: async () => null },
  });
  vi.spyOn(service, 'memory').mockResolvedValue({});
  vi.spyOn(service, 'saveDraft').mockResolvedValue('draft');
  return { service, skills };
}

it('loads each project icon through its site proxy, caches it and never falls back on failure', async () => {
  const { network, exits, send, direct } = await fixture();
  const saved = new Map<string, object>();
  const service = new ProjectIcon({
    network,
    project: async (id: string) => ({ domains: [`project${id}.example`] }),
  });
  vi.spyOn(service, 'saved').mockImplementation(async (id: string) =>
    saved.get(id),
  );
  vi.spyOn(service, 'save').mockImplementation(
    async (id: string, value: object) => {
      saved.set(id, value);
      return value;
    },
  );
  send.mockImplementation(async (_profile, url) =>
    new URL(url).pathname === '/'
      ? new Response('<link rel="icon" href="/favicon.png">', {
          headers: { 'content-type': 'text/html' },
        })
      : new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'image/png' },
        }),
  );
  for (const id of ['1', '2']) {
    expect(await service.get(id)).toMatchObject({
      dataUrl: 'data:image/png;base64,AQID',
    });
    expect(send.mock.calls.at(-1)?.[0]?.id).toBe(exits[Number(id) - 1].id);
  }
  expect(send).toHaveBeenCalledTimes(4);
  await service.get('1');
  expect(send).toHaveBeenCalledTimes(4);
  saved.delete('1');
  send.mockRejectedValue(new Error('Proxy unavailable'));
  expect(await service.get('1')).toMatchObject({ dataUrl: null });
  expect(direct).not.toHaveBeenCalled();
});

it('reads knowledge links, including the Skill probe, through the project site profile', async () => {
  const { network, exits, send, direct } = await fixture();
  const { service } = knowledgeService(network);
  const result = await service.suggest('1', { url: 'https://one.example/' });
  expect(result.kind).toBe('knowledge');
  expect(send).toHaveBeenCalledTimes(2);
  expect(
    send.mock.calls.every(([profile]) => profile?.id === exits[0].id),
  ).toBe(true);
  expect(direct).not.toHaveBeenCalled();
});

const skillText = (name: string) =>
  `---\nname: ${name}\ndescription: Test Skill\n---\nInstructions`;

it('previews and confirms Skill links with isolated project profiles on a shared Skills service', async () => {
  const { network, exits, send, direct } = await fixture();
  const { service, skills } = knowledgeService(network);
  const defaultReader = skills.read;
  send.mockImplementation(async () => {
    await Promise.resolve();
    return new Response(skillText('linked-skill'), {
      headers: { 'content-type': 'text/plain' },
    });
  });
  const add = vi
    .spyOn(skills, 'add')
    .mockImplementation(async (value) => ({ skill: value }));
  await Promise.all(
    ['1', '2'].map(async (id) => {
      const url = `https://project${id}.example/SKILL.md`;
      expect(await service.suggest(id, { url })).toMatchObject({
        kind: 'skill',
        skill: { name: 'linked-skill' },
      });
      expect(
        await service.confirm(id, { kind: 'skill', link: url }, 'actor'),
      ).toMatchObject({ skill: { skill: { name: 'linked-skill' } } });
    }),
  );
  expect(send).toHaveBeenCalledTimes(4);
  for (const [profile, url] of send.mock.calls) {
    const id = new URL(url).hostname === 'project1.example' ? 0 : 1;
    expect(profile?.id).toBe(exits[id].id);
  }
  expect(add).toHaveBeenCalledTimes(2);
  expect(skills.read).toBe(defaultReader);
  expect(direct).not.toHaveBeenCalled();
});

it('uses the project site profile for GitHub Skill discovery and selected imports', async () => {
  const { network, exits, send, direct } = await fixture();
  const { service, skills } = knowledgeService(network);
  vi.spyOn(skills, 'library').mockResolvedValue({ skills: [] });
  const add = vi
    .spyOn(skills, 'add')
    .mockImplementation(async (value) => ({ skill: value }));
  send.mockImplementation(async (_profile, url) => {
    const path = new URL(url).pathname;
    if (path === '/repos/acme/skills')
      return Response.json({ default_branch: 'main' });
    if (path === '/repos/acme/skills/git/trees/main')
      return Response.json({
        tree: ['one/SKILL.md', 'one/ref.md', 'two/SKILL.md'].map((path) => ({
          path,
          type: 'blob',
          size: 100,
        })),
      });
    return new Response(
      path.endsWith('ref.md')
        ? 'Reference'
        : skillText(path.includes('/one/') ? 'one' : 'two'),
    );
  });
  const link = 'https://github.com/acme/skills';
  expect(await service.suggest('2', { url: link })).toMatchObject({
    kind: 'skills',
    choices: [{ name: 'one' }, { name: 'two' }],
  });
  expect(
    await service.confirm(
      '2',
      { kind: 'skills', link, paths: ['one'] },
      'actor',
    ),
  ).toEqual({ skill: { imported: ['one'], skipped: [] } });
  expect(add).toHaveBeenCalledWith(
    expect.objectContaining({ files: [{ path: 'ref.md', text: 'Reference' }] }),
    'actor',
  );
  expect(send).toHaveBeenCalledTimes(8);
  expect(
    send.mock.calls.every(([profile]) => profile?.id === exits[1].id),
  ).toBe(true);
  expect(direct).not.toHaveBeenCalled();
});

it('reads Skills page links through the project GitHub profile, or the site profile for other hosts', async () => {
  const { network, profiles, exits, send, direct } = await fixture();
  const github = await profiles.save({
    name: 'github',
    url: 'http://proxy-github.example:7890',
  });
  await profiles.select('1', { connection: 'github', profileId: github.id });
  const skills = new Skills({ network });
  const defaultReader = skills.read;
  vi.spyOn(skills, 'library').mockResolvedValue({ skills: [] });
  const add = vi
    .spyOn(skills, 'add')
    .mockImplementation(async (value) => ({ skill: value }));
  send.mockImplementation(async (_profile, url) => {
    const path = new URL(url).pathname;
    if (path === '/repos/acme/skills')
      return Response.json({ default_branch: 'main' });
    if (path === '/repos/acme/skills/git/trees/main')
      return Response.json({
        tree: ['one/SKILL.md', 'two/SKILL.md'].map((path) => ({
          path,
          type: 'blob',
          size: 100,
        })),
      });
    return new Response(skillText(path.includes('/two/') ? 'two' : 'one'));
  });
  const link = 'https://github.com/acme/skills';
  expect(await skills.readProjectLink('1', { url: link })).toMatchObject({
    choices: [{ name: 'one' }, { name: 'two' }],
  });
  expect(
    await skills.importProjectLink('1', { url: link, paths: ['two'] }, 'actor'),
  ).toEqual({ imported: ['two'], skipped: [] });
  expect(add).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'two' }),
    'actor',
  );
  expect(send).toHaveBeenCalledTimes(7);
  expect(send.mock.calls.every(([profile]) => profile?.id === github.id)).toBe(
    true,
  );
  send.mockClear();
  expect(
    await skills.readProjectLink('2', {
      url: 'https://project2.example/SKILL.md',
    }),
  ).toMatchObject({ name: 'one' });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]?.id).toBe(exits[1].id);
  expect(skills.read).toBe(defaultReader);
  expect(direct).not.toHaveBeenCalled();
});

it('reads Skills page links through the default proxy when the project chose nothing for GitHub', async () => {
  const { network, profiles, send, direct } = await fixture();
  const fallback = (
    await profiles.saveNetwork({ url: 'http://proxy-default.example:7890' })
  ).proxy!;
  const skills = new Skills({ network });
  const url = 'https://raw.githubusercontent.com/acme/skills/main/one/SKILL.md';
  send.mockImplementation(async (_profile, target) =>
    new URL(target).pathname === '/repos/acme/skills/git/trees/main'
      ? Response.json({
          tree: [{ path: 'one/SKILL.md', type: 'blob', size: 100 }],
        })
      : new Response(skillText('one')),
  );
  expect(await skills.readProjectLink('1', { url })).toMatchObject({
    name: 'one',
  });
  expect(send.mock.calls.length).toBeGreaterThan(0);
  expect(
    send.mock.calls.every(([profile]) => profile?.id === fallback.id),
  ).toBe(true);
  expect(direct).not.toHaveBeenCalled();
});

it('does not fall back to direct Skill or knowledge reads when the proxy fails', async () => {
  const { network, send, direct } = await fixture();
  const { service } = knowledgeService(network);
  send.mockRejectedValue(new Error('Proxy unavailable'));
  await expect(
    service.suggest('1', { url: 'https://one.example/' }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    service.confirm(
      '1',
      { kind: 'skill', link: 'https://one.example/SKILL.md' },
      'actor',
    ),
  ).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(3);
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
