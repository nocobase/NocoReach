import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202610180001_create_project_members',
  async up({ builder }) {
    await builder.createCollection('nrProjectMembers', (c) => {
      c.uuid('id').notNull();
      c.string('projectId', { length: 32 }).notNull();
      c.string('userId', { length: 64 }).notNull();
      c.datetime('createdAt').notNull();
      c.primary('id');
      c.unique(['projectId', 'userId']);
      c.index(['userId']);
    });
    await builder.alterCollection('nrMemberInvitations', (c) => {
      // Projects the invitee joins on acceptance; older offers join none.
      c.json('projectIds').nullable();
    });
  },
  async down({ builder }) {
    await builder.alterCollection('nrMemberInvitations', (c) => {
      c.dropFields('projectIds');
    });
    await builder.dropCollection('nrProjectMembers');
  },
});
