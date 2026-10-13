import type { EffectResult } from '../server/nocoreach/execution/effect.js';
export type ResultSource = {
  taskId: string;
  observeFrom: string | null;
  day: 7 | 28 | null;
  observation: EffectResult | null;
  pages: string[];
  capturedAt: string;
};
