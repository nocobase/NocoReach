import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { OnlineChatSettings } from '../../../shared/online-agent.js';
import { OnlineAgentError } from './errors.js';

/** The one record of `nrOnlineAgentRecords` still read: earlier versions kept every online agent there. */
export const SETTINGS_ID = 'online-default';
type Row = {
  id: string;
  kind: string;
  ownerId: string;
  groupId: string;
  status: string;
  revision: number;
  payload: string;
};
const DEFAULTS: OnlineChatSettings = {
  enabled: true,
  instructions: '',
  model: null,
  revision: 0,
};

/** Chat panel › Settings, with revision checks. */
export class OnlineChatSettingsStore {
  constructor(private readonly database: DatabaseManager) {}
  private repo(context?: DatabaseConnection) {
    return (context ?? this.database.connection()).repository<Row>(
      'nrOnlineAgentRecords',
    );
  }
  async get(context?: DatabaseConnection): Promise<OnlineChatSettings> {
    const row = await this.repo(context).findOne({
      filter: { kind: 'agent', id: SETTINGS_ID },
    });
    if (!row) return { ...DEFAULTS };
    const value = JSON.parse(row.payload) as Partial<OnlineChatSettings>;
    return {
      enabled: value.enabled ?? true,
      instructions: value.instructions ?? '',
      model: value.model ?? null,
      revision: row.revision,
    };
  }
  async save(value: OnlineChatSettings): Promise<OnlineChatSettings> {
    try {
      return await this.write(value);
    } catch (error) {
      // Two first saves at once: the one whose record could not be created finds the other's.
      if (
        value.revision === 0 &&
        !(error instanceof OnlineAgentError) &&
        (await this.get()).revision !== 0
      )
        throw new OnlineAgentError('revisionConflict');
      throw error;
    }
  }
  private write(value: OnlineChatSettings): Promise<OnlineChatSettings> {
    return this.database.transaction(async (context) => {
      const current = await this.get(context);
      if (current.revision !== value.revision)
        throw new OnlineAgentError('revisionConflict');
      const next = { ...value, revision: value.revision + 1 };
      const row = {
        id: SETTINGS_ID,
        kind: 'agent',
        ownerId: '',
        groupId: '',
        status: '',
        revision: next.revision,
        payload: JSON.stringify(next),
      };
      const repo = this.repo(context);
      const updated = await repo.updateMany({
        filter: { kind: 'agent', id: SETTINGS_ID, revision: value.revision },
        values: row,
      });
      if (updated.updatedCount !== 1) {
        if (value.revision !== 0)
          throw new OnlineAgentError('revisionConflict');
        await repo.createOne({ values: row });
      }
      return next;
    });
  }
}
