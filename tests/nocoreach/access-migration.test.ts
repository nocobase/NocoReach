// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describeMigration } from '@nocobase/app-testing/server';

describeMigration('202610160002_create_access_records', {
  sources: [
    {
      packageName: 'nocoreach',
      directory: fileURLToPath(
        new URL('../../database/main/migrations', import.meta.url),
      ),
    },
  ],
  up: async ({ expectCollection }) => {
    await expectCollection('nrOrganizationKeys').toHaveField('serviceUserId', {
      nullable: false,
    });
    await expectCollection('nrAccessEvents').toHaveField('action', {
      nullable: false,
    });
    await expectCollection('nrAccessEvents').toHaveField('changes', {
      nullable: false,
    });
  },
  down: async ({ expectCollection }) => {
    await expectCollection('nrOrganizationKeys').not.toExist();
    await expectCollection('nrAccessEvents').not.toExist();
  },
});
