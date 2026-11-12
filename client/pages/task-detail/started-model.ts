import { $t } from '#i18n';
import { pageKey } from '../../../shared/opportunity-parts.js';
import {
  readsOnly,
  type Category,
  type Playbook,
  type PlaybookList,
  type Step,
} from '../playbook-model';
import type { TaskData, Work } from '../task-execution-types';
import { startedPageUrls } from './article-model';
import { articlePageUrl } from './article-page';

// What a started task was started with, as the start's record on the task page shows it (started-card.tsx), and what
// Properties leaves out because the record shows it (task-properties.tsx).

/** The brief as the Agent gets it: the document an accepted task handed over, else the task's brief, as plain text. */
export function startBrief(data: TaskData, started: boolean) {
  const handoff = data.task.evidence?.handoff as
      { playbook?: string; content?: string } | undefined,
    plain = (handoff?.content || data.task.brief || '')
      .replace(/[#*>`_]/g, '')
      .replace(/^[ \t]+/gm, '')
      .replace(/\n{2,}/g, '\n')
      .trim();
  return {
    title: handoff?.content
      ? $t('taskDetail.documentDelivered', { 0: handoff.playbook })
      : $t(
          started
            ? 'taskDetail.whatAgentReceived'
            : 'taskDetail.whatAgentReceive',
        ),
    text: plain,
    long: plain.length > 240 || plain.split('\n').length > 3,
  };
}

/**
 * Whether the started playbook changes something, so its start settled where: its snapshot's kind, or for a task
 * started before snapshots kept it, a Publish step after its steps.
 */
const changes = (w: Work) =>
  w.playbook?.kind
    ? w.playbook.kind === 'build'
    : Boolean(w.flow?.stages.some((s) => s.kind === 'release'));

/**
 * Where a started task's change goes, as its start settled it: the article, its languages (primary first) and every
 * target it publishes to; or the site's pages and the repository kept at the start (2026-10-29), the pages being the
 * ones the start recorded (startedPageUrls), so relinking the task's page afterwards changes only Properties and
 * Performance. Null before the start and for a task that changes nothing.
 */
export function startedDelivery(data: TaskData) {
  const w = data.work,
    d = w.delivery;
  if (!w.flow || !(d?.kind === 'article' || changes(w))) return null;
  if (d?.kind === 'article') {
    const a =
        w.article?.articleId && w.article.targetId === d.targetId
          ? w.article
          : undefined,
      url = a
        ? articlePageUrl(data, a.targetId, a.slug, startedPageUrls(data))
        : '';
    return {
      kind: 'article' as const,
      pages: a ? [{ url: url || a.slug, title: a.title || a.slug }] : [],
      targets: [d.targetId, ...(d.also || []).map((x) => x.targetId)],
      locales: d.locales || [],
      // Started without an article: a new one, saved as a draft where its target keeps a status (2026-11-12).
      isNew: !a,
    };
  }
  return {
    kind: 'site' as const,
    pages: startedPageUrls(data).map((url) => ({ url })),
    repo: data.agent?.repo || null,
  };
}

/** Whether the task's related page is one the start's record already shows as a page to change. */
export function relatedPageShown(data: TaskData) {
  const key = pageKey(data.work.page?.url, data.pageIdentity);
  return Boolean(
    key &&
    startedDelivery(data)?.pages.some(
      (p) => pageKey(p.url, data.pageIdentity) === key,
    ),
  );
}

/**
 * The playbook as the task started with it, for View steps: its snapshot's steps, with the description of the playbook
 * it came from while that is still the same version, and its category.
 */
export function startedPlaybook(
  w: Work,
  list?: PlaybookList,
): Playbook | undefined {
  const flow = w.flow;
  if (!flow) return undefined;
  const id = w.playbook?.id || flow.id,
    current = list?.playbooks.find((p) => p.id === id),
    version = w.playbook?.version ?? flow.version;
  const steps: Step[] = flow.stages
    .filter((s) => s.kind === 'agent' || s.kind === 'review')
    .map((s) =>
      s.kind === 'review'
        ? {
            key: s.key,
            name: s.name,
            kind: 'review',
            checklist: s.checklist || [],
          }
        : {
            key: s.key,
            name: s.name,
            kind: readsOnly(s) ? 'analyze' : 'change',
            ...(s.instruction ? { instruction: s.instruction } : {}),
            ...(s.skills?.length ? { skills: s.skills } : {}),
          },
    );
  return {
    id,
    name: w.playbook?.name || flow.name,
    category: current?.category as Category,
    description:
      current && current.version === version ? current.description : '',
    steps,
    kind: w.playbook?.kind || (changes(w) ? 'build' : 'plan'),
    next: w.playbook?.next || [],
    version,
  };
}
