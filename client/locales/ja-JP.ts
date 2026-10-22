import type { AppResource } from './en-US.js';
import businessMessages from '../../shared/i18n/ja-JP.json';
import pluginOverrides from './translations/plugins-ja-JP.json';
import shell from './translations/ja-JP.json';
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('ja-JP', businessMessages);
const resource: AppResource = {
  ...businessMessages,
  ...shell,
  overrides: pluginOverrides,
};
export default resource;
