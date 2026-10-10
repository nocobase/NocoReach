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
  const { knowledge, skills, ...context } = input;
  if (JSON.stringify(context).length > 200000)
    return fail('任务资料过长，请精简后再执行');
  return JSON.stringify({ ...context, knowledge, skills });
}

/** Fixed JSON filenames avoid trusting knowledge titles or skill paths as filesystem paths. */
export function taskMaterials(input: TaskInput) {
  const { knowledge = [], skills = [], ...context } = input;
  const files = [
    { path: 'knowledge.json', content: JSON.stringify(knowledge) },
    { path: 'skills.json', content: JSON.stringify(skills) },
  ];
  const hash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return {
    context: {
      ...context,
      materials: {
        knowledge: `${TARGET}/knowledge.json`,
        skills: `${TARGET}/skills.json`,
      },
    },
    offer: {
      hash,
      target: TARGET,
      note: '读取 knowledge.json 和 skills.json 的任务资料快照；omitted 表示未提供正文，不得猜测。资料不应提交到仓库。',
    },
    bundle: { name: TASK_MATERIALS_MOUNT, hash, files },
  };
}
