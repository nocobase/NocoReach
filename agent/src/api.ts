import type { Config } from './config';
export const VERSION = '0.3.0';
// How `start` runs, sent with its calls so the Agent page can show it (background service or a terminal window); other
// commands leave it unset and the server keeps the last value.
let mode: 'service' | 'terminal' | undefined;
export const setMode = (m: 'service' | 'terminal') => { mode = m; };
// The NocoReach server is the application's address including its base path (http://localhost:13000/main); its actions
// answer at /api/nocoreach/<resource>/<action> (NocoBase 3, 2026-10-09; the classic server answered /api/<resource>:<action>).
export const actionUrl = (server: string, action: string) => `${server.replace(/\/+$/, '')}/api/nocoreach/nrAgentDaemon/${action}`;
// The sentence for the user in a failed response: NocoBase 3's { error: { localizedMessage, message } }, or the classic { errors: [...] }.
export const errorMessage = (json: any) => json?.error?.localizedMessage?.message || json?.error?.message || json?.errors?.[0]?.message || '';
// Calls the NocoReach server as this computer (header x-nr-agent-key); results come wrapped in { data }.
export async function call<T>(cfg: Config, action: 'heartbeat' | 'claim' | 'events' | 'finish' | 'watch' | 'preview', body: object, tools: Record<string, string>): Promise<T> {
  const res = await fetch(actionUrl(cfg.server, action), { method: 'POST', headers: { 'content-type': 'application/json', 'x-nr-agent-key': cfg.key }, body: JSON.stringify({ projectId: cfg.projectId, agent: { version: VERSION, tools, ...(mode ? { mode } : {}) }, ...body }), signal: AbortSignal.timeout(30000) });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(errorMessage(json) || `${res.status} ${res.statusText}`), { status: res.status });
  return json.data as T;
}
