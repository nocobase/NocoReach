import type { TaskData } from './task-execution-types.js';

type Operation = {
  revision: number;
  requestId: string;
  command: string;
} & Record<string, unknown>;
type Call = (action: 'get' | 'advance', body?: object) => Promise<TaskData>;

// Lives only in the open dialog. An uncertain write keeps its exact request until
// reconciliation or an idempotent replay succeeds; creating is never repeated here.
export class CreatedTaskStarter {
  data?: TaskData;
  pending?: Operation;
  private assignmentSaved = false;
  constructor(private readonly call: Call) {}

  private async advance(command: string, body: object) {
    this.pending ??= {
      revision: this.data!.work.revision,
      requestId: crypto.randomUUID(),
      command,
      ...body,
    };
    try {
      this.data = await this.call('advance', this.pending);
      this.pending = undefined;
      return this.data;
    } catch (error) {
      const status = (error as { status?: number })?.status;
      // Validation/access/conflict responses did not commit this operation.
      if (status && [400, 401, 403, 404, 409, 422, 429].includes(status))
        this.pending = undefined;
      try {
        this.data = await this.call('get');
      } catch {
        /* Keep the task link and frozen request. */
      }
      throw error;
    }
  }

  async start(agentId: string | null, playbookId: string) {
    if (this.pending) {
      const assigning = this.pending.command === 'setAgent';
      await this.advance(this.pending.command, this.pending);
      if (assigning) this.assignmentSaved = true;
    } else this.data = await this.call('get');
    const data = this.data!;
    if (
      data.work.cancelledAt ||
      data.work.archivedAt ||
      data.work.stage === 'done'
    )
      return data;
    if (
      data.runs.some(
        (run) => run.status === 'queued' || run.status === 'running',
      )
    )
      return data;
    if (!this.assignmentSaved && !data.work.flow) {
      if ((data.work.agentId || null) !== agentId)
        await this.advance('setAgent', { agentId });
      this.assignmentSaved = true;
    }
    if (this.data!.work.flow) {
      const w = this.data!.work,
        index = w.stageIndex || 0;
      if (w.flow!.stages[index]?.kind === 'agent' && !w.results[index])
        return this.advance('retryStage', {
          stageKey: w.flow!.stages[index].key,
        });
      return this.data!;
    }
    return this.advance('startTask', { playbookId });
  }
}

export function creationStartState(data?: TaskData) {
  if (data?.runs.some((run) => run.status === 'running')) return 'running';
  if (data?.runs.some((run) => run.status === 'queued')) return 'queued';
  if (data?.work.cancelledAt || data?.work.archivedAt) return 'closed';
  if (data?.work.stage === 'done') return 'completed';
  if (data?.work.flow?.stages[data.work.stageIndex || 0]?.kind === 'review')
    return 'review';
  return 'waiting';
}
