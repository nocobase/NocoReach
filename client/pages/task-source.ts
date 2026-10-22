// Where a task came from (2026-10-22 user request): found by the AI (an opportunity from the daily analysis, or a
// change on Insights the person only confirmed) or by a person (handed off from a data page, a new task, a page to
// improve, or created from Results). The person is the one who created the task, who may not be its owner.
// Hand-off tasks carry the source of the task they came from (TaskExecutionService copies it).

export type TaskSource = {
  by: 'ai' | 'person';
  /** The person who found it; absent for older tasks that did not record their creator. */
  name?: string;
  via:
    | 'opportunity'
    | 'change'
    | 'plan'
    | 'dataPage'
    | 'newTask'
    | 'content'
    | 'results'
    | 'other';
  insight?: { id?: string; no?: number };
  /** The page path a person handed the task off from, when recorded. */
  entry?: string;
  /** When it was found: the analysis for the AI, the task's creation for a person. */
  at?: string;
};

type SourceTask = {
  taskKey?: string;
  createdAt?: string;
  evidence?: Record<string, unknown>;
};

export function taskSource(task: SourceTask): TaskSource {
  const e = (task.evidence || {}) as {
      insight?: { id?: unknown; no?: unknown } | null;
      signalKey?: unknown;
      resultSource?: unknown;
      createdBy?: { name?: unknown } | null;
      origin?: unknown;
      source?: unknown;
      goal?: unknown;
      content?: unknown;
      entry?: unknown;
      context?: { capturedAt?: unknown } | null;
    },
    key = String(task.taskKey || ''),
    at = typeof task.createdAt === 'string' ? task.createdAt : undefined;
  const name =
    typeof e.createdBy?.name === 'string' && e.createdBy.name.trim()
      ? e.createdBy.name.trim()
      : undefined;
  const person = (via: TaskSource['via']): TaskSource => ({
    by: 'person',
    via,
    ...(name ? { name } : {}),
    ...(typeof e.entry === 'string' ? { entry: e.entry } : {}),
    ...(at ? { at } : {}),
  });
  // An opportunity made on Results was created by a person, even when handed off as an opportunity.
  if (e.resultSource) return person('results');
  if (e.insight && typeof e.insight.id === 'string') {
    const analysed =
      typeof e.context?.capturedAt === 'string' ? e.context.capturedAt : at;
    return {
      by: 'ai',
      via: 'opportunity',
      insight: {
        id: e.insight.id,
        ...(typeof e.insight.no === 'number' ? { no: e.insight.no } : {}),
      },
      ...(analysed ? { at: analysed } : {}),
    };
  }
  if (typeof e.signalKey === 'string')
    return { by: 'ai', via: 'change', ...(at ? { at } : {}) };
  if (e.origin === 'manual' || e.source === 'manual') return person('newTask');
  if (key.startsWith('content:') || e.content) return person('content');
  if (key.startsWith('strategy:') && e.goal)
    return { by: 'ai', via: 'plan', ...(at ? { at } : {}) };
  if (key.startsWith('strategy:') || e.entry) return person('dataPage');
  return person('other');
}

// The menu title of the page a task was handed off from (the sidebar's `nocoreach.nav.*` copy); the longest path
// that the recorded one contains wins, whatever the application's base path.
const ENTRY_PAGES: [string, string][] = [
  ['/home', 'insights'],
  ['/opportunities', 'opportunities'],
  ['/results', 'results'],
  ['/content', 'pages'],
  ['/website', 'traffic'],
  ['/audit', 'audit'],
  ['/data/github', 'github'],
  ['/data/downloads', 'downloads'],
  ['/seo-opportunities', 'searchPerformance'],
  ['/keywords', 'keywords'],
  ['/research', 'keywords'],
  ['/trends', 'trends'],
  ['/research/domain', 'competitors'],
  ['/ai-search', 'aiSearch'],
  ['/data/community', 'forum'],
  ['/data/hackernews', 'hackerNews'],
  ['/data/reddit', 'reddit'],
  ['/data/x', 'x'],
  ['/data/discord', 'discord'],
  ['/data/slack', 'slack'],
  ['/data/xiaohongshu', 'xiaohongshu'],
  ['/data/bilibili', 'bilibili'],
  ['/data/youtube', 'youtube'],
];
export function entryTitleKey(path?: string): string | undefined {
  if (!path) return undefined;
  const clean = path.replace(/\/+$/, '');
  const match = ENTRY_PAGES.filter(
    ([p]) => clean.endsWith(p) || clean.includes(`${p}/`),
  ).sort((a, b) => b[0].length - a[0].length)[0];
  return match ? `nocoreach.nav.${match[1]}` : undefined;
}
