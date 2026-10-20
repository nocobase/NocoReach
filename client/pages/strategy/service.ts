import { nocobaseClient as api } from '#lib/nocoreach-api';
import { type Evidence } from './model';
export type Context = {
  evidenceToken?: string;
  project: Record<string, unknown>;
  evidence: Evidence;
};
export const request = <T>(
  projectId: number,
  action: string,
  body: object = {},
  signal?: AbortSignal,
) =>
  api.action<T>('nrStrategy', action, {
    method: 'POST',
    body: { ...body, projectId: String(projectId) },
    unwrap: 'data',
    ...(signal ? { signal } : {}),
  });
export type AnalysisStatus = {
  running: boolean;
  last: {
    at: string;
    ok: boolean;
    errors: string[];
    lastSuccessAt: string | null;
  } | null;
  retry?: { attempt: number; nextAt: string; reason: string } | null;
  runs: {
    at: string;
    trigger: string;
    ok: boolean;
    error?: string;
    items?: number;
    retryable?: boolean;
    failureKind?:
      | 'model_configuration'
      | 'precondition'
      | 'provider_unavailable'
      | 'billing_unknown';
  }[];
  schedule: {
    workflowId: number;
    enabled: boolean;
    cron: string | null;
  } | null;
};
export const analysisRequest = (
  projectId: number,
  action: 'status' | 'run',
  signal?: AbortSignal,
) =>
  api.action<AnalysisStatus>('nrAnalysis', action, {
    method: 'POST',
    body: { projectId },
    unwrap: 'data',
    ...(signal ? { signal } : {}),
  });
// 让 AI 现在判断: one change of the latest analysis judged on request.
// Every change of the latest analysis left without a verdict, judged in one call (洞察 asks once when it sees them).
export const judgeMissing = (projectId: number) =>
  api.action<{ judged: number }>('nrAnalysis', 'judgeMissing', {
    method: 'POST',
    body: { projectId },
    unwrap: 'data',
  });
export const judgeSignal = (projectId: number, signalKey: string) =>
  api.action<{ verdict: 'do' | 'watch' | 'skip'; reason: string } | null>(
    'nrAnalysis',
    'judge',
    { method: 'POST', body: { projectId, signalKey }, unwrap: 'data' },
  );
