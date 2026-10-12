import type { LegacyDatabase } from './legacy/database.js';
import { projectId } from './policy.js';
import { YouTubeError, type Video } from './youtube-provider.js';

const metrics = ['views', 'likes', 'comments'] as const;
type Metric = (typeof metrics)[number];
export interface SavedYouTubeVideo extends Video {
  firstSeenAt: string;
  metricFetchedAt: Record<Metric, string | null>;
  transcriptFetchedAt: string | null;
  transcriptRefreshFailed: boolean;
}
const validMetric = (value: number | null) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Records belong to a project, independently of its current discovery conditions. */
export class YouTubeLibrary {
  constructor(private db: LegacyDatabase) {}
  private repo() {
    return this.db.getRepository('nrYouTubeVideos');
  }
  // The source calls this inside its short result transaction and project lock.
  async save(id: string, videos: Video[]) {
    const project = projectId(id);
    for (const video of videos) {
      const key = `${project}:${video.id}`;
      const row = await this.repo().findOne({ filterByTk: key });
      const previous = row?.get('payload') as SavedYouTubeVideo | undefined;
      const saved: SavedYouTubeVideo = {
        ...video,
        firstSeenAt: previous?.firstSeenAt || video.fetchedAt,
        metricFetchedAt: { views: null, likes: null, comments: null },
        transcriptFetchedAt:
          video.transcript.status === 'failed'
            ? previous?.transcriptFetchedAt || null
            : video.fetchedAt,
        transcriptRefreshFailed: video.transcript.status === 'failed',
      };
      for (const metric of metrics) {
        saved[metric] = validMetric(video[metric])
          ? video[metric]
          : (previous?.[metric] ?? null);
        saved.metricFetchedAt[metric] = validMetric(video[metric])
          ? video.fetchedAt
          : (previous?.metricFetchedAt[metric] ?? null);
      }
      if (video.transcript.status === 'failed' && previous?.transcript.text)
        saved.transcript = previous.transcript;
      if (row)
        await this.repo().update({
          filterByTk: key,
          values: { payload: saved },
        });
      else
        await this.repo().create({
          values: {
            id: key,
            projectId: project,
            videoId: video.id,
            payload: saved,
            createdAt: new Date(saved.firstSeenAt),
          },
        });
    }
  }
  async list(id: string, requestedPage: unknown = 1) {
    const requested = Number(requestedPage);
    if (!Number.isSafeInteger(requested) || requested < 1)
      throw new YouTubeError('invalid_input');
    const filter = { projectId: projectId(id) };
    const total = await this.repo().count({ filter });
    const pageSize = 20;
    const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await this.repo().find({
      filter,
      sort: ['-createdAt', 'id'],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return {
      total,
      page,
      pageSize,
      videos: rows.map((row) => row.get('payload') as SavedYouTubeVideo),
    };
  }
  async clear(id: string) {
    await this.repo().destroy({ filter: { projectId: projectId(id) } });
  }
}
