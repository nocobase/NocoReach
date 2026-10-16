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

/** Page-local state: never persists across the authenticated route subtree or a changed request. */
export function useScheduleResource<T>(path: string) {
  const api = useApiClient();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    key: string;
    path: string;
    data?: T;
    error?: unknown;
  }>();
  const key = `${path}:${version}`;
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
