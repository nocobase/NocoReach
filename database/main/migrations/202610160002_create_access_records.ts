import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202610160002_create_access_records',
  async up({ builder }) {
    await builder.createCollection('nrOrganizationKeys', (c) => {
      c.string('id', { length: 64 }).notNull();
      c.string('serviceUserId', { length: 64 }).notNull();
      c.string('createdBy', { length: 64 }).notNull();
      c.datetime('createdAt').notNull();
      c.primary('id');
      c.unique('serviceUserId');
    });
    await builder.createCollection('nrAccessEvents', (c) => {
      c.uuid('id').notNull();
      c.string('actorId', { length: 64 }).notNull();
      c.string('action', { length: 80 }).notNull();
      c.string('targetId', { length: 64 }).notNull();
      c.json('changes').notNull();
      c.datetime('createdAt').notNull();
      c.primary('id');
      c.index(['targetId', 'createdAt']);
    });
  },
  async down({ builder }) {
    await builder.dropCollection('nrAccessEvents');
    await builder.dropCollection('nrOrganizationKeys');
  },
});
