import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202610140001_create_task_media',
  async up({ builder }) {
    await builder.createCollection('nrTaskMedia', (c) => {
      c.uuid('id').primary().notNull();
      c.string('disk', { length: 255 }).notNull();
      c.text('key').notNull();
      c.text('filename').notNull();
      c.string('ext', { length: 32 }).notNull();
      c.string('mimeType', { length: 255 }).notNull();
      c.bigInt('size').notNull();
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.string('ownerId', { length: 64 }).notNull();
      c.string('sessionId', { length: 255 }).notNull();
      c.string('projectId', { length: 255 }).notNull();
      c.uuid('draftId').notNull();
      c.string('taskId', { length: 64 }).nullable();
      c.datetime('expiresAt').notNull();
      c.boolean('deleting').notNull().defaultTo(false);
      c.index(['ownerId', 'draftId'], { name: 'ix_nr_task_media_draft' });
      c.index(['taskId', 'expiresAt'], { name: 'ix_nr_task_media_expiry' });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('nrTaskMedia');
  },
});

export default migration;
