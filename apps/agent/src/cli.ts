#!/usr/bin/env node
// NocoReach Agent: `login` saves this computer's key, `start` waits for work and runs it, `status` checks the link,
// `install-service` keeps `start` running in the background on macOS (service.ts).
import { call, VERSION } from './api';
import { loadConfig, saveConfig, HOME } from './config';
import { detectClaude } from './claude';
import { execute, type Claimed } from './runner';
import { findPreview } from './repo';
import { local } from './text';
import { supported, serviceState, installService, uninstallService, restartService, trimLog, LOG, type ServiceState } from './service';
const args = process.argv.slice(2), cmd = args[0];
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const log = (s: string) => console.log(`${new Date().toLocaleTimeString()} ${s}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
// Run by the background service: a stop that needs the user (not logged in, key revoked, no Claude Code) exits 0 so
// launchd leaves it stopped instead of starting it again every 30 seconds; the reason is in the log.
const service = args.includes('--service'), stop = (code: number): never => process.exit(service ? 0 : code);
function serviceLine(s: ServiceState): string {
  if (!s.installed) return local('后台服务：没有安装（运行 install-service 后，关掉终端、重启电脑也会自动运行）', 'Background service: not installed (run install-service to keep the Agent running after the terminal closes or the computer restarts)');
  if (s.running) return local(`后台服务：正在运行（日志 ${LOG}）`, `Background service: running (log ${LOG})`);
  return local(`后台服务：已安装，没有在运行${s.lastExit ? `（上次退出 ${s.lastExit}）` : ''}。看日志 ${LOG}，或重新运行 install-service`, `Background service: installed, not running${s.lastExit ? ` (last exit ${s.lastExit})` : ''}. See the log ${LOG}, or run install-service again`);
}
async function tools(): Promise<Record<string, string>> { const claude = await detectClaude(); return claude ? { claude } : {}; }
async function main() {
  if (cmd === 'login') {
    const server = opt('server'), projectId = opt('project') || '1', key = opt('key') || process.env.NOCOREACH_AGENT_KEY;
    if (!server || !key) { console.error(local('用法：nocoreach-agent login --server <NocoReach 地址> --key <连接密钥> [--project 1]', 'Usage: nocoreach-agent login --server <NocoReach URL> --key <connection key> [--project 1]')); process.exit(2); }
    const cfg = { server, projectId, key }; const t = await tools();
    const hb = await call<{ repo: any }>(cfg, 'heartbeat', {}, t);
    saveConfig(cfg); console.log(local(`已连接。配置保存在 ${HOME}/config.json`, `Connected. Settings saved in ${HOME}/config.json`)); console.log(hb.repo ? local(`网站源码：${hb.repo.repo}`, `Website source: ${hb.repo.repo}`) : local('还没有接入网站源码仓库：可以做只写文档的分析任务；要修改网站，请在 NocoReach “数据接入 → 网站源码”里接入。', 'No website source repository yet: document-only analysis tasks work; to change the website, connect it in NocoReach under Data sources → Website source repo.')); console.log(t.claude ? `Claude Code ${t.claude}` : local('没有找到 Claude Code，请先安装。', 'Claude Code not found. Install it first.'));
    if (await restartService()) console.log(local('后台服务已换上新的配置重新启动。', 'The background service restarted with the new settings.'));
    return;
  }
  if (cmd === 'uninstall-service') { console.log(await uninstallService() ? local(`已停止并移除后台服务。日志留在 ${LOG}`, `The background service is stopped and removed. The log stays in ${LOG}`) : local('没有安装后台服务。', 'No background service is installed.')); return; }
  if (!['start', 'status', 'install-service'].includes(cmd)) { console.log(local(`nocoreach-agent ${VERSION}
  login --server <地址> --key <连接密钥>  连接这台电脑
  install-service                       装成后台服务（macOS）：关掉终端、重启电脑后也会自动运行
  uninstall-service                     停止并移除后台服务
  start                                 等待并执行任务（前台运行，窗口别关）
  status                                检查连接和后台服务`, `nocoreach-agent ${VERSION}
  login --server <URL> --key <connection key>  connect this computer
  install-service                             run in the background (macOS): keeps running after the terminal closes or the computer restarts
  uninstall-service                           stop and remove the background service
  start                                       wait for tasks and run them (foreground; keep the window open)
  status                                      check the connection and the background service`)); return; }
  const cfg = loadConfig(); if (!cfg) { console.error(local('请先运行 nocoreach-agent login', 'Run nocoreach-agent login first')); return stop(2); }
  if (cmd === 'status') {
    const t = await tools(); let failed = false;
    try { const hb = await call<{ repo: any }>(cfg, 'heartbeat', {}, t); console.log(local(`已连接 ${cfg.server}；网站源码 ${hb.repo?.repo || '未接入（只能做分析任务）'}；Claude Code ${t.claude || '未找到'}`, `Connected to ${cfg.server}; website source ${hb.repo?.repo || 'not connected (analysis tasks only)'}; Claude Code ${t.claude || 'not found'}`)); }
    catch (e: any) { failed = true; console.error(local(`连接失败：${e.message}`, `Connection failed: ${e.message}`)); }
    if (supported) console.log(serviceLine(await serviceState()));
    if (failed) process.exit(1); return;
  }
  if (cmd === 'start' && !service && (await serviceState()).running) { console.log(local('后台服务已经在运行，不用再 start。查看：status；停止：uninstall-service。', 'The background service is already running; no need to start. Check: status; stop: uninstall-service.')); return; }
  const t = await tools(); if (!t.claude) { console.error(local('没有找到 Claude Code，请先安装。', 'Claude Code not found. Install it first.')); return stop(2); }
  if (cmd === 'install-service') {
    if (!supported) { console.error(local('后台服务目前只支持 macOS。请运行 start，并保持窗口打开。', 'The background service only supports macOS for now. Run start and keep the window open.')); process.exit(2); }
    try { await call(cfg, 'heartbeat', {}, t); } catch (e: any) {
      if (e.status === 401) { console.error(local('电脑密钥无效或已断开，请重新 login。', 'The computer key is invalid or disconnected. Run login again.')); process.exit(1); }
      console.log(local(`现在连不上 ${cfg.server}（${e.message}），装好后会自动重试。`, `Cannot reach ${cfg.server} now (${e.message}); the service will keep trying.`));
    }
    try {
      const st = await installService(__filename);
      console.log(st.running ? local(`已装成后台服务并启动：登录这台电脑后自动运行，停了会自动重启。日志：${LOG}`, `Installed and started the background service: it runs whenever you are logged in to this computer and restarts if it stops. Log: ${LOG}`) : local(`后台服务已安装，但没有启动起来。看日志：${LOG}`, `The background service is installed but did not start. See the log: ${LOG}`));
      if (st.running) console.log(local('如果终端里还开着 start，可以关掉那个窗口了。', 'If start is still running in a terminal, you can close that window now.'));
    } catch (e: any) { console.error(local(`没有装好后台服务：${e.message}`, `Could not install the background service: ${e.message}`)); process.exit(1); }
    return;
  }
  log(local(`NocoReach Agent ${VERSION} 已启动，Claude Code ${t.claude}，服务器 ${cfg.server}`, `NocoReach Agent ${VERSION} started, Claude Code ${t.claude}, server ${cfg.server}`));
  let last = 0, watched = 0, trimmed = 0, repo: any = null;
  for (;;) {
    if (service && Date.now() - trimmed > 3600000) { trimLog(); trimmed = Date.now(); }
    try {
      if (Date.now() - last > 15000) { repo = (await call<{ repo: any }>(cfg, 'heartbeat', {}, t)).repo; last = Date.now(); }
      const c = await call<{ run: Claimed | null }>(cfg, 'claim', {}, t);
      if (c.run) { const mode = (local('出方案|修改并开 PR|合并 PR|关闭 PR|开回退 PR', 'plan|change and open PR|merge PR|close PR|open revert PR').split('|'))[['plan', 'build', 'merge', 'close', 'revert'].indexOf(c.run.mode)] || c.run.mode; log(local(`领取运行：任务 ${c.run.taskId}（${mode}）`, `Picked up a run: task ${c.run.taskId} (${mode})`)); await execute(cfg, c.run, t, log); log(local('运行结束', 'Run finished')); last = 0; continue; }
      // While idle: look up preview links for PRs waiting for review (deployments, statuses, bot comments).
      if (repo && Date.now() - watched > 60000) {
        watched = Date.now();
        for (const item of (await call<{ items: any[] }>(cfg, 'watch', {}, t)).items || []) {
          const url = await findPreview(repo, item.pr, item.headSha).catch(() => '');
          if (url) { await call(cfg, 'preview', { taskId: item.taskId, artifactId: item.artifactId, url }, t); log(local(`PR #${item.pr} 的预览：${url}`, `Preview of PR #${item.pr}: ${url}`)); }
        }
      }
    } catch (e: any) { log(local(`连接失败：${e.message}`, `Connection failed: ${e.message}`)); if (e.status === 401) { console.error(local('电脑密钥无效或已断开，请重新 login。', 'The computer key is invalid or disconnected. Run login again.')); stop(1); } }
    await sleep(5000);
  }
}
void main();
