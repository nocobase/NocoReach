// Claude Code adapter. Adapted from nocobase/NocoProject nocoproject-cli (src/daemon/adapters/claude.ts and spawn.ts,
// commit a023441): stream-json launch, line parsing, process-group kill. NocoReach restricts tools per step instead of
// letting the agent run git: plan steps cannot edit or run commands, build steps can only read and write files.
import { spawn } from 'node:child_process';
export type AgentEvent = { type: 'text' | 'tool' | 'status' | 'error'; text: string; at: string };
export type ClaudeResult = { ok: boolean; summary: string; error?: string };
const now = () => new Date().toISOString();
const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
// Env keys never passed to the agent: our key, and markers that make Claude Code think it is nested in another session.
const STRIPPED_ENV = ['NOCOREACH_AGENT_KEY', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'];
function toolLine(name: string, input: any): string {
  const v = isObj(input) ? input : {};
  const target = v.file_path || v.path || v.pattern || v.url || v.command || '';
  return `${name}${target ? ' ' + String(target) : ''}`.slice(0, 300);
}
export function claudeArgs(mode: 'plan' | 'build', addDirs: string[] = [], pluginDirs: string[] = []): string[] {
  const deny = mode === 'plan' ? ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash'] : ['Bash', 'NotebookEdit'];
  // acceptEdits only auto-approves edits inside the task's worktree (cwd); anything else needs permission and is denied below.
  // Extra folders Claude may read (the project's 知识库 and Skills, outside the repository) and the Skills plugin for this
  // run come before the variadic tool list.
  return ['-p', '--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose', '--permission-mode', mode === 'build' ? 'acceptEdits' : 'default', ...addDirs.flatMap(d => ['--add-dir', d]), ...pluginDirs.flatMap(d => ['--plugin-dir', d]), '--disallowedTools', ...deny];
}
// Parses one stream-json line into progress events; `state` collects the final text and errors.
export function parseLine(line: string, state: { last?: string; result?: string; error?: boolean; errors: string[]; done?: boolean }): AgentEvent[] {
  let msg: unknown; try { msg = JSON.parse(line); } catch { return []; }
  if (!isObj(msg)) return [];
  const at = now();
  if (msg.type === 'system' && msg.subtype === 'init') return [{ type: 'status', text: `Claude Code 已启动${msg.model ? `（${msg.model}）` : ''}`, at }];
  if (msg.type === 'assistant') {
    const out: AgentEvent[] = [];
    for (const b of Array.isArray(msg.message?.content) ? msg.message.content : []) {
      if (!isObj(b)) continue;
      if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) { state.last = b.text; out.push({ type: 'text', text: b.text.trim().slice(0, 500), at }); }
      if (b.type === 'tool_use') out.push({ type: 'tool', text: toolLine(String(b.name || 'tool'), b.input), at });
    }
    return out;
  }
  if (msg.type === 'result') {
    state.done = true; state.result = typeof msg.result === 'string' ? msg.result : undefined;
    state.error = msg.is_error === true || (msg.subtype && msg.subtype !== 'success');
    if (state.error) { state.errors.push(...(Array.isArray(msg.errors) ? msg.errors.map(String) : []), String(msg.subtype || '')); return [{ type: 'error', text: state.errors.filter(Boolean).join('; ').slice(0, 500) || 'Claude Code 报告了错误', at }]; }
  }
  return [];
}
export async function detectClaude(command = process.env.NOCOREACH_CLAUDE_PATH || 'claude'): Promise<string | null> {
  return new Promise(resolve => { const c = spawn(command, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] }); let out = ''; c.stdout.on('data', d => out += d); c.on('error', () => resolve(null)); c.on('close', code => resolve(code === 0 ? out.trim().split(/\s+/)[0] : null)); });
}
// Runs Claude Code once in `cwd`. `onEvent` receives progress; the returned `kill` stops the whole process group.
export function runClaude(opts: { cwd: string; prompt: string; mode: 'plan' | 'build'; onEvent: (e: AgentEvent) => void; command?: string; addDirs?: string[]; pluginDirs?: string[] }): { result: Promise<ClaudeResult>; kill: () => void } {
  const env: NodeJS.ProcessEnv = { ...process.env, PWD: opts.cwd };
  for (const k of STRIPPED_ENV) delete env[k];
  const child = spawn(opts.command || process.env.NOCOREACH_CLAUDE_PATH || 'claude', claudeArgs(opts.mode, opts.addDirs || [], opts.pluginDirs || []), { cwd: opts.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
  const state: { last?: string; result?: string; error?: boolean; errors: string[]; done?: boolean } = { errors: [] };
  let buffer = '', stderr = '';
  child.stdin.on('error', () => undefined);
  child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: opts.prompt }] } }) + '\n');
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk; let i: number;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1);
      if (!line) continue;
      for (const e of parseLine(line, state)) opts.onEvent(e);
      // Headless runs may ask for permission; deny anything outside the allowed tools instead of hanging.
      try { const m = JSON.parse(line); if (m?.type === 'control_request' && m.request_id) child.stdin.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id, response: { behavior: 'deny', message: '这一步不允许此操作' } } }) + '\n'); } catch { /* not json */ }
      if (state.done) child.stdin.end();
    }
  });
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (c: string) => { stderr = (stderr + c).slice(-4000); });
  const kill = () => { try { if (child.pid) process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ } };
  const result = new Promise<ClaudeResult>(resolve => {
    child.on('error', e => resolve({ ok: false, summary: '', error: `无法启动 Claude Code：${e.message}` }));
    child.on('close', code => {
      const ok = code === 0 && state.done === true && !state.error;
      resolve({ ok, summary: (state.result || state.last || '').trim(), ...(ok ? {} : { error: [...state.errors, stderr.trim()].filter(Boolean).join('\n').slice(0, 1000) || `Claude Code 退出码 ${code}` }) });
    });
  });
  return { result, kill };
}
