import { $t, getCurrentLocale } from '#i18n';
import type {
  ArticleContent,
  ArticleField,
} from '../../../shared/article-publishing.js';
import { localeName, providerKey } from '../article-targets-api';
import type { Artifact, Release, TaskData } from '../task-execution-types';

// Shared by the article parts of the task page (article-start.tsx, article-review.tsx, article-release.tsx).

/** Where a task's change goes, chosen before it starts: a target (`mode` new or existing article) or the repository. */
export type DeliveryChoice = { target: string; mode: 'new' | 'existing' };
export const REPO = 'repo';

/** The default: the linked article; a blog post → new article on the first target; other changes → pick an article. */
export function defaultDelivery(
  data: TaskData,
  playbookId: string,
): DeliveryChoice {
  const targets = data.articleTargets || [],
    linked = data.work.article;
  if (linked?.targetId && targets.some((t) => t.id === linked.targetId))
    return {
      target: linked.targetId,
      mode: linked.articleId ? 'existing' : 'new',
    };
  if (!targets.length) return { target: REPO, mode: 'new' };
  return {
    target: targets[0].id,
    mode: playbookId === 'blog-post' ? 'new' : 'existing',
  };
}

/** The start command's delivery and whether it can start yet; unlinks first when the saved article differs. */
export function deliveryPlan(data: TaskData, choice: DeliveryChoice) {
  const linked = data.work.article;
  if (choice.target === REPO)
    return { ready: true, unlink: Boolean(linked?.targetId), delivery: REPO };
  if (choice.mode === 'existing')
    return {
      ready: Boolean(linked?.articleId && linked.targetId === choice.target),
      unlink: false,
      delivery: undefined,
    };
  return {
    ready: true,
    unlink: Boolean(
      linked?.articleId ||
      (linked?.targetId && linked.targetId !== choice.target),
    ),
    delivery: { targetId: choice.target },
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
export const fieldChange = (path: string, before: string, after: string) => ({
  path: fieldLabel(path),
  before,
  after,
});

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

export const targetName = (data: TaskData, r: Release) =>
  (data.articleTargets || []).find((t) => t.id === r.article?.targetId)?.name ||
  r.article?.targetId ||
  '';

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
  if (c?.reason === 'slug_taken')
    return $t('articleTask.conflictSlug', { 0: r.article?.slug || '' });
  if (c?.reason === 'missing')
    return $t('articleTask.conflictMissing', { 0: name });
  return $t('articleTask.conflictChanged', { 0: name });
}

export const focusSoon = (id: string) =>
  setTimeout(() => document.getElementById(id)?.focus(), 0);
