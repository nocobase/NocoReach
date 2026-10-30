import {
  closedAt,
  isClosed,
  isSnoozed,
  workState,
  type BoardState,
  type Work,
} from './task-execution-types';
import { stepOf } from './task-list-model';
import { taskAgentOf, type AgentStatus } from './task-agents';
import { timestamp } from '../../shared/timestamps';

// Tasks list sorting (2026-10-29 user request: every column sorts, as the Keywords tables do). The sort lives in the URL
// (`sort`, `order`) like the other tables'. A column's values follow what it shows on each tab: Current step is the
// step's words, but When closed sorts by the time the task was closed and Snoozed's columns by what each waits for and
// the day it comes back. Missing values stay at the end whichever way a column sorts.

export type TaskSortKey =
  'no' | 'title' | 'status' | 'step' | 'owner' | 'executor' | 'updated';
export type TaskOrder = 'asc' | 'desc';
export type TaskScope = 'current' | 'waiting' | 'done' | 'closed' | 'snoozed';
export const TASK_SORT_KEYS: TaskSortKey[] = [
  'no',
  'title',
  'status',
  'step',
  'owner',
  'executor',
  'updated',
];
export type SortableTask = {
  id: number;
  title: string;
  status?: string;
  updatedAt: string;
  evidence?: { work?: Work; no?: number; createdBy?: { name?: string } };
};

/** Each tab's order before a column is chosen: what needs you first, then the latest; the latest closed first; the one coming back soonest first. */
const DEFAULT_SORT: Record<TaskScope, { sort: TaskSortKey; order: TaskOrder }> =
  {
    current: { sort: 'status', order: 'asc' },
    waiting: { sort: 'status', order: 'asc' },
    done: { sort: 'updated', order: 'desc' },
    closed: { sort: 'step', order: 'desc' },
    snoozed: { sort: 'step', order: 'asc' },
  };
/** The direction a column starts in when chosen: numbers and times newest first, the rest from the top. */
const FIRST_ORDER: Record<TaskSortKey, TaskOrder> = {
  no: 'desc',
  title: 'asc',
  status: 'asc',
  step: 'asc',
  owner: 'asc',
  executor: 'asc',
  updated: 'desc',
};

export function taskSort(
  scope: TaskScope,
  sort: string | null,
  order: string | null,
) {
  const asked = TASK_SORT_KEYS.includes(sort as TaskSortKey)
    ? (sort as TaskSortKey)
    : null;
  const key = asked ?? DEFAULT_SORT[scope].sort;
  const direction: TaskOrder =
    order === 'asc' || order === 'desc'
      ? order
      : asked
        ? firstOrder(scope, key)
        : DEFAULT_SORT[scope].order;
  return { sort: key, order: direction };
}
/** When closed starts with the latest closed. */
export const firstOrder = (scope: TaskScope, key: TaskSortKey): TaskOrder =>
  scope === 'closed' && key === 'step' ? 'desc' : FIRST_ORDER[key];
/** The next sort when a column header is clicked: the other direction for the current column, else its first. */
export function nextSort(
  scope: TaskScope,
  current: { sort: TaskSortKey; order: TaskOrder },
  key: TaskSortKey,
): { sort: TaskSortKey; order: TaskOrder } {
  return {
    sort: key,
    order:
      key === current.sort
        ? current.order === 'asc'
          ? 'desc'
          : 'asc'
        : firstOrder(scope, key),
  };
}

// The status column reads what needs you first: Needs you, In progress, To do, Snoozed, Done, Closed.
const STATUS_RANK: Record<BoardState | 'snoozed' | 'closed', number> = {
  review: 0,
  doing: 1,
  todo: 2,
  snoozed: 3,
  done: 4,
  closed: 5,
};
const owner = (t: SortableTask) =>
  t.evidence?.work?.humanOwnerName || t.evidence?.createdBy?.name || '';
const collator = () =>
  new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
// Times compare as instants, whatever form the database returned them in.
const time = (value?: string | null) => {
  try {
    const at = Date.parse(timestamp(value ?? null) || '');
    return Number.isNaN(at) ? null : at;
  } catch {
    return null;
  }
};

function value(
  t: SortableTask,
  key: TaskSortKey,
  scope: TaskScope,
  agents?: AgentStatus,
): string | number | null {
  const w = t.evidence?.work;
  switch (key) {
    case 'no':
      return typeof t.evidence?.no === 'number' ? t.evidence.no : null;
    case 'title':
      return t.title || null;
    case 'status':
      if (scope === 'snoozed') return w?.snooze?.reason || null;
      return STATUS_RANK[
        isClosed(w)
          ? 'closed'
          : isSnoozed(w)
            ? 'snoozed'
            : workState(w, t.status)
      ];
    case 'step':
      if (scope === 'snoozed') return time(w?.snooze?.until);
      if (isClosed(w)) return time(closedAt(w));
      return stepOf(w)?.text || null;
    case 'owner':
      return owner(t) || null;
    case 'executor':
      return (agents ? taskAgentOf(w, agents)?.name : w?.agentName) || null;
    case 'updated':
      return time(t.updatedAt);
  }
}

export function sortTasks<T extends SortableTask>(
  rows: readonly T[],
  { sort, order }: { sort: TaskSortKey; order: TaskOrder },
  scope: TaskScope,
  agents?: AgentStatus,
): T[] {
  const words = collator();
  const compare = (x: string | number, y: string | number) =>
    typeof x === 'number' && typeof y === 'number'
      ? x - y
      : words.compare(String(x), String(y));
  // Ties keep the latest update first, then the newest task.
  const tie = (a: T, b: T) =>
    (time(b.updatedAt) ?? 0) - (time(a.updatedAt) ?? 0) || b.id - a.id;
  return rows
    .map((row) => ({ row, v: value(row, sort, scope, agents) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null)
        return a.v === null && b.v === null
          ? tie(a.row, b.row)
          : a.v === null
            ? 1
            : -1;
      const c = compare(a.v, b.v);
      return (order === 'asc' ? c : -c) || tie(a.row, b.row);
    })
    .map((k) => k.row);
}
