import { randomUUID } from 'node:crypto';
import {
  articleDraftSchema,
  ARTICLE_FIELDS,
  fill,
  SLUG,
  type ArticleContent,
  type ArticleDraft,
  type ArticleSnapshot,
  type ArticleTarget,
} from '../../../shared/article-publishing.js';
import type { Divergence } from './downstream.js';
import {
  applied,
  ArticleError,
  changedFields,
  changesOf,
  isEmpty,
  sameText,
  valueAt,
  type ArticleChanges,
  type ArticleProvider,
} from './provider.js';
import type { ArticleTargets } from './targets.js';

// Publishing an approved article draft (docs/ARTICLE-PUBLISHING.md). The task stores what was approved; this module
// does the target I/O outside business transactions and returns an outcome for the task to record.

export type FieldConflict = {
  field: string;
  base: string;
  current: string;
  draft: string;
};
export type PublishOutcome =
  | {
      kind: 'published';
      snapshot: ArticleSnapshot;
      written: string[];
      adopted: boolean;
    }
  | {
      kind: 'conflict';
      reason: 'changed' | 'slug_taken' | 'downstream' | 'missing';
      current?: ArticleSnapshot;
      fields?: FieldConflict[];
      divergence?: Divergence[];
    }
  | { kind: 'failed'; code: string };

/** The article an artifact proposes: the draft, the target and the base it was written against. */
export type ArticleProposal = {
  targetId: string;
  articleId: string | null;
  baseKey: string | null;
  baseVersion: string | null;
  draft: ArticleDraft;
  changes: string[];
  conflicts?: FieldConflict[];
};

/** Keep only the locales and fields the target maps, and drop a status the target has no field for. */
export function cleanDraft(
  target: ArticleTarget,
  value: unknown,
  create: boolean,
): ArticleDraft {
  const parsed = articleDraftSchema.safeParse(value);
  if (!parsed.success)
    throw new ArticleError(
      'invalid',
      `draft:${parsed.error.issues[0]?.path.join('.') || 'article'}`,
    );
  const draft = parsed.data;
  for (const [locale, fields] of Object.entries(draft.locales)) {
    if (!target.locales.includes(locale))
      throw new ArticleError('invalid', `locale:${locale}`);
    for (const f of ARTICLE_FIELDS)
      if (fields[f] !== undefined && !mapped(target, locale, f))
        throw new ArticleError('invalid', `field:${locale}.${f}`);
  }
  if (create) {
    if (!draft.slug || !SLUG.test(draft.slug))
      throw new ArticleError('invalid', 'slug');
    const first = draft.locales[target.locales[0]];
    if (!first?.title?.trim() || !first.body?.trim())
      throw new ArticleError('invalid', `locale:${target.locales[0]}`);
  }
  if (
    draft.status &&
    !(target.kind === 'nocobase-api'
      ? target.fields.status
      : target.kind === 'http')
  )
    delete draft.status;
  if (target.kind === 'git-files' && draft.slug && !create) delete draft.slug;
  return draft;
}
function mapped(
  target: ArticleTarget,
  locale: string,
  field: (typeof ARTICLE_FIELDS)[number],
) {
  if (target.kind === 'http') return true;
  if (target.kind === 'nocobase-api')
    return Boolean(target.fields.locales[locale]?.[field]);
  if (field === 'body') return Boolean(target.files[locale]);
  return target.format === 'frontmatter'
    ? Boolean(target.frontmatter)
    : Boolean(target.metadata?.keys[locale]?.[field]);
}

const asChanges = (d: ArticleDraft): ArticleChanges => ({
  ...(d.slug ? { slug: d.slug } : {}),
  ...(d.status ? { status: d.status } : {}),
  locales: d.locales,
});

/** The pages to check after publishing: the configured page of every locale the draft changes. */
export function articlePages(
  target: ArticleTarget,
  slug: string,
  changes: string[],
) {
  const locales = [
    ...new Set(
      changes.filter((c) => c.includes('.')).map((c) => c.split('.')[0]),
    ),
  ];
  return locales
    .map((l) => target.pages?.[l])
    .filter(Boolean)
    .map((t) => fill(t!, slug))
    .slice(0, 10);
}

/** A verification phrase only helps when the change actually contains it. */
export function verifyPhrase(draft: ArticleDraft): string | undefined {
  const phrase = draft.verifyText?.replace(/\s+/g, ' ').trim();
  if (!phrase || phrase.length < 8) return undefined;
  const flat = (s?: string) => (s || '').replace(/\s+/g, ' ');
  return Object.values(draft.locales).some(
    (f) => flat(f.body).includes(phrase) || flat(f.title).includes(phrase),
  )
    ? phrase
    : undefined;
}

export class ArticleDelivery {
  constructor(private readonly targets: ArticleTargets) {}
  provider(project: string, targetId: string) {
    return this.targets.provider(project, targetId);
  }
  target(project: string, targetId: string) {
    return this.targets.target(project, targetId);
  }
  async read(
    project: string,
    targetId: string,
    articleId: string,
  ): Promise<ArticleSnapshot> {
    return this.provider(project, targetId).get(articleId);
  }
  /** What the draft changes against its base, field by field. Empty when the draft repeats the base. */
  proposal(
    project: string,
    input: {
      targetId: string;
      articleId: string | null;
      base: ArticleSnapshot | null;
      baseKey: string | null;
      draft: unknown;
    },
  ): ArticleProposal {
    const target = this.target(project, input.targetId);
    const draft = cleanDraft(target, input.draft, !input.articleId);
    return {
      targetId: input.targetId,
      articleId: input.articleId,
      baseKey: input.baseKey,
      baseVersion: input.base?.version ?? null,
      draft,
      changes: changedFields(input.base, asChanges(draft)),
    };
  }
  /**
   * Publish an approved proposal. A retried call after an unknown outcome reads the target first and adopts a write
   * that already landed, so retries never write twice. Field-level rule: someone else's change to a field the draft
   * leaves alone is kept; a field both changed differently is a conflict for a person to resolve.
   */
  async publish(
    project: string,
    p: ArticleProposal,
    base: ArticleSnapshot | null,
    key: string,
  ): Promise<PublishOutcome> {
    let provider: ArticleProvider;
    try {
      provider = this.provider(project, p.targetId);
    } catch {
      return { kind: 'failed', code: 'target_missing' };
    }
    const wanted = changesOf(base, asChanges(p.draft));
    try {
      if (!p.articleId)
        return await this.create(project, provider, p, wanted, key);
      let current: ArticleSnapshot;
      try {
        current = await provider.get(p.articleId);
      } catch (error) {
        if (error instanceof ArticleError && error.code === 'not_found')
          return { kind: 'conflict', reason: 'missing' };
        throw error;
      }
      if (isEmpty(wanted) || applied(current, wanted))
        return {
          kind: 'published',
          snapshot: current,
          written: changedFields(base, wanted),
          adopted: true,
        };
      if (current.version !== p.baseVersion) {
        const fields = changedFields(base, wanted)
          .filter(
            (f) =>
              !sameText(valueAt(current, f), valueAt(base, f)) &&
              !sameText(valueAt(current, f), valueAt(wanted, f)),
          )
          .map((f) => ({
            field: f,
            base: valueAt(base, f) ?? '',
            current: valueAt(current, f) ?? '',
            draft: valueAt(wanted, f) ?? '',
          }));
        if (fields.length)
          return { kind: 'conflict', reason: 'changed', current, fields };
      }
      const downstream = this.targets.downstream(project, p.targetId);
      const divergence = downstream
        ? await downstream.divergence(current, wanted)
        : [];
      if (divergence.length)
        return { kind: 'conflict', reason: 'downstream', current, divergence };
      const after = await provider.update(
        p.articleId,
        changesOf(current, wanted),
        { baseVersion: current.version, key },
      );
      if (!applied(after, wanted))
        return { kind: 'failed', code: 'not_applied' };
      return {
        kind: 'published',
        snapshot: after,
        written: changedFields(base, wanted),
        adopted: false,
      };
    } catch (error) {
      if (error instanceof ArticleError) {
        if (error.code === 'conflict')
          return {
            kind: 'conflict',
            reason: 'changed',
            current: error.current,
          };
        if (error.code === 'slug_taken')
          return {
            kind: 'conflict',
            reason: 'slug_taken',
            current: error.current,
          };
        return { kind: 'failed', code: error.code };
      }
      return { kind: 'failed', code: 'unavailable' };
    }
  }
  private async create(
    project: string,
    provider: ArticleProvider,
    p: ArticleProposal,
    wanted: ArticleChanges,
    key: string,
  ): Promise<PublishOutcome> {
    const content: ArticleContent = {
      slug: p.draft.slug!,
      ...(p.draft.status ? { status: p.draft.status } : {}),
      locales: p.draft.locales,
    };
    const existing = await provider.findBySlug(content.slug);
    // An earlier attempt that created the article (its outcome was unknown) is adopted; anything else owns the slug.
    if (existing)
      return applied(existing, wanted)
        ? {
            kind: 'published',
            snapshot: existing,
            written: changedFields(null, wanted),
            adopted: true,
          }
        : { kind: 'conflict', reason: 'slug_taken', current: existing };
    const downstream = this.targets.downstream(project, p.targetId);
    const divergence = downstream
      ? await downstream.divergence({ slug: content.slug, locales: {} }, wanted)
      : [];
    if (divergence.length)
      return { kind: 'conflict', reason: 'downstream', divergence };
    const created = await provider.create(content, { key });
    return {
      kind: 'published',
      snapshot: created,
      written: changedFields(null, wanted),
      adopted: false,
    };
  }
  /** Whether the target's exporter has brought the published fields into Git. Null when the target has no downstream. */
  async exported(
    project: string,
    targetId: string,
    published: ArticleContent,
    written: string[],
  ) {
    const downstream = this.targets.downstream(project, targetId);
    return downstream ? downstream.exported(published, written) : null;
  }
  /** Published fields that now hold something else in the target (an overwrite after publishing). */
  async drift(
    project: string,
    targetId: string,
    articleId: string,
    published: ArticleContent,
    written: string[],
  ) {
    const current = await this.provider(project, targetId).get(articleId);
    return {
      current,
      fields: written
        .filter((f) => !sameText(valueAt(current, f), valueAt(published, f)))
        .map((f) => ({
          field: f,
          published: valueAt(published, f) ?? '',
          current: valueAt(current, f) ?? '',
        })),
    };
  }
}

export const publishKey = () => randomUUID();
