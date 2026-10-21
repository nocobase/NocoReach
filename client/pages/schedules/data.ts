import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useEffect, useState } from 'react';

export interface Schedule {
  id: string;
  key: string;
  title: string;
  description?: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  lifecycleState: string;
  scheduleStatus: string;
  targetState: string;
  nextRunAt?: string;
  lastRunAt?: string;
  runCount: number;
  completedCount: number;
}
export interface Occurrence {
  id: string;
  status: string;
  reason?: string;
  startedAt: string;
  finishedAt?: string;
  resultSummary?: Record<string, unknown>;
}
export interface ScheduleList {
  data: Schedule[];
  meta: { page: number; pageSize: number; total: number };
}
export interface History {
  data: Occurrence[];
  meta: { nextPageToken?: string };
}

/** The only schedule people may retime and run by hand here; the others are shown read-only. */
export const ANALYSIS_SCHEDULE = 'nocoreach.daily-analysis';

/** "HH:mm" of a daily cron such as `0 9 * * *`, or null for any other schedule. */
export function dailyTime(cron: string): string | null {
  const fields = cron.trim().split(/\s+/);
  const [minute, hour, ...rest] =
    fields.length === 6 ? fields.slice(1) : fields;
  if (
    rest.length !== 3 ||
    rest.some((field) => field !== '*') ||
    !/^\d{1,2}$/.test(minute ?? '') ||
    !/^\d{1,2}$/.test(hour ?? '')
  )
    return null;
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

export interface ProjectOutcome {
  id: string;
  ok?: boolean;
  items?: number;
  skipped?: string;
  error?: string;
}
/** The per-project outcomes a daily analysis run reports, in its order; anything else is ignored. */
export function projectOutcomes(summary: unknown): ProjectOutcome[] {
  const projects = (summary as { projects?: unknown } | undefined)?.projects;
  if (!projects || typeof projects !== 'object' || Array.isArray(projects))
    return [];
  return Object.entries(projects).flatMap(([id, value]) => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    return [
      {
        id,
        ok: typeof item.ok === 'boolean' ? item.ok : undefined,
        items: typeof item.items === 'number' ? item.items : undefined,
        skipped: typeof item.skipped === 'string' ? item.skipped : undefined,
        error: typeof item.error === 'string' ? item.error : undefined,
      },
    ];
  });
}

/**
 * Page-local state: never persists across the authenticated route subtree or a changed request. A changed `stamp`
 * reads again, for a request whose result follows another one's.
 */
export function useScheduleResource<T>(path: string, stamp = 0) {
  const api = useApiClient();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    key: string;
    path: string;
    data?: T;
    error?: unknown;
  }>();
  const key = `${path}:${version}:${stamp}`;
  useEffect(() => {
    const controller = new AbortController();
    void api.request<T>({ path, signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setState({ key, path, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState((current) => ({
            key,
            path,
            error,
            ...(errorKind(error) === 'failed' && current?.path === path
              ? { data: current.data }
              : {}),
          }));
      },
    );
    return () => controller.abort();
  }, [api, key, path]);
  return {
    data: state?.path === path ? state.data : undefined,
    refreshing: state?.key !== key,
    replace: (data: T) => setState({ key, path, data }),
    error: state?.key === key ? state.error : undefined,
    reload: () => setVersion((current) => current + 1),
  };
}
export function errorKind(error: unknown) {
  const status = error instanceof ApiClientError ? error.status : undefined;
  return status === 401
    ? 'signedOut'
    : status === 403
      ? 'forbidden'
      : status === 404
        ? 'notFound'
        : 'failed';
}
