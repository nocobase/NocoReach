import { systemMessageText } from '../../../shared/i18n/messages.js';
import {
  safeConclusion,
  matchesObservation,
  metricValues,
} from '../../../shared/result-comparison.js';
import { CHECKPOINTS, shift } from './effect.js';
import { projectWork, taskStanding, type Work } from './model.js';

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
type Phase = 'live' | 'delivered';
type Filters = {
  page?: number;
  pageSize?: number;
  range?: string;
  from?: string;
  to?: string;
  status?: string;
  q?: string;
  order?: string;
};
const STATUSES = [
  'up',
  'down',
  'flat',
  'waiting',
  'insufficient',
  'unavailable',
];
const PHASES = ['delivered'];
const invalid = (): never => {
  throw Object.assign(
    new Error(systemMessageText('strategy.checkInputLength')),
    { status: 400 },
  );
};
const calendarDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const latestDate = (dates: (string | undefined)[]) =>
  dates
    .filter(
      (date): date is string =>
        typeof date === 'string' && Number.isFinite(Date.parse(date)),
    )
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

/**
 * Whether a task produced an outcome, the only tasks Results lists or counts (2026-10-23 user decision: "it never
 * finished, so where would an outcome come from?"): its change went live, or its delivery finished (done, or its
 * execution recorded), even if archived afterwards. Cancelled tasks that never went live, work archived before it
 * finished (including the old-workflow archive), and work still waiting for review, approval or publishing stay in
 * Tasks. Simulated work (the demo install, a simulated release) follows the same rule and is marked as simulated.
 */
export function hasOutcome(task: Task, work: Work = projectWork(task)) {
  if (work.observeFrom || work.release?.liveAt) return true;
  return taskStanding(work) === 'done';
}

export function resultSummary(task: Task, pages: string[]) {
  const work = projectWork(task),
    results = work.observation?.results || [];
  if (!hasOutcome(task, work)) return null;
  const artifacts = work.results.filter(
    (artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact),
  );
  const receipt = work.receipt as { note?: string; recordedAt?: string } | null;
  const candidate = [...results].sort((a, b) => b.day - a.day)[0] || null;
  // Live once the observe stage started; everything else listed (research, documents, replies) was delivered without
  // a page to watch.
  const phase: Phase = work.observeFrom ? 'live' : 'delivered';
  // The next checkpoint still to come and the day its data is expected (about three days after its window ends, as
  // the result drawer estimates).
  const checked = new Set(
      results
        .filter((r) => matchesObservation(r, work.observeFrom))
        .map((r) => r.day),
    ),
    nextDay =
      work.observeFrom &&
      Number.isFinite(Date.parse(work.observeFrom)) &&
      pages.length
        ? (CHECKPOINTS.find((day) => !checked.has(day)) ?? null)
        : null;
  const latest =
    candidate && matchesObservation(candidate, work.observeFrom)
      ? candidate
      : null;
  const history = work.history as { action: string; at?: string }[];
  const dates = [
    work.observeFrom,
    work.release?.liveAt,
    receipt?.recordedAt,
    latestDate(
      history
        .filter((h) =>
          ['recordExecution', 'confirmPublish', 'live'].includes(h.action),
        )
        .map((h) => h.at),
    ),
    latestDate(artifacts.map((a) => a.createdAt)),
  ].filter(
    (date): date is string =>
      typeof date === 'string' && Number.isFinite(Date.parse(date)),
  );
  return {
    taskId: String(task.id),
    taskNo: task.evidence?.no || null,
    title: task.title,
    taskState: taskStanding(work),
    // Stopped after going live; archived after it finished.
    closed: Boolean(work.cancelledAt),
    archived: Boolean(work.archivedAt && !work.cancelledAt),
    phase,
    nextDay,
    nextDate: nextDay
      ? shift(
          new Date(work.observeFrom!).toISOString().slice(0, 10),
          nextDay + 3,
        )
      : null,
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
type Summary = NonNullable<ReturnType<typeof resultSummary>>;
// Every result of the project, newest first (bounded pages; the task table is per project and small).
async function summaries(service: Service, project: string) {
  const items: Summary[] = [];
  for (let offset = 0; ; offset += 100) {
    const rows = await service
      .repo('nrTasks')
      .find({ filter: { projectId: project }, sort: 'id', limit: 100, offset });
    for (const row of rows) {
      const task = row.toJSON(),
        item = resultSummary(task, service.effectPages(projectWork(task)));
      if (item) items.push(item);
    }
    if (rows.length < 100) break;
  }
  return items.sort(
    (a, b) =>
      (b.occurredAt || '').localeCompare(a.occurredAt || '') ||
      a.taskId.localeCompare(b.taskId),
  );
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
  // With `range` the list covers the dashboard's period (custom ranges read `from`/`to` as its ends); without it,
  // `from`/`to` filter the date as before.
  const window = values.range !== undefined ? boardWindow(values) : null;
  if (!window) {
    for (const key of ['from', 'to'] as const) {
      const value = values[key];
      if (value !== undefined && !calendarDate(value)) invalid();
    }
    if (values.from && values.to && values.from > values.to) invalid();
  }
  // All time has no bounds: undated records stay in, as on the dashboard.
  const from = window ? window.start : values.from,
    to = window ? (window.start ? window.end : undefined) : values.to;
  // A status describes a live result; work that is not live is filtered by its phase, as its tag shows.
  if (values.status && ![...STATUSES, ...PHASES].includes(values.status))
    invalid();
  if (values.order !== undefined && !['asc', 'desc'].includes(values.order))
    invalid();
  if (
    values.q !== undefined &&
    (typeof values.q !== 'string' || values.q.length > 500)
  )
    invalid();
  const query = (values.q || '').trim().toLowerCase();
  const items = (await summaries(service, project)).filter((item) => {
    if (
      values.status &&
      (PHASES.includes(values.status)
        ? item.phase !== values.status
        : item.phase !== 'live' || item.status !== values.status)
    )
      return false;
    if (
      query &&
      ![item.title, `T-${item.taskNo}`, ...item.pages]
        .join(' ')
        .toLowerCase()
        .includes(query)
    )
      return false;
    const date = item.occurredAt?.slice(0, 10);
    return !(
      (from || to) &&
      (!date || (from && date < from) || (to && date > to))
    );
  });
  // Newest first by default; oldest first on request. Records without a date stay last either way.
  if (values.order === 'asc')
    items.sort(
      (a, b) =>
        Number(!a.occurredAt) - Number(!b.occurredAt) ||
        (a.occurredAt || '').localeCompare(b.occurredAt || '') ||
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
      archived: summary.archived,
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

// Results dashboard (/results): only the project's own work — what went live in the period and how the pages it
// changed moved afterwards. Site-wide metrics stay on 洞察 and the data pages (user decision, 2026-10-16).
const BOARD_RANGES = ['28', '90', '12m', 'all', 'custom'];
// The same windows as the data pages' picker: N days ending today, or calendar months back from today (UTC, the day
// the results list filters by).
export function boardWindow(
  values: { range?: string; from?: string; to?: string },
  today = new Date().toISOString().slice(0, 10),
): { start: string | null; end: string } {
  const range = values.range ?? '90';
  if (!BOARD_RANGES.includes(range)) invalid();
  if (range === 'all') return { start: null, end: today };
  if (range === 'custom') {
    if (
      !calendarDate(values.from) ||
      !calendarDate(values.to) ||
      values.from > values.to ||
      values.to > today
    )
      invalid();
    return { start: values.from!, end: values.to! };
  }
  if (range.endsWith('m')) {
    const start = new Date(Date.parse(`${shift(today, 1)}T00:00:00Z`)),
      day = start.getUTCDate();
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - parseInt(range));
    start.setUTCDate(
      Math.min(
        day,
        new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
        ).getUTCDate(),
      ),
    );
    return { start: start.toISOString().slice(0, 10), end: today };
  }
  return { start: shift(today, 1 - Number(range)), end: today };
}
// Results that went down, then checks still to come, then the other live work, then deliveries.
function attentionRank(item: Summary) {
  if (item.phase === 'live' && item.status === 'down') return 0;
  if (item.phase === 'live' && item.nextDay) return 1;
  if (item.phase === 'live') return 2;
  return 3;
}
export async function resultBoard(
  service: Service,
  project: string,
  values: { range?: string; from?: string; to?: string },
) {
  const window = boardWindow(values);
  const inWindow = (item: Summary) => {
    if (!window.start) return true;
    const date = item.occurredAt?.slice(0, 10);
    return Boolean(date && date >= window.start && date <= window.end);
  };
  const items = (await summaries(service, project)).filter(inWindow);
  const live = items.filter((item) => item.phase === 'live');
  const count = (list: Summary[], test: (item: Summary) => boolean) =>
    list.filter(test).length;
  // Each change adds its latest check's before and after, over the same number of days; a source whose days are not
  // all covered is left out rather than counted as zero.
  const total = (source: 'gsc' | 'ga4', metric: string) => {
    let before = 0,
      after = 0,
      tasks = 0;
    for (const item of live) {
      if (!item.latest) continue;
      const v = metricValues(item.latest, source, metric);
      if (v.before === null || v.after === null) continue;
      before += v.before;
      after += v.after;
      tasks++;
    }
    return tasks ? { before, after, tasks } : null;
  };
  return {
    window,
    total: items.length,
    counts: {
      live: live.length,
      delivered: count(items, (item) => item.phase === 'delivered'),
      up: count(live, (item) => item.status === 'up'),
      down: count(live, (item) => item.status === 'down'),
      flat: count(live, (item) => item.status === 'flat'),
      insufficient: count(live, (item) => item.status === 'insufficient'),
      waiting: count(live, (item) => item.status === 'waiting'),
    },
    totals: { clicks: total('gsc', 'clicks'), views: total('ga4', 'views') },
    changes: live.slice(0, 10).map((item) => {
      const metric = item.latest?.primary ?? null,
        v =
          item.latest && metric
            ? metricValues(
                item.latest,
                metric === 'clicks' ? 'gsc' : 'ga4',
                metric,
              )
            : null;
      return {
        taskId: item.taskId,
        taskNo: item.taskNo,
        title: item.title,
        liveDate: item.occurredAt,
        status: item.status,
        day: item.latest?.day ?? null,
        metric: v ? metric : null,
        before: v?.before ?? null,
        after: v?.after ?? null,
        percent: v?.percent ?? null,
        nextDay: item.nextDay,
        nextDate: item.nextDate,
      };
    }),
    attention: items
      .map((item, index) => ({ item, index, rank: attentionRank(item) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .slice(0, 10)
      .map(({ item }) => item),
  };
}
