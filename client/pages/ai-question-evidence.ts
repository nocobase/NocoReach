import { $t } from '#i18n';

/** Keep combined states in a single sentence so each language controls its grammar. */
export function questionBrandEvidence(
  mentioned: boolean,
  cited: boolean,
): string {
  if (mentioned && cited) return $t('aiQuestions.alreadyMentionedAndCitedUs');
  if (mentioned) return $t('aiQuestions.alreadyMentionedUs');
  if (cited) return $t('aiQuestions.alreadyCitedUs');
  return $t('aiQuestions.notMentionUs');
}
