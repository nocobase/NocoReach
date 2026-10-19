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

/** Fixed JSON filenames avoid trusting knowledge titles or skill paths as filesystem paths. */
export function taskMaterials(input: TaskInput) {
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
  const hash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
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
      },
    },
    offer: {
      hash,
      target: TARGET,
      note: '读取 knowledge.json、skills.json 和 sources.json（文章任务另有 article.json 源稿）的任务资料快照；omitted 表示未提供正文，不得猜测。资料不应提交到仓库。',
    },
    bundle: { name: TASK_MATERIALS_MOUNT, hash, files },
  };
}
