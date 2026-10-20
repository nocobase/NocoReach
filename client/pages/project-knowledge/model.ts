import { $t, type Message } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import type { Project } from '../reach-data';

// 项目知识 (SPEC §6.0): what the AI team knows about this project — 记忆, read every time and kept short, in the sections
// of a brand handbook; and 知识库, material the Agent looks up when it needs to. Shared by the page and its two tabs.
export type MemoryKey =
  | 'brand'
  | 'product'
  | 'audience'
  | 'markets'
  | 'voice'
  | 'wording'
  | 'messages'
  | 'competitors'
  | 'rules';
export type Memory = Record<MemoryKey, string>;
export const getMemorySections = (): [MemoryKey, string, string][] => [
  [
    'brand',
    $t('projectKnowledge.brandBasics'),
    $t('projectKnowledge.brandNameOneLineIntro'),
  ],
  [
    'product',
    $t('projectKnowledge.product'),
    $t('projectKnowledge.productLinesCoreFeaturesValue'),
  ],
  [
    'audience',
    $t('projectKnowledge.audience'),
    $t('projectKnowledge.targetAudienceWhatCareAbout'),
  ],
  [
    'markets',
    $t('projectKnowledge.marketsLanguages'),
    $t('projectKnowledge.targetRegionsLanguagesRulesLanguage'),
  ],
  [
    'voice',
    $t('projectKnowledge.voiceStyle'),
    $t('projectKnowledge.brandPersonalityVoiceWritingRules'),
  ],
  [
    'wording',
    $t('projectKnowledge.terminology'),
    $t('projectKnowledge.glossaryWhichTermsUseAvoid'),
  ],
  [
    'messages',
    $t('projectKnowledge.keyMessages'),
    $t('projectKnowledge.claimsSellingPointsRepeatEvidence'),
  ],
  [
    'competitors',
    $t('common.competitor'),
    $t('projectKnowledge.mainCompetitorsHowDiffer'),
  ],
  [
    'rules',
    $t('projectKnowledge.rulesNoGoAreas'),
    $t('projectKnowledge.pagesContentNotChangeThings'),
  ],
];
// What is read every time is kept short: the page shows the length against this, the server refuses above its limits.
export const SUGGESTED = 3000,
  SECTION_MAX = 4000,
  MEMORY_MAX = 8000;
export type KnowledgeProject = Project;
// Same reading as the server's memoryOf: saved sections, or a project's older fields read into them.
export function memoryOf(p?: Partial<KnowledgeProject>): Memory {
  const s = (v?: string) => (v || '').trim();
  if (p?.memory)
    return Object.fromEntries(
      getMemorySections().map(([k]) => [k, s(p.memory?.[k])]),
    ) as Memory;
  const join = (...xs: string[]) => xs.filter(Boolean).join('\n');
  return {
    brand: join(
      s(p?.description),
      s(p?.positioning) &&
        $t('projectKnowledge.positioning', { 0: s(p?.positioning) }),
    ),
    product:
      s(p?.keyPages) && $t('projectKnowledge.keyPages', { 0: s(p?.keyPages) }),
    audience: s(p?.audience),
    markets: join(
      s(p?.market),
      s(p?.contentLanguage) &&
        $t('projectKnowledge.contentLanguage', { 0: s(p?.contentLanguage) }),
    ),
    voice: s(p?.writingStyle),
    wording: s(p?.terminology),
    messages: '',
    competitors: s(p?.competitors),
    rules: s(p?.doNotChange),
  };
}

export const getCategories = (): [string, string][] => [
  ['competitor', $t('common.competitor')],
  ['customer', $t('projectKnowledge.customers')],
  ['product', $t('projectKnowledge.product')],
  ['industry', $t('projectKnowledge.industry')],
  ['agent', $t('projectKnowledge.agent')],
  ['other', $t('common.other')],
];
export const categoryName = (c: string) =>
  getCategories().find(([k]) => k === c)?.[1] || $t('common.other');
export type Item = {
  id: string;
  title: string;
  category: string;
  kind: 'text' | 'file' | 'link';
  fileName?: string;
  source?: string;
  chars: number;
  summary: string;
  addedAt: string;
};
export const kindName = (i: Item) =>
  i.kind === 'file'
    ? $t('projectKnowledge.file')
    : i.kind === 'link'
      ? $t('projectKnowledge.webPage')
      : $t('projectKnowledge.text');

// 记忆 that keeps up (confirmed 2026-10-04): the first draft written from the website and the 知识库 when the project was
// created, and the weekly suggestions from change requests, approved results and the website, accepted one by one.
export type MemorySuggestion = {
  id: string;
  section: MemoryKey;
  label: string;
  text: string;
  replace?: string;
  reason?: string;
  examples?: string[];
  source: 'reviews' | 'results' | 'site' | 'draft';
  at: string;
};
export type MemoryStatus = {
  running: 'draft' | 'check' | null;
  aiReady: boolean;
  draft: {
    status: 'done' | 'failed';
    at: string;
    pages?: { url: string; title: string }[];
    items?: string[];
    filled?: string[];
    suggested?: number;
    error?: string;
    seen: boolean;
  } | null;
  lastCheck: { at: string; ok: boolean; error?: string; added?: number } | null;
  suggestions: MemorySuggestion[];
};
export type MemoryUpdates = {
  status?: MemoryStatus;
  busy: boolean;
  error: string;
  reload: () => void;
  run: (kind: 'draft' | 'check') => Promise<void>;
  seen: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  accept: (id: string) => Promise<void>;
};

// What the page gives its tabs and their overlays through the Outlet.
export type ProjectKnowledgeContext = {
  project: KnowledgeProject;
  items?: Item[];
  itemsError: string;
  /** Reads the list again; settles once it is read or has failed. */
  reloadItems: () => Promise<void>;
  updates: MemoryUpdates;
  /** After 记忆 or the project changed: shows the message and reloads the project. */
  projectSaved: (message: Message) => void;
};

// The knowledge tab's own URL parameters, dropped when moving to the other tab.
export const KNOWLEDGE_PARAMS = ['q', 'category', 'sort'];

export const request = <T>(
  action: string,
  projectId: number,
  body: object = {},
) =>
  api.action<T>('nrKnowledge', action, {
    method: 'POST',
    body: { projectId: String(projectId), ...body },
    unwrap: 'data',
  });
export const memoryRequest = <T>(
  action: string,
  projectId: number,
  body: object = {},
) =>
  api.action<T>('nrMemory', action, {
    method: 'POST',
    body: { projectId: String(projectId), ...body },
    unwrap: 'data',
  });
export const addRequest = <T>(
  action: string,
  projectId: number,
  body: object = {},
) =>
  api.action<T>('nrKnowledgeAdd', action, {
    method: 'POST',
    body: { projectId: String(projectId), ...body },
    unwrap: 'data',
  });
export const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
