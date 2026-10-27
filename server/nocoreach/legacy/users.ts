// The classic `users` repository the ported code reads (members, task owners, notification names), answered from
// NocoBase 3 accounts and their framework permission-set assignments; no business role is read from a snapshot.
// User ids are strings in NocoBase 3 (classic used numbers). Reads join the caller's transaction (`LegacyDatabase.table`):
// the task service looks members up while it holds one.
import { legacyRecord, type LegacyRecord, type LegacyRepository } from './database.js';
import { toSort } from './filters.js';

type Values = Record<string, unknown>;
type Tables = { table(name: string, transaction?: unknown): any };

export class LegacyUsers implements LegacyRepository {
  constructor(private readonly db: Tables) {}

  private async roots(transaction?: unknown): Promise<Set<string>> {
    const rows = (await this.db.table('authorizationPermissionSetAssignments', transaction).findMany({
      filter: { subjectType: 'user', permissionSetKey: 'root' },
    })) as Values[];
    return new Set(rows.map((r) => String(r.subjectId)));
  }

  async isRoot(id: string): Promise<boolean> {
    return (await this.roots()).has(String(id));
  }

  private async assignments(transaction?: unknown, userId?: string): Promise<Map<string, string[]>> {
    const rows = await this.db.table('authorizationPermissionSetAssignments', transaction).findMany({ filter: { subjectType: 'user', ...(userId ? { subjectId: userId } : {}) } }) as Values[];
    const byUser = new Map<string, string[]>();
    for (const row of rows) {
      const key = String(row.permissionSetKey);
      if (key !== 'root' && !key.startsWith('nr.')) continue;
      const id = String(row.subjectId);
      byUser.set(id, [...(byUser.get(id) ?? []), key]);
    }
    return byUser;
  }

  private shape(row: Values, assignments: Map<string, string[]>): LegacyRecord {
    const id = String(row.id);
    return legacyRecord({
      id,
      nickname: row.name ?? null,
      username: row.username ?? null,
      email: row.email ?? null,
      disabledAt: row.disabledAt ?? null,
      kind: row.kind,
      roles: (assignments.get(id) ?? []).map(name => ({ name })),
    });
  }

  async find(options: Values = {}): Promise<LegacyRecord[]> {
    const rows = (await this.db.table('user', options.transaction).findMany({
      filter: { kind: 'person' },
      sort: toSort(options.sort || 'createdAt'),
      ...(options.limit != null ? { limit: Number(options.limit) } : {}),
      ...(options.offset != null ? { offset: Number(options.offset) } : {}),
    })) as Values[];
    const assignments = await this.assignments(options.transaction);
    return rows.filter((r) => !r.deletedAt).map((r) => this.shape(r, assignments));
  }

  async findOne(options: Values = {}): Promise<LegacyRecord | null> {
    const id = options.filterByTk ?? (options.filter as Values)?.id;
    if (id == null) return (await this.find({ limit: 1, transaction: options.transaction }))[0] || null;
    const row = (await this.db.table('user', options.transaction).findOne({ filter: { id: String(id) } })) as
      | Values
      | undefined;
    if (!row || row.deletedAt || row.kind !== 'person') return null;
    return this.shape(row, await this.assignments(options.transaction, String(id)));
  }

  async count(options: Values = {}): Promise<number> {
    return (await this.find({ limit: 100000, transaction: options.transaction })).length;
  }

  async create(): Promise<LegacyRecord> {
    throw new Error('NocoReach does not create users; add them in the NocoBase user administration');
  }

  async update(): Promise<LegacyRecord[]> {
    throw new Error('NocoReach does not change users');
  }

  async destroy(): Promise<number> {
    throw new Error('NocoReach does not delete users');
  }
}
