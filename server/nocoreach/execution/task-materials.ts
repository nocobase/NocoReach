import { systemMessageText } from '../../../shared/i18n/messages.js';
import { createHash } from 'node:crypto';
import { fail } from './model';
import { taskImageOf, taskImageRef } from '../../../shared/task-images.js';

export interface TaskInput {
  mode: string;
  repo?: { repo: string; baseBranch: string } | null;
  knowledge?: unknown[];
  skills?: unknown[];
  [key: string]: unknown;
}

export const TASK_MATERIALS_MOUNT = 'nocoreach-task-materials';
const TARGET = '.nocoreach-materials';

/**
 * A file attached to the task (New task › Upload attachments). A mount carries text only, so an included file is its
 * bytes in base64, to decode before opening; videos and files past the size budget are listed without content.
 */
export interface MaterialAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  /** The stored file's extension, which an image's address ends with. */
  ext?: string;
  /** The file's bytes; absent while only the offer's hash is needed. */
  read?: () => Promise<Buffer>;
}
export interface TaskAttachmentReader {
  /** The task's linked files among `ids`, read on the caller's connection. */
  forAgent(
    connection: import('@nocobase/db').DatabaseConnection,
    projectId: string,
    taskId: string,
    ids: readonly string[],
  ): Promise<MaterialAttachment[]>;
  /** Link the actor's images to a started task in the caller's transaction (manual-tasks.ts linkImages). */
  linkImages(
    connection: import('@nocobase/db').DatabaseConnection,
    actorId: string,
    projectId: string,
    taskId: string,
    ids: readonly string[],
  ): Promise<import('../../../shared/task-images.js').MessageImage[]>;
}
/** The attachment ids a run's input carries: a manual task's evidence. */
export function attachmentIdsOf(input: TaskInput): string[] {
  const evidence = input.evidence as { attachmentIds?: unknown } | undefined;
  return Array.isArray(evidence?.attachmentIds)
    ? evidence.attachmentIds.filter(
        (id): id is string => typeof id === 'string',
      )
    : [];
}
/**
 * The images the messages in a run's input carry (notes and feedback, 2026-11-03), each once, in the order they
 * first appear.
 */
export function messageImageIdsOf(input: TaskInput): string[] {
  const ids = new Set<string>();
  for (const list of [input.notes, input.feedback])
    for (const message of Array.isArray(list) ? list : []) {
      const images = (message as { images?: unknown } | null)?.images;
      for (const image of Array.isArray(images) ? images : []) {
        const found = taskImageOf(String((image as { ref?: unknown })?.ref));
        if (found) ids.add(found.id);
      }
    }
  return [...ids];
}
/** Raw bytes of the attachments a run receives, in their attached order. */
export const ATTACHMENT_BUDGET = 25 * 1024 * 1024;
/** Raw bytes of the message images a run receives, apart from the attachments. */
export const IMAGE_BUDGET = 25 * 1024 * 1024;
const safeName = (name: string) =>
  name
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^\.+/, '')
    .slice(-80) || 'file';
/** Which attachments a run receives and where; the hash follows the immutable ids and sizes, not the bytes. */
export function attachmentPlan(attachments: readonly MaterialAttachment[]) {
  let budget = ATTACHMENT_BUDGET;
  return attachments.map((file, index) => {
    const video = file.type.startsWith('video/');
    const included = !video && file.size <= budget;
    if (included) budget -= file.size;
    return {
      file,
      entry: {
        name: file.name,
        type: file.type,
        size: file.size,
        ...(included
          ? { base64: `attachments/${index + 1}-${safeName(file.name)}.base64` }
          : { omitted: video ? 'video' : 'size' }),
      },
    };
  });
}

/** Which message images a run receives and where: each under its own id, within the image budget. */
export function imagePlan(images: readonly MaterialAttachment[]) {
  let budget = IMAGE_BUDGET;
  return images.map((file) => {
    const included = file.size <= budget;
    if (included) budget -= file.size;
    const ext = /\.([a-z0-9]{1,32})$/.exec(file.name.toLowerCase())?.[1];
    return {
      file,
      entry: {
        ref: taskImageRef(file.id, file.ext ?? ext),
        name: file.name,
        type: file.type,
        size: file.size,
        ...(included
          ? { base64: `images/${file.id}.base64` }
          : { omitted: 'size' as const }),
      },
    };
  });
}

/** Keep the immutable materials in the business snapshot, outside the prompt's budget. */
export function serializeTaskInput(input: TaskInput): string {
  const { knowledge, skills, article, ...context } = input;
  if (JSON.stringify(context).length > 200000)
    return fail(systemMessageText('taskExecution.taskMaterialTooLongTrim'));
  // An article step's source holds complete bodies; it goes to the Runner as a material file, not in the prompt.
  if (article !== undefined && JSON.stringify(article).length > 1500000)
    return fail(systemMessageText('taskExecution.taskMaterialTooLongTrim'));
  return JSON.stringify({
    ...context,
    knowledge,
    skills,
    ...(article !== undefined ? { article } : {}),
  });
}

/**
 * Fixed JSON filenames avoid trusting knowledge titles or skill paths as filesystem paths; attachment files are
 * numbered with a cleaned name. `contents` holds the base64 of the included attachments when the bundle is served.
 */
export function taskMaterials(
  input: TaskInput,
  attachments: readonly MaterialAttachment[] = [],
  contents?: ReadonlyMap<string, string>,
  images: readonly MaterialAttachment[] = [],
) {
  const {
    knowledge = [],
    skills = [],
    sources = null,
    article,
    ...context
  } = input as TaskInput & {
    article?: {
      source?: unknown;
      previous?: { version: number; editedByHand: boolean; article: unknown };
    };
  };
  const previous = article?.previous;
  const files = [
    { path: 'knowledge.json', content: JSON.stringify(knowledge) },
    { path: 'skills.json', content: JSON.stringify(skills) },
    { path: 'sources.json', content: JSON.stringify(sources) },
    ...(article
      ? [
          {
            path: 'article.json',
            content: JSON.stringify(article.source ?? null),
          },
        ]
      : []),
    // The version the change request is about holds complete bodies too.
    ...(previous
      ? [{ path: 'previous.json', content: JSON.stringify(previous.article) }]
      : []),
  ];
  const plan = attachmentPlan(attachments);
  if (plan.length)
    files.push({
      path: 'attachments.json',
      content: JSON.stringify(plan.map(({ entry }) => entry)),
    });
  const shown = imagePlan(images);
  if (shown.length)
    files.push({
      path: 'images.json',
      content: JSON.stringify(shown.map(({ entry }) => entry)),
    });
  // Linked attachments and images never change, so their ids and sizes stand in for their bytes in the hash. Without
  // either the hash is the one runners already cached.
  const hash = createHash('sha256')
    .update(
      JSON.stringify(
        plan.length || shown.length
          ? [
              files,
              plan.map(({ file, entry }) => [file.id, file.size, entry]),
              ...(shown.length
                ? [shown.map(({ file, entry }) => [file.id, file.size, entry])]
                : []),
            ]
          : files,
      ),
    )
    .digest('hex');
  for (const { file, entry } of [...plan, ...shown])
    if ('base64' in entry && entry.base64)
      files.push({ path: entry.base64, content: contents?.get(file.id) ?? '' });
  return {
    context: {
      ...context,
      ...(article
        ? {
            article: {
              ...article,
              source: article.source ? `${TARGET}/article.json` : null,
              ...(previous
                ? {
                    previous: {
                      ...previous,
                      article: `${TARGET}/previous.json`,
                    },
                  }
                : {}),
            },
          }
        : {}),
      materials: {
        knowledge: `${TARGET}/knowledge.json`,
        skills: `${TARGET}/skills.json`,
        sources: `${TARGET}/sources.json`,
        ...(article ? { article: `${TARGET}/article.json` } : {}),
        ...(plan.length ? { attachments: `${TARGET}/attachments.json` } : {}),
        ...(shown.length ? { images: `${TARGET}/images.json` } : {}),
      },
    },
    offer: {
      hash,
      target: TARGET,
      note: `读取 knowledge.json、skills.json 和 sources.json（文章任务另有 article.json 源稿）的任务资料快照；omitted 表示未提供正文，不得猜测。${plan.length ? '任务附件列在 attachments.json：base64 字段指向原件的 base64 文本，先解码再打开（如 base64 -d 文件.base64 > 原文件名）；带 omitted 的附件（video 或 size）未提供，需要时请任务负责人在任务页下载。' : ''}${shown.length ? '留言和审核意见里的图片列在 images.json：ref 与 notes、feedback 中图片的 ref 相同，base64 字段指向原图的 base64 文本，先解码再查看；带 omitted 的图片未提供。' : ''}资料不应提交到仓库。`,
    },
    bundle: { name: TASK_MATERIALS_MOUNT, hash, files },
  };
}
