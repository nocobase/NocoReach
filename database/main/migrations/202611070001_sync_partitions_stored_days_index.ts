import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611070001_sync_partitions_stored_days_index',
  async up({ builder }) {
    await builder.alterCollection('nrSyncPartitions', (c) => {
      // How many days of a source a window has stored and their latest write, read on every Pages, Keywords and page
      // drawer read. SQLite stores updated_at after the payload, so reading it from the rows walked every payload of
      // the window (about 50 ms for 90 days of 8,000 query × page rows, holding the process); this index answers both.
      c.index(['projectId', 'source', 'grain', 'resource', 'date', 'updatedAt'], {
        name: 'ix_nr_sync_partitions_stored_days',
      });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('nrSyncPartitions', (c) => {
      c.dropIndex('ix_nr_sync_partitions_stored_days');
    });
  },
});
export default migration;
