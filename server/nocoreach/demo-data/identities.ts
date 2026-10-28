import type { DatabaseManager } from '@nocobase/db';
import type { UserManagementService } from '@nocobase/app-plugin-users/server/tokens';
import { DEMO_LANGUAGES, demoContent } from './content.js';

/** Rename only identities already owned by this dataset; matching public demo names do not prove ownership. */
export async function migrateDemoIdentityEmails(
  database: DatabaseManager,
  users: UserManagementService,
) {
  await database.transaction(async (connection) => {
    const accounts = await connection.query
      .selectFrom('user')
      .innerJoin('demoModeAccounts', 'demoModeAccounts.userId', 'user.id')
      .select(['user.id', 'user.username', 'user.email'])
      .where('demoModeAccounts.datasetId', '=', 'nocoreach')
      .execute();
    const names = new Set(
      DEMO_LANGUAGES.flatMap((language) =>
        Object.values(demoContent(language).people).map(
          (person) => person.username,
        ),
      ),
    );
    for (const account of accounts) {
      const username = String(account.username);
      if (
        names.has(username) &&
        account.email === `${username}@nocobase.example`
      ) {
        await users.withConnection(connection).update(String(account.id), {
          email: `${username}@acme.example`,
        });
      }
    }
  });
}
