import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Self-contained upgrade from the public-research snapshot shipped by PR #7.
const migration: MigrationDefinition = defineMigration({
  name: '202610120001_persist_youtube_videos',
  // Dropping this table on rollback would discard durable records. Restore a backup to downgrade.
  irreversible: true,
  async up(context) {
    const { builder, query } = context;
    await builder.createCollection('nrYouTubeVideos', (c) => {
      c.string('id', { length: 32 }).notNull();
      c.string('projectId', { length: 16 }).notNull();
      c.string('videoId', { length: 11 }).notNull();
      c.json('payload').notNull();
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.primary('id', { name: 'pk_nr_youtube_videos' });
      c.unique(['projectId', 'videoId'], {
        name: 'uq_nr_youtube_project_video',
      });
      c.index(['projectId', 'createdAt'], {
        name: 'ix_nr_youtube_project_created',
      });
    });
    let cursor = '0';
    for (;;) {
      const rows = await query
        .selectFrom('nrSnapshots')
        .select(['id', 'key', 'payload'])
        .where('key', 'like', 'youtube:%')
        .where('id', '>', cursor)
        .orderBy('id', 'asc')
        .limit(100)
        .execute();
      if (!rows.length) break;
      for (const row of rows) {
        const project = String(row.key).slice('youtube:'.length);
        if (!/^[1-9]\d{0,15}$/.test(project)) continue;
        const state = (
          typeof row.payload === 'string'
            ? JSON.parse(row.payload)
            : row.payload
        ) as { videos?: Array<Record<string, unknown>> } | null;
        if (!state || !Array.isArray(state.videos)) continue;
        for (const video of state.videos) {
          const fetchedAt =
            typeof video.fetchedAt === 'string' ? video.fetchedAt : '';
          const videoId = typeof video.id === 'string' ? video.id : '';
          if (
            !/^[A-Za-z0-9_-]{11}$/.test(videoId) ||
            !Number.isFinite(Date.parse(fetchedAt))
          )
            throw new Error(
              'Cannot migrate an invalid YouTube snapshot; original data has not been discarded',
            );
          const metricFetchedAt = Object.fromEntries(
            ['views', 'likes', 'comments'].map((metric) => [
              metric,
              typeof video[metric] === 'number' &&
              Number.isFinite(video[metric]) &&
              Number(video[metric]) >= 0
                ? fetchedAt
                : null,
            ]),
          );
          const transcript = video.transcript as
            { status?: string } | undefined;
          const payload = {
            ...video,
            firstSeenAt: fetchedAt,
            metricFetchedAt,
            transcriptFetchedAt:
              transcript?.status === 'failed' ? null : fetchedAt,
            transcriptRefreshFailed: transcript?.status === 'failed',
          };
          const key = `${project}:${videoId}`;
          // Repository is needed only for JSON encoding across database dialects.
          await context.repository('nrYouTubeVideos').upsertOne({
            filter: { id: key },
            create: {
              id: key,
              projectId: project,
              videoId,
              payload,
              createdAt: new Date(fetchedAt),
              updatedAt: new Date(fetchedAt),
            },
            update: { payload, updatedAt: new Date(fetchedAt) },
          });
        }
        const { videos: _videos, ...configuration } = state;
        // Keep the configuration but remove the duplicated cache only after copying its records.
        await context.repository('nrSnapshots').updateMany({
          filter: { id: String(row.id) },
          values: { payload: configuration },
        });
      }
      cursor = String(rows[rows.length - 1].id);
    }
  },
});
export default migration;
