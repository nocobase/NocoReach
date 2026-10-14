// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  fixtureCatalog,
  fixtureResponse,
} from '../../app-plugins/nocoreach-mock/server/fixtures';
import type { MockRunContext } from '../../app-plugins/nocoreach-mock/server/types';
import {
  createMockBilibiliAdapter,
  createMockXiaohongshuAdapter,
  createMockYouTubeProvider,
} from '../../server/nocoreach/mock-collectors';
import { mockBrowserCollectorConfig } from '../../app-plugins/nocoreach-mock/server/collectors';

const context = (overrides: Partial<MockRunContext> = {}): MockRunContext => ({
  projectId: '71',
  project: { name: 'Supabase', domain: 'supabase.com' },
  seed: 'all-targets',
  clock: '2026-10-14T00:00:00.000Z',
  scenario: 'normal',
  revision: 1,
  runId: 'all-targets-test',
  ...overrides,
});
const request = (url: string, c = context(), init: RequestInit = {}) =>
  fixtureResponse(url, init, c);
const seo = (operation: string, body: object, c = context()) =>
  request(`https://api.dataforseo.com/v3/${operation}`, c, {
    method: 'POST',
    body: JSON.stringify([body]),
  });

describe('all connector targets use raw synthetic protocols', () => {
  it.each([
    [
      'npm',
      'https://registry.npmjs.org/%40supabase%2Fsupabase-js/latest',
      '@supabase/supabase-js',
    ],
    ['PyPI', 'https://pypi.org/pypi/supabase/json', 'supabase'],
    [
      'Docker',
      'https://hub.docker.com/v2/repositories/supabase/postgres/',
      'postgres',
    ],
  ])(
    'accepts a configured project and requested %s package identity',
    async (_registry, url, name) => {
      const response = await request(url);
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.info?.name ?? payload.name).toBe(name);
      expect(JSON.stringify(payload)).toContain('Supabase');
      expect(JSON.stringify(payload)).not.toContain('nocobloom');
      const repeat = await (await request(url)).json();
      expect(repeat).toEqual(payload);
    },
  );
  it('respects requested npm dates and partitions different package statistics', async () => {
    const a = await (
      await request(
        'https://api.npmjs.org/downloads/range/2026-10-01:2026-10-03/%40supabase%2Fsupabase-js',
      )
    ).json();
    const b = await (
      await request(
        'https://api.npmjs.org/downloads/range/2026-10-01:2026-10-03/%40atlas%2Fsdk',
      )
    ).json();
    expect(a.downloads.map((row: { day: string }) => row.day)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
    expect(a.package).toBe('@supabase/supabase-js');
    expect(a.downloads).not.toEqual(b.downloads);
    expect(
      (
        await (
          await request('https://pypistats.org/api/packages/supabase/overall')
        ).json()
      ).data,
    ).toHaveLength(180);
  });
  it('keeps registry endpoint and package-name validation instead of a catch-all success', async () => {
    for (const url of [
      'https://pypi.org/pypi/not%20valid/json',
      'https://registry.npmjs.org/%40supabase%2Fsupabase-js/delete',
      // Tags are served since 2026-10-14 (下载量 reads them); webhooks are not.
      'https://hub.docker.com/v2/repositories/supabase/postgres/webhooks',
    ])
      await expect(request(url)).rejects.toMatchObject({ status: 501 });
    await expect(
      request(
        'https://pypi.org/pypi/supabase/json',
        context({ project: undefined }),
      ),
    ).rejects.toMatchObject({ status: 501 });
    await expect(
      request('https://registry.npmjs.org/supabase/latest', context(), {
        method: 'DELETE',
      }),
    ).rejects.toMatchObject({ status: 501 });
  });
  it('serves arbitrary valid forum targets only in the community route, with matching list/detail IDs', async () => {
    const c = context({ connection: 'community' });
    const a = await (
      await request('https://forum.vendor.example/latest.json', c)
    ).json();
    const b = await (
      await request('https://other-forum.example/latest.json', c)
    ).json();
    expect(a.topic_list.topics.length).toBeGreaterThan(0);
    expect(a.topic_list.topics[0].id).not.toBe(b.topic_list.topics[0].id);
    const id = a.topic_list.topics[0].id;
    const detail = await (
      await request(`https://forum.vendor.example/t/${id}.json`, c)
    ).json();
    expect(detail.id).toBe(id);
    expect(detail.post_stream.posts[0].cooked).toContain('Supabase');
    expect(detail.post_stream.posts[0].cooked).toContain(
      'https://supabase.com/',
    );
    await expect(
      request(
        'https://forum.vendor.example/latest.json',
        context({ connection: 'site' }),
      ),
    ).rejects.toMatchObject({ status: 501 });
  });
  it('keeps the default community catalog and legacy HN details internally consistent', async () => {
    const c = context({ connection: 'community' });
    const catalog = fixtureCatalog(c);
    const list = await (
      await request('https://community.supabase.com/latest.json', c)
    ).json();
    expect(catalog.communityTopicIds).toEqual(
      list.topic_list.topics.map((topic: { id: number }) => topic.id),
    );
    const found = await (
      await request(
        'https://hn.algolia.com/api/v1/search_by_date?query=NocoBloom',
        context(),
      )
    ).json();
    const story = found.hits.find((hit: { _tags: string[] }) =>
      hit._tags.includes('story'),
    );
    const detail = await (
      await request(`https://hn.algolia.com/api/v1/items/${story.objectID}`)
    ).json();
    expect(detail.title).toBe(story.title);
    expect(detail.url).toBe(story.url);
    const current = await (
      await request(
        'https://hn.algolia.com/api/v1/search_by_date?query=Supabase',
      )
    ).json();
    expect(
      current.hits.some(
        (hit: { objectID: string }) => hit.objectID === story.objectID,
      ),
    ).toBe(false);
  });
  it('generates competitor site responses without borrowing the main project identity', async () => {
    const c = context({ connection: 'competitors' });
    const home = await (await request('https://rival.example/', c)).text();
    const sitemap = await (
      await request('https://rival.example/sitemap-pages.xml', c)
    ).text();
    expect(home).toContain('rival.example');
    expect(home).not.toContain('Supabase');
    expect(sitemap).toContain('https://rival.example/');
    await expect(
      request('https://rival.example/', context({ connection: 'site' })),
    ).rejects.toMatchObject({ status: 501 });
  });
  it('uses requested keywords and current project citations for SEO and AI search', async () => {
    const keywords = await (
      await seo('dataforseo_labs/google/related_keywords/live', {
        keyword: 'Supabase database',
        limit: 10,
      })
    ).json();
    expect(keywords.tasks[0].result[0].items[0].keyword_data.keyword).toContain(
      'Supabase database',
    );
    const ai = await (
      await seo('ai_optimization/chat_gpt/llm_responses/live', {
        user_prompt: 'How does Supabase help teams?',
      })
    ).json();
    expect(JSON.stringify(ai)).toContain('https://supabase.com/docs/');
    expect(JSON.stringify(ai)).not.toContain('NocoBloom');
    const reddit = await (
      await seo('serp/google/organic/live/advanced', {
        keyword: 'site:reddit.com Supabase',
      })
    ).json();
    expect(reddit.tasks[0].result[0].items[0].title).toContain('Supabase');
  });
  it('keeps raw and Contents API repository files consistent and project-specific', async () => {
    for (const file of ['README.md', 'SKILL.md']) {
      const encoded = await (
        await request(
          `https://api.github.com/repos/supabase/supabase/contents/${file}`,
        )
      ).json();
      const raw = await (
        await request(
          `https://raw.githubusercontent.com/supabase/supabase/main/${file}`,
        )
      ).text();
      expect(Buffer.from(encoded.content, 'base64').toString()).toBe(raw);
      expect(raw).toContain('Supabase');
      expect(raw).not.toContain('NocoBloom');
    }
  });
  it('makes GitHub history usable in the recent report window without changing the legacy calendar', async () => {
    const history = await (
      await request(
        'https://api.github.com/repos/supabase/supabase/stargazers/history',
      )
    ).json();
    expect(history[0].week * 1000).toBeGreaterThan(
      Date.parse('2026-10-07T00:00:00Z'),
    );
    const legacy = await (
      await request(
        'https://api.github.com/repos/nocobloom/nocobloom/stargazers/history',
        context({ project: undefined }),
      )
    ).json();
    expect(legacy[0].week * 1000).toBeLessThan(
      Date.parse('2026-09-01T00:00:00Z'),
    );
  });
  it('personalizes Slack/Discord and supports the messages of discovered forum threads', async () => {
    const slack = await (
      await request('https://slack.com/api/auth.test')
    ).json();
    expect(slack.team).toContain('Supabase');
    expect(slack.url).toContain('supabase');
    const guilds = await (
      await request('https://discord.com/api/v10/users/@me/guilds')
    ).json();
    expect(guilds[0].name).toContain('Supabase');
    const threads = await (
      await request(
        `https://discord.com/api/v10/guilds/${guilds[0].id}/threads/active`,
      )
    ).json();
    expect(threads.threads.length).toBeGreaterThan(0);
    const messages = await (
      await request(
        `https://discord.com/api/v10/channels/${threads.threads[0].id}/messages`,
      )
    ).json();
    expect(messages.length).toBeGreaterThan(0);
    expect(JSON.stringify(messages)).toContain('Supabase');
  });
  it('isolates all three media catalogs and normalizes supported user-supplied video IDs', async () => {
    const c = context();
    const cfg = mockBrowserCollectorConfig(c.projectId);
    const req = {
      projectId: c.projectId,
      requestId: 'b7d20cab-05de-4f45-b4ba-7c60379a79b0',
    };
    const bili = createMockBilibiliAdapter(c),
      xhs = createMockXiaohongshuAdapter(c),
      youtube = createMockYouTubeProvider(c);
    const videos = await bili.search(cfg, { ...req, query: 'Supabase' });
    expect(videos.items[0].title).toContain('Supabase');
    expect(
      (await bili.video(cfg, { ...req, bvid: 'BV1xx411c7mD' })).items[0].bvid,
    ).toBe('BV1xx411c7mD');
    const notes = await xhs.search(cfg, { ...req, query: 'Supabase' });
    expect(notes.notes[0].title).toContain('Supabase');
    const signal = new AbortController().signal;
    const yt = await youtube.video('Supabase001', signal);
    expect(yt.title).toContain('Supabase');
    expect(yt.transcript.text).toContain('Supabase');
    const other = context({
      projectId: '72',
      project: { name: 'Atlas', domain: 'atlas.example' },
    });
    const otherIds = await createMockYouTubeProvider(other).search(
      'Atlas',
      signal,
    );
    const ids = await youtube.search('Supabase', signal);
    expect(ids.some((id) => otherIds.includes(id))).toBe(false);
    expect(await youtube.search('Supabase', signal)).toEqual(ids);
    await expect(youtube.video('not-a-valid-id', signal)).rejects.toBeDefined();
  });
});
