import {
  defaultLocales,
  translationDefault,
  type ArticleMatch,
} from './article-publishing.js';
import { ownSignalIds, pageKey } from './opportunity-parts.js';
import { routeRepo, type RepoRef } from './repo-routing.js';

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
  /** The languages the task writes, primary first; left out, every language of the target in its order. */
  locales?: string[];
  /** The repository a pull request goes to (2026-10-29); left out, the one serving the task's pages. */
  repoId?: string;
};
/**
 * One of a task's pages as the lookup read it: the article that holds it, or none, a page of the site itself;
 * `unchecked` when a target that could hold it could not be asked. `title` is the page's title in Website content.
 */
export type PageFound = {
  url: string;
  title?: string;
  article?: ArticleMatch;
  unchecked?: boolean;
  /**
   * Not found, but it looks like an article of a target whose exporter rewrites the repository's copy (T-55): never
   * changed by pull request; a person picks the article, searching for `slug` first.
   */
  guess?: { targetId: string; slug: string };
};
/**
 * What the page lookup said: the first article found, or none; `unchecked` when a target could not be asked; and each
 * page in the task's order (2026-10-29).
 */
export type ArticleFound = {
  article: ArticleMatch | null;
  unchecked: boolean;
  pages?: PageFound[];
};

/** The most pages a task carries, as many as an audit issue's brief lists. */
export const MAX_TASK_PAGES = 30;

/** What the defaults read: the task page's data, or the same fields the server reads for a hand-over. */
export type StartContext = {
  task: { evidence?: Record<string, unknown> };
  /** The project's AI content language ("zh-CN"): the primary language when nobody chose one (2026-10-30). */
  language?: string | null;
  work: {
    page?: { url?: string } | null;
    article?: {
      targetId?: string;
      articleId?: string | null;
      locales?: string[];
    } | null;
  };
  articleTargets?: { id: string; default?: boolean; locales?: string[] }[];
  articlePlaybookTargets?: Record<string, string>;
  agent?: {
    repo?: unknown;
    /** The website source repositories, each with the addresses it serves (shared/repo-routing.ts). */
    repos?: RepoRef[];
    agentId?: string | null;
    options?: { id: string; type?: string }[];
  } | null;
};

/** Web addresses, each page once (whatever its scheme, `www.` or trailing slash), in order, at most `max`. */
export function distinctPages(urls: unknown[], max = MAX_TASK_PAGES) {
  const out = new Map<string, string>();
  for (const u of urls) {
    const url = typeof u === 'string' ? u.trim() : '',
      key = pageKey(url);
    if (key && !out.has(key)) out.set(key, url);
  }
  return [...out.values()].slice(0, max);
}

/**
 * The pages a task is about, most specific first: the page linked on the task, then the pages it was handed off with
 * (2026-10-29: every hand-off that concerns pages names them all, `evidence.pages`). A task handed off without them
 * reads the opportunity's target when it is an address and the pages of the changes it cites or was handed off from,
 * a site audit change's affected pages included.
 */
export function pageUrlsOf(data: StartContext): string[] {
  const e = (data.task.evidence || {}) as {
    page?: unknown;
    pages?: unknown;
    signalKey?: unknown;
    part?: { signalIds?: unknown } | null;
    insight?: { target?: unknown; signalIds?: unknown } | null;
    context?: {
      signals?: {
        items?: { key?: unknown; url?: unknown; evidence?: unknown }[];
      };
    };
  };
  const listed: unknown[] = Array.isArray(e.pages) ? e.pages : [];
  if (listed.length)
    return distinctPages([data.work.page?.url, e.page, ...listed]);
  // A change handed off on its own (Insights › Today's changes) names its page and change instead of an opportunity;
  // one of an opportunity's several tasks looks only at its own place, never at the opportunity's other pages.
  const ids = new Set<unknown>(ownSignalIds(e));
  const cited = (e.context?.signals?.items || [])
    .filter((s) => ids.has(s.key))
    .flatMap((s) => [
      s.url,
      ...(typeof s.key === 'string' &&
      s.key.startsWith('audit-') &&
      Array.isArray(s.evidence)
        ? (s.evidence as unknown[])
        : []),
    ]);
  return distinctPages([
    data.work.page?.url,
    e.page,
    e.part ? undefined : e.insight?.target,
    ...cited,
  ]);
}

/** Each page the lookup read, or one standing for them all when it named only the article it found. */
function foundPages(found: ArticleFound): PageFound[] {
  if (found.pages) return found.pages;
  return [
    found.article
      ? { url: found.article.url, article: found.article }
      : { url: '', ...(found.unchecked ? { unchecked: true } : {}) },
  ];
}

/**
 * Where most of a task's pages are changed (2026-10-29): in the first article found when articles hold at least as
 * many of its pages as the rest, in the repository when more of them are pages of the site itself than all the
 * others, counting a page that could not be checked, or that looks like an exported article (`guess`), against it;
 * otherwise it is not known.
 */
export function placeOf(found: ArticleFound) {
  const pages = foundPages(found),
    articles = pages.filter((p) => p.article),
    site = pages.filter((p) => !p.article && !p.unchecked && !p.guess).length,
    unknown = pages.length - articles.length - site;
  if (articles.length && articles.length >= site + unknown)
    return { kind: 'article' as const, article: articles[0].article! };
  if (site && site > articles.length + unknown)
    return { kind: 'site' as const };
  return undefined;
}

/**
 * The task's pages a start changes and the ones it leaves to other tasks (2026-10-29): the repository changes the
 * pages no article holds (never one that looks like an exported article), an article only its own page. Without the
 * lookup every page counts as changed.
 */
export function startPages(
  data: StartContext,
  choice: DeliveryChoice,
  found?: ArticleFound,
): { pages: PageFound[]; rest: PageFound[] } {
  if (!found)
    return { pages: pageUrlsOf(data).map((url) => ({ url })), rest: [] };
  const all = foundPages(found).filter((p) => p.url);
  if (choice.target === REPO)
    return {
      pages: all.filter((p) => !p.article && !p.guess),
      rest: all.filter((p) => p.article || p.guess),
    };
  if (choice.mode === 'new') return { pages: [], rest: [] };
  const linked = data.work.article,
    id =
      choice.article?.targetId === choice.target
        ? choice.article.articleId
        : linked?.targetId === choice.target
          ? linked.articleId
          : null,
    own = (p: PageFound) =>
      p.article?.targetId === choice.target && p.article.articleId === id;
  // No article picked yet: every page is still the task's, until a person picks where it goes.
  if (!id) return { pages: all, rest: [] };
  return { pages: all.filter(own), rest: all.filter((p) => !own(p)) };
}

/**
 * The pages the start command names (`pages`, kept as `work.pages`): sent only when the start leaves some of the
 * task's pages to other tasks, so the Agent changes just its own.
 */
export function pagesToStart(
  data: StartContext,
  choice: DeliveryChoice,
  found?: ArticleFound,
) {
  const { pages, rest } = startPages(data, choice, found);
  return rest.length && pages.length ? pages.map((p) => p.url) : undefined;
}

/**
 * The default (2026-10-21: decided by where the page lives, not asked): the linked article; a playbook set to the
 * repository opens a pull request; a blog post is a new article in the playbook's target, then the default target.
 * Any other change goes where most of the task's pages are (placeOf, 2026-10-29): the article found from them, or,
 * when they are pages of the site itself, the repository (unless the playbook names a target), connected or not.
 * Otherwise a page or an article is picked by hand.
 */
export function defaultDelivery(
  data: StartContext,
  playbookId: string,
  found?: ArticleFound,
  /** A translation playbook: always an article that exists (2026-10-25). */
  translate = false,
): DeliveryChoice {
  const choice = targetDelivery(data, playbookId, found, translate);
  // The languages picked when the task was handed over (2026-10-30), primary first.
  const handed = (data.task?.evidence?.handoff as { locales?: unknown } | null)
    ?.locales;
  return choice.target !== REPO &&
    !translate &&
    Array.isArray(handed) &&
    handed.length &&
    handed.every((l) => typeof l === 'string')
    ? { ...choice, locales: handed }
    : choice;
}

function targetDelivery(
  data: StartContext,
  playbookId: string,
  found: ArticleFound | undefined,
  translate: boolean,
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
  const place = found && placeOf(found);
  if (
    place?.kind === 'article' &&
    targets.some((t) => t.id === place.article.targetId)
  )
    return {
      target: place.article.targetId,
      mode: 'existing',
      also: [],
      article: place.article,
    };
  if (place?.kind === 'site' && !named)
    return { target: REPO, mode: 'new', also: [] };
  return { target, mode: 'existing', also: [] };
}

/** Whether the project has a website source repository. */
const hasRepository = (data: StartContext) =>
  Boolean(data.agent?.repos?.length || data.agent?.repo);

/**
 * The repository a pull request goes to: the one chosen on the start card while it is still there, else the one
 * serving the task's pages (`by` says how it was found); null when a person has to choose.
 */
export function choiceRepo(data: StartContext, choice?: DeliveryChoice) {
  const repos = data.agent?.repos || [],
    picked = choice?.repoId && repos.find((r) => r.id === choice.repoId);
  return picked
    ? { repo: picked, by: 'chosen' as const }
    : routeRepo(repos, pageUrlsOf(data));
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

/**
 * The languages a task writes, primary first (2026-10-24): the ones chosen at start that its target has, else every
 * language of the target, the project's AI content language first when the target has it (2026-10-30), then the
 * target's order. The first is written and reviewed first; the others are translated from it once it is approved.
 */
export function choiceLocales(data: StartContext, choice: DeliveryChoice) {
  if (choice.target === REPO) return [];
  const all =
    (data.articleTargets || []).find((t) => t.id === choice.target)?.locales ||
    [];
  const chosen = (choice.locales || []).filter((l) => all.includes(l));
  return chosen.length ? chosen : defaultLocales(all, data.language);
}

/** The languages the chosen article has, when known: the one found from the page, else the one saved on the task. */
export function presentLocales(
  data: StartContext,
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
  data: StartContext,
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
  const d = translationDefault(all, present, undefined, data.language);
  return [d.from, ...d.to];
}

/** The start command's delivery and whether it can start yet; unlinks first when the saved article differs. */
export function deliveryPlan(
  data: StartContext,
  choice: DeliveryChoice,
  translate = false,
) {
  const linked = data.work.article;
  if (choice.target === REPO) {
    const repos = data.agent?.repos || [],
      repo = choiceRepo(data, choice).repo;
    return {
      // Several repositories, and none serving the task's pages alone: the start card asks which.
      ready: repos.length < 2 || Boolean(repo),
      unlink: Boolean(linked?.targetId),
      delivery: REPO,
      ...(repos.length > 1 && repo ? { repoId: repo.id } : {}),
    };
  }
  const also = translate
      ? []
      : choice.also.filter((id) => id !== choice.target),
    chosen = translate
      ? translationLocales(data, choice)
      : choiceLocales(data, choice),
    // Two or more are written primary first, then translated. A single one the person chose out of several is sent
    // too (2026-10-27): without it the server takes the target's first language as the primary and writes every
    // language. A target with one language needs none. A translation always names its source and the languages to
    // write.
    send =
      chosen.length > 1 ||
      (!translate && chosen.length === 1 && Boolean(choice.locales?.length)),
    locales = send ? { locales: chosen } : {};
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
        also.length || send
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
  | 'choosePage'
  | 'noRepository'
  | 'chooseRepository';

/**
 * What stops a task from starting with its defaults. `changes`: the playbook changes something, so its delivery is
 * chosen when the project has publishing targets; `translate`: it translates an existing article; `needsRepository`:
 * its first Agent step changes the website repository; `simulated`: runs are simulated and need neither. Several
 * targets with none marked default, a target that is gone, a task with no page known (`choosePage`, 2026-10-29) and
 * pages whose place could not be told all wait for a person, as does an Agent nobody chose.
 */
export function startBlockers(
  data: StartContext,
  {
    playbookId,
    changes,
    translate = false,
    needsRepository,
    simulated = false,
    found,
  }: {
    playbookId: string;
    changes: boolean;
    translate?: boolean;
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
    const choice = defaultDelivery(data, playbookId, found, translate);
    repository = choice.target === REPO;
    const entry = data.articlePlaybookTargets?.[playbookId],
      clear =
        repository ||
        targets.length === 1 ||
        targets.some((t) => t.default || t.id === entry) ||
        choice.article?.targetId === choice.target ||
        linked?.targetId === choice.target;
    if (!clear) out.push('chooseTarget');
    else if (!deliveryPlan(data, choice, translate).ready)
      out.push(
        translate || pageUrlsOf(data).length ? 'chooseArticle' : 'choosePage',
      );
  }
  if (repository && needsRepository && !simulated) {
    if (!hasRepository(data)) out.push('noRepository');
    else if ((data.agent?.repos?.length ?? 0) > 1 && !choiceRepo(data).repo)
      out.push('chooseRepository');
  }
  return out;
}
