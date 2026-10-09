import { fail } from './model.js';

// 记忆 (SPEC §6.0, 项目知识): what the AI team always reads about the project, in the sections of a brand handbook.
// Kept short (about 3,000 characters); long material belongs in the knowledge base.
export const MEMORY_SECTIONS = [
  ['brand', '品牌基础', '品牌名、一句话介绍、定位、官网'],
  ['product', '产品', '产品线、核心功能、价值主张、关键页面'],
  ['audience', '受众', '目标人群，他们关心什么'],
  ['markets', '市场与语言', '面向哪些地区和语言，各语言版本的规则'],
  ['voice', '语气与风格', '品牌个性、语气、写作规矩'],
  ['wording', '用词', '术语表：用哪个、不用哪个；产品名写法'],
  ['messages', '核心信息', '主张、要反复强调的卖点和证据'],
  ['competitors', '竞品', '主要竞品和我们的区别'],
  ['rules', '规矩与禁区', '不能改的页面和内容、不能说的话'],
] as const;
export type MemoryKey = typeof MEMORY_SECTIONS[number][0];
export type Memory = Record<MemoryKey, string>;
export const SECTION_MAX = 4000, MEMORY_MAX = 8000;
const str = (v: unknown) => typeof v === 'string' ? v.trim() : '';

// Projects saved before the sections existed keep their fields; they are read into the matching sections.
export function memoryOf(project: any): Memory {
  const m = project?.memory;
  if (m && typeof m === 'object') return Object.fromEntries(MEMORY_SECTIONS.map(([k]) => [k, str(m[k])])) as Memory;
  const join = (...xs: unknown[]) => xs.map(str).filter(Boolean).join('\n');
  return {
    brand: join(project?.description, str(project?.positioning) && `定位：${str(project.positioning)}`),
    product: join(str(project?.keyPages) && `关键页面：\n${str(project.keyPages)}`),
    audience: str(project?.audience),
    markets: join(project?.market, str(project?.contentLanguage) && `内容语言：${str(project.contentLanguage)}`),
    voice: str(project?.writingStyle),
    wording: str(project?.terminology),
    messages: '',
    competitors: str(project?.competitors),
    rules: str(project?.doNotChange),
  };
}

// What the online AI and the Agent read: the project name and every filled section under its title.
export function memoryForAI(project: any): Record<string, string> {
  const m = memoryOf(project);
  return { 项目: str(project?.name), ...Object.fromEntries(MEMORY_SECTIONS.filter(([k]) => m[k]).map(([k, title]) => [title, m[k].slice(0, SECTION_MAX)])) };
}

// Cleans a submitted memory: known sections only, each and all together within the limits.
export function memoryInput(v: any): Memory {
  if (!v || typeof v !== 'object') return fail('记忆格式不对');
  const m = Object.fromEntries(MEMORY_SECTIONS.map(([k, title]) => {
    const t = v[k] === undefined || v[k] === null ? '' : typeof v[k] === 'string' ? v[k].trim() : fail(`“${title}”格式不对`);
    if (t.length > SECTION_MAX) fail(`“${title}”太长了，请精简到 ${SECTION_MAX} 字以内，长材料放进知识库`);
    return [k, t];
  })) as Memory;
  const total = Object.values(m).reduce((n, t) => n + t.length, 0);
  if (total > MEMORY_MAX) fail(`记忆一共 ${total} 字，太长了；每次都会读，请精简到 ${MEMORY_MAX} 字以内，长材料放进知识库`);
  return m;
}
