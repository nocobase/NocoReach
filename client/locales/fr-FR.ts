import type { AppResource } from './en-US.js';
import businessMessages from '../../shared/i18n/fr-FR.json';
import shell from './translations/fr-FR.json';
import overrides from './translations/plugins-fr-FR.json';
import { registerBusinessLocale } from '../../shared/i18n/messages.js';
import { withPluralForms } from '../i18n/plurals.js';

registerBusinessLocale('fr-FR', businessMessages);
const resource: AppResource = withPluralForms({
  ...businessMessages,
  ...shell,
  overrides,
});
export default resource;
