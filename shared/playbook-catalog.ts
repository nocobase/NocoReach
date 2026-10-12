import { systemMessageText } from './i18n/messages.js';
// Pure canonical types and definitions shared by the server and snapshot display.
export type StageKind =
  'ai' | 'agent' | 'review' | 'publish' | 'release' | 'observe';
export type AgentMode = 'analyze' | 'change';
export type ChecklistItem = { key: string; label: string; required: boolean };
export type Stage = {
  key: string;
  name: string;
  kind: StageKind;
  mode?: AgentMode;
  instruction?: string;
  checklist?: ChecklistItem[];
  skills?: string[];
};
export type PlaybookKind = 'plan' | 'build';
export type StepKind = 'analyze' | 'change' | 'review';
export type Step = {
  key: string;
  name: string;
  kind: StepKind;
  instruction?: string;
  checklist?: ChecklistItem[];
  skills?: string[];
};
export type Category = 'research' | 'create' | 'optimize' | 'technical';
export type Playbook = {
  id: string;
  name: string;
  category: Category;
  description: string;
  steps: Step[];
  kind: PlaybookKind;
  next: string[];
  system?: boolean;
  edited?: boolean;
  version: number;
  updatedAt?: string;
  copiedFrom?: string;
};

const facts: ChecklistItem = {
  key: 'facts',
  label: systemMessageText('playbooks.citedDataFactsAccurate'),
  required: true,
};
const analyze = (
  instruction: string,
  name = systemMessageText('common.analyze'),
  key = 'analyze',
): Step => ({ key, name, kind: 'analyze', instruction });
const change = (
  instruction: string,
  name = systemMessageText('common.modify'),
  key = 'build',
): Step => ({
  key,
  name,
  kind: 'change',
  instruction,
});
const review = (
  name: string,
  checklist: ChecklistItem[] = [],
  key = 'review',
): Step => ({ key, name, kind: 'review', checklist });
const withKind = (p: Omit<Playbook, 'kind'>): Playbook => ({
  ...p,
  kind: p.steps.some((s) => s.kind === 'change') ? 'build' : 'plan',
});
// Built-in playbooks: documents are an analysis the person accepts; page work goes to a change you look at before it
// is published; a written plan first is an extra analysis step (on for technical fixes).
const doc = (
  id: string,
  name: string,
  category: Category,
  description: string,
  instructions: string,
  next: string[],
  step = systemMessageText('common.analyze'),
) =>
  withKind({
    id,
    name,
    category,
    description,
    steps: [
      analyze(instructions, step),
      review(systemMessageText('common.review'), [facts], 'accept'),
    ],
    next,
    system: true,
    version: 3,
  });
const work = (
  id: string,
  name: string,
  category: Category,
  description: string,
  instructions: string,
  planFirst = false,
) =>
  withKind({
    id,
    name,
    category,
    description,
    steps: [
      ...(planFirst
        ? [
            analyze(
              AGENT_PLAN_INSTRUCTION,
              systemMessageText('playbook.writePlan'),
              'plan',
            ),
            review(
              systemMessageText('playbook.reviewPlan'),
              [],
              'approve-plan',
            ),
          ]
        : []),
      change(instructions),
      review(systemMessageText('playbook.reviewPublish')),
    ],
    next: [],
    system: true,
    version: 3,
  });

// The Agent's first step when a playbook asks for a plan: a concrete plan against the real repository, before any change.
export const AGENT_PLAN_INSTRUCTION = systemMessageText(
  'playbooks.changePlanInstruction',
);

export const SYSTEM_PLAYBOOKS: Playbook[] = [
  doc(
    'change-research',
    systemMessageText('playbooks.changeInvestigation'),
    'research',
    systemMessageText('playbooks.whenDataChangesNoClear'),
    systemMessageText('playbooks.changeResearchInstruction'),
    ['optimize-page'],
  ),
  doc(
    'competitor-compare',
    systemMessageText('skillsBuiltin.competitorComparison'),
    'research',
    systemMessageText('playbooks.compareContentCompetitorsSameTopic'),
    systemMessageText('playbooks.competitorComparisonInstruction'),
    ['new-doc'],
  ),
  doc(
    'keyword-research',
    systemMessageText('playbooks.keywordResearch'),
    'research',
    systemMessageText('playbooks.mapSearchDemandTopicWhich'),
    systemMessageText('playbooks.searchDemandInstruction'),
    ['optimize-page', 'new-doc'],
  ),
  doc(
    'community-summary',
    systemMessageText('playbooks.communityQuestionSummary'),
    'research',
    systemMessageText('playbooks.groupRecurringCommunityQuestionsSeparating'),
    systemMessageText('playbooks.communitySummaryInstruction'),
    ['new-doc'],
  ),
  // 起草社区回复 (2026-10-08 user decision): drafts only — the person copies each reply and posts it; NocoReach posts nowhere.
  // The fixed section format lets the task page show one card per post with 复制回复.
  doc(
    'community-reply',
    systemMessageText('signals.draftCommunityReplies'),
    'create',
    systemMessageText('playbooks.draftRepliesCommunityPostsNobody'),
    systemMessageText('playbooks.communityReplyInstruction'),
    ['new-doc', 'optimize-page'],
    systemMessageText('insightSummary.draftReplies'),
  ),
  doc(
    'content-outline',
    systemMessageText('playbooks.contentTopicOutline'),
    'create',
    systemMessageText('playbooks.decideWhatWriteWhomWhere'),
    systemMessageText('playbooks.contentOutlineInstruction'),
    ['new-doc', 'blog-post'],
    systemMessageText('playbooks.writeOutline'),
  ),
  work(
    'new-doc',
    systemMessageText('playbooks.newDocsPage'),
    'create',
    systemMessageText('playbooks.createNewPageDocsAdd'),
    systemMessageText('playbooks.createPageInstruction'),
  ),
  work(
    'blog-post',
    systemMessageText('playbooks.writeBlogPost'),
    'create',
    systemMessageText('playbooks.writeBlogPostOutline'),
    systemMessageText('playbooks.writeBlogPostTaskBrief'),
  ),
  work(
    'release-notes',
    systemMessageText('playbooks.writeReleaseNotes'),
    'create',
    systemMessageText('playbooks.writeReleaseNotesNewVersion'),
    systemMessageText('playbooks.releaseNotesInstruction'),
  ),
  work(
    'optimize-page',
    systemMessageText('playbooks.improveExistingPage'),
    'optimize',
    systemMessageText('playbooks.improveExistingPageTitleDescription'),
    systemMessageText('playbooks.optimizePageInstruction'),
  ),
  work(
    'sync-translations',
    systemMessageText('playbooks.syncLanguageVersions'),
    'optimize',
    systemMessageText('playbooks.syncPageChangesOtherLanguage'),
    systemMessageText('playbooks.translationInstruction'),
  ),
  work(
    'tech-fix',
    systemMessageText('playbooks.technicalFix'),
    'technical',
    systemMessageText('playbooks.fixBrokenLinksRedirectsSitemaps'),
    systemMessageText('playbooks.technicalFixInstruction'),
    true,
  ),
];

// The stages a playbook runs through (the shared stage engine in service.ts executes them): its steps, then 上线 and 观察
// when a step changes the repository.
export function stagesFor(p: Pick<Playbook, 'steps'>): Stage[] {
  const stages: Stage[] = p.steps.map((s) =>
    s.kind === 'review'
      ? {
          key: s.key,
          name: s.name,
          kind: 'review',
          checklist: s.checklist || [],
        }
      : {
          key: s.key,
          name: s.name,
          kind: 'agent',
          mode: s.kind,
          instruction: s.instruction || '',
          ...(s.skills?.length ? { skills: s.skills } : {}),
        },
  );
  return p.steps.some((s) => s.kind === 'change')
    ? [
        ...stages,
        {
          key: 'release',
          name: systemMessageText('common.live'),
          kind: 'release',
        },
        {
          key: 'observe',
          name: systemMessageText('common.watch'),
          kind: 'observe',
        },
      ]
    : stages;
}
