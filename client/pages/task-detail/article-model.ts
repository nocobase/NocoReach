import { $t, getCurrentLocale } from '#i18n';
import type {
  ArticleContent,
  ArticleField,
} from '../../../shared/article-publishing.js';
import { localeName, providerKey } from '../article-targets-api';
import type {
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
};
export const REPO = 'repo';
/** A task publishes to its primary target and at most this many others (article-flow.ts). */
export const MAX_ALSO = 4;

/**
 * The default: the linked article; otherwise the playbook's target, then the default target (a blog post → new article
 * there; other changes → pick an article). A playbook set to the repository opens a pull request.
 */
export function defaultDelivery(
  data: TaskData,
  playbookId: string,
): DeliveryChoice {
  const targets = data.articleTargets || [],
    linked = data.work.article,
    entry = data.articlePlaybookTargets?.[playbookId];
  if (linked?.targetId && targets.some((t) => t.id === linked.targetId))
    return {
      target: linked.targetId,
      mode: linked.articleId ? 'existing' : 'new',
      also: [],
    };
  if (!targets.length || entry === REPO)
    return { target: REPO, mode: 'new', also: [] };
  return {
    target: (
      targets.find((t) => t.id === entry) ||
      targets.find((t) => t.default) ||
      targets[0]
    ).id,
    mode: playbookId === 'blog-post' ? 'new' : 'existing',
    also: [],
  };
}

/** The start command's delivery and whether it can start yet; unlinks first when the saved article differs. */
export function deliveryPlan(data: TaskData, choice: DeliveryChoice) {
  const linked = data.work.article;
  if (choice.target === REPO)
    return { ready: true, unlink: Boolean(linked?.targetId), delivery: REPO };
  const also = choice.also.filter((id) => id !== choice.target);
  if (choice.mode === 'existing')
    return {
      ready: Boolean(linked?.articleId && linked.targetId === choice.target),
      unlink: false,
      delivery: also.length ? { also } : undefined,
    };
  return {
    ready: true,
    unlink: Boolean(
      linked?.articleId ||
      (linked?.targetId && linked.targetId !== choice.target),
    ),
    delivery: { targetId: choice.target, ...(also.length ? { also } : {}) },
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
