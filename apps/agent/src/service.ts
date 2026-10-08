// Background service on macOS (2026-10-08 user feedback: the Agent went offline whenever its terminal window closed or
// the Mac restarted). After NocoProject's `daemon install` (nocoproject-cli, launchd part): a per-user LaunchAgent runs
// `start --service` with the Node, PATH and language of the terminal that installed it, starts it at login and starts it
// again when it stops. Linux (systemd --user) is a later step.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, openSync, readSync, closeSync, realpathSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';
import { HOME } from './config';
import { chinese } from './text';
const BASE = 'com.nocoreach.agent';
// A second Agent home on the same Mac (another project, NOCOREACH_AGENT_HOME) gets its own service.
export const LABEL = HOME === join(homedir(), '.nocoreach-agent') ? BASE : `${BASE}-${createHash('sha256').update(HOME).digest('hex').slice(0, 8)}`;
export const LOG = join(HOME, 'logs', 'agent.log');
export const supported = process.platform === 'darwin';
export const plistPath = (home = homedir()) => join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);
export const installed = () => supported && existsSync(plistPath());
type Run = (cmd: string, args: string[]) => Promise<{ ok: boolean; out: string }>;
const exec: Run = (cmd, args) => new Promise(r => execFile(cmd, args, { timeout: 30000 }, (e, out, err) => r({ ok: !e, out: `${out}${err || (e ? e.message : '')}` })));
const target = () => `gui/${process.getuid?.() ?? 0}`;
const real = (p: string) => { try { return realpathSync(p); } catch { return p; } };
// The Node in PATH that is the same program as this one (e.g. /opt/homebrew/opt/node@22/bin/node rather than the
// versioned Cellar path it resolves to), so a Homebrew upgrade does not break the service.
export function stableNode(execPath: string, path = process.env.PATH || ''): string {
  for (const dir of path.split(delimiter)) { const c = dir && join(dir, 'node'); if (c && c !== execPath && existsSync(c) && real(c) === real(execPath)) return c; }
  return execPath;
}
// What the service needs from this terminal: PATH (Claude Code, git, gh), the language of its messages, and which Agent
// home and Claude Code to use. The connection key stays in config.json and never goes into the service file.
export function serviceEnv(env: NodeJS.ProcessEnv = process.env): [string, string][] {
  const out: [string, string][] = [['PATH', env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin']];
  const lang = env.LANG || (chinese ? 'zh_CN.UTF-8' : '');
  if (lang) out.push(['LANG', lang]);
  for (const k of ['LC_ALL', 'LC_MESSAGES', 'NOCOREACH_AGENT_HOME', 'NOCOREACH_CLAUDE_PATH']) if (env[k]) out.push([k, env[k]!]);
  return out;
}
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// KeepAlive only on a failed exit: `start --service` exits 0 when it should stay stopped (key revoked, not logged in,
// no Claude Code), so launchd does not try again every 30 seconds.
export function servicePlist(s: { label: string; node: string; cli: string; cwd: string; env: [string, string][]; log: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Written by \`nocoreach-agent install-service\`; run it again instead of editing this file. -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(s.label)}</string>
  <key>ProgramArguments</key>
  <array>
${[s.node, s.cli, 'start', '--service'].map(a => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(s.cwd)}</string>
  <key>EnvironmentVariables</key>
  <dict>
${s.env.map(([k, v]) => `    <key>${xml(k)}</key>\n    <string>${xml(v)}</string>`).join('\n')}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>30</integer>
  <key>StandardOutPath</key>
  <string>${xml(s.log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(s.log)}</string>
</dict>
</plist>
`;
}
// Reads `launchctl print` output: whether the program is running now, and how it last exited.
export function parsePrint(text: string): { running: boolean; pid?: number; lastExit?: string } {
  const pid = /^\s*pid = (\d+)/m.exec(text)?.[1], lastExit = /^\s*last exit code = (.+)$/m.exec(text)?.[1]?.trim();
  return { running: /^\s*state = running/m.test(text), ...(pid ? { pid: Number(pid) } : {}), ...(lastExit ? { lastExit } : {}) };
}
export type ServiceState = { installed: boolean; running: boolean; pid?: number; lastExit?: string };
export async function serviceState(run: Run = exec): Promise<ServiceState> {
  if (!installed()) return { installed: false, running: false };
  const p = await run('launchctl', ['print', `${target()}/${LABEL}`]);
  return { installed: true, ...(p.ok ? parsePrint(p.out) : { running: false }) };
}
// Writes the service for this Node and this program, then (re)loads it; launchd starts it right away (RunAtLoad).
export async function installService(cli: string, run: Run = exec): Promise<ServiceState> {
  mkdirSync(join(HOME, 'logs'), { recursive: true });
  const file = plistPath(); mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
  writeFileSync(file, servicePlist({ label: LABEL, node: stableNode(process.execPath), cli: real(cli), cwd: HOME, env: serviceEnv(), log: LOG }), { mode: 0o644 });
  await run('launchctl', ['bootout', `${target()}/${LABEL}`]);
  // Right after bootout launchd may still be tearing the old one down; try again for a few seconds.
  let r = await run('launchctl', ['bootstrap', target(), file]);
  for (let i = 0; !r.ok && i < 5; i++) { await new Promise(res => setTimeout(res, 1000)); r = await run('launchctl', ['bootstrap', target(), file]); }
  if (!r.ok) throw new Error(r.out.trim() || 'launchctl bootstrap failed');
  let st = await serviceState(run);
  for (let i = 0; !st.running && i < 6; i++) { await new Promise(res => setTimeout(res, 500)); st = await serviceState(run); }
  return st;
}
export async function uninstallService(run: Run = exec): Promise<boolean> {
  if (!installed()) return false;
  await run('launchctl', ['bootout', `${target()}/${LABEL}`]); rmSync(plistPath(), { force: true }); return true;
}
// After `login` saves a new key, the running service still holds the old one: restart it.
export async function restartService(run: Run = exec): Promise<boolean> { return installed() && (await run('launchctl', ['kickstart', '-k', `${target()}/${LABEL}`])).ok; }
// launchd appends to the log and never rotates it: past `max` bytes keep the last `keep` bytes (from a line start).
// launchd opened it for appending, so emptying the file in place is safe while the service writes to it.
export function trimLog(file = LOG, max = 5 * 1024 * 1024, keep = 1024 * 1024): boolean {
  let size = 0; try { size = statSync(file).size; } catch { return false; }
  if (size <= max) return false;
  const buf = Buffer.alloc(Math.min(keep, size)), fd = openSync(file, 'r');
  try { readSync(fd, buf, 0, buf.length, size - buf.length); } finally { closeSync(fd); }
  const nl = buf.indexOf(10); truncateSync(file, 0); appendFileSync(file, nl >= 0 ? buf.subarray(nl + 1) : buf); return true;
}
