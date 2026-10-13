import type { EffectResult } from '../effect-model.js';
export type ResultSource = {
  taskId: string;
  observeFrom: string | null;
  day: 7 | 28 | null;
  observation: EffectResult | null;
  pages: string[];
  capturedAt: string;
};
export type ResultSummary = {
  taskId: string;
  taskNo: number | null;
  title: string;
  taskState: string;
  closed: boolean;
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
