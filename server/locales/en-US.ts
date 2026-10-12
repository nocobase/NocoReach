import businessMessages from '../../shared/i18n/en.json' with { type: 'json' };
import type { LocaleResource } from '@nocobase/i18n';

const enUS = { ...businessMessages };

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
