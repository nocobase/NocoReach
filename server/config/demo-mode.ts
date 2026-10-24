import { defineDemoModeConfig } from '@nocobase/app-plugin-demo-mode/config';

/** Deployment opt-in; administrator UI cannot turn a production instance into a demo. */
const demoMode = defineDemoModeConfig();
export default demoMode;
