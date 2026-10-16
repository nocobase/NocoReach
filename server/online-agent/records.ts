import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type {
  OnlineAgentDefinition,
  OnlineConversation,
  OnlineRun,
} from '../../shared/online-agent.js';
import { OnlineAgentError } from './errors.js';

interface Records {
  agent: OnlineAgentDefinition;
  conversation: OnlineConversation;
  run: OnlineRun;
}
type Kind = keyof Records;
type Filter = { ownerId?: string; groupId?: string; status?: string };
type Row = Required<Filter> & {
  id: string;
  kind: Kind;
  revision: number;
  payload: string;
};

/** Application records with revision checks; only the caller's connection is used in a transaction. */
export class OnlineRecords {
  constructor(private readonly database: DatabaseManager) {}
  private repo(context?: DatabaseConnection) {
    return (context ?? this.database.connection()).repository<Row>(
      'nrOnlineAgentRecords',
    );
  }
  private row<K extends Kind>(kind: K, value: Records[K]): Row {
    return {
      id: value.id,
      kind,
      ownerId: 'ownerId' in value ? value.ownerId : '',
      groupId: 'conversationId' in value ? value.conversationId : '',
      status: 'status' in value ? value.status : '',
      revision: value.revision,
      payload: JSON.stringify(value),
    };
  }
  async get<K extends Kind>(
    kind: K,
    id: string,
    context?: DatabaseConnection,
  ): Promise<Records[K] | null> {
    const row = await this.repo(context).findOne({ filter: { kind, id } });
    return row ? (JSON.parse(row.payload) as Records[K]) : null;
  }
  async list<K extends Kind>(
    kind: K,
    filter: Filter = {},
    context?: DatabaseConnection,
  ): Promise<Records[K][]> {
    const values: Records[K][] = [];
    for await (const row of this.repo(context).findMany({
      filter: { kind, ...filter },
    }))
      values.push(JSON.parse(row.payload) as Records[K]);
    return values;
  }
  async create<K extends Kind>(
    kind: K,
    value: Records[K],
    context?: DatabaseConnection,
  ) {
    await this.repo(context).createOne({ values: this.row(kind, value) });
    return value;
  }
  async replace<K extends Kind>(
    kind: K,
    value: Records[K],
    expectedRevision: number,
    context?: DatabaseConnection,
  ) {
    const result = await this.repo(context).updateMany({
      filter: { kind, id: value.id, revision: expectedRevision },
      values: this.row(kind, value),
    });
    return result.updatedCount === 1;
  }
  async save<K extends Kind>(
    kind: K,
    value: Records[K],
    context?: DatabaseConnection,
  ) {
    const next = { ...value, revision: value.revision + 1 };
    if (!(await this.replace(kind, next, value.revision, context)))
      throw new OnlineAgentError('revisionConflict');
    return next;
  }
}
