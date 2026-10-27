import { systemMessageText } from '../../../shared/i18n/messages.js';
import { createHash } from 'node:crypto';
import { fail } from './model';

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
/** Raw bytes of the attachments a run receives, in their attached order. */
export const ATTACHMENT_BUDGET = 25 * 1024 * 1024;
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
) {
  const {
    knowledge = [],
    skills = [],
    sources = null,
    article,
    ...context
  } = input as TaskInput & { article?: { source?: unknown } };
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
  ];
  const plan = attachmentPlan(attachments);
  if (plan.length)
    files.push({
      path: 'attachments.json',
      content: JSON.stringify(plan.map(({ entry }) => entry)),
    });
  // Linked attachments never change, so their ids and sizes stand in for their bytes in the hash. Without
  // attachments the hash is the one runners already cached.
  const hash = createHash('sha256')
    .update(
      JSON.stringify(
        plan.length
          ? [files, plan.map(({ file, entry }) => [file.id, file.size, entry])]
          : files,
      ),
    )
    .digest('hex');
  for (const { file, entry } of plan)
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
            },
          }
        : {}),
      materials: {
        knowledge: `${TARGET}/knowledge.json`,
        skills: `${TARGET}/skills.json`,
        sources: `${TARGET}/sources.json`,
        ...(article ? { article: `${TARGET}/article.json` } : {}),
        ...(plan.length ? { attachments: `${TARGET}/attachments.json` } : {}),
      },
    },
    offer: {
      hash,
      target: TARGET,
      note: `读取 knowledge.json、skills.json 和 sources.json（文章任务另有 article.json 源稿）的任务资料快照；omitted 表示未提供正文，不得猜测。${plan.length ? '任务附件列在 attachments.json：base64 字段指向原件的 base64 文本，先解码再打开（如 base64 -d 文件.base64 > 原文件名）；带 omitted 的附件（video 或 size）未提供，需要时请任务负责人在任务页下载。' : ''}资料不应提交到仓库。`,
    },
    bundle: { name: TASK_MATERIALS_MOUNT, hash, files },
  };
}
