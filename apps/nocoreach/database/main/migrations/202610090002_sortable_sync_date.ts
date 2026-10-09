import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202610090002_sortable_sync_date',
  async up({ builder }) {
    await builder.alterField('nrSyncPartitions', 'date', { type: 'string', length: 10 });
  },
  async down({ builder }) {
    await builder.alterField('nrSyncPartitions', 'date', { type: 'text' });
  },
});
