import { systemMessageText } from '../../../shared/i18n/messages.js';
// NocoReach's own settings that classic NocoBase kept as environment variables (the Google OAuth application, a
// project's Google refresh token): stored in nrVariables, secrets sealed with the application's secrets service and
// bound to their name. Read synchronously, as the classic `environment.getVariables()` was, from a copy loaded at start
// and kept current by every write.
import type { SecretsService } from '@nocobase/app-server/secrets';
import type { LegacyDatabase } from './database.js';

const PURPOSE = 'nocoreach/variables';

export class LegacyVariables {
  private values: Record<string, string> = {};
  private unreadable = new Set<string>();

  cannotRead(name: string): boolean {
    return this.unreadable.has(name);
  }

  constructor(
    private readonly db: LegacyDatabase,
    private readonly secrets: SecretsService,
  ) {}

  private repo() {
    return this.db.getRepository('nrVariables');
  }

  async load() {
    const next: Record<string, string> = {};
    this.unreadable.clear();
    for (const row of await this.repo().find({ limit: 10000 })) {
      const name = String(row.name),
        value = typeof row.value === 'string' ? row.value : '';
      try {
        next[name] = row.secret
          ? this.secrets.open(value, { purpose: PURPOSE, aad: [name] })
          : value;
      } catch {
        this.unreadable.add(name);
        // A value sealed with a key this application no longer has: treated as missing, so the page asks again.
      }
    }
    this.values = next;
  }

  all(): Record<string, string> {
    return { ...this.values };
  }

  /** Sets a variable; `null` removes it. Secrets are refused, not stored in plain text, when no key is configured. */
  async set(name: string, value: string | null, secret = false) {
    const repo = this.repo(),
      found = await repo.findOne({ filter: { name } });
    if (value === null) {
      if (found) await repo.destroy({ filterByTk: found.id });
      const clear = () => {
        delete this.values[name];
        this.unreadable.delete(name);
      };
      const transaction = this.db.transactionContext();
      if (transaction) transaction.afterCommit(clear);
      else clear();
      return;
    }
    if (secret && !this.secrets.ready)
      throw Object.assign(
        new Error(
          systemMessageText('variables.serverNoEncryptionKeyConfigured'),
        ),
        { status: 503 },
      );
    const stored = secret
      ? this.secrets.seal(value, { purpose: PURPOSE, aad: [name] })
      : value;
    if (found)
      await repo.update({
        filterByTk: found.id,
        values: { value: stored, secret },
      });
    else await repo.create({ values: { name, value: stored, secret } });
    this.values[name] = value;
    this.unreadable.delete(name);
  }
}
