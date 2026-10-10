// @ts-nocheck
import { randomUUID } from 'node:crypto';
/** A plugin boundary fake. Business tests never implement the retired HTTP/lease protocol. */
export function fakeAgents() {
  const records = new Map(), bindings = new Map();
  const agent = { id: 'shared-agent', name: 'Team Agent', type: 'runner', access: 'everyone' };
  return {
    records, agent, subjects: { register: b => { bindings.set(b.kind, b); return () => bindings.delete(b.kind); } },
    tx: { read: () => ({}) }, events: { emit() {} },
    agents: { listActive: async () => [agent], get: async () => agent, findWorkable: async () => agent, mayInvoke: () => true },
    availability: async () => new Map([[agent.id, { online: true }]]),
    runs: {
      enqueue: async (input, outer) => {
        if (!outer?.conn || typeof outer.emit !== 'function') throw Error('Task enqueue must join the business transaction');
        const id = randomUUID(); records.set(id, { ...input, id, status: 'queued', summary: null });
        outer.emit({ type: 'run.enqueued', runId: id });
        return { outcome: 'enqueued', runId: id };
      },
      get: async id => records.get(id),
      events: async () => ({ events: [], lastSeq: 0 }),
      cancel: async id => { const r = records.get(id); r.status = 'cancelled'; return r; },
    },
  };
}
export async function selectAgent(f) {
  await f.s.agents.select('1', { revision: 0, agentId: 'shared-agent' }, '1');
  return 'shared-agent';
}
export async function claim(f) {
  const run = f.state.nrSnapshots.find(row => row.key.startsWith('nr-task-run:') && row.payload.status === 'queued')?.payload;
  if (!run) return { run: null };
  f.s.p.agents.records.get(run.pluginRunId).status = 'running';
  await f.s.runtime.sync(run);
  return { run: { ...run, input: JSON.parse(run.input) } };
}
export async function finish(f, result) {
  const run = f.state.nrSnapshots.find(row => row.key.endsWith(result.runId)).payload;
  const response = await f.s.acceptAgentResult('1', run.pluginRunId, result);
  const plugin = f.s.p.agents.records.get(run.pluginRunId);
  plugin.status = 'completed'; plugin.summary = JSON.stringify(result);
  await f.s.runtime.sync(run);
  return response;
}
