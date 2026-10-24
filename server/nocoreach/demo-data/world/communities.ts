import {
  DAY,
  HOUR,
  cursorPage,
  escapeHtml,
  integer,
  json,
  notFound,
  slice,
  textResponse,
  type Json,
} from './kit.js';
import { DISCORD, SLACK } from './script/chat.js';
import { FORUM } from './script/community.js';
import { HN_STORIES, X_POSTS } from './script/social.js';
import type { ChatChannel, ChatMessage, Topic } from './script/types.js';
import type { World } from './world.js';

const iso = (t: number) => new Date(t).toISOString();

// Discourse forum at community.<domain>.

function topicId(world: World, index: number): number {
  return 4000 + index * 7 + world.seeded.int(`topic:${index}`, 5);
}

function topicJson(world: World, topic: Topic, index: number): Json {
  const opened = world.now - topic.opened * DAY;
  const last = topic.posts.at(-1)!;
  const lastAt = Math.min(world.now - HOUR, opened + last.after * HOUR);
  return {
    id: topicId(world, index),
    title: world.text(topic.title),
    fancy_title: escapeHtml(world.text(topic.title)),
    slug: `topic-${topicId(world, index)}`,
    posts_count: topic.posts.length,
    reply_count: topic.posts.length - 1,
    views: topic.views,
    like_count: topic.likes,
    category_id: topic.category,
    created_at: iso(opened),
    last_posted_at: iso(lastAt),
    bumped_at: iso(lastAt),
    pinned: Boolean(topic.pinned),
    closed: Boolean(topic.closed),
    archived: false,
    visible: true,
    has_accepted_answer: topic.accepted !== undefined,
    tags: topic.tags,
    posters: [...new Set(topic.posts.map((p) => world.person(p.author)))].map(
      (username) => ({ username }),
    ),
  };
}

function postsJson(world: World, topic: Topic, index: number): Json[] {
  const opened = world.now - topic.opened * DAY;
  const id = topicId(world, index);
  return topic.posts.map((post, i) => {
    const created = Math.min(world.now - HOUR / 2, opened + post.after * HOUR);
    const raw = world.text(post.text);
    return {
      id: id * 100 + i + 1,
      post_number: i + 1,
      topic_id: id,
      username: world.person(post.author),
      created_at: iso(created),
      updated_at: iso(created),
      raw,
      cooked: `<p>${escapeHtml(raw)}</p>`,
      reply_count: i === 0 ? topic.posts.length - 1 : 0,
      like_count: post.likes ?? 0,
      accepted_answer: topic.accepted === i + 1,
    };
  });
}

export function community(world: World, u: URL): Response | undefined {
  if (!world.main || u.hostname !== `community.${world.project.domain}`)
    return undefined;
  const topics = FORUM.topics
    .map((topic, index) => ({ topic, index }))
    .sort(
      (a, b) =>
        Number(Boolean(b.topic.pinned)) - Number(Boolean(a.topic.pinned)) ||
        a.topic.opened - b.topic.opened,
    );
  if (u.pathname === '/about.json')
    return json({
      about: {
        title: world.text(FORUM.title),
        description: world.text(FORUM.description),
        stats: {
          topics_count: FORUM.topics.length,
          posts_count: FORUM.topics.reduce((n, t) => n + t.posts.length, 0),
          users_count: 3480,
          active_users_7_days: 212,
          active_users_30_days: 640,
        },
        admin_names: ['qiao-han'],
        moderator_names: [world.person('@devrel')],
      },
    });
  if (u.pathname === '/site.json')
    return json({
      categories: FORUM.categories.map(([id, name, slug]) => ({
        id,
        name: world.text(name),
        slug,
        topic_count: FORUM.topics.filter((t) => t.category === id).length,
      })),
    });
  if (u.pathname === '/latest.json') {
    const page = integer(u.searchParams.get('page'));
    const items = slice(topics, page * 30, 30);
    return json({
      users: [],
      topic_list: {
        can_create_topic: false,
        per_page: 30,
        topics: items.map(({ topic, index }) => topicJson(world, topic, index)),
        ...((page + 1) * 30 < topics.length
          ? { more_topics_url: `/latest.json?page=${page + 1}` }
          : {}),
      },
    });
  }
  const detail = u.pathname.match(
    /^\/t\/(?:[^/]+\/)?(\d+)(\.json|\/posts\.json|\/?)$/,
  );
  if (detail) {
    const found = topics.find(
      ({ index }) => topicId(world, index) === Number(detail[1]),
    );
    if (!found) return notFound();
    const posts = postsJson(world, found.topic, found.index);
    if (detail[2] === '/posts.json') {
      const wanted = u.searchParams.getAll('post_ids[]');
      return json({
        post_stream: {
          posts: posts.filter(
            (p) => !wanted.length || wanted.includes(String(p.id)),
          ),
        },
      });
    }
    if (detail[2] !== '.json')
      return textResponse(
        `<!doctype html><html><head><title>${escapeHtml(world.text(found.topic.title))}</title></head><body><h1>${escapeHtml(world.text(found.topic.title))}</h1>${posts.map((p) => `<article>${String(p.cooked)}</article>`).join('')}</body></html>`,
        'text/html; charset=utf-8',
      );
    return json({
      ...topicJson(world, found.topic, found.index),
      post_stream: {
        stream: posts.map((p) => p.id),
        posts: posts.slice(0, 20),
      },
    });
  }
  if (u.pathname === '/')
    return textResponse(
      `<!doctype html><html><head><title>${escapeHtml(world.text(FORUM.title))}</title></head><body><h1>${escapeHtml(world.text(FORUM.title))}</h1><p>${escapeHtml(world.text(FORUM.description))}</p></body></html>`,
      'text/html; charset=utf-8',
    );
  return notFound();
}

// Slack and Discord.

function slackChannels(world: World): Json[] {
  return SLACK.map((channel, i) => ({
    id: `C0${world.seeded.hash(`slack:${channel.name}`).slice(0, 9).toUpperCase()}`,
    name: channel.name,
    is_channel: true,
    is_member: true,
    is_archived: false,
    num_members: channel.members,
    created: Math.floor((world.now - (600 - i * 40) * DAY) / 1000),
  }));
}

const slackTs = (world: World, at: number, key: string): string =>
  `${Math.floor((world.now - at * HOUR) / 1000)}.${String(world.seeded.int(key, 999_999)).padStart(6, '0')}`;

function slackMessages(world: World, channel: ChatChannel): Json[] {
  return channel.messages
    .map((m, i) => ({
      type: 'message',
      user: world.person(m.author),
      ts: slackTs(world, m.at, `${channel.name}:${i}`),
      text: world.text(m.text),
      reply_count: m.replies?.length ?? 0,
      ...(m.replies?.length
        ? { thread_ts: slackTs(world, m.at, `${channel.name}:${i}`) }
        : {}),
    }))
    .sort((a, b) => Number(b.ts) - Number(a.ts));
}

export function slack(world: World, u: URL): Response | undefined {
  if (u.hostname !== 'slack.com' || !world.main) return undefined;
  const method = u.pathname.replace(/^\/api\//, '');
  const channels = slackChannels(world);
  if (method === 'auth.test')
    return json({
      ok: true,
      url: `https://${world.site.name.toLowerCase()}-partners.slack.com/`,
      team:
        world.lang === 'zh'
          ? `${world.site.name} 合作伙伴`
          : `${world.site.name} Partners`,
      user: 'nocoreach-bot',
      team_id: `T0${world.seeded.hash('slack-team').slice(0, 8).toUpperCase()}`,
      user_id: `U0${world.seeded.hash('slack-bot').slice(0, 8).toUpperCase()}`,
      bot_id: `B0${world.seeded.hash('slack-bot').slice(0, 8).toUpperCase()}`,
    });
  if (method === 'api.test') return json({ ok: true, args: {} });
  if (method === 'conversations.list') {
    const page = cursorPage(
      channels,
      u.searchParams.get('cursor'),
      u.searchParams.get('limit') ?? 200,
    );
    return json({
      ok: true,
      channels: page.items,
      response_metadata: { next_cursor: page.next },
    });
  }
  const id = u.searchParams.get('channel') ?? '';
  const index = channels.findIndex((c) => c.id === id);
  if (
    [
      'conversations.join',
      'conversations.history',
      'conversations.replies',
    ].includes(method) &&
    index < 0
  )
    return json({ ok: false, error: 'channel_not_found' });
  if (method === 'conversations.join')
    return json({ ok: true, channel: channels[index] });
  if (
    method === 'conversations.history' ||
    method === 'conversations.replies'
  ) {
    const channel = SLACK[index];
    let rows = slackMessages(world, channel);
    const oldest = Number(u.searchParams.get('oldest') ?? 0);
    if (method === 'conversations.history')
      rows = rows.filter((m) => Number(m.ts) >= oldest);
    else {
      const ts = u.searchParams.get('ts');
      const at = channel.messages.findIndex(
        (m, i) => slackTs(world, m.at, `${channel.name}:${i}`) === ts,
      );
      if (at < 0) return json({ ok: false, error: 'thread_not_found' });
      const root = channel.messages[at];
      rows = [
        rows.find((m) => m.ts === ts)!,
        ...(root.replies ?? []).map(([author, text], r) => ({
          type: 'message',
          user: world.person(author),
          thread_ts: ts,
          ts: (
            Number(ts) +
            (r + 1) * 1800 +
            world.seeded.int(`reply:${ts}:${r}`, 900)
          ).toFixed(6),
          text: world.text(text),
          reply_count: 0,
        })),
      ].filter((m) => Number(m.ts) * 1000 <= world.now);
    }
    const page = cursorPage(
      rows,
      u.searchParams.get('cursor'),
      u.searchParams.get('limit') ?? 200,
    );
    return json({
      ok: true,
      messages: page.items,
      has_more: Boolean(page.next),
      response_metadata: { next_cursor: page.next },
    });
  }
  return undefined;
}

const EPOCH = 1420070400000n;
const snowflake = (t: number, salt: number): string =>
  String(((BigInt(Math.floor(t)) - EPOCH) << 22n) | BigInt(salt % 4_194_304));

function guildId(world: World): string {
  return String(
    1_100_000_000_000_000_000n + BigInt(world.seeded.int('guild', 900_000_000)),
  );
}
function discordChannelId(world: World, name: string): string {
  return String(
    1_200_000_000_000_000_000n +
      BigInt(world.seeded.int(`dc:${name}`, 900_000_000)),
  );
}

type Thread = {
  id: string;
  parent: string;
  name: string;
  root: ChatMessage;
  key: string;
};
function threads(world: World): Thread[] {
  const out: Thread[] = [];
  for (const channel of DISCORD) {
    if (!channel.forum) continue;
    channel.messages.forEach((m, i) => {
      const at = world.now - m.at * HOUR;
      out.push({
        id: snowflake(
          at + 1000,
          world.seeded.int(`th:${channel.name}:${i}`, 4_000_000),
        ),
        parent: discordChannelId(world, channel.name),
        name: world.text(m.text).slice(0, 90),
        root: m,
        key: `${channel.name}:${i}`,
      });
    });
  }
  return out;
}

function discordMessages(world: World, channelId: string): Json[] {
  const channel = DISCORD.find(
    (c) => discordChannelId(world, c.name) === channelId,
  );
  if (channel) {
    // A forum channel holds only its threads; its own message list is empty.
    if (channel.forum) return [];
    return channel.messages.flatMap((m, i) => {
      const at = world.now - m.at * HOUR;
      const id = snowflake(
        at,
        world.seeded.int(`msg:${channel.name}:${i}`, 4_000_000),
      );
      const message = (
        key: string,
        when: number,
        author: string,
        content: string,
        reply?: string,
      ): Json => ({
        id: key,
        type: reply ? 19 : 0,
        content,
        timestamp: iso(when),
        channel_id: channelId,
        author: {
          id: String(world.seeded.id(`du:${author}`, 18)),
          username: world.person(author),
          bot: false,
        },
        ...(reply
          ? { message_reference: { message_id: reply, channel_id: channelId } }
          : {}),
      });
      // Replies in a text channel are messages that reference the question.
      return [
        message(id, at, m.author, world.text(m.text)),
        ...(m.replies ?? []).map(([author, text], r) => {
          const when = Math.min(world.now - 60_000, at + (r + 1) * 1.5 * HOUR);
          return message(
            snowflake(
              when,
              world.seeded.int(`rep:${channel.name}:${i}:${r}`, 4_000_000),
            ),
            when,
            author,
            world.text(text),
            id,
          );
        }),
      ];
    });
  }
  const thread = threads(world).find((t) => t.id === channelId);
  if (!thread) return [];
  const start = world.now - thread.root.at * HOUR;
  return [
    [thread.root.author, thread.root.text] as const,
    ...(thread.root.replies ?? []),
  ].map(([author, text], i) => {
    const at = Math.min(world.now - 60_000, start + i * 2 * HOUR);
    return {
      id: snowflake(
        at + i,
        world.seeded.int(`tm:${thread.key}:${i}`, 4_000_000),
      ),
      type: i ? 19 : 0,
      content: world.text(text),
      timestamp: iso(at),
      channel_id: thread.id,
      author: {
        id: String(world.seeded.id(`du:${author}`, 18)),
        username: world.person(author),
        bot: false,
      },
    };
  });
}

export function discord(world: World, u: URL): Response | undefined {
  if (u.hostname !== 'discord.com' || !world.main) return undefined;
  const p = u.pathname.replace(/^\/api\/v10/, '');
  const guild = guildId(world);
  if (p === '/users/@me')
    return json({
      id: String(world.seeded.id('discord-bot', 18)),
      username: 'NocoReach',
      bot: true,
    });
  if (p === '/users/@me/guilds')
    return json([
      {
        id: guild,
        name:
          world.lang === 'zh'
            ? `${world.site.name} 社区`
            : `${world.site.name} Community`,
        owner: false,
        permissions: '66560',
      },
    ]);
  if (p === `/guilds/${guild}/channels`)
    return json(
      DISCORD.map((channel, i) => ({
        id: discordChannelId(world, channel.name),
        name: channel.name,
        type: channel.forum ? 15 : 0,
        position: i,
        guild_id: guild,
      })),
    );
  if (p === '/gateway') return json({ url: 'wss://gateway.discord.gg' });
  const all = threads(world);
  if (p === `/guilds/${guild}/threads/active`) {
    const active = all.filter((t) => t.root.at < 24 * 14);
    return json({
      threads: active.map((t) => ({
        id: t.id,
        parent_id: t.parent,
        guild_id: guild,
        name: t.name,
        type: 11,
        message_count: t.root.replies?.length ?? 0,
        thread_metadata: {
          archived: false,
          archive_timestamp: iso(world.now - t.root.at * HOUR),
        },
      })),
      members: [],
      has_more: false,
    });
  }
  const channel = p.match(
    /^\/channels\/(\d+)\/(messages|threads\/archived\/public)$/,
  );
  if (!channel) return undefined;
  const [, id, kind] = channel;
  const known =
    DISCORD.some((c) => discordChannelId(world, c.name) === id) ||
    all.some((t) => t.id === id);
  if (!known) return json({ message: 'Unknown Channel', code: 10003 }, 404);
  if (kind === 'threads/archived/public') {
    const archived = all.filter((t) => t.parent === id && t.root.at >= 24 * 14);
    return json({
      threads: archived.map((t) => ({
        id: t.id,
        parent_id: t.parent,
        guild_id: guild,
        name: t.name,
        type: 11,
        message_count: t.root.replies?.length ?? 0,
        thread_metadata: {
          archived: true,
          archive_timestamp: iso(world.now - (t.root.at - 72) * HOUR),
        },
      })),
      members: [],
      has_more: false,
    });
  }
  let rows = discordMessages(world, id).sort((a, b) =>
    BigInt(String(b.id)) > BigInt(String(a.id)) ? 1 : -1,
  );
  const after = u.searchParams.get('after');
  const before = u.searchParams.get('before');
  if (after)
    rows = rows.filter((r) => BigInt(String(r.id)) > BigInt(after)).reverse();
  if (before) rows = rows.filter((r) => BigInt(String(r.id)) < BigInt(before));
  return json(slice(rows, 0, u.searchParams.get('limit') ?? 50, 50));
}

// X recent search: the last seven days.

function xPosts(world: World): Json[] {
  if (!world.main) return [];
  return X_POSTS.filter((post) => post.at < 24 * 7)
    .map((post, i) => {
      const at = world.now - post.at * HOUR;
      return {
        id: String(
          ((BigInt(Math.floor(at)) - 1288834974657n) << 22n) |
            BigInt(world.seeded.int(`x:${i}`, 4_000_000)),
        ),
        text: world.text(post.text),
        created_at: iso(at),
        author_id: String(world.seeded.id(`xu:${post.author}`, 12)),
        lang: world.lang,
        public_metrics: {
          like_count: post.likes,
          retweet_count: post.reposts,
          reply_count: post.replies,
          quote_count: post.quotes,
          impression_count: post.views,
          bookmark_count: Math.round(post.likes / 6),
        },
      };
    })
    .sort((a, b) => (BigInt(a.id) > BigInt(b.id) ? -1 : 1));
}

export function xApi(world: World, u: URL): Response | undefined {
  if (!['api.x.com', 'api.twitter.com'].includes(u.hostname)) return undefined;
  const posts = xPosts(world);
  if (u.pathname === '/2/tweets/counts/recent') {
    const data = [];
    for (let ago = 6; ago >= 0; ago--) {
      const start = Date.parse(
        new Date(world.now - ago * DAY).toISOString().slice(0, 10),
      );
      const listed = posts.filter(
        (p) =>
          Date.parse(String(p.created_at)) >= start &&
          Date.parse(String(p.created_at)) < start + DAY,
      ).length;
      data.push({
        start: iso(start),
        end: iso(start + DAY),
        tweet_count: listed * 6 + world.seeded.int(`xc:${ago}`, 14),
      });
    }
    return json({
      data,
      meta: { total_tweet_count: data.reduce((n, d) => n + d.tweet_count, 0) },
    });
  }
  if (u.pathname === '/2/tweets/search/recent') {
    const sinceId = u.searchParams.get('since_id');
    const startTime = u.searchParams.get('start_time');
    const rows = posts.filter(
      (p) =>
        (!sinceId || BigInt(String(p.id)) > BigInt(sinceId)) &&
        (!startTime || String(p.created_at) >= startTime),
    );
    const page = cursorPage(
      rows,
      u.searchParams.get('next_token'),
      u.searchParams.get('max_results') ?? 100,
    );
    const users = X_POSTS.map((p) => p.author);
    return json({
      data: page.items,
      includes: {
        users: [...new Set(users)].map((username) => ({
          id: String(world.seeded.id(`xu:${username}`, 12)),
          username,
          name: username,
        })),
      },
      meta: {
        result_count: page.items.length,
        ...(page.items.length
          ? { newest_id: page.items[0].id, oldest_id: page.items.at(-1)!.id }
          : {}),
        ...(page.next ? { next_token: page.next } : {}),
      },
    });
  }
  const detail = u.pathname.match(/^\/2\/tweets\/(\d+)$/);
  if (detail) {
    const row = posts.find((p) => p.id === detail[1]);
    return row
      ? json({ data: row })
      : json({ errors: [{ title: 'Not Found Error' }] }, 404);
  }
  return undefined;
}

// Hacker News through Algolia.

function hnRows(world: World): Json[] {
  if (!world.main) return [];
  const rows: Json[] = [];
  HN_STORIES.forEach((story, i) => {
    const storyId = 41_000_000 + world.seeded.int(`hn:${i}`, 900_000);
    const at = world.now - story.age * DAY;
    const url = story.url ?? world.origin + story.path;
    const title = world.text(story.title);
    rows.push({
      objectID: String(storyId),
      _tags: ['story', `author_${story.author}`, `story_${storyId}`],
      title,
      url,
      author: story.author,
      points: story.points,
      num_comments:
        story.comments.length * 7 + world.seeded.int(`hnc:${i}`, 12),
      story_id: storyId,
      created_at: iso(at),
      created_at_i: Math.floor(at / 1000),
    });
    story.comments.forEach(([author, hours, text], c) => {
      const when = Math.min(world.now - 60_000, at + hours * HOUR);
      rows.push({
        objectID: String(storyId + 1 + c),
        _tags: ['comment', `author_${author}`, `story_${storyId}`],
        title: null,
        story_title: title,
        story_url: url,
        story_id: storyId,
        parent_id: storyId,
        author,
        comment_text: `<p>${escapeHtml(world.text(text))}</p>`,
        points: null,
        created_at: iso(when),
        created_at_i: Math.floor(when / 1000),
      });
    });
  });
  return rows.sort((a, b) => Number(b.created_at_i) - Number(a.created_at_i));
}

export function hackernews(world: World, u: URL): Response | undefined {
  if (u.hostname !== 'hn.algolia.com') return undefined;
  if (['/api/v1/search_by_date', '/api/v1/search'].includes(u.pathname)) {
    const min = u.searchParams
      .get('numericFilters')
      ?.match(/created_at_i>=?(\d+)/)?.[1];
    const query = (u.searchParams.get('query') || '')
      .replaceAll('"', '')
      .toLowerCase();
    const tags = u.searchParams.get('tags') ?? '';
    const rows = hnRows(world).filter(
      (r) =>
        (!min || Number(r.created_at_i) > Number(min)) &&
        (!tags ||
          tags
            .split(',')
            .some((tag) =>
              (r._tags as string[]).includes(tag.replace(/[()]/g, '')),
            )) &&
        (!query ||
          query
            .split(/\s+/)
            .some((word) => JSON.stringify(r).toLowerCase().includes(word))),
    );
    const per = Math.max(1, integer(u.searchParams.get('hitsPerPage'), 20));
    const page = integer(u.searchParams.get('page'));
    return json({
      hits: slice(rows, page * per, per),
      page,
      nbHits: rows.length,
      nbPages: Math.ceil(rows.length / per),
      hitsPerPage: per,
      exhaustiveNbHits: true,
      query: u.searchParams.get('query') || '',
      processingTimeMS: 1,
    });
  }
  const item = u.pathname.match(/^\/api\/v1\/items\/(\d+)$/);
  if (item) {
    const rows = hnRows(world);
    const row = rows.find((r) => r.objectID === item[1]);
    if (!row) return notFound();
    return json({
      id: Number(row.objectID),
      title: row.title ?? row.story_title,
      url: row.url ?? null,
      author: row.author,
      created_at: row.created_at,
      points: row.points,
      type: (row._tags as string[])[0],
      text: row.comment_text ?? null,
      parent_id: row.parent_id ?? null,
      children: rows
        .filter((r) => r.parent_id === Number(item[1]))
        .map((r) => ({
          id: Number(r.objectID),
          created_at: r.created_at,
          author: r.author,
          type: 'comment',
          text: r.comment_text,
          children: [],
        })),
    });
  }
  return undefined;
}

export { slackChannels, discordChannelId, guildId, topicId };
