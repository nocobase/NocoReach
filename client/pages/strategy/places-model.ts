import { $t } from '#i18n';
import { splitOf } from '../../../shared/opportunity-parts.js';
import { taskClosed, taskState } from '../../../shared/task-pending.js';
import type { TaskStanding } from '../task-state-tag';
import type { Work } from '../task-execution-types';
import { draftFromOpportunity, type StrategyState } from './model';
import type { Row } from './board';
import { request } from './service';

// One opportunity, several tasks (2026-10-22 user decision): an opportunity whose changes point to several places is
// handed off one task per place, after the person confirms which (shared/opportunity-parts.ts). The opportunity is
// the grouping, so it lists its tasks and their progress; the task list and board stay flat.

/** A place as the server proposes it: its task's title, playbook and the task already changing it, if any. */
export type PlanPart = {
  key: string;
  kind: 'page' | 'replies';
  url?: string;
  label: string;
  title: string;
  playbookId: string;
  signalIds: string[];
  task?: { id: string; no?: number };
};
export type HandOffDone = { state: StrategyState; taskIds: number[] };

/** The places this opportunity's changes point to; none when it is handed off as one task, as before. */
export const placesOf = (row: Row) =>
  splitOf(row.card, row.batch.evidence.signals?.items || []);

/** Creates one task for each place ticked; returns the new tasks, first first. */
export async function handOffPlaces(
  projectId: number,
  state: StrategyState,
  row: Row,
  parts: string[],
  requestId: string,
): Promise<HandOffDone> {
  const next = await request<StrategyState>(projectId, 'confirmDirection', {
    ...draftFromOpportunity(row.card),
    insightId: row.card.id,
    parts,
    revision: state.revision,
    requestId,
  });
  const before = new Set(state.proposals.map((p) => p.id));
  const taskIds = next.proposals
    .filter(
      (p) => p.insight?.id === row.card.id && p.taskId && !before.has(p.id),
    )
    .map((p) => p.taskId!)
    .reverse();
  return { state: next, taskIds };
}

export type OpportunityTask = {
  id: number;
  title?: string;
  status?: string;
  evidence?: { no?: number; work?: Work | null };
};
const ORDER: TaskStanding[] = ['done', 'review', 'doing', 'todo', 'closed'];
export const standingOf = (t?: OpportunityTask): TaskStanding =>
  taskClosed(t?.evidence?.work)
    ? 'closed'
    : taskState(t?.evidence?.work, t?.status);

/** How many of an opportunity's tasks stand where: "Done 1 · In progress 2 · To do 3". */
export function progressText(states: TaskStanding[]) {
  const label: Record<TaskStanding, string> = {
    done: $t('common.completed'),
    review: $t('common.needsConfirmation'),
    doing: $t('common.inProgress'),
    todo: $t('common.pending'),
    closed: $t('common.closed'),
  };
  return ORDER.map((s) => [s, states.filter((x) => x === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${label[s]} ${n}`)
    .join(' · ');
}
