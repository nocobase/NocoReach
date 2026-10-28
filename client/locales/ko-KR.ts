import type { AppResource } from './en-US.js';
import businessMessages from '../../shared/i18n/ko-KR.json';
import pluginOverrides from './translations/plugins-ko-KR.json';
import shell from './translations/ko-KR.json';
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('ko-KR', businessMessages);
const resource: AppResource = {
  ...businessMessages,
  ...shell,
  overrides: pluginOverrides,
};
export default resource;
