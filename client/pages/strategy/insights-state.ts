import {
  useAuthorizationClient,
  useAuthorizationRevision,
} from '@nocobase/app-plugin-authorization/client';
import { useEffect, useRef, useState } from 'react';

import { usePermissionGeneration } from '#hooks/use-permission-generation';

import type { useWorkspaceCache } from '../workspace-cache';
import type { EarlyRequests } from './early-requests';
import type { StrategyState } from './model';
import { request } from './service';

type Cache = ReturnType<typeof useWorkspaceCache>;

/**
 * How long after an access re-check unmounted Insights its next mount may still take what the page had read: the
 * state, the situation and the tasks, in flight or answered within this time. A later mount, or one no re-check
 * caused, reads them again.
 */
export const RECHECK_REUSE_MS = 10_000;

/**
 * One project's Insights state in one workspace cache, so in one user, session and permission generation: a new
 * generation brings a new cache, and with it a new store.
 *
 * The state lives in the cache entry `insights-state:<project>`. A write (the answer of a mutation) replaces it, and a
 * read shows its answer only while the entry still holds it, so a read that started before a write, or before a later
 * read, is never shown or kept. The mounted page follows the entry through `subscribe`, including answers that arrive
 * after an earlier mount was unmounted.
 */
export class InsightsState {
  /** When an access re-check last unmounted the page, and in which permission generation, until its next mount. */
  private recheck?: { at: number; generation: number };
  private readonly listeners = new Set<(state: StrategyState) => void>();
  private kept?: EarlyRequests;
  private judgedKey = '';

  constructor(
    private readonly cache: Cache,
    private readonly projectId: number,
  ) {}

  private get key(): string {
    return `insights-state:${this.projectId}`;
  }

  /**
   * Reads the state and shows it, unless a write or a later read replaced the entry meanwhile (then it resolves with
   * undefined). `reuse` lets the first read after a re-check join the read in flight or take an answer from the last
   * RECHECK_REUSE_MS; otherwise a new read fences every earlier one.
   */
  async read(reuse = false): Promise<StrategyState | undefined> {
    if (!reuse) this.cache.invalidate((key) => key === this.key);
    const state = await this.cache.load(
      this.key,
      () => request<StrategyState>(this.projectId, 'state'),
      false,
      { staleTime: reuse ? RECHECK_REUSE_MS : 0 },
    );
    if (this.cache.peek<StrategyState>(this.key) !== state) return undefined;
    this.publish(state);
    return state;
  }

  /** The state a mutation answered with: it replaces the entry, and every read started before it is discarded. */
  readonly write = (state: StrategyState): void => {
    this.cache.replace(this.key, state);
    this.publish(state);
  };

  subscribe(listener: (state: StrategyState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private publish(state: StrategyState): void {
    for (const listener of [...this.listeners]) listener(state);
  }

  /** The early requests of the latest mount, which a mount after a re-check takes over. */
  get early(): EarlyRequests | undefined {
    return this.kept;
  }

  keepEarly(early: EarlyRequests): void {
    this.kept = early;
  }

  /** The analysis whose unjudged changes a mount last asked the server to judge. */
  get judged(): string {
    return this.judgedKey;
  }

  markJudged(key: string): void {
    this.judgedKey = key;
  }

  rechecked(generation: number): void {
    this.recheck = { at: Date.now(), generation };
  }

  /**
   * Whether a mount now follows a re-check's unmount closely enough to take over its reads. The generation is
   * compared too: should the page mount again in this cache after the generation moved, before the cache is replaced,
   * it reads afresh.
   */
  handedOver(generation: number): boolean {
    return (
      this.recheck !== undefined &&
      this.recheck.generation === generation &&
      Date.now() - this.recheck.at < RECHECK_REUSE_MS
    );
  }

  /** A re-check hands its reads to one mount only. */
  taken(): void {
    this.recheck = undefined;
  }
}

const stores = new WeakMap<Cache, Map<number, InsightsState>>();

export function insightsState(cache: Cache, projectId: number): InsightsState {
  const projects = stores.get(cache) ?? new Map<number, InsightsState>();
  stores.set(cache, projects);
  const store = projects.get(projectId) ?? new InsightsState(cache, projectId);
  projects.set(projectId, store);
  return store;
}

/**
 * Whether this mount follows an access re-check that unmounted the page in the same cache. ClientRoute unmounts the
 * page, without rendering it again, when an authorization invalidation makes its check pending: the revision has
 * then moved past the one the page last rendered with. Leaving the page does not move it, so a navigation never
 * counts. Session and generation changes bring a new cache, whose store no re-check has touched.
 */
export function useRecheckHandover(store: InsightsState): boolean {
  const authz = useAuthorizationClient();
  const revision = useAuthorizationRevision();
  const generation = usePermissionGeneration();
  const [handed] = useState(() => store.handedOver(generation));
  const renderedRef = useRef({ revision, generation });
  useEffect(() => {
    renderedRef.current = { revision, generation };
  }, [revision, generation]);
  useEffect(() => {
    store.taken();
    return () => {
      const rendered = renderedRef.current;
      if (authz.revision() !== rendered.revision)
        store.rechecked(rendered.generation);
    };
  }, [store, authz]);
  return handed;
}
