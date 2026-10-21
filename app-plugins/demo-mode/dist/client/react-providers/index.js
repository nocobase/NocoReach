import { defineClientReactProviders, } from '@nocobase/app-client/plugins';
import { DemoModeNotice } from '../components/demo-mode-notice.js';
export const reactProviders = defineClientReactProviders([
    {
        name: 'demo-mode',
        component: DemoModeNotice,
    },
]);
export default reactProviders;
//# sourceMappingURL=index.js.map