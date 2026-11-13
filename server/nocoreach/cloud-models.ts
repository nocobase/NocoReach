import type { OnlineModel } from '../../shared/online-agent.js';
import type { LegacyDatabase } from './legacy/database.js';

/**
 * Cloud models by the work they do (Agent › Who does the work). Each row picks its own model, as models are good at
 * different things (2026-11-13 user decision, replacing Editing and suggestions sharing the daily analysis's model):
 * Daily analysis runs on the Agents plugin's default chat model, the chat panel on its agent's own model, and Editing
 * and suggestions on the model kept here. Like the chat panel's, the choice is application-wide and empty until
 * someone makes it, which leaves the work on the default chat model.
 */
export const EDITING_MODEL_KEY = 'editing-suggestions:model';

/**
 * The model calls of Daily analysis: the analysis with its custom rules, the weekly project knowledge check with its
 * topic suggestions, and the automatic mapping of sources. Every other call (`OnlineProvider.complete` or `.stream`)
 * is one a person asks for on a page and is Editing and suggestions': rewriting a selected passage in the review
 * editor (article-rewrite), New task › Organize with AI (task-draft), Keywords' AI suggestions (keyword-seeds,
 * keyword-curate, keyword-names), suggested competitors (competitor-suggest), Knowledge › Add (knowledge-suggest),
 * Project knowledge › Generate (memory-draft), Analysis rules' proposals and new rules (analysis-rules-propose,
 * analysis-rule-draft) and New playbook's draft. A new scheduled or background use belongs in this list.
 */
const ANALYSIS_OPERATIONS: ReadonlySet<string> = new Set([
  'daily-report',
  'daily-judge',
  'daily-judge-many',
  'daily-rewrite',
  'analysis-rule-evaluate',
  'memory-check',
  'memory-topics',
  'content-source-map',
]);

export type CloudModelWork = 'analysis' | 'editing';

export const cloudModelWork = (operation?: string): CloudModelWork =>
  operation && ANALYSIS_OPERATIONS.has(operation) ? 'analysis' : 'editing';

/** Editing and suggestions' own model, kept with the application's other settings (`nrSnapshots`). */
export class EditingModel {
  constructor(private readonly db: LegacyDatabase) {}

  async get(): Promise<OnlineModel | null> {
    const row = await this.db
      .getRepository('nrSnapshots')
      .findOne({ filter: { key: EDITING_MODEL_KEY } });
    const value = (row?.get('payload') as { model?: OnlineModel | null } | null)
      ?.model;
    return value?.modelService && value.model
      ? { modelService: value.modelService, model: value.model }
      : null;
  }

  /** Null goes back to the default chat model. The caller checks that the model can answer first. */
  async set(model: OnlineModel | null, by: string) {
    const repo = this.db.getRepository('nrSnapshots');
    const payload = {
      model,
      changedAt: new Date().toISOString(),
      changedBy: by,
    };
    const row = await repo.findOne({ filter: { key: EDITING_MODEL_KEY } });
    if (row) await repo.update({ filterByTk: row.id, values: { payload } });
    else await repo.create({ values: { key: EDITING_MODEL_KEY, payload } });
  }
}
