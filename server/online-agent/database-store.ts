import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { OnlineStore, StoredRecord } from './contracts.js';

/** Replaceable database adapter; no reads or writes to the Agents plugin's tables. */
export function createOnlineStore(database: DatabaseManager): OnlineStore {
  type Row = Omit<StoredRecord, 'payload'> & { payload: string };
  const encode = (record: StoredRecord): Row => ({
    ...record,
    payload: JSON.stringify(record.payload),
  });
  const decode = (row: Row): StoredRecord => ({
    ...row,
    payload: JSON.parse(row.payload),
  });
  const repo = (context?: unknown) =>
    (
      (context as DatabaseConnection | undefined) ?? database.connection()
    ).repository<Row>('nrOnlineAgentRecords');
  return {
    transaction: (callback) => database.transaction(callback),
    async get(id, context) {
      const row = await repo(context).findOne({ filter: { id } });
      return row ? decode(row) : null;
    },
    async list(filter, context) {
      const result: StoredRecord[] = [];
      for await (const row of repo(context).findMany({ filter }))
        result.push(decode(row));
      return result;
    },
    async create(record, context) {
      await repo(context).createOne({ values: encode(record) });
    },
    async replace(record, expectedRevision, context) {
      const result = await repo(context).updateMany({
        filter: { id: record.id, revision: expectedRevision },
        values: encode(record),
      });
      return result.updatedCount === 1;
    },
  };
}
