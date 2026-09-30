/** M0 transport proof only: not a mounted API, scheduler, ACL or persistent Run service. */
export interface RunRequest {
  protocolVersion: 1;
  projectId: string;
  taskId: string;
  runId: string;
  planVersion: number;
  stepId: string;
  prompt: string;
}
export interface RunReply {
  request: RunRequest;
  content: string;
  exitCode: number;
}
export interface Candidate {
  runId: string;
  content: string;
  review: 'pending';
}
export class EchoReceiver {
  private accepted = new Map<string, Candidate>();
  constructor(private readonly expected: RunRequest) {}
  receive(reply: RunReply, currentPlanVersion: number, cancelled = false): Candidate {
    if (cancelled) throw new Error('RUN_CANCELLED');
    for (const key of ['protocolVersion', 'projectId', 'taskId', 'runId', 'planVersion', 'stepId', 'prompt'] as const) {
      if (reply.request[key] !== this.expected[key]) throw new Error('CONTEXT_MISMATCH');
    }
    if (currentPlanVersion !== this.expected.planVersion) throw new Error('STALE_PLAN');
    if (reply.exitCode !== 0 || !reply.content?.trim()) throw new Error('EXECUTION_FAILED');
    const existing = this.accepted.get(reply.request.runId);
    if (existing) {
      if (existing.content !== reply.content) throw new Error('IDEMPOTENCY_CONFLICT');
      return { ...existing };
    }
    const candidate: Candidate = { runId: reply.request.runId, content: reply.content, review: 'pending' };
    this.accepted.set(candidate.runId, candidate);
    return { ...candidate };
  }
}
