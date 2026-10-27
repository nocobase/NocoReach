import type { AppResource } from './en-US.js';
import businessMessages from '../../shared/i18n/ru-RU.json';
import pluginOverrides from './translations/plugins-ru-RU.json';
import shell from './translations/ru-RU.json';
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('ru-RU', businessMessages);
const resource: AppResource = {
  ...businessMessages,
  ...shell,
  overrides: pluginOverrides,
};
export default resource;
