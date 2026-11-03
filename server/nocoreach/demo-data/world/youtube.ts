import { published, grown } from './collectors.js';
import { text, type Json } from './kit.js';
import { worldFor, type World, type WorldProject } from './world.js';

// YouTube as DataForSEO's YouTube SERP API answers it (2026-11-02): a search returns the videos whose titles match the
// term (the product's name finds them all), and video_info a video's likes and comments. The last videos are the
// team's own, which no search reaches and the demo tracks by link.
const SEARCHED = 12;

const iso = (t: number) => new Date(t).toISOString();
const dfsTime = (t: number) =>
  iso(t)
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' +00:00');

export const youtubeId = (world: World, index: number) =>
  Buffer.from(world.seeded.hash(`yt:${index}`), 'hex')
    .toString('base64url')
    .slice(0, 11);

/** Links to the team's own videos, which searches do not reach and the demo tracks by link. */
export function followedVideos(project: WorldProject): string[] {
  const world = worldFor(project, Date.now());
  return world.youtube
    .slice(SEARCHED, SEARCHED + 2)
    .map(
      (_, i) =>
        `https://www.youtube.com/watch?v=${youtubeId(world, SEARCHED + i)}`,
    );
}

function video(world: World, index: number) {
  const item = world.youtube[index];
  const id = youtubeId(world, index);
  const at = published(world, item, index);
  return {
    video_id: id,
    title: world.text(item.title),
    url: `https://www.youtube.com/watch?v=${id}`,
    channel_name: item.channel ?? world.site.name,
    channel_id: `UC${world.seeded.hash(`ytc:${item.channel ?? ''}`).slice(0, 22)}`,
    description: item.description ? world.text(item.description) : '',
    views_count: grown(world, item.views, item),
    timestamp: dfsTime(at),
    publication_date: `${item.age} days ago`,
    duration_time_seconds: item.duration ?? 600,
    is_shorts: false,
  };
}

/** The result list of a YouTube SERP operation, or null for any other operation. */
export function youtubeSerp(
  world: World,
  operation: string,
  b: Json,
): unknown[] | null {
  if (operation === 'serp/youtube/organic/live/advanced') {
    const keyword = text(b.keyword);
    const query = keyword.toLowerCase();
    const items = world.youtube
      .slice(0, SEARCHED)
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const title = world.text(item.title).toLowerCase();
        return (
          query.includes(world.site.name.toLowerCase()) ||
          query.split(/\s+/).some((w) => w.length > 1 && title.includes(w))
        );
      })
      .slice(0, 20)
      .map(({ index }, rank) => ({
        type: 'youtube_video',
        rank_group: rank + 1,
        rank_absolute: rank + 1,
        ...video(world, index),
      }));
    return [
      {
        keyword,
        se_domain: 'youtube.com',
        location_code: b.location_code ?? null,
        language_code: b.language_code ?? null,
        check_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`,
        datetime: dfsTime(world.now),
        items_count: items.length,
        items,
      },
    ];
  }
  if (operation === 'serp/youtube/video_info/live/advanced') {
    const index = world.youtube.findIndex(
      (_, i) => youtubeId(world, i) === text(b.video_id),
    );
    const item = world.youtube[index];
    const items =
      index < 0
        ? []
        : [
            {
              type: 'youtube_video_info',
              rank_group: 1,
              rank_absolute: 1,
              ...video(world, index),
              likes_count: grown(world, item.likes, item),
              comments_count: grown(world, item.comments, item),
            },
          ];
    return [
      {
        se_domain: 'youtube.com',
        datetime: dfsTime(world.now),
        items_count: items.length,
        items,
      },
    ];
  }
  return null;
}
