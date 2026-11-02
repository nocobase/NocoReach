import { randomUUID } from 'node:crypto';
import { DataForSeo } from './dataforseo.js';
import { YouTubeLibrary } from './youtube-library.js';
import { projectId, requireAccess } from './policy.js';
import { collectorPeriod, type WindowFor } from './collector-views.js';
import { due, nextAt, record } from './sync-policy.js';
import type { LegacyApp } from './legacy/app.js';
import type { LegacyContext } from './legacy/context.js';
import type { LegacyDatabase } from './legacy/database.js';
import type { OutboundNetwork } from './outbound-network.js';
import {
  SEARCH_USD,
  VIDEO_USD,
  youtubeSearch,
  youtubeVideo,
  type FoundVideo,
  type VideoDetails,
} from './youtube-dataforseo.js';
import {
  MAX_TERMS,
  MAX_VIDEOS,
  YouTubeError,
  publicError,
  researchInput,
  type Video,
  type YouTubeErrorCode,
} from './youtube-provider.js';

/** A search term this read could not search: DataForSEO took too long or gave no usable answer, or refused it. */
export interface Missed {
  term: string;
  reason: 'timeout' | 'failed';
}
interface Attempt {
  at: string;
  ok: boolean;
  errors: string[];
  attempts: number;
  lastSuccessAt: string | null;
  code?: YouTubeErrorCode;
  needsAttention?: boolean;
  missed?: Missed[];
  /** Videos the searches found, and how many of them were new to the project. */
  found?: number;
  added?: number;
  /** What this read added to the DataForSEO bill (results reused from an earlier read cost nothing). */
  costUsd?: number;
}
export interface YouTubeState {
  revision: string;
  /** Set once the state is read through DataForSEO; state saved by the earlier Collector reader has none. */
  engine?: 'dataforseo';
  analysisVideoIds?: string[];
  terms: string[];
  videoIds: string[];
  autoSync: boolean;
  verifiedAt: string | null;
  fetchedAt: string | null;
  configured?: boolean;
  lastSync: Attempt | null;
  /** Found videos whose likes and comments are still to be read (a read reads at most DETAILS_PER_READ). */
  pendingDetails?: string[];
  /** The month's DataForSEO budget ran out: daily reads wait for this day, or until the budget is raised. */
  pausedUntil?: string | null;
}

export type SearchResult =
  | { ok: true; videos: FoundVideo[]; costUsd: number }
  | { ok: false; missed: Missed['reason']; costUsd: number };
export type DetailsResult =
  | { ok: true; video: VideoDetails | null; costUsd: number }
  | { ok: false; costUsd: number };
/** How YouTube is read: DataForSEO's YouTube SERP API, on the project's DataForSEO connection and monthly budget. */
export interface YouTubeReader {
  /** DataForSEO is connected and verified for the project. */
  ready(id: string): boolean;
  search(id: string, term: string, manual: boolean): Promise<SearchResult>;
  details(id: string, videoId: string, manual: boolean): Promise<DetailsResult>;
  spend(id: string): Promise<{ monthUsd: number; budgetUsd: number }>;
}
interface Run {
  status: string;
  reused?: boolean;
  costUsd?: number | null;
  reservedUsd?: number | null;
  result?: { videos?: FoundVideo[]; video?: VideoDetails | null } | null;
}

export function dataforseoReader(p: unknown): YouTubeReader {
  const d4s = new DataForSeo(p, { youtube: youtubeSearch, youtubeVideo });
  const run = async (
    id: string,
    kind: string,
    values: Record<string, unknown>,
    manual: boolean,
  ) => {
    try {
      const row = (await d4s.run(id, kind, {
        ...values,
        requestKey: `youtube-${randomUUID()}`,
        // Read now asks again on purpose: a result from the last ten minutes is still reused, an uncertain one is
        // asked again (a daily read leaves it for the next day, so a possibly billed query is not repeated at once).
        ...(manual ? { forceRefresh: true, retryUncertain: true } : {}),
      })) as Run;
      const costUsd = row.reused
        ? 0
        : Number(row.costUsd ?? 0) + Number(row.reservedUsd ?? 0);
      return { row, costUsd };
    } catch (error) {
      if (
        (error as { safeCode?: string } | null)?.safeCode === 'budget_exceeded'
      )
        throw new YouTubeError('budget_exceeded');
      // Any other refusal (a transport error, rejected credentials) counts against this term or video only.
      return { row: { status: 'failed' } as Run, costUsd: 0 };
    }
  };
  return {
    ready: (id) =>
      Boolean(
        (d4s.config(id) as { verifiedAt?: string } | null | undefined)
          ?.verifiedAt,
      ),
    async search(id, term, manual) {
      const { row, costUsd } = await run(id, 'youtube', { term }, manual);
      return row.status === 'completed'
        ? { ok: true, videos: row.result?.videos ?? [], costUsd }
        : {
            ok: false,
            missed: row.status === 'failed' ? 'failed' : 'timeout',
            costUsd,
          };
    },
    async details(id, videoId, manual) {
      const { row, costUsd } = await run(
        id,
        'youtubeVideo',
        { videoId },
        manual,
      );
      return row.status === 'completed'
        ? { ok: true, video: row.result?.video ?? null, costUsd }
        : { ok: false, costUsd };
    },
    async spend(id) {
      const spend = (await d4s.spend(id)) as {
        monthUsd: number;
        budgetUsd: number;
      };
      return { monthUsd: spend.monthUsd, budgetUsd: spend.budgetUsd };
    },
  };
}

interface Host {
  db: LegacyDatabase;
  app: LegacyApp;
  network: OutboundNetwork;
  project: (id: string) => Promise<unknown>;
  projectIds: () => Promise<(string | number)[]>;
}
interface Running {
  id: string;
  controller: AbortController;
  done: Promise<void>;
  committing: boolean;
}
// A read reads the likes and comments of at most this many videos; the rest wait for the next read.
const DETAILS_PER_READ = 20;
const PENDING_LIMIT = 100;
// Each DataForSEO request waits up to a minute; a read of five terms and twenty videos stays well inside this.
const READ_MS = 10 * 60000;
const DAY = 86400000;
const nextMonth = (now = new Date()) =>
  new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();
// record is shared with the classic services, whose inferred errors type is unknown[].
const attempt = (
  previous: Attempt | null,
  at: string,
  ok: boolean,
  errors: string[],
): Attempt => record(previous, { at, ok, errors }) as Attempt;

/**
 * State saved by the earlier Collector reader (before 2026-11-02) carries over its search terms, tracked videos and
 * saved videos; its last read and its captions-era run do not, and daily reading is on, as it now is by default.
 */
export function migrated(state: YouTubeState | null): YouTubeState | null {
  if (!state || state.engine === 'dataforseo') return state;
  const configured = state.configured !== false;
  return {
    ...state,
    engine: 'dataforseo',
    terms: (state.terms || []).slice(0, MAX_TERMS),
    videoIds: (state.videoIds || []).slice(0, MAX_VIDEOS),
    autoSync: configured,
    verifiedAt: null,
    lastSync: null,
    analysisVideoIds: [],
    pendingDetails: [],
    pausedUntil: null,
  };
}

export class YouTubeSource {
  private running = new Map<string, Running>();
  private ticking = false;
  private changing = new Set<string>();
  private stopped = false;
  private versions = new Map<string, number>();
  private library: YouTubeLibrary;
  private reader: YouTubeReader;
  private changed(id: string) {
    this.versions.set(id, (this.versions.get(id) || 0) + 1);
  }
  constructor(
    private p: Host,
    reader?: YouTubeReader,
  ) {
    this.library = new YouTubeLibrary(p.db);
    this.reader = reader || dataforseoReader(p);
    p.network.bind(this, ['connect', 'sync'], 'dataforseo');
  }
  private repo() {
    return this.p.db.getRepository('nrSnapshots');
  }
  private key(id: string) {
    return `youtube:${projectId(id)}`;
  }
  async state(id: string): Promise<YouTubeState | null> {
    const row = await this.repo().findOne({ filter: { key: this.key(id) } });
    return migrated((row?.get('payload') as YouTubeState | undefined) || null);
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
        const state = await fn(
          migrated((row?.get('payload') as YouTubeState) || null),
        );
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
  /** Saves the search terms, tracked videos and daily setting; reads at once when the terms or videos changed. */
  async connect(id: string, values: Record<string, unknown>) {
    const input = researchInput(values);
    if (this.stopped || this.running.has(id) || this.changing.has(id))
      throw new YouTubeError('config_changed');
    if (!this.reader.ready(id)) throw new YouTubeError('dataforseo_missing');
    this.changing.add(id);
    let read = false;
    try {
      await this.mutate(id, (old) => {
        if ((old?.revision || null) !== (values.revision || null))
          throw new YouTubeError('config_changed');
        const same =
          old &&
          old.configured !== false &&
          JSON.stringify([old.terms, old.videoIds]) ===
            JSON.stringify([input.terms, input.videoIds]);
        read = !same || !old.lastSync;
        return {
          ...input,
          engine: 'dataforseo' as const,
          configured: true,
          analysisVideoIds: same ? old.analysisVideoIds : [],
          autoSync: values.autoSync !== false,
          revision: randomUUID(),
          verifiedAt: same ? old.verifiedAt : null,
          fetchedAt: old?.fetchedAt || null,
          lastSync: same ? old.lastSync : null,
          pendingDetails: old?.pendingDetails ?? [],
          pausedUntil: old?.pausedUntil ?? null,
        };
      });
    } finally {
      this.changing.delete(id);
    }
    return read ? this.sync(id) : this.status(id);
  }
  /** Read now, or a daily read (`daily`), which leaves an uncertain DataForSEO result for the next day. */
  async sync(id: string, options: { daily?: boolean } = {}) {
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
        void this.collect(id, state, running, options.daily !== true)
          .catch(() => undefined)
          .finally(cleanup);
      } catch (error) {
        cleanup();
        throw error;
      }
    }
    return this.status(id);
  }
  /**
   * One read: search each term (stopping at the month's budget), then read likes and comments for the tracked videos
   * and for videos new to the project. A term that could not be searched leaves the others' results in place.
   */
  private async collect(
    id: string,
    state: YouTubeState,
    running: Running,
    manual: boolean,
  ) {
    const cancellation = running.controller.signal;
    const signal = AbortSignal.any([
      cancellation,
      AbortSignal.timeout(READ_MS),
    ]);
    const stop = () => {
      if (signal.aborted)
        throw new YouTubeError(cancellation.aborted ? 'cancelled' : 'timeout');
    };
    const at = new Date().toISOString();
    try {
      if (!this.reader.ready(id)) throw new YouTubeError('dataforseo_missing');
      const found = new Map<string, FoundVideo>(),
        details = new Map<string, VideoDetails>(),
        missed: Missed[] = [];
      let costUsd = 0,
        searched = 0,
        budget = false;
      // The budget refusal is the one error that stops a read part-way and keeps what it has read.
      const guarded = async <T>(read: () => Promise<T>) => {
        try {
          return await read();
        } catch (error) {
          if (
            error instanceof YouTubeError &&
            error.code === 'budget_exceeded'
          ) {
            budget = true;
            return null;
          }
          throw error;
        }
      };
      for (const term of state.terms) {
        stop();
        const result = await guarded(() =>
          this.reader.search(id, term, manual),
        );
        if (!result) break;
        costUsd += result.costUsd;
        if (!result.ok) {
          missed.push({ term, reason: result.missed });
          continue;
        }
        searched++;
        for (const video of result.videos)
          if (!found.has(video.id)) found.set(video.id, video);
      }
      const fresh = await this.library.unknown(id, [...found.keys()]);
      const queue = [
        ...new Set([
          ...state.videoIds,
          ...fresh,
          ...(state.pendingDetails || []),
        ]),
      ];
      const waiting: string[] = [];
      for (const [index, videoId] of queue.entries()) {
        if (budget || index >= DETAILS_PER_READ) {
          waiting.push(videoId);
          continue;
        }
        stop();
        const result = await guarded(() =>
          this.reader.details(id, videoId, manual),
        );
        if (!result) {
          waiting.push(videoId);
          continue;
        }
        costUsd += result.costUsd;
        if (!result.ok) waiting.push(videoId);
        else if (result.video) details.set(videoId, result.video);
      }
      stop();
      const fetchedAt = new Date().toISOString();
      const videos: Video[] = [];
      for (const videoId of new Set([...state.videoIds, ...found.keys()])) {
        const base = found.get(videoId),
          more = details.get(videoId);
        const video = more ?? base;
        if (!video) continue;
        videos.push({
          ...video,
          title: more?.title || base?.title || '',
          views: more?.views ?? base?.views ?? null,
          likes: more?.likes ?? null,
          comments: more?.comments ?? null,
          fetchedAt,
          provider: 'dataforseo',
        });
      }
      for (const [videoId, video] of details)
        if (!found.has(videoId) && !state.videoIds.includes(videoId))
          videos.push({ ...video, fetchedAt, provider: 'dataforseo' });
      const ok = searched > 0 || details.size > 0;
      if (!ok)
        throw new YouTubeError(
          budget
            ? 'budget_exceeded'
            : missed.length && missed.every((m) => m.reason === 'timeout')
              ? 'timeout'
              : 'upstream_error',
        );
      await this.mutate(id, async (current) => {
        // The transaction/lock may have queued after the collection finished.
        // Make the cancellation cutoff synchronous with accepting this write.
        stop();
        if (
          this.running.get(id) !== running ||
          current?.revision !== state.revision
        )
          return current;
        running.committing = true;
        await this.library.save(id, videos);
        const tracked = new Set(current.videoIds);
        return {
          ...current,
          analysisVideoIds: videos.slice(0, 15).map((video) => video.id),
          verifiedAt: current.verifiedAt || fetchedAt,
          fetchedAt,
          // Tracked videos are read on every read; only the others wait their turn.
          pendingDetails: waiting
            .filter((videoId) => !tracked.has(videoId))
            .slice(0, PENDING_LIMIT),
          pausedUntil: budget ? nextMonth() : null,
          lastSync: {
            ...attempt(current.lastSync, fetchedAt, true, []),
            missed,
            found: found.size,
            added: fresh.length,
            costUsd: Number(costUsd.toFixed(4)),
          },
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
              pausedUntil:
                e.code === 'budget_exceeded'
                  ? nextMonth()
                  : (current.pausedUntil ?? null),
              lastSync: {
                ...attempt(current.lastSync, at, false, [e.message]),
                code: e.code,
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
              pendingDetails: [],
              pausedUntil: null,
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
          analysisVideoIds: [],
          pendingDetails: [],
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
    const videos = await this.library.selected(
      id,
      state.analysisVideoIds || [],
    );
    const current = await this.state(id);
    return current?.revision === state.revision && current.configured !== false
      ? videos
      : [];
  }
  /**
   * What a month of daily reads costs at list prices: each term searched once a day, each tracked video read once a
   * day, and each newly found video read once. New videos are counted at the rate the project has been finding them
   * (after its first day, which finds the backlog), or one a term a day before there is a week to go on.
   */
  private estimate(
    state: YouTubeState | null,
    overview: Awaited<ReturnType<YouTubeLibrary['overview']>>,
  ) {
    const terms = state?.terms.length ?? 0,
      tracked = state?.videoIds.length ?? 0;
    const since = overview.since ? Date.parse(overview.since) : NaN;
    const days = Number.isFinite(since)
      ? Math.min(30, (Date.now() - since) / DAY - 1)
      : 0;
    const newPerMonth = days >= 7 ? (overview.recent / days) * 30 : terms * 30;
    const monthlyUsd =
      terms * 30 * SEARCH_USD +
      tracked * 30 * VIDEO_USD +
      newPerMonth * VIDEO_USD;
    const readUsd = terms * SEARCH_USD + tracked * VIDEO_USD;
    return {
      monthlyUsd: Number(monthlyUsd.toFixed(2)),
      readUsd: Number(readUsd.toFixed(3)),
      searchUsd: SEARCH_USD,
      videoUsd: VIDEO_USD,
    };
  }
  async status(id: string) {
    // Do not pair a stale snapshot with a newer terminal lifecycle state: the
    // browser stops polling when syncing=false. Repeat reads crossing a write/run.
    let state: YouTubeState | null, version: number;
    let overview: Awaited<ReturnType<YouTubeLibrary['overview']>>;
    let recent: Awaited<ReturnType<YouTubeLibrary['recent']>>;
    do {
      version = this.versions.get(id) || 0;
      [state, overview, recent] = await Promise.all([
        this.state(id),
        this.library.overview(id),
        this.library.recent(id, 3),
      ]);
    } while (version !== (this.versions.get(id) || 0));
    const running = this.running.get(id);
    const dataforseo = this.reader.ready(id);
    const spend = dataforseo
      ? await this.reader.spend(id).catch(() => null)
      : null;
    const paused =
      state?.pausedUntil && Date.parse(state.pausedUntil) > Date.now()
        ? state.pausedUntil
        : null;
    return {
      configured: Boolean(state && state.configured !== false),
      // The menu's rule (nrHealth:connected): DataForSEO verified and search terms saved; saved videos count there too.
      connected: Boolean(
        dataforseo && state?.configured !== false && state?.terms.length,
      ),
      dataforseo,
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
      total: overview.total,
      recordingSince: overview.since,
      recent: recent.map((video) => ({
        id: video.id,
        url: video.url,
        title: video.title,
        channel: video.channel,
        publishedAt: video.publishedAt,
        firstSeenAt: video.firstSeenAt,
        views: video.views,
      })),
      pendingDetails: state?.pendingDetails?.length ?? 0,
      pausedUntil: paused,
      spend,
      estimate: this.estimate(state, overview),
      lastSync: state?.lastSync || null,
      nextSyncAt:
        state?.autoSync && state.configured !== false
          ? (paused ?? nextAt(state.lastSync))
          : null,
    };
  }
  /** The data page: saved videos published in the range (or first saved, when YouTube gave no date). */
  async report(
    id: string,
    values: Record<string, unknown>,
    windowFor: WindowFor,
  ) {
    const [status, saved] = await Promise.all([
      this.status(id),
      this.library.summaries(id),
    ]);
    const period = collectorPeriod(
      this.p,
      id,
      'youtube',
      values,
      windowFor,
      saved,
      (video) => ({ published: video.publishedAt, seen: video.firstSeenAt }),
      [
        { key: 'views', value: (video) => video.views },
        { key: 'likes', value: (video) => video.likes },
        { key: 'comments', value: (video) => video.comments },
      ],
      (video) => [{ kind: 'channel', name: video.channel }],
    );
    return {
      ...status,
      window: period.window,
      kpis: period.kpis,
      matched: period.matched,
      trend: period.trend,
      groups: period.groups,
      // Summaries leave captions out; read the full records for this page only.
      videos: await this.library.byIds(
        id,
        period.items.map((video) => video.id),
      ),
    };
  }
  async settled(id: string) {
    await this.running.get(id)?.done;
  }
  /** Whether the budget has room again for a read (someone raised it after it ran out). */
  private async room(id: string, state: YouTubeState) {
    const spend = await this.reader.spend(id).catch(() => null);
    return Boolean(
      spend &&
      spend.budgetUsd - spend.monthUsd >=
        Math.max(1, state.terms.length) * SEARCH_USD * 2,
    );
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
            !state ||
            state.configured === false ||
            !state.autoSync ||
            this.running.has(id) ||
            !this.reader.ready(id) ||
            !due(state.lastSync)
          )
            continue;
          if (
            state.pausedUntil &&
            Date.parse(state.pausedUntil) > Date.now() &&
            !(await this.room(id, state))
          )
            continue;
          await this.sync(id, { daily: true });
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
  register(windowFor: WindowFor) {
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
          const e = publicError(error);
          ctx.throw(e.status, e.message);
        }
        await next();
      };
    this.p.app.resourceManager.define({
      name: 'nrYouTube',
      actions: {
        status: wrap((id) => this.status(id)),
        report: wrap((id, v) => this.report(id, v, windowFor)),
        connect: wrap((id, v) => this.connect(id, v)),
        sync: wrap((id) => this.sync(id)),
        cancel: wrap((id, v) => this.cancel(id, v)),
        clear: wrap((id, v) => this.clear(id, v)),
        disconnect: wrap((id, v) => this.disconnect(id, v)),
      },
    });
    this.p.app.acl.allow(
      'nrYouTube',
      ['status', 'report', 'connect', 'sync', 'cancel', 'disconnect', 'clear'],
      'loggedIn',
    );
  }
}
