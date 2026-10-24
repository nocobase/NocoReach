import type { ArticleMatch } from './article-publishing.js';
import { ownSignalIds } from './opportunity-parts.js';

// How a task starts when nobody has to choose: the start card preselects these, and a task handed over from an
// accepted document (Accept and start) is started with them by the server (2026-10-24 user decision). Both read the
// same rules from here, so the hand-over never starts what the start card would not have offered.

/** A publishing choice that keeps the pull request to the website repository. */
export const REPO = 'repo';

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
};
/** What the page lookup said: the article found, or none; `unchecked` when a target could not be asked. */
export type ArticleFound = { article: ArticleMatch | null; unchecked: boolean };

/** What the defaults read: the task page's data, or the same fields the server reads for a hand-over. */
export type StartContext = {
  task: { evidence?: Record<string, unknown> };
  work: {
    page?: { url?: string } | null;
    article?: { targetId?: string; articleId?: string | null } | null;
  };
  articleTargets?: { id: string; default?: boolean }[];
  articlePlaybookTargets?: Record<string, string>;
  agent?: {
    repo?: unknown;
    agentId?: string | null;
    options?: { id: string; type?: string }[];
  } | null;
};

/**
 * The pages a task is about, most specific first: the page linked on the task, the page it was handed off with, the
 * opportunity's target when it is an address, then the pages of the changes it cites or was handed off from.
 */
export function pageUrlsOf(data: StartContext): string[] {
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

/**
 * The default (2026-10-21: decided by where the page lives, not asked): the linked article; a playbook set to the
 * repository opens a pull request; a blog post is a new article in the playbook's target, then the default target.
 * Any other change goes to the article found from the task's page; when the page is known and no target holds it,
 * it is a page of the site itself and goes to the repository (unless the playbook names a target). Otherwise an
 * article is picked by hand.
 */
export function defaultDelivery(
  data: StartContext,
  playbookId: string,
  found?: ArticleFound,
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

/** Whether the page lookup can change the default, so a caller without it can skip asking the targets. */
export function lookupMatters(data: StartContext, playbookId: string) {
  const targets = data.articleTargets || [],
    linked = data.work.article;
  return (
    targets.length > 0 &&
    !(linked?.targetId && targets.some((t) => t.id === linked.targetId)) &&
    data.articlePlaybookTargets?.[playbookId] !== REPO &&
    playbookId !== 'blog-post' &&
    pageUrlsOf(data).length > 0
  );
}

/** The start command's delivery and whether it can start yet; unlinks first when the saved article differs. */
export function deliveryPlan(data: StartContext, choice: DeliveryChoice) {
  const linked = data.work.article;
  if (choice.target === REPO)
    return { ready: true, unlink: Boolean(linked?.targetId), delivery: REPO };
  const also = choice.also.filter((id) => id !== choice.target);
  if (choice.mode === 'existing') {
    const saved = Boolean(
        linked?.articleId && linked.targetId === choice.target,
      ),
      found =
        !saved && choice.article?.targetId === choice.target
          ? choice.article
          : undefined;
    return {
      ready: saved || Boolean(found),
      unlink: false,
      // The found article is saved on the task as the start is confirmed.
      link: found
        ? { targetId: found.targetId, articleId: found.articleId }
        : undefined,
      delivery: also.length ? { also } : undefined,
    };
  }
  return {
    ready: true,
    unlink: Boolean(
      linked?.articleId ||
      (linked?.targetId && linked.targetId !== choice.target),
    ),
    delivery: { targetId: choice.target, ...(also.length ? { also } : {}) },
  };
}

/** The Agent a start uses: the task's or the project's default when it can still be used, else the only one. */
export function startAgent(data: StartContext) {
  const options = data.agent?.options || [],
    chosen = data.agent?.agentId;
  if (chosen && options.some((a) => a.id === chosen))
    return { ready: true, save: undefined };
  return options.length === 1
    ? { ready: true, save: options[0].id }
    : { ready: false, save: undefined };
}

/** Why a task cannot start by itself: each names one thing a person has to settle on the start card. */
export type StartBlocker =
  | 'noAgent'
  | 'chooseAgent'
  | 'targetGone'
  | 'chooseTarget'
  | 'chooseArticle'
  | 'noRepository';

/**
 * What stops a task from starting with its defaults. `changes`: the playbook changes something, so its delivery is
 * chosen when the project has publishing targets; `needsRepository`: its first Agent step changes the website
 * repository; `simulated`: runs are simulated and need neither. Several targets with none marked default, a target
 * that is gone and an article not found from the page all wait for a person, as does an Agent nobody chose.
 */
export function startBlockers(
  data: StartContext,
  {
    playbookId,
    changes,
    needsRepository,
    simulated = false,
    found,
  }: {
    playbookId: string;
    changes: boolean;
    needsRepository: boolean;
    simulated?: boolean;
    found?: ArticleFound;
  },
): StartBlocker[] {
  const out: StartBlocker[] = [];
  if (!startAgent(data).ready)
    out.push((data.agent?.options || []).length ? 'chooseAgent' : 'noAgent');
  const targets = data.articleTargets || [],
    linked = data.work.article;
  let repository = true;
  if (changes && targets.length) {
    if (linked?.targetId && !targets.some((t) => t.id === linked.targetId))
      out.push('targetGone');
    const choice = defaultDelivery(data, playbookId, found);
    repository = choice.target === REPO;
    const entry = data.articlePlaybookTargets?.[playbookId],
      clear =
        repository ||
        targets.length === 1 ||
        targets.some((t) => t.default || t.id === entry) ||
        choice.article?.targetId === choice.target ||
        linked?.targetId === choice.target;
    if (!clear) out.push('chooseTarget');
    else if (!deliveryPlan(data, choice).ready) out.push('chooseArticle');
  }
  if (repository && needsRepository && !simulated && !data.agent?.repo)
    out.push('noRepository');
  return out;
}
