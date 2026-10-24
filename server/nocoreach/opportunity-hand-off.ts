import { systemMessageText } from '../../shared/i18n/messages.js';
import { slugFromPage } from '../../shared/article-publishing.js';
import {
  pageKey,
  splitOf,
  type OpportunityPart,
  type TaskPart,
} from '../../shared/opportunity-parts.js';
import type {
  Opportunity,
  Proposal,
  Signal,
} from '../../shared/strategy-model.js';
import { taskClosed, type TaskWork } from '../../shared/task-pending.js';

// Handing off an opportunity one place at a time (shared/opportunity-parts.ts): what each place is called, the title
// of its task, which places a task of the opportunity already covers, and the paragraph that tells each task's Agent
// it is one of several.

/** A place as the hand-off dialog shows it and confirmDirection creates it. */
export type PlanPart = TaskPart & {
  title: string;
  playbookId: string;
  /** The task of this opportunity already changing this place, if any. */
  task?: { id: string; no?: number };
};

type SiteContent = {
  pages?: { url?: unknown; title?: unknown }[];
  sites?: { origin?: unknown }[];
  origin?: unknown;
} | null;
type ArticleTarget = { pages?: Record<string, string> };
export type PlanTask = {
  id: number | string;
  evidence?: {
    no?: number;
    page?: unknown;
    work?:
      | (TaskWork & {
          page?: { url?: string } | null;
          release?: {
            state: string;
            pages?: string[];
            articles?: { slug?: string; published?: { slug?: string } }[];
          };
          receipt?: { note: string; url?: string } | null;
          article?: { slug?: string } | null;
        })
      | null;
  } | null;
};

const TITLE: Record<string, string> = {
  'tech-fix': 'opportunityTasks.fixTitle',
  'release-notes': 'opportunityTasks.announceTitle',
  'change-research': 'opportunityTasks.researchTitle',
};

function siteOrigin(site: SiteContent) {
  const origin = site?.sites?.[0]?.origin ?? site?.origin;
  try {
    return typeof origin === 'string'
      ? new URL(origin).host.replace(/^www\./, '')
      : '';
  } catch {
    return '';
  }
}

/** A place in words: the site page's title, otherwise its path (with the host when it is not the site's). */
function labelOf(part: OpportunityPart, site: SiteContent, locale: string) {
  if (part.kind === 'replies')
    return systemMessageText('opportunityTasks.replies', {}, locale);
  const key = pageKey(part.url);
  const title = (site?.pages || []).find((p) => pageKey(p.url) === key)?.title;
  if (typeof title === 'string' && title.trim())
    return title.trim().replace(/\s+/g, ' ').slice(0, 150);
  try {
    const u = new URL(String(part.url));
    let path = u.pathname.replace(/\/+$/, '') || '/';
    try {
      path = decodeURI(path);
    } catch {
      /* keep it encoded */
    }
    const host = u.host.replace(/^www\./, '');
    return (host === siteOrigin(site) ? path : `${host}${path}`).slice(0, 150);
  } catch {
    return String(part.url || '').slice(0, 150);
  }
}

function titleOf(part: OpportunityPart, label: string, locale: string) {
  if (part.kind === 'replies')
    return systemMessageText('opportunityTasks.replyTitle', {}, locale).slice(
      0,
      200,
    );
  return systemMessageText(
    TITLE[part.playbookId] || 'opportunityTasks.updateTitle',
    { 0: label },
    locale,
  ).slice(0, 200);
}

/** The pages and articles a task handed off before places existed has changed or is about. */
function legacyCover(
  task: PlanTask,
  parts: OpportunityPart[],
  targets: ArticleTarget[],
) {
  const e = task.evidence || {},
    w = e.work || {};
  const pages = new Set(
    [e.page, w.page?.url, w.receipt?.url, ...(w.release?.pages || [])]
      .map(pageKey)
      .filter(Boolean),
  );
  const slugs = new Set(
    [
      w.article?.slug,
      ...(w.release?.articles || []).flatMap((a) => [
        a.slug,
        a.published?.slug,
      ]),
    ].filter((s): s is string => typeof s === 'string' && Boolean(s)),
  );
  return parts
    .filter(
      (p) =>
        p.kind === 'page' &&
        (pages.has(pageKey(p.url)) ||
          targets.some((t) => {
            const slug = slugFromPage(t.pages, String(p.url))?.slug;
            return Boolean(slug && slugs.has(slug));
          })),
    )
    .map((p) => p.key);
}

/**
 * The places of an opportunity to hand off one by one, each with its label, task title and playbook, and the open
 * task already covering it; empty when the opportunity is one task. A closed task covers nothing, so its place can be
 * handed off again.
 */
export function planOf({
  card,
  signals,
  site,
  proposals,
  tasks,
  targets,
  locale,
}: {
  card: Opportunity;
  signals: Signal[];
  site: SiteContent;
  proposals: Proposal[];
  tasks: PlanTask[];
  targets: ArticleTarget[];
  locale: string;
}): PlanPart[] {
  const parts = splitOf(card, signals);
  if (!parts.length) return [];
  const byId = new Map(tasks.map((t) => [String(t.id), t])),
    covered = new Map<string, { id: string; no?: number }>();
  for (const p of [...proposals].reverse()) {
    if (!p.taskId || p.insight?.id !== card.id) continue;
    const task = byId.get(String(p.taskId));
    if (!task || taskClosed(task.evidence?.work)) continue;
    const ref = {
      id: String(p.taskId),
      ...((task.evidence?.no ?? p.taskNo)
        ? { no: task.evidence?.no ?? p.taskNo }
        : {}),
    };
    for (const key of p.part ? [p.part.key] : legacyCover(task, parts, targets))
      if (!covered.has(key)) covered.set(key, ref);
  }
  return parts.map((part) => {
    const label = labelOf(part, site, locale);
    return {
      key: part.key,
      kind: part.kind,
      ...(part.url ? { url: part.url } : {}),
      label,
      signalIds: part.signalIds,
      title: titleOf(part, label, locale),
      playbookId: part.playbookId,
      ...(covered.has(part.key) ? { task: covered.get(part.key)! } : {}),
    };
  });
}

const place = (p: PlanPart, locale: string) =>
  p.url
    ? systemMessageText(
        'opportunityTasks.placeWithUrl',
        { 0: p.label, 1: p.url },
        locale,
      )
    : p.label;

/**
 * The paragraph at the top of a place's brief: which task of how many, the one place to change, what the other tasks
 * of the opportunity change, and to keep one approach across them.
 */
export function scopeText(
  card: Pick<Opportunity, 'no' | 'title'>,
  part: PlanPart,
  others: PlanPart[],
  locale: string,
) {
  const opportunity = card.no ? `O-${card.no}` : card.title;
  return systemMessageText(
    'opportunityTasks.scope',
    {
      0: opportunity,
      1: others.length + 1,
      2: place(part, locale),
      3: others
        .map((o) => o.label)
        .join(systemMessageText('opportunityTasks.separator', {}, locale)),
    },
    locale,
  );
}

/** What the task and its proposal keep of their place. */
export const taskPart = (p: PlanPart): TaskPart => ({
  key: p.key,
  kind: p.kind,
  ...(p.url ? { url: p.url } : {}),
  label: p.label,
  signalIds: p.signalIds,
});
