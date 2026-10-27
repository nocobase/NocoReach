import { $legacyText, $t, getCurrentLocale } from '#i18n';
import { systemMessageKey } from '../../../shared/i18n/messages';

const singularUnits = {
  'analysisRules.answers': 'analysisRules.answerSingular',
  'analysisRules.pages': 'analysisRules.pageSingular',
  'aiQuestions.pages': 'analysisRules.pageSingular',
  'analysisRules.places': 'analysisRules.placeSingular',
} as const;

const russianUnits = new Set([
  ...Object.keys(singularUnits),
  'aiQuestions.topics',
  'aiQuestions.words',
  'analysisRules.months',
  'analysisRules.points',
]);

/** Built-in rule units follow locale agreement; custom units keep their original wording. */
export function ruleUnitLabel(unit: string, value: number): string {
  const key = systemMessageKey(unit);
  if (
    getCurrentLocale() === 'ko-KR' &&
    (key === 'analysisRules.answers' || key === 'aiQuestions.topics')
  ) {
    return $t(`${key}_other`).trim();
  }
  if (key && getCurrentLocale() === 'ru-RU' && russianUnits.has(key)) {
    const category = new Intl.PluralRules('ru-RU').select(value);
    if (category === 'one' && Object.hasOwn(singularUnits, key)) {
      return $t(singularUnits[key as keyof typeof singularUnits]).trim();
    }
    const base = key === 'aiQuestions.pages' ? 'analysisRules.pages' : key;
    return $t(category === 'many' ? base : `${base}_${category}`).trim();
  }
  if (value === 1 && key && Object.hasOwn(singularUnits, key)) {
    return $t(singularUnits[key as keyof typeof singularUnits]).trim();
  }
  return $legacyText(unit).trim();
}
