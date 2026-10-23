import { defineMigration, type MigrationDefinition } from '@nocobase/db';

type Row = { id: string; kind: string; revision: number; payload: unknown };
type Definition = {
  enabled?: boolean;
  instructions?: string;
  model?: { modelService: string; model: string } | null;
  ready?: boolean;
};
const SETTINGS_ID = 'online-default';
const parse = (row: Row): Definition =>
  (typeof row.payload === 'string'
    ? JSON.parse(row.payload)
    : row.payload) as Definition;

/**
 * Online chat moved to the Agents plugin's OnlineAgent: earlier conversations and their turns are deleted, and of the
 * online agents only Chat panel › Settings remains, as the `online-default` record.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610220002_retire_online_agent_records',
  async up({ query }) {
    const agents: Row[] = await query
      .selectFrom('nrOnlineAgentRecords')
      .select(['id', 'kind', 'revision', 'payload'])
      .where('kind', '=', 'agent')
      .orderBy('id', 'asc')
      .execute();
    const kept = agents.find((row) => row.id === SETTINGS_ID);
    // Without the default record, the Agent page's choice: the first enabled agent.
    const chosen = kept ?? agents.find((row) => parse(row).enabled) ?? null;
    const value = chosen ? parse(chosen) : {};
    const payload = JSON.stringify({
      id: SETTINGS_ID,
      enabled: value.enabled ?? true,
      instructions: value.instructions ?? '',
      model: value.model ?? null,
      revision: kept?.revision ?? 0,
    });
    await query
      .deleteFrom('nrOnlineAgentRecords')
      .where('id', '!=', SETTINGS_ID)
      .execute();
    if (kept)
      await query
        .updateTable('nrOnlineAgentRecords')
        .set({ payload })
        .where('id', '=', SETTINGS_ID)
        .execute();
    else
      await query
        .insertInto('nrOnlineAgentRecords')
        .values({
          id: SETTINGS_ID,
          kind: 'agent',
          ownerId: '',
          groupId: '',
          status: '',
          revision: 0,
          payload,
        })
        .execute();
  },
  async down() {
    // Deleted conversations come back only from a backup.
  },
});
export default migration;
