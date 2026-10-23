import type { LegacyDatabase } from '../legacy/database.js';
import { roleOf } from '../policy.js';
import { OnlineAgentError } from './errors.js';
/** Background runs must recheck account status; they no longer have HTTP authentication middleware. */
export async function requireOnlineMember(
  database: LegacyDatabase,
  userId: string,
  projectId?: string,
) {
  const user = await database
    .getRepository('users')
    .findOne({ filterByTk: userId });
  if (!user || user.disabledAt || !(await roleOf(database, userId)))
    throw new OnlineAgentError('accessDenied', 403);
  try {
    await database.access?.freshFor(userId, 'nrOnline', 'read', projectId);
  } catch {
    throw new OnlineAgentError('accessDenied', 403);
  }
}
