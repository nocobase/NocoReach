import {
  defineClientReactProviders,
  type AppClientReactProviderDefinition,
} from '@nocobase/app-client/plugins';

import { Toaster } from '#components/ui/toast';

import { WorkspaceCacheProvider } from './pages/workspace-cache.js';
import { AppThemeProvider } from './theme/theme-provider.js';

export const reactProviders: readonly AppClientReactProviderDefinition[] =
  defineClientReactProviders([
    {
      component: AppThemeProvider,
      layer: 'root',
      name: 'theme',
    },
    // The one toast host. It renders what plugins and pages report through
    // `useToaster()`, which `client/service-provider.ts` connects to it.
    // Pages must not mount another.
    {
      component: Toaster,
      layer: 'application',
      name: 'toaster',
    },
    // NocoReach's request cache, shared by its pages for the life of the tab (classic portal: around the layout).
    {
      component: WorkspaceCacheProvider,
      layer: 'application',
      name: 'nocoreach-workspace-cache',
    },
  ]);

export default reactProviders;
