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
      nullable: false,
    });
    await expectCollection('nrMemberInvitations').toHaveField('ceiling', {
      nullable: false,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('nrMemberInvitations').not.toExist();
  },
});
