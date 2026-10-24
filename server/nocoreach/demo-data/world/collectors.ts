import { DAY, body, json, text } from './kit.js';
import { BILIBILI, XIAOHONGSHU, YOUTUBE, type Media } from './script/media.js';
import { worldFor, type World, type WorldProject } from './world.js';

/** The browser collector a demo project is connected to; it answers for Xiaohongshu, Bilibili and YouTube. */
export const collectorUrl = (domain: string): string =>
  `https://collector.${domain}`;
export const COLLECTOR_TOKEN = 'demo-only-collector-token-never-live-000000';

const iso = (t: number) => new Date(t).toISOString();

function published(world: World, item: Media, index: number): number {
  const at =
    world.now -
    item.age * DAY -
    (3 + world.seeded.int(`pub:${index}`, 9)) * 3_600_000;
  return at - (at % 60_000);
}

/** A media item's counts keep growing a little each day after it was published, so later reads see change. */
function grown(world: World, value: number, item: Media): number {
  const days = Math.max(1, item.age);
  return Math.round(
    value *
      (1 - 0.35 / (1 + days / 7)) *
      world.seeded.jitter(`media:${value}:${days}`, 0.03),
  );
}

const bvid = (world: World, index: number) =>
  `BV1${world.seeded
    .hash(`bv:${index}`)
    .replace(/[^0-9a-zA-Z]/g, '')
    .slice(0, 9)}`;
const youtubeId = (world: World, index: number) =>
  Buffer.from(world.seeded.hash(`yt:${index}`), 'hex')
    .toString('base64url')
    .slice(0, 11);
const noteId = (world: World, index: number) =>
  world.seeded.hash(`xhs:${index}`).slice(0, 24);

/** Links to the videos searches do not reach, which the demo follows by link. */
export function followedVideos(project: WorldProject): string[] {
  const world = worldFor(project, Date.now());
  return YOUTUBE.slice(5, 10).map(
    (_, i) => `https://www.youtube.com/watch?v=${youtubeId(world, i + 5)}`,
  );
}

/** Answers the browser collector protocol (v1): health, search and video for the three media platforms. */
export function collector(
  world: World,
  u: URL,
  init: RequestInit,
): Response | undefined {
  if (`${u.protocol}//${u.host}` !== collectorUrl(world.project.domain))
    return undefined;
  if (!world.main) return json({ error: 'not configured' }, 404);
  const auth = new Headers(init.headers).get('authorization');
  if (auth !== `Bearer ${COLLECTOR_TOKEN}`)
    return json({ error: 'unauthorized' }, 401);
  const b = body(init);
  const kind = u.pathname.slice(1);
  const platform = text(b.platform);
  const envelope = {
    protocolVersion: 1,
    platform,
    projectId: text(b.projectId),
    requestId: b.requestId,
    ok: true,
    kind,
  };
  if (
    b.protocolVersion !== 1 ||
    !['xiaohongshu', 'bilibili', 'youtube'].includes(platform)
  )
    return json({ ...envelope, ok: false, errorCode: 'invalid_input' });
  const collectedAt = iso(world.now);
  if (kind === 'health') return json({ ...envelope, toolInstalled: true });
  const query = text(b.query).toLowerCase();
  const pick = (list: Media[]) =>
    list
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const title = world.text(item.title).toLowerCase();
        // Searching the product name finds everything about it; other terms match the titles.
        return (
          !query ||
          query.includes('nocobase') ||
          query.split(/\s+/).some((w) => w.length > 1 && title.includes(w))
        );
      });
  if (platform === 'xiaohongshu' && kind === 'search') {
    const found = pick(XIAOHONGSHU).slice(0, 20);
    if (!found.length)
      return json({ ...envelope, ok: false, errorCode: 'no_results' });
    return json({
      ...envelope,
      collectedAt,
      items: found.map(({ item, index }) => {
        const likes = grown(world, item.likes, item);
        return {
          title: world.text(item.title),
          url: `https://www.xiaohongshu.com/explore/${noteId(world, index)}?xsec_source=pc_search&xsec_token=demo${index}`,
          // The site shows large counts rounded, as the collector reads them.
          likes:
            likes >= 10_000
              ? `${(likes / 10_000).toFixed(1)}万`
              : String(likes),
          published_at: iso(published(world, item, index)).slice(0, 10),
        };
      }),
    });
  }
  if (platform === 'bilibili') {
    const meta = (
      item: Media,
      index: number,
      completeness: 'search_summary' | 'video_metadata',
    ) => ({
      bvid: bvid(world, index),
      title: world.text(item.title),
      views: grown(world, item.views, item),
      likes: grown(world, item.likes, item),
      comments: grown(world, item.comments, item),
      publishedAt: iso(published(world, item, index)),
      publishedAtPrecision: 'minute',
      completeness,
    });
    if (kind === 'search') {
      const found = pick(BILIBILI).slice(0, 20);
      if (!found.length)
        return json({ ...envelope, ok: false, errorCode: 'no_results' });
      return json({
        ...envelope,
        collectedAt,
        items: found.map(({ item, index }) =>
          meta(item, index, 'search_summary'),
        ),
      });
    }
    if (kind === 'video') {
      const index = BILIBILI.findIndex(
        (_, i) => bvid(world, i) === text(b.bvid),
      );
      if (index < 0)
        return json({ ...envelope, ok: false, errorCode: 'not_found' });
      return json({
        ...envelope,
        collectedAt,
        item: meta(BILIBILI[index], index, 'video_metadata'),
      });
    }
  }
  if (platform === 'youtube') {
    if (kind === 'search') {
      const found = pick(YOUTUBE.slice(0, 5)).slice(
        0,
        Math.min(5, Number(b.limit) || 5),
      );
      return json({
        ...envelope,
        collectedAt,
        items: found.map(({ index }) => ({ id: youtubeId(world, index) })),
      });
    }
    if (kind === 'video') {
      const index = YOUTUBE.findIndex(
        (_, i) => youtubeId(world, i) === text(b.videoId),
      );
      if (index < 0)
        return json({ ...envelope, ok: false, errorCode: 'not_found' });
      const item = YOUTUBE[index];
      const id = youtubeId(world, index);
      return json({
        ...envelope,
        collectedAt,
        item: {
          id,
          url: `https://www.youtube.com/watch?v=${id}`,
          title: world.text(item.title),
          description: item.description ? world.text(item.description) : '',
          channel: item.channel ?? 'NocoBase',
          publishedAt: iso(published(world, item, index)).slice(0, 10),
          views: grown(world, item.views, item),
          likes: grown(world, item.likes, item),
          comments: grown(world, item.comments, item),
          duration: item.duration ?? 600,
          fetchedAt: collectedAt,
          provider: 'yt-dlp',
          // Production collection is metadata-only.
          transcript: {
            status: 'missing',
            language: null,
            text: '',
            truncated: false,
          },
        },
      });
    }
  }
  return json({ ...envelope, ok: false, errorCode: 'unsupported' });
}
