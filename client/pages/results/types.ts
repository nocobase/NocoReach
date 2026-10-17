import type { EffectResult } from '../effect-model.js';
export type { ResultSource } from '../../../shared/result-source.js';
// live: the observe stage started; pendingLive: its flow still goes live; delivered: no page to watch.
export type ResultPhase = 'live' | 'pendingLive' | 'delivered';
export type ResultSummary = {
  taskId: string;
  taskNo: number | null;
  title: string;
  taskState: string;
  closed: boolean;
  phase: ResultPhase;
  nextDay: number | null;
  nextDate: string | null;
  simulated: boolean;
  occurredAt: string | null;
  pages: string[];
  status: string;
  latest: EffectResult | null;
};
export type ResultDetail = {
  task: {
    id: string;
    no: number | null;
    title: string;
    state: string;
    closed: boolean;
    simulated: boolean;
    summary: string;
  };
  taskRevision: number;
  observeFrom: string | null;
  pages: string[];
  results: EffectResult[];
  followUps: { kind: string; id: string; title: string }[];
  strategyRevision: number;
};
// What nrTaskWork:board returns (server/nocoreach/execution/result-view.ts resultBoard).
export type BoardTotal = { before: number; after: number; tasks: number };
export type BoardChange = {
  taskId: string;
  taskNo: number | null;
  title: string;
  liveDate: string | null;
  status: string;
  day: number | null;
  metric: 'clicks' | 'views' | null;
  before: number | null;
  after: number | null;
  percent: number | null;
  nextDay: number | null;
  nextDate: string | null;
};
export type ResultBoard = {
  window: { start: string | null; end: string };
  total: number;
  counts: {
    live: number;
    pendingLive: number;
    delivered: number;
    up: number;
    down: number;
    flat: number;
    insufficient: number;
    waiting: number;
  };
  totals: { clicks: BoardTotal | null; views: BoardTotal | null };
  changes: BoardChange[];
  attention: ResultSummary[];
};
