// @ts-nocheck
import { randomUUID } from 'node:crypto';
import { systemMessageText } from '../../../shared/i18n/messages.js';
import { supportsStatus, type ArticleSnapshot, type ArticleTarget } from '../../../shared/article-publishing.js';
import { articlePages, verifyPhrase, type ArticleDelivery, type ArticleProposal, type PublishOutcome } from '../articles/delivery.js';
import { ArticleError, providerErrorKey } from '../articles/provider.js';
import { fail, projectWork, type Artifact, type Work } from './model';

// Article delivery inside the task flow (docs/ARTICLE-PUBLISHING.md). A task linked to a publishing target writes a
// structured article in its change step instead of a pull request; the approved version is published by the server.
// Target I/O happens outside business transactions; each state change is rechecked and saved under the task lock.

const HOUR = 3600000;
const now = () => new Date().toISOString();
const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
// Published articles are watched this long for an overwrite in the target (accepted risk (b), shown on the task).
const DRIFT_DAYS = 14;
const EXPORT_HOURS = 6;
export const ARTICLE_COMMANDS = ['linkArticle', 'editArticleDraft', 'retryPublish', 'rebaseArticle'];

export class ArticleFlow {
  private readonly running = new Set<string>();
  private readonly checked = new Map<string, number>();
  constructor(private readonly s: any) {}
  get delivery(): ArticleDelivery | undefined {
    return this.s.p.articles;
  }
  private need(): ArticleDelivery {
    if (!this.delivery) return fail(systemMessageText('articles.notConfigured'), 409);
    return this.delivery;
  }
  /** The project's targets for the task page, without credentials. */
  targets(project: string) {
    try {
      return (this.s.p.articleTargets?.list(project).targets || []).map((t) => ({ id: t.id, name: t.name, kind: t.kind, locales: t.locales, capabilities: t.capabilities, status: supportsStatus(t as ArticleTarget) }));
    } catch {
      return [];
    }
  }
  /** The article versions the task page compares with: each shown draft's base and a conflict's current version. */
  async bases(project: string, taskId: string, w: Work, tx: any) {
    const keys = new Set<string>();
    for (const a of w.results) if (a?.article?.baseKey) keys.add(a.article.baseKey);
    if (w.release?.article?.conflict?.currentKey) keys.add(w.release.article.conflict.currentKey);
    if (w.release?.article?.artifactId) {
      const approved = await this.s.snapshot(this.s.key('artifact', project, taskId, w.release.article.artifactId), tx);
      if (approved?.article?.baseKey) keys.add(approved.article.baseKey);
    }
    const out: Record<string, ArticleSnapshot> = {};
    for (const key of [...keys].slice(0, 6)) {
      const snap = await this.s.snapshot(key, tx);
      if (snap) out[key] = snap;
    }
    return out;
  }
  owned(project: string, paths: string[]): string[] {
    try {
      return this.s.p.articleTargets?.owned(project, paths) || [];
    } catch {
      return [];
    }
  }
  ownedTemplates(project: string): string[] {
    try {
      return this.s.p.articleTargets?.ownedTemplates(project) || [];
    } catch {
      return [];
    }
  }
  private providerError(error: unknown): never {
    if (error instanceof ArticleError) return fail(systemMessageText(providerErrorKey(error.code)), error.status);
    throw error;
  }
  /** Reads a command needs from the target, before the task lock (no I/O inside business transactions). */
  async preRead(project: string, taskId: string, v: any): Promise<{ snapshot?: ArticleSnapshot | null }> {
    if (v.command === 'linkArticle' && v.targetId && v.articleId) {
      try {
        return { snapshot: await this.need().read(project, String(v.targetId), String(v.articleId)) };
      } catch (error) {
        return this.providerError(error);
      }
    }
    if (v.command === 'rebaseArticle') {
      const w = projectWork(await this.s.task(project, taskId));
      const a = w.release?.article;
      if (!a?.articleId || w.release?.state !== 'publish_conflict' || w.release.article.conflict?.reason === 'missing') return {};
      try {
        return { snapshot: await this.need().read(project, a.targetId, a.articleId) };
      } catch (error) {
        return this.providerError(error);
      }
    }
    return {};
  }
  /**
   * Decide at start: the linked article; else a new article on the chosen target (`{ targetId }`), or on the project's
   * first target for a blog post when nothing was chosen. `'repo'` keeps the pull request.
   */
  startDelivery(project: string, w: Work, playbookId: string, changes: boolean, choice: unknown) {
    if (!changes || choice === 'repo') return;
    const targets = this.targets(project);
    const linked = w.article?.targetId ? targets.find((t) => t.id === w.article.targetId) : undefined;
    if (w.article?.targetId && !linked) return fail(systemMessageText('articles.targetMissing'), 409);
    const chosen = choice && typeof choice === 'object' && typeof (choice as any).targetId === 'string' ? targets.find((t) => t.id === (choice as any).targetId) : undefined;
    if (choice && typeof choice === 'object' && !chosen && !linked) return fail(systemMessageText('articles.targetMissing'), 409);
    const target = linked || chosen || (playbookId === 'blog-post' ? targets[0] : undefined);
    if (!target) return;
    w.delivery = { kind: 'article', targetId: target.id, articleId: linked ? w.article.articleId || null : null, sourceKey: linked ? w.article.sourceKey || null : null };
  }
  /** What the Runner gets for an article step: the target's shape and the current source article. */
  async runInput(project: string, w: Work, tx: any) {
    const d = w.delivery,
      target = this.need().target(project, d.targetId);
    const source = d.sourceKey ? await this.s.snapshot(d.sourceKey, tx) : null;
    const fields = Object.fromEntries(
      target.locales.map((l) => [
        l,
        target.kind === 'nocobase-api' ? Object.keys(target.fields.locales[l] || {}) : target.kind === 'git-files' ? ['body', ...(target.format === 'frontmatter' ? (target.frontmatter ? ['title', 'description'] : []) : Object.keys(target.metadata?.keys[l] || {}))] : ['title', 'description', 'body'],
      ]),
    );
    return { target: { name: target.name, locales: target.locales, fields, status: supportsStatus(target) }, action: d.articleId ? 'update' : 'create', source: source ? { id: source.id, slug: source.slug, status: source.status, locales: source.locales } : null };
  }
  /** Validate a Runner's article against the target; the artifact keeps the proposal and its base. */
  async proposal(project: string, input: any, article: unknown): Promise<ArticleProposal> {
    const d = input.delivery;
    const base = d.sourceKey ? await this.s.snapshot(d.sourceKey) : null;
    let p: ArticleProposal;
    try {
      p = this.need().proposal(project, { targetId: d.targetId, articleId: d.articleId, base, baseKey: d.sourceKey, draft: article });
    } catch (error) {
      if (error instanceof ArticleError) return fail(systemMessageText('articles.invalidDraft', { 0: error.message }), 422);
      throw error;
    }
    if (!p.changes.length) return fail(systemMessageText('articles.noChanges'), 422);
    return p;
  }
  /** The release record for an approved article. Pages and the check phrase come from the target and the draft. */
  release(project: string, task: any, output: Artifact, note: string) {
    const a: ArticleProposal = output.article;
    const target = this.need().target(project, a.targetId);
    if (!a.changes.length) return fail(systemMessageText('articles.noChanges'), 409);
    const slug = a.draft.slug || '';
    const verifyText = verifyPhrase(a.draft);
    return {
      state: 'publishing',
      note: note || a.draft.summary || task.title,
      pages: slug ? articlePages(target, slug, a.changes) : [],
      ...(verifyText ? { verifyText } : {}),
      article: { artifactId: output.id, targetId: a.targetId, articleId: a.articleId, key: randomUUID(), slug },
    };
  }
  kick(project: string, taskId: string, tx: any) {
    const go = () => {
      void this.publish(project, taskId).catch(() => undefined);
    };
    if (typeof tx?.afterCommit === 'function') tx.afterCommit(go);
    else go();
  }
  /** Commands that belong to article delivery. Returns false for any other command. */
  async command(project: string, taskId: string, task: any, w: Work, v: any, actor: string, at: string, tx: any, pre: { snapshot?: ArticleSnapshot | null }, event: any) {
    const s = this.s;
    if (v.command === 'linkArticle') {
      if (w.stage !== 'plan' || w.flow) return fail(systemMessageText('articles.linkBeforeStart'), 409);
      if (!v.targetId) {
        w.article = undefined;
        event.note = '';
        return true;
      }
      const target = this.need().target(project, String(v.targetId));
      let sourceKey = null;
      if (v.articleId) {
        if (!pre.snapshot || pre.snapshot.id !== String(v.articleId)) return fail(systemMessageText('articles.provider.notFound'), 404);
        sourceKey = s.key('article', project, taskId, randomUUID());
        await s.put(sourceKey, pre.snapshot, tx);
      }
      const title = pre.snapshot ? pre.snapshot.locales[target.locales[0]]?.title || pre.snapshot.slug : '';
      w.article = { targetId: target.id, articleId: v.articleId ? String(v.articleId) : null, slug: pre.snapshot?.slug || '', title: clip(title, 300), sourceKey, linkedAt: at };
      event.note = w.article.title || target.name;
      return true;
    }
    if (v.command === 'editArticleDraft') {
      const { index } = s.flowStageOf(w, v.stageKey, ['review']);
      const producer = w.flow.stages[index - 1],
        output = w.results[index - 1];
      if (!output?.article || output.id !== v.artifactId || output.rejectedAt) return fail(systemMessageText('taskExecution.contentUpdatedRefreshBeforeSaving'), 409);
      const a: ArticleProposal = output.article;
      const base = a.baseKey ? await s.snapshot(a.baseKey, tx) : null;
      let next: ArticleProposal;
      try {
        next = this.need().proposal(project, { targetId: a.targetId, articleId: a.articleId, base, baseKey: a.baseKey, draft: { ...v.article, ...(a.draft.verifyText && v.article?.verifyText === undefined ? { verifyText: a.draft.verifyText } : {}) } });
      } catch (error) {
        if (error instanceof ArticleError) return fail(systemMessageText('articles.invalidDraft', { 0: error.message }), 400);
        throw error;
      }
      if (!next.changes.length) return fail(systemMessageText('articles.noChanges'), 409);
      const content = typeof v.content === 'string' && v.content.trim() ? v.content.trim().slice(0, 30000) : output.content;
      const artifact = { ...(await s.flowArtifactOf(project, taskId, producer.key, content, actor, at, tx)), article: { ...next, ...(a.conflicts ? { conflicts: a.conflicts } : {}) } };
      await s.put(s.key('artifact', project, taskId, artifact.id), artifact, tx);
      w.results[index - 1] = artifact;
      event.artifactId = artifact.id;
      return true;
    }
    if (v.command === 'retryPublish') {
      const { index } = s.flowStageOf(w, v.stageKey, ['release']);
      const r = w.release;
      if (!r?.article || r.state !== 'publish_failed') return fail(systemMessageText('articles.nothingToRetry'), 409);
      w.release = { ...r, state: 'publishing', article: { ...r.article, error: undefined } };
      this.kick(project, taskId, tx);
      void index;
      return true;
    }
    if (v.command === 'rebaseArticle') {
      // Both versions are kept: the approved draft goes back to review against the article as it is now, with the
      // fields both sides changed marked for a person to decide. Publishing needs a fresh approval.
      const { index } = s.flowStageOf(w, v.stageKey, ['release']);
      const r = w.release,
        conflict = r?.article?.conflict;
      if (!r?.article || r.state !== 'publish_conflict' || !conflict) return fail(systemMessageText('articles.nothingToRebase'), 409);
      if (conflict.reason === 'missing') return fail(systemMessageText('articles.articleMissing'), 409);
      const producer = w.flow.stages[index - 2],
        approved = await s.snapshot(s.key('artifact', project, taskId, r.article.artifactId), tx);
      if (!producer || !approved?.article) return fail(systemMessageText('taskExecution.contentUpdatedRefreshBeforeSaving'), 409);
      let baseKey = approved.article.baseKey;
      if (pre.snapshot) {
        baseKey = s.key('article', project, taskId, randomUUID());
        await s.put(baseKey, pre.snapshot, tx);
      }
      const old: ArticleProposal = approved.article;
      const conflicts = (conflict.fields || []).map((f) => ({ ...f, base: clip(f.base, 20000), current: clip(f.current, 20000), draft: clip(f.draft, 20000) }));
      let next: ArticleProposal;
      try {
        next = this.need().proposal(project, { targetId: old.targetId, articleId: old.articleId, base: pre.snapshot ?? (baseKey ? await s.snapshot(baseKey, tx) : null), baseKey, draft: old.draft });
      } catch (error) {
        if (error instanceof ArticleError) return fail(systemMessageText('articles.invalidDraft', { 0: error.message }), 409);
        throw error;
      }
      const artifact = { ...(await s.flowArtifactOf(project, taskId, producer.key, approved.content, actor, at, tx)), article: { ...next, ...(conflicts.length ? { conflicts } : {}), rebasedFrom: approved.id } };
      await s.put(s.key('artifact', project, taskId, artifact.id), artifact, tx);
      w.results[index - 2] = artifact;
      if (pre.snapshot && w.delivery) w.delivery = { ...w.delivery, sourceKey: baseKey };
      w.release = undefined;
      event.artifactId = artifact.id;
      await s.enterStage(project, taskId, task, w, index - 1, tx, actor, at);
      return true;
    }
    return false;
  }
  /** Publish the approved article of one task. Safe to call repeatedly: a write is adopted, never repeated. */
  async publish(project: string, taskId: string) {
    const key = `${project}:${taskId}`;
    if (this.running.has(key) || !this.delivery) return;
    this.running.add(key);
    try {
      const claim = await this.s.lock(project, taskId, async (tx) => {
        const task = await this.s.task(project, taskId, tx),
          w = projectWork(task),
          r = w.release;
        if (!r?.article || r.state !== 'publishing' || w.cancelledAt || w.archivedAt) return null;
        const artifact = await this.s.snapshot(this.s.key('artifact', project, taskId, r.article.artifactId), tx);
        if (!artifact?.article) return null;
        return { r, artifact, base: artifact.article.baseKey ? await this.s.snapshot(artifact.article.baseKey, tx) : null };
      });
      if (!claim) return;
      const outcome = await this.delivery.publish(project, claim.artifact.article, claim.base, claim.r.article.key);
      await this.s.lock(project, taskId, async (tx) => {
        const task = await this.s.task(project, taskId, tx),
          w = projectWork(task),
          r = w.release;
        if (!r?.article || r.state !== 'publishing' || r.article.artifactId !== claim.r.article.artifactId) return;
        await this.record(project, taskId, w, r, claim.artifact, outcome, tx);
        await this.s.save(task, w, tx);
      });
    } finally {
      this.running.delete(key);
    }
  }
  private async record(project: string, taskId: string, w: Work, r: any, artifact: Artifact, outcome: PublishOutcome, tx: any) {
    const at = now(),
      a = r.article;
    if (outcome.kind === 'published') {
      const snap = outcome.snapshot;
      a.published = { articleId: snap.id, slug: snap.slug, version: snap.version, written: outcome.written, at, ...(outcome.adopted ? { adopted: true } : {}) };
      a.articleId = snap.id;
      a.slug = snap.slug;
      if (w.delivery && !w.delivery.articleId) w.delivery = { ...w.delivery, articleId: snap.id };
      if (!r.pages.length) {
        try {
          r.pages = articlePages(this.delivery.target(project, a.targetId), snap.slug, artifact.article.changes);
        } catch {
          /* the target was removed after publishing */
        }
      }
      a.conflict = undefined;
      a.error = undefined;
      const downstream = this.s.p.articleTargets?.downstream(project, a.targetId);
      if (downstream) Object.assign(r, { state: 'exporting', nextCheckAt: new Date(Date.now() + 60000).toISOString(), deadline: new Date(Date.now() + EXPORT_HOURS * HOUR).toISOString() });
      else this.toVerify(r, at);
      w.history.push({ at, actor: 'system', action: 'articlePublished', note: snap.slug });
      return;
    }
    if (outcome.kind === 'conflict') {
      let currentKey;
      if (outcome.current) {
        currentKey = this.s.key('article', project, taskId, randomUUID());
        await this.s.put(currentKey, outcome.current, tx);
      }
      a.conflict = {
        reason: outcome.reason,
        at,
        ...(currentKey ? { currentKey } : {}),
        ...(outcome.fields ? { fields: outcome.fields.slice(0, 30).map((f) => ({ field: f.field, base: clip(f.base, 20000), current: clip(f.current, 20000), draft: clip(f.draft, 20000) })) } : {}),
        ...(outcome.divergence ? { divergence: outcome.divergence.slice(0, 30).map((d) => ({ path: clip(d.path, 500), field: d.field, git: clip(d.git, 20000), target: clip(d.target, 20000) })) } : {}),
      };
      r.state = 'publish_conflict';
      w.history.push({ at, actor: 'system', action: 'articleConflict', note: outcome.reason });
      return;
    }
    a.error = outcome.code;
    r.state = 'publish_failed';
    w.history.push({ at, actor: 'system', action: 'articlePublishFailed', note: outcome.code });
  }
  private toVerify(r: any, at: string) {
    const can = Boolean(r.verifyText && r.pages.length);
    Object.assign(r, { state: can ? 'verifying' : 'not_seen', ...(can ? {} : { reason: 'cannot_verify' }), mergedAt: at, checks: 0, nextCheckAt: at, deadline: new Date(Date.now() + 24 * HOUR).toISOString() });
  }
  /** The published content: the approved draft with the slug it was published under. */
  private publishedContent(artifact: Artifact, slug: string) {
    const { draft } = artifact.article as ArticleProposal;
    return { slug, status: draft.status, locales: draft.locales };
  }
  /** Background work: interrupted publishes, export tracking and the post-publish overwrite watch. */
  async tick() {
    if (!this.delivery) return;
    for (let offset = 0; ; offset += 100) {
      const rows = await this.s.repo('nrTasks').find({ sort: 'id', limit: 100, offset });
      for (const row of rows) {
        const t = row.toJSON ? row.toJSON() : row,
          w = projectWork(t),
          r = w.release,
          project = String(t.projectId),
          taskId = String(t.id);
        if (!r?.article || w.cancelledAt) continue;
        try {
          if (r.state === 'publishing') await this.publish(project, taskId);
          else if (r.state === 'exporting' && Date.parse(r.nextCheckAt || '') <= Date.now()) await this.checkExport(project, taskId);
          if (r.article.published && Date.now() - Date.parse(r.article.published.at) < DRIFT_DAYS * 24 * HOUR) await this.checkDrift(project, taskId);
        } catch {
          /* checked again on the next pass */
        }
      }
      if (rows.length < 100) break;
    }
  }
  private async checkExport(project: string, taskId: string) {
    const t = await this.s.task(project, taskId),
      r = projectWork(t).release;
    const artifact = await this.s.snapshot(this.s.key('artifact', project, taskId, r.article.artifactId));
    let result: { done: boolean; commit?: string } | null = null;
    try {
      result = await this.delivery.exported(project, r.article.targetId, this.publishedContent(artifact, r.article.published.slug), r.article.published.written);
    } catch {
      result = { done: false };
    }
    await this.s.lock(project, taskId, async (tx) => {
      const task = await this.s.task(project, taskId, tx),
        w = projectWork(task),
        rel = w.release;
      if (rel?.state !== 'exporting' || rel.article?.artifactId !== r.article.artifactId) return;
      const at = now();
      if (!result || result.done) {
        rel.article.exported = { at, ...(result?.commit ? { commit: result.commit } : {}) };
        this.toVerify(rel, at);
        w.history.push({ at, actor: 'system', action: 'articleExported', note: result?.commit?.slice(0, 12) || '' });
      } else if (Date.now() > Date.parse(rel.deadline || '')) {
        rel.state = 'export_late';
        w.history.push({ at, actor: 'system', action: 'articleExportLate' });
      } else rel.nextCheckAt = new Date(Date.now() + 5 * 60000).toISOString();
      await this.s.save(task, w, tx);
    });
  }
  private async checkDrift(project: string, taskId: string) {
    const key = `${project}:${taskId}`;
    if (Date.now() - (this.checked.get(key) || 0) < HOUR) return;
    this.checked.set(key, Date.now());
    const t = await this.s.task(project, taskId),
      r = projectWork(t).release;
    const artifact = await this.s.snapshot(this.s.key('artifact', project, taskId, r.article.artifactId));
    if (!artifact?.article) return;
    const { fields } = await this.delivery.drift(project, r.article.targetId, r.article.published.articleId, this.publishedContent(artifact, r.article.published.slug), r.article.published.written);
    const same = (x: any[] = []) => JSON.stringify(x.map((f) => f.field)) === JSON.stringify(fields.map((f) => f.field));
    if (!fields.length ? !r.article.drift || r.article.drift.resolvedAt : same(r.article.drift?.fields) && !r.article.drift?.resolvedAt) return;
    await this.s.lock(project, taskId, async (tx) => {
      const task = await this.s.task(project, taskId, tx),
        w = projectWork(task),
        rel = w.release;
      if (!rel?.article?.published) return;
      const at = now();
      if (fields.length) {
        rel.article.drift = { at, fields: fields.slice(0, 30).map((f) => ({ field: f.field, published: clip(f.published, 20000), current: clip(f.current, 20000) })) };
        w.history.push({ at, actor: 'system', action: 'articleDrift', note: fields.map((f) => f.field).join(', ').slice(0, 200) });
      } else if (rel.article.drift) rel.article.drift = { ...rel.article.drift, resolvedAt: at };
      await this.s.save(task, w, tx);
    });
  }
}
