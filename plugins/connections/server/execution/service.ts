import { randomUUID } from 'node:crypto';
import { fail, text, digest, boardState, contentInput, projectWork, planInput, currentStep, assertReview, makeArtifact, canApplyRun, type Work, type Run, type Artifact, type FileChange } from './model';
import { OnlineProvider } from './provider';
import { flowRunInput, type StageKind, type Stage, readsOnly, changesRepo } from './flow';
import { PlaybookStore, defaultPlaybookId, stagesFor, draftPlaybook } from './playbook';
import { AgentStore, allowedPath } from './agent';
import { languageOf } from './language';
import { CHECKPOINTS, compare, dateOf, pageKey, shift, windows, type Partition } from './effect';
// Host repository types vary across NocoBase releases; dynamic access is confined to this adapter.
const now = () => new Date().toISOString();
const active = (r: Run) => r.status === 'queued' || r.status === 'running';
// An analysis step needs no repository when nothing in the playbook changes one (research and outline documents).
const withoutRepo = (w: Work, stage: Stage) => stage.kind === 'agent' && stage.mode === 'analyze' && !w.flow!.stages.some(changesRepo);
const ID = /^[1-9]\d{0,15}$/;
const HOUR = 3600000;
const httpsUrl = (v: unknown) => { try { const u = new URL(String(v)); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
const optional = (v: unknown, max: number) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '';
// Before/after text of changed text files, for the change comparison; long files are cut and marked.
function cleanChanges(v: unknown): FileChange[] {
  if (!Array.isArray(v)) return [];
  const out: FileChange[] = []; let total = 0;
  for (const c of v.slice(0, 10)) {
    const path = optional(c?.path, 300); if (!path) continue;
    const b = typeof c?.before === 'string' ? c.before : '', a = typeof c?.after === 'string' ? c.after : '';
    if ((total += Math.min(b.length, 60000) + Math.min(a.length, 60000)) > 400000) break;
    out.push({ path, before: b.slice(0, 60000), after: a.slice(0, 60000), ...(c?.truncated || b.length > 60000 || a.length > 60000 ? { truncated: true } : {}) });
  }
  return out;
}
// Page text for the live check: tags and entities removed, spaces collapsed.
export const pageText = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const seenOn = (html: string, phrase: string) => pageText(html).includes(phrase.replace(/\s+/g, ' ').trim().toLowerCase());
export class TaskService {
  private busy = false;
  private lastVerify = 0;
  private lastEffects = 0;
  private legacyDone = false;
  private stopped = false;
  readonly provider: OnlineProvider;
  readonly playbooks: PlaybookStore;
  readonly agents: AgentStore;
  constructor(readonly p: any, provider?: OnlineProvider) { this.provider = provider || new OnlineProvider(p); this.playbooks = new PlaybookStore(this); this.agents = new AgentStore(this); }
  repo(name: string) { return this.p.db.getRepository(name); }
  key(kind: string, project: string, task: string, id = '') { return `nr-task-${kind}:${project}:${task}:${id}`; }
  async snapshot(key: string, tx?: any) { const r = await this.repo('nrSnapshots').findOne({ filter: { key }, transaction: tx }); return r?.get('payload'); }
  async put(key: string, payload: any, tx: any) {
    const r = await this.repo('nrSnapshots').findOne({ filter: { key }, transaction: tx });
    if (r) await this.repo('nrSnapshots').update({ filterByTk: r.id, values: { payload }, transaction: tx });
    else await this.repo('nrSnapshots').create({ values: { key, payload }, transaction: tx });
  }
  async list(kind: string, project: string, task: string, tx?: any) {
    const prefix = this.key(kind, project, task), out: any[] = [];
    for (let offset = 0; ; offset += 100) {
      const rows = await this.repo('nrSnapshots').find({ filter: { key: { $startsWith: prefix } }, limit: 100, offset, sort: 'id', transaction: tx });
      out.push(...rows.map((r: any) => r.get('payload')));
      if (rows.length < 100) return out;
    }
  }
  async task(project: string, id: string, tx?: any) {
    if (!ID.test(String(id))) return fail('任务编号无效');
    const row = await this.repo('nrTasks').findOne({ filter: { id, projectId: project }, transaction: tx });
    if (!row) return fail('任务不存在或不属于当前项目', 404);
    return row.toJSON();
  }
  async lock<T>(project: string, task: string, fn: (tx: any) => Promise<T>): Promise<T> {
    return this.p.db.sequelize.transaction(async (tx: any) => {
      await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: `nr-task:${project}:${task}` }, transaction: tx });
      return fn(tx);
    });
  }
  async save(task: any, w: Work, tx: any) {
    w.revision++;
    await this.repo('nrTasks').update({ filterByTk: task.id, values: { evidence: { ...task.evidence, work: w }, status: w.cancelledAt ? '已取消' : ({todo:'待处理',doing:'进行中',review:'待确认',done:'已完成'})[boardState(w)] }, transaction: tx });
  }
  async migrate(task: any, w: Work, tx: any) {
    if (task.evidence?.work?.schemaVersion === 2) return;
    const project = String(task.projectId), id = String(task.id);
    await this.put(this.key('legacy', project, id), { status: task.status, work: task.evidence?.work || null }, tx);
    for (const a of w.results.filter(Boolean) as Artifact[]) await this.put(this.key('artifact', project, id, a.id), a, tx);
    if (w.plan) await this.put(this.key('plan', project, id, '1'), { version: 1, plan: w.plan, legacy: true }, tx);
  }
  async view(project: string, taskId: string, tx?: any) {
    const task = await this.task(project, taskId, tx), work = projectWork(task);
    const [runs, artifacts, reviews] = await Promise.all(['run', 'artifact', 'review'].map(k => this.list(k, project, taskId, tx)));
    const content=work.contentId?await this.snapshot(this.key('content',project,'index',work.contentId),tx):null;
    const linked = [work.prevTaskId || task.evidence?.handoff?.taskId, work.nextTaskId].filter(Boolean).map(String);
    const related = (await Promise.all(linked.map(id => this.repo('nrTasks').findOne({ filter: { id, projectId: project }, transaction: tx })))).filter(Boolean).map((r: any) => ({ id: r.get('id'), title: r.get('title'), relation: String(r.get('id')) === String(work.nextTaskId) ? 'next' : 'prev' }));
    const local = (runs as Run[]).filter(r => r.executorKind === 'local').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    const agentEvents = local ? ((await this.snapshot(this.key('events', project, taskId, local.id), tx))?.events || []).slice(-40) : [];
    const agent = await this.agents.status(project);
    return { task, content, work, runs: runs.map(({ input, ...r }) => r), artifacts: artifacts.length ? artifacts : work.results.filter(Boolean), reviews, playbookDefault: work.playbookId || defaultPlaybookId(task), related, agentEvents, agent: { repo: agent.repo, online: agent.computers.some(c => c.online) } };
  }
  async get(project: string, taskId: string) { return this.lock(project, taskId, tx => this.view(project, taskId, tx)); }
  async authorized(actor: string) {
    const u = await this.repo('users').findOne({ filterByTk: actor, appends: ['roles'] });
    const user = u?.toJSON();
    if (!user || !(user.roles || []).some((r: any) => ['root', 'admin'].includes(r.name))) return fail('执行授权已失效', 403);
    return user;
  }
  async update(project: string, v: any, actor: string, actorName: string) {
    return this.updateTask(project, v, actor, actorName);
  }
  private flowStage(w: Work, key: unknown, kinds: StageKind[]) {
    const index = w.stageIndex ?? 0, stage = w.flow?.stages[index];
    if (w.stage !== 'flow' || !stage || stage.key !== key) return fail('流程已推进到其他阶段，请刷新后再操作', 409);
    if (!kinds.includes(stage.kind)) return fail('当前阶段不支持此操作', 409);
    return { stage, index };
  }
  private async flowArtifact(project: string, taskId: string, stageKey: string, content: string, actor: string, at: string, tx: any, runId?: string): Promise<Artifact> {
    const versions: Artifact[] = await this.list('artifact', project, taskId, tx);
    const artifact: Artifact = { id: randomUUID(), stepId: stageKey, planVersion: 0, version: 1 + Math.max(0, ...versions.filter(a => a.stepId === stageKey && a.planVersion === 0).map(a => a.version)), content, createdAt: at, createdBy: actor, ...(runId ? { runId } : {}) };
    await this.put(this.key('artifact', project, taskId, artifact.id), artifact, tx);
    return artifact;
  }
  // Moves a flow task to a stage. Online AI stages start at once (a person's action or the previous AI stage got here);
  // local Agent, review and publish stages wait for a person; observe starts after publish and the task is complete.
  private async enterFlowStage(project: string, taskId: string, task: any, w: Work, index: number, tx: any, actor: string, at: string) {
    const stages = w.flow!.stages;
    w.stageIndex = index; w.boardState = undefined;
    if (index >= stages.length) { w.stage = 'done'; return; }
    if (stages[index].kind === 'observe') { w.observeFrom = at; w.stage = 'done'; return; }
    if (stages[index].kind === 'ai') await this.queueFlowRun(project, taskId, task, w, tx, actor, at);
    if (stages[index].kind === 'agent' && ((await this.agents.doc(project, tx)).repo || withoutRepo(w, stages[index]))) await this.queueAgentRun(project, taskId, task, w, tx, actor, at);
    // A change you made yourself has no PR to merge: it waits for you to say it is live.
    if (stages[index].kind === 'release' && w.release?.state === 'merging') await this.queueMergeRun(project, taskId, task, w, tx, actor, at);
  }
  // A run for the local Agent program: it reads the repository, writes a plan (plan step) or changes files (build step);
  // the program itself commits, pushes and opens the PR on the task's branch. An analysis in a playbook that never changes
  // the repository runs without one (repo null): the Agent works from the material and public pages only.
  private async queueAgentRun(project: string, taskId: string, task: any, w: Work, tx: any, actor: string, at: string) {
    const index = w.stageIndex ?? 0, stage = w.flow!.stages[index], repo = (await this.agents.doc(project, tx)).repo || null;
    if (!repo && !withoutRepo(w, stage)) return fail('请先在“数据接入 → 网站源码”里接入仓库', 409);
    if (!w.humanOwnerId) return fail('请先指定负责人', 409);
    if ((await this.list('run', project, taskId, tx) as Run[]).some(active)) return fail('当前任务已有运行，请等待结果', 409);
    const context = await this.p.project(project);
    const content = await this.contentOf(project, w, tx);
    const reviews = await this.list('review', project, taskId, tx);
    // A step that only reads runs in the Agent's read-only mode ('plan', which every Agent program version knows); `step`
    // tells newer programs whether it is an analysis or a plan before changing.
    const mode: 'plan' | 'build' = readsOnly(stage) ? 'plan' : 'build', step = stage.mode === 'analyze' ? 'analyze' : mode === 'plan' ? 'plan' : 'change', branch = `nocoreach/task-${taskId}`;
    const input = JSON.stringify({ ...flowRunInput(context, task, w, index, content, reviews), mode, step, repo, branch, taskId, title: task.title });
    if (input.length > 200000) return fail('任务资料过长，请精简后再执行');
    const run: Run = { id: randomUUID(), projectId: project, taskId, planVersion: 0, stepId: stage.key, baseArtifactId: w.results[index]?.id || null, baseRejectedAt: w.results[index]?.rejectedAt, ownerId: w.humanOwnerId, actor, executorId: 'local-agent', executorKind: 'local', protocolVersion: 1, capabilitySnapshot: mode === 'plan' ? ['repo.read'] : ['repo.read', 'repo.write', 'pr.open'], status: 'queued', createdAt: at, input, model: { llmService: 'local', model: 'claude-code' }, flowStage: index, mode, branch };
    await this.put(this.key('run', project, taskId, run.id), run, tx);
    w.latestRun = { id: run.id, status: run.status };
    w.history.push({ at, actor, action: 'runQueued', runId: run.id, note: stage.name });
  }
  // The local Agent merges the reviewed PR at the exact commit you looked at (it fails if the PR changed since).
  private async queueMergeRun(project: string, taskId: string, task: any, w: Work, tx: any, actor: string, at: string) {
    const index = w.stageIndex ?? 0, stage = w.flow!.stages[index], repo = (await this.agents.doc(project, tx)).repo;
    if (!repo) return fail('请先在“数据接入 → 网站源码”里接入仓库', 409);
    if (!w.release?.pr) return fail('没有要合并的 PR', 409);
    if (!w.humanOwnerId) return fail('请先指定负责人', 409);
    if ((await this.list('run', project, taskId, tx) as Run[]).some(active)) return fail('当前任务已有运行，请等待结果', 409);
    const branch = `nocoreach/task-${taskId}`, input = JSON.stringify({ mode: 'merge', repo, branch, taskId, title: task.title, pr: w.release.pr });
    const run: Run = { id: randomUUID(), projectId: project, taskId, planVersion: 0, stepId: stage.key, baseArtifactId: w.results[index]?.id || null, ownerId: w.humanOwnerId, actor, executorId: 'local-agent', executorKind: 'local', protocolVersion: 1, capabilitySnapshot: ['pr.merge'], status: 'queued', createdAt: at, input, model: { llmService: 'local', model: 'merge' }, flowStage: index, mode: 'merge', branch };
    await this.put(this.key('run', project, taskId, run.id), run, tx);
    w.latestRun = { id: run.id, status: run.status }; w.release = { ...w.release, state: 'merging', error: undefined };
    w.history.push({ at, actor, action: 'runQueued', runId: run.id, note: stage.name });
  }
  // Pages to check after release: what the Agent changed (site paths or links) plus the linked page, on the site's origin.
  private async releasePages(project: string, paths: unknown, w: Work, tx: any) {
    const site = await this.snapshot(`site-content:${project}`, tx), origin = (() => { try { return w.page ? new URL(w.page.url).origin : String(site?.sites?.[0]?.origin || site?.origin || ''); } catch { return ''; } })();
    const out = new Set<string>();
    for (const p of [...(Array.isArray(paths) ? paths : []), ...(w.page ? [w.page.url] : [])].slice(0, 20)) {
      const s = typeof p === 'string' ? p.trim() : '';
      const url = s.startsWith('/') && origin ? httpsUrl(origin + s) : httpsUrl(s);
      if (url) out.add(url);
    }
    return [...out].slice(0, 10);
  }
  private async goLive(project: string, taskId: string, task: any, w: Work, tx: any, actor: string, at: string) {
    const index = w.stageIndex ?? 0;
    w.release = { ...w.release!, state: 'live', liveAt: at };
    w.receipt = { note: w.release.note, url: w.release.pages[0] || '', recordedAt: at, recordedBy: actor };
    w.history.push({ at, actor, action: 'live', note: w.release.pages[0] || '' });
    await this.enterFlowStage(project, taskId, task, w, index + 1, tx, actor, at);
  }
  // Every few minutes: open the live pages of merged tasks and look for the sentence the Agent said would appear.
  async verifyReleases(read: (url: string) => Promise<{ text: string }> = (url: string) => this.p.siteContent.read(url)) {
    for (let offset = 0; ; offset += 100) {
      const rows = await this.repo('nrTasks').find({ sort: 'id', limit: 100, offset });
      for (const row of rows) {
        const t = row.toJSON ? row.toJSON() : row, rel = projectWork(t).release;
        if (!rel || rel.state !== 'verifying' || Date.parse(rel.nextCheckAt || '') > Date.now()) continue;
        let seen = false;
        for (const url of rel.pages) { try { if (seenOn((await read(url)).text || '', rel.verifyText || '')) { seen = true; break; } } catch { /* try again later */ } }
        await this.lock(String(t.projectId), String(t.id), async tx => {
          const task = await this.task(String(t.projectId), String(t.id), tx), w = projectWork(task), r = w.release;
          if (!r || r.state !== 'verifying') return;
          const at = now(); r.checks = (r.checks || 0) + 1; r.lastCheckAt = at;
          if (seen) await this.goLive(String(t.projectId), String(t.id), task, w, tx, 'system', at);
          else if (Date.now() > Date.parse(r.deadline || '')) { r.state = 'not_seen'; w.history.push({ at, actor: 'system', action: 'notSeen' }); }
          else r.nextCheckAt = new Date(Date.now() + HOUR / 2).toISOString();
          await this.save(task, w, tx);
        });
      }
      if (rows.length < 100) break;
    }
  }
  // The pages a finished task changed: what was released, the published page and the linked page.
  effectPages(w: Work) { return [...new Set([...(w.release?.pages || []), w.receipt?.url || '', w.page?.url || ''].map(httpsUrl).filter(Boolean))].slice(0, 10); }
  // Daily Google partitions of the project's current property and site, between two dates.
  private async partitions(project: string, start: string, end: string): Promise<Partition[]> {
    const link = await this.p.link(project), out: Partition[] = [];
    const day = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10);
    for (const [source, grain, resource] of [['gsc', 'query_page', link?.get?.('gscSiteUrl')], ['ga4', 'page', link?.get?.('ga4PropertyId')]]) {
      if (!resource) continue;
      const ids: { id: any; date: string }[] = [];
      for (let offset = 0; ; offset += 200) {
        const rows = await this.repo('nrSyncPartitions').find({ filter: { projectId: project, source, grain }, fields: ['id', 'date', 'resource'], sort: ['id'], limit: 200, offset });
        for (const r of rows) { const x = r.toJSON ? r.toJSON() : r; if (x.resource === resource && day(x.date) >= start && day(x.date) <= end) ids.push({ id: x.id, date: day(x.date) }); }
        if (rows.length < 200) break;
      }
      for (const { id, date } of ids) { const r = await this.repo('nrSyncPartitions').findOne({ filterByTk: id }); if (r) out.push({ source, grain, date, payload: (r.toJSON ? r.toJSON() : r).payload || [] }); }
    }
    return out;
  }
  // Latest day each source has data for (GSC lags a few days); a checkpoint waits until every source has reached it.
  private async dataEnd(project: string) {
    const link = await this.p.link(project), ends: string[] = [];
    for (const [source, grain, resource] of [['gsc', 'query_page', link?.get?.('gscSiteUrl')], ['ga4', 'page', link?.get?.('ga4PropertyId')]]) {
      if (!resource) continue; let end = '';
      for (let offset = 0; ; offset += 200) {
        const rows = await this.repo('nrSyncPartitions').find({ filter: { projectId: project, source, grain }, fields: ['id', 'date', 'resource'], sort: ['id'], limit: 200, offset });
        for (const r of rows) { const x = r.toJSON ? r.toJSON() : r, d = x.date instanceof Date ? x.date.toISOString().slice(0, 10) : String(x.date || '').slice(0, 10); if (x.resource === resource && d > end) end = d; }
        if (rows.length < 200) break;
      }
      if (end) ends.push(end);
    }
    return ends.length ? ends.sort()[0] : '';
  }
  // Hourly: day 7 and day 28 comparisons for tasks that went live, once the data covers those days.
  async observeEffects() {
    const tasks: any[] = [];
    for (let offset = 0; ; offset += 100) { const rows = await this.repo('nrTasks').find({ sort: 'id', limit: 100, offset }); tasks.push(...rows.map((r: any) => r.toJSON ? r.toJSON() : r)); if (rows.length < 100) break; }
    const ends = new Map<string, string>();
    for (const t of tasks) {
      const w = projectWork(t); if (!w.observeFrom) continue;
      const project = String(t.projectId), from = dateOf(w.observeFrom), pages = this.effectPages(w), done = new Set((w.observation?.results || []).map(r => r.day));
      if (!pages.length) continue;
      if (!ends.has(project)) ends.set(project, await this.dataEnd(project));
      for (const day of CHECKPOINTS.filter(d => !done.has(d) && shift(from, d) <= ends.get(project)!)) {
        const { baseline, after } = windows(from, day), result = compare(day, from, pages, await this.partitions(project, baseline.start, after.end), now());
        // Other tasks that went live on the same page within the compared days are named, not discounted.
        const keys = new Set(pages.map(pageKey));
        for (const o of tasks) { const ow = projectWork(o), od = ow.observeFrom ? dateOf(ow.observeFrom) : ''; if (String(o.id) !== String(t.id) && String(o.projectId) === project && od >= baseline.start && od <= after.end && this.effectPages(ow).some(u => keys.has(pageKey(u)))) result.notes.push(`同期任务“${o.title}”也改了这个页面（${od} 上线）`); }
        await this.lock(project, String(t.id), async tx => {
          const task = await this.task(project, String(t.id), tx), fresh = projectWork(task), results = fresh.observation?.results || [];
          if (results.some(r => r.day === day)) return;
          fresh.observation = { results: [...results, result].sort((a, b) => a.day - b.day) };
          fresh.history.push({ at: result.computedAt, actor: 'system', action: 'effect', note: String(day) });
          await this.save(task, fresh, tx);
        });
      }
    }
  }
  // Closing the PR of a cancelled task is a repository change, so the local Agent does it.
  private async queueCloseRun(project: string, taskId: string, w: Work, pr: { number: number; url: string }, tx: any, actor: string, at: string) {
    const repo = (await this.agents.doc(project, tx)).repo, branch = `nocoreach/task-${taskId}`;
    const run: Run = { id: randomUUID(), projectId: project, taskId, planVersion: 0, stepId: 'close', baseArtifactId: null, ownerId: w.humanOwnerId || actor, actor, executorId: 'local-agent', executorKind: 'local', protocolVersion: 1, capabilitySnapshot: ['pr.close'], status: 'queued', createdAt: at, input: JSON.stringify({ mode: 'close', repo, branch, taskId, pr: { number: pr.number, url: pr.url } }), model: { llmService: 'local', model: 'close' }, mode: 'close', branch };
    await this.put(this.key('run', project, taskId, run.id), run, tx);
    w.prClose = { number: pr.number, state: 'closing' };
  }
  // Undoing a merged change is a repository change too: the local Agent opens GitHub's own revert of the PR, which you
  // merge on GitHub like any other PR.
  private async queueRevertRun(project: string, taskId: string, task: any, w: Work, pr: { number: number; url: string }, tx: any, actor: string, at: string) {
    const repo = (await this.agents.doc(project, tx)).repo;
    const run: Run = { id: randomUUID(), projectId: project, taskId, planVersion: 0, stepId: 'revert', baseArtifactId: null, ownerId: w.humanOwnerId || actor, actor, executorId: 'local-agent', executorKind: 'local', protocolVersion: 1, capabilitySnapshot: ['pr.revert'], status: 'queued', createdAt: at, input: JSON.stringify({ mode: 'revert', repo, taskId, title: task.title, pr: { number: pr.number, url: pr.url } }), model: { llmService: 'local', model: 'revert' }, mode: 'revert' };
    await this.put(this.key('run', project, taskId, run.id), run, tx);
    w.revert = { of: pr.number, state: 'opening' }; w.latestRun = { id: run.id, status: run.status };
  }
  private async finishRevert(r: Run, v: any) {
    return this.lock(r.projectId, r.taskId, async tx => {
      const key = this.key('run', r.projectId, r.taskId, r.id), fresh: Run = await this.snapshot(key, tx);
      if (!fresh || fresh.status !== 'running') return { accepted: false, status: fresh?.status };
      const repo = (await this.agents.doc(r.projectId, tx)).repo, p = v.pr || {};
      const ok = Boolean(v.ok && repo && typeof p.url === 'string' && p.url.startsWith(`https://github.com/${repo.repo}/pull/`) && Number.isSafeInteger(p.number));
      if (v.ok && !ok) return fail('回退 PR 必须开在登记的仓库', 400);
      const task = await this.task(r.projectId, r.taskId, tx), w = projectWork(task), at = now();
      fresh.endedAt = at; fresh.status = ok ? 'succeeded' : 'failed'; if (!ok) fresh.error = 'revert_failed';
      if (w.revert) w.revert = ok ? { of: w.revert.of, state: 'opened', number: p.number, url: p.url, at } : { of: w.revert.of, state: 'failed', error: optional(v.message, 300) || '回退 PR 没有开出来' };
      w.latestRun = { id: fresh.id, status: fresh.status };
      w.history.push({ at, actor: 'system', action: ok ? 'revertOpened' : 'runFailed', runId: fresh.id, note: ok ? `PR #${p.number}` : 'revert_failed' });
      await this.put(key, fresh, tx); await this.save(task, w, tx);
      return { accepted: true };
    });
  }
  private async finishClose(r: Run, v: any) {
    return this.lock(r.projectId, r.taskId, async tx => {
      const key = this.key('run', r.projectId, r.taskId, r.id), fresh: Run = await this.snapshot(key, tx);
      if (!fresh || fresh.status !== 'running') return { accepted: false, status: fresh?.status };
      const task = await this.task(r.projectId, r.taskId, tx), w = projectWork(task), at = now();
      fresh.endedAt = at; fresh.status = v.ok ? 'succeeded' : 'failed'; if (!v.ok) fresh.error = 'close_failed';
      if (w.prClose) w.prClose = { ...w.prClose, state: v.ok ? 'closed' : 'failed', ...(v.ok ? {} : { error: optional(v.message, 300) || '关闭 PR 没有完成' }) };
      w.history.push({ at, actor: 'system', action: v.ok ? 'prClosed' : 'runFailed', runId: fresh.id, note: v.ok ? `PR #${w.prClose?.number}` : 'close_failed' });
      await this.put(key, fresh, tx); await this.save(task, w, tx);
      return { accepted: true };
    });
  }
  // Once: tasks of the earlier flows (step plans, simple tasks, publish typed in by hand) are archived (user decision).
  async archiveLegacy() {
    const flag = 'nr-migrations:archive-legacy-1';
    if (await this.snapshot(flag)) return 0;
    let n = 0;
    for (let offset = 0; ; offset += 100) {
      const rows = await this.repo('nrTasks').find({ sort: 'id', limit: 100, offset });
      for (const row of rows) {
        const t = row.toJSON ? row.toJSON() : row, w = projectWork(t);
        const legacy = (w.plan && !w.flow) || w.simple || Boolean(w.flow?.stages.some(s => s.kind === 'publish'));
        if (!legacy || w.archivedAt) continue;
        await this.lock(String(t.projectId), String(t.id), async tx => {
          const task = await this.task(String(t.projectId), String(t.id), tx), fresh = projectWork(task), at = now();
          if (fresh.archivedAt) return;
          fresh.archivedAt = at; fresh.archivedBy = 'system'; fresh.history.push({ at, actor: 'system', action: 'archiveTask', note: '旧流程' });
          await this.save(task, fresh, tx); n++;
        });
      }
      if (rows.length < 100) break;
    }
    await this.p.db.sequelize.transaction(async (tx: any) => this.put(flag, { at: now(), archived: n }, tx));
    return n;
  }
  private async queueFlowRun(project: string, taskId: string, task: any, w: Work, tx: any, actor: string, at: string) {
    const index = w.stageIndex ?? 0, stage = w.flow!.stages[index];
    if (!w.humanOwnerId) return fail('请先指定负责人', 409);
    if ((await this.list('run', project, taskId, tx) as Run[]).some(active)) return fail('当前任务已有运行，请等待结果', 409);
    const model = await this.provider.prepare();
    const context = await this.p.project(project);
    const content = await this.contentOf(project, w, tx);
    const reviews = await this.list('review', project, taskId, tx);
    const input = JSON.stringify(flowRunInput(context, task, w, index, content, reviews));
    if (input.length > 120000) return fail('任务资料过长，请精简后再执行');
    const run: Run = { id: randomUUID(), projectId: project, taskId, planVersion: 0, stepId: stage.key, baseArtifactId: w.results[index]?.id || null, baseRejectedAt: w.results[index]?.rejectedAt, ownerId: w.humanOwnerId, actor, executorId: 'atlas', executorKind: 'online', protocolVersion: 1, capabilitySnapshot: ['context.read', 'text.generate'], status: 'queued', createdAt: at, input, model, flowStage: index };
    await this.put(this.key('run', project, taskId, run.id), run, tx);
    w.latestRun = { id: run.id, status: run.status };
    w.history.push({ at, actor, action: 'runQueued', runId: run.id, note: stage.name });
  }
  async updateTask(project: string, v: any, actor: string, actorName: string) {
    if (!v || !/^[a-zA-Z0-9-]{20,80}$/.test(v.requestId || '') || !Number.isSafeInteger(v.revision) || v.revision < 0) return fail('请求标识或版本无效');
    const taskId = String(v.taskId);
    const hash = digest({ ...v, actor });
    return this.lock(project, taskId, async tx => {
      if(v.command==='moveWork') await this.p.db.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))',{replacements:{key:`nr-task-board:${project}`},transaction:tx});
      const task = await this.task(project, taskId, tx), w = projectWork(task);
      const opKey = this.key('op', project, taskId, v.requestId), previous = await this.snapshot(opKey, tx);
      if (previous) { if (previous.hash !== hash) return fail('同一请求标识不能用于不同操作', 409); return this.view(project, taskId, tx); }
      if (v.revision !== w.revision) return fail('任务已更新，请刷新后再保存，编辑内容仍保留。', 409);
      if (w.operations.includes(v.requestId)) return fail('旧请求已处理，请刷新后使用新请求标识', 409);
      await this.migrate(task, w, tx);
      if (w.cancelledAt && !['archiveTask', 'unarchiveTask', 'comment', 'linkPage', 'setOwner', 'setCollaborators'].includes(v.command)) return fail('任务已取消，不能再推进', 409);
      if (w.archivedAt && !['unarchiveTask', 'comment'].includes(v.command)) return fail('任务已归档，恢复后才能操作', 409);
      const at = now(), event: any = { at, actor, action: v.command, stage: w.stage, step: w.step };
      if (typeof v.stageKey === 'string') event.stageKey = v.stageKey.slice(0, 40);
      if (v.command === 'moveWork') {
        if (!['todo','doing','review','done'].includes(v.state)) return fail('工作状态无效');
        const from = boardState(w);
        const runs: Run[] = await this.list('run', project, taskId, tx);
        if (from !== v.state && runs.some(active)) return fail('请等待当前执行结束，再调整工作状态', 409);
        if (from !== v.state && v.state === 'review' && !w.results.some(a => a && !a.rejectedAt)) return fail('请先保存可供确认的成果', 409);
        if (from !== v.state && v.state === 'done') {
          if (v.confirm !== true) return fail('请确认工作完成；移动不会发布内容', 409);
          if (w.flow) {
            if (w.stage !== 'done') return fail(`请按流程完成，当前在“${w.flow.stages[w.stageIndex || 0]?.name}”阶段`, 409);
          } else if (w.kind === 'research') {
            if (!w.results.some(a => a?.approvedAt && !a.rejectedAt) || w.stage !== 'execution') return fail('请先审核完整调研成果', 409);
          } else if (!w.receipt?.note || !['verification','done'].includes(w.stage)) return fail('请先记录实际发布或执行结果；拖动不能代替发布', 409);
        }
        // Reopening a completed card changes planning status only; receipt and prior approval remain historical facts.
        const rows: any[] = [];
        for (let offset=0;;offset+=100) {
          const page = await this.repo('nrTasks').find({filter:{projectId:project},limit:100,offset,sort:'id',transaction:tx});
          rows.push(...page.map((r:any)=>r.toJSON())); if(page.length<100) break;
        }
        const ordered = rows.filter(t => String(t.id)!==taskId && boardState(projectWork(t))===v.state).sort((a,b)=>(projectWork(a).sortOrder ?? Number(a.id)*1024)-(projectWork(b).sortOrder ?? Number(b.id)*1024) || Number(a.id)-Number(b.id));
        const index = v.beforeId ? ordered.findIndex(t => String(t.id)===String(v.beforeId)) : ordered.length;
        if(index<0) return fail('目标卡片已移动，请刷新后重试',409);
        const rank=(t:any)=>projectWork(t).sortOrder ?? Number(t.id)*1024;
        const prev=index>0?rank(ordered[index-1]):(ordered.length?rank(ordered[0])-2048:0);
        const next=index<ordered.length?rank(ordered[index]):prev+2048;
        if(!Number.isFinite(prev)||!Number.isFinite(next)||(next-prev)<0.000001) return fail('此位置排序过密，请先移到列末再调整',409);
        w.sortOrder=(prev+next)/2;w.boardState=v.state;event.previous=from;event.note=v.state;
      } else if (v.command === 'startSimple') {
        if(w.stage!=='plan' || w.plan) return fail('已有方案请沿用或调整原方案',409);
        if(!['content','research'].includes(v.kind)) return fail('请选择内容修改或调研');
        const scope=text(v.scope,5000);
        w.simple=true;w.kind=v.kind;w.humanOwnerId=actor;w.humanOwnerName=actorName;
        w.plan=planInput({deliverable:scope.slice(0,2000),verification:'发布或交付后结合可用数据观察，不将变化直接视为因果。',steps:[{title:'完成确认的工作',owner:'ai',instruction:scope,acceptance:'遵守确认范围，核对事实与引用，不虚构外部执行。'}]});
        w.planVersion++;w.approvedPlanVersion=w.planVersion;w.stage='work';w.boardState='doing';
        await this.put(this.key('plan',project,taskId,String(w.planVersion)),{version:w.planVersion,plan:w.plan,createdAt:at,createdBy:actor},tx);
        await this.put(this.key('review',project,taskId,randomUUID()),{kind:'plan',planVersion:w.planVersion,decision:'approve',reviewerId:actor,at},tx);
      } else if (v.command === 'linkContent') {
        if(w.stage!=='plan') return fail('请在确认工作范围前关联页面',409);
        if(typeof v.contentId!=='string' || !/^[a-f0-9]{64}$/.test(v.contentId)) return fail('内容编号无效');
        if(!await this.snapshot(this.key('content',project,'index',v.contentId),tx)) return fail('内容不属于当前项目',404);
        w.contentId=v.contentId;
      } else if (v.command === 'takeOwnership') { w.humanOwnerId = actor; w.humanOwnerName = actorName; }
      else if (v.command === 'setOwner') {
        // A run's result is applied only for the owner who started it, so the owner changes between runs.
        if ((await this.list('run', project, taskId, tx) as Run[]).some(active)) return fail('执行者正在运行，结束后再更换负责人', 409);
        const m = await this.member(v.userId, tx); w.humanOwnerId = m.id; w.humanOwnerName = m.name; event.note = m.name;
      } else if (v.command === 'setCollaborators') {
        if (!Array.isArray(v.userIds) || v.userIds.length > 20) return fail('协作人最多 20 位');
        const ids = [...new Set(v.userIds.map(String))], people = [];
        for (const id of ids) people.push(await this.member(id, tx));
        w.collaborators = people; event.note = people.map(p => p.name).join('、');
      } else if (v.command === 'linkPage') {
        if (v.url === '' || v.url === null) { w.page = undefined; event.note = ''; }
        else {
          const url = text(v.url, 2000), s = await this.snapshot(`site-content:${project}`, tx);
          const page = (Array.isArray(s?.pages) ? s.pages : []).find((p: any) => p.url === url);
          if (!page) return fail('这个页面不在“网站内容”的页面清单里', 404);
          w.page = { url, title: String(page.title || '').slice(0, 300) }; event.note = w.page.title || url;
        }
      }
      else if (v.command === 'savePlan') {
        if (w.stage !== 'plan') return fail('请先返回方案阶段', 409);
        w.plan = planInput(v.plan); w.planVersion++; w.approvedPlanVersion = undefined;
        await this.put(this.key('plan', project, taskId, String(w.planVersion)), { version: w.planVersion, plan: w.plan, createdAt: at, createdBy: actor }, tx);
      } else if (v.command === 'approvePlan') {
        if (w.stage !== 'plan' || !w.plan || !w.humanOwnerId) return fail('请先保存方案并指定真人负责人', 409);
        w.approvedPlanVersion = w.planVersion; w.stage = 'work'; w.boardState=undefined;
        await this.put(this.key('review', project, taskId, randomUUID()), { kind: 'plan', planVersion: w.planVersion, decision: 'approve', reviewerId: actor, at }, tx);
      } else if (v.command === 'saveResult') {
        const versions = await this.list('artifact', project, taskId, tx);
        const artifact = makeArtifact(w, v.content, actor, at, versions);
        await this.put(this.key('artifact', project, taskId, artifact.id), artifact, tx);
        w.results[w.step] = artifact; w.boardState=undefined; event.artifactId = artifact.id;
      } else if (v.command === 'approveResult' || v.command === 'requestChanges') {
        const a = assertReview(w, v.artifactId); w.boardState=undefined;
        const review = { kind: 'artifact', artifactVersionId: a.id, decision: v.command === 'approveResult' ? 'approve' : 'requestChanges', reviewerId: actor, at, comment: v.command === 'requestChanges' ? text(v.comment, 3000) : '' };
        await this.put(this.key('review', project, taskId, randomUUID()), review, tx);
        event.artifactId = a.id; event.comment = review.comment;
        if (v.command === 'approveResult') {
          w.results[w.step] = { ...a, approvedAt: at, approvedBy: actor };
          w.step++; if (w.step >= w.plan!.steps.length) w.stage = 'execution';
        } else w.results[w.step] = { ...a, rejectedAt: at };
      } else if (v.command === 'startRun') {
        const step = currentStep(w);
        if (!w.humanOwnerId || step.owner !== 'ai') return fail('当前步骤需要真人负责人，并且必须是在线文本步骤', 409);
        if (v.planVersion !== w.planVersion || v.stepId !== step.id || v.executorId !== 'atlas') return fail('执行上下文已改变', 409);
        const runs: Run[] = await this.list('run', project, taskId, tx);
        if (runs.some(active)) return fail('当前任务已有运行，请等待结果或超时状态', 409);
        const model = await this.provider.prepare();
        const context = await this.p.project(project);
        const reviews = await this.list('review', project, taskId, tx);
        const input = JSON.stringify({ project: { name: context.name, description: context.description, audience: context.audience, market: context.market }, content: w.contentId ? await this.snapshot(this.key('content',project,'index',w.contentId),tx) : null, task: { title: task.title, brief: task.brief, evidence: { ...task.evidence, work: undefined } }, plan: w.plan, currentStep: step, previousResults: w.results, feedback: reviews.filter(r => r.artifactVersionId === w.results[w.step]?.id) });
        if (input.length > 120000) return fail('任务资料过长，请精简后再执行');
        const run: Run = { id: randomUUID(), projectId: project, taskId, planVersion: w.planVersion, stepId: step.id, baseArtifactId: w.results[w.step]?.id || null, baseRejectedAt: w.results[w.step]?.rejectedAt, ownerId: w.humanOwnerId, actor, executorId: 'atlas', executorKind: 'online', protocolVersion: 1, capabilitySnapshot: ['context.read', 'text.generate'], status: 'queued', createdAt: at, input, model };
        await this.put(this.key('run', project, taskId, run.id), run, tx);
        w.boardState='doing'; w.latestRun = { id: run.id, status: run.status }; event.runId = run.id;
      } else if (v.command === 'replan') {
        if (!w.plan) return fail('尚无需要调整的方案');
        event.previous = { plan: w.plan, planVersion: w.planVersion, results: w.results, receipt: w.receipt, verification: w.verification };
        w.boardState=undefined; w.simple=false; w.stage = 'plan'; w.approvedPlanVersion = undefined; w.step = 0; w.results = []; w.receipt = null; w.verification = null;
      } else if (v.command === 'recordExecution') {
        if (w.stage !== 'execution') return fail('须先审核全部成果', 409);
        let url = '';
        if (v.url) { try { const u = new URL(text(v.url, 2000)); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error(); url = u.href; } catch { return fail('请填写有效的执行结果网址'); } }
        w.boardState=undefined; w.receipt = { note: text(v.note, 5000), url, recordedAt: at, recordedBy: actor }; w.stage = 'verification';
      } else if (v.command === 'verify') {
        if (!['verification','done'].includes(w.stage) || !w.receipt?.note || !['met', 'unmet', 'inconclusive'].includes(v.outcome)) return fail('请先记录执行并选择验证结论', 409);
        w.boardState=undefined; event.previous = w.verification; w.verification = { outcome: v.outcome, note: text(v.note, 10000), at, actor };
        if (v.outcome !== 'inconclusive') w.stage = 'done';
      } else if (v.command === 'selectPlaybook') {
        if (w.stage !== 'plan' || w.plan || w.flow) return fail('任务已开始，不能更换做法', 409);
        const p = await this.playbooks.get(project, v.playbookId, tx); w.playbookId = p.id; event.note = p.name;
      } else if (v.command === 'startTask') {
        if (w.stage !== 'plan' || w.plan || w.flow) return fail('任务已开始', 409);
        const p = await this.playbooks.get(project, v.playbookId || w.playbookId || defaultPlaybookId(task), tx);
        w.playbookId = p.id; w.playbook = { id: p.id, name: p.name, kind: p.kind, version: p.version, next: [...p.next] };
        w.flow = { id: p.id, name: p.name, version: p.version, stages: stagesFor(p) };
        w.note = typeof v.note === 'string' ? v.note.trim().slice(0, 3000) : '';
        if (!w.humanOwnerId) { w.humanOwnerId = actor; w.humanOwnerName = actorName; }
        w.stage = 'flow'; w.step = 0; w.results = []; event.note = p.name;
        await this.enterFlowStage(project, taskId, task, w, 0, tx, actor, at);
      } else if (v.command === 'comment') {
        // A message for the executor; the next run reads the latest ones.
        if (w.stage === 'done') return fail('任务已完成', 409);
        event.comment = text(v.comment, 3000);
      } else if (v.command === 'approveStage' || v.command === 'requestStageChanges') {
        const { stage, index } = this.flowStage(w, v.stageKey, ['review']), producer = w.flow!.stages[index - 1], output = w.results[index - 1];
        if (!output || output.id !== v.artifactId || output.rejectedAt) return fail('内容已更新，请刷新后再审核', 409);
        event.artifactId = output.id;
        if (v.command === 'approveStage') {
          const checked: string[] = Array.isArray(v.checked) ? v.checked.filter((k: unknown) => typeof k === 'string') : [];
          const missing = (stage.checklist || []).filter(c => c.required && !checked.includes(c.key));
          if (missing.length) return fail(`请先确认：${missing.map(c => c.label).join('、')}`, 409);
          // Changes outside the registered directories need an explicit yes before they can move on (SPEC §10).
          if (output.pr?.outOfScope?.length && v.confirmOutOfScope !== true) return fail(`请先确认超出允许范围的改动：${output.pr.outOfScope.join('、')}`, 409);
          if (w.flow!.stages[index + 1]?.kind === 'release') {
            const pr = output.pr, rel = v.release || {};
            const base = { note: optional(rel.note, 2000) || pr?.release || task.title, pages: await this.releasePages(project, Array.isArray(rel.pages) ? rel.pages : pr?.pages || [], w, tx), ...(pr?.verifyText ? { verifyText: pr.verifyText } : {}) };
            w.release = pr?.headSha ? { state: 'merging', pr: { number: pr.number, url: pr.url, headSha: pr.headSha }, ...base } : { state: 'not_seen', reason: 'manual', ...base };
          }
          w.results[index - 1] = { ...output, approvedAt: at, approvedBy: actor };
          await this.put(this.key('review', project, taskId, randomUUID()), { kind: 'stage', stageKey: stage.key, stageIndex: index, artifactVersionId: output.id, decision: 'approve', checklist: checked, reviewerId: actor, at }, tx);
          await this.enterFlowStage(project, taskId, task, w, index + 1, tx, actor, at);
          if (v.next) {
            // Hand-over: the accepted document becomes the brief of a new task with the next playbook (not started).
            if (w.stage !== 'done' || w.playbook?.kind !== 'plan' || !w.playbook.next.includes(v.next) || w.nextTaskId) return fail('这一步不能接着交给其他做法', 409);
            const p = await this.playbooks.get(project, v.next, tx), accepted = w.results[index - 1]!;
            const child = await this.repo('nrTasks').create({ values: { projectId: project, taskKey: `handoff:${taskId}:${randomUUID()}`, title: `${p.name}：${task.title}`.slice(0, 200), brief: `任务说明（来自任务“${task.title}”交付的文档）：\n\n${accepted.content}`.slice(0, 30000), status: '待处理', evidence: { source: '串联任务', insight: task.evidence?.insight || null, context: task.evidence?.context || null, handoff: { taskId, playbook: w.playbook.name, artifactId: accepted.id, content: accepted.content }, work: { schemaVersion: 2, revision: 0, stage: 'plan', plan: null, planVersion: 0, step: 0, results: [], history: [{ at, actor, action: 'handoff', note: w.playbook.name }], operations: [], receipt: null, verification: null, playbookId: p.id, prevTaskId: taskId, ...(task.evidence?.work?.contentId ? { contentId: task.evidence.work.contentId } : {}) } } }, transaction: tx });
            w.nextTaskId = String(child.get ? child.get('id') : child.id); event.note = p.name; event.nextTaskId = w.nextTaskId;
          }
        } else {
          const comment = text(v.comment, 3000); event.comment = comment;
          w.results[index - 1] = { ...output, rejectedAt: at };
          // Feedback is filed under the stage that redoes the work, so its next run reads it.
          await this.put(this.key('review', project, taskId, randomUUID()), { kind: 'stage', stageKey: producer.key, stageIndex: index - 1, artifactVersionId: output.id, decision: 'requestChanges', comment, reviewerId: actor, at }, tx);
          await this.enterFlowStage(project, taskId, task, w, index - 1, tx, actor, at);
        }
      } else if (v.command === 'editStageOutput') {
        const { index } = this.flowStage(w, v.stageKey, ['review']), producer = w.flow!.stages[index - 1], output = w.results[index - 1];
        if (!output || output.id !== v.artifactId || output.rejectedAt) return fail('内容已更新，请刷新后再保存', 409);
        const artifact = await this.flowArtifact(project, taskId, producer.key, text(v.content), actor, at, tx);
        w.results[index - 1] = artifact; event.artifactId = artifact.id;
      } else if (v.command === 'recordManual') {
        // Until the local Agent is connected, a person can make the repository change and record what was done.
        const { stage, index } = this.flowStage(w, v.stageKey, ['agent']);
        for (const r of (await this.list('run', project, taskId, tx)) as Run[]) {
          if (r.status === 'running') return fail('本机 Agent 正在执行这一步，请等待结果或先停止', 409);
          if (r.status === 'queued') await this.put(this.key('run', project, taskId, r.id), { ...r, status: 'failed', error: 'replaced_by_manual', endedAt: at }, tx);
        }
        const artifact = { ...(await this.flowArtifact(project, taskId, stage.key, text(v.content, 10000), actor, at, tx)), manual: true };
        await this.put(this.key('artifact', project, taskId, artifact.id), artifact, tx);
        w.results[index] = artifact; event.artifactId = artifact.id;
        await this.enterFlowStage(project, taskId, task, w, index + 1, tx, actor, at);
      } else if (v.command === 'retryStage') {
        const { stage } = this.flowStage(w, v.stageKey, ['ai', 'agent']);
        if (stage.kind === 'ai') await this.queueFlowRun(project, taskId, task, w, tx, actor, at);
        else await this.queueAgentRun(project, taskId, task, w, tx, actor, at);
      } else if (v.command === 'cancelRun') {
        // A queued run is dropped at once; a running one is stopped by the Agent program, which pushes nothing.
        const r = ((await this.list('run', project, taskId, tx)) as Run[]).find(x => x.id === v.runId && active(x) && x.executorKind === 'local');
        if (!r) return fail('没有可以停止的运行', 409);
        await this.put(this.key('run', project, taskId, r.id), r.status === 'queued' ? { ...r, status: 'failed', error: 'cancelled', endedAt: at } : { ...r, cancelRequested: true }, tx);
        event.runId = r.id;
      } else if (['retryMerge', 'markMerged', 'confirmLive', 'waitLonger'].includes(v.command)) {
        const { index } = this.flowStage(w, v.stageKey, ['release']), r = w.release;
        if (!r) return fail('没有要发布的内容', 409);
        if (v.command === 'retryMerge') { if (r.state !== 'merge_failed') return fail('现在不需要重新合并', 409); await this.queueMergeRun(project, taskId, task, w, tx, actor, at); }
        else if (v.command === 'markMerged') {
          // You merged on GitHub yourself; the live check continues as usual.
          if (r.state !== 'merge_failed' && r.state !== 'merging') return fail('PR 已经合并', 409);
          if ((await this.list('run', project, taskId, tx) as Run[]).some(x => x.status === 'running')) return fail('本机 Agent 正在合并，请等待结果', 409);
          for (const x of (await this.list('run', project, taskId, tx)) as Run[]) if (x.status === 'queued') await this.put(this.key('run', project, taskId, x.id), { ...x, status: 'failed', error: 'replaced_by_manual', endedAt: at }, tx);
          w.release = { ...r, state: r.verifyText && r.pages.length ? 'verifying' : 'not_seen', ...(r.verifyText && r.pages.length ? {} : { reason: 'cannot_verify' }), error: undefined, mergedAt: at, checks: 0, nextCheckAt: at, deadline: new Date(Date.now() + 24 * HOUR).toISOString() };
        } else if (v.command === 'confirmLive') { if (r.state !== 'verifying' && r.state !== 'not_seen') return fail('PR 还没有合并', 409); await this.goLive(project, taskId, task, w, tx, actor, at); }
        else { if (r.state !== 'not_seen' || r.reason) return fail('现在不需要再等', 409); w.release = { ...r, state: 'verifying', nextCheckAt: at, deadline: new Date(Date.now() + 24 * HOUR).toISOString() }; }
        void index;
      } else if (v.command === 'revertRelease') {
        // 撤回: only a change merged through its PR can be undone this way; the revert PR is reviewed and merged on GitHub.
        const r = w.release, repo = (await this.agents.doc(project, tx)).repo;
        if (!r?.pr || !r.mergedAt) return fail('只有已合并的改动可以撤回', 409);
        if (!repo) return fail('请先在“数据接入 → 网站源码”里接入仓库', 409);
        if (w.revert && w.revert.state !== 'failed') return fail('已经开过回退 PR', 409);
        if ((await this.list('run', project, taskId, tx) as Run[]).some(active)) return fail('当前任务已有运行，请等待结果', 409);
        await this.queueRevertRun(project, taskId, task, w, r.pr, tx, actor, at); event.note = `PR #${r.pr.number}`;
      } else if (v.command === 'cancelTask') {
        // Stops the work: queued runs are dropped, a running local Agent is told to stop, an open PR is closed by the
        // local Agent (its branch stays). Finished tasks are archived, not cancelled.
        if (w.stage === 'done') return fail('任务已完成，可以归档', 409);
        for (const r of (await this.list('run', project, taskId, tx)) as Run[]) {
          if (r.status === 'queued') await this.put(this.key('run', project, taskId, r.id), { ...r, status: 'failed', error: 'cancelled', endedAt: at }, tx);
          else if (r.status === 'running' && r.executorKind === 'local') await this.put(this.key('run', project, taskId, r.id), { ...r, cancelRequested: true }, tx);
        }
        w.cancelledAt = at; w.cancelledBy = actor; w.boardState = undefined; event.note = optional(v.reason, 500) || undefined;
        const pr = [...w.results].reverse().find(a => a?.pr)?.pr, repo = (await this.agents.doc(project, tx)).repo;
        if (pr && repo && w.release?.state !== 'live' && !w.release?.mergedAt) await this.queueCloseRun(project, taskId, w, pr, tx, actor, at);
      } else if (v.command === 'archiveTask') {
        if ((await this.list('run', project, taskId, tx) as Run[]).some(r => active(r) && r.mode !== 'close')) return fail('执行者还在运行，请等它结束', 409);
        const started = w.stage === 'flow' || (w.stage === 'work' && w.plan) || w.stage === 'execution' || w.stage === 'verification';
        // Live and being observed counts as done: it can be put away (the observation keeps its results).
        const live = w.stage === 'flow' && w.flow?.stages[w.stageIndex || 0]?.kind === 'observe';
        if (started && !w.cancelledAt && !live) return fail('任务进行中，请先停止再关闭', 409);
        w.archivedAt = at; w.archivedBy = actor;
      } else if (v.command === 'unarchiveTask') {
        if (!w.archivedAt) return fail('任务没有归档', 409);
        w.archivedAt = undefined; w.archivedBy = undefined;
      } else if (v.command === 'confirmPublish') {
        const { index } = this.flowStage(w, v.stageKey, ['publish']);
        let url = '';
        if (v.url) { try { const u = new URL(text(v.url, 2000)); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error(); url = u.href; } catch { return fail('请填写有效的页面网址'); } }
        w.receipt = { note: text(v.note, 5000), url, recordedAt: at, recordedBy: actor };
        await this.enterFlowStage(project, taskId, task, w, index + 1, tx, actor, at);
      } else return fail('不支持此操作');
      w.history.push(event);
      await this.save(task, w, tx); await this.put(opKey, { hash, at, actor }, tx);
      return this.view(project, taskId, tx);
    });
  }
  async claim(run: Run, opts: { computerId?: string; leaseMs?: number } = {}): Promise<Run | null> {
    return this.lock(run.projectId, run.taskId, async tx => {
      const key = this.key('run', run.projectId, run.taskId, run.id), fresh: Run = await this.snapshot(key, tx);
      if (!fresh || fresh.status !== 'queued') return null;
      const task = await this.task(run.projectId, run.taskId, tx), w = projectWork(task);
      // Closing a cancelled task's PR belongs to a cancelled task, and a revert to a finished one.
      if (fresh.mode === 'close' ? !w.cancelledAt : fresh.mode === 'revert' ? w.revert?.state !== 'opening' : !canApplyRun(w, fresh)) {
        fresh.status = 'failed'; fresh.error = 'context_changed'; fresh.endedAt = now();
      } else { fresh.status = 'running'; fresh.startedAt = now(); fresh.expiresAt = new Date(Date.now() + (opts.leaseMs || 300000)).toISOString(); if (opts.computerId) fresh.computerId = opts.computerId; }
      await this.put(key, fresh, tx); w.latestRun = { id: fresh.id, status: fresh.status };
      w.history.push({ at: now(), actor: 'system', action: fresh.status === 'running' ? 'runStarted' : 'runFailed', runId: fresh.id });
      await this.save(task, w, tx);
      return fresh.status === 'running' ? fresh : null;
    });
  }
  async finish(run: Run, result?: { content: string; usage?: any; pr?: any }, error?: string) {
    return this.lock(run.projectId, run.taskId, async tx => {
      const key = this.key('run', run.projectId, run.taskId, run.id), fresh: Run = await this.snapshot(key, tx);
      if (!fresh || fresh.status !== 'running') return;
      const task = await this.task(run.projectId, run.taskId, tx), w = projectWork(task);
      const stale = !canApplyRun(w, fresh);
      fresh.endedAt = now(); fresh.status = result ? 'succeeded' : 'failed';
      if (result) {
        // Preserve a late result as a candidate even if a human edited or replanned meanwhile.
        const artifact: Artifact = { id: randomUUID(), stepId: run.stepId, planVersion: run.planVersion, version: 1 + Math.max(0, ...(await this.list('artifact', run.projectId, run.taskId, tx)).filter(a => a.stepId === run.stepId && a.planVersion === run.planVersion).map(a => a.version)), content: text(result.content), createdAt: now(), createdBy: 'atlas', runId: run.id , ...(result.pr ? { pr: result.pr } : {}) };
        await this.put(this.key('artifact', run.projectId, run.taskId, artifact.id), artifact, tx);
        fresh.artifactId = artifact.id; fresh.usage = result.usage;
        if (!stale) { w.results[run.flowStage ?? w.step] = artifact; w.boardState=undefined; }
        else fresh.error = 'candidate_only_context_changed';
      } else fresh.error = error || 'provider_failed_or_unknown';
      await this.put(key, fresh, tx); w.latestRun = { id: fresh.id, status: fresh.status };
      w.history.push({ at: now(), actor: 'system', action: result ? 'runSucceeded' : 'runFailed', runId: fresh.id, artifactId: fresh.artifactId, note: fresh.error });
      // A finished online AI stage hands over to the next stage; if that one cannot start, the task waits there for a retry.
      if (result && !stale && run.flowStage !== undefined) {
        try { await this.enterFlowStage(run.projectId, run.taskId, task, w, run.flowStage + 1, tx, run.actor, now()); }
        catch (e: any) { w.history.push({ at: now(), actor: 'system', action: 'flowWaiting', note: String(e?.message || '下一阶段未能开始').slice(0, 200) }); }
      }
      await this.save(task, w, tx);
    });
  }
  async tick() {
    if (this.busy || this.stopped) return; this.busy = true;
    try {
      // Durable queue: scan bounded pages; restarting never resubmits a running request.
      for (let offset = 0; !this.stopped; offset += 100) {
        const rows = await this.repo('nrSnapshots').find({ filter: { key: { $startsWith: 'nr-task-run:' } }, sort: 'id', limit: 100, offset });
        for (const row of rows) {
          const r: Run = row.get('payload');
          if (r.status === 'running' && Date.parse(r.expiresAt || '') < Date.now()) await this.finish(r, undefined, 'interrupted_or_unknown');
          if (r.status !== 'queued' || r.executorKind === 'local') continue;
          const claimed = await this.claim(r); if (!claimed) continue;
          try {
            const project = await this.p.project(claimed.projectId); await this.authorized(claimed.actor); await this.authorized(claimed.ownerId);
            if (claimed.protocolVersion !== 1 || claimed.capabilitySnapshot.join(',') !== 'context.read,text.generate') return fail('执行能力快照不兼容', 409);
            const result = await this.provider.invoke(claimed, languageOf(project));
            await this.p.project(claimed.projectId); await this.authorized(claimed.actor); await this.authorized(claimed.ownerId);
            await this.finish(claimed, result);
          } catch { await this.finish(claimed, undefined, 'provider_failed_or_unknown'); }
          return;
        }
        if (rows.length < 100) break;
      }
      if (Date.now() - this.lastVerify > 5 * 60000) { this.lastVerify = Date.now(); await this.verifyReleases().catch(() => undefined); }
      if (!this.legacyDone) { this.legacyDone = true; await this.archiveLegacy().catch(() => { this.legacyDone = false; }); }
      if (Date.now() - this.lastEffects > HOUR) { this.lastEffects = Date.now(); await this.observeEffects().catch(() => undefined); }
    } finally { this.busy = false; }
  }
  stop() { this.stopped = true; }
  // The NocoReach Agent program's side. It authenticates with its computer key; runs are claimed one at a time.
  async agentClaim(project: string, computerId: string) {
    const rows: Run[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await this.repo('nrSnapshots').find({ filter: { key: { $startsWith: `nr-task-run:${project}:` } }, sort: 'id', limit: 100, offset });
      rows.push(...page.map((r: any) => r.get('payload'))); if (page.length < 100) break;
    }
    for (const r of rows.filter(x => x.executorKind === 'local' && x.status === 'queued')) {
      const claimed = await this.claim(r, { computerId, leaseMs: 900000 });
      // The project's 知识库 and Skills (the step's own and the ones turned on) travel with the run, not stored in it: the
      // program writes them outside the repository for the Agent.
      if (claimed) {
        const input = JSON.parse(claimed.input), agentStep = claimed.mode === 'plan' || claimed.mode === 'build';
        const knowledge = agentStep && this.p.knowledge ? await this.p.knowledge.forAgent(project).catch(() => []) : [];
        const skills = agentStep && this.p.skills ? await this.p.skills.forAgent(project, Array.isArray(input.stage?.skills) ? input.stage.skills : []).catch(() => []) : [];
        return { run: { id: claimed.id, taskId: claimed.taskId, mode: claimed.mode, branch: claimed.branch, input, knowledge, skills } };
      }
    }
    return { run: null };
  }
  private async ownRun(project: string, computerId: string, v: any, tx?: any): Promise<Run> {
    if (!ID.test(String(v?.taskId)) || typeof v?.runId !== 'string') return fail('运行不存在', 404);
    const r: Run = await this.snapshot(this.key('run', project, String(v.taskId), v.runId), tx);
    if (!r || r.executorKind !== 'local' || r.computerId !== computerId) return fail('运行不存在', 404);
    return r;
  }
  // Progress lines from the Agent; each report renews the lease and tells the program whether to stop.
  async agentEvents(project: string, computerId: string, v: any) {
    return this.lock(project, String(v?.taskId), async tx => {
      const r = await this.ownRun(project, computerId, v, tx);
      if (r.status !== 'running') return { stop: true, status: r.status };
      const key = this.key('events', project, r.taskId, r.id), doc = (await this.snapshot(key, tx)) || { events: [] };
      const types = ['text', 'tool', 'status', 'error'];
      const clean = (Array.isArray(v.events) ? v.events : []).slice(0, 50).map((e: any) => ({ at: typeof e?.at === 'string' ? e.at.slice(0, 30) : now(), type: types.includes(e?.type) ? e.type : 'status', text: String(e?.text || '').slice(0, 500) })).filter((e: any) => e.text);
      doc.events = [...doc.events, ...clean].slice(-300);
      await this.put(key, doc, tx);
      await this.put(this.key('run', project, r.taskId, r.id), { ...r, expiresAt: new Date(Date.now() + 900000).toISOString() }, tx);
      return { stop: Boolean(r.cancelRequested), status: r.status };
    });
  }
  // The result: a plan (plan step) or the PR the program opened on the task's branch (build step).
  async agentFinish(project: string, computerId: string, v: any) {
    const r = await this.ownRun(project, computerId, v);
    if (r.status !== 'running') return { accepted: false, status: r.status };
    if (r.mode === 'merge') return this.finishMerge(r, v);
    if (r.mode === 'close') return this.finishClose(r, v);
    if (r.mode === 'revert') return this.finishRevert(r, v);
    if (!v.ok) { await this.finish(r, undefined, typeof v.error === 'string' && /^[a-z_]{1,40}$/.test(v.error) ? v.error : 'agent_failed'); return { accepted: true }; }
    let pr: any;
    if (r.mode === 'build') {
      const repo = (await this.agents.doc(project)).repo, p = v.pr || {};
      if (!repo) return fail('仓库设置已被移除', 409);
      if (typeof p.url !== 'string' || !p.url.startsWith(`https://github.com/${repo.repo}/pull/`) || !Number.isSafeInteger(p.number) || p.branch !== r.branch) return fail('PR 必须开在登记的仓库、使用这个任务的分支', 400);
      const files = (Array.isArray(p.files) ? p.files : []).slice(0, 300).map((f: any) => ({ path: String(f?.path || '').slice(0, 300), additions: Number.isSafeInteger(f?.additions) ? f.additions : 0, deletions: Number.isSafeInteger(f?.deletions) ? f.deletions : 0 })).filter((f: any) => f.path);
      pr = { url: p.url, number: p.number, branch: p.branch, ...(typeof p.headSha === 'string' && /^[0-9a-f]{7,40}$/.test(p.headSha) ? { headSha: p.headSha } : {}), files, ...(p.checks && typeof p.checks.ok === 'boolean' ? { checks: { ok: p.checks.ok, summary: String(p.checks.summary || '').slice(0, 2000) } } : {}), outOfScope: files.map((f: any) => f.path).filter((f: string) => !allowedPath(repo, f)) };
      const release = optional(p.release, 2000), verifyText = optional(p.verifyText, 200), pages = (Array.isArray(p.pages) ? p.pages : []).map((x: unknown) => optional(x, 500)).filter(Boolean).slice(0, 10), changes = cleanChanges(p.changes);
      Object.assign(pr, release ? { release } : {}, verifyText ? { verifyText } : {}, pages.length ? { pages } : {}, changes.length ? { changes } : {});
    }
    await this.finish(r, { content: text(v.content, 30000), ...(pr ? { pr } : {}) });
    return { accepted: true };
  }
  // The merge result: merged at the reviewed commit (then the live check starts) or why it could not be merged.
  private async finishMerge(r: Run, v: any) {
    return this.lock(r.projectId, r.taskId, async tx => {
      const key = this.key('run', r.projectId, r.taskId, r.id), fresh: Run = await this.snapshot(key, tx);
      if (!fresh || fresh.status !== 'running') return { accepted: false, status: fresh?.status };
      const task = await this.task(r.projectId, r.taskId, tx), w = projectWork(task), at = now(), rel = w.release;
      const current = canApplyRun(w, fresh) && rel?.state === 'merging';
      fresh.endedAt = at; fresh.status = v.ok ? 'succeeded' : 'failed';
      if (!v.ok) {
        fresh.error = typeof v.error === 'string' && /^[a-z_]{1,40}$/.test(v.error) ? v.error : 'merge_failed';
        if (current) w.release = { ...rel!, state: 'merge_failed', error: optional(v.message, 300) || '合并没有完成' };
      } else if (current) {
        const sha = typeof v.merged?.sha === 'string' && /^[0-9a-f]{7,40}$/.test(v.merged.sha) ? v.merged.sha : undefined, can = Boolean(rel!.verifyText && rel!.pages.length);
        w.release = { ...rel!, state: can ? 'verifying' : 'not_seen', ...(can ? {} : { reason: 'cannot_verify' }), mergedAt: at, ...(sha ? { mergeSha: sha } : {}), checks: 0, nextCheckAt: at, deadline: new Date(Date.now() + 24 * HOUR).toISOString() };
      } else fresh.error = 'candidate_only_context_changed';
      await this.put(key, fresh, tx); w.latestRun = { id: fresh.id, status: fresh.status };
      w.history.push({ at, actor: 'system', action: v.ok ? 'merged' : 'runFailed', runId: fresh.id, note: v.ok ? `PR #${rel?.pr?.number}` : fresh.error });
      await this.save(task, w, tx);
      return { accepted: true };
    });
  }
  // Open PRs waiting for review whose preview link is not known yet; the Agent program looks them up on GitHub.
  async agentWatch(project: string) {
    const out: any[] = [];
    for (let offset = 0; ; offset += 100) {
      const rows = await this.repo('nrTasks').find({ filter: { projectId: project }, sort: 'id', limit: 100, offset });
      for (const row of rows) {
        const t = row.toJSON ? row.toJSON() : row, w = projectWork(t), i = w.stageIndex ?? 0, st = w.flow?.stages[i], out0 = w.results[i - 1];
        if (w.stage === 'flow' && st?.kind === 'review' && out0?.pr?.headSha && !out0.pr.previewUrl && Date.now() - Date.parse(out0.createdAt) < 6 * HOUR) out.push({ taskId: String(t.id), artifactId: out0.id, pr: out0.pr.number, headSha: out0.pr.headSha });
      }
      if (rows.length < 100) break;
    }
    return { items: out.slice(0, 5) };
  }
  async agentPreview(project: string, v: any) {
    const url = httpsUrl(v?.url); if (!url || !ID.test(String(v?.taskId))) return fail('预览链接无效');
    return this.lock(project, String(v.taskId), async tx => {
      const task = await this.task(project, String(v.taskId), tx), w = projectWork(task), i = w.stageIndex ?? 0, out = w.results[i - 1];
      if (!out?.pr || out.id !== v.artifactId) return { accepted: false };
      w.results[i - 1] = { ...out, pr: { ...out.pr, previewUrl: url } };
      await this.put(this.key('artifact', project, String(v.taskId), out.id), w.results[i - 1], tx);
      await this.save(task, w, tx);
      return { accepted: true };
    });
  }
  async createContentWork(project:string,v:any,actor:string) {
    if(!/^[a-f0-9]{64}$/.test(v.contentId||'')||!/^[a-zA-Z0-9-]{20,80}$/.test(v.requestId||'')) return fail('内容或请求编号无效');
    return this.lock(project,'content-create',async tx=>{
      const key=this.key('content-create',project,'index',v.requestId),previous=await this.snapshot(key,tx);
      if(previous){if(previous.contentId!==v.contentId||previous.actor!==actor)return fail('请求标识已被使用',409);return this.task(project,String(previous.taskId),tx);}
      const content=await this.snapshot(this.key('content',project,'index',v.contentId),tx);if(!content)return fail('内容不存在',404);
      const row=await this.repo('nrTasks').create({values:{projectId:project,taskKey:'content:'+randomUUID(),title:'优化 '+content.title,brief:'检查并优化页面：'+content.url+'。请在执行前确认具体修改范围。',status:'待处理',evidence:{content:{id:content.id,url:content.url,repository:content.repository,paths:content.paths},work:{...projectWork({}),contentId:content.id}}},transaction:tx});
      await this.put(key,{taskId:row.id,contentId:v.contentId,actor},tx);return row.toJSON();
    });
  }
  async contentList(project: string) { return this.list('content',project,'index'); }
  // The page a run works on: the page linked from 网站内容, or an older content-index entry.
  private async contentOf(project: string, w: Work, tx: any) { return w.page ? { url: w.page.url, title: w.page.title } : w.contentId ? await this.snapshot(this.key('content', project, 'index', w.contentId), tx) : null; }
  // People who can own or join a task: the application's users (single project trial; roles decide access).
  async members() {
    const rows = await this.repo('users').find({ fields: ['id', 'nickname', 'username', 'email'], sort: ['id'], limit: 200 });
    return rows.map((r: any) => { const u = r.toJSON ? r.toJSON() : r; return { id: String(u.id), name: u.nickname || u.username || u.email || `用户 ${u.id}` }; });
  }
  private async member(id: unknown, tx: any) {
    if (typeof id !== 'string' && typeof id !== 'number') return fail('请选择成员');
    const r = await this.repo('users').findOne({ filterByTk: id, transaction: tx });
    if (!r) return fail('成员不存在', 404);
    const u = r.toJSON ? r.toJSON() : r; return { id: String(u.id), name: u.nickname || u.username || u.email || `用户 ${u.id}` };
  }
  // Pages from the 网站内容 data source matching a search, for linking a task to the page it changes.
  async pages(project: string, q: unknown) {
    const s = await this.snapshot(`site-content:${project}`), all: any[] = Array.isArray(s?.pages) ? s.pages : [];
    const term = typeof q === 'string' ? q.trim().toLowerCase().slice(0, 100) : '';
    return all.filter(p => !term || `${p.url} ${p.title || ''}`.toLowerCase().includes(term)).slice(0, 20).map(p => ({ url: String(p.url), title: String(p.title || ''), type: String(p.type || '') }));
  }
  async contentSave(project: string, v: any, actor: string) {
    const context=await this.p.project(project);
    const entry=contentInput(v,context.domains || []);
    return this.lock(project,'content-index',async tx=>{
      const key=this.key('content',project,'index',entry.id),old=await this.snapshot(key,tx);
      if(v.revision!==(old?.revision || 0)) return fail('内容映射已更新，请重新读取后保存',409);
      const saved={...entry,revision:(old?.revision||0)+1,updatedAt:now(),updatedBy:actor};
      await this.put(key,saved,tx);return saved;
    });
  }
  register() {
    const wrap = (fn: (project: string, v: any, ctx: any) => Promise<any>) => async (ctx: any, next: any) => {
      if (!ctx.auth?.user?.id) ctx.throw(401, '请先登录');
      if (!(ctx.state.currentRoles || []).some((r: string) => ['root', 'admin'].includes(r))) ctx.throw(403, '当前任务试运行仅开放给管理员');
      try {
        const v = ctx.action.params.values || {}, project = String(v.projectId || '');
        if (!ID.test(project)) return fail('项目标识无效');
        await this.p.project(project); ctx.body = await fn(project, v, ctx); await next();
      } catch (e: any) { ctx.throw(e.status || 502, e.status ? e.message : '任务请求未完成，编辑保留，请核对保存状态。'); }
    };
    const update = (project: string, v: any, c: any) => this.update(project, v, String(c.auth.user.id), c.auth.user.nickname || c.auth.user.username || String(c.auth.user.id));
    this.p.app.resourceManager.define({ name:'nrContentIndex', actions:{createWork:wrap((p,v,c)=>this.createContentWork(p,v,String(c.auth.user.id))),list:wrap(p=>this.contentList(p)),save:wrap((p,v,c)=>this.contentSave(p,v,String(c.auth.user.id)))} });
    this.p.app.acl.allow('nrContentIndex',['list','save','createWork'],'loggedIn');
    this.p.app.resourceManager.define({ name: 'nrPlaybooks', actions: { list: wrap(p => this.playbooks.list(p)), save: wrap((p, v) => this.playbooks.save(p, v)), copy: wrap((p, v) => this.playbooks.copy(p, v)), remove: wrap((p, v) => this.playbooks.remove(p, v)), restore: wrap((p, v) => this.playbooks.restore(p, v)), draft: wrap(async (p, v) => draftPlaybook(v, await this.playbooks.list(p), await this.p.project(p), (system: string, user: string) => this.provider.complete(system, user))) } });
    this.p.app.acl.allow('nrPlaybooks', ['list', 'save', 'copy', 'remove', 'restore', 'draft'], 'loggedIn');
    this.p.app.resourceManager.define({ name: 'nrAgent', actions: { status: wrap(p => this.agents.status(p)), connect: wrap((p, v) => this.agents.connect(p, v)), revoke: wrap((p, v) => this.agents.revoke(p, v)), saveRepo: wrap((p, v) => this.agents.saveRepo(p, v)), removeRepo: wrap((p, v) => this.agents.removeRepo(p, v)) } });
    this.p.app.acl.allow('nrAgent', ['status', 'connect', 'revoke', 'saveRepo', 'removeRepo'], 'loggedIn');
    // Called by the NocoReach Agent program, not by a signed-in person: the computer key in x-nr-agent-key is the credential.
    const daemon = (fn: (project: string, v: any, computerId: string, repo: any) => Promise<any>) => async (ctx: any, next: any) => {
      try {
        const v = ctx.action.params.values || {}, project = String(v.projectId || '');
        if (!ID.test(project)) return fail('项目标识无效');
        await this.p.project(project);
        const auth = await this.agents.authenticate(project, ctx.get('x-nr-agent-key'), v.agent);
        ctx.body = await fn(project, v, auth.computer.id, auth.repo); await next();
      } catch (e: any) { ctx.throw(e.status || 502, e.status ? e.message : '请求未完成，请稍后重试。'); }
    };
    this.p.app.resourceManager.define({ name: 'nrAgentDaemon', actions: { heartbeat: daemon(async (_p, _v, id, repo) => ({ computerId: id, repo, pollMs: 5000 })), claim: daemon((p, _v, id) => this.agentClaim(p, id)), events: daemon((p, v, id) => this.agentEvents(p, id, v)), finish: daemon((p, v, id) => this.agentFinish(p, id, v)), watch: daemon(p => this.agentWatch(p)), preview: daemon((p, v) => this.agentPreview(p, v)) } });
    this.p.app.acl.allow('nrAgentDaemon', ['heartbeat', 'claim', 'events', 'finish', 'watch', 'preview'], 'public');
    this.p.app.resourceManager.define({ name: 'nrTaskWork', actions: { get: wrap((p, v) => this.get(p, String(v.taskId))), advance: wrap(update), members: wrap(() => this.members()), pages: wrap((p, v) => this.pages(p, v.q)) } });
    this.p.app.acl.allow('nrTaskWork', ['get', 'advance', 'members', 'pages'], 'loggedIn');
    this.p.app.resourceManager.define({ name: 'nrTaskRuns', actions: { start: wrap((p, v, c) => update(p, { ...v, command: 'startRun' }, c)), get: wrap((p, v) => this.get(p, String(v.taskId))) } });
    this.p.app.acl.allow('nrTaskRuns', ['start', 'get'], 'loggedIn');
  }
}
