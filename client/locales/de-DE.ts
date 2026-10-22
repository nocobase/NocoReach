import type { AppResource } from './en-US.js';
import businessMessages from '../../shared/i18n/de-DE.json';
import shell from './translations/de-DE.json';
import overrides from './translations/plugins-de-DE.json';
import { registerBusinessLocale } from '../../shared/i18n/messages.js';

registerBusinessLocale('de-DE', businessMessages);
const resource: AppResource = { ...businessMessages, ...shell, overrides };
export default resource;
