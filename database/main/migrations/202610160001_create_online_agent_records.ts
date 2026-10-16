import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202610160001_create_online_agent_records',
  async up({ builder }) {
    await builder.createCollection('nrOnlineAgentRecords', c => {
      c.string('id', { length: 100 }).primary().notNull();
      c.string('kind', { length: 20 }).notNull();
      c.string('ownerId', { length: 64 }).notNull();
      c.string('groupId', { length: 100 }).notNull();
      c.string('status', { length: 20 }).notNull();
      c.integer('revision').notNull();
      c.text('payload').notNull();
      c.index(['kind', 'status'], { name: 'ix_nr_online_agent_work' });
      c.index(['kind', 'ownerId'], { name: 'ix_nr_online_agent_owner' });
      c.index(['kind', 'groupId'], { name: 'ix_nr_online_agent_group' });
    });
  },
  async down({ builder }) { await builder.dropCollection('nrOnlineAgentRecords'); },
});
export default migration;
