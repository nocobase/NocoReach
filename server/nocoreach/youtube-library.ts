import type { LegacyDatabase } from './legacy/database.js';
import { projectId } from './policy.js';
import type { Video } from './youtube-provider.js';

const metrics = ['views', 'likes', 'comments'] as const;
const DAY = 86400000;
type Metric = (typeof metrics)[number];
export interface SavedYouTubeVideo extends Video {
  firstSeenAt: string;
  metricFetchedAt: Record<Metric, string | null>;
  transcriptFetchedAt: string | null;
  transcriptRefreshFailed: boolean;
}
const validMetric = (value: number | null) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
// Match the publication migration's calendar validation for legacy payloads, too.
const publicationDate = (value: unknown) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value
    ? value
    : null;

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
        // A search result may leave out what an earlier read saved.
        title: video.title || previous?.title || '',
        description: video.description || previous?.description || '',
        channel: video.channel || previous?.channel || '',
        duration: video.duration ?? previous?.duration ?? null,
        publishedAt:
          publicationDate(video.publishedAt) ??
          publicationDate(previous?.publishedAt),
        firstSeenAt: previous?.firstSeenAt || video.fetchedAt,
        metricFetchedAt: { views: null, likes: null, comments: null },
        transcriptFetchedAt: !video.transcript
          ? (previous?.transcriptFetchedAt ?? null)
          : video.transcript.status === 'failed'
            ? previous?.transcriptFetchedAt || null
            : video.fetchedAt,
        transcriptRefreshFailed: video.transcript?.status === 'failed',
      };
      // DataForSEO reads no captions; keep those an earlier Collector read saved.
      if (!video.transcript && previous?.transcript)
        saved.transcript = previous.transcript;
      for (const metric of metrics) {
        saved[metric] = validMetric(video[metric])
          ? video[metric]
          : (previous?.[metric] ?? null);
        saved.metricFetchedAt[metric] = validMetric(video[metric])
          ? video.fetchedAt
          : (previous?.metricFetchedAt[metric] ?? null);
      }
      if (video.transcript?.status === 'failed' && previous?.transcript?.text)
        saved.transcript = previous.transcript;
      const publication = {
        publishedAt: saved.publishedAt,
        publishedAtKnown: saved.publishedAt !== null,
      };
      if (row)
        await this.repo().update({
          filterByTk: key,
          values: { payload: saved, ...publication },
        });
      else
        await this.repo().create({
          values: {
            id: key,
            projectId: project,
            videoId: video.id,
            payload: saved,
            ...publication,
            createdAt: new Date(saved.firstSeenAt),
          },
        });
    }
  }
  /**
   * How many videos are saved and since when, and how many were first found in the last 30 days, leaving out the
   * first day of recording (which finds the backlog of older videos).
   */
  async overview(id: string) {
    const filter = { projectId: projectId(id) };
    const [total, first] = await Promise.all([
      this.repo().count({ filter }),
      this.repo().findOne({ filter, sort: ['createdAt'] }),
    ]);
    const since =
      (first?.get('payload') as SavedYouTubeVideo | undefined)?.firstSeenAt ??
      null;
    const from = since
      ? Math.max(Date.now() - 30 * DAY, Date.parse(since) + DAY)
      : NaN;
    const recent = Number.isFinite(from)
      ? await this.repo().count({
          filter: {
            ...filter,
            createdAt: { $gte: new Date(from).toISOString() },
          },
        })
      : 0;
    return { total, since, recent };
  }
  /** The videos first found most recently. */
  async recent(id: string, limit = 3) {
    const rows = await this.repo().find({
      filter: { projectId: projectId(id) },
      sort: ['-createdAt', 'id'],
      limit,
    });
    return rows.map((row) => row.get('payload') as SavedYouTubeVideo);
  }
  /** Which of these videos are not saved yet. */
  async unknown(id: string, videoIds: string[]) {
    if (!videoIds.length) return [];
    const rows = await this.repo().find({
      filter: { projectId: projectId(id), videoId: { $in: videoIds } },
      fields: ['videoId'],
      limit: videoIds.length,
    });
    const saved = new Set(rows.map((row) => String(row.get('videoId'))));
    return videoIds.filter((videoId) => !saved.has(videoId));
  }
  /**
   * Dates and counts of every saved video, for period reports. Read in batches and without captions, so a large
   * library is counted in full without holding every transcript in memory.
   */
  async summaries(id: string) {
    const filter = { projectId: projectId(id) };
    const size = 500;
    const result: Pick<
      SavedYouTubeVideo,
      'id' | 'channel' | 'publishedAt' | 'firstSeenAt' | Metric
    >[] = [];
    for (let offset = 0; ; offset += size) {
      const rows = await this.repo().find({
        filter,
        sort: ['id'],
        limit: size,
        offset,
      });
      for (const row of rows) {
        const video = row.get('payload') as SavedYouTubeVideo;
        result.push({
          id: video.id,
          channel: video.channel,
          publishedAt: video.publishedAt,
          firstSeenAt: video.firstSeenAt,
          views: video.views,
          likes: video.likes,
          comments: video.comments,
        });
      }
      if (rows.length < size) return result;
    }
  }
  /** Full saved videos by ID, in the order given. */
  async byIds(id: string, videoIds: string[]) {
    if (!videoIds.length) return [];
    const rows = await this.repo().find({
      filter: { projectId: projectId(id), videoId: { $in: videoIds } },
      limit: videoIds.length,
    });
    const byId = new Map(
      rows.map((row) => {
        const video = row.get('payload') as SavedYouTubeVideo;
        return [video.id, video] as const;
      }),
    );
    return videoIds.flatMap((videoId) => byId.get(videoId) ?? []);
  }
  async selected(id: string, videoIds: string[]) {
    if (!videoIds.length) return [];
    const rows = await this.repo().find({
      filter: { projectId: projectId(id), videoId: { $in: videoIds } },
      limit: 15,
    });
    return rows.map((row) => row.get('payload') as SavedYouTubeVideo);
  }
  async clear(id: string) {
    await this.repo().destroy({ filter: { projectId: projectId(id) } });
  }
}
