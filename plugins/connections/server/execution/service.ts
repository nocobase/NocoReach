import { randomUUID } from 'node:crypto';
import { fail, text, digest, boardState, contentInput, projectWork, planInput, currentStep, assertReview, makeArtifact, canApplyRun, type Work, type Run, type Artifact } from './model';
import { OnlineProvider } from './provider';
// Host repository types vary across NocoBase releases; dynamic access is confined to this adapter.
const now = () => new Date().toISOString();
const active = (r: Run) => r.status === 'queued' || r.status === 'running';
const ID = /^[1-9]\d{0,15}$/;
export class TaskService {
  private busy = false;
  private stopped = false;
  readonly provider: OnlineProvider;
  constructor(readonly p: any, provider?: OnlineProvider) { this.provider = provider || new OnlineProvider(p); }
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
    await this.repo('nrTasks').update({ filterByTk: task.id, values: { evidence: { ...task.evidence, work: w }, status: ({todo:'待处理',doing:'进行中',review:'待确认',done:'已完成'})[boardState(w)] }, transaction: tx });
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
    return { task, content, work, runs: runs.map(({ input, ...r }) => r), artifacts: artifacts.length ? artifacts : work.results.filter(Boolean), reviews };
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
      const at = now(), event: any = { at, actor, action: v.command, stage: w.stage, step: w.step };
      if (v.command === 'moveWork') {
        if (!['todo','doing','review','done'].includes(v.state)) return fail('工作状态无效');
        const from = boardState(w);
        const runs: Run[] = await this.list('run', project, taskId, tx);
        if (from !== v.state && runs.some(active)) return fail('请等待当前执行结束，再调整工作状态', 409);
        if (from !== v.state && v.state === 'review' && !w.results.some(a => a && !a.rejectedAt)) return fail('请先保存可供确认的成果', 409);
        if (from !== v.state && v.state === 'done') {
          if (v.confirm !== true) return fail('请确认工作完成；移动不会发布内容', 409);
          if (w.kind === 'research') {
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
      } else return fail('不支持此操作');
      w.history.push(event);
      await this.save(task, w, tx); await this.put(opKey, { hash, at, actor }, tx);
      return this.view(project, taskId, tx);
    });
  }
  async claim(run: Run): Promise<Run | null> {
    return this.lock(run.projectId, run.taskId, async tx => {
      const key = this.key('run', run.projectId, run.taskId, run.id), fresh: Run = await this.snapshot(key, tx);
      if (!fresh || fresh.status !== 'queued') return null;
      const task = await this.task(run.projectId, run.taskId, tx), w = projectWork(task);
      if (!canApplyRun(w, fresh)) {
        fresh.status = 'failed'; fresh.error = 'context_changed'; fresh.endedAt = now();
      } else { fresh.status = 'running'; fresh.startedAt = now(); fresh.expiresAt = new Date(Date.now() + 300000).toISOString(); }
      await this.put(key, fresh, tx); w.latestRun = { id: fresh.id, status: fresh.status };
      w.history.push({ at: now(), actor: 'system', action: fresh.status === 'running' ? 'runStarted' : 'runFailed', runId: fresh.id });
      await this.save(task, w, tx);
      return fresh.status === 'running' ? fresh : null;
    });
  }
  async finish(run: Run, result?: { content: string; usage?: any }, error?: string) {
    return this.lock(run.projectId, run.taskId, async tx => {
      const key = this.key('run', run.projectId, run.taskId, run.id), fresh: Run = await this.snapshot(key, tx);
      if (!fresh || fresh.status !== 'running') return;
      const task = await this.task(run.projectId, run.taskId, tx), w = projectWork(task);
      const stale = !canApplyRun(w, fresh);
      fresh.endedAt = now(); fresh.status = result ? 'succeeded' : 'failed';
      if (result) {
        // Preserve a late result as a candidate even if a human edited or replanned meanwhile.
        const artifact: Artifact = { id: randomUUID(), stepId: run.stepId, planVersion: run.planVersion, version: 1 + Math.max(0, ...(await this.list('artifact', run.projectId, run.taskId, tx)).filter(a => a.stepId === run.stepId && a.planVersion === run.planVersion).map(a => a.version)), content: text(result.content), createdAt: now(), createdBy: 'atlas', runId: run.id };
        await this.put(this.key('artifact', run.projectId, run.taskId, artifact.id), artifact, tx);
        fresh.artifactId = artifact.id; fresh.usage = result.usage;
        if (!stale) { w.results[w.step] = artifact; w.boardState=undefined; }
        else fresh.error = 'candidate_only_context_changed';
      } else fresh.error = error || 'provider_failed_or_unknown';
      await this.put(key, fresh, tx); w.latestRun = { id: fresh.id, status: fresh.status };
      w.history.push({ at: now(), actor: 'system', action: result ? 'runSucceeded' : 'runFailed', runId: fresh.id, artifactId: fresh.artifactId, note: fresh.error });
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
          if (r.status !== 'queued') continue;
          const claimed = await this.claim(r); if (!claimed) continue;
          try {
            await this.p.project(claimed.projectId); await this.authorized(claimed.actor); await this.authorized(claimed.ownerId);
            if (claimed.protocolVersion !== 1 || claimed.capabilitySnapshot.join(',') !== 'context.read,text.generate') return fail('执行能力快照不兼容', 409);
            const result = await this.provider.invoke(claimed);
            await this.p.project(claimed.projectId); await this.authorized(claimed.actor); await this.authorized(claimed.ownerId);
            await this.finish(claimed, result);
          } catch { await this.finish(claimed, undefined, 'provider_failed_or_unknown'); }
          return;
        }
        if (rows.length < 100) break;
      }
    } finally { this.busy = false; }
  }
  stop() { this.stopped = true; }
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
    this.p.app.resourceManager.define({ name: 'nrTaskWork', actions: { get: wrap((p, v) => this.get(p, String(v.taskId))), advance: wrap(update) } });
    this.p.app.acl.allow('nrTaskWork', ['get', 'advance'], 'loggedIn');
    this.p.app.resourceManager.define({ name: 'nrTaskRuns', actions: { start: wrap((p, v, c) => update(p, { ...v, command: 'startRun' }, c)), get: wrap((p, v) => this.get(p, String(v.taskId))) } });
    this.p.app.acl.allow('nrTaskRuns', ['start', 'get'], 'loggedIn');
  }
}
