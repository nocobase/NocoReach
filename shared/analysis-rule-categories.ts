import { GROWTH_CATEGORIES, type GrowthCategory } from './growth.js';

/**
 * The opportunity category each growth rule finds (2026-11-17, Analysis rules in the four categories of Opportunities):
 * the rules page has a tab for each category, in the order of the Opportunities filter, and the rules in this order
 * within it. Every other rule (site-wide totals, community digests, content platforms, custom rules) proposes no
 * opportunity and goes under Current state, grouped by its source.
 */
export const RULE_CATEGORIES: Readonly<
  Record<GrowthCategory, readonly string[]>
> = {
  trending: [
    'topic-rise',
    'topic-new',
    'topic-hot',
    'youtube-hot',
    'keyword-rising',
    'trends-rising',
    'gsc-new-query',
    'github-topic-heat',
    'github-new-repo',
  ],
  'new-content': [
    'keyword-demand',
    'asked-often',
    'other-market',
    'site-search',
    'people-also-ask',
  ],
  'competitor-gaps': [
    'competitor-gap',
    'link-gap',
    'ai-missing',
    'ai-cited',
    'competitor-release',
  ],
  optimize: [
    'gsc-near-first',
    'gsc-low-ctr',
    'ai-uncited',
    'rank',
    'gsc-click-drop',
    'site-stale',
    'site-thin',
    'ai-dropped',
    'audit',
  ],
};
export type RuleCategory = GrowthCategory | 'situation';
export const RULE_TABS: readonly RuleCategory[] = [
  ...GROWTH_CATEGORIES,
  'situation',
];
const byRule = new Map(
  GROWTH_CATEGORIES.flatMap((category) =>
    RULE_CATEGORIES[category].map((id, index) => [id, { category, index }]),
  ),
);
export const ruleCategoryOf = (id: string): RuleCategory =>
  byRule.get(id)?.category ?? 'situation';
/** The rule's place within its category, for the tab's order; rules under Current state keep the catalog's. */
export const ruleOrderOf = (id: string): number =>
  byRule.get(id)?.index ?? Number.MAX_SAFE_INTEGER;
