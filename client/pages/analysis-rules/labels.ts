import { $legacyText, $t } from '#i18n';
import { systemMessageKey } from '../../../shared/i18n/messages';

const singularUnits = {
  'analysisRules.answers': 'analysisRules.answerSingular',
  'analysisRules.pages': 'analysisRules.pageSingular',
  'aiQuestions.pages': 'analysisRules.pageSingular',
  'analysisRules.places': 'analysisRules.placeSingular',
} as const;

/** These rule thresholds allow one; custom units keep their original wording. */
export function ruleUnitLabel(unit: string, value: number): string {
  const key = systemMessageKey(unit);
  if (value === 1 && key && Object.hasOwn(singularUnits, key)) {
    return $t(singularUnits[key as keyof typeof singularUnits]).trim();
  }
  return $legacyText(unit).trim();
}
