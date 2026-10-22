import type { AppResource } from './en-US.js';
import businessMessages from '../../shared/i18n/id-ID.json';
import shell from './translations/id-ID.json';
import overrides from './translations/plugins-id-ID.json';
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('id-ID', businessMessages);
const resource: AppResource = { ...businessMessages, ...shell, overrides };
export default resource;
