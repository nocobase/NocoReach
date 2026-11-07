import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611070002_create_page_days',
  async up({ builder }) {
    // Each page's figures of one synced day, summed from that day's Search Console query × page partition or GA4 page
    // partition, so a page's days are read by key rather than by reading every page of the window. Addresses are kept
    // without the page identity; pathHash (16 hex characters of the path's SHA-1) is what the index holds, as a path
    // can be longer than any index key allows.
    // Ids come from the database: a day's rows are written in bulk, past the 65,536 a second the Snowflake ids allow.
    await builder.createCollection('nrPageDays', (c) => {
      c.increments('id');
      c.string('projectId', { length: 64 }).notNull();
      c.string('source', { length: 16 }).notNull();
      c.string('resource', { length: 255 }).notNull();
      // Days since 1970-01-01 (UTC): compared as a number, which the Repository does not do for a string.
      c.integer('day').notNull();
      c.text('host').nullable();
      c.text('path').notNull();
      c.string('pathHash', { length: 16 }).notNull();
      c.double('clicks').nullable();
      c.double('impressions').nullable();
      c.double('views').nullable();
      c.index(['projectId', 'pathHash', 'day'], {
        name: 'ix_nr_page_days_page',
      });
      c.index(['projectId', 'source', 'day'], {
        name: 'ix_nr_page_days_day',
      });
    });
    // The days nrPageDays holds, one row each: a day held with no row for a page is a day the page had none, and a
    // synced partition without a row here is a day still to be summed.
    await builder.createCollection('nrPageDayMarks', (c) => {
      c.increments('id');
      c.string('dayKey', { length: 64 }).notNull();
      c.string('projectId', { length: 64 }).notNull();
      c.string('source', { length: 16 }).notNull();
      c.string('resource', { length: 255 }).notNull();
      c.integer('day').notNull();
      c.integer('pages').notNull();
      // The summed partition's content, so a day the sync reads again unchanged is not written again.
      c.string('payloadHash', { length: 64 }).notNull();
      c.unique('dayKey', { name: 'uq_nr_page_day_marks_day_key' });
      c.index(['projectId', 'source', 'day'], {
        name: 'ix_nr_page_day_marks_day',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('nrPageDayMarks');
    await builder.dropCollection('nrPageDays');
  },
});
export default migration;
