import path from 'node:path';
import { defineServerPlugin, } from '@nocobase/app-server/plugins';
import locales from './locales/index.js';
import serviceProviders from './providers/index.js';
import routes from './routes/index.js';
const demoModePlugin = defineServerPlugin({
    baseDir: path.resolve(import.meta.dirname, '..'),
    packageName: '@nocobase/app-plugin-demo-mode',
    locales,
    serviceProviders,
    routes,
    database: {
        migrations: './database/migrations',
    },
});
export default demoModePlugin;
//# sourceMappingURL=plugin.js.map