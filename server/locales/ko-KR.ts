import type { TranslationOverrides } from '@nocobase/i18n';
import type { AppServerResource } from './en-US.js';
import businessMessages from '../../shared/i18n/ko-KR.json' with { type: 'json' };
import overrides from './translations/plugins-ko-KR.json' with { type: 'json' };
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('ko-KR', businessMessages);
const resource = {
  ...businessMessages,
  overrides,
} satisfies AppServerResource & {
  overrides: TranslationOverrides;
};
export default resource;
