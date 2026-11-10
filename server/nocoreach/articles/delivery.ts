import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import {
  articleDraftSchema,
  ARTICLE_FIELDS,
  coverKeys,
  fill,
  pagePattern,
  LOCALE,
  SHARED_COVER,
  SLUG,
  supportsStatus,
  type ArticleContent,
  type ArticleDraft,
  type ArticleSnapshot,
  type ArticleTarget,
} from '../../../shared/article-publishing.js';
import {
  systemMessageText,
  type SystemMessage,
} from '../../../shared/i18n/messages.js';
import type { Divergence } from './downstream.js';
import {
  applied,
  ArticleError,
  changedFields,
  changesOf,
  errorDetail,
  isEmpty,
  sameText,
  valueAt,
  type ArticleChanges,
  type ArticleImageFile,
  type ArticleProvider,
} from './provider.js';
import {
  replaceTaskImages,
  taskImageIds,
  taskImageOf,
} from '../../../shared/task-images.js';
import type { ArticleTargets } from './targets.js';
import { bodyEdits } from './edits.js';

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
  | PublishFailure;
export type PublishFailure = {
  kind: 'failed';
  code: string;
  /** Where it stopped: reading the article, checking the downstream repository, writing, or checking the write. */
  step: PublishStep;
  /** What the target or the error said (errorDetail), for Technical details and the server log. */
  detail?: string;
};
export type PublishStep = 'read' | 'images' | 'downstream' | 'write' | 'verify';
export function failed(step: PublishStep, error: unknown): PublishFailure {
  const detail = errorDetail(error);
  return {
    kind: 'failed',
    code: error instanceof ArticleError ? error.code : 'unavailable',
    step,
    ...(detail ? { detail } : {}),
  };
}

/** The article an artifact proposes: the draft, the target and the base it was written against. */
export type ArticleProposal = {
  targetId: string;
  articleId: string | null;
  baseKey: string | null;
  baseVersion: string | null;
  draft: ArticleDraft;
  changes: string[];
  conflicts?: FieldConflict[];
  /** Fields a leg published before a rebase: still tracked for export and overwrites once it is adopted. */
  carried?: string[];
  /** The other targets the same article goes to (a task publishing to several targets). */
  also?: AlsoProposal[];
};
/** The article for one other target: the draft as that target can hold it, against that target's own base. */
export type AlsoProposal = Omit<ArticleProposal, 'also'> & {
  /** Locales (`ja`), fields (`en.description`) and `status` the target cannot hold, left out. */
  skipped: string[];
  slug: string;
  title: string;
};

/**
 * A draft the target cannot take. The message is a short code for logs and tests (`missing:en`, `locale:fr`,
 * `field:zh.description`, `slug`, `draft:<path>`); `problem` says the same in words the Agent can act on and a person
 * can read (2026-10-27: T-47's Agent read `locale:en` as a setting to fix and gave up instead of writing English).
 */
export class DraftRejected extends ArticleError {
  constructor(
    code: string,
    readonly problem: SystemMessage,
  ) {
    super('invalid', code);
  }
}
const rejected = (code: string, key: string, ...params: unknown[]) =>
  new DraftRejected(code, {
    key: `articles.draft.${key}`,
    params: Object.fromEntries(params.map((p, i) => [i, p])),
  });
/** What a rejected draft means, as server text: the problem in words, else the code. */
export const draftRejection = (error: ArticleError) =>
  error instanceof DraftRejected
    ? systemMessageText(error.problem.key, error.problem.params)
    : systemMessageText('articles.invalidDraft', { 0: error.message });

// Languages are named in the language the server's messages are written in (Chinese), followed by the code the draft
// uses in full-width brackets. The client reads such a list back into the reader's language (client/i18n/index.tsx).
const names = new Intl.DisplayNames(['zh-CN'], { type: 'language' });
function language(code: string) {
  let name = '';
  try {
    if (LOCALE.test(code)) name = names.of(code) || '';
  } catch {
    /* not a language code */
  }
  return name && name !== code ? `${name}（${code}）` : code;
}
const languages = (codes: string[]) => codes.map(language).join('、');

function schemaProblem(
  issue: z.core.$ZodIssue | undefined,
  target: ArticleTarget,
) {
  const path = (issue?.path || []).map(String),
    code = `draft:${path.join('.') || 'article'}`;
  if (path[0] === 'slug') return rejected(code, 'slug');
  if (
    path[0] === 'locales' &&
    path.length === 2 &&
    issue?.code === 'invalid_key'
  )
    return rejected(
      code,
      'otherLanguage',
      target.name,
      language(path[1]),
      languages(target.locales),
    );
  if (path[0] === 'locales' && path.length === 3 && issue?.code === 'too_big')
    return rejected(code, 'tooLong', language(path[1]), path[2], issue.maximum);
  return rejected(code, 'format', path.join('.') || 'article');
}

/** A draft for the primary language alone (phase `primary`) that holds other languages only: written in the wrong one. */
export function primaryOnly(primary: string, value: unknown) {
  const locales = (value as { locales?: unknown } | null)?.locales;
  if (!locales || typeof locales !== 'object' || primary in locales)
    return undefined;
  const written = Object.keys(locales);
  return written.length
    ? rejected(
        `missing:${primary}`,
        'primaryOnly',
        language(primary),
        languages(written),
      )
    : undefined;
}

/**
 * A translation or an update of the other languages (phase `translate` or `update`) that holds none of the languages it
 * is to write. 2026-10-28 (T-53): a script failed and the Agent submitted the primary-only file an earlier run had left
 * in its workspace; the other languages were dropped without a word and the approved primary passed as the translation.
 */
export function writesNone(write: string[], primary: string, value: unknown) {
  const locales = (value as { locales?: unknown } | null)?.locales;
  if (!locales || typeof locales !== 'object') return undefined;
  const written = Object.keys(locales);
  return written.length && !written.some((l) => write.includes(l))
    ? rejected(
        `missing:${write.join(',')}`,
        'othersMissing',
        languages(write),
        language(primary),
        languages(written),
      )
    : undefined;
}

/**
 * Keep only the locales and fields the target maps, and drop a status the target has no field for. A new article needs
 * a title and body in `primary`: the task's primary language, by default the target's first; null asks for none (another
 * target while the task's other languages are still to be translated).
 */
export function cleanDraft(
  target: ArticleTarget,
  value: unknown,
  create: boolean,
  primary: string | null = target.locales[0],
): ArticleDraft {
  const parsed = articleDraftSchema.safeParse(value);
  if (!parsed.success) throw schemaProblem(parsed.error.issues[0], target);
  const draft = parsed.data;
  for (const [locale, fields] of Object.entries(draft.locales)) {
    if (!target.locales.includes(locale))
      throw rejected(
        `locale:${locale}`,
        'otherLanguage',
        target.name,
        language(locale),
        languages(target.locales),
      );
    for (const f of ARTICLE_FIELDS)
      if (fields[f] !== undefined && !mapped(target, locale, f))
        throw rejected(
          `field:${locale}.${f}`,
          'unmappedField',
          target.name,
          language(locale),
          f,
        );
  }
  // A cover only where the target keeps one (2026-11-05); a person sets it, the Agent's is dropped before.
  const keys = coverKeys(target);
  for (const key of Object.keys(draft.cover || {}))
    if (!keys.includes(key))
      throw rejected(`cover:${key}`, 'coverUnsupported', target.name);
  if (draft.cover && !Object.keys(draft.cover).length) delete draft.cover;
  if (create) {
    if (!draft.slug || !SLUG.test(draft.slug)) throw rejected('slug', 'slug');
    const first = primary ? draft.locales[primary] : undefined;
    if (primary && (!first?.title?.trim() || !first.body?.trim())) {
      const code = `missing:${primary}`;
      if (first?.title?.trim())
        throw rejected(code, 'missingField', language(primary), 'body');
      if (first?.body?.trim())
        throw rejected(code, 'missingField', language(primary), 'title');
      // What it wrote instead: the languages with any text.
      const written = Object.keys(draft.locales).filter((l) =>
        ARTICLE_FIELDS.some((f) => draft.locales[l][f]?.trim()),
      );
      throw written.length
        ? rejected(code, 'needsPrimary', language(primary), languages(written))
        : rejected(code, 'needsPrimaryNone', language(primary));
    }
  }
  if (draft.status && !supportsStatus(target)) delete draft.status;
  // A new article is a draft unless someone chose to publish it, whatever the target's own default is.
  if (create && !draft.status && supportsStatus(target)) draft.status = 'draft';
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

/**
 * The draft for another target. An existing article there gets the fields the draft holds; a new one gets the whole
 * article as it will be after the change (the source with the draft applied). What the target cannot hold is left out.
 */
export function projectDraft(
  target: ArticleTarget,
  draft: ArticleDraft,
  source: ArticleSnapshot | null,
  create: boolean,
) {
  const skipped: string[] = [];
  const whole = create && source;
  const locales: ArticleDraft['locales'] = {};
  for (const locale of new Set([
    ...Object.keys(whole ? source.locales : {}),
    ...Object.keys(draft.locales),
  ])) {
    const fields = {
      ...(whole ? source.locales[locale] : {}),
      ...draft.locales[locale],
    };
    // A field the draft clears ('') still counts for an existing article; a new one only takes filled fields.
    const present = ARTICLE_FIELDS.filter((f) =>
      whole ? Boolean(fields[f]?.trim()) : fields[f] !== undefined,
    );
    if (!present.length) continue;
    if (!target.locales.includes(locale)) {
      skipped.push(locale);
      continue;
    }
    const kept: Partial<Record<(typeof ARTICLE_FIELDS)[number], string>> = {};
    for (const f of present)
      if (mapped(target, locale, f)) kept[f] = fields[f]!;
      else skipped.push(`${locale}.${f}`);
    if (Object.keys(kept).length) locales[locale] = kept;
  }
  const status = draft.status ?? (whole ? source.status : undefined);
  if (status && !supportsStatus(target)) skipped.push('status');
  const slug = draft.slug || (whole ? source.slug : undefined);
  const { cover: _, ...rest } = draft;
  const cover = projectCover(target, draft.cover);
  if (draft.cover && Object.keys(draft.cover).length && !cover)
    skipped.push('cover');
  return {
    draft: {
      ...rest,
      ...(slug ? { slug } : {}),
      ...(status ? { status } : {}),
      locales,
      ...(cover ? { cover } : {}),
    },
    skipped,
  };
}

/**
 * The covers another target gets from the primary's (2026-11-05): the same image, cropped to the primary's ratio. A
 * shared cover goes to each of its languages, a language's to the shared one when that is the target's only cover (the
 * first language that has one). Undefined when the target takes no covers or nothing changes.
 */
function projectCover(target: ArticleTarget, cover: ArticleDraft['cover']) {
  const keys = coverKeys(target),
    given = Object.entries(cover || {});
  if (!keys.length || !given.length) return undefined;
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value =
      key === SHARED_COVER
        ? (cover?.[SHARED_COVER] ??
          target.locales.map((l) => cover?.[l]).find((v) => v !== undefined))
        : (cover?.[key] ?? cover?.[SHARED_COVER]);
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The task images a draft shows (2026-11-03), each once. */
export const draftImageIds = (draft: ArticleDraft) =>
  taskImageIds(
    Object.values(draft.locales).flatMap((fields) => Object.values(fields)),
  );
/** The task images a draft sets as covers (2026-11-05), each once. */
export const draftCoverIds = (draft: ArticleDraft) => [
  ...new Set(
    Object.values(draft.cover || {}).flatMap((v) => {
      const image = taskImageOf(v);
      return image ? [image.id] : [];
    }),
  ),
];

/** The proposal with each cover that is a task image at the value its target gave it when uploaded (`urls`, by id). */
export function withCoverUrls<T extends { draft: ArticleDraft }>(
  p: T,
  urls: Record<string, string> | undefined,
): T {
  if (!urls || !p.draft.cover || !Object.keys(urls).length) return p;
  const cover = Object.fromEntries(
    Object.entries(p.draft.cover).map(([k, v]) => {
      const image = taskImageOf(v);
      return [k, (image && urls[image.id]) || v];
    }),
  );
  return { ...p, draft: { ...p.draft, cover } };
}

/**
 * The proposal as a target publishes it: each task image the draft shows at the address it was uploaded to there
 * (`urls`, by file id). Publishing, the export and overwrite checks and a rebase all compare against this.
 */
export function withImageUrls<T extends { draft: ArticleDraft }>(
  p: T,
  urls: Record<string, string> | undefined,
): T {
  if (!urls || !Object.keys(urls).length) return p;
  const locales: ArticleDraft['locales'] = {};
  for (const [locale, fields] of Object.entries(p.draft.locales))
    locales[locale] = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [
        k,
        typeof v === 'string' ? replaceTaskImages(v, (id) => urls[id]) : v,
      ]),
    );
  return { ...p, draft: { ...p.draft, locales } };
}

const asChanges = (d: ArticleDraft): ArticleChanges => ({
  ...(d.slug ? { slug: d.slug } : {}),
  ...(d.status ? { status: d.status } : {}),
  locales: d.locales,
  ...(d.cover ? { cover: d.cover } : {}),
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
    .map((l) => pagePattern(target.pages, l))
    .filter(Boolean)
    .map((t) => fill(t!, slug))
    .slice(0, 10);
}

const flat = (s?: string) => (s || '').replace(/\s+/g, ' ').trim();
// What rendering may change or drop in a sentence: inline Markdown and HTML, entities, and what typographers rewrite
// (straight quotes, `--`, `...`). The page check compares text exactly.
const UNSAFE = /[*_`[\]()<>#|\\~&"'=^{}]|--|\.\.\.|:\/\//;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;

/**
 * The sentences of a Markdown block as a reader sees them; headings, quotes, tables, code, images and HTML are left
 * out. A sentence too long to look for is cut at its commas.
 */
function sentences(block: string): string[] {
  if (/^(?:#|>|\||```|~~~|<|!\[| {4}|\t)/.test(block)) return [];
  const lines = block.split('\n');
  const texts = LIST_ITEM.test(block)
    ? lines.map((line) => line.replace(LIST_ITEM, ''))
    : [lines.join(' ')];
  return texts
    .flatMap((t) => t.split(/(?<=[.!?])\s+|(?<=[。！？；])/u))
    .flatMap((t) =>
      flat(t).length > 200 ? t.split(/(?<=[,，、;；:：])/u) : [t],
    )
    .map(flat);
}

/**
 * The phrase the page check looks for after publishing: one the new version shows and the article did not before the
 * task, so finding it means the change is live. The draft's own (the Agent's) while it still qualifies; otherwise, in
 * `locales` order (the primary first), a sentence of 8-200 characters from the paragraphs the draft adds or rewrites
 * against `base`, or else a new title, neither of which `base` shows either. `source` is the article before the task,
 * which `base` replaces after a rebase. 2026-11-04 (T-62): a hand edit dropped the Agent's phrase from the text and
 * the release had nothing to check, so the phrase is no longer asked of the person editing.
 */
export function verifyPhrase(
  draft: ArticleDraft,
  base: ArticleContent | null = null,
  locales: string[] = Object.keys(draft.locales),
  source: ArticleContent | null = base,
): string | undefined {
  const known = (c: ArticleContent | null) =>
    Object.values(c?.locales || {})
      .map((f) => `${flat(f.title)}\n${flat(f.body)}`)
      .join('\n')
      .toLowerCase();
  const before = known(source),
    was = source === base ? before : `${before}\n${known(base)}`;
  // A language as readers will see it: the draft's fields over the base's.
  const shows = (phrase: string, l: string) => {
    const f = draft.locales[l] || {},
      at = base?.locales[l];
    return (
      phrase.length >= 8 &&
      phrase.length <= 200 &&
      `${flat(f.title ?? at?.title)}\n${flat(f.body ?? at?.body)}`.includes(
        phrase,
      )
    );
  };
  const own = flat(draft.verifyText);
  if (
    own &&
    !before.includes(own.toLowerCase()) &&
    Object.keys(draft.locales).some((l) => shows(own, l))
  )
    return own;
  const fits = (t: string, l: string) =>
    !UNSAFE.test(t) && !was.includes(t.toLowerCase()) && shows(t, l);
  for (const l of locales) {
    const f = draft.locales[l];
    if (!f) continue;
    const added =
      f.body === undefined
        ? []
        : bodyEdits(base?.locales[l]?.body || '', f.body)
            .flatMap((e) => e.after.split(/\n[ \t]*\n/))
            .flatMap((b) => sentences(b.trim()))
            .filter((t) => fits(t, l));
    // A sentence of some length says more than a short one; the first such sentence is near the top of the change.
    const chosen =
      added.find((t) => t.length >= 20) ||
      added.sort((a, b) => b.length - a.length)[0];
    if (chosen) return chosen;
    const title = flat(f.title);
    if (title && fits(title, l)) return title;
  }
  return undefined;
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
  /** Upload an image an approved article shows to the target (provider `uploadImage`); its address there. */
  async uploadImage(
    project: string,
    targetId: string,
    image: ArticleImageFile,
  ): Promise<string> {
    const provider = this.provider(project, targetId);
    if (!provider.capabilities.images || !provider.uploadImage)
      throw new ArticleError('invalid', 'images_unsupported');
    return provider.uploadImage(image);
  }
  /** Upload a cover an approved article sets to the target (provider `uploadCover`); the value its cover field takes. */
  async uploadCover(
    project: string,
    targetId: string,
    image: ArticleImageFile,
    opts: { slug: string; key: string },
  ): Promise<string> {
    const provider = this.provider(project, targetId);
    if (!provider.uploadCover)
      throw new ArticleError('invalid', 'cover_unsupported');
    return provider.uploadCover(image, opts);
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
      /** The language a new article must have (cleanDraft); by default the target's first. */
      primary?: string | null;
    },
  ): ArticleProposal {
    const target = this.target(project, input.targetId);
    const draft = cleanDraft(
      target,
      input.draft,
      !input.articleId,
      input.primary === undefined ? target.locales[0] : input.primary,
    );
    return {
      targetId: input.targetId,
      articleId: input.articleId,
      baseKey: input.baseKey,
      baseVersion: input.base?.version ?? null,
      draft,
      changes: changedFields(input.base, asChanges(draft)),
    };
  }
  /** The proposal for another target, from the primary's draft (see projectDraft). */
  alsoProposal(
    project: string,
    input: {
      targetId: string;
      articleId: string | null;
      base: ArticleSnapshot | null;
      baseKey: string | null;
      source: ArticleSnapshot | null;
      draft: ArticleDraft;
      primary?: string | null;
    },
  ): AlsoProposal {
    const target = this.target(project, input.targetId);
    const { draft, skipped } = projectDraft(
      target,
      input.draft,
      input.source,
      !input.articleId,
    );
    let p: ArticleProposal;
    try {
      p = this.proposal(project, { ...input, draft });
    } catch (error) {
      if (error instanceof DraftRejected)
        throw new DraftRejected(`${target.name}: ${error.message}`, {
          key: 'articles.draft.forTarget',
          params: { 0: target.name, 1: error.problem },
        });
      if (error instanceof ArticleError)
        throw new ArticleError('invalid', `${target.name}: ${error.message}`);
      throw error;
    }
    const slug = p.draft.slug || input.base?.slug || '';
    return {
      ...p,
      skipped,
      slug,
      title: input.base?.locales[target.locales[0]]?.title || '',
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
    } catch (error) {
      return { ...failed('read', error), code: 'target_missing' };
    }
    const at = { step: 'read' as PublishStep };
    try {
      const wanted = changesOf(base, asChanges(p.draft));
      if (!p.articleId)
        return await this.create(project, provider, p, wanted, key, at);
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
      at.step = 'downstream';
      const downstream = this.targets.downstream(project, p.targetId);
      const divergence = downstream
        ? await downstream.divergence(current, wanted)
        : [];
      if (divergence.length)
        return { kind: 'conflict', reason: 'downstream', current, divergence };
      at.step = 'write';
      const after = await provider.update(
        p.articleId,
        changesOf(current, wanted),
        { baseVersion: current.version, key },
      );
      if (!applied(after, wanted))
        return {
          kind: 'failed',
          code: 'not_applied',
          step: 'verify',
          detail: changedFields(after, wanted).join(', '),
        };
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
      }
      return failed(at.step, error);
    }
  }
  private async create(
    project: string,
    provider: ArticleProvider,
    p: ArticleProposal,
    wanted: ArticleChanges,
    key: string,
    at: { step: PublishStep },
  ): Promise<PublishOutcome> {
    const content: ArticleContent = {
      slug: p.draft.slug!,
      ...(p.draft.status ? { status: p.draft.status } : {}),
      locales: p.draft.locales,
      ...(p.draft.cover ? { cover: p.draft.cover } : {}),
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
    at.step = 'downstream';
    const downstream = this.targets.downstream(project, p.targetId);
    const divergence = downstream
      ? await downstream.divergence({ slug: content.slug, locales: {} }, wanted)
      : [];
    if (divergence.length)
      return { kind: 'conflict', reason: 'downstream', divergence };
    at.step = 'write';
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
