import { createHash } from 'node:crypto';

import type { LegacyDatabase } from '../legacy/database.js';
import { projectId } from '../policy.js';
import type { SavedYouTubeVideo } from '../youtube-library.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/**
 * Demo and mock data only: a project that has read YouTube daily for `days` days, rather than once just now. Each saved
 * video is first saved a few hours into the day after it was published (its publication date has no time, so never
 * before it), at the earliest `days` before it was really saved (the backlog the first read found), and never later
 * than that real save, so never in the future. Recording then starts with the earliest of them.
 */
export async function backdateYouTube(
  db: LegacyDatabase,
  id: string | number,
  days = 28,
) {
  const repo = db.getRepository('nrYouTubeVideos');
  for (const row of await repo.find({
    filter: { projectId: projectId(id) },
  })) {
    const video = row.get('payload') as SavedYouTubeVideo;
    const saved = Date.parse(video.firstSeenAt);
    // Counted back from the read that saved it, so running this again changes nothing.
    const read = Date.parse(video.fetchedAt) || saved;
    const published = video.publishedAt
      ? Date.parse(`${video.publishedAt}T00:00:00.000Z`)
      : NaN;
    if (!Number.isFinite(saved) || !Number.isFinite(published)) continue;
    // A few hours into the day, the same for a video on every run.
    const hours = 1 + (createHash('sha256').update(video.id).digest()[0] % 10);
    const first = new Date(
      Math.min(
        saved,
        Math.max(read - days * DAY, published + DAY) + hours * HOUR,
      ),
    ).toISOString();
    if (first === video.firstSeenAt) continue;
    await repo.update({
      filterByTk: row.get('id'),
      values: {
        payload: { ...video, firstSeenAt: first },
        createdAt: new Date(first),
      },
    });
  }
}
