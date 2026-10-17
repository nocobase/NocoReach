import {
  isCollectorConnectionError,
  type CollectorResolver,
} from './collector-connections.js';
import { randomUUID } from 'node:crypto';
import { projectId, requireAccess } from './policy.js';
import type { LegacyApp } from './legacy/app.js';
import type { LegacyContext } from './legacy/context.js';
import type { LegacyDatabase, LegacyTransaction } from './legacy/database.js';
import type { OutboundNetwork } from './outbound-network.js';
import type { BrowserCollectorConfig } from './browser-collector-config.js';
import {
  BilibiliError,
  bilibiliConfig,
  HttpBilibiliAdapter,
  type BilibiliAdapter,
  type BilibiliConfig,
  type BilibiliErrorCode,
  type BilibiliMetadata,
} from './bilibili-adapter.js';
export { BilibiliError, bilibiliConfig } from './bilibili-adapter.js';

const MAX_VIDEOS = 500;
interface Provenance {
  kind: 'search' | 'video';
  value: string;
  url: string;
}
export interface BilibiliVideo extends BilibiliMetadata {
  id: string;
  url: string;
  collectedAt: string;
  firstSeenAt: string;
  configRevision: string;
  sources: Provenance[];
}
interface LastRun {
  at: string;
  ok: boolean;
  errorCode: BilibiliErrorCode | null;
  retryAt: string | null;
  found: number;
  added: number;
  capped: boolean;
  partial: boolean;
}
interface State extends BilibiliConfig {
  revision: string;
  connected: boolean;
  videos: Record<string, BilibiliVideo>;
  lastRun: LastRun | null;
  verifiedAt: string | null;
}
interface Host {
  collectors: CollectorResolver;
  db: LegacyDatabase;
  app: LegacyApp;
  network: OutboundNetwork;
  project(id: string): Promise<unknown>;
}
interface Operation {
  id: string;
  controller: AbortController;
  committing: boolean;
}
export class BilibiliSource {
  private readonly operations = new Map<string, Operation>();
  private readonly writes = new Map<string, Promise<unknown>>();
  private readonly generations = new Map<string, number>();
  private changed(id: string) {
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
  }
  private readonly adapter: BilibiliAdapter;
  constructor(
    private readonly p: Host,
    adapter?: BilibiliAdapter,
  ) {
    this.adapter = adapter ?? new HttpBilibiliAdapter(p.network);
    this.p.network?.bind(this, ['sync', 'test'], 'bilibili');
  }
  private repo() {
    return this.p.db.getRepository('nrSnapshots');
  }
  isCollectorBusy(id: string) {
    return this.operations.has(id) || this.writes.has(id);
  }
  async resetCollector(id: string, collectorId: string) {
    await this.mutate(id, (old) =>
      old
        ? {
            ...old,
            collectorId,
            revision: randomUUID(),
            verifiedAt: null,
            lastRun: null,
          }
        : null,
    );
  }
  private key(id: string) {
    return `bilibili:${id}`;
  }
  private allowed(id: string) {
    return this.p.collectors.allowed(id, 'bilibili');
  }
  private collector(id: string, collectorId: unknown) {
    const config = this.allowed(id).find((c) => c.id === collectorId);
    if (!config) throw new BilibiliError('not_connected');
    return config;
  }
  async state(
    id: string,
    transaction?: LegacyTransaction,
  ): Promise<State | null> {
    return (
      ((
        await this.repo().findOne({
          filter: { key: this.key(id) },
          transaction,
        })
      )?.get('payload') as State | null) || null
    );
  }
  private serialize<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const task = (this.writes.get(id) || Promise.resolve())
      .catch(() => undefined)
      .then(fn);
    this.writes.set(id, task);
    void task
      .finally(() => {
        if (this.writes.get(id) === task) this.writes.delete(id);
      })
      .catch(() => undefined);
    return task;
  }
  private async mutate(id: string, fn: (state: State | null) => State | null) {
    const result = await this.p.db.sequelize.transaction(
      async (transaction) => {
        await this.p.db.sequelize.query(
          'SELECT pg_advisory_xact_lock(hashtext(:key))',
          { replacements: { key: this.key(id) }, transaction },
        );
        const row = await this.repo().findOne({
          filter: { key: this.key(id) },
          transaction,
        });
        const state = fn((row?.get('payload') as State | null) || null);
        if (row)
          await this.repo().update({
            filterByTk: row.id,
            values: { payload: state },
            transaction,
          });
        else if (state)
          await this.repo().create({
            values: { key: this.key(id), payload: state },
            transaction,
          });
        return state;
      },
    );
    this.changed(id);
    return result;
  }
  private expected(state: State | null, revision: unknown) {
    if ((state?.revision ?? null) !== revision)
      throw new BilibiliError('conflict');
  }
  async connect(id: string, values: unknown) {
    const { revision, ...config } = bilibiliConfig(values);
    this.collector(id, config.collectorId);
    let changed = false;
    await this.serialize(id, () =>
      this.mutate(id, (old) => {
        this.expected(old, revision);
        const same =
          old?.connected &&
          JSON.stringify([old.collectorId, old.terms, old.bvids]) ===
            JSON.stringify([config.collectorId, config.terms, config.bvids]);
        if (same) return old;
        changed = true;
        return {
          ...config,
          revision: randomUUID(),
          connected: true,
          videos: old?.videos || {},
          lastRun: null,
          verifiedAt: null,
        };
      }),
    );
    if (changed) this.operations.get(id)?.controller.abort();
    return this.status(id);
  }
  async disconnect(id: string, revision: unknown) {
    await this.serialize(id, () =>
      this.mutate(id, (old) => {
        this.expected(old, revision);
        return old
          ? {
              ...old,
              revision: randomUUID(),
              connected: false,
              verifiedAt: null,
            }
          : null;
      }),
    );
    this.operations.get(id)?.controller.abort();
    return this.status(id);
  }
  async cancel(id: string, requestId: unknown) {
    const operation = this.operations.get(id);
    if (operation && operation.id === requestId) {
      if (operation.committing) throw new BilibiliError('busy');
      operation.controller.abort();
    }
    return this.status(id);
  }
  async test(id: string, collectorId: unknown) {
    return this.adapter.health(this.collector(id, collectorId), {
      projectId: id,
      requestId: randomUUID(),
    });
  }
  async sync(id: string) {
    if (this.operations.has(id)) throw new BilibiliError('busy');
    const op: Operation = {
      id: randomUUID(),
      controller: new AbortController(),
      committing: false,
    };
    this.operations.set(id, op);
    this.changed(id);
    let revision: string | undefined;
    try {
      const state = await this.state(id);
      if (!state?.connected) throw new BilibiliError('not_connected');
      revision = state.revision;
      const config = this.collector(id, state.collectorId);
      if (
        state.lastRun?.retryAt &&
        Date.parse(state.lastRun.retryAt) > Date.now()
      )
        throw new BilibiliError('rate_limited');
      const found: BilibiliVideo[] = [];
      let failure: BilibiliError | undefined;
      const signal = AbortSignal.any([
        op.controller.signal,
        AbortSignal.timeout(120_000),
      ]);
      const requests = [
        ...state.bvids.map((value) => ({
          kind: 'video' as const,
          value,
          url: `https://www.bilibili.com/video/${value}`,
        })),
        ...state.terms.map((value) => ({
          kind: 'search' as const,
          value,
          url: `https://search.bilibili.com/all?keyword=${encodeURIComponent(value)}`,
        })),
      ];
      try {
        for (const source of requests) {
          signal.throwIfAborted();
          const input = { projectId: id, requestId: op.id, signal };
          const result =
            source.kind === 'video'
              ? await this.adapter.video(config, {
                  ...input,
                  bvid: source.value,
                })
              : await this.adapter.search(config, {
                  ...input,
                  query: source.value,
                });
          signal.throwIfAborted();
          for (const item of result.items)
            found.push({
              ...item,
              id: item.bvid,
              url: `https://www.bilibili.com/video/${item.bvid}`,
              collectedAt: result.collectedAt,
              firstSeenAt: result.collectedAt,
              configRevision: state.revision,
              sources: [source],
            });
        }
      } catch (error) {
        if (op.controller.signal.aborted) throw new BilibiliError('cancelled');
        // The adapter receives the combined signal, so its cancellation error
        // can also mean our batch deadline. Explicit user cancellation was
        // checked above; an aborted batch must be reported as a timeout.
        failure = signal.aborted
          ? new BilibiliError('timeout')
          : error instanceof BilibiliError
            ? error
            : new BilibiliError('invalid_response');
      }
      if (op.controller.signal.aborted) throw new BilibiliError('cancelled');
      const at = new Date().toISOString();
      await this.serialize(id, async () => {
        if (op.controller.signal.aborted) throw new BilibiliError('cancelled');
        await this.mutate(id, (cur) => {
          if (op.controller.signal.aborted)
            throw new BilibiliError('cancelled');
          op.committing = true;
          if (!cur?.connected || cur.revision !== state.revision)
            throw new BilibiliError('conflict');
          const partial =
            found.length > 0 &&
            !!failure &&
            ['unconfirmed_empty', 'not_found'].includes(failure.code);
          const usable = (!failure || partial) && found.length > 0;
          const all = { ...cur.videos };
          const current = new Map<string, BilibiliVideo>();
          let added = 0;
          if (usable)
            for (const video of found) {
              const prior = current.get(video.id);
              const old = all[video.id];
              if (!old) added++;
              const sources = [
                ...new Map(
                  [...(prior?.sources || []), ...video.sources].map((s) => [
                    `${s.kind}:${s.value}`,
                    s,
                  ]),
                ).values(),
              ];
              // Within one batch, search summaries must not erase the preceding richer detail.
              all[video.id] = {
                ...video,
                ...(prior?.completeness === 'video_metadata' ? prior : {}),
                firstSeenAt: old?.firstSeenAt || video.firstSeenAt,
                sources,
              };
              current.set(video.id, all[video.id]);
            }
          const kept = Object.values(all)
            .sort(
              (a, b) =>
                b.collectedAt.localeCompare(a.collectedAt) ||
                a.id.localeCompare(b.id),
            )
            .slice(0, MAX_VIDEOS);
          return {
            ...cur,
            videos: Object.fromEntries(kept.map((v) => [v.id, v])),
            verifiedAt: usable ? at : cur.verifiedAt,
            lastRun: {
              at,
              ok: !failure && usable,
              errorCode:
                failure?.code || (!usable ? 'unconfirmed_empty' : null),
              retryAt:
                failure?.code === 'rate_limited'
                  ? new Date(Date.now() + 60000).toISOString()
                  : null,
              found: usable ? current.size : 0,
              added,
              capped: Object.keys(all).length > MAX_VIDEOS,
              partial,
            },
          };
        });
      });
    } catch (error) {
      if (error instanceof BilibiliError && error.code === 'cancelled') {
        await this.serialize(id, () =>
          this.mutate(id, (cur) => {
            // A cancelled old batch must not annotate a replacement configuration.
            if (
              !cur?.connected ||
              cur.revision !== revision ||
              this.operations.get(id) !== op
            )
              return cur;
            return {
              ...cur,
              lastRun: {
                at: new Date().toISOString(),
                ok: false,
                errorCode: 'cancelled',
                retryAt: null,
                found: 0,
                added: 0,
                capped: false,
                partial: false,
              },
            };
          }),
        );
      }
      throw error;
    } finally {
      if (this.operations.get(id) === op) {
        this.operations.delete(id);
        this.changed(id);
      }
    }
    return this.status(id);
  }
  async status(id: string) {
    // Retry changes across the awaited read, including a collection starting
    // and finishing, without taking a second lock in a caller transaction.
    for (;;) {
      const generation = this.generations.get(id) ?? 0;
      const state = await this.state(id);
      if (generation === (this.generations.get(id) ?? 0))
        return this.describe(id, state);
    }
  }
  private describe(id: string, state: State | null) {
    const op = this.operations.get(id);
    let allowed: BrowserCollectorConfig[] = [];
    try {
      allowed = this.allowed(id);
    } catch (error) {
      // Unreadable credentials disable collection, but must not hide saved videos.
      if (!isCollectorConnectionError(error, 'unreadable')) throw error;
    }
    const available = allowed.some((c) => c.id === state?.collectorId);
    const videos = Object.values(state?.videos || {});
    return {
      connected: !!state?.connected && available,
      configured: allowed.length > 0,
      revision: state?.revision || null,
      collectors: allowed.map(({ id: collectorId, name }) => ({
        id: collectorId,
        name,
      })),
      collectorId: available ? state?.collectorId : null,
      terms: state?.terms || [],
      bvids: state?.bvids || [],
      verifiedAt: state?.connected && available ? state.verifiedAt : null,
      checking: !!op,
      requestId: op?.id || null,
      total: videos.length,
      lastRun: state?.lastRun || null,
      coverage: 'first_page_only' as const,
      mode: 'browser-collector' as const,
      automatic: false,
      network: 'collector_browser' as const,
      recent: videos
        .sort(
          (a, b) =>
            b.collectedAt.localeCompare(a.collectedAt) ||
            a.id.localeCompare(b.id),
        )
        .slice(0, 5)
        .map((v) => ({
          ...v,
          fromEarlierConfig: v.configRevision !== state?.revision,
        })),
    };
  }
  stop() {
    for (const op of this.operations.values()) op.controller.abort();
  }
  register() {
    const wrap =
      (fn: (id: string, v: Record<string, unknown>) => Promise<unknown>) =>
      async (ctx: LegacyContext, next: () => Promise<void>) => {
        await requireAccess(ctx);
        ctx.set('Cache-Control', 'no-store');
        try {
          const v = (ctx.action.params.values || {}) as Record<string, unknown>,
            id = projectId(v.projectId);
          await this.p.project(id);
          ctx.body = await fn(id, v);
          await next();
        } catch (error) {
          if (error instanceof BilibiliError)
            ctx.throw(error.status, error.message);
          throw error;
        }
      };
    const actions = {
      status: wrap((id) => this.status(id)),
      connect: wrap((id, v) => this.connect(id, v)),
      test: wrap((id, v) => this.test(id, v.collectorId)),
      sync: wrap((id) => this.sync(id)),
      cancel: wrap((id, v) => this.cancel(id, v.requestId)),
      disconnect: wrap((id, v) => this.disconnect(id, v.revision)),
    };
    this.p.app.resourceManager.define({ name: 'nrBilibili', actions });
    this.p.app.acl.allow('nrBilibili', Object.keys(actions), 'loggedIn');
  }
}
