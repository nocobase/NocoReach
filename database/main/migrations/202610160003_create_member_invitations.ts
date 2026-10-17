import { defineMigration } from '@nocobase/db';

export default defineMigration({
  name: '202610160003_create_member_invitations',
  async up({ builder }) {
    await builder.createCollection('nrMemberInvitations', (c) => {
      c.uuid('id').notNull();
      c.string('source', { length: 16 }).notNull();
      c.string('userId', { length: 64 }).nullable();
      c.uuid('usersInvitationId').nullable();
      c.string('email', { length: 320 }).notNull();
      c.string('activeEmail', { length: 320 }).nullable();
      c.string('invitedBy', { length: 64 }).notNull();
      c.json('roles').notNull();
      c.json('ceiling').notNull();
      c.string('status', { length: 16 }).notNull();
      c.datetime('expiresAt').notNull();
      c.datetime('createdAt').notNull();
      c.datetime('updatedAt').notNull();
      c.primary('id');
      c.unique('activeEmail');
      c.unique('usersInvitationId');
      c.index(['userId', 'status']);
    });
  },
  async down({ builder }) {
    await builder.dropCollection('nrMemberInvitations');
  },
});
