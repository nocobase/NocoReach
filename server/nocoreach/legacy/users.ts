// The classic `users` repository the ported code reads (members, task owners, notification names), answered from
// NocoBase 3's accounts. Classic NocoBase roles become one: a user holding the `root` permission set is the classic
// `root` (always 管理员 in NocoReach); NocoReach's own 管理员/成员 choice stays in nrSnapshots (nr-members).
// User ids are strings in NocoBase 3 (classic used numbers).
import type { DatabaseManager } from '@nocobase/db';
import { legacyRecord, type LegacyRecord, type LegacyRepository } from './database.js';

type Values = Record<string, unknown>;

export class LegacyUsers implements LegacyRepository {
  constructor(private readonly db: DatabaseManager) {}

  private async roots(): Promise<Set<string>> {
    const rows = (await this.db.repository('authorizationPermissionSetAssignments').findMany({
      filter: { subjectType: 'user', permissionSetKey: 'root' },
    })) as Values[];
    return new Set(rows.map((r) => String(r.subjectId)));
  }

  async isRoot(id: string): Promise<boolean> {
    return (await this.roots()).has(String(id));
  }

  private shape(row: Values, roots: Set<string>): LegacyRecord {
    const id = String(row.id);
    return legacyRecord({
      id,
      nickname: row.name ?? null,
      username: row.username ?? null,
      email: row.email ?? null,
      roles: roots.has(id) ? [{ name: 'root' }] : [],
    });
  }

  async find(options: Values = {}): Promise<LegacyRecord[]> {
    const rows = (await this.db.repository('user').findMany({
      filter: { kind: 'person' },
      sort: { kind: 'sort', version: 1, items: [{ kind: 'field', path: ['createdAt'], direction: 'asc' }] },
      ...(options.limit != null ? { limit: Number(options.limit) } : {}),
      ...(options.offset != null ? { offset: Number(options.offset) } : {}),
    })) as Values[];
    const roots = await this.roots();
    return rows.filter((r) => !r.deletedAt).map((r) => this.shape(r, roots));
  }

  async findOne(options: Values = {}): Promise<LegacyRecord | null> {
    const id = options.filterByTk ?? (options.filter as Values)?.id;
    if (id == null) return (await this.find({ limit: 1 }))[0] || null;
    const row = (await this.db.repository('user').findOne({ filter: { id: String(id) } })) as Values | undefined;
    if (!row || row.deletedAt) return null;
    return this.shape(row, await this.roots());
  }

  async count(): Promise<number> {
    return (await this.find({ limit: 100000 })).length;
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
