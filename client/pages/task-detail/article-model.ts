import { $t, getCurrentLocale } from '#i18n';
import { ownSignalIds } from '../../../shared/opportunity-parts.js';
import {
  translationDefault,
  type ArticleContent,
  type ArticleField,
  type ArticleMatch,
} from '../../../shared/article-publishing.js';
import { localeName, providerKey } from '../article-targets-api';
import type {
  ArticleProposal,
  Artifact,
  Release,
  ReleaseArticle,
  TaskData,
} from '../task-execution-types';

// Shared by the article parts of the task page (article-start.tsx, article-review.tsx, article-release.tsx).

/**
 * Where a task's change goes, chosen before it starts: a target (`mode` new or existing article) or the repository;
 * `also` lists other targets the same article goes to.
 */
export type DeliveryChoice = {
  target: string;
  mode: 'new' | 'existing';
  also: string[];
  /** The article found from the task's page, linked when the task starts. */
  article?: ArticleMatch;
  /** The languages the task writes, primary first; left out, every language of the target in its order. */
  locales?: string[];
};
/** What the page lookup said: the article found, or none; `unchecked` when a target could not be asked. */
export type ArticleFound = { article: ArticleMatch | null; unchecked: boolean };

/**
 * The pages a task is about, most specific first: the page linked on the task, the page it was handed off with, the
 * opportunity's target when it is an address, then the pages of the changes it cites or was handed off from.
 */
export function pageUrlsOf(data: TaskData): string[] {
  const e = (data.task.evidence || {}) as {
    page?: unknown;
    signalKey?: unknown;
    part?: { signalIds?: unknown } | null;
    insight?: { target?: unknown; signalIds?: unknown } | null;
    context?: { signals?: { items?: { key?: unknown; url?: unknown }[] } };
  };
  // A change handed off on its own (Insights › Today's changes) names its page and change instead of an opportunity;
  // one of an opportunity's several tasks looks only at its own place, never at the opportunity's other pages.
  const ids = new Set<unknown>(ownSignalIds(e));
  const cited = (e.context?.signals?.items || [])
    .filter((s) => ids.has(s.key))
    .map((s) => s.url);
  return [
    ...new Set(
      [
        data.work.page?.url,
        e.page,
        e.part ? undefined : e.insight?.target,
        ...cited,
      ]
        .filter((u): u is string => typeof u === 'string')
        .map((u) => u.trim())
        .filter((u) => /^https?:\/\//i.test(u)),
    ),
  ].slice(0, 10);
}
export const REPO = 'repo';
/** A task publishes to its primary target and at most this many others (article-flow.ts). */
export const MAX_ALSO = 4;

/**
 * The default (2026-10-21: decided by where the page lives, not asked): the linked article; a playbook set to the
 * repository opens a pull request; a blog post is a new article in the playbook's target, then the default target.
 * Any other change goes to the article found from the task's page; when the page is known and no target holds it,
 * it is a page of the site itself and goes to the repository (unless the playbook names a target). Otherwise an
 * article is picked by hand.
 */
export function defaultDelivery(
  data: TaskData,
  playbookId: string,
  found?: ArticleFound,
  /** A translation playbook: always an article that exists (2026-10-25). */
  translate = false,
): DeliveryChoice {
  const targets = data.articleTargets || [],
    linked = data.work.article,
    entry = data.articlePlaybookTargets?.[playbookId];
  if (linked?.targetId && targets.some((t) => t.id === linked.targetId))
    return {
      target: linked.targetId,
      mode: linked.articleId || translate ? 'existing' : 'new',
      also: [],
    };
  if (!targets.length || entry === REPO)
    return { target: REPO, mode: 'new', also: [] };
  const named = targets.find((t) => t.id === entry),
    target = (named || targets.find((t) => t.default) || targets[0]).id;
  if (playbookId === 'blog-post') return { target, mode: 'new', also: [] };
  const article = found?.article;
  if (article && targets.some((t) => t.id === article.targetId))
    return { target: article.targetId, mode: 'existing', also: [], article };
  if (found && !found.unchecked && !named && data.agent?.repo)
    return { target: REPO, mode: 'new', also: [] };
  return { target, mode: 'existing', also: [] };
}

/**
 * The languages a task writes, primary first (2026-10-24): the ones chosen at start that its target has, else every
 * language of the target in the target's order. The first is written and reviewed first; the others are translated
 * from it once it is approved.
 */
export function choiceLocales(data: TaskData, choice: DeliveryChoice) {
  if (choice.target === REPO) return [];
  const all =
    (data.articleTargets || []).find((t) => t.id === choice.target)?.locales ||
    [];
  const chosen = (choice.locales || []).filter((l) => all.includes(l));
  return chosen.length ? chosen : all;
}

/** The languages the chosen article has, when known: the one found from the page, else the one saved on the task. */
export function presentLocales(
  data: TaskData,
  choice: DeliveryChoice,
): string[] | undefined {
  if (choice.target === REPO) return undefined;
  if (choice.article?.targetId === choice.target) return choice.article.locales;
  const linked = data.work.article;
  return linked?.articleId && linked.targetId === choice.target
    ? linked.locales
    : undefined;
}

/**
 * What a translation writes (2026-10-25), the source first: the languages chosen in the dialog, else the target's
 * first language the article has, into the ones it lacks (all the others when it lacks none). Empty when the target
 * has fewer than two languages.
 */
export function translationLocales(
  data: TaskData,
  choice: DeliveryChoice,
  present = presentLocales(data, choice),
) {
  if (choice.target === REPO) return [];
  const all =
      (data.articleTargets || []).find((t) => t.id === choice.target)
        ?.locales || [],
    chosen = (choice.locales || []).filter((l) => all.includes(l));
  if (all.length < 2) return [];
  // A choice is kept as made, even a source alone (nothing to write yet: the task cannot start).
  if (chosen.length) return chosen;
  const d = translationDefault(all, present);
  return [d.from, ...d.to];
}

/** The start command's delivery and whether it can start yet; unlinks first when the saved article differs. */
export function deliveryPlan(
  data: TaskData,
  choice: DeliveryChoice,
  translate = false,
) {
  const linked = data.work.article;
  if (choice.target === REPO)
    return { ready: true, unlink: Boolean(linked?.targetId), delivery: REPO };
  const also = translate
      ? []
      : choice.also.filter((id) => id !== choice.target),
    chosen = translate
      ? translationLocales(data, choice)
      : choiceLocales(data, choice),
    // One language is written as it always was; two or more are written primary first, then translated. A
    // translation always names its source and the languages to write.
    locales = chosen.length > 1 ? { locales: chosen } : {};
  if (choice.mode === 'existing' || translate) {
    const saved = Boolean(
        linked?.articleId && linked.targetId === choice.target,
      ),
      found =
        !saved && choice.article?.targetId === choice.target
          ? choice.article
          : undefined;
    return {
      ready: (saved || Boolean(found)) && (!translate || chosen.length > 1),
      unlink: false,
      // The found article is saved on the task as the start is confirmed.
      link: found
        ? { targetId: found.targetId, articleId: found.articleId }
        : undefined,
      delivery:
        also.length || chosen.length > 1
          ? { ...(also.length ? { also } : {}), ...locales }
          : undefined,
    };
  }
  return {
    ready: true,
    unlink: Boolean(
      linked?.articleId ||
      (linked?.targetId && linked.targetId !== choice.target),
    ),
    delivery: {
      targetId: choice.target,
      ...(also.length ? { also } : {}),
      ...locales,
    },
  };
}

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
 * The languages an article is reviewed in, shared by the review card and its reading page. A language with no text in
 * the draft or the article is left out (2026-10-24 user report: empty tabs looked broken) and listed in `missing`. A
 * changed language opens as a preview when its body changed, as its changes when only its title or description did; a
 * new article, or a language the article did not have, has one version.
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
  return {
    target,
    base,
    locales,
    missing: all.filter((l) => !locales.includes(l)),
    // The languages translated from the primary once it is approved (2026-10-24); none while or after translating.
    pending: translationPending(data)
      ? data.work.delivery!.locales!.slice(1)
      : [],
    isNew,
    changed: (l: string) => a.changes.some((c) => c.startsWith(`${l}.`)),
    versions: (l: string) => !isNew && Boolean(base?.locales[l]),
    defaultView: (l: string): ArticleView =>
      isNew || !base?.locales[l] || a.changes.includes(`${l}.body`)
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
