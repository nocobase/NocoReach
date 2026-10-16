import type { LegacyDatabase } from '../legacy/database.js';
import { roleOf } from '../policy.js';
import { OnlineAgentError } from '../../online-agent/errors.js';
/** Background runs must recheck account status; they no longer have HTTP authentication middleware. */
export async function requireOnlineMember(
  database: LegacyDatabase,
  userId: string,
) {
  const user = await database
    .getRepository('users')
    .findOne({ filterByTk: userId });
  if (!user || user.disabledAt || !(await roleOf(database, userId)))
    throw new OnlineAgentError('accessDenied', 403);
}
