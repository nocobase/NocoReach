import { defineClientPlugin, } from '@nocobase/app-client/plugins';
import locales from './locales/index.js';
import reactProviders from './react-providers/index.js';
const demoMode = defineClientPlugin({
    packageName: '@nocobase/app-plugin-demo-mode',
    locales,
    reactProviders,
});
export default demoMode;
//# sourceMappingURL=plugin.js.map