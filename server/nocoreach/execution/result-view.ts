import { systemMessageText } from '../../../shared/i18n/messages.js';
import {
  safeConclusion,
  matchesObservation,
} from '../../../shared/result-comparison.js';
import { boardState, projectWork, type Work } from './model.js';

type Task = {
  id: string | number;
  title: string;
  status?: string;
  evidence?: { no?: number; simulated?: boolean; work?: Work };
};
type Source = { taskId: string };
type Strategy = {
  revision: number;
  resultOpportunities?: { id: string; title: string; resultSource: Source }[];
  proposals?: {
    taskId?: string | number;
    title: string;
    resultSource?: Source;
  }[];
};
type Service = {
  repo(name: string): { find(options: object): Promise<{ toJSON(): Task }[]> };
  task(project: string, id: string): Promise<Task>;
  effectPages(work: Work): string[];
  snapshot(key: string): Promise<Strategy | null>;
};
type Filters = {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  status?: string;
  q?: string;
};
const invalid = (): never => {
  throw Object.assign(
    new Error(systemMessageText('strategy.checkInputLength')),
    { status: 400 },
  );
};

export function resultSummary(task: Task, pages: string[]) {
  const work = projectWork(task),
    results = work.observation?.results || [];
  const artifacts = work.results.filter(
    (artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact),
  );
  const receipt = work.receipt as { note?: string; at?: string } | null;
  const delivered =
    artifacts.length ||
    receipt?.note ||
    work.release ||
    work.observeFrom ||
    results.length;
  if (
    !delivered &&
    (work.cancelledAt || work.archivedAt || boardState(work) !== 'done')
  )
    return null;
  const candidate = [...results].sort((a, b) => b.day - a.day)[0] || null;
  const latest =
    candidate && matchesObservation(candidate, work.observeFrom)
      ? candidate
      : null;
  const history = work.history as { action: string; at?: string }[];
  const dates = [
    work.observeFrom,
    work.release?.liveAt,
    receipt?.at,
    ...artifacts.map((a) => a.createdAt),
    ...history
      .filter((h) => ['receipt', 'completeTask'].includes(h.action))
      .map((h) => h.at),
  ].filter(
    (date): date is string =>
      typeof date === 'string' && Number.isFinite(Date.parse(date)),
  );
  return {
    taskId: String(task.id),
    taskNo: task.evidence?.no || null,
    title: task.title,
    taskState: boardState(work),
    closed: Boolean(work.cancelledAt || work.archivedAt),
    simulated: Boolean(
      task.evidence?.simulated || work.release?.state === 'simulated',
    ),
    occurredAt: dates[0] ? new Date(dates[0]).toISOString() : null,
    pages,
    status:
      candidate && !latest
        ? 'unavailable'
        : latest
          ? safeConclusion(latest)
          : work.observeFrom && pages.length
            ? 'waiting'
            : 'unavailable',
    latest,
  };
}
export async function listResults(
  service: Service,
  project: string,
  values: Filters,
) {
  const page = values.page ?? 1,
    pageSize = values.pageSize ?? 20;
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    invalid();
  for (const key of ['from', 'to'] as const) {
    const value = values[key];
    if (
      value !== undefined &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      invalid();
  }
  if (values.from && values.to && values.from > values.to) invalid();
  if (
    values.status &&
    !['up', 'down', 'flat', 'waiting', 'insufficient', 'unavailable'].includes(
      values.status,
    )
  )
    invalid();
  if (
    values.q !== undefined &&
    (typeof values.q !== 'string' || values.q.length > 500)
  )
    invalid();
  const items: NonNullable<ReturnType<typeof resultSummary>>[] = [],
    query = (values.q || '').trim().toLowerCase();
  for (let offset = 0; ; offset += 100) {
    const rows = await service
      .repo('nrTasks')
      .find({ filter: { projectId: project }, sort: 'id', limit: 100, offset });
    for (const row of rows) {
      const task = row.toJSON(),
        item = resultSummary(task, service.effectPages(projectWork(task)));
      if (!item || (values.status && item.status !== values.status)) continue;
      if (
        query &&
        ![item.title, `T-${item.taskNo}`, ...item.pages]
          .join(' ')
          .toLowerCase()
          .includes(query)
      )
        continue;
      const date = item.occurredAt?.slice(0, 10);
      if (
        (values.from || values.to) &&
        (!date ||
          (values.from && date < values.from) ||
          (values.to && date > values.to))
      )
        continue;
      items.push(item);
    }
    if (rows.length < 100) break;
  }
  items.sort(
    (a, b) =>
      (b.occurredAt || '').localeCompare(a.occurredAt || '') ||
      a.taskId.localeCompare(b.taskId),
  );
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
  };
}
export async function readResult(
  service: Service,
  project: string,
  values: { taskId: string; day?: number },
) {
  if (values.day !== undefined && ![7, 28].includes(values.day)) invalid();
  const task = await service.task(project, String(values.taskId)),
    work = projectWork(task),
    pages = service.effectPages(work);
  const summary = resultSummary(task, pages);
  if (!summary)
    throw Object.assign(
      new Error(systemMessageText('strategy.opportunityNotFound')),
      { status: 404 },
    );
  const state = (await service.snapshot(`strategy:${project}`)) || {
    revision: 0,
  };
  const followUps = [
    ...(state.resultOpportunities || [])
      .filter((o) => o.resultSource.taskId === String(task.id))
      .map((o) => ({ kind: 'opportunity', id: o.id, title: o.title })),
    ...(state.proposals || [])
      .filter((p) => p.taskId && p.resultSource?.taskId === String(task.id))
      .map((p) => ({ kind: 'task', id: String(p.taskId), title: p.title })),
  ];
  const receipt = work.receipt as { note?: string } | null;
  return {
    task: {
      id: String(task.id),
      no: summary.taskNo,
      title: task.title,
      state: summary.taskState,
      closed: summary.closed,
      simulated: summary.simulated,
      summary: (
        work.release?.note ||
        receipt?.note ||
        work.results.filter(Boolean).at(-1)?.content ||
        ''
      ).slice(0, 600),
    },
    taskRevision: work.revision,
    observeFrom: work.observeFrom || null,
    pages,
    results: work.observation?.results || [],
    followUps,
    strategyRevision: state.revision,
  };
}
