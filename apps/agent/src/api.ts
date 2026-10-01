import type { Config } from './config';
export const VERSION = '0.1.0';
// Calls the NocoReach server as this computer (header x-nr-agent-key); NocoBase wraps results in { data }.
export async function call<T>(cfg: Config, action: 'heartbeat' | 'claim' | 'events' | 'finish' | 'watch' | 'preview', body: object, tools: Record<string, string>): Promise<T> {
  const res = await fetch(`${cfg.server.replace(/\/+$/, '')}/api/nrAgentDaemon:${action}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-nr-agent-key': cfg.key }, body: JSON.stringify({ projectId: cfg.projectId, agent: { version: VERSION, tools }, ...body }), signal: AbortSignal.timeout(30000) });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json?.errors?.[0]?.message || `${res.status} ${res.statusText}`), { status: res.status });
  return json.data as T;
}
