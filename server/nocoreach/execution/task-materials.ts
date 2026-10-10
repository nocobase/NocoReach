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
  const { knowledge = [], skills = [], sources = null, ...context } = input;
  const files = [
    { path: 'knowledge.json', content: JSON.stringify(knowledge) },
    { path: 'skills.json', content: JSON.stringify(skills) },
    { path: 'sources.json', content: JSON.stringify(sources) },
  ];
  const hash = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return {
    context: {
      ...context,
      materials: {
        knowledge: `${TARGET}/knowledge.json`,
        skills: `${TARGET}/skills.json`,
        sources: `${TARGET}/sources.json`,
      },
    },
    offer: {
      hash,
      target: TARGET,
      note: '读取 knowledge.json、skills.json 和 sources.json 的任务资料快照；omitted 表示未提供正文，不得猜测。资料不应提交到仓库。',
    },
    bundle: { name: TASK_MATERIALS_MOUNT, hash, files },
  };
}

/** Online agents have no file mounts. Keep each material budget separate and offer paged reads. */
export function onlineTaskContext(input: TaskInput) {
  const { knowledge = [], skills = [], sources = null, ...context } = input;
  const bounded = (value: unknown, section: string, budget: number) => {
    const serialized = JSON.stringify(value);
    return serialized.length <= budget
      ? value
      : {
          omitted: true,
          preview: serialized.slice(0, budget),
          characters: serialized.length,
          readSection: section,
          note: 'Preview is incomplete. Use task data with this section and follow page.nextOffset to read the complete immutable snapshot.',
        };
  };
  return {
    ...(JSON.stringify(context).length <= 24000
      ? context
      : {
          mode: input.mode,
          resultKind: input.resultKind,
          context: bounded(context, 'context', 24000),
        }),
    knowledge: bounded(knowledge, 'knowledge', 16000),
    skills: bounded(skills, 'skills', 16000),
    sources: bounded(sources, 'sources', 24000),
  };
}
