// @ts-nocheck
import { randomUUID } from 'node:crypto';
import { systemMessageText } from '../../../shared/i18n/messages.js';
import { supportsStatus, type ArticleSnapshot } from '../../../shared/article-publishing.js';
import type { ArticleTargets } from '../articles/targets.js';
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
// A task publishes to its primary target and at most this many others.
const MAX_ALSO = 4;

// A release publishes to one target or several: the primary (`release.article`) and the others (`release.also`), each
// with its own record and state; `release.state` is the aggregate (settle). Leg 0 is the primary.
const legsOf = (r: any): any[] => [r.article, ...(r.also || [])];
const proposalOf = (artifact: any, i: number) => (i === 0 ? artifact?.article : artifact?.article?.also?.[i - 1]);
/** A leg that publishes again, or has published, no longer carries its last failure. */
function clearFailure(rec: any) {
  rec.error = undefined;
  rec.errorStep = undefined;
  rec.errorDetail = undefined;
  rec.errorAt = undefined;
}
/** A leg's state; single-target releases from before several targets carry it on the release only. */
function stateOf(r: any, rec: any) {
  if (rec.state) return rec.state;
  if (['publishing', 'publish_conflict', 'publish_failed'].includes(r.state)) return r.state;
  if (['exporting', 'export_late'].includes(r.state)) return rec.exported ? 'exported' : 'exporting';
  return rec.exported ? 'exported' : 'published';
}
/** The article as a leg published it: its base with the draft applied, at the version the write returned. */
function publishedSnapshot(base: ArticleSnapshot | null, p: ArticleProposal, published: any): ArticleSnapshot {
  const locales: any = {};
  for (const l of new Set([...Object.keys(base?.locales || {}), ...Object.keys(p.draft.locales)])) locales[l] = { ...base?.locales[l], ...p.draft.locales[l] };
  const status = p.draft.status ?? base?.status;
  return { id: published.articleId, slug: published.slug, version: published.version, readAt: published.at, ...(status ? { status } : {}), locales };
}

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
  /** The project's targets for the task page, without credentials; `pages` are the public address patterns. */
  targets(project: string) {
    try {
      const list = (this.s.p.articleTargets as ArticleTargets | undefined)?.list(project);
      return (list?.targets || []).map((t) => ({ id: t.id, name: t.name, kind: t.kind, locales: t.locales, capabilities: t.capabilities, status: supportsStatus(t), default: t.id === list?.defaultTargetId, ...(t.pages ? { pages: t.pages } : {}) }));
    } catch {
      return [];
    }
  }
  /** Where each playbook's new tasks publish by default (`'repo'` for a pull request). */
  playbookTargets(project: string): Record<string, string> {
    try {
      return (this.s.p.articleTargets as ArticleTargets | undefined)?.list(project).playbookTargets || {};
    } catch {
      return {};
    }
  }
  /** The article versions the task page compares with: each shown draft's base (every target's) and a conflict's current version. */
  async bases(project: string, taskId: string, w: Work, tx: any) {
    const keys = new Set<string>();
    for (const a of w.results) for (const p of a?.article ? [a.article, ...(a.article.also || [])] : []) if (p.baseKey) keys.add(p.baseKey);
    if (w.release?.article?.conflict?.currentKey) keys.add(w.release.article.conflict.currentKey);
    if (w.release?.article?.artifactId) {
      const approved = await this.s.snapshot(this.s.key('artifact', project, taskId, w.release.article.artifactId), tx);
      if (approved?.article?.baseKey) keys.add(approved.article.baseKey);
    }
    const out: Record<string, ArticleSnapshot> = {};
    for (const key of [...keys].slice(0, 12)) {
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
  async preRead(project: string, taskId: string, v: any): Promise<{ snapshot?: ArticleSnapshot | null; legs?: Record<number, ArticleSnapshot>; also?: Record<string, ArticleSnapshot | null>; alsoSlug?: string }> {
    if (v.command === 'startTask') return this.preReadAlso(project, taskId, v.delivery?.also);
    if (v.command === 'linkArticle' && v.targetId && v.articleId) {
      try {
        return { snapshot: await this.need().read(project, String(v.targetId), String(v.articleId)) };
      } catch (error) {
        return this.providerError(error);
      }
    }
    if (v.command === 'rebaseArticle') {
      // Each conflicting leg's article as it is now; a leg whose slug was taken uses the article found then.
      const w = projectWork(await this.s.task(project, taskId)),
        r = w.release;
      if (!r?.article || r.state !== 'publish_conflict') return {};
      const legs: Record<number, ArticleSnapshot> = {};
      try {
        for (const [i, rec] of legsOf(r).entries()) {
          if (stateOf(r, rec) !== 'publish_conflict' || !rec.articleId || !['changed', 'downstream'].includes(rec.conflict?.reason)) continue;
          legs[i] = await this.need().read(project, rec.targetId, rec.articleId);
        }
      } catch (error) {
        return this.providerError(error);
      }
      return { snapshot: legs[0], legs };
    }
    return {};
  }
  /** For a linked article, the article with the same slug in each other chosen target (null: created there). */
  private async preReadAlso(project: string, taskId: string, also: unknown) {
    if (!Array.isArray(also) || !also.length) return {};
    if (also.length > MAX_ALSO) return fail(systemMessageText('articles.tooManyTargets'), 400);
    const w = projectWork(await this.s.task(project, taskId)),
      slug = w.article?.articleId ? w.article.slug : '';
    if (!slug) return {};
    const targets = this.targets(project),
      out: Record<string, ArticleSnapshot | null> = {};
    for (const id of new Set(also.filter((x) => typeof x === 'string'))) {
      const t = targets.find((x) => x.id === id);
      if (!t || id === w.article.targetId) continue;
      try {
        out[id] = await this.need().provider(project, id).findBySlug(slug);
      } catch {
        return fail(systemMessageText('articles.alsoUnreadable', { 0: t.name }), 502);
      }
    }
    return { also: out, alsoSlug: slug };
  }
  /**
   * Decide at start: the linked article; else a new article on the chosen target (`{ targetId }`); with nothing chosen,
   * the playbook's target, or the default target for a blog post. `'repo'` keeps the pull request. `also` lists other
   * targets: a linked article's slug found there (pre-read) is updated, otherwise the article is created there.
   */
  async startDelivery(project: string, taskId: string, w: Work, playbookId: string, changes: boolean, choice: any, tx: any, pre: any = {}) {
    if (!changes || choice === 'repo') return;
    const targets = this.targets(project);
    const linked = w.article?.targetId ? targets.find((t) => t.id === w.article.targetId) : undefined;
    if (w.article?.targetId && !linked) return fail(systemMessageText('articles.targetMissing'), 409);
    const named = choice && typeof choice === 'object' && typeof choice.targetId === 'string';
    const chosen = named ? targets.find((t) => t.id === choice.targetId) : undefined;
    if (named && !chosen && !linked) return fail(systemMessageText('articles.targetMissing'), 409);
    let target = linked || chosen;
    if (!target && !named) {
      const entry = this.playbookTargets(project)[playbookId];
      if (entry === 'repo') return;
      target = (entry && targets.find((t) => t.id === entry)) || (playbookId === 'blog-post' ? targets.find((t) => t.default) || targets[0] : undefined);
    }
    if (!target) return;
    const ids = Array.isArray(choice?.also) ? [...new Set(choice.also.filter((x) => typeof x === 'string' && x !== target.id))] : [];
    if (ids.length > MAX_ALSO) return fail(systemMessageText('articles.tooManyTargets'), 400);
    if (ids.some((id) => !targets.some((t) => t.id === id))) return fail(systemMessageText('articles.targetMissing'), 409);
    // The slugs were looked up before the lock: they must still be the linked article's.
    if (ids.length && linked && w.article.articleId && pre.alsoSlug !== w.article.slug) return fail(systemMessageText('taskExecution.contentUpdatedRefreshBeforeSaving'), 409);
    const also = [];
    for (const id of ids) {
      const found = w.article?.articleId ? pre.also?.[id] : null;
      let sourceKey = null;
      if (found) {
        sourceKey = this.s.key('article', project, taskId, randomUUID());
        await this.s.put(sourceKey, found, tx);
      }
      also.push({ targetId: id, articleId: found?.id || null, sourceKey });
    }
    w.delivery = { kind: 'article', targetId: target.id, articleId: linked ? w.article.articleId || null : null, sourceKey: linked ? w.article.sourceKey || null : null, ...(also.length ? { also } : {}) };
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
    if (d.also?.length) p.also = await this.alsoProposals(project, p, d.also.map((x) => ({ targetId: x.targetId, articleId: x.articleId, baseKey: x.sourceKey })), base, 422);
    return p;
  }
  /** The proposals for the other targets, from the primary's draft. `source` is the primary's base. */
  private async alsoProposals(project: string, primary: ArticleProposal, legs: any[], source: ArticleSnapshot | null, status: number, tx?: any) {
    const out = [];
    for (const l of legs) {
      const base = l.baseKey ? await this.s.snapshot(l.baseKey, tx) : null;
      try {
        out.push({
          ...this.need().alsoProposal(project, { targetId: l.targetId, articleId: l.articleId, base, baseKey: l.baseKey, source, draft: primary.draft }),
          ...(l.conflicts?.length ? { conflicts: l.conflicts } : {}),
          ...(l.carried?.length ? { carried: l.carried } : {}),
        });
      } catch (error) {
        if (error instanceof ArticleError) return fail(systemMessageText('articles.invalidDraft', { 0: error.message }), status);
        throw error;
      }
    }
    return out;
  }
  /** The release record for an approved article. Pages and the check phrase come from the target and the draft. */
  release(project: string, task: any, output: Artifact, note: string) {
    const a: ArticleProposal = output.article;
    const legs = [a, ...(a.also || [])];
    if (!legs.some((l) => l.changes.length || l.carried?.length)) return fail(systemMessageText('articles.noChanges'), 409);
    const pages = [];
    const records = legs.map((l, i) => {
      const slug = l.draft.slug || (i ? l.slug : '') || '';
      if (slug) pages.push(...articlePages(this.need().target(project, l.targetId), slug, l.changes.length ? l.changes : l.carried || []));
      return { targetId: l.targetId, articleId: l.articleId, key: randomUUID(), slug, ...(a.also?.length ? { state: 'publishing' } : {}) };
    });
    const verifyText = verifyPhrase(a.draft);
    return {
      state: 'publishing',
      note: note || a.draft.summary || task.title,
      pages: [...new Set(pages)].slice(0, 10),
      ...(verifyText ? { verifyText } : {}),
      article: { artifactId: output.id, ...records[0] },
      ...(records.length > 1 ? { also: records.slice(1) } : {}),
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
      if (a.carried) next.carried = a.carried;
      if (a.also?.length) next.also = await this.alsoProposals(project, next, a.also, base, 400, tx);
      if (![next, ...(next.also || [])].some((l) => l.changes.length || l.carried?.length)) return fail(systemMessageText('articles.noChanges'), 409);
      const content = typeof v.content === 'string' && v.content.trim() ? v.content.trim().slice(0, 30000) : output.content;
      const artifact = { ...(await s.flowArtifactOf(project, taskId, producer.key, content, actor, at, tx)), article: { ...next, ...(a.conflicts ? { conflicts: a.conflicts } : {}) } };
      await s.put(s.key('artifact', project, taskId, artifact.id), artifact, tx);
      w.results[index - 1] = artifact;
      event.artifactId = artifact.id;
      return true;
    }
    if (v.command === 'retryPublish') {
      // Every leg that failed goes back to publishing, with its own idempotency key.
      s.flowStageOf(w, v.stageKey, ['release']);
      const r = w.release;
      if (!r?.article || r.state !== 'publish_failed') return fail(systemMessageText('articles.nothingToRetry'), 409);
      for (const rec of legsOf(r))
        if (stateOf(r, rec) === 'publish_failed') {
          if (r.also) rec.state = 'publishing';
          clearFailure(rec);
        }
      r.state = 'publishing';
      this.kick(project, taskId, tx);
      return true;
    }
    if (v.command === 'rebaseArticle') {
      // Both versions are kept: the approved draft goes back to review against each conflicting article as it is now,
      // with the fields both sides changed marked for a person to decide. A leg already published is based on what it
      // published, so its own write is not taken for someone else's. Publishing needs a fresh approval.
      const { index } = s.flowStageOf(w, v.stageKey, ['release']);
      const r = w.release;
      const legs = r?.article ? legsOf(r) : [];
      if (!r?.article || r.state !== 'publish_conflict' || !legs.some((rec) => stateOf(r, rec) === 'publish_conflict' && rec.conflict)) return fail(systemMessageText('articles.nothingToRebase'), 409);
      if (stateOf(r, r.article) === 'publish_conflict' && r.article.conflict?.reason === 'missing') return fail(systemMessageText('articles.articleMissing'), 409);
      const producer = w.flow.stages[index - 2],
        approved = await s.snapshot(s.key('artifact', project, taskId, r.article.artifactId), tx);
      if (!producer || !approved?.article) return fail(systemMessageText('taskExecution.contentUpdatedRefreshBeforeSaving'), 409);
      const old: ArticleProposal = approved.article;
      // Each leg's next base: the article now (a conflict), what it published (done), or the base it had (failed).
      const rebased = async (i: number) => {
        const rec = legs[i],
          p = proposalOf(approved, i),
          st = stateOf(r, rec),
          was = p.baseKey ? await s.snapshot(p.baseKey, tx) : null;
        const keep = async (snap: ArticleSnapshot) => {
          const key = s.key('article', project, taskId, randomUUID());
          await s.put(key, snap, tx);
          return key;
        };
        if (st === 'publish_conflict') {
          const c = rec.conflict || {},
            conflicts = (c.fields || []).map((f) => ({ ...f, base: clip(f.base, 20000), current: clip(f.current, 20000), draft: clip(f.draft, 20000) }));
          if (pre.legs?.[i]) return { articleId: p.articleId, base: pre.legs[i], baseKey: await keep(pre.legs[i]), conflicts };
          if (i && c.reason === 'missing') return { articleId: null, base: null, baseKey: null, conflicts };
          if (i && c.reason === 'slug_taken' && c.currentKey) {
            const current = await s.snapshot(c.currentKey, tx);
            if (current) return { articleId: current.id, base: current, baseKey: c.currentKey, conflicts };
          }
          return { articleId: p.articleId, base: was, baseKey: p.baseKey, conflicts };
        }
        if (rec.published) {
          const snap = publishedSnapshot(was, p, rec.published);
          return { articleId: rec.published.articleId, base: snap, baseKey: await keep(snap), carried: [...new Set([...(p.carried || []), ...rec.published.written])] };
        }
        return { articleId: p.articleId, base: was, baseKey: p.baseKey, ...(p.carried ? { carried: p.carried } : {}) };
      };
      const primary = await rebased(0);
      let next: ArticleProposal;
      try {
        next = this.need().proposal(project, { targetId: old.targetId, articleId: primary.articleId, base: primary.base, baseKey: primary.baseKey, draft: old.draft });
      } catch (error) {
        if (error instanceof ArticleError) return fail(systemMessageText('articles.invalidDraft', { 0: error.message }), 409);
        throw error;
      }
      if (primary.carried) next.carried = primary.carried;
      const others = [];
      for (let i = 1; i < legs.length; i++) others.push({ targetId: legs[i].targetId, ...(await rebased(i)) });
      if (others.length) next.also = await this.alsoProposals(project, next, others, primary.base, 409, tx);
      const artifact = { ...(await s.flowArtifactOf(project, taskId, producer.key, approved.content, actor, at, tx)), article: { ...next, ...(primary.conflicts?.length ? { conflicts: primary.conflicts } : {}), rebasedFrom: approved.id } };
      await s.put(s.key('artifact', project, taskId, artifact.id), artifact, tx);
      w.results[index - 2] = artifact;
      if (w.delivery) w.delivery = { ...w.delivery, articleId: primary.articleId, sourceKey: primary.baseKey, ...(others.length ? { also: others.map((o) => ({ targetId: o.targetId, articleId: o.articleId, sourceKey: o.baseKey })) } : {}) };
      w.release = undefined;
      event.artifactId = artifact.id;
      await s.enterStage(project, taskId, task, w, index - 1, tx, actor, at);
      return true;
    }
    return false;
  }
  /** Publish the approved article of one task to each target still publishing. Safe to call repeatedly: a write is adopted, never repeated. */
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
        const legs = [];
        for (const [i, rec] of legsOf(r).entries()) {
          const p = proposalOf(artifact, i);
          if (stateOf(r, rec) === 'publishing' && p) legs.push({ i, p, key: rec.key, base: p.baseKey ? await this.s.snapshot(p.baseKey, tx) : null });
        }
        return { r, artifact, legs };
      });
      if (!claim) return;
      const outcomes = [];
      for (const l of claim.legs) {
        const outcome = await this.delivery.publish(project, l.p, l.base, l.key);
        // Every failed leg leaves a line in the application log (`nb-studio app logs`), whether or not it is recorded.
        if (outcome.kind === 'failed') this.s.p.app?.logger?.warn?.('NocoReach article publish failed', { projectId: project, taskId, targetId: l.p.targetId, step: outcome.step, code: outcome.code, detail: outcome.detail });
        outcomes.push(outcome);
      }
      await this.s.lock(project, taskId, async (tx) => {
        const task = await this.s.task(project, taskId, tx),
          w = projectWork(task),
          r = w.release;
        if (!r?.article || r.state !== 'publishing' || r.article.artifactId !== claim.r.article.artifactId) return;
        const legs = legsOf(r);
        for (const [n, l] of claim.legs.entries()) {
          const rec = legs[l.i];
          if (rec && stateOf(r, rec) === 'publishing') await this.record(project, taskId, w, r, l.i, rec, l.p, outcomes[n], tx);
        }
        this.settle(r, now());
        await this.s.save(task, w, tx);
      });
    } finally {
      this.running.delete(key);
    }
  }
  private async record(project: string, taskId: string, w: Work, r: any, i: number, a: any, p: ArticleProposal, outcome: PublishOutcome, tx: any) {
    const at = now();
    let name = a.targetId;
    try {
      name = this.delivery.target(project, a.targetId).name;
    } catch {
      /* the target was removed after publishing */
    }
    const note = (text: string) => (r.also ? `${name}: ${text}` : text);
    if (outcome.kind === 'published') {
      const snap = outcome.snapshot;
      a.published = { articleId: snap.id, slug: snap.slug, version: snap.version, written: [...new Set([...(p.carried || []), ...outcome.written])], at, ...(outcome.adopted ? { adopted: true } : {}) };
      if (!a.slug) {
        try {
          // The primary's pages come first.
          const mine = articlePages(this.delivery.target(project, a.targetId), snap.slug, p.changes);
          r.pages = [...new Set(i ? [...r.pages, ...mine] : [...mine, ...r.pages])].slice(0, 10);
        } catch {
          /* the target was removed after publishing */
        }
      }
      a.articleId = snap.id;
      a.slug = snap.slug;
      if (w.delivery && i === 0 && !w.delivery.articleId) w.delivery = { ...w.delivery, articleId: snap.id };
      if (i && w.delivery?.also?.[i - 1] && !w.delivery.also[i - 1].articleId) w.delivery.also[i - 1] = { ...w.delivery.also[i - 1], articleId: snap.id };
      a.conflict = undefined;
      clearFailure(a);
      a.state = this.s.p.articleTargets?.downstream(project, a.targetId) ? 'exporting' : 'published';
      w.history.push({ at, actor: 'system', action: 'articlePublished', note: note(snap.slug) });
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
      a.state = 'publish_conflict';
      w.history.push({ at, actor: 'system', action: 'articleConflict', note: note(outcome.reason) });
      return;
    }
    a.error = outcome.code;
    // For Technical details: where it stopped and what the target or the error said.
    a.errorStep = outcome.step;
    a.errorDetail = outcome.detail ? clip(outcome.detail, 500) : undefined;
    a.errorAt = at;
    a.state = 'publish_failed';
    w.history.push({ at, actor: 'system', action: 'articlePublishFailed', note: note(outcome.code) });
  }
  /**
   * The release's state from its legs: publishing while any leg publishes; then a conflict, then a failure, waits for a
   * person; then exports pending; then the page check over every target's pages. A single-target release keeps the
   * shape it had before several targets (no state on its record).
   */
  private settle(r: any, at: string) {
    const states = legsOf(r).map((rec) => stateOf(r, rec)),
      was = r.state;
    if (!r.also) delete r.article.state;
    if (states.includes('publishing')) r.state = 'publishing';
    else if (states.includes('publish_conflict')) r.state = 'publish_conflict';
    else if (states.includes('publish_failed')) r.state = 'publish_failed';
    else if (states.includes('exporting')) {
      if (was !== 'exporting' && was !== 'export_late') Object.assign(r, { state: 'exporting', nextCheckAt: new Date(Date.now() + 60000).toISOString(), deadline: new Date(Date.now() + EXPORT_HOURS * HOUR).toISOString() });
    } else this.toVerify(r, at);
  }
  private toVerify(r: any, at: string) {
    const can = Boolean(r.verifyText && r.pages.length);
    Object.assign(r, { state: can ? 'verifying' : 'not_seen', ...(can ? {} : { reason: 'cannot_verify' }), mergedAt: at, checks: 0, nextCheckAt: at, deadline: new Date(Date.now() + 24 * HOUR).toISOString() });
  }
  /** The published content of one leg: its approved draft with the slug it was published under. */
  private publishedContent(p: ArticleProposal, slug: string) {
    return { slug, status: p.draft.status, locales: p.draft.locales };
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
          if (legsOf(r).some((rec) => rec?.published && Date.now() - Date.parse(rec.published.at) < DRIFT_DAYS * 24 * HOUR)) await this.checkDrift(project, taskId);
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
    const results = new Map<number, { done: boolean; commit?: string } | null>();
    for (const [i, rec] of legsOf(r).entries()) {
      if (stateOf(r, rec) !== 'exporting' || !rec.published) continue;
      const p = proposalOf(artifact, i);
      try {
        results.set(i, p ? await this.delivery.exported(project, rec.targetId, this.publishedContent(p, rec.published.slug), rec.published.written) : null);
      } catch {
        results.set(i, { done: false });
      }
    }
    await this.s.lock(project, taskId, async (tx) => {
      const task = await this.s.task(project, taskId, tx),
        w = projectWork(task),
        rel = w.release;
      if (rel?.state !== 'exporting' || rel.article?.artifactId !== r.article.artifactId) return;
      const at = now(),
        legs = legsOf(rel);
      for (const [i, result] of results) {
        const rec = legs[i];
        if (!rec || stateOf(rel, rec) !== 'exporting' || (result && !result.done)) continue;
        rec.exported = { at, ...(result?.commit ? { commit: result.commit } : {}) };
        if (rel.also) rec.state = 'exported';
        w.history.push({ at, actor: 'system', action: 'articleExported', note: result?.commit?.slice(0, 12) || '' });
      }
      if (!legs.some((rec) => stateOf(rel, rec) === 'exporting')) this.toVerify(rel, at);
      else if (Date.now() > Date.parse(rel.deadline || '')) {
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
    const found = new Map<number, any[]>();
    for (const [i, rec] of legsOf(r).entries()) {
      const p = proposalOf(artifact, i);
      if (!rec.published || !p || Date.now() - Date.parse(rec.published.at) >= DRIFT_DAYS * 24 * HOUR) continue;
      let fields: any[];
      try {
        ({ fields } = await this.delivery.drift(project, rec.targetId, rec.published.articleId, this.publishedContent(p, rec.published.slug), rec.published.written));
      } catch {
        continue;
      }
      const same = (x: any[] = []) => JSON.stringify(x.map((f) => f.field)) === JSON.stringify(fields.map((f) => f.field));
      if (!fields.length ? !rec.drift || rec.drift.resolvedAt : same(rec.drift?.fields) && !rec.drift?.resolvedAt) continue;
      found.set(i, fields);
    }
    if (!found.size) return;
    await this.s.lock(project, taskId, async (tx) => {
      const task = await this.s.task(project, taskId, tx),
        w = projectWork(task),
        rel = w.release;
      if (!rel?.article) return;
      const at = now(),
        legs = legsOf(rel);
      for (const [i, fields] of found) {
        const rec = legs[i];
        if (!rec?.published) continue;
        if (fields.length) {
          rec.drift = { at, fields: fields.slice(0, 30).map((f) => ({ field: f.field, published: clip(f.published, 20000), current: clip(f.current, 20000) })) };
          w.history.push({ at, actor: 'system', action: 'articleDrift', note: fields.map((f) => f.field).join(', ').slice(0, 200) });
        } else if (rec.drift) rec.drift = { ...rec.drift, resolvedAt: at };
      }
      await this.s.save(task, w, tx);
    });
  }
}
