// Reading the classic NocoReach installation for `app import-classic`: its Postgres (the plugin's tables, the users and
// their roles, NocoReach's environment variables) and the AES key its environment variables plugin encrypted secrets with.
// Connection settings come from CLASSIC_DB_* environment variables so the password stays off the command line.
import { createDecipheriv } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type pg from 'pg';

import {
  IMPORT_TABLES,
  isImportedVariable,
  type ClassicUser,
} from '../../../server/nocoreach/classic-import.js';

export interface ClassicConnection {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string | undefined;
  readonly schema: string;
}

export function classicConnection(env: NodeJS.ProcessEnv): ClassicConnection {
  return {
    host: env.CLASSIC_DB_HOST || '127.0.0.1',
    port: Number(env.CLASSIC_DB_PORT || 5432),
    database: env.CLASSIC_DB_DATABASE || 'nocobase',
    user: env.CLASSIC_DB_USER || 'nocobase',
    password: env.CLASSIC_DB_PASSWORD || undefined,
    schema: env.CLASSIC_DB_SCHEMA || 'public',
  };
}

export interface ClassicVariable {
  readonly name: string;
  readonly value: string;
  readonly secret: boolean;
}

export interface ClassicVariables {
  readonly variables: ClassicVariable[];
  readonly plain: number;
  readonly secret: number;
  /** Secrets the key did not decrypt (or that were not tried, without a key). */
  readonly unreadable: string[];
}

/** Classic NocoBase's AesEncryptor: aes-256-cbc, the IV's 32 hex characters, then the ciphertext in hex. */
export function decryptClassic(text: string, key: Buffer): string {
  const iv = Buffer.from(text.slice(0, 32), 'hex');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([
    decipher.update(Buffer.from(text.slice(32), 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

export async function readClassicKey(file: string): Promise<Buffer> {
  const key = await readFile(file);
  if (key.length !== 32) throw new Error('not a 32-byte key file');
  return key;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

export class ClassicSource {
  private constructor(
    private readonly client: pg.Client,
    private readonly schema: string,
  ) {}

  static async open(connection: ClassicConnection): Promise<ClassicSource> {
    const { default: pgModule } = await import('pg');
    const client = new pgModule.Client({
      host: connection.host,
      port: connection.port,
      database: connection.database,
      user: connection.user,
      password: connection.password,
      connectionTimeoutMillis: 10000,
      application_name: 'nocoreach import-classic',
    });
    await client.connect();
    // Read only: nothing here writes, and the session refuses to.
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    return new ClassicSource(client, connection.schema);
  }

  async close() {
    await this.client.end();
  }

  private table(name: string) {
    return `${quote(this.schema)}.${quote(name)}`;
  }

  /** The columns a table has, or null when the table is missing. */
  async columns(table: string): Promise<Set<string> | null> {
    const { rows } = await this.client.query<{ column_name: string }>(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2',
      [this.schema, table],
    );
    return rows.length ? new Set(rows.map((r) => r.column_name)) : null;
  }

  async count(table: string): Promise<number> {
    const { rows } = await this.client.query<{ n: string }>(
      `SELECT count(*) AS n FROM ${this.table(table)}`,
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** The import's columns this table has: id, the times, and the NocoBase 3 table's columns. */
  async importColumns(table: string): Promise<string[] | null> {
    const have = await this.columns(table);
    if (!have) return null;
    return [
      'id',
      'createdAt',
      'updatedAt',
      ...IMPORT_TABLES[table]!.columns,
    ].filter((c) => have.has(c));
  }

  /** The rows after `afterId`, by id. */
  async page(
    table: string,
    columns: readonly string[],
    afterId: string | null,
    limit: number,
  ) {
    const select = columns.map(quote).join(', ');
    const { rows } = await this.client.query<Record<string, unknown>>(
      afterId === null
        ? `SELECT ${select} FROM ${this.table(table)} ORDER BY "id" LIMIT $1`
        : `SELECT ${select} FROM ${this.table(table)} WHERE "id" > $2 ORDER BY "id" LIMIT $1`,
      afterId === null ? [limit] : [limit, afterId],
    );
    return rows;
  }

  /** The classic users, each marked when it held the root or admin role. */
  async users(): Promise<{ users: ClassicUser[]; rolesKnown: boolean }> {
    const have = await this.columns('users');
    if (!have) return { users: [], rolesKnown: false };
    const columns = ['id', 'email', 'username', 'nickname'].filter((c) =>
      have.has(c),
    );
    const { rows } = await this.client.query<Record<string, unknown>>(
      `SELECT ${columns.map(quote).join(', ')} FROM ${this.table('users')} ORDER BY "id"`,
    );
    const admins = new Set<string>();
    const rolesKnown = Boolean(await this.columns('rolesUsers'));
    if (rolesKnown) {
      const roles = await this.client.query<{ userId: string }>(
        `SELECT "userId" FROM ${this.table('rolesUsers')} WHERE "roleName" IN ('root', 'admin')`,
      );
      for (const r of roles.rows) admins.add(String(r.userId));
    }
    return {
      users: rows.map((r) => ({
        id: String(r.id),
        email: (r.email as string) ?? null,
        username: (r.username as string) ?? null,
        nickname: (r.nickname as string) ?? null,
        admin: admins.has(String(r.id)),
      })),
      rolesKnown,
    };
  }

  /** NocoReach's environment variables; secrets decrypted with the key, when there is one. Values never leave memory. */
  async variables(key: Buffer | null): Promise<ClassicVariables> {
    if (!(await this.columns('environmentVariables')))
      return { variables: [], plain: 0, secret: 0, unreadable: [] };
    const { rows } = await this.client.query<{
      name: string;
      type: string;
      value: string | null;
    }>(
      `SELECT "name", "type", "value" FROM ${this.table('environmentVariables')} ORDER BY "name"`,
    );
    const variables: ClassicVariable[] = [];
    const unreadable: string[] = [];
    let plain = 0,
      secret = 0;
    for (const row of rows) {
      if (!isImportedVariable(row.name) || row.value == null) continue;
      if (row.type !== 'secret') {
        plain++;
        variables.push({ name: row.name, value: row.value, secret: false });
        continue;
      }
      secret++;
      if (!key) {
        unreadable.push(row.name);
        continue;
      }
      try {
        variables.push({
          name: row.name,
          value: decryptClassic(row.value, key),
          secret: true,
        });
      } catch {
        unreadable.push(row.name);
      }
    }
    return { variables, plain, secret, unreadable };
  }
}
