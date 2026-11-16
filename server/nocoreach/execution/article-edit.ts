import { systemMessageText } from '../../../shared/i18n/messages.js';
import {
  ARTICLE_LEASE_MS,
  articleEditInput,
  type ArticleEditDraft,
  type ArticleEditForm,
  type ArticleEditLease,
  type ArticleEditState,
} from '../../../shared/article-edit.js';
import {
  taskImageIds,
  taskImageOf,
  type MessageImage,
} from '../../../shared/task-images.js';
import { roleOf } from '../policy.js';
import { fail, projectWork, type Artifact, type Work } from './model';

// Reviewing an article is editing it (2026-11-04): what the person changes in the review card is kept here every few
// seconds, without becoming a version or touching the task's work (no revision bump, nothing in Activity). One person
// edits at a time, holding a lease they renew while the card is open. A version is made only by `editArticleDraft`
// (on approval, a change request or a restore, which the page sends first), and that clears the kept changes.

/** nrSnapshots kinds, one record per task: the unversioned changes, and who holds the article for editing. */
export const EDIT_KIND = 'article-edit';
export const LEASE_KIND = 'article-lease';

/** Why an edit or a rewrite of an article version is refused: a message key, its parameters and the HTTP status. */
export type EditProblem = {
  key: string;
  status: number;
  params?: Record<string, unknown>;
};

/** The version `artifactId` when it is the article under review in the task's current step, else null. */
export function underReview(w: Work, artifactId: string): Artifact | null {
  const index = w.stageIndex ?? 0,
    stage = w.flow?.stages[index];
  if (w.stage !== 'flow' || stage?.kind !== 'review' || index < 1) return null;
  const out = w.results[index - 1];
  return out?.article && out.id === artifactId && !out.rejectedAt ? out : null;
}

/** Who may change the article: the task's owner or an administrator, as for the task's other steps (service.ts). */
export async function ownerProblem(
  db: unknown,
  w: Work,
  actor: string,
): Promise<EditProblem | null> {
  if (
    w.humanOwnerId &&
    String(w.humanOwnerId) !== String(actor) &&
    (await roleOf(db, actor)) !== 'admin'
  )
    return {
      key: 'messages.reviewsTaskLeaveComment',
      status: 403,
      params: { 0: w.humanOwnerName || systemMessageText('common.owner') },
    };
  return null;
}

/** Why the article version `artifactId` cannot be changed now, whoever asks; null when it can. */
export function versionProblem(
  w: Work,
  artifactId: string,
): EditProblem | null {
  if (w.cancelledAt)
    return { key: 'taskExecution.taskCancelledCannotMoveForward', status: 409 };
  if (w.archivedAt)
    return { key: 'taskExecution.taskArchivedRestoreFirst', status: 409 };
  if (!underReview(w, artifactId))
    return { key: 'taskExecution.articleVersionChanged', status: 409 };
  return null;
}

/** Why `actor` may not change the article version `artifactId` now; null when they may. */
export async function editProblem(
  db: unknown,
  w: Work,
  actor: string,
  artifactId: string,
): Promise<EditProblem | null> {
  return (await ownerProblem(db, w, actor)) ?? versionProblem(w, artifactId);
}

const refuse = (p: EditProblem): never =>
  fail(systemMessageText(p.key, p.params), p.status);

/** At most this many images are linked by one save, as by one edit made a version (article-flow.ts). */
const LINKED_PER_SAVE = 40;

/** The task images a form shows in its fields or sets as covers, each once. */
function formImageIds(form: ArticleEditForm): string[] {
  return [
    ...new Set([
      ...taskImageIds(
        Object.values(form.locales).flatMap((fields) => Object.values(fields)),
      ),
      ...Object.values(form.cover || {}).flatMap((v) => {
        const image = taskImageOf(v);
        return image ? [image.id] : [];
      }),
    ]),
  ];
}

/** What the article-edit records need of the task service. */
interface Host {
  p: {
    db: {
      access?: {
        requireFor(
          user: string,
          resource: string,
          action: string,
          project?: string,
        ): Promise<void>;
      };
    };
    /** manual-tasks.ts, which keeps the uploads. */
    taskAttachments?: {
      linkImages(
        connection: unknown,
        actor: string,
        project: string,
        taskId: string,
        ids: readonly string[],
      ): Promise<MessageImage[]>;
    };
  };
  key(kind: string, project: string, task: string, id?: string): string;
  snapshot(key: string, tx?: unknown): Promise<unknown>;
  put(key: string, payload: unknown, tx: unknown): Promise<void>;
  repo(name: string): {
    findOne(options: Record<string, unknown>): Promise<unknown>;
    destroy(options: Record<string, unknown>): Promise<unknown>;
    update(options: Record<string, unknown>): Promise<unknown>;
  };
  task(project: string, id: string, tx?: unknown): Promise<unknown>;
  lock<T>(
    project: string,
    task: string,
    fn: (tx: unknown) => Promise<T>,
  ): Promise<T>;
}

export class ArticleEditing {
  constructor(private readonly s: Host) {}
  private async drop(key: string, tx: unknown) {
    const repo = this.s.repo('nrSnapshots');
    if (await repo.findOne({ filter: { key }, transaction: tx }))
      await repo.destroy({ filter: { key }, transaction: tx });
  }
  /**
   * The images the saved form shows that are the person's own uploads (pasted, dropped or added in the editor, or a
   * cover), linked to the task now (2026-11-12): until then only the uploader's session reads them, for a day, so the
   * article showed them broken after signing in again, on another computer, to anyone else, or the next day. Each is
   * linked on its own and one that cannot be (someone else's, expired, another task's) is left for making the version
   * to refuse, so a save is never refused for an image. The work gains them as readable images without a revision.
   */
  private async link(
    project: string,
    taskId: string,
    task: { id?: unknown; evidence?: Record<string, unknown> },
    w: Work,
    form: ArticleEditForm,
    actor: string,
    tx: unknown,
  ) {
    const attachments = this.s.p.taskAttachments;
    if (!attachments) return;
    const known = new Set([
      ...(w.images || []),
      ...((task.evidence?.attachmentIds as string[] | undefined) || []),
    ]);
    const linked: string[] = [];
    for (const id of formImageIds(form)
      .filter((x) => !known.has(x))
      .slice(0, LINKED_PER_SAVE)) {
      try {
        await attachments.linkImages(
          (tx as { connection?: unknown } | undefined)?.connection,
          actor,
          project,
          taskId,
          [id],
        );
        linked.push(id);
      } catch (error) {
        if ((error as { reason?: string })?.reason !== 'TASK_IMAGE_UNAVAILABLE')
          throw error;
      }
    }
    if (!linked.length) return;
    w.images = [...(w.images || []), ...linked];
    await this.s.repo('nrTasks').update({
      filterByTk: task.id,
      values: { evidence: { ...task.evidence, work: w } },
      transaction: tx,
    });
  }
  /** The kept changes became a version, or another version replaced the one they were made to. */
  clear(project: string, taskId: string, tx: unknown) {
    return this.drop(this.s.key(EDIT_KIND, project, taskId), tx);
  }
  /** `nrTaskWork:articleEdit`: open (take or renew the lease), save, discard or release. */
  async handle(
    project: string,
    raw: unknown,
    actor: string,
    name: string,
  ): Promise<ArticleEditState> {
    const parsed = articleEditInput.safeParse(raw);
    if (!parsed.success)
      return fail(systemMessageText('taskExecution.articleEditInvalid'), 400);
    const v = parsed.data;
    // The same permission as saving the edit as a version (Edit directly).
    await this.s.p.db.access?.requireFor(
      actor,
      'nrTaskWork',
      'command.editArticleDraft',
      project,
    );
    if (v.op === 'save' && !v.form)
      return fail(systemMessageText('taskExecution.articleEditInvalid'), 400);
    return this.s.lock(project, v.taskId, async (tx) => {
      const task = (await this.s.task(project, v.taskId, tx)) as {
        id?: unknown;
        evidence?: Record<string, unknown>;
      };
      const w = projectWork(task);
      const leaseKey = this.s.key(LEASE_KIND, project, v.taskId),
        draftKey = this.s.key(EDIT_KIND, project, v.taskId);
      const now = Date.now();
      const stored = (await this.s.snapshot(
        leaseKey,
        tx,
      )) as ArticleEditLease | null;
      let lease = stored && Date.parse(stored.until) > now ? stored : null;
      let draft =
        ((await this.s.snapshot(draftKey, tx)) as ArticleEditDraft | null) ||
        null;
      const mine = () => lease?.userId === actor;
      const take = async () => {
        lease = {
          userId: actor,
          name,
          until: new Date(now + ARTICLE_LEASE_MS).toISOString(),
        };
        await this.s.put(leaseKey, lease, tx);
      };
      // Someone else holds the article: they are named, and nothing of theirs is changed.
      const free = () => {
        if (lease && !mine())
          refuse({
            key: 'taskExecution.articleBeingEdited',
            status: 409,
            params: { 0: lease.name },
          });
      };
      if (v.op === 'release') {
        if (mine()) {
          await this.drop(leaseKey, tx);
          lease = null;
        }
      } else {
        const owner = await ownerProblem(this.s.p.db, w, actor);
        if (owner) refuse(owner);
        if (v.op === 'open') {
          if (!lease || mine()) await take();
        } else if (v.op === 'discard') {
          free();
          await this.drop(draftKey, tx);
          draft = null;
        } else {
          free();
          const problem = versionProblem(w, v.artifactId);
          if (problem) refuse(problem);
          draft = {
            artifactId: v.artifactId,
            form: v.form!,
            ai: v.ai ?? 0,
            savedAt: new Date(now).toISOString(),
            savedBy: actor,
            savedByName: name,
          };
          await this.s.put(draftKey, draft, tx);
          await this.link(project, v.taskId, task, w, v.form!, actor, tx);
          await take();
        }
      }
      return { lease, mine: mine(), draft };
    });
  }
}
