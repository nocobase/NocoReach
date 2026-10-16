const HOUR = 3600000;
const WEEK = 7 * 86400000;

export interface RedditPlanEntry {
  term: string;
  status: string;
  attempt: number;
  at: string;
  requestKey?: string;
  runId?: string;
  queriedAt?: string;
  through?: string;
  diagnostic?: { reason: string; retryable: boolean; billing?: string };
}

interface ScheduledState {
  plan?: { entries: RedditPlanEntry[] };
  lastRun?: { at: string; ok: boolean } | null;
}

// Pure scheduling shared by collection, status, views and data health. Polling never writes.
export function retryAt(entry: RedditPlanEntry): string {
  return new Date(
    Date.parse(entry.at) + (entry.attempt === 1 ? HOUR : 6 * HOUR),
  ).toISOString();
}

export function canRecheckConfiguration(
  entry: RedditPlanEntry,
  now = Date.now(),
): boolean {
  return (
    entry.status === 'failed' &&
    entry.attempt < 3 &&
    entry.diagnostic?.billing === 'known' &&
    ['credentials', 'parameters', 'providerBudget'].includes(
      entry.diagnostic.reason,
    ) &&
    Date.parse(retryAt(entry)) <= now
  );
}

export function termNextAt(entry: RedditPlanEntry): string | null {
  if (entry.status === 'pending') return entry.at;
  if (entry.status === 'budget') return entry.at;
  if (
    entry.status === 'failed' &&
    entry.diagnostic?.retryable &&
    entry.attempt < 3
  )
    return retryAt(entry);
  return null;
}

export function redditSchedule(
  state?: ScheduledState | null,
  now = Date.now(),
) {
  const plan = state?.plan;
  if (plan && !plan.entries.every((e) => e.status === 'completed')) {
    const next = plan.entries.map(termNextAt).filter(Boolean).sort()[0];
    return {
      kind: next
        ? plan.entries.some((e) => e.status === 'budget')
          ? 'budget'
          : 'retry'
        : 'attention',
      nextAt: next || null,
      due: Boolean(next && Date.parse(next) <= now),
    };
  }
  // Old failures have no trustworthy billing evidence. Never turn them into paid retries.
  if (!plan && state?.lastRun && !state.lastRun.ok)
    return { kind: 'attention', nextAt: null, due: false };
  const nextAt = state?.lastRun
    ? new Date(Date.parse(state.lastRun.at) + WEEK).toISOString()
    : null;
  return { kind: 'weekly', nextAt, due: !nextAt || Date.parse(nextAt) <= now };
}
