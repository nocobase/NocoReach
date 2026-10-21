import type { AppResource } from './en-US.js';
import { withPluralForms } from '../i18n/plurals.js';
import businessMessages from '../../shared/i18n/pt-BR.json';
import shell from './translations/pt-BR.json';
import overrides from './translations/plugins-pt-BR.json';
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('pt-BR', businessMessages);
const resource: AppResource = withPluralForms({
  ...businessMessages,
  ...shell,
  overrides,
});
export default resource;
