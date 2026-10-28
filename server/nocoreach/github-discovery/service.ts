import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { LegacyApp } from '../legacy/app.js';
import type { LegacyDatabase } from '../legacy/database.js';
import type { LegacyContext } from '../legacy/context.js';
import type { OutboundNetwork } from '../outbound-network.js';
import { projectId, requireAccess } from '../policy.js';
import { systemMessageText } from '../../../shared/i18n/messages.js';
import {
  DISCOVERY_LIMIT,
  discoveryDetection,
  type DiscoveryRule,
  type DiscoveryRun,
  type DiscoveryStatus,
  type DiscoveryList,
  type DiscoveredRepository,
} from '../../../shared/github-discovery.js';
import { fail, parseRule, verifyRule } from './rules.js';

export const discoveryKey = (id: string) => `github-discovery:${id}`;
export const discoveryTokenKey = (id: string) =>
  `NOREACH_GITHUB_DISCOVERY_${id}`;
type Cursor = {
  query: number;
  page: number;
  offset: number;
  recheck: number;
  lastAt?: string;
  capped?: boolean;
};
type Snapshot = {
  revision: number;
  rules: DiscoveryRule[];
  repositories: Record<string, DiscoveredRepository>;
  cursors: Record<string, Cursor>;
  lastRun: DiscoveryRun | null;
  lastSuccessAt: string | null;
  capped: boolean;
};
const empty = (): Snapshot => ({
  revision: 0,
  rules: [],
  repositories: {},
  cursors: {},
  lastRun: null,
  lastSuccessAt: null,
  capped: false,
});
const cursorOf = (): Cursor => ({ query: 0, page: 1, offset: 0, recheck: 0 });
interface Host {
  db: LegacyDatabase;
  app: LegacyApp;
  network: OutboundNetwork;
  env(key: string): string;
  variable(key: string, value: string | null, secret?: boolean): Promise<void>;
  project(id: string): Promise<unknown>;
  projectIds(): Promise<(string | number)[]>;
  github?: { token(id: string): string };
  mock?: { enabled: boolean };
}
type Active = { controller: AbortController; promise?: Promise<unknown> };
const repositorySchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  private: z.boolean(),
  default_branch: z.string().min(1),
  description: z.string().nullable().optional(),
  stargazers_count: z.number().optional(),
  created_at: z.string(),
  pushed_at: z.string().nullable().optional(),
  license: z.object({ spdx_id: z.string() }).nullable().optional(),
  fork: z.boolean().optional(),
  archived: z.boolean().optional(),
  is_template: z.boolean().optional(),
});
const revisionOf = (input: unknown) => {
  const r = z.number().int().nonnegative().safeParse(input);
  if (!r.success) fail('githubDiscovery.conflict', 409);
  return r.data;
};
const errorStatus = (error: unknown) =>
  Number((error as { status?: number })?.status) || 502;
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : systemMessageText('common.operationFailedRetry');
const encodedRepo = (name: string) =>
  name.split('/').map(encodeURIComponent).join('/');

export class GitHubDiscovery {
  private active = new Map<string, Active>();
  private closed = false;
  private lastSearch = 0;
  private searchQueue: Promise<unknown> = Promise.resolve();
  private ticking = false;
  constructor(
    private p: Host,
    private request?: (
      url: string,
      init: RequestInit,
      id: string,
    ) => Promise<Response>,
  ) {
    p.network?.bind(
      this,
      ['scan', 'preview', 'setToken'],
      request ? undefined : 'github',
    );
  }
  private repo() {
    return this.p.db.getRepository('nrSnapshots');
  }
  async state(id: string): Promise<Snapshot> {
    return (
      ((await this.repo().findOne({ filter: { key: discoveryKey(id) } }))?.get(
        'payload',
      ) as Snapshot) || empty()
    );
  }
  private async mutate(id: string, fn: (s: Snapshot) => void | Promise<void>) {
    return this.p.db.sequelize.transaction(async (transaction) => {
      const key = discoveryKey(id);
      await this.p.db.sequelize.query(
        'SELECT pg_advisory_xact_lock(hashtext(:key))',
        { replacements: { key }, transaction },
      );
      const row = await this.repo().findOne({ filter: { key }, transaction });
      const s = structuredClone((row?.get('payload') as Snapshot) || empty());
      await fn(s);
      if (row)
        await this.repo().update({
          filterByTk: row.id,
          values: { payload: s },
          transaction,
        });
      else
        await this.repo().create({ values: { key, payload: s }, transaction });
      return s;
    });
  }
  private token(id: string) {
    return this.p.env(discoveryTokenKey(id)) || this.p.github?.token(id) || '';
  }
  async status(id: string): Promise<DiscoveryStatus> {
    const s = await this.state(id);
    const token = this.token(id);
    const due = s.rules
      .filter((r) => r.enabled)
      .map(
        (r) =>
          Date.parse(s.cursors[r.id]?.lastAt || '') + r.intervalHours * 3600000,
      );
    const next =
      due.length && token
        ? Math.max(
            Date.now(),
            Math.min(...due.map((n) => (Number.isFinite(n) ? n : Date.now()))),
            Date.parse(s.lastRun?.retryAt || '') || 0,
          )
        : null;
    return {
      revision: s.revision,
      credential: this.p.env(discoveryTokenKey(id))
        ? 'dedicated'
        : token
          ? 'shared'
          : 'missing',
      connected: s.rules.length > 0 && !!token,
      running: this.active.has(id),
      rules: s.rules,
      savedCount: Object.keys(s.repositories).length,
      lastRun: s.lastRun,
      lastSuccessAt: s.lastSuccessAt,
      nextScanAt: next ? new Date(next).toISOString() : null,
      capped: s.capped,
    };
  }
  private checkRevision(s: Snapshot, revision: number) {
    if (s.revision !== revision) fail('githubDiscovery.conflict', 409);
  }
  async saveRule(id: string, input: unknown, revision: unknown) {
    const rule = parseRule(input),
      expected = revisionOf(revision);
    await this.mutate(id, (s) => {
      this.checkRevision(s, expected);
      const index = s.rules.findIndex((r) => r.id === rule.id);
      if (rule.id && index < 0) fail('githubDiscovery.missing', 404);
      if (index < 0 && s.rules.length >= 10) fail('githubDiscovery.ruleLimit');
      rule.id ||= randomUUID();
      if (index < 0) s.rules.push(rule);
      else s.rules[index] = rule;
      delete s.cursors[rule.id];
      // Edited criteria invalidate old conclusions, while preserving first discovery and human review.
      for (const repo of Object.values(s.repositories))
        repo.matches = repo.matches.map((m) =>
          m.ruleId === rule.id
            ? { ...m, status: 'candidate', evidence: [] }
            : m,
        );
      s.revision++;
    });
    this.active.get(id)?.controller.abort();
    return this.status(id);
  }
  async changeRule(
    id: string,
    ruleId: unknown,
    revision: unknown,
    enabled?: unknown,
  ) {
    const expected = revisionOf(revision);
    if (typeof ruleId !== 'string') fail('githubDiscovery.invalidRule');
    if (enabled !== undefined && typeof enabled !== 'boolean')
      fail('githubDiscovery.invalidRule');
    await this.mutate(id, (s) => {
      this.checkRevision(s, expected);
      const rule = s.rules.find((r) => r.id === ruleId);
      if (!rule) fail('githubDiscovery.missing', 404);
      if (enabled === undefined) {
        s.rules = s.rules.filter((r) => r.id !== ruleId);
        delete s.cursors[ruleId];
        for (const repo of Object.values(s.repositories)) {
          repo.matches = repo.matches.filter((m) => m.ruleId !== ruleId);
          if (!repo.matches.length) delete s.repositories[repo.id];
        }
      } else rule.enabled = enabled;
      s.capped = Object.keys(s.repositories).length >= DISCOVERY_LIMIT;
      s.revision++;
    });
    this.active.get(id)?.controller.abort();
    return this.status(id);
  }
  async setToken(
    id: string,
    raw: unknown,
    revision: unknown,
    authorize: () => Promise<unknown> = async () => undefined,
  ) {
    const expected = revisionOf(revision);
    const token = typeof raw === 'string' ? raw.trim() : '';
    if (!/^(?:github_pat_|ghp_)[A-Za-z0-9_]{20,255}$/.test(token))
      fail('githubSource.notLookLikeGithubToken');
    this.checkRevision(await this.state(id), expected);
    await this.json(
      id,
      '/search/code?q=dependencies+filename%3Apackage.json&per_page=1',
      token,
      AbortSignal.timeout(20000),
    );
    await authorize();
    await this.mutate(id, async (s) => {
      this.checkRevision(s, expected);
      await this.p.variable(discoveryTokenKey(id), token, true);
      s.revision++;
    });
    this.active.get(id)?.controller.abort();
    return this.status(id);
  }
  async removeToken(id: string, revision: unknown) {
    const expected = revisionOf(revision);
    await this.mutate(id, async (s) => {
      this.checkRevision(s, expected);
      await this.p.variable(discoveryTokenKey(id), null);
      s.revision++;
    });
    this.active.get(id)?.controller.abort();
    return this.status(id);
  }
  private async throttle(id: string, signal: AbortSignal) {
    const simulated =
      this.p.mock?.enabled || (await this.p.network?.inDemoProject(id));
    if (simulated || this.request) return;
    const wait = this.searchQueue
      .catch(() => undefined)
      .then(async () => {
        const ms = this.lastSearch + 6500 - Date.now();
        if (ms > 0) await delay(ms, undefined, { signal });
        signal.throwIfAborted();
        this.lastSearch = Date.now();
      });
    this.searchQueue = wait;
    await wait;
  }
  private async json(
    id: string,
    path: string,
    token: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    signal.throwIfAborted();
    if (path.startsWith('/search/')) await this.throttle(id, signal);
    const init: RequestInit = {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'NocoReach',
      },
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      redirect: 'error',
    };
    const response = await (this.request
      ? this.request('https://api.github.com' + path, init, id)
      : this.p.network.fetch(
          'github',
          'https://api.github.com' + path,
          init,
          id,
        ));
    if (!response.ok) {
      if (response.status === 404) fail('githubDiscovery.missing', 404);
      if (response.status === 401)
        fail('githubSource.tokenInvalidExpired', 403);
      if (
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get('x-ratelimit-remaining') === '0' ||
            response.headers.has('retry-after')))
      ) {
        const seconds =
          Number(response.headers.get('retry-after')) ||
          Math.max(
            60,
            Number(response.headers.get('x-ratelimit-reset')) -
              Date.now() / 1000,
          ) ||
          60;
        throw Object.assign(
          new Error(systemMessageText('githubTrends.rateLimited')),
          {
            status: 429,
            retryAt: new Date(
              Date.now() + Math.min(seconds, 86400) * 1000,
            ).toISOString(),
          },
        );
      }
      fail(
        response.status === 403
          ? 'githubSource.githubRejectedRequestsToken'
          : 'githubDiscovery.upstream',
        response.status === 403 ? 403 : 502,
      );
    }
    const text = await response.text();
    if (text.length > 2_000_000) fail('githubDiscovery.upstream', 502);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return fail('githubDiscovery.upstream', 502);
    }
  }
  private async inspect(
    id: string,
    name: string,
    rule: DiscoveryRule,
    token: string,
    signal: AbortSignal,
    base = '',
  ): Promise<DiscoveredRepository | null> {
    if (!/^[\w.-]+\/[\w.-]+$/.test(name)) return null;
    const parsed = repositorySchema.safeParse(
      await this.json(id, `/repos/${encodedRepo(name)}`, token, signal),
    );
    if (!parsed.success) fail('githubDiscovery.upstream', 502);
    const r = parsed.data;
    if (r.private) fail('githubDiscovery.missing', 404);
    if (
      (!rule.includeForks && r.fork) ||
      (!rule.includeArchived && r.archived) ||
      (!rule.includeTemplates && r.is_template) ||
      rule.excludeOwners.some(
        (x) => x.toLowerCase() === r.full_name.split('/')[0].toLowerCase(),
      ) ||
      rule.excludeRepositories.some(
        (x) => x.toLowerCase() === r.full_name.toLowerCase(),
      )
    )
      return null;
    const head = (await this.json(
      id,
      `/repos/${encodedRepo(r.full_name)}/commits/${encodeURIComponent(r.default_branch)}`,
      token,
      signal,
    )) as { sha?: unknown };
    if (typeof head.sha !== 'string' || !/^[a-f0-9]{40,64}$/i.test(head.sha))
      fail('githubDiscovery.upstream', 502);
    const commit = head.sha,
      now = new Date().toISOString();
    const match = await verifyRule(
      rule,
      r.full_name,
      commit,
      async (path) => {
        try {
          const data = (await this.json(
            id,
            `/repos/${encodedRepo(r.full_name)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${commit}`,
            token,
            signal,
          )) as {
            type?: string;
            encoding?: string;
            content?: string;
            size?: number;
          };
          if (
            data.type !== 'file' ||
            data.encoding !== 'base64' ||
            typeof data.content !== 'string' ||
            Number(data.size) > 500000
          )
            return null;
          return Buffer.from(data.content, 'base64').toString('utf8');
        } catch (e) {
          if (errorStatus(e) === 404) return null;
          throw e;
        }
      },
      now,
      base,
    );
    return {
      id: String(r.id),
      name: r.full_name,
      url: `https://github.com/${r.full_name}`,
      description: (r.description || '').slice(0, 1000),
      stars: r.stargazers_count || 0,
      createdAt: r.created_at,
      pushedAt: r.pushed_at || null,
      license:
        r.license?.spdx_id && r.license.spdx_id !== 'NOASSERTION'
          ? r.license.spdx_id
          : null,
      fork: !!r.fork,
      archived: !!r.archived,
      template: !!r.is_template,
      firstDiscoveredAt: now,
      checkedAt: now,
      matches: [match],
      review: 'unreviewed',
      favorite: false,
      revision: 0,
    };
  }
  private async candidates(
    id: string,
    rule: DiscoveryRule,
    cursor: Cursor,
    token: string,
    signal: AbortSignal,
  ) {
    const q = rule.queries[cursor.query % rule.queries.length];
    const raw = (await this.json(
      id,
      `/search/${q.kind}?q=${encodeURIComponent(q.query)}&per_page=100&page=${cursor.page}`,
      token,
      signal,
    )) as {
      items?: unknown;
      total_count?: number;
      incomplete_results?: boolean;
    };
    if (!Array.isArray(raw.items) || typeof raw.total_count !== 'number')
      fail('githubDiscovery.upstream', 502);
    const items = raw.items
      .map(
        (value: {
          repository?: { full_name?: string };
          full_name?: string;
          path?: string;
        }) => ({
          name:
            q.kind === 'code' ? value.repository?.full_name : value.full_name,
          base:
            q.kind === 'code' &&
            value.path?.endsWith('package.json') &&
            /^[\w.@/-]+$/.test(value.path) &&
            !value.path.split('/').some((x) => x === '..' || x === '.')
              ? value.path.slice(0, -12)
              : '',
        }),
      )
      .filter(
        (x): x is { name: string; base: string } => typeof x.name === 'string',
      );
    return {
      items,
      total: raw.total_count,
      partial: !!raw.incomplete_results,
      capped: raw.total_count > 1000,
    };
  }
  private advance(
    cursor: Cursor,
    length: number,
    total: number,
    rules: number,
  ) {
    cursor.offset++;
    if (cursor.offset >= length) {
      cursor.offset = 0;
      if (length === 100 && cursor.page < 10 && cursor.page * 100 < total)
        cursor.page++;
      else {
        cursor.page = 1;
        cursor.query = (cursor.query + 1) % rules;
      }
    }
  }
  async preview(id: string, input: unknown) {
    const rule = parseRule(input),
      token = this.token(id);
    if (!token) fail('githubDiscovery.tokenNeeded', 409);
    if (this.closed || this.active.has(id)) fail('githubDiscovery.busy', 409);
    const active: Active = { controller: new AbortController() };
    this.active.set(id, active);
    const work = async () => {
      const signal = AbortSignal.any([
        active.controller.signal,
        AbortSignal.timeout(90000),
      ]);
      const results: DiscoveredRepository[] = [];
      let partial = false,
        capped = false;
      const seen = new Set<string>();
      for (
        let query = 0;
        query < rule.queries.length && results.length < 5;
        query++
      ) {
        const page = await this.candidates(
          id,
          rule,
          { ...cursorOf(), query },
          token,
          signal,
        );
        partial ||= page.partial;
        capped ||= page.capped || page.total > 5;
        for (const item of page.items.slice(0, 5)) {
          if (seen.has(`${item.name}/${item.base}`)) continue;
          seen.add(`${item.name}/${item.base}`);
          let repo: DiscoveredRepository | null;
          try {
            repo = await this.inspect(
              id,
              item.name,
              rule,
              token,
              signal,
              item.base,
            );
          } catch (error) {
            if (errorStatus(error) === 404) continue;
            throw error;
          }
          if (repo) {
            const index = results.findIndex((r) => r.id === repo.id);
            if (index < 0) results.push(repo);
            else if (discoveryDetection(repo) === 'verified')
              results[index] = repo;
          }
          if (results.length >= 5) break;
        }
      }
      return { items: results, partial, capped };
    };
    try {
      const promise = work();
      active.promise = promise;
      return await promise;
    } finally {
      if (this.active.get(id) === active) this.active.delete(id);
    }
  }
  async scan(id: string, scheduled = false) {
    if (this.closed || this.active.has(id)) return this.status(id);
    const active: Active = { controller: new AbortController() };
    this.active.set(id, active);
    try {
      const s = await this.state(id);
      if (!this.token(id)) fail('githubDiscovery.tokenNeeded', 409);
      if (!s.rules.some((r) => r.enabled))
        fail('githubDiscovery.noEnabledRules', 409);
      if (s.lastRun?.retryAt && Date.parse(s.lastRun.retryAt) > Date.now())
        fail('githubTrends.rateLimited', 429);
      const promise = this.collect(
        id,
        s,
        active.controller.signal,
        scheduled,
      ).finally(() => {
        if (this.active.get(id) === active) this.active.delete(id);
      });
      active.promise = this.p.app.importHold.track(promise);
      void promise.catch(() =>
        this.p.app.logger.warn('GitHub discovery scan failed', {
          projectId: id,
        }),
      );
      return this.status(id);
    } catch (e) {
      if (this.active.get(id) === active) this.active.delete(id);
      throw e;
    }
  }
  async idle(id: string) {
    await this.active.get(id)?.promise;
  }
  private async collect(
    id: string,
    snapshot: Snapshot,
    cancel: AbortSignal,
    scheduled: boolean,
  ) {
    const token = this.token(id),
      started = Date.now(),
      signal = AbortSignal.any([cancel, AbortSignal.timeout(120000)]);
    const run: DiscoveryRun = {
      at: new Date(started).toISOString(),
      finishedAt: '',
      ok: true,
      checked: 0,
      added: 0,
      partial: false,
      capped: false,
      errors: [],
    };
    const commit = async (
      rule: DiscoveryRule,
      cursor: Cursor,
      repo?: DiscoveredRepository | null,
      missingId?: string,
      removeAll = false,
    ) =>
      this.mutate(id, (s) => {
        if (cancel.aborted || s.revision !== snapshot.revision) return;
        if (missingId && s.repositories[missingId]) {
          const old = s.repositories[missingId];
          old.matches = removeAll
            ? []
            : old.matches.filter((m) => m.ruleId !== rule.id);
          if (!old.matches.length) delete s.repositories[missingId];
        }
        s.cursors[rule.id] = structuredClone(cursor);
        if (repo) {
          const old = s.repositories[repo.id];
          if (!old && Object.keys(s.repositories).length >= DISCOVERY_LIMIT) {
            s.capped = true;
            run.capped = true;
            return;
          }
          if (!old) run.added++;
          const previous = old?.matches.find((m) => m.ruleId === rule.id);
          // A second location at the same commit must not overwrite a verified application root.
          if (
            previous?.status === 'verified' &&
            previous.commit === repo.matches[0]?.commit &&
            previous.base !== repo.matches[0]?.base &&
            repo.matches[0]?.status !== 'verified'
          )
            repo.matches = [previous];
          s.repositories[repo.id] = {
            ...repo,
            firstDiscoveredAt: old?.firstDiscoveredAt || repo.firstDiscoveredAt,
            review: old?.review || 'unreviewed',
            favorite: old?.favorite || false,
            revision: (old?.revision || 0) + 1,
            matches: [
              ...(old?.matches.filter((m) => m.ruleId !== rule.id) || []),
              ...repo.matches,
            ],
          };
        }
      });
    try {
      for (const rule of snapshot.rules.filter((r) => r.enabled)) {
        if (
          scheduled &&
          Date.parse(snapshot.cursors[rule.id]?.lastAt || '') +
            rule.intervalHours * 3600000 >
            started
        )
          continue;
        const cursor = { ...cursorOf(), ...snapshot.cursors[rule.id] };
        const known = Object.values(snapshot.repositories)
          .filter((r) => r.matches.some((m) => m.ruleId === rule.id))
          .sort((a, b) => a.id.localeCompare(b.id));
        // Reserve a small share of every batch for revalidation, including repositories absent from search.
        for (let n = 0; n < Math.min(3, known.length); n++) {
          const old = known[cursor.recheck % known.length];
          let next: DiscoveredRepository | null,
            removeAll = false;
          try {
            next = await this.inspect(
              id,
              old.name,
              rule,
              token,
              signal,
              old.matches.find((m) => m.ruleId === rule.id)?.base || '',
            );
          } catch (e) {
            if (errorStatus(e) !== 404) throw e;
            next = null;
            removeAll = true;
          }
          cursor.recheck++;
          run.checked++;
          await commit(
            rule,
            cursor,
            next,
            !next ? old.id : undefined,
            removeAll,
          );
        }
        let count = 0,
          searches = 0;
        const seen = new Set<string>();
        while (
          count < rule.batchSize &&
          searches < rule.queries.length + 1 &&
          Date.now() - started < 105000
        ) {
          signal.throwIfAborted();
          const page = await this.candidates(id, rule, cursor, token, signal);
          searches++;
          run.partial ||= page.partial;
          run.capped ||= page.capped;
          if (!page.items.length || cursor.offset >= page.items.length) {
            cursor.offset = 0;
            cursor.page = 1;
            cursor.query = (cursor.query + 1) % rule.queries.length;
            await commit(rule, cursor);
            continue;
          }
          while (cursor.offset < page.items.length && count < rule.batchSize) {
            const item = page.items[cursor.offset];
            let repo: DiscoveredRepository | null = null;
            if (!seen.has(`${item.name}/${item.base}`)) {
              try {
                repo = await this.inspect(
                  id,
                  item.name,
                  rule,
                  token,
                  signal,
                  item.base,
                );
              } catch (e) {
                if (errorStatus(e) !== 404) throw e;
              }
              seen.add(`${item.name}/${item.base}`);
              count++;
              run.checked++;
            }
            const pageBefore = cursor.page,
              queryBefore = cursor.query;
            this.advance(
              cursor,
              page.items.length,
              page.total,
              rule.queries.length,
            );
            await commit(rule, cursor, repo);
            if (
              cursor.offset === 0 ||
              pageBefore !== cursor.page ||
              queryBefore !== cursor.query
            )
              break;
          }
          if (page.partial) break;
        }
        if (count >= rule.batchSize || Date.now() - started >= 105000)
          run.partial = true;
        cursor.lastAt = new Date().toISOString();
        cursor.capped = run.capped;
        await commit(rule, cursor);
      }
    } catch (e) {
      if (cancel.aborted) return;
      run.ok = false;
      run.partial = true;
      run.errors = [
        signal.aborted
          ? systemMessageText('githubDiscovery.timeLimit')
          : errorMessage(e),
      ];
      run.configError = errorStatus(e) === 403;
      run.retryAt =
        (e as { retryAt?: string }).retryAt ||
        new Date(Date.now() + 3600000).toISOString();
    }
    run.finishedAt = new Date().toISOString();
    await this.mutate(id, (s) => {
      if (cancel.aborted || s.revision !== snapshot.revision) return;
      s.lastRun = run;
      if (run.ok) s.lastSuccessAt = run.finishedAt;
    });
  }
  async list(
    id: string,
    input: Record<string, unknown>,
  ): Promise<DiscoveryList> {
    const schema = z.object({
      search: z.string().max(200).default(''),
      ruleId: z.string().max(60).default(''),
      status: z
        .enum([
          'all',
          'verified',
          'candidate',
          'mention',
          'confirmed',
          'ignored',
          'favorite',
        ])
        .default('all'),
      sort: z
        .enum(['name', 'stars', 'createdAt', 'firstDiscoveredAt', 'checkedAt'])
        .default('checkedAt'),
      order: z.enum(['asc', 'desc']).default('desc'),
      page: z.number().int().min(1).max(10000).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    });
    const v = schema.safeParse(input);
    if (!v.success) fail('githubDiscovery.invalidRule');
    const q = v.data,
      s = await this.state(id),
      all = Object.values(s.repositories);
    const matches = all.filter(
      (r) =>
        (!q.ruleId || r.matches.some((m) => m.ruleId === q.ruleId)) &&
        `${r.name} ${r.description}`
          .toLowerCase()
          .includes(q.search.toLowerCase()) &&
        (q.status === 'all' ||
          (q.status === 'favorite' && r.favorite) ||
          r.review === q.status ||
          discoveryDetection(r) === q.status),
    );
    matches.sort(
      (a, b) =>
        (q.sort === 'stars'
          ? a.stars - b.stars
          : String(a[q.sort]).localeCompare(String(b[q.sort]))) *
          (q.order === 'asc' ? 1 : -1) || a.id.localeCompare(b.id),
    );
    return {
      items: matches.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      total: matches.length,
      storedTotal: all.length,
      page: q.page,
      pageSize: q.pageSize,
      capped: s.capped,
    };
  }
  async get(id: string, repositoryId: unknown) {
    if (typeof repositoryId !== 'string' || !/^\d+$/.test(repositoryId))
      fail('githubDiscovery.missing', 404);
    const r = (await this.state(id)).repositories[repositoryId];
    if (!r) fail('githubDiscovery.missing', 404);
    return r;
  }
  async review(id: string, input: Record<string, unknown>) {
    const v = z
      .object({
        repositoryId: z.string().regex(/^\d+$/),
        revision: z.number().int().nonnegative(),
        review: z.enum(['unreviewed', 'confirmed', 'ignored']),
        favorite: z.boolean(),
      })
      .safeParse(input);
    if (!v.success) fail('githubDiscovery.invalidRule');
    const s = await this.mutate(id, (s) => {
      const r = s.repositories[v.data.repositoryId];
      if (!r) fail('githubDiscovery.missing', 404);
      if (r.revision !== v.data.revision) fail('githubDiscovery.conflict', 409);
      r.review = v.data.review;
      r.favorite = v.data.favorite;
      r.revision++;
    });
    return s.repositories[v.data.repositoryId];
  }
  async tick() {
    if (this.closed || this.ticking) return;
    this.ticking = true;
    try {
      for (const value of await this.p.projectIds()) {
        const id = String(value);
        if (this.closed) break;
        const s = await this.status(id);
        if (
          !s.connected ||
          !s.nextScanAt ||
          Date.parse(s.nextScanAt) > Date.now() ||
          s.running
        )
          continue;
        try {
          await this.scan(id, true);
          await this.idle(id);
        } catch {
          /* The next tick retries eligible projects; scan failures persist their own status. */
        }
      }
    } finally {
      this.ticking = false;
    }
  }
  async close() {
    this.closed = true;
    const running = [...this.active.values()];
    for (const r of running) r.controller.abort();
    await Promise.allSettled(
      running.flatMap((r) => (r.promise ? [r.promise] : [])),
    );
  }
  register() {
    const wrap =
      (
        fn: (
          id: string,
          values: Record<string, unknown>,
          ctx: LegacyContext,
        ) => Promise<unknown>,
      ) =>
      async (ctx: LegacyContext, next: () => Promise<unknown>) => {
        await requireAccess(ctx);
        const values = (ctx.action.params.values || {}) as Record<
            string,
            unknown
          >,
          id = projectId(values.projectId);
        await this.p.project(id);
        if (ctx.method !== 'POST')
          ctx.throw(405, systemMessageText('githubDiscovery.postRequired'));
        try {
          ctx.body = await fn(id, values, ctx);
          await next();
        } catch (e) {
          ctx.throw(errorStatus(e), errorMessage(e));
        }
      };
    const actions = {
      status: wrap((id) => this.status(id)),
      list: wrap((id, v) => this.list(id, v)),
      get: wrap((id, v) => this.get(id, v.repositoryId)),
      saveRule: wrap((id, v) => this.saveRule(id, v.rule, v.revision)),
      removeRule: wrap((id, v) => this.changeRule(id, v.ruleId, v.revision)),
      setEnabled: wrap((id, v) => {
        if (typeof v.enabled !== 'boolean') fail('githubDiscovery.invalidRule');
        return this.changeRule(id, v.ruleId, v.revision, v.enabled);
      }),
      setToken: wrap((id, v, ctx) =>
        this.setToken(
          id,
          ctx.get('x-nocoreach-discovery-token'),
          v.revision,
          () => requireAccess(ctx),
        ),
      ),
      removeToken: wrap((id, v) => this.removeToken(id, v.revision)),
      preview: wrap((id, v) => this.preview(id, v.rule)),
      scan: wrap((id) => this.scan(id)),
      review: wrap((id, v) => this.review(id, v)),
    };
    this.p.app.resourceManager.define({ name: 'nrGitHubDiscovery', actions });
    this.p.app.acl.allow('nrGitHubDiscovery', Object.keys(actions), 'loggedIn');
  }
}
