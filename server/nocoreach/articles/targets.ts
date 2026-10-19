import { z } from 'zod';
import {
  ARTICLE_CAPABILITIES,
  articleTargetSchema,
  TARGET_ID,
  type ArticleTarget,
  type ArticleTargetView,
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

const secret = z.string().trim().min(1).max(4000);
const stored = z.object({
  revision: z.number().int().nonnegative(),
  targets: z
    .array(
      z.object({
        target: articleTargetSchema,
        secret: secret.optional(),
        gitToken: secret.optional(),
      }),
    )
    .max(10),
  // Which target a new task publishes to; absent means the first one.
  defaultTargetId: z.string().regex(TARGET_ID).optional(),
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
    };
  }
  list(id: string) {
    const s = this.stored(id);
    return {
      revision: s.revision,
      defaultTargetId: this.defaultOf(s),
      targets: s.targets.map((e) => this.view(e)),
    };
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
  async remove(id: string, values: Record<string, unknown>) {
    const old = this.stored(id);
    if (values.revision !== old.revision) fail('stale', 409);
    const targets = old.targets.filter((e) => e.target.id !== values.id);
    if (targets.length === old.targets.length) fail('targetMissing', 404);
    return this.persist(id, {
      revision: old.revision + 1,
      targets,
      ...(old.defaultTargetId !== values.id && old.defaultTargetId
        ? { defaultTargetId: old.defaultTargetId }
        : {}),
    });
  }
  /** Read one page of articles (and the downstream branch) to prove the settings and credentials work. */
  async test(id: string, targetId: string) {
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
  register(p: { app: LegacyApp; project(id: string): Promise<unknown> }) {
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
        targets: wrap((id) => this.list(id)),
        search: wrap((id, v) => this.search(id, scalar(v.targetId), v.q)),
        saveTarget: wrap((id, v) => this.save(id, v), true),
        removeTarget: wrap((id, v) => this.remove(id, v), true),
        setDefaultTarget: wrap((id, v) => this.setDefault(id, v), true),
        testTarget: wrap((id, v) => this.test(id, scalar(v.targetId)), true),
      },
    });
    p.app.acl.allow(
      'nrArticles',
      [
        'targets',
        'search',
        'saveTarget',
        'removeTarget',
        'setDefaultTarget',
        'testTarget',
      ],
      'loggedIn',
    );
  }
}
