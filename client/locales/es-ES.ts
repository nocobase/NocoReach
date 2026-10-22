import type { AppResource } from './en-US.js';
import { withPluralForms } from '../i18n/plurals.js';
import businessMessages from '../../shared/i18n/es-ES.json';
import shell from './translations/es-ES.json';
import overrides from './translations/plugins-es-ES.json';
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('es-ES', businessMessages);
const resource: AppResource = withPluralForms({
  ...businessMessages,
  ...shell,
  overrides,
});
export default resource;
