import { $t, getCurrentLocale } from '#i18n';
import {
  inPlaceLocales,
  type ArticleContent,
  type ArticleField,
} from '../../../shared/article-publishing.js';
import { localeName, providerKey } from '../article-targets-api';
import { subjectOf } from '../task-subject';
import type {
  ArticleProposal,
  Artifact,
  Release,
  ReleaseArticle,
  TaskData,
} from '../task-execution-types';

// Shared by the article parts of the task page (article-start.tsx, article-review.tsx, article-release.tsx).

// The start defaults (where the change goes, the pages a task is about, the languages it writes) live in
// shared/task-start.ts: the server starts a handed-over task with the same choice the start card preselects.
export {
  REPO,
  choiceLocales,
  choiceRepo,
  defaultDelivery,
  deliveryPlan,
  pageUrlsOf,
  pagesToStart,
  presentLocales,
  startPages,
  translationLocales,
  type ArticleFound,
  type DeliveryChoice,
  type PageFound,
} from '../../../shared/task-start.js';
import type { PageFound } from '../../../shared/task-start.js';
/** A task publishes to its primary target and at most this many others (article-flow.ts). */
export const MAX_ALSO = 4;

export function valueAt(
  c: Partial<ArticleContent> | null | undefined,
  path: string,
) {
  if (!c) return '';
  if (path === 'slug') return c.slug || '';
  if (path === 'status') return c.status || '';
  const [l, f] = path.split('.');
  return c.locales?.[l]?.[f as ArticleField] || '';
}

/** `zh.body` as the owner reads it: 中文 · 正文. */
export function fieldLabel(path: string) {
  if (path === 'slug' || path === 'status')
    return $t(`articleTask.field.${path}`);
  const [l, f] = path.split('.');
  return $t('articleTask.fieldLabel', {
    0: localeName(l, getCurrentLocale()),
    1: $t(`articleTask.field.${f}`),
  });
}

/** One field as a ChangeView entry: the label stands where a file path would. */
export const fieldChange = (path: string, before: string, after: string) => {
  // Status values read as words (Draft, Published), not as stored codes.
  const show = (v: string) =>
    path === 'status' && v
      ? $t(
          v === 'published'
            ? 'articleTask.statusPublished'
            : 'articleTask.statusDraft',
        )
      : v;
  return { path: fieldLabel(path), before: show(before), after: show(after) };
};

/** One language of the article as it reads after the change: the draft's fields over the version it was written from. */
export const revisedText = (
  a: Pick<ArticleProposal, 'draft'>,
  base: ArticleContent | null,
  locale: string,
) => {
  const draft = a.draft.locales[locale],
    was = base?.locales[locale];
  return {
    title: draft?.title ?? was?.title ?? '',
    description: draft?.description ?? was?.description ?? '',
    body: draft?.body ?? was?.body ?? '',
  };
};

export const draftContent = (
  a: Pick<ArticleProposal, 'draft'>,
): Partial<ArticleContent> => ({
  slug: a.draft.slug,
  status: a.draft.status,
  locales: a.draft.locales,
});

/** How a changed language is read: as it will be, or its changes field by field against the version it was written from. */
export type ArticleView = 'preview' | 'changes';

/**
 * How a task in several languages writes the ones after its primary (2026-10-28, T-53): those the article already has
 * are updated in place with the primary's changes, the others translated in full (article-flow.ts runInput).
 * `unchanged` lists the ones a version leaves as they were.
 */
export function otherLanguages(data: TaskData, a?: ArticleProposal) {
  const w = data.work,
    L = w?.delivery?.locales || [],
    write = L.slice(1),
    update = inPlaceLocales(w?.delivery, w?.article?.locales);
  return {
    primary: L[0] || '',
    write,
    update,
    translate: write.filter((l) => !update.includes(l)),
    unchanged: a
      ? write.filter((l) => !a.changes.some((c) => c.startsWith(`${l}.`)))
      : [],
  };
}

/**
 * Which round a version under review is: the primary to approve (`pending`), the other languages to publish (`after`),
 * or a version of those that changed none of them (`nothing`; T-53 read "Translation done" with Chinese and Japanese
 * untouched). The card and the reading page share its title and actions.
 */
export function reviewRound(
  data: TaskData,
  a: ArticleProposal,
  simulated = false,
) {
  const plan = otherLanguages(data, a),
    after =
      plan.write.length > 0 && Boolean(data.work?.delivery?.translateFrom),
    nothing = after && plan.unchanged.length === plan.write.length,
    names = (list: string[]) =>
      joinNames(list.map((l) => localeName(l, getCurrentLocale()))),
    primary = localeName(plan.primary, getCurrentLocale()),
    updating = plan.update.length > 0;
  const title = translationPending(data)
    ? $t(
        updating
          ? 'articleTask.reviewPrimaryUpdateTitle'
          : 'articleTask.reviewPrimaryTitle',
        { 0: primary },
      )
    : nothing
      ? $t('articleTask.languagesNotChangedTitle', { 0: names(plan.write) })
      : after && updating
        ? plan.translate.length
          ? $t('articleTask.reviewUpdatedTranslatedTitle', {
              0: primary,
              1: names(plan.update),
              2: names(plan.translate),
            })
          : $t('articleTask.reviewUpdatedTitle', {
              0: primary,
              1: names(plan.update),
            })
        : after
          ? $t('articleTask.reviewTranslatedTitle')
          : $t('articleTask.reviewTitle');
  return {
    ...plan,
    after,
    nothing,
    title,
    /** Approve's label in place of Approve and publish, if any. */
    approve: translationPending(data)
      ? $t(
          updating
            ? 'articleTask.approveUpdate'
            : 'articleTask.approveTranslate',
        )
      : nothing
        ? $t(
            simulated
              ? 'articleTask.simulatePublishOnly'
              : 'articleTask.publishOnly',
            { 0: primary },
          )
        : undefined,
    /** Update again or Translate again, and the feedback it sends with the change request. */
    again: $t(
      updating ? 'articleTask.updateAgain' : 'articleTask.translateAgain',
    ),
    againComment: $t(
      updating
        ? 'articleTask.updateAgainComment'
        : 'articleTask.translateAgainComment',
      { 0: names(plan.write), 1: primary },
    ),
    hint: $t('articleTask.languagesNotChangedHint', { 0: names(plan.write) }),
  };
}

/**
 * The languages an article is reviewed in, shared by the review card and its reading page. A language with no text in
 * the draft or the article is left out (2026-10-24 user report: empty tabs looked broken) and listed in `missing`. A
 * changed language opens as a preview when its body changed, as its changes when only its title or description did; a
 * new article, or a language the article did not have, has one version. A version that updated other languages in
 * place opens on the first of them, as its changes: their edits are what is left to check (2026-10-28).
 */
export function articleLanguages(data: TaskData, a: ArticleProposal) {
  const { target, base } = articleContext(data, a);
  const all = [
    ...new Set([...(target?.locales || []), ...Object.keys(a.draft.locales)]),
  ];
  const written = (l: string) => {
    const t = revisedText(a, base, l);
    return Boolean(t.title || t.description || t.body);
  };
  const shown = all.filter(written),
    locales = shown.length ? shown : all.slice(0, 1);
  const isNew = !a.articleId;
  const plan = otherLanguages(data, a),
    after =
      plan.write.length > 0 && Boolean(data.work?.delivery?.translateFrom),
    changed = (l: string) => a.changes.some((c) => c.startsWith(`${l}.`)),
    edited = (l: string) =>
      after && plan.update.includes(l) && Boolean(base?.locales[l]);
  return {
    target,
    base,
    locales,
    missing: all.filter((l) => !locales.includes(l)),
    // The languages written from the primary once it is approved (2026-10-24); none while or after writing them.
    pending: translationPending(data)
      ? data.work.delivery!.locales!.slice(1)
      : [],
    /** Of `pending`, the ones updated in place rather than translated. */
    pendingUpdate: translationPending(data) ? plan.update : [],
    /** The languages written after the primary once it was approved, and the ones this version left as they were. */
    written: after ? plan.write : [],
    unchanged: after ? plan.unchanged : [],
    first:
      locales.find((l) => edited(l) && changed(l)) ||
      locales.find(changed) ||
      locales[0],
    isNew,
    changed,
    versions: (l: string) => !isNew && Boolean(base?.locales[l]),
    defaultView: (l: string): ArticleView =>
      !isNew && edited(l)
        ? 'changes'
        : isNew || !base?.locales[l] || a.changes.includes(`${l}.body`)
          ? 'preview'
          : 'changes',
  };
}
export type ArticleLanguages = ReturnType<typeof articleLanguages>;

/** Whether the task's other languages are still to be translated from its primary one, which waits for approval. */
export const translationPending = (data: TaskData) => {
  const d = data.work?.delivery;
  return Boolean(d?.locales && d.locales.length > 1 && !d.translateFrom);
};

export function articleContext(
  data: TaskData,
  article: NonNullable<Artifact['article']>,
) {
  const target = (data.articleTargets || []).find(
    (t) => t.id === article.targetId,
  );
  const base = article.baseKey
    ? data.articleBases?.[article.baseKey] || null
    : null;
  return { target, base };
}

export const nameOf = (data: TaskData, targetId?: string) =>
  (data.articleTargets || []).find((t) => t.id === targetId)?.name ||
  targetId ||
  '';
export const targetName = (data: TaskData, r: Release) =>
  nameOf(data, r.article?.targetId);
/** Names as a list in the interface language: 、 in Chinese, a comma otherwise. */
export const joinNames = (names: string[]) =>
  names.join(getCurrentLocale().startsWith('zh') ? '、' : ', ');

/**
 * Every target a release publishes to, the primary first, each with its own state (article-flow.ts `stateOf`). A
 * single-target release carries the state on the release only.
 */
export function releaseLegs(r: Release) {
  const legs = [r.article, ...(r.also || [])].filter((a): a is ReleaseArticle =>
    Boolean(a),
  );
  return legs.map((a) => ({
    a,
    state:
      a.state ||
      (['publishing', 'publish_conflict', 'publish_failed'].includes(r.state)
        ? r.state
        : ['exporting', 'export_late'].includes(r.state) && !a.exported
          ? 'exporting'
          : a.exported
            ? 'exported'
            : 'published'),
  }));
}
/** The release narrowed to one leg, for the parts written for a single target. */
export const legRelease = (r: Release, a: ReleaseArticle): Release => ({
  ...r,
  article: a,
});

/** A failure reason the owner can read; unknown codes fall back to a general sentence. */
export function failureText(code?: string) {
  const key = code ? providerKey(code) : '';
  return key && $t(key) !== key
    ? $t(key)
    : $t('articleTask.publishFailedUnknown');
}

export function conflictTitle(data: TaskData, r: Release) {
  const c = r.article?.conflict,
    name = targetName(data, r);
  if (c?.reason === 'downstream')
    return $t('articleTask.conflictDownstream', { 0: name });
  // With several targets the title names the one whose address is taken.
  if (c?.reason === 'slug_taken')
    return r.also?.length
      ? $t('articleTask.conflictSlugIn', { 0: r.article?.slug || '', 1: name })
      : $t('articleTask.conflictSlug', { 0: r.article?.slug || '' });
  if (c?.reason === 'missing')
    return $t('articleTask.conflictMissing', { 0: name });
  return $t('articleTask.conflictChanged', { 0: name });
}

export const focusSoon = (id: string) =>
  setTimeout(() => document.getElementById(id)?.focus(), 0);

// Titles of a release to one target or several (article-release.tsx).
const legsIn = (r: Release, state: string) =>
  releaseLegs(r).filter((l) => l.state === state);
/** The targets whose publishing did not complete. */
export const failedLegs = (r?: Release) =>
  r?.article ? legsIn(r, 'publish_failed') : [];
const namesIn = (data: TaskData, r: Release, state: string) => {
  const names = legsIn(r, state).map((l) => nameOf(data, l.a.targetId));
  return names.length ? joinNames(names) : targetName(data, r);
};

/** "正在发布到 A、B": the targets still publishing. */
export const publishingTitle = (data: TaskData, r: Release) =>
  $t('articleTask.publishing', { 0: namesIn(data, r, 'publishing') });
/** The targets still waiting for their export. */
export const exportingNames = (data: TaskData, r: Release) =>
  namesIn(data, r, 'exporting');
/** The one conflicting leg, whose details the card shows; with several, the details are in the rows. */
export function soleConflict(r: Release) {
  const legs = legsIn(r, 'publish_conflict');
  return legs.length === 1 ? legRelease(r, legs[0].a) : undefined;
}
export function conflictHeading(data: TaskData, r: Release) {
  const one = soleConflict(r);
  return one
    ? conflictTitle(data, one)
    : $t('articleTask.conflictSeveral', {
        0: legsIn(r, 'publish_conflict').length,
      });
}
export function failedSub(r: Release) {
  const legs = legsIn(r, 'publish_failed');
  return legs.length > 1
    ? $t('articleTask.failedSeveral', { 0: legs.length })
    : failureText((legs[0]?.a || r.article)?.error);
}
/** A primary article that no longer exists cannot be reviewed again (the task is cancelled instead). */
export function canRebase(r: Release) {
  const primary = releaseLegs(r)[0];
  return !(
    primary?.state === 'publish_conflict' &&
    primary.a.conflict?.reason === 'missing'
  );
}

/** A page's path, decoded, as lists and subjects name it. */
export const pagePath = (url: string) => {
  try {
    const path = new URL(url).pathname || '/';
    try {
      return decodeURI(path);
    } catch {
      return path;
    }
  } catch {
    return url;
  }
};

/** A group of the pages left out, as Create separate tasks sends it: an article alone, or the site's pages together. */
export type PageGroup = { pages: string[]; subject: string };

/** The pages left to other tasks: each article (by id, or by the slug it was guessed under), then the site's pages. */
export function restGroups(rest: PageFound[]): {
  articles: PageGroup[];
  site: PageGroup | null;
} {
  const articles = new Map<string, PageGroup>(),
    site: string[] = [];
  for (const p of rest) {
    const key = p.article
      ? `${p.article.targetId}:${p.article.articleId}`
      : p.guess
        ? `${p.guess.targetId}:slug:${p.guess.slug}`
        : '';
    if (!key) {
      site.push(p.url);
      continue;
    }
    const group = articles.get(key) || {
      pages: [],
      subject: (p.article?.title || p.guess?.slug || pagePath(p.url)).slice(
        0,
        160,
      ),
    };
    group.pages.push(p.url);
    articles.set(key, group);
  }
  return {
    articles: [...articles.values()],
    site: site.length
      ? {
          pages: site,
          subject: subjectOf(pagePath(site[0]), site.length, 'pages').slice(
            0,
            160,
          ),
        }
      : null,
  };
}
