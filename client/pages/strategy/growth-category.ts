import { $t } from '#i18n';
import type { Tone } from '#components/reach/tag';
import type { GrowthCategory } from '../../../shared/growth.js';

// The four categories of growth opportunities (2026-11-10) in Tag's own hues, apart from red (High priority) and blue
// (New), which sit beside them: the tag on Opportunities and Insights, the filter and the counts.
export const CATEGORY: Record<GrowthCategory, [Tone, () => string]> = {
  trending: ['orange', () => $t('growth.category.trending')],
  'new-content': ['green', () => $t('growth.category.newContent')],
  'competitor-gaps': ['violet', () => $t('growth.category.competitorGaps')],
  optimize: ['slate', () => $t('growth.category.optimize')],
};
