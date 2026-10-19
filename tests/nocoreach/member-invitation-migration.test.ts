// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describeMigration } from '@nocobase/app-testing/server';

describeMigration('202610160003_create_member_invitations', {
  sources: [
    {
      packageName: 'nocoreach',
      directory: fileURLToPath(
        new URL('../../database/main/migrations', import.meta.url),
      ),
    },
  ],
  up: async ({ expectCollection }) => {
    await expectCollection('nrMemberInvitations').toHaveField('userId', {
      nullable: true,
    });
    await expectCollection('nrMemberInvitations').toHaveField('source', {
      nullable: false,
    });
    await expectCollection('nrMemberInvitations').toHaveField(
      'usersInvitationId',
      {
        nullable: true,
      },
    );
    await expectCollection('nrMemberInvitations').toHaveField('activeEmail', {
      nullable: true,
    });
    await expectCollection('nrMemberInvitations').toHaveField('ceiling', {
      nullable: false,
    });
    await expectCollection('nrMemberInvitations').toHaveIndex(['activeEmail'], {
      unique: true,
    });
    await expectCollection('nrMemberInvitations').toHaveIndex(
      ['usersInvitationId'],
      { unique: true },
    );
  },
  down: async ({ expectCollection }) => {
    await expectCollection('nrMemberInvitations').not.toExist();
  },
});
