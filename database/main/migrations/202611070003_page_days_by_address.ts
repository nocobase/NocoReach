import { defineMigration, type MigrationDefinition } from '@nocobase/db';

// Pages' figures over long ranges are summed from nrPageDays (one GROUP BY instead of reading every partition), and a
// longer synced history makes the table the largest of the project's. Its rows held each address's host and path as
// text, with a hash and the project, source and resource again: about 230 bytes a row with its indexes on 252
// (2026-11-07). They now point to an address (nrPageAddresses) and a source of a project (nrPageScopes) by number.
//
// The rows are derived from nrSyncPartitions, so they are dropped rather than converted: the marks go with them, and
// the tick's fill sums every synced day again after the upgrade (168 days in 11 s on 252).
const migration: MigrationDefinition = defineMigration({
  name: '202611070003_page_days_by_address',
  async up({ builder, query }) {
    await builder.dropCollection('nrPageDays');
    // A mark without its rows would read as a day on which no page had any figure.
    await query.deleteFrom('nrPageDayMarks').allowAllRows().execute();
    // One source of a project: a Search Console site or a GA4 property.
    await builder.createCollection('nrPageScopes', (c) => {
      c.increments('id');
      // SHA-256 of [projectId, source, resource].
      c.string('scopeKey', { length: 64 }).notNull();
      c.string('projectId', { length: 64 }).notNull();
      c.string('source', { length: 16 }).notNull();
      c.string('resource', { length: 255 }).notNull();
      c.unique('scopeKey', { name: 'uq_nr_page_scopes_scope_key' });
      c.index(['projectId'], { name: 'ix_nr_page_scopes_project' });
    });
    // An address of one source as its rows are summed: Search Console by page key, GA4 by its host as stored and its
    // path without the query or a trailing slash. pathHash (16 hex characters of the path's SHA-1, the path as the page
    // drawer matches it) is what the drawer's index holds, as a path can be longer than any index key allows.
    await builder.createCollection('nrPageAddresses', (c) => {
      c.increments('id');
      // SHA-256 of [scopeId, host, path].
      c.string('addressKey', { length: 64 }).notNull();
      c.string('projectId', { length: 64 }).notNull();
      c.integer('scopeId').notNull();
      c.text('host').nullable();
      c.text('path').notNull();
      c.string('pathHash', { length: 16 }).notNull();
      c.unique('addressKey', { name: 'uq_nr_page_addresses_address_key' });
      c.index(['scopeId', 'pathHash'], { name: 'ix_nr_page_addresses_path' });
    });
    // Each address's figures of one synced day, keyed by the two: an id would add a column and an index as large as the
    // drawer's (4.5 MB of 22 MB for 84 days on 252's data).
    await builder.createCollection('nrPageDays', (c) => {
      c.integer('pageId').notNull();
      // Days since 1970-01-01 (UTC): compared as a number, which the Repository does not do for a string.
      c.integer('day').notNull();
      c.integer('scopeId').notNull();
      c.double('clicks').nullable();
      c.double('impressions').nullable();
      c.double('views').nullable();
      c.primary(['pageId', 'day'], { name: 'pk_nr_page_days' });
      c.index(['scopeId', 'day'], { name: 'ix_nr_page_days_scope_day' });
    });
  },
  async down({ builder, query }) {
    await builder.dropCollection('nrPageDays');
    await builder.dropCollection('nrPageAddresses');
    await builder.dropCollection('nrPageScopes');
    await query.deleteFrom('nrPageDayMarks').allowAllRows().execute();
    await builder.createCollection('nrPageDays', (c) => {
      c.increments('id');
      c.string('projectId', { length: 64 }).notNull();
      c.string('source', { length: 16 }).notNull();
      c.string('resource', { length: 255 }).notNull();
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
      c.index(['projectId', 'source', 'day'], { name: 'ix_nr_page_days_day' });
    });
  },
});
export default migration;
