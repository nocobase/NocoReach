import type { EffectResult } from '../effect-model.js';
export type { ResultSource } from '../../../shared/result-source.js';
// Results lists only tasks with an outcome (server/nocoreach/execution/result-view.ts `hasOutcome`): live, the
// observe stage started; delivered, finished without a page to watch.
export type ResultPhase = 'live' | 'delivered';
export type ResultSummary = {
  taskId: string;
  taskNo: number | null;
  title: string;
  /** Where its task stands: done, or closed once stopped after going live. */
  taskState: string;
  closed: boolean;
  /** Archived after it finished. */
  archived: boolean;
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
    archived: boolean;
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
