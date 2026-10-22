import type { TranslationOverrides } from '@nocobase/i18n';
import type { AppServerResource } from './en-US.js';
import overrides from './translations/plugins-pt-BR.json' with { type: 'json' };
import businessMessages from '../../shared/i18n/pt-BR.json' with { type: 'json' };
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('pt-BR', businessMessages);
const resource = {
  ...businessMessages,
  overrides,
} satisfies AppServerResource & {
  overrides: TranslationOverrides;
};
export default resource;
