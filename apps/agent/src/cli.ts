#!/usr/bin/env node
// NocoReach Agent: `login` saves this computer's key, `start` waits for work and runs it, `status` checks the link.
import { call, VERSION } from './api';
import { loadConfig, saveConfig, HOME } from './config';
import { detectClaude } from './claude';
import { execute, type Claimed } from './runner';
const args = process.argv.slice(2), cmd = args[0];
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const log = (s: string) => console.log(`${new Date().toLocaleTimeString()} ${s}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function tools(): Promise<Record<string, string>> { const claude = await detectClaude(); return claude ? { claude } : {}; }
async function main() {
  if (cmd === 'login') {
    const server = opt('server'), projectId = opt('project') || '1', key = opt('key') || process.env.NOCOREACH_AGENT_KEY;
    if (!server || !key) { console.error('用法：nocoreach-agent login --server <NocoReach 地址> --key <连接密钥> [--project 1]'); process.exit(2); }
    const cfg = { server, projectId, key }; const t = await tools();
    const hb = await call<{ repo: any }>(cfg, 'heartbeat', {}, t);
    saveConfig(cfg); console.log(`已连接。配置保存在 ${HOME}/config.json`); console.log(hb.repo ? `仓库：${hb.repo.repo}（基础分支 ${hb.repo.baseBranch}）` : '还没有登记仓库，请在 NocoReach “AI 团队 → Agent”里登记。'); console.log(t.claude ? `Claude Code ${t.claude}` : '没有找到 Claude Code，请先安装。'); return;
  }
  if (cmd !== 'start' && cmd !== 'status') { console.log(`nocoreach-agent ${VERSION}\n  login --server <地址> --key <连接密钥>  连接这台电脑\n  start                                 等待并执行任务（前台运行）\n  status                                检查连接`); return; }
  const cfg = loadConfig(); if (!cfg) { console.error('请先运行 nocoreach-agent login'); process.exit(2); }
  if (cmd === 'status') { const t = await tools(); const hb = await call<{ repo: any }>(cfg, 'heartbeat', {}, t); console.log(`已连接 ${cfg.server}；仓库 ${hb.repo?.repo || '未登记'}；Claude Code ${t.claude || '未找到'}`); return; }
  const t = await tools(); if (!t.claude) { console.error('没有找到 Claude Code，请先安装。'); process.exit(2); }
  log(`NocoReach Agent ${VERSION} 已启动，Claude Code ${t.claude}，服务器 ${cfg.server}`);
  let last = 0;
  for (;;) {
    try {
      if (Date.now() - last > 15000) { await call(cfg, 'heartbeat', {}, t); last = Date.now(); }
      const c = await call<{ run: Claimed | null }>(cfg, 'claim', {}, t);
      if (c.run) { log(`领取运行：任务 ${c.run.taskId}（${c.run.mode === 'plan' ? '出方案' : '修改并开 PR'}）`); await execute(cfg, c.run, t, log); log('运行结束'); last = 0; continue; }
    } catch (e: any) { log(`连接失败：${e.message}`); if (e.status === 401) { console.error('电脑密钥无效或已断开，请重新 login。'); process.exit(1); } }
    await sleep(5000);
  }
}
void main();
