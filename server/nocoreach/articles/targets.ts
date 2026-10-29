import { z } from 'zod';
import {
  ARTICLE_CAPABILITIES,
  articleLocales,
  articleTargetSchema,
  TARGET_ID,
  type ArticleTarget,
  type ArticleTargetView,
  slugFromPage,
  type ArticleMatch,
} from '../../../shared/article-publishing.js';
import { projectId, requireAccess } from '../policy.js';
import type { LegacyVariables } from '../legacy/variables.js';
import type { LegacyApp } from '../legacy/app.js';
import type { LegacyContext } from '../legacy/context.js';
import { DownstreamGit } from './downstream.js';
import { GitArticles } from './git-files.js';
import { HttpArticles } from './http-protocol.js';
import { NocoBaseArticles } from './nocobase-api.js';
import {
  ArticleError,
  providerErrorKey,
  scalar,
  type ArticleProvider,
  type Fetcher,
} from './provider.js';

const PLAYBOOK_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const secret = z.string().trim().min(1).max(4000);
const stored = z.object({
  revision: z.number().int().nonnegative(),
  targets: z
    .array(
      z.object({
        target: articleTargetSchema,
        secret: secret.optional(),
        gitToken: secret.optional(),
        // The latest Check (2026-10-29), kept for the settings it read with: saving the target drops it.
        check: z
          .object({
            at: z.string().max(40),
            ok: z.boolean(),
            code: z.string().max(80).optional(),
          })
          .optional(),
      }),
    )
    .max(10),
  // Which target a new task publishes to; absent means the first one.
  defaultTargetId: z.string().regex(TARGET_ID).optional(),
  // Where each playbook's new tasks publish (a target id, or 'repo' for a pull request); absent means the default.
  playbookTargets: z
    .record(z.string().regex(PLAYBOOK_ID), z.string().regex(TARGET_ID))
    .refine((m) => Object.keys(m).length <= 100)
    .optional(),
});
type Stored = z.infer<typeof stored>;
type Entry = Stored['targets'][number];
export type FetcherFor = (
  project: string,
  connection: 'site' | 'github',
) => Fetcher;

function fail(key: string, status = 400): never {
  throw Object.assign(new Error(`articles.${key}`), { status });
}
// Where a credential is sent: changing it requires the credential again, so a saved key cannot be redirected.
const endpoint = (t: ArticleTarget) =>
  t.kind === 'git-files' ? `github:${t.repo}` : new URL(t.baseUrl).origin;
const downstreamOf = (t: ArticleTarget) =>
  t.kind === 'git-files' ? undefined : t.downstream;

/** A project's publishing targets, sealed in nrVariables with their credentials. */
export class ArticleTargets {
  constructor(
    private readonly variables: LegacyVariables,
    private readonly fetcherFor: FetcherFor,
  ) {}
  private key(id: string) {
    return `NOREACH_ARTICLE_TARGETS_${projectId(id)}`;
  }
  private stored(id: string): Stored {
    const key = this.key(id);
    if (this.variables.cannotRead(key)) fail('unreadable', 503);
    const raw = this.variables.get(key);
    if (!raw) return { revision: 0, targets: [] };
    try {
      return stored.parse(JSON.parse(raw));
    } catch {
      return fail('unreadable', 503);
    }
  }
  private view(e: Entry): ArticleTargetView {
    return {
      ...e.target,
      hasSecret: Boolean(e.secret),
      capabilities: ARTICLE_CAPABILITIES[e.target.kind],
      check: e.check ?? null,
    };
  }
  list(id: string) {
    const s = this.stored(id);
    return {
      revision: s.revision,
      defaultTargetId: this.defaultOf(s),
      playbookTargets: this.playbooksOf(s),
      targets: s.targets.map((e) => this.view(e)),
    };
  }
  private playbooksOf(s: Stored): Record<string, string> {
    return Object.fromEntries(
      Object.entries(s.playbookTargets || {}).filter(
        ([, t]) => t === 'repo' || s.targets.some((e) => e.target.id === t),
      ),
    );
  }
  private defaultOf(s: Stored) {
    return s.targets.some((e) => e.target.id === s.defaultTargetId)
      ? s.defaultTargetId
      : s.targets[0]?.target.id;
  }
  /** Validate the complete settings before writing, so a rejected change leaves the stored ones readable. */
  private async persist(id: string, settings: Stored) {
    const parsed = stored.safeParse(settings);
    if (!parsed.success) fail('invalidTarget');
    await this.variables.set(this.key(id), JSON.stringify(parsed.data), true);
    return this.list(id);
  }
  target(id: string, targetId: string): ArticleTarget {
    const e = this.stored(id).targets.find((t) => t.target.id === targetId);
    if (!e) return fail('targetMissing', 409);
    return e.target;
  }
  targets(id: string): ArticleTarget[] {
    return this.stored(id).targets.map((e) => e.target);
  }
  provider(id: string, targetId: string): ArticleProvider {
    const e = this.stored(id).targets.find((t) => t.target.id === targetId);
    if (!e) return fail('targetMissing', 409);
    const t = e.target;
    if (t.kind === 'git-files')
      return new GitArticles(t, e.secret, this.fetcherFor(id, 'github'));
    if (!e.secret) return fail('secretRequired', 409);
    return t.kind === 'http'
      ? new HttpArticles(t, e.secret, this.fetcherFor(id, 'site'))
      : new NocoBaseArticles(t, e.secret, this.fetcherFor(id, 'site'));
  }
  downstream(id: string, targetId: string): DownstreamGit | null {
    const e = this.stored(id).targets.find((t) => t.target.id === targetId);
    const d = e && downstreamOf(e.target);
    return d
      ? new DownstreamGit(d, e.gitToken, this.fetcherFor(id, 'github'))
      : null;
  }
  /** Build changes must not edit files a target's exporter rewrites. */
  owned(id: string, paths: string[]) {
    const ds = this.targets(id)
      .map(downstreamOf)
      .filter(Boolean) as NonNullable<ReturnType<typeof downstreamOf>>[];
    return paths.filter((p) => ds.some((d) => DownstreamGit.owns(d, p)));
  }
  ownedTemplates(id: string) {
    return this.targets(id).flatMap((t) => {
      const d = downstreamOf(t);
      return d
        ? [...Object.values(d.files), ...(d.metadata ? [d.metadata.path] : [])]
        : [];
    });
  }
  async save(id: string, values: Record<string, unknown>) {
    const old = this.stored(id);
    if (values.revision !== old.revision) fail('stale', 409);
    const parsed = articleTargetSchema.safeParse(values.target);
    if (!parsed.success) fail('invalidTarget');
    const target = parsed.data;
    // 'repo' stands for the website repository wherever a target is chosen; no new target takes it.
    if (
      target.id === 'repo' &&
      !old.targets.some((e) => e.target.id === 'repo')
    )
      fail('invalidTarget');
    const unknownLocale = (map?: Record<string, unknown>) =>
      Object.keys(map || {}).some((l) => !target.locales.includes(l));
    if (
      unknownLocale(target.pages) ||
      unknownLocale(
        target.kind === 'nocobase-api'
          ? target.fields.locales
          : target.kind === 'git-files'
            ? target.files
            : undefined,
      )
    )
      fail('invalidLocale');
    const read = (k: 'secret' | 'gitToken') => {
      const v = values[k];
      if (v === undefined || v === '') return undefined;
      const s = secret.safeParse(v);
      return s.success ? s.data : fail('invalidSecret');
    };
    const previous = old.targets.find((e) => e.target.id === target.id);
    const sameEndpoint =
      previous && endpoint(previous.target) === endpoint(target);
    const sameDownstream =
      previous &&
      downstreamOf(previous.target)?.repo === downstreamOf(target)?.repo;
    const next: Entry = {
      target,
      secret: read('secret') ?? (sameEndpoint ? previous.secret : undefined),
      gitToken: downstreamOf(target)
        ? (read('gitToken') ??
          (sameDownstream ? previous?.gitToken : undefined))
        : undefined,
    };
    // Every kind writes with its credential (a Git target commits with its token).
    if (!next.secret)
      fail(
        previous && !sameEndpoint ? 'secretForNewEndpoint' : 'secretRequired',
      );
    // An edited target keeps its place: the order is what people see, and the first one is the fallback default.
    const targets = previous
      ? old.targets.map((e) => (e.target.id === target.id ? next : e))
      : [...old.targets, next];
    return this.persist(id, { ...old, revision: old.revision + 1, targets });
  }
  async setDefault(id: string, values: Record<string, unknown>) {
    const old = this.stored(id);
    if (values.revision !== old.revision) fail('stale', 409);
    const targetId = values.id === null ? undefined : values.id;
    if (
      targetId !== undefined &&
      !old.targets.some((e) => e.target.id === targetId)
    )
      fail('targetMissing', 404);
    return this.persist(id, {
      ...old,
      revision: old.revision + 1,
      defaultTargetId: targetId as string | undefined,
    });
  }
  async savePlaybooks(id: string, values: Record<string, unknown>) {
    const old = this.stored(id);
    if (values.revision !== old.revision) fail('stale', 409);
    const map = values.playbookTargets;
    if (!map || typeof map !== 'object' || Array.isArray(map))
      fail('invalidPlaybookTargets');
    const entries = Object.entries(map as Record<string, unknown>);
    if (
      entries.length > 100 ||
      entries.some(
        ([p, t]) =>
          !PLAYBOOK_ID.test(p) ||
          (t !== 'repo' && !old.targets.some((e) => e.target.id === t)),
      )
    )
      fail('invalidPlaybookTargets');
    const { playbookTargets: _, ...rest } = old;
    return this.persist(id, {
      ...rest,
      revision: old.revision + 1,
      ...(entries.length
        ? {
            playbookTargets: Object.fromEntries(entries) as Record<
              string,
              string
            >,
          }
        : {}),
    });
  }
  async remove(id: string, values: Record<string, unknown>) {
    const old = this.stored(id);
    if (values.revision !== old.revision) fail('stale', 409);
    const targets = old.targets.filter((e) => e.target.id !== values.id);
    if (targets.length === old.targets.length) fail('targetMissing', 404);
    const playbookTargets = Object.fromEntries(
      Object.entries(old.playbookTargets || {}).filter(
        ([, t]) => t !== values.id,
      ),
    );
    return this.persist(id, {
      revision: old.revision + 1,
      targets,
      ...(old.defaultTargetId !== values.id && old.defaultTargetId
        ? { defaultTargetId: old.defaultTargetId }
        : {}),
      ...(Object.keys(playbookTargets).length ? { playbookTargets } : {}),
    });
  }
  /**
   * Read one page of articles (and the downstream branch) to prove the settings and credentials work. The outcome is
   * kept on the target with its time, so its card shows whether it works; the settings' revision stays as it was.
   */
  async test(id: string, targetId: string) {
    const result = await this.probe(id, targetId);
    const now = this.stored(id),
      check = {
        at: new Date().toISOString(),
        ok: result.ok,
        ...(result.ok ? {} : { code: result.code }),
      };
    if (now.targets.some((e) => e.target.id === targetId))
      await this.persist(id, {
        ...now,
        targets: now.targets.map((e) =>
          e.target.id === targetId ? { ...e, check } : e,
        ),
      });
    return { ...result, check };
  }
  private async probe(
    id: string,
    targetId: string,
  ): Promise<
    | { ok: true; sample: { id: string; title: string } | null }
    | { ok: false; code: string }
  > {
    try {
      const found = await this.provider(id, targetId).search('', 1);
      const d = this.downstream(id, targetId);
      if (d)
        await d.divergence(
          { slug: found[0]?.slug || 'nocoreach-connection-test', locales: {} },
          { locales: {} },
        );
      return {
        ok: true,
        sample: found[0]
          ? { id: found[0].id, title: found[0].title || found[0].slug }
          : null,
      };
    } catch (error) {
      if (error instanceof ArticleError) return { ok: false, code: error.code };
      throw error;
    }
  }
  /**
   * The article a task's page belongs to (2026-10-21): each page address read back through every target's `pages`
   * patterns gives a slug, looked up with findBySlug; the default target is asked first. Read-only. `unchecked` says a
   * target that could hold the page could not be asked (no secret, offline), so "not found" is not known for sure.
   */
  async match(
    id: string,
    urls: unknown,
  ): Promise<{ article: ArticleMatch | null; unchecked: boolean }> {
    const pages = (Array.isArray(urls) ? urls : [])
      .filter((u): u is string => typeof u === 'string' && u.length <= 2000)
      .slice(0, 10);
    const settings = this.stored(id),
      first = this.defaultOf(settings);
    const targets = [...settings.targets]
      .map((e) => e.target)
      .sort((a, b) => Number(b.id === first) - Number(a.id === first));
    let unchecked = false;
    for (const url of pages)
      for (const target of targets) {
        const hit = slugFromPage(target.pages, url);
        if (!hit) continue;
        try {
          const found = await this.provider(id, target.id).findBySlug(hit.slug);
          if (!found) continue;
          const title =
            found.locales[hit.locale]?.title ||
            Object.values(found.locales).find((f) => f?.title)?.title ||
            found.slug ||
            hit.slug;
          return {
            article: {
              targetId: target.id,
              articleId: found.id,
              slug: found.slug || hit.slug,
              title,
              url,
              locales: articleLocales(found),
            },
            unchecked: false,
          };
        } catch {
          unchecked = true;
        }
      }
    return { article: null, unchecked };
  }
  async search(id: string, targetId: string, q: unknown) {
    const provider = this.provider(id, targetId);
    if (!provider.capabilities.search) return [];
    try {
      return await provider.search(typeof q === 'string' ? q : '', 20);
    } catch (error) {
      if (error instanceof ArticleError)
        throw Object.assign(new Error(providerErrorKey(error.code)), {
          status: error.status,
        });
      throw error;
    }
  }
  /** The languages an article has text in, for picking what to translate (read-only). */
  async languages(id: string, targetId: string, articleId: string) {
    try {
      return {
        locales: articleLocales(
          await this.provider(id, targetId).get(articleId),
        ),
      };
    } catch (error) {
      if (error instanceof ArticleError)
        throw Object.assign(new Error(providerErrorKey(error.code)), {
          status: error.status,
        });
      throw error;
    }
  }
  register(p: {
    app: LegacyApp;
    project(id: string): Promise<unknown>;
    taskExecution?: {
      latestPublished(id: string): Promise<Record<string, unknown>>;
    };
  }) {
    const wrap =
      (
        fn: (id: string, values: Record<string, unknown>) => unknown,
        write = false,
      ) =>
      async (ctx: LegacyContext, next: () => Promise<void>) => {
        const role: unknown = await requireAccess(ctx);
        if (write && !ctx.db?.access && role !== 'admin')
          fail('noPermission', 403);
        if (write && ctx.method !== 'POST') fail('saveFailed', 405);
        ctx.set('Cache-Control', 'no-store');
        const values = (ctx.action.params.values ?? {}) as Record<
          string,
          unknown
        >;
        const id = projectId(values.projectId);
        await p.project(id);
        ctx.body = await fn(id, values);
        await next();
      };
    p.app.resourceManager.define({
      name: 'nrArticles',
      actions: {
        // With the article each target last published (the task service reads the tasks).
        targets: wrap(async (id) => ({
          ...this.list(id),
          published: (await p.taskExecution?.latestPublished(id)) ?? {},
        })),
        search: wrap((id, v) => this.search(id, scalar(v.targetId), v.q)),
        match: wrap((id, v) => this.match(id, v.urls)),
        languages: wrap((id, v) =>
          this.languages(id, scalar(v.targetId), scalar(v.articleId)),
        ),
        saveTarget: wrap((id, v) => this.save(id, v), true),
        removeTarget: wrap((id, v) => this.remove(id, v), true),
        setDefaultTarget: wrap((id, v) => this.setDefault(id, v), true),
        savePlaybookTargets: wrap((id, v) => this.savePlaybooks(id, v), true),
        testTarget: wrap((id, v) => this.test(id, scalar(v.targetId)), true),
      },
    });
    p.app.acl.allow(
      'nrArticles',
      [
        'targets',
        'search',
        'match',
        'languages',
        'saveTarget',
        'removeTarget',
        'setDefaultTarget',
        'savePlaybookTargets',
        'testTarget',
      ],
      'loggedIn',
    );
  }
}
