import type { TranslationOverrides } from '@nocobase/i18n';
import type { AppServerResource } from './en-US.js';
import businessMessages from '../../shared/i18n/de-DE.json' with { type: 'json' };
import overrides from './translations/plugins-de-DE.json' with { type: 'json' };
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('de-DE', businessMessages);
const resource: AppServerResource & { overrides: TranslationOverrides } = {
  ...businessMessages,
  overrides,
};
export default resource;
