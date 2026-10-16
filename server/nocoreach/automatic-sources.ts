import {
  adaptContent,
  mappingRequest,
  mappingProposalSchema,
  MAPPING_SYSTEM,
  type MappingProposal,
  type AdaptedContent,
} from './automatic-content.js';
import { projectId, requireAccess } from './policy.js';
import type { LegacyDatabase } from './legacy/database.js';
import type { LegacyApp } from './legacy/app.js';
import type { LegacyContext } from './legacy/context.js';
import { systemMessageText } from '../../shared/i18n/messages.js';

export class AutomaticSources {
  constructor(
    private host: {
      db: LegacyDatabase;
      app: LegacyApp;
      project(id: string): Promise<unknown>;
    },
    private suggest?: (system: string, prompt: string) => Promise<string>,
  ) {}
  async state(id: string): Promise<AdaptedContent[]> {
    const row = await this.host.db
      .getRepository('nrSnapshots')
      .findOne({ filter: { key: `automatic-content:${projectId(id)}` } });
    return (row?.get('payload') as AdaptedContent[] | undefined) || [];
  }
  async ingest(id: string, raw: unknown) {
    // Parse/validate before entering the short write transaction.
    let checked = adaptContent(raw);
    let proposals: MappingProposal[] = [];
    const schema = mappingRequest(raw);
    if (
      this.suggest &&
      schema.fields.length &&
      Object.keys(checked.mapping).length < 4
    ) {
      try {
        const answer = await this.suggest(
          MAPPING_SYSTEM,
          JSON.stringify(schema),
        );
        if (answer.length > 12000) throw new Error('Oversized model response');
        const parsed: unknown = JSON.parse(answer);
        proposals = mappingProposalSchema.parse(
          parsed && typeof parsed === 'object' && 'mappings' in parsed
            ? parsed.mappings
            : parsed,
        );
        checked = adaptContent(raw, Date.now(), undefined, proposals);
      } catch {
        /* Keep verified deterministic fields; a model outage cannot invent capabilities. */
      }
    }
    return this.host.db.sequelize.transaction(async (transaction) => {
      const key = `automatic-content:${projectId(id)}`;
      await this.host.db.sequelize.query(
        'SELECT pg_advisory_xact_lock(hashtext(:key))',
        { replacements: { key: `nr-analysis-rules:${id}` }, transaction },
      );
      const repo = this.host.db.getRepository('nrSnapshots');
      const row = await repo.findOne({ filter: { key }, transaction });
      const all = (row?.get('payload') as AdaptedContent[] | undefined) || [];
      const previous = all.find(
        (source) => source.definition.id === checked.definition.id,
      );
      if (
        previous &&
        Date.parse(previous.collectedAt) > Date.parse(checked.collectedAt)
      )
        throw Object.assign(
          new Error(systemMessageText('automaticSources.oldBatch')),
          { status: 409 },
        );
      if (!previous && all.length >= 20)
        throw Object.assign(
          new Error(systemMessageText('automaticSources.limit')),
          { status: 400 },
        );
      const next = adaptContent(raw, Date.now(), previous, proposals);
      // Invalid batches must not erase an established channel or its overrides.
      if (!next.input.items.length)
        throw Object.assign(
          new Error(systemMessageText('automaticSources.unrecognized')),
          { status: 422 },
        );
      if (previous)
        next.definition.capabilities.metrics = [
          ...new Set([
            ...previous.definition.capabilities.metrics,
            ...next.definition.capabilities.metrics,
          ]),
        ];
      const payload = [
        ...all.filter((source) => source.definition.id !== next.definition.id),
        next,
      ];
      if (row)
        await repo.update({
          filterByTk: row.id,
          values: { payload },
          transaction,
        });
      else await repo.create({ values: { key, payload }, transaction });
      return next;
    });
  }
  async disconnect(id: string, channelId: unknown) {
    if (
      typeof channelId !== 'string' ||
      !/^[a-z][a-z0-9-]{0,47}$/.test(channelId)
    )
      throw new Error('Invalid channel');
    return this.host.db.sequelize.transaction(async (transaction) => {
      const key = `automatic-content:${projectId(id)}`;
      await this.host.db.sequelize.query(
        'SELECT pg_advisory_xact_lock(hashtext(:key))',
        { replacements: { key: `nr-analysis-rules:${id}` }, transaction },
      );
      const repo = this.host.db.getRepository('nrSnapshots');
      const row = await repo.findOne({ filter: { key }, transaction });
      const all = (row?.get('payload') as AdaptedContent[] | undefined) || [];
      if (!row) return;
      await repo.update({
        filterByTk: row.id,
        values: {
          payload: all.map((source) =>
            source.definition.id === `auto-${channelId}`
              ? { ...source, connected: false }
              : source,
          ),
        },
        transaction,
      });
    });
  }
  register() {
    const wrap =
      (operation: 'ingest' | 'list' | 'disconnect') =>
      async (ctx: LegacyContext, next: () => Promise<unknown>) => {
        await requireAccess(ctx);
        try {
          const v = (ctx.action.params.values || {}) as Record<string, unknown>;
          const id = projectId(v.projectId);
          await this.host.project(id);
          if (operation === 'disconnect')
            await this.disconnect(id, v.channelId);
          ctx.body =
            operation === 'ingest'
              ? await this.ingest(id, v)
              : await this.state(id);
          await next();
        } catch (error) {
          const e = error as { status?: number; message?: string };
          ctx.throw(
            e.status || 400,
            e.status
              ? e.message!
              : systemMessageText('automaticSources.invalidBatch'),
          );
        }
      };
    this.host.app.resourceManager.define({
      name: 'nrAutomaticSources',
      actions: {
        ingest: wrap('ingest'),
        list: wrap('list'),
        disconnect: wrap('disconnect'),
      },
    });
    this.host.app.acl.allow(
      'nrAutomaticSources',
      ['ingest', 'list', 'disconnect'],
      'loggedIn',
    );
  }
}
