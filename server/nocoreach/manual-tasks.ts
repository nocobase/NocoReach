import { createHash } from 'node:crypto';
import type { DatabaseManager, Repository } from '@nocobase/db';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type {
  ServerFileRepositoryManager,
  FileRecord,
} from '@nocobase/app-plugin-file/server';
import { ApiError } from '@nocobase/app-server/router';
import type { NocoReachRuntime } from '../providers/nocoreach.js';
import type { LegacyRecord } from './legacy/database.js';
import { projectWork } from './execution/model.js';
import type { TaskService } from './execution/service.js';
import { roleOf } from './policy.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
import {
  ManualTaskInput,
  ManualTaskView,
  TaskMediaView,
  TASK_MEDIA_COUNT,
  TASK_MEDIA_LIMIT,
  TASK_MEDIA_TYPES,
} from '../../shared/manual-task.js';

export interface TaskCreator {
  readonly id: string;
  readonly name: string;
  /** Authenticated session/key ID. Never taken from request JSON. */
  readonly sessionId: string;
}
export interface TaskMediaRecord extends FileRecord {
  ownerId: string;
  sessionId: string;
  projectId: string;
  draftId: string;
  taskId: string | null;
  expiresAt: Date | string;
  deleting: boolean;
}
const ACCESS_PATH = '/uploads/task-media';
const EXPIRY = 24 * 60 * 60 * 1000;
const UNLINKED_LIMIT = 20;

function denied(
  reason: string,
  message: string,
  status:
    | 'PERMISSION_DENIED'
    | 'ALREADY_EXISTS'
    | 'INVALID_ARGUMENT'
    | 'NOT_FOUND'
    | 'RESOURCE_EXHAUSTED' = 'PERMISSION_DENIED',
): never {
  throw new ApiError({ status, domain: 'nocoreach', reason, message });
}
const evidenceOf = (row: LegacyRecord): Record<string, unknown> => {
  const value: unknown = row.get('evidence');
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
};
function view(row: LegacyRecord): ManualTaskView {
  const evidence = evidenceOf(row);
  return ManualTaskView.parse({
    id: String(row.get('id')),
    number: `T-${String(evidence.no)}`,
    projectId: String(row.get('projectId')),
    title: String(row.get('title')),
    brief: String(row.get('brief')),
    status: String(row.get('status')),
    source: 'manual',
    attachmentIds: evidence.attachmentIds ?? [],
  });
}

/** Match bounded binary signatures, not the filename or caller-supplied MIME alone. */
export async function validateTaskMedia(file: File): Promise<void> {
  if (
    !TASK_MEDIA_TYPES.some((type) => type === file.type) ||
    !file.size ||
    file.size > TASK_MEDIA_LIMIT
  )
    denied(
      'TASK_MEDIA_INVALID',
      'Unsupported media type or size.',
      'INVALID_ARGUMENT',
    );
  const bytes = Buffer.from(await file.slice(0, 64).arrayBuffer());
  const is = (offset: number, value: string) =>
    bytes.subarray(offset, offset + value.length).toString('latin1') === value;
  const valid = {
    'image/png': bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    'image/gif': is(0, 'GIF87a') || is(0, 'GIF89a'),
    'image/webp': is(0, 'RIFF') && is(8, 'WEBP'),
    'video/mp4':
      is(4, 'ftyp') &&
      ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].some((brand) =>
        is(8, brand),
      ),
    'video/webm':
      bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])) &&
      bytes.includes(Buffer.from('webm')),
  };
  if (!valid[file.type as keyof typeof valid])
    denied(
      'TASK_MEDIA_SIGNATURE',
      'Media content does not match its type.',
      'INVALID_ARGUMENT',
    );
}

/** Application-owned task creation; no execution or strategy state mutation. */
export class ManualTasks {
  private readonly media: Repository<TaskMediaRecord>;
  private tails = new Map<string, Promise<void>>();
  constructor(
    private readonly runtime: NocoReachRuntime,
    database: DatabaseManager,
    private readonly files: ServerFileRepositoryManager,
    private readonly drive: NocoBaseDriveManager,
    private readonly basePath: string,
  ) {
    this.media = database.repository<TaskMediaRecord>('nrTaskMedia');
  }

  // The application supports one process. Serialize uploads per creator outside
  // DB transactions; the persisted quota survives restart. No I/O holds a DB lock.
  private async serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const done = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => done);
    this.tails.set(key, tail);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  async authorize(actor: TaskCreator, projectId: string): Promise<void> {
    await this.runtime.ready;
    const root = await this.runtime.users.isRoot(actor.id);
    if (!root && !(await roleOf(this.runtime.legacy.db, actor.id)))
      denied('TASK_CREATE_DENIED', 'NocoReach membership is required.');
    await this.runtime.legacy.db.access?.requireFor(actor.id, 'nrTasks', 'createManual', projectId);
    // Projects are shared among NocoReach members, as all current task APIs are.
    await this.runtime.plugin.projects.get(projectId);
  }

  private mediaView(row: TaskMediaRecord): TaskMediaView {
    return TaskMediaView.parse({
      id: row.id,
      filename: row.filename,
      mimeType: row.mimeType,
      size: Number(row.size),
      contentUrl: `${this.basePath}${ACCESS_PATH}/${row.id}${row.ext ? `.${row.ext}` : ''}`,
    });
  }

  async upload(
    actor: TaskCreator,
    projectId: string,
    draftId: string,
    file: File,
  ): Promise<TaskMediaView> {
    await this.authorize(actor, projectId);
    await validateTaskMedia(file);
    return this.serial(`upload:${actor.id}`, async () => {
      const pending = await this.media.count({
        filter: { ownerId: actor.id, taskId: null },
      });
      const draft = await this.media.count({
        filter: { ownerId: actor.id, draftId, taskId: null },
      });
      if (pending >= UNLINKED_LIMIT || draft >= TASK_MEDIA_COUNT)
        denied(
          'TASK_MEDIA_QUOTA',
          'Remove unused files before uploading more.',
          'RESOURCE_EXHAUSTED',
        );
      const repository = this.files.repository('nrTaskMedia', {
        disk: 'local',
        accessPath: ACCESS_PATH,
        policy: {
          read: true,
          create: {
            scope: true,
            defaults: {
              ownerId: actor.id,
              sessionId: actor.sessionId,
              projectId,
              draftId,
              taskId: null,
              expiresAt: new Date(Date.now() + EXPIRY),
              deleting: false,
            },
          },
          update: false,
          delete: false,
        },
      });
      const uploaded = await repository.uploadOne({ file });
      const row = await this.media.findOne({
        filter: { id: uploaded.record.id },
      });
      if (!row) throw new Error('Uploaded task media record is missing.');
      return this.mediaView(row);
    });
  }

  async create(
    actor: TaskCreator,
    raw: ManualTaskInput,
  ): Promise<ManualTaskView> {
    const input = ManualTaskInput.parse(raw);
    await this.authorize(actor, input.projectId);
    const key = `manual:${actor.id}:${input.requestId}`;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(input))
      .digest('hex');
    const repo = this.runtime.legacy.db.getRepository('nrTasks');
    const existing = async () => {
      const row = await repo.findOne({ filter: { taskKey: key } });
      if (!row) return undefined;
      if (evidenceOf(row).manualDigest !== fingerprint)
        denied(
          'TASK_REQUEST_REUSED',
          'This request key was used with different input.',
          'ALREADY_EXISTS',
        );
      return view(row);
    };
    return this.serial(key, async () => {
      const retry = await existing();
      if (retry) return retry;
      try {
        return await this.runtime.legacy.db.sequelize.transaction(
          async (tx) => {
            if (input.playbookId)
              await (
                this.runtime.plugin as unknown as { taskExecution: TaskService }
              ).taskExecution.playbooks.get(
                input.projectId,
                input.playbookId,
                tx,
              );
            const evidence = {
              origin: 'manual',
              source: 'manual',
              manualDigest: fingerprint,
              createdBy: { id: actor.id, name: actor.name },
              attachmentIds: input.attachmentIds,
              ...(input.playbookId
                ? { suggestedPlaybook: input.playbookId }
                : {}),
            };
            const work = projectWork({ evidence });
            const row = await repo.create({
              values: {
                projectId: input.projectId,
                taskKey: key,
                title: input.title,
                brief: input.description,
                status: systemMessageText('common.pending'),
                evidence: { ...evidence, work },
              },
              transaction: tx,
            });
            // Compare-and-set prevents two tasks or cleanup claiming the same file.
            // A failed link rolls task insertion and number allocation back together.
            const media = tx.connection.repository(
              'nrTaskMedia',
            ) as Repository<TaskMediaRecord>;
            for (const id of input.attachmentIds) {
              const file = await media.findOne({ filter: { id } });
              if (
                !file ||
                file.ownerId !== actor.id ||
                file.sessionId !== actor.sessionId ||
                file.projectId !== input.projectId ||
                file.draftId !== input.requestId ||
                file.taskId ||
                file.deleting ||
                new Date(file.expiresAt).getTime() <= Date.now()
              )
                denied(
                  'TASK_MEDIA_LINK_DENIED',
                  'A file is unavailable in this draft.',
                );
              const linked = await media.updateMany({
                filter: { id, taskId: null, deleting: false },
                values: { taskId: String(row.get('id')) },
              });
              if (linked.updatedCount !== 1)
                denied(
                  'TASK_MEDIA_LINK_DENIED',
                  'A file is unavailable in this draft.',
                );
            }
            return view(row);
          },
        );
      } catch (error) {
        // A database uniqueness race is reconciled only after rollback, not in a
        // failed transaction. Preserve all other failures if no committed task exists.
        const committed = await existing();
        if (committed) return committed;
        throw error;
      }
    });
  }

  async read(actor: TaskCreator, id: string): Promise<TaskMediaRecord> {
    const file = await this.media.findOne({ filter: { id, deleting: false } });
    if (!file) denied('TASK_MEDIA_NOT_FOUND', 'File not found.', 'NOT_FOUND');
    await this.authorize(actor, file.projectId);
    if (file.taskId) {
      const row = await this.runtime.legacy.db
        .getRepository('nrTasks')
        .findOne({ filter: { id: file.taskId, projectId: file.projectId } });
      const ids = row && evidenceOf(row).attachmentIds;
      if (!Array.isArray(ids) || !ids.includes(id))
        denied('TASK_MEDIA_LINK_DENIED', 'File access denied.');
    } else if (
      file.ownerId !== actor.id ||
      file.sessionId !== actor.sessionId ||
      new Date(file.expiresAt).getTime() <= Date.now()
    )
      denied('TASK_MEDIA_READ_DENIED', 'File access denied.');
    return file;
  }

  async list(
    actor: TaskCreator,
    projectId: string,
    taskId: string,
  ): Promise<TaskMediaView[]> {
    await this.authorize(actor, projectId);
    const row = await this.runtime.legacy.db
      .getRepository('nrTasks')
      .findOne({ filter: { id: taskId, projectId } });
    if (!row) denied('TASK_NOT_FOUND', 'Task not found.', 'NOT_FOUND');
    const ids = evidenceOf(row).attachmentIds;
    if (!Array.isArray(ids)) return [];
    const result: TaskMediaView[] = [];
    for (const id of ids)
      if (typeof id === 'string')
        result.push(this.mediaView(await this.read(actor, id)));
    return result;
  }

  async discard(actor: TaskCreator, id: string): Promise<void> {
    // Deletion claims stay unreadable/unlinkable, but their owner can retry.
    const file = await this.media.findOne({ filter: { id } });
    if (!file) denied('TASK_MEDIA_NOT_FOUND', 'File not found.', 'NOT_FOUND');
    await this.authorize(actor, file.projectId);
    if (
      file.taskId ||
      file.ownerId !== actor.id ||
      file.sessionId !== actor.sessionId
    )
      denied('TASK_MEDIA_DELETE_DENIED', 'Linked files cannot be removed.');
    await this.remove(file);
  }

  private async remove(file: TaskMediaRecord): Promise<void> {
    // Claim deletion durably before storage I/O; linking rejects the claimed row.
    const claimed = await this.media.updateMany({
      filter: { id: file.id, taskId: null },
      values: { deleting: true },
    });
    if (!claimed.updatedCount) return;
    await this.drive.use(file.disk).delete(file.key);
    await this.media.deleteOne({
      filter: { id: file.id, taskId: null, deleting: true },
    });
  }

  async cleanup(): Promise<void> {
    const pending = await this.media.findMany({
      filter: (f) =>
        f.and([
          f.string('taskId').eq(null),
          f.or([
            f.boolean('deleting').isTrue(),
            f.date('expiresAt').before(new Date()),
          ]),
        ]),
      limit: 50,
    });
    for (const file of pending) {
      try {
        await this.remove(file);
      } catch {
        this.runtime.logger.warn(
          'Task media deletion failed; the claimed record will be retried.',
        );
      }
    }
  }
}
