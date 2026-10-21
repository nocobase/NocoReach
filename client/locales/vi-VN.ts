import type { AppResource } from './en-US.js';
import businessMessages from '../../shared/i18n/vi-VN.json';
import pluginOverrides from './translations/plugins-vi-VN.json';
import shell from './translations/vi-VN.json';
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('vi-VN', businessMessages);
const resource: AppResource = {
  ...businessMessages,
  ...shell,
  overrides: pluginOverrides,
};
export default resource;
