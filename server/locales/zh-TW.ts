import type { TranslationOverrides } from '@nocobase/i18n';
import overrides from './translations/plugins-zh-TW.json' with { type: 'json' };
import type { AppServerResource } from './en-US.js';
import businessMessages from '../../shared/i18n/zh-TW.json' with { type: 'json' };
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('zh-TW', businessMessages);
const resource = {
  ...businessMessages,
  overrides,
} satisfies AppServerResource & { overrides: TranslationOverrides };
export default resource;
