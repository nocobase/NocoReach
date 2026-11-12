import { $t } from '#i18n';
import {
  ARTICLE_FIELDS,
  ARTICLE_LIMITS,
  SLUG,
  coverKeyFor,
  coverKeys,
  type ArticleContent,
  type ArticleDraft,
  type ArticleField,
  type ArticleStatus,
} from '../../../shared/article-publishing.js';
import type {
  ArticleEditForm,
  ArticleEdits,
  UnversionedEdits,
} from '../../../shared/article-edit.js';
import type { ArticleEditSession } from './article-edit-session.js';
import type { ArticleProposal, TaskData } from '../task-execution-types';
import { articleLanguages, fieldChange, valueAt } from './article-model';

// The review card is the article's editor (2026-11-04 user request): the form it edits, which languages it offers,
// what it checks before a version is made of it, and what that version sends.

/** The whole form being edited, every field of every language the article can have. */
export type EditForm = {
  slug: string;
  status: ArticleStatus;
  locales: Record<string, Record<ArticleField, string>>;
  /** Each cover the target keeps (`*` shared, or by language): a task image, the site's own, or '' for none. */
  cover: Record<string, string>;
};

/** The article version under review on the task page, when the step waits for one. */
export function reviewedArticle(data: TaskData) {
  const w = data.work,
    index = w.stageIndex || 0,
    stage = w.flow?.stages[index],
    out = w.results[index - 1];
  const open =
    !w.cancelledAt &&
    !w.archivedAt &&
    w.stage !== 'done' &&
    stage?.kind === 'review' &&
    w.flow?.stages[index + 1]?.kind === 'release' &&
    Boolean(out?.article) &&
    !out?.rejectedAt;
  return open && out?.article && stage
    ? { stage, out, article: out.article }
    : null;
}

/** Every language the article can have: the form keeps them all, so what is saved does not depend on what is shown. */
export function formLocales(data: TaskData, a: ArticleProposal) {
  const { target } = articleLanguages(data, a);
  return [
    ...new Set([...(target?.locales || []), ...Object.keys(a.draft.locales)]),
  ];
}

/** The version as a form: the base's values with the draft's changes over them. */
export function initialForm(data: TaskData, a: ArticleProposal): EditForm {
  const { base, target } = articleLanguages(data, a);
  return {
    slug: a.draft.slug || base?.slug || '',
    status: a.draft.status ?? base?.status ?? 'draft',
    locales: Object.fromEntries(
      formLocales(data, a).map((l) => [
        l,
        Object.fromEntries(
          ARTICLE_FIELDS.map((f) => [
            f,
            a.draft.locales[l]?.[f] ?? base?.locales[l]?.[f] ?? '',
          ]),
        ) as Record<ArticleField, string>,
      ]),
    ),
    // An existing article starts from the site's cover (read with it when it was linked).
    cover: Object.fromEntries(
      (target ? coverKeys(target) : []).map((k) => [
        k,
        a.draft.cover?.[k] ?? base?.cover?.[k] ?? '',
      ]),
    ),
  };
}

/** A saved form over the version's, so a language or field the saved one lacks reads as the version has it. */
export function withForm(
  initial: EditForm,
  saved?: ArticleEditForm | null,
): EditForm {
  if (!saved) return initial;
  return {
    slug: saved.slug ?? initial.slug,
    status: saved.status ?? initial.status,
    locales: Object.fromEntries(
      Object.entries(initial.locales).map(([l, fields]) => [
        l,
        { ...fields, ...(saved.locales?.[l] ?? {}) },
      ]),
    ),
    cover: Object.fromEntries(
      Object.entries(initial.cover).map(([k, v]) => [k, saved.cover?.[k] ?? v]),
    ),
  };
}

/** The form as the server keeps it between versions: a slug still being typed (not yet valid) is left out. */
export function keptForm(form: EditForm): ArticleEditForm {
  const { slug, ...rest } = form;
  return SLUG.test(slug) ? form : rest;
}

export const sameForm = (a: EditForm, b: EditForm) =>
  a.slug === b.slug &&
  a.status === b.status &&
  Object.keys({ ...a.cover, ...b.cover }).every(
    (k) => (a.cover?.[k] || '') === (b.cover?.[k] || ''),
  ) &&
  Object.keys(a.locales).every((l) =>
    ARTICLE_FIELDS.every((f) => a.locales[l]?.[f] === b.locales[l]?.[f]),
  );

/**
 * The languages edited, one at a time (2026-10-27 user report: the editor opened on empty fields for languages not
 * written yet): the ones the review shows. While the primary waits for approval it is the only one, since the
 * translation writes the others from it; a new article always has its primary.
 */
export function editableLocales(data: TaskData, a: ArticleProposal) {
  const languages = articleLanguages(data, a);
  const locales = formLocales(data, a);
  const primary = primaryOf(data, a);
  const create = !a.articleId;
  return languages.pending.length
    ? [primary]
    : locales.filter(
        (l) => languages.locales.includes(l) || (create && l === primary),
      );
}

/** The task's primary language, as the server checks a new article's title and body in it (cleanDraft). */
export function primaryOf(data: TaskData, a: ArticleProposal) {
  const { target } = articleLanguages(data, a);
  const locales = formLocales(data, a);
  const chosen = data.work?.delivery?.locales?.[0];
  return chosen && target?.locales.includes(chosen) ? chosen : locales[0];
}

/**
 * Whether a target that requires covers would refuse to publish the form (2026-11-05): a new article published at once
 * without a cover for its primary language. A draft may go without.
 */
export function coverMissing(data: TaskData, a: ArticleProposal, f: EditForm) {
  const { target } = articleLanguages(data, a);
  if (!target?.cover?.required || a.articleId) return false;
  if (target.status && f.status !== 'published') return false;
  const key = coverKeyFor(target, primaryOf(data, a));
  return key !== null && !f.cover?.[key];
}

/**
 * What keeps the form from becoming a version, by field (`slug`, `zh.title`); approving it also needs a cover where the
 * target requires one.
 */
export function formProblems(
  data: TaskData,
  a: ArticleProposal,
  f: EditForm,
  approving = false,
) {
  const e: Record<string, string> = {};
  if (approving && coverMissing(data, a, f))
    e.cover = $t('articles.coverRequired');
  const create = !a.articleId,
    primary = primaryOf(data, a);
  if (create && !SLUG.test(f.slug)) e.slug = $t('articleTask.slugInvalid');
  if (create && !f.locales[primary]?.title.trim())
    e[`${primary}.title`] = $t('articleTask.titleRequired');
  if (create && !f.locales[primary]?.body.trim())
    e[`${primary}.body`] = $t('articleTask.bodyRequired');
  for (const l of Object.keys(f.locales)) {
    if (f.locales[l].title.length > ARTICLE_LIMITS.title)
      e[`${l}.title`] = $t('articleTask.tooLong', { 0: ARTICLE_LIMITS.title });
    if (f.locales[l].description.length > ARTICLE_LIMITS.description)
      e[`${l}.description`] = $t('articleTask.tooLong', {
        0: ARTICLE_LIMITS.description,
      });
  }
  return e;
}

/** The form as `editArticleDraft` takes it: only what differs from the article it was written from. */
export function formDraft(
  data: TaskData,
  a: ArticleProposal,
  form: EditForm,
): ArticleDraft {
  const { target, base } = articleLanguages(data, a);
  const create = !a.articleId;
  const locales: ArticleDraft['locales'] = {};
  for (const l of Object.keys(form.locales))
    for (const f of ARTICLE_FIELDS) {
      const v = form.locales[l][f];
      if (v !== (base?.locales[l]?.[f] ?? '') || (create && v))
        (locales[l] ||= {})[f] = v;
    }
  // A cover goes with the version when it differs from the site's; a new article takes the ones set.
  const cover = Object.fromEntries(
    Object.entries(form.cover || {}).filter(
      ([k, v]) => v !== (base?.cover?.[k] ?? '') || (create && v),
    ),
  );
  return {
    ...(Object.keys(cover).length ? { cover } : {}),
    // The chosen status where the target stores one, or the draft's own; an unchanged one is dropped against the base
    // on the server.
    ...(target?.status
      ? { status: form.status }
      : a.draft.status
        ? { status: a.draft.status }
        : {}),
    ...(create ? { slug: form.slug } : {}),
    locales,
  };
}

/** One language of the form against the article it was written from, for Compare with original. */
export function formChanges(
  base: ArticleContent | null,
  form: EditForm,
  locale: string,
) {
  return ARTICLE_FIELDS.flatMap((f) => {
    const path = `${locale}.${f}`,
      before = valueAt(base, path),
      after = form.locales[locale]?.[f] ?? '';
    return before === after
      ? []
      : [{ field: f, change: fieldChange(path, before, after) }];
  });
}

/** A version's Activity line with what made it: edited the article, version 3 (AI rewrites: 1, hand edits: 2). */
export function editsLine(line: string, edits?: ArticleEdits) {
  const parts = [
    edits?.ai ? $t('articleEdit.editsAi', { 0: edits.ai }) : '',
    edits?.hand ? $t('articleEdit.editsHand', { 0: edits.hand }) : '',
    // What it did to the cover (2026-11-05): added, replaced or removed.
    edits?.cover
      ? $t(
          `articleEdit.cover${edits.cover[0].toUpperCase()}${edits.cover.slice(1)}`,
        )
      : '',
  ].filter(Boolean);
  return parts.length
    ? $t('articleEdit.withEdits', {
        0: line,
        1: parts.join($t('articleEdit.editsSeparator')),
      })
    : line;
}

/** The card's grey line once the version has been edited: Version 2 + your changes (1 AI rewrite). */
export function editedLine(
  session: ArticleEditSession,
  version: number,
  me?: string,
) {
  // Someone else's, named as Activity names them: whoever saved them last, while this page has none of its own to save
  // (another person holds the article, or this page took over their changes and has not changed them yet).
  const theirs =
    me && !session.saving && session.kept && session.kept.savedBy !== me
      ? session.kept.savedByName
      : session.holder && session.othersEdits
        ? session.holder
        : '';
  if (theirs)
    return $t('articleEdit.versionWithOthersEdits', { 0: version, 1: theirs });
  return session.ai
    ? $t('articleEdit.versionWithAiEdits', { 0: version, 1: session.ai })
    : $t('articleEdit.versionWithEdits', { 0: version });
}

/**
 * The changes to the article under review not made a version yet, which Activity shows as its latest line (2026-11-12
 * user report: a colleague's changes after version 4 showed nowhere in Activity and were taken for lost). The editing
 * session's record once it has one, as it follows every save and heartbeat; otherwise what the task read returned,
 * the only source for people who may not edit.
 */
export function unversionedEdits(
  data: TaskData,
  session: ArticleEditSession | null,
): UnversionedEdits | null {
  const reviewed = reviewedArticle(data);
  if (!reviewed) return null;
  const kept =
    session?.artifactId === reviewed.out.id ? session.kept : undefined;
  const edits = kept === undefined ? data.unversionedEdits : kept;
  return edits?.artifactId === reviewed.out.id ? edits : null;
}

/** Their Activity line after who made them, with the AI rewrites as a version's line counts them. */
export function unversionedLine(edits: UnversionedEdits, mine: boolean) {
  return editsLine(
    $t(
      mine ? 'taskDetail.unversionedEditsYours' : 'taskDetail.unversionedEdits',
    ),
    { ai: edits.ai, hand: 0 },
  );
}
