import { describe, expect, it } from 'vitest';
import {
  SEARCH_USD,
  VIDEO_USD,
  youtubeSearch,
  youtubeVideo,
} from '../../server/nocoreach/youtube-dataforseo.js';
import { YouTubeError } from '../../server/nocoreach/youtube-provider.js';

const ID = 'Im69kzhpR3I';
const task = (items: unknown[], extra: object = {}) => ({
  status_code: 20000,
  cost: 0.002,
  tasks: [
    {
      id: '11021234-0000-0000-0000-000000000000',
      status_code: 20000,
      result: [
        {
          items,
          check_url: 'https://www.youtube.com/results?search_query=NocoBase',
          ...extra,
        },
      ],
    },
  ],
});
const item = (id: string, extra: object = {}) => ({
  type: 'youtube_video',
  video_id: id,
  title: '  NocoBase\nin 10 minutes ',
  description: 'A tour',
  channel_name: 'NocoBase',
  timestamp: '2026-10-04 12:30:00 +00:00',
  publication_date: '4 weeks ago',
  views_count: 1530,
  duration_time_seconds: 612,
  ...extra,
});

describe('YouTube on DataForSEO', () => {
  it('searches YouTube by relevance, without a sort parameter, at list price', () => {
    const spec = youtubeSearch.specification({ term: ' NocoBase ' });
    expect(spec).toMatchObject({
      kind: 'youtube',
      target: 'NocoBase',
      path: 'serp/youtube/organic/live/advanced',
      estimatedUsd: SEARCH_USD,
      request: {
        keyword: 'NocoBase',
        location_code: 2840,
        language_code: 'en',
        block_depth: 20,
      },
    });
    expect(spec.request).not.toHaveProperty('search_param');
    expect(SEARCH_USD).toBe(0.002);
    for (const term of ['', 'x', 'a'.repeat(81), 'ab\u0007cd'])
      expect(() => youtubeSearch.specification({ term })).toThrow(YouTubeError);
  });

  it('keeps videos only, once each, with the day YouTube gives', () => {
    const parsed = youtubeSearch.result(
      task([
        item(ID),
        { type: 'youtube_video_paid', video_id: 'AdAdAdAdAd1' },
        { type: 'youtube_channel', channel_id: 'UC123' },
        item(ID, { title: 'Duplicate' }),
        item('too-short'),
        item('Xy9_-abcdEF', { timestamp: 'yesterday', views_count: -1 }),
      ]),
    );
    expect(parsed.status).toBe('completed');
    expect(parsed.costUsd).toBe(0.002);
    expect(parsed.result.videos).toEqual([
      {
        id: ID,
        url: `https://www.youtube.com/watch?v=${ID}`,
        title: 'NocoBase in 10 minutes',
        description: 'A tour',
        channel: 'NocoBase',
        publishedAt: '2026-10-04',
        views: 1530,
        duration: 612,
      },
      expect.objectContaining({
        id: 'Xy9_-abcdEF',
        publishedAt: null,
        views: null,
      }),
    ]);
    expect(youtubeSearch.result(task([])).result.videos).toEqual([]);
  });

  it('reports a failed or uncertain DataForSEO answer instead of an empty result', () => {
    expect(
      youtubeSearch.result({
        status_code: 20000,
        cost: 0,
        tasks: [{ id: 'abc', status_code: 40501, result: null }],
      }).status,
    ).toBe('failed');
    expect(youtubeSearch.result({ tasks: [] }).status).toBe('unknown');
  });

  it('reads one video’s likes and comments', () => {
    const spec = youtubeVideo.specification({ videoId: ID });
    expect(spec).toMatchObject({
      kind: 'youtubeVideo',
      target: ID,
      path: 'serp/youtube/video_info/live/advanced',
      estimatedUsd: VIDEO_USD,
      request: { video_id: ID },
    });
    expect(VIDEO_USD).toBe(0.006);
    expect(() => youtubeVideo.specification({ videoId: 'bad' })).toThrow(
      YouTubeError,
    );
    const info = youtubeVideo.result(
      task([
        {
          ...item(ID),
          type: 'youtube_video_info',
          likes_count: 88,
          comments_count: 12,
        },
      ]),
      spec,
    );
    expect(info.result.video).toMatchObject({
      id: ID,
      views: 1530,
      likes: 88,
      comments: 12,
    });
    expect(
      youtubeVideo.result(
        task([{ ...item('Xy9_-abcdEF'), type: 'youtube_video_info' }]),
        spec,
      ).result.video,
    ).toBeNull();
  });
});
