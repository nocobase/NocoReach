import { $t } from '#i18n';
import {
  ARTICLE_FIELDS,
  ARTICLE_LIMITS,
  SLUG,
  type ArticleContent,
  type ArticleDraft,
  type ArticleField,
} from '../../../shared/article-publishing.js';
import type {
  ArticleEditForm,
  ArticleEdits,
} from '../../../shared/article-edit.js';
import type { ArticleEditSession } from './article-edit-session.js';
import type { ArticleProposal, TaskData } from '../task-execution-types';
import { articleLanguages, fieldChange, valueAt } from './article-model';

// The review card is the article's editor (2026-11-04 user request): the form it edits, which languages it offers,
// what it checks before a version is made of it, and what that version sends.

/**
 * The whole form being edited, every field of every language the article can have. There is no status (2026-11-12): a
 * new article goes to the CMS as a draft and an existing one keeps its own (cmsStatus).
 */
export type EditForm = {
  slug: string;
  locales: Record<string, Record<ArticleField, string>>;
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
  const { base } = articleLanguages(data, a);
  return {
    slug: a.draft.slug || base?.slug || '',
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
    locales: Object.fromEntries(
      Object.entries(initial.locales).map(([l, fields]) => [
        l,
        { ...fields, ...(saved.locales?.[l] ?? {}) },
      ]),
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

/** What keeps the form from becoming a version, by field (`slug`, `zh.title`). */
export function formProblems(data: TaskData, a: ArticleProposal, f: EditForm) {
  const e: Record<string, string> = {};
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
  const { base } = articleLanguages(data, a);
  const create = !a.articleId;
  const locales: ArticleDraft['locales'] = {};
  for (const l of Object.keys(form.locales))
    for (const f of ARTICLE_FIELDS) {
      const v = form.locales[l][f];
      if (v !== (base?.locales[l]?.[f] ?? '') || (create && v))
        (locales[l] ||= {})[f] = v;
    }
  return {
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
  ].filter(Boolean);
  return parts.length
    ? $t('articleEdit.withEdits', {
        0: line,
        1: parts.join($t('articleEdit.editsSeparator')),
      })
    : line;
}

/** The card's grey line once the version has been edited: Version 2 + your changes (1 AI rewrite). */
export function editedLine(session: ArticleEditSession, version: number) {
  if (session.holder && session.othersEdits)
    return $t('articleEdit.versionWithOthersEdits', {
      0: version,
      1: session.holder,
    });
  return session.ai
    ? $t('articleEdit.versionWithAiEdits', { 0: version, 1: session.ai })
    : $t('articleEdit.versionWithEdits', { 0: version });
}
