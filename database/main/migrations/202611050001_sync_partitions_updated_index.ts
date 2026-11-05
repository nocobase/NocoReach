import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611050001_sync_partitions_updated_index',
  async up({ builder }) {
    await builder.alterCollection('nrSyncPartitions', (c) => {
      // The latest write of a project's partitions, read on every Google snapshot request. SQLite stores updated_at
      // after the payload, so without this index it walked every payload of the project to reach it.
      c.index(['projectId', 'updatedAt'], {
        name: 'ix_nr_sync_partitions_project_updated_at',
      });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('nrSyncPartitions', (c) => {
      c.dropIndex('ix_nr_sync_partitions_project_updated_at');
    });
  },
});
export default migration;
