import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { projectId, requireAccess } from './policy.js';
import type { LegacyApp } from './legacy/app.js';
import type { LegacyDatabase, LegacyTransaction } from './legacy/database.js';
import type { legacyContext } from './legacy/context.js';
import type { OutboundNetwork } from './outbound-network.js';
import {
  collectorConfigs,
  HttpXiaohongshuAdapter,
  querySchema,
  XiaohongshuError,
  XHS_MESSAGES,
  type XiaohongshuAdapter,
  type XiaohongshuCollectorConfig,
  type XiaohongshuErrorCode,
  type XiaohongshuNote,
} from './xiaohongshu-adapter.js';

type Context = ReturnType<typeof legacyContext>;
type Values = Record<string, unknown>;
interface StoredNote extends XiaohongshuNote {
  firstSeenAt: string;
  lastSeenAt: string;
  query: string;
}
interface Attempt {
  at: string;
  ok: boolean;
  errorCode?: XiaohongshuErrorCode;
  count?: number;
}
interface State {
  revision: number;
  collectorId: string;
  query: string;
  connected: boolean;
  notes: StoredNote[];
  latestIds: string[];
  lastRun: Attempt | null;
  verifiedAt: string | null;
}
interface Plugin {
  db: Pick<LegacyDatabase, 'getRepository' | 'sequelize'>;
  app: Pick<LegacyApp, 'resourceManager' | 'acl'>;
  network: OutboundNetwork;
  project(id: string): Promise<unknown>;
}
function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
const revision = z.number().int().nonnegative();
export class XiaohongshuSource {
  private readonly configs: XiaohongshuCollectorConfig[];
  private readonly active = new Map<
    string,
    { requestId: string; controller: AbortController; committing: boolean }
  >();
  private readonly adapter: XiaohongshuAdapter;
  private readonly generations = new Map<string, number>();
  private changed(id: string) {
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
  }
  constructor(
    private readonly p: Plugin,
    config: unknown = [],
    adapter?: XiaohongshuAdapter,
  ) {
    this.configs = collectorConfigs(config);
    this.adapter = adapter ?? new HttpXiaohongshuAdapter(p.network);
  }
  private allowed(id: string) {
    return this.configs.filter(
      (c) =>
        c.platforms.includes('xiaohongshu') &&
        (!c.projectIds || c.projectIds.includes(id)),
    );
  }
  private config(id: string, collectorId: unknown) {
    const config = this.allowed(id).find((c) => c.id === collectorId);
    if (!config) fail('此项目没有可用的指定小红书采集器，请联系管理员。', 409);
    return config;
  }
  private key(id: string) {
    return `xiaohongshu:${id}`;
  }
  async state(
    id: string,
    transaction?: LegacyTransaction,
  ): Promise<State | null> {
    const row = await this.p.db
      .getRepository('nrSnapshots')
      .findOne({ filter: { key: this.key(id) }, transaction });
    return (row?.get('payload') as State | undefined) ?? null;
  }
  private async mutate(id: string, fn: (state: State | null) => State | null) {
    const result = await this.p.db.sequelize.transaction(
      async (transaction) => {
        await this.p.db.sequelize.query(
          'SELECT pg_advisory_xact_lock(hashtext(:key))',
          { replacements: { key: this.key(id) }, transaction },
        );
        const repo = this.p.db.getRepository('nrSnapshots');
        const row = await repo.findOne({
          filter: { key: this.key(id) },
          transaction,
        });
        const next = fn((row?.get('payload') as State | undefined) ?? null);
        if (next) {
          if (row)
            await repo.update({
              filterByTk: row.id,
              values: { payload: next },
              transaction,
            });
          else
            await repo.create({
              values: { key: this.key(id), payload: next },
              transaction,
            });
        }
        return next;
      },
    );
    this.changed(id);
    return result;
  }
  private expected(state: State | null, value: unknown) {
    const expected = revision.safeParse(value);
    if (!expected.success || (state?.revision ?? 0) !== expected.data)
      fail('小红书连接已变更，请刷新后重试。', 409);
  }
  private describe(id: string, state: State | null) {
    const permitted = Boolean(
      this.allowed(id).find((c) => c.id === state?.collectorId),
    );
    return {
      connected: Boolean(state?.connected && permitted),
      revision: state?.revision ?? 0,
      collectors: this.allowed(id).map(({ id: collectorId, name }) => ({
        id: collectorId,
        name,
      })),
      collectorId: permitted ? state?.collectorId : null,
      query: state?.query ?? '',
      configured: this.allowed(id).length > 0,
      verifiedAt: state?.verifiedAt ?? null,
      lastRun: state?.lastRun ?? null,
      total: state?.notes.length ?? 0,
      running: this.active.get(id)?.requestId ?? null,
      mode: 'browser-search',
      automatic: false,
    };
  }
  private async snapshot(id: string) {
    // A caller may already own a transaction and request parallel snapshots.
    // Retry changes across the awaited read without acquiring another lock.
    for (;;) {
      const generation = this.generations.get(id) ?? 0;
      const state = await this.state(id);
      if (generation === (this.generations.get(id) ?? 0))
        return { state, status: this.describe(id, state) };
    }
  }
  async status(id: string) {
    return (await this.snapshot(id)).status;
  }
  async view(id: string) {
    const { state, status } = await this.snapshot(id);
    return {
      ...status,
      notes: state?.notes ?? [],
      latestIds: state?.latestIds ?? [],
    };
  }
  async connect(id: string, values: Values) {
    const config = this.config(id, values.collectorId);
    const query = querySchema.safeParse(values.query);
    if (!query.success) fail('请填写 2–60 个字符的小红书搜索词。');
    if (values.authorized !== true)
      fail('请确认有权使用采集器中的小红书浏览器会话。');
    await this.mutate(id, (old) => {
      this.expected(old, values.revision);
      return {
        revision: (old?.revision ?? 0) + 1,
        collectorId: config.id,
        query: query.data,
        connected: true,
        notes: old?.notes ?? [],
        latestIds: [],
        lastRun: null,
        verifiedAt: null,
      };
    });
    this.active.get(id)?.controller.abort();
    return this.view(id);
  }
  async test(id: string, values: Values) {
    const config = this.config(id, values.collectorId);
    // A successful health check never sets verifiedAt or claims a logged-in browser.
    return this.adapter.health(config, {
      projectId: id,
      requestId: randomUUID(),
    });
  }
  async search(id: string, values: Values) {
    if (this.active.has(id)) throw new XiaohongshuError('busy');
    const current = await this.state(id);
    this.expected(current, values.revision);
    if (!current?.connected) fail('请先保存小红书连接。', 409);
    const config = this.config(id, current.collectorId);
    // Recheck after the awaited read: two simultaneous HTTP calls must not both enter.
    if (this.active.has(id)) throw new XiaohongshuError('busy');
    const requestId = randomUUID();
    const controller = new AbortController();
    const active = { requestId, controller, committing: false };
    this.active.set(id, active);
    this.changed(id);
    try {
      const result = await this.adapter.search(config, {
        projectId: id,
        requestId,
        query: current.query,
        signal: controller.signal,
      });
      if (controller.signal.aborted) throw new XiaohongshuError('cancelled');
      await this.mutate(id, (state) => {
        // Cancellation can arrive while awaiting the transaction/advisory lock.
        // The synchronous phase transition makes acceptance atomic with starting the write.
        if (controller.signal.aborted) throw new XiaohongshuError('cancelled');
        if (!state?.connected || state.revision !== current.revision)
          fail('小红书连接已变更，本次结果未保存。', 409);
        active.committing = true;
        const notes = new Map(state.notes.map((n) => [n.id, n]));
        for (const note of result.notes)
          notes.set(note.id, {
            ...note,
            firstSeenAt: notes.get(note.id)?.firstSeenAt ?? result.collectedAt,
            lastSeenAt: result.collectedAt,
            query: current.query,
          });
        return {
          ...state,
          notes: [...notes.values()]
            .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
            .slice(0, 1000),
          latestIds: result.notes.map((n) => n.id),
          verifiedAt: result.collectedAt,
          lastRun: {
            at: result.collectedAt,
            ok: true,
            count: result.notes.length,
          },
        };
      });
    } catch (error) {
      const code =
        error instanceof XiaohongshuError ? error.code : 'invalid_response';
      await this.mutate(id, (state) =>
        !state || state.revision !== current.revision
          ? state
          : {
              ...state,
              lastRun: {
                at: new Date().toISOString(),
                ok: false,
                errorCode: code,
              },
            },
      );
      if (error instanceof XiaohongshuError) throw error;
      if ((error as { status?: number }).status === 409) throw error;
      throw new XiaohongshuError(code);
    } finally {
      if (this.active.get(id)?.requestId === requestId) {
        this.active.delete(id);
        this.changed(id);
      }
    }
    return this.view(id);
  }
  async cancel(id: string, values: Values) {
    const active = this.active.get(id);
    if (!active || values.requestId !== active.requestId)
      fail('这次小红书采集已经结束，请刷新查看结果。', 409);
    if (active.committing)
      fail('采集结果正在保存，已无法取消，请稍后查看结果。', 409);
    active.controller.abort();
    return this.status(id);
  }
  async disconnect(id: string, values: Values) {
    await this.mutate(id, (state) => {
      this.expected(state, values.revision);
      return state
        ? { ...state, connected: false, revision: state.revision + 1 }
        : null;
    });
    this.active.get(id)?.controller.abort();
    return this.view(id);
  }
  stop() {
    for (const entry of this.active.values()) entry.controller.abort();
  }
  register() {
    const wrap =
      (fn: (id: string, values: Values) => unknown) =>
      async (ctx: Context, next: () => Promise<void>) => {
        await requireAccess(ctx);
        ctx.set('Cache-Control', 'no-store');
        const values = (ctx.action.params.values ?? {}) as Values;
        const id = projectId(values.projectId);
        await this.p.project(id);
        ctx.body = await fn(id, values);
        await next();
      };
    const actions = {
      status: wrap((id) => this.status(id)),
      view: wrap((id) => this.view(id)),
      connect: wrap((id, v) => this.connect(id, v)),
      test: wrap((id, v) => this.test(id, v)),
      search: wrap((id, v) => this.search(id, v)),
      cancel: wrap((id, v) => this.cancel(id, v)),
      disconnect: wrap((id, v) => this.disconnect(id, v)),
    };
    this.p.app.resourceManager.define({ name: 'nrXiaohongshu', actions });
    this.p.app.acl.allow('nrXiaohongshu', Object.keys(actions), 'loggedIn');
  }
}
export { XHS_MESSAGES };
