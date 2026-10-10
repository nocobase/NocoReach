// @ts-nocheck
import { randomUUID } from 'node:crypto';
/** A plugin boundary fake. Business tests never implement the retired HTTP/lease protocol. */
export function fakeAgents() {
  const records = new Map(), bindings = new Map();
  const agent = { id: 'shared-agent', name: 'Team Agent', type: 'runner', access: 'everyone' };
  const definitions = new Map([[agent.id, agent]]);
  return {
    records, agent, definitions, subjects: { register: b => { bindings.set(b.kind, b); return () => bindings.delete(b.kind); } },
    mounts: { register: () => () => {} },
    briefs: { sections: { register: () => () => {} } },
    actions: { provide: () => () => {} }, gate: { set: () => () => {} }, presets: { register: () => () => {} },
    tx: { read: () => ({}) }, events: { emit() {} },
    agents: { listActive: async () => [...definitions.values()].filter(a => !a.archivedAt), get: async id => definitions.get(id), findWorkable: async (_conn, id) => { const a = definitions.get(id); return a?.archivedAt ? undefined : a; }, mayInvoke: () => true },
    availability: async (_conn, choices) => new Map(choices.map(a => [a.id, { online: a.online !== false }])),
    runs: {
      enqueue: async (input, outer) => {
        if (!outer?.conn || typeof outer.emit !== 'function') throw Error('Task enqueue must join the business transaction');
        const id = randomUUID(); records.set(id, { ...input, id, status: 'queued', summary: null });
        outer.emit({ type: 'run.enqueued', runId: id });
        return { outcome: 'created', runId: id };
      },
      get: async id => records.get(id),
      detail: async id => records.get(id),
      withdrawQueued: async ({ subject }, outer) => {
        if (!outer?.conn) throw Error('Withdrawal must join the business transaction');
        const queued = [...records.values()].filter(r => r.subject.kind === subject.kind && r.subject.id === subject.id && r.status === 'queued');
        for (const run of queued) run.status = 'cancelled';
        return queued;
      },
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
