import {
  isCollectorConnectionError,
  type CollectorResolver,
  type ResolvedCollector,
} from './collector-connections.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { projectId, requireAccess } from './policy.js';
import { collectorPeriod, type WindowFor } from './collector-views.js';
import type { LegacyApp } from './legacy/app.js';
import type { LegacyDatabase, LegacyTransaction } from './legacy/database.js';
import type { legacyContext } from './legacy/context.js';
import type { OutboundNetwork } from './outbound-network.js';
import {
  HttpXiaohongshuAdapter,
  querySchema,
  XiaohongshuError,
  type XiaohongshuAdapter,
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
  /** A read the busy collector turned away, waiting for its retry (retries made or waiting, including this one). */
  queued?: { retries: number; retryAt: string } | null;
}
interface Plugin {
  collectors: CollectorResolver;
  db: Pick<LegacyDatabase, 'getRepository' | 'sequelize'>;
  app: Pick<LegacyApp, 'resourceManager' | 'acl' | 'logger'>;
  network: OutboundNetwork;
  project(id: string): Promise<unknown>;
  projectIds(): Promise<(string | number)[]>;
}
// As for Bilibili: a collector busy with another read is not a failure. The read waits about ten minutes and tries
// again, at most three times; reading stays manual otherwise.
const BUSY_RETRY_MS = 10 * 60000;
const BUSY_RETRIES = 3;
function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
const revision = z.number().int().nonnegative();
export class XiaohongshuSource {
  private readonly active = new Map<
    string,
    { requestId: string; controller: AbortController; committing: boolean }
  >();
  private readonly clearing = new Set<string>();
  private readonly adapter: XiaohongshuAdapter;
  private readonly generations = new Map<string, number>();
  private ticking = false;
  private changed(id: string) {
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
  }
  constructor(
    private readonly p: Plugin,
    adapter?: XiaohongshuAdapter,
  ) {
    this.adapter = adapter ?? new HttpXiaohongshuAdapter(p.network);
  }
  private allowed(id: string) {
    return this.p.collectors.allowed(id, 'xiaohongshu');
  }
  private config(id: string, collectorId: unknown) {
    const config = this.allowed(id).find((c) => c.id === collectorId);
    if (!config)
      fail(systemMessageText('xiaohongshu.errors.collectorUnavailable'), 409);
    return config;
  }
  isCollectorBusy(id: string) {
    return this.active.has(id) || this.clearing.has(id);
  }
  async resetCollector(id: string, collectorId: string) {
    await this.mutate(id, (old) =>
      old
        ? {
            ...old,
            collectorId,
            revision: old.revision + 1,
            verifiedAt: null,
            lastRun: null,
            latestIds: [],
            queued: null,
          }
        : null,
    );
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
      fail(systemMessageText('xiaohongshu.errors.connectionChanged'), 409);
  }
  private describe(id: string, state: State | null) {
    let allowed: ResolvedCollector[] = [];
    try {
      allowed = this.allowed(id);
    } catch (error) {
      // Unreadable credentials disable collection, but must not hide saved notes.
      if (!isCollectorConnectionError(error, 'unreadable')) throw error;
    }
    const permitted = allowed.some((c) => c.id === state?.collectorId);
    const connected = Boolean(state?.connected && permitted);
    return {
      connected,
      revision: state?.revision ?? 0,
      collectors: allowed.map(({ id: collectorId, name, nameKey }) => ({
        id: collectorId,
        name,
        nameKey,
      })),
      collectorId: permitted ? state?.collectorId : null,
      query: state?.query ?? '',
      configured: allowed.length > 0,
      verifiedAt: state?.verifiedAt ?? null,
      lastRun: state?.lastRun ?? null,
      total: state?.notes.length ?? 0,
      running: this.active.get(id)?.requestId ?? null,
      queued: connected ? (state?.queued ?? null) : null,
      // The notes the last searches found, newest first, and when the earliest saved note was first found.
      recent: (state?.notes ?? []).slice(0, 5).map((note) => ({
        id: note.id,
        title: note.title,
        url: note.url,
        likes: note.likes,
        likesText: note.likesText,
        estimatedPublishedAt: note.estimatedPublishedAt,
      })),
      recordingSince: (state?.notes ?? []).reduce<string | null>(
        (min, note) =>
          !min || note.firstSeenAt < min ? note.firstSeenAt : min,
        null,
      ),
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
  /** The data page: notes published in the range, by their ID-derived date or when first collected. */
  async report(id: string, values: Values, windowFor: WindowFor) {
    const { state, status } = await this.snapshot(id);
    const period = collectorPeriod(
      this.p,
      id,
      'xiaohongshu',
      values,
      windowFor,
      state?.notes ?? [],
      (note) => ({
        published: note.estimatedPublishedAt,
        seen: note.firstSeenAt,
      }),
      [{ key: 'likes', value: (note) => note.likes }],
      (note) => [{ kind: 'term', name: note.query }],
    );
    return {
      ...status,
      window: period.window,
      kpis: period.kpis,
      matched: period.matched,
      trend: period.trend,
      groups: period.groups,
      notes: period.items,
    };
  }
  async connect(id: string, values: Values) {
    const config = this.config(id, values.collectorId);
    const query = querySchema.safeParse(values.query);
    if (!query.success)
      fail(systemMessageText('xiaohongshu.errors.invalidQuery'));
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
    if (this.active.has(id) || this.clearing.has(id))
      throw new XiaohongshuError('busy');
    const current = await this.state(id);
    this.expected(current, values.revision);
    if (!current?.connected)
      fail(systemMessageText('xiaohongshu.errors.connectionRequired'), 409);
    const config = this.config(id, current.collectorId);
    // Recheck after the awaited read: two simultaneous HTTP calls must not both enter.
    if (this.active.has(id) || this.clearing.has(id))
      throw new XiaohongshuError('busy');
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
          fail(systemMessageText('xiaohongshu.errors.resultsNotSaved'), 409);
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
          queued: null,
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
      let queued = false;
      await this.mutate(id, (state) => {
        if (!state || state.revision !== current.revision) return state;
        const retries = state.queued?.retries ?? 0;
        // The collector turned the read away: it waits for a retry and keeps the last read's outcome.
        if (code === 'busy' && retries < BUSY_RETRIES) {
          queued = true;
          return {
            ...state,
            queued: {
              retries: retries + 1,
              retryAt: new Date(Date.now() + BUSY_RETRY_MS).toISOString(),
            },
          };
        }
        return {
          ...state,
          queued: null,
          lastRun: {
            at: new Date().toISOString(),
            ok: false,
            errorCode: code,
          },
        };
      });
      if (!queued) {
        if (error instanceof XiaohongshuError) throw error;
        if ((error as { status?: number }).status === 409) throw error;
        throw new XiaohongshuError(code);
      }
    } finally {
      if (this.active.get(id)?.requestId === requestId) {
        this.active.delete(id);
        this.changed(id);
      }
    }
    return this.view(id);
  }
  async clear(id: string, values: Values) {
    if (this.active.has(id) || this.clearing.has(id))
      throw new XiaohongshuError('busy');
    this.clearing.add(id);
    try {
      await this.mutate(id, (state) => {
        this.expected(state, values.revision);
        return state
          ? {
              ...state,
              revision: state.revision + 1,
              notes: [],
              latestIds: [],
              lastRun: null,
              verifiedAt: null,
              queued: null,
            }
          : null;
      });
    } finally {
      this.clearing.delete(id);
    }
    return this.view(id);
  }
  async cancel(id: string, values: Values) {
    const active = this.active.get(id);
    if (!active || values.requestId !== active.requestId)
      fail(systemMessageText('xiaohongshu.errors.collectionEnded'), 409);
    if (active.committing)
      fail(systemMessageText('xiaohongshu.errors.alreadySaving'), 409);
    active.controller.abort();
    return this.status(id);
  }
  async disconnect(id: string, values: Values) {
    await this.mutate(id, (state) => {
      this.expected(state, values.revision);
      return state
        ? {
            ...state,
            connected: false,
            revision: state.revision + 1,
            queued: null,
          }
        : null;
    });
    this.active.get(id)?.controller.abort();
    return this.view(id);
  }
  /** The cron's tick: only a read the busy collector turned away is retried; there is no daily read. */
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const value of await this.p.projectIds()) {
        const id = String(value);
        try {
          const state = await this.state(id);
          if (
            !state?.queued ||
            this.isCollectorBusy(id) ||
            Date.parse(state.queued.retryAt) > Date.now() ||
            !this.describe(id, state).connected
          )
            continue;
          await this.search(id, { revision: state.revision });
        } catch {
          this.p.app.logger.warn('NocoReach Xiaohongshu tick failed', {
            projectId: id,
          });
        }
      }
    } finally {
      this.ticking = false;
    }
  }
  stop() {
    for (const entry of this.active.values()) entry.controller.abort();
  }
  register(windowFor: WindowFor) {
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
      report: wrap((id, v) => this.report(id, v, windowFor)),
      connect: wrap((id, v) => this.connect(id, v)),
      test: wrap((id, v) => this.test(id, v)),
      search: wrap((id, v) => this.search(id, v)),
      cancel: wrap((id, v) => this.cancel(id, v)),
      clear: wrap((id, v) => this.clear(id, v)),
      disconnect: wrap((id, v) => this.disconnect(id, v)),
    };
    this.p.app.resourceManager.define({ name: 'nrXiaohongshu', actions });
    this.p.app.acl.allow('nrXiaohongshu', Object.keys(actions), 'loggedIn');
  }
}
