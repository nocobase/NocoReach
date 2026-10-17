import type { ContentInput } from './content-rules.js';
import type { YouTubeSource } from './youtube-source.js';
import type { BilibiliSource } from './bilibili-source.js';
import type { XiaohongshuSource } from './xiaohongshu-source.js';

/** Collection-specific mappings end here; the analysis engine uses ContentInput only. */
export async function contentInputs(
  host: {
    youtube?: Pick<YouTubeSource, 'analysisData'>;
    bilibili?: Pick<BilibiliSource, 'state'>;
    xiaohongshu?: Pick<XiaohongshuSource, 'state'>;
  },
  id: string,
): Promise<ContentInput[]> {
  const [youtube, bilibili, xiaohongshu] = await Promise.allSettled([
    host.youtube?.analysisData(id),
    host.bilibili?.state(id),
    host.xiaohongshu?.state(id),
  ]);
  const yt = youtube.status === 'fulfilled' ? youtube.value || [] : [];
  const bi = bilibili.status === 'fulfilled' ? bilibili.value : null;
  const xhs = xiaohongshu.status === 'fulfilled' ? xiaohongshu.value : null;
  return [
    {
      source: 'youtube',
      items: yt.map((v) => ({
        id: v.id,
        title: v.title,
        url: v.url,
        firstSeenAt: v.firstSeenAt,
        collectedAt: v.fetchedAt,
        metrics: {
          views: { value: v.views, at: v.metricFetchedAt.views },
          likes: { value: v.likes, at: v.metricFetchedAt.likes },
        },
      })),
    },
    {
      source: 'bilibili',
      items: bi?.connected
        ? Object.values(bi.videos)
            .filter((v) => v.configRevision === bi.revision)
            .map((v) => ({
              id: v.id,
              title: v.title || v.bvid,
              url: v.url,
              firstSeenAt: v.firstSeenAt,
              collectedAt: v.collectedAt,
              metrics: {
                views: {
                  value: v.views,
                  at: v.metricFetchedAt
                    ? v.metricFetchedAt.views
                    : v.collectedAt,
                },
                likes: {
                  value: v.likes,
                  at: v.metricFetchedAt
                    ? v.metricFetchedAt.likes
                    : v.collectedAt,
                },
              },
            }))
        : [],
    },
    {
      source: 'xiaohongshu',
      items: xhs?.connected
        ? xhs.notes
            .filter((v) => v.query === xhs.query)
            .map((v) => ({
              id: v.id,
              title: v.title,
              url: v.url,
              firstSeenAt: v.firstSeenAt,
              collectedAt: v.lastSeenAt,
              metrics: { likes: { value: v.likes, at: v.lastSeenAt } },
            }))
        : [],
    },
  ];
}
