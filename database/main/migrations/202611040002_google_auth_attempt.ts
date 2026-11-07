import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202611040002_google_auth_attempt',
  async up({ builder }) {
    await builder.alterCollection('nrGoogleLinks', (c) => {
      // The last authorization attempt that failed, and its callback reason; cleared by the next one that succeeds.
      c.string('authAttemptFailedAt', { length: 255, nullable: true });
      c.string('authAttemptReason', { length: 255, nullable: true });
    });
  },
  async down({ builder }) {
    await builder.alterCollection('nrGoogleLinks', (c) => {
      c.dropFields('authAttemptFailedAt', 'authAttemptReason');
    });
  },
});
export default migration;
