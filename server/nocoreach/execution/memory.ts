// @ts-nocheck
import { systemMessageText } from '../../../shared/i18n/messages.js';
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.
import { fail } from './model';
import { TOPICS_MAX, cleanTopic, topicKey, uniqueTopics } from '../../../shared/followed-topics.js';

// 记忆 (SPEC §6.0, 项目知识): what the AI team always reads about the project, in the sections of a brand handbook.
// Kept short (about 3,000 characters); long material belongs in the knowledge base.
export const MEMORY_SECTIONS = [
  ['brand', systemMessageText('projectKnowledge.brandBasics'), systemMessageText('projectKnowledge.brandNameOneLineIntro')],
  ['product', systemMessageText('projectKnowledge.product'), systemMessageText('projectKnowledge.productLinesCoreFeaturesValue')],
  ['audience', systemMessageText('projectKnowledge.audience'), systemMessageText('projectKnowledge.targetAudienceWhatCareAbout')],
  ['markets', systemMessageText('projectKnowledge.marketsLanguages'), systemMessageText('projectKnowledge.targetRegionsLanguagesRulesLanguage')],
  ['voice', systemMessageText('projectKnowledge.voiceStyle'), systemMessageText('projectKnowledge.brandPersonalityVoiceWritingRules')],
  ['wording', systemMessageText('projectKnowledge.terminology'), systemMessageText('projectKnowledge.glossaryWhichTermsUseAvoid')],
  ['messages', systemMessageText('projectKnowledge.keyMessages'), systemMessageText('projectKnowledge.claimsSellingPointsRepeatEvidence')],
  ['competitors', systemMessageText('common.competitor'), systemMessageText('projectKnowledge.mainCompetitorsHowDiffer')],
  ['rules', systemMessageText('projectKnowledge.rulesNoGoAreas'), systemMessageText('projectKnowledge.pagesContentNotChangeThings')],
] as const;
export type MemoryKey = typeof MEMORY_SECTIONS[number][0];
export type Memory = Record<MemoryKey, string>;
export const SECTION_MAX = 4000, MEMORY_MAX = 8000;
const str = (v: unknown) => typeof v === 'string' ? v.trim() : '';

// Projects saved before the sections existed keep their fields; they are read into the matching sections.
export function memoryOf(project: any): Memory {
  const m = project?.memory;
  // Saved sections win; a memory holding only the followed topics still reads the project's older fields.
  if (m && typeof m === 'object' && MEMORY_SECTIONS.some(([k]) => k in m)) return Object.fromEntries(MEMORY_SECTIONS.map(([k]) => [k, str(m[k])])) as Memory;
  const join = (...xs: unknown[]) => xs.map(str).filter(Boolean).join('\n');
  return {
    brand: join(project?.description, str(project?.positioning) && systemMessageText('projectKnowledge.positioning', { 0: str(project.positioning) })),
    product: join(str(project?.keyPages) && systemMessageText('projectKnowledge.keyPages', { 0: str(project.keyPages) })),
    audience: str(project?.audience),
    markets: join(project?.market, str(project?.contentLanguage) && systemMessageText('projectKnowledge.contentLanguage', { 0: str(project.contentLanguage) })),
    voice: str(project?.writingStyle),
    wording: str(project?.terminology),
    messages: '',
    competitors: str(project?.competitors),
    rules: str(project?.doNotChange),
  };
}

// Followed topics (2026-11-10): a list kept in memory beside the sections, which every external source searches. Null
// until the project's lists from GitHub hot topics, AI questions and Trends were moved here (followed-topics.ts); a
// source keeps its own list until then.
export function topicsOf(project: any): string[] | null {
  const list = project?.memory?.topics;
  return Array.isArray(list) ? uniqueTopics(list) : null;
}

// What the online AI and the Agent read: the project name and every filled section under its title, the followed
// topics after the competitors.
export function memoryForAI(project: any): Record<string, string> {
  const m = memoryOf(project), topics = topicsOf(project) || [];
  const out: Record<string, string> = { 项目: str(project?.name) };
  for (const [k, title] of MEMORY_SECTIONS) {
    if (m[k]) out[title] = m[k].slice(0, SECTION_MAX);
    if (k === 'competitors' && topics.length) out[systemMessageText('projectKnowledge.followedTopics')] = topics.join(', ');
  }
  return out;
}

// Cleans submitted topics: each a phrase of 2–60 characters without quotes, repeats dropped. More than TOPICS_MAX is
// refused unless every topic was already saved: lists moved from the sources may be longer, and are only trimmed.
export function topicsInput(v: any, saved: string[] = []): string[] {
  if (!Array.isArray(v)) return fail(systemMessageText('memory.invalidMemoryFormat'));
  for (const t of v) if (!cleanTopic(t)) fail(systemMessageText('memory.invalidTopic', { 0: String(t ?? '').slice(0, 60) }));
  const list = uniqueTopics(v), had = new Set(saved.map(topicKey));
  if (list.length > TOPICS_MAX && list.some((t) => !had.has(topicKey(t)))) fail(systemMessageText('memory.tooManyTopics', { 0: TOPICS_MAX }));
  return list;
}

// Cleans a submitted memory: known sections only, each and all together within the limits.
export function memoryInput(v: any): Memory {
  if (!v || typeof v !== 'object') return fail(systemMessageText('memory.invalidMemoryFormat'));
  const m = Object.fromEntries(MEMORY_SECTIONS.map(([k, title]) => {
    const t = v[k] === undefined || v[k] === null ? '' : typeof v[k] === 'string' ? v[k].trim() : fail(systemMessageText('messages.invalidFormat', { 0: title }));
    if (t.length > SECTION_MAX) fail(systemMessageText('messages.tooLongTrimCharactersPut', { 0: title, 1: SECTION_MAX }));
    return [k, t];
  })) as Memory;
  const total = Object.values(m).reduce((n, t) => n + t.length, 0);
  if (total > MEMORY_MAX) fail(systemMessageText('messages.memoryCharactersTotalTooLong', { 0: total, 1: MEMORY_MAX }));
  return m;
}
