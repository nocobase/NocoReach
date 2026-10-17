import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202610170001_youtube_publication_order',
  async up({ builder, query }) {
    await builder.alterCollection('nrYouTubeVideos', (c) => {
      // Keep Collector calendar dates as dates, without inventing a time zone.
      c.string('publishedAt', { length: 10, nullable: true });
      // Explicit unknown placement is independent of each dialect's NULL ordering.
      c.boolean('publishedAtKnown').notNull().defaultTo(false);
      c.index(['projectId', 'publishedAtKnown', 'publishedAt', 'id'], {
        name: 'ix_nr_youtube_publication',
      });
    });
    let cursor = '';
    for (;;) {
      const rows = await query
        .selectFrom('nrYouTubeVideos')
        .select(['id', 'payload'])
        .where('id', '>', cursor)
        .orderBy('id', 'asc')
        .limit(100)
        .execute();
      if (!rows.length) break;
      for (const row of rows) {
        const payload: unknown =
          typeof row.payload === 'string'
            ? JSON.parse(row.payload)
            : row.payload;
        const value = (payload as { publishedAt?: unknown } | null)
          ?.publishedAt;
        const publishedAt =
          typeof value === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(value) &&
          Number.isFinite(Date.parse(value)) &&
          new Date(value).toISOString().slice(0, 10) === value
            ? value
            : null;
        await query
          .updateTable('nrYouTubeVideos')
          .set({ publishedAt, publishedAtKnown: publishedAt !== null })
          .where('id', '=', row.id)
          .execute();
      }
      cursor = String(rows[rows.length - 1].id);
    }
  },
  async down({ builder }) {
    await builder.alterCollection('nrYouTubeVideos', (c) => {
      c.dropIndex('ix_nr_youtube_publication');
      c.dropFields('publishedAtKnown', 'publishedAt');
    });
  },
});
export default migration;
