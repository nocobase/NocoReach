import type { EffectResult } from '../effect-model.js';
export type {ResultSource} from '../../../shared/result-source.js';
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
