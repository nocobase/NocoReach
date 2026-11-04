import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611040001_google_auth_failed_at',
  async up({ builder }) {
    await builder.alterCollection('nrGoogleLinks', (c) => {
      // When Google first refused the saved authorization; cleared by the next one. A string like authorizedAt.
      c.string('authFailedAt', { length: 255, nullable: true });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('nrGoogleLinks', (c) => {
      c.dropFields('authFailedAt');
    });
  },
});
export default migration;
