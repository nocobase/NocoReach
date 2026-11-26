import { $t } from '#i18n';
import { systemMessageText } from '../../../shared/i18n/messages';

// The server stores the default scheme under its Chinese name (server/nocoreach/analysis-rules.ts store()), so that
// one name is shown in the reader's language. Any other name is the person's own and stays as written.
const STORED_DEFAULT = systemMessageText('analysisSchemes.default');

export function schemeName(name: string | null | undefined): string {
  return name === STORED_DEFAULT ? $t('analysisSchemes.default') : (name ?? '');
}
