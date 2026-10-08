#!/usr/bin/env node
// NocoReach Agent: `login` saves this computer's key, `start` waits for work and runs it, `status` checks the link.
import { call, VERSION } from './api';
import { loadConfig, saveConfig, HOME } from './config';
import { detectClaude } from './claude';
import { execute, type Claimed } from './runner';
import { findPreview } from './repo';
import { local } from './text';
const args = process.argv.slice(2), cmd = args[0];
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const log = (s: string) => console.log(`${new Date().toLocaleTimeString()} ${s}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function tools(): Promise<Record<string, string>> { const claude = await detectClaude(); return claude ? { claude } : {}; }
async function main() {
  if (cmd === 'login') {
    const server = opt('server'), projectId = opt('project') || '1', key = opt('key') || process.env.NOCOREACH_AGENT_KEY;
    if (!server || !key) { console.error(local('用法：nocoreach-agent login --server <NocoReach 地址> --key <连接密钥> [--project 1]', 'Usage: nocoreach-agent login --server <NocoReach URL> --key <connection key> [--project 1]')); process.exit(2); }
    const cfg = { server, projectId, key }; const t = await tools();
    const hb = await call<{ repo: any }>(cfg, 'heartbeat', {}, t);
    saveConfig(cfg); console.log(local(`已连接。配置保存在 ${HOME}/config.json`, `Connected. Settings saved in ${HOME}/config.json`)); console.log(hb.repo ? local(`网站源码：${hb.repo.repo}`, `Website source: ${hb.repo.repo}`) : local('还没有接入网站源码仓库：可以做只写文档的分析任务；要修改网站，请在 NocoReach “数据接入 → 网站源码”里接入。', 'No website source repository yet: document-only analysis tasks work; to change the website, connect it in NocoReach under Data sources → Website source repo.')); console.log(t.claude ? `Claude Code ${t.claude}` : local('没有找到 Claude Code，请先安装。', 'Claude Code not found. Install it first.')); return;
  }
  if (cmd !== 'start' && cmd !== 'status') { console.log(local(`nocoreach-agent ${VERSION}\n  login --server <地址> --key <连接密钥>  连接这台电脑\n  start                                 等待并执行任务（前台运行）\n  status                                检查连接`, `nocoreach-agent ${VERSION}\n  login --server <URL> --key <connection key>  connect this computer\n  start                                       wait for tasks and run them (foreground)\n  status                                      check the connection`)); return; }
  const cfg = loadConfig(); if (!cfg) { console.error(local('请先运行 nocoreach-agent login', 'Run nocoreach-agent login first')); process.exit(2); }
  if (cmd === 'status') { const t = await tools(); const hb = await call<{ repo: any }>(cfg, 'heartbeat', {}, t); console.log(local(`已连接 ${cfg.server}；网站源码 ${hb.repo?.repo || '未接入（只能做分析任务）'}；Claude Code ${t.claude || '未找到'}`, `Connected to ${cfg.server}; website source ${hb.repo?.repo || 'not connected (analysis tasks only)'}; Claude Code ${t.claude || 'not found'}`)); return; }
  const t = await tools(); if (!t.claude) { console.error(local('没有找到 Claude Code，请先安装。', 'Claude Code not found. Install it first.')); process.exit(2); }
  log(local(`NocoReach Agent ${VERSION} 已启动，Claude Code ${t.claude}，服务器 ${cfg.server}`, `NocoReach Agent ${VERSION} started, Claude Code ${t.claude}, server ${cfg.server}`));
  let last = 0, watched = 0, repo: any = null;
  for (;;) {
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
    } catch (e: any) { log(local(`连接失败：${e.message}`, `Connection failed: ${e.message}`)); if (e.status === 401) { console.error(local('电脑密钥无效或已断开，请重新 login。', 'The computer key is invalid or disconnected. Run login again.')); process.exit(1); } }
    await sleep(5000);
  }
}
void main();
