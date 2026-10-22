import type { AppResource } from './en-US.js';
import businessMessages from '../../shared/i18n/zh-TW.json';
import shell from './translations/zh-TW.json';
import overrides from './translations/plugins-zh-TW.json';
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('zh-TW', businessMessages);
const resource: AppResource = { ...businessMessages, ...shell, overrides };
export default resource;
