import type { CollectorConnections } from './collector-connections.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
import { randomUUID } from 'node:crypto';
import { HttpYouTubeProvider } from './youtube-collector.js';
import { YouTubeLibrary } from './youtube-library.js';
import { projectId, requireAccess } from './policy.js';
import { due, nextAt, record } from './sync-policy.js';
import type { LegacyApp } from './legacy/app.js';
import type { LegacyContext } from './legacy/context.js';
import type { LegacyDatabase } from './legacy/database.js';
import type { OutboundNetwork } from './outbound-network.js';
import {
  YouTubeError,
  publicError,
  researchInput,
  type Video,
  type YouTubeErrorCode,
} from './youtube-provider.js';

interface Attempt {
  at: string;
  ok: boolean;
  errors: string[];
  attempts: number;
  lastSuccessAt: string | null;
  code?: YouTubeErrorCode;
  needsAttention?: boolean;
}
export interface YouTubeState {
  revision: string;
  analysisVideoIds?: string[];
  terms: string[];
  videoIds: string[];
  autoSync: boolean;
  verifiedAt: string | null;
  fetchedAt: string | null;
  configured?: boolean;
  lastSync: Attempt | null;
}
interface Host {
  collectors?: CollectorConnections;
  db: LegacyDatabase;
  app: LegacyApp;
  network: OutboundNetwork;
  browserCollectors?: unknown;
  project: (id: string) => Promise<unknown>;
  projectIds: () => Promise<(string | number)[]>;
}
interface Reader {
  search: HttpYouTubeProvider['search'];
  video: HttpYouTubeProvider['video'];
}
interface Running {
  id: string;
  controller: AbortController;
  done: Promise<void>;
  committing: boolean;
}
// record is shared with the classic services, whose inferred errors type is unknown[].
const attempt = (
  previous: Attempt | null,
  at: string,
  ok: boolean,
  errors: string[],
): Attempt => record(previous, { at, ok, errors }) as Attempt;

export class YouTubeSource {
  private running = new Map<string, Running>();
  private ticking = false;
  private changing = new Set<string>();
  private stopped = false;
  private versions = new Map<string, number>();
  private library: YouTubeLibrary;
  private changed(id: string) {
    this.versions.set(id, (this.versions.get(id) || 0) + 1);
  }
  private reader: Reader;
  constructor(
    private p: Host,
    reader?: Reader,
  ) {
    this.library = new YouTubeLibrary(p.db);
    this.reader =
      reader ||
      new HttpYouTubeProvider(
        p.network,
        p.browserCollectors,
        undefined,
        p.collectors ? (id) => p.collectors!.allowed(id, 'youtube') : undefined,
      );
    p.network.bind(this, ['connect', 'sync'], 'youtube');
  }
  private repo() {
    return this.p.db.getRepository('nrSnapshots');
  }
  isCollectorBusy(id: string) {
    return this.running.has(id) || this.changing.has(id);
  }
  async resetCollector(id: string, _collectorId: string) {
    await this.mutate(id, (old) =>
      old
        ? {
            ...old,
            revision: randomUUID(),
            verifiedAt: null,
            lastSync: null,
            analysisVideoIds: [],
          }
        : null,
    );
  }
  private key(id: string) {
    return `youtube:${projectId(id)}`;
  }
  async state(id: string): Promise<YouTubeState | null> {
    const row = await this.repo().findOne({ filter: { key: this.key(id) } });
    const state = row?.get('payload') as YouTubeState | undefined;
    return state || null;
  }
  private async mutate(
    id: string,
    fn: (
      state: YouTubeState | null,
    ) => YouTubeState | null | Promise<YouTubeState | null>,
  ) {
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
        const state = await fn((row?.get('payload') as YouTubeState) || null);
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
  async connect(id: string, values: Record<string, unknown>) {
    const input = researchInput(values);
    if (this.stopped || this.running.has(id) || this.changing.has(id))
      throw new YouTubeError('config_changed');
    this.changing.add(id);
    try {
      await this.mutate(id, (old) => {
        if ((old?.revision || null) !== (values.revision || null))
          throw new YouTubeError('config_changed');
        const same =
          old &&
          JSON.stringify([old.terms, old.videoIds]) ===
            JSON.stringify([input.terms, input.videoIds]);
        return {
          ...input,
          configured: true,
          analysisVideoIds: same ? old.analysisVideoIds : [],
          autoSync: values.autoSync === true,
          revision: randomUUID(),
          verifiedAt: same ? old.verifiedAt : null,
          fetchedAt: old?.fetchedAt || null,
          lastSync: same ? old.lastSync : null,
        };
      });
    } finally {
      this.changing.delete(id);
    }
    return this.sync(id);
  }
  async sync(id: string) {
    projectId(id);
    if (this.stopped) throw new YouTubeError('cancelled');
    if (this.changing.has(id)) throw new YouTubeError('config_changed');
    if (!this.running.has(id)) {
      const controller = new AbortController();
      let finish!: () => void;
      const done = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const running: Running = {
        id: randomUUID(),
        controller,
        done,
        committing: false,
      };
      // Reserve synchronously so a settings write cannot race the first state read.
      this.running.set(id, running);
      this.changed(id);
      const cleanup = () => {
        if (this.running.get(id) === running) {
          this.running.delete(id);
          this.changed(id);
        }
        finish();
      };
      try {
        const state = await this.state(id);
        if (!state || state.configured === false)
          throw new YouTubeError('invalid_input');
        void this.collect(id, state, running)
          .catch(() => undefined)
          .finally(cleanup);
      } catch (error) {
        cleanup();
        throw error;
      }
    }
    return this.status(id);
  }
  private async collect(id: string, state: YouTubeState, running: Running) {
    const cancellation = running.controller.signal;
    const signal = AbortSignal.any([cancellation, AbortSignal.timeout(180000)]);
    const at = new Date().toISOString();
    try {
      const ids = new Set(state.videoIds);
      for (const term of state.terms) {
        if (signal.aborted)
          throw new YouTubeError(
            cancellation.aborted ? 'cancelled' : 'timeout',
          );
        for (const video of await this.reader.search(term, signal, {
          projectId: id,
          requestId: randomUUID(),
        }))
          ids.add(video);
      }
      const videos: Video[] = [];
      for (const video of [...ids].slice(0, 15)) {
        if (signal.aborted)
          throw new YouTubeError(
            cancellation.aborted ? 'cancelled' : 'timeout',
          );
        videos.push(
          await this.reader.video(video, signal, {
            projectId: id,
            requestId: randomUUID(),
          }),
        );
      }
      if (signal.aborted)
        throw new YouTubeError(cancellation.aborted ? 'cancelled' : 'timeout');
      const fetchedAt = new Date().toISOString(),
        captionFailure = videos.some((v) => v.transcript.status === 'failed');
      await this.mutate(id, async (current) => {
        // The transaction/lock may have queued after the collection finished.
        // Make the cancellation cutoff synchronous with accepting this write.
        if (signal.aborted)
          throw new YouTubeError(
            cancellation.aborted ? 'cancelled' : 'timeout',
          );
        if (
          this.running.get(id) !== running ||
          current?.revision !== state.revision
        )
          return current;
        running.committing = true;
        await this.library.save(id, videos);
        return {
          ...current,
          analysisVideoIds: videos.map((video) => video.id),
          verifiedAt: fetchedAt,
          fetchedAt,
          lastSync: attempt(
            current.lastSync,
            fetchedAt,
            true,
            captionFailure
              ? [systemMessageText('youtube.partialCaptions')]
              : [],
          ),
        };
      });
    } catch (error) {
      const e = signal.aborted
        ? new YouTubeError(cancellation.aborted ? 'cancelled' : 'timeout')
        : publicError(error);
      await this.mutate(id, (current) =>
        current?.revision === state.revision
          ? {
              ...current,
              lastSync: {
                ...attempt(current.lastSync, at, false, [e.message]),
                code: e.code,
                needsAttention: ![
                  'network_error',
                  'timeout',
                  'collector_unreachable',
                  'collector_busy',
                ].includes(e.code),
              },
            }
          : current,
      );
    }
  }
  async cancel(id: string, values: Record<string, unknown>) {
    const running = this.running.get(id);
    if (
      !running ||
      values.runId !== running.id ||
      running.committing ||
      this.changing.has(id)
    )
      throw new YouTubeError('config_changed');
    this.changing.add(id);
    try {
      running.controller.abort();
      await running.done;
      await this.mutate(id, (current) =>
        current
          ? { ...current, autoSync: false, revision: randomUUID() }
          : null,
      );
    } finally {
      this.changing.delete(id);
    }
    return this.status(id);
  }
  async disconnect(id: string, values: Record<string, unknown>) {
    if (this.changing.has(id)) throw new YouTubeError('config_changed');
    this.changing.add(id);
    try {
      const state = await this.state(id);
      if ((state?.revision || null) !== (values.revision || null))
        throw new YouTubeError('config_changed');
      const running = this.running.get(id);
      running?.controller.abort();
      await running?.done;
      await this.mutate(id, (current) => {
        if ((current?.revision || null) !== (values.revision || null))
          throw new YouTubeError('config_changed');
        return current
          ? {
              ...current,
              configured: false,
              terms: [],
              videoIds: [],
              autoSync: false,
              revision: randomUUID(),
              verifiedAt: null,
              lastSync: null,
            }
          : null;
      });
    } finally {
      this.changing.delete(id);
    }
    return this.status(id);
  }
  async clear(id: string, values: Record<string, unknown>) {
    if (this.changing.has(id) || this.running.has(id))
      throw new YouTubeError('config_changed');
    this.changing.add(id);
    try {
      await this.mutate(id, async (current) => {
        if (!current || current.revision !== values.revision)
          throw new YouTubeError('config_changed');
        await this.library.clear(id);
        return {
          ...current,
          revision: randomUUID(),
          autoSync: false,
          fetchedAt: null,
          verifiedAt: null,
          lastSync: null,
        };
      });
    } finally {
      this.changing.delete(id);
    }
    return this.status(id);
  }
  async analysisData(id: string) {
    const state = await this.state(id);
    if (!state || state.configured === false || !state.verifiedAt) return [];
    // Legacy libraries lack discovery provenance. Refresh once before analysing them.
    const videos = await this.library.selected(
      id,
      state.analysisVideoIds || [],
    );
    const current = await this.state(id);
    return current?.revision === state.revision && current.configured !== false
      ? videos
      : [];
  }
  async status(id: string, page: unknown = 1) {
    // Do not pair a stale snapshot with a newer terminal lifecycle state: the
    // browser stops polling when syncing=false. Repeat reads crossing a write/run.
    let state: YouTubeState | null, version: number;
    let saved: Awaited<ReturnType<YouTubeLibrary['list']>>;
    do {
      version = this.versions.get(id) || 0;
      [state, saved] = await Promise.all([
        this.state(id),
        this.library.list(id, page),
      ]);
    } while (version !== (this.versions.get(id) || 0));
    const running = this.running.get(id);
    return {
      configured: Boolean(state && state.configured !== false),
      connected: Boolean(state?.verifiedAt && state?.fetchedAt),
      syncing: Boolean(running),
      runId: running?.id || null,
      scope: 'public-research' as const,
      analyticsAvailable: false,
      revision: state?.revision || null,
      terms: state?.terms || [],
      videoUrls:
        state?.videoIds.map((v) => `https://www.youtube.com/watch?v=${v}`) ||
        [],
      autoSync: state?.autoSync || false,
      fetchedAt: state?.fetchedAt || null,
      ...saved,
      lastSync: state?.lastSync || null,
      nextSyncAt:
        state?.autoSync && !state.lastSync?.needsAttention
          ? nextAt(state.lastSync)
          : null,
    };
  }
  async settled(id: string) {
    await this.running.get(id)?.done;
  }
  async tick() {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      for (const value of await this.p.projectIds()) {
        const id = String(value);
        try {
          const state = await this.state(id);
          if (
            !state?.autoSync ||
            state.lastSync?.needsAttention ||
            this.running.has(id) ||
            !due(state.lastSync)
          )
            continue;
          await this.sync(id);
          await this.settled(id);
        } catch {
          this.p.app.logger.warn('NocoReach YouTube tick failed', {
            projectId: id,
          });
        }
      }
    } finally {
      this.ticking = false;
    }
  }
  async stop() {
    this.stopped = true;
    for (const running of this.running.values()) running.controller.abort();
    await Promise.all([...this.running.values()].map((r) => r.done));
  }
  register() {
    const wrap =
      (fn: (id: string, values: Record<string, unknown>) => Promise<unknown>) =>
      async (ctx: LegacyContext, next: () => Promise<void>) => {
        await requireAccess(ctx);
        const values = (ctx.action.params.values || {}) as Record<
          string,
          unknown
        >;
        const id = projectId(values.projectId);
        await this.p.project(id);
        ctx.set('Cache-Control', 'no-store');
        try {
          ctx.body = await fn(id, values);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === 'collectorConnection.activeRun' &&
            'status' in error &&
            error.status === 409
          )
            throw error;
          const e = publicError(error);
          ctx.throw(e.status, e.message);
        }
        await next();
      };
    this.p.app.resourceManager.define({
      name: 'nrYouTube',
      actions: {
        status: wrap((id, v) => this.status(id, v.page ?? 1)),
        connect: wrap((id, v) => this.connect(id, v)),
        sync: wrap((id) => this.sync(id)),
        cancel: wrap((id, v) => this.cancel(id, v)),
        clear: wrap((id, v) => this.clear(id, v)),
        disconnect: wrap((id, v) => this.disconnect(id, v)),
      },
    });
    this.p.app.acl.allow(
      'nrYouTube',
      ['status', 'connect', 'sync', 'cancel', 'disconnect', 'clear'],
      'loggedIn',
    );
  }
}
