import {
  defineAppRoutes,
  defineClientPlugin,
} from '@nocobase/app-client/plugins';
import { readAppClientPublicConfig } from '@nocobase/app-client/runtime';
import { FlaskConical } from 'lucide-react';
import type { ComponentType } from 'react';
export { createMockUi } from './ui.js';
export { createMockIndicator } from './indicator.js';
export type {
  MockClientHost,
  MockUiComponents,
  MockIndicatorHost,
} from './types.js';

export function mockSettingsAvailable(): boolean {
  const config = readAppClientPublicConfig() as {
    nocoreachMock?: { enabled?: boolean; environment?: string };
  };
  return (
    config.nocoreachMock?.enabled === true &&
    ['demo', 'test'].includes(config.nocoreachMock.environment ?? '')
  );
}

export default defineClientPlugin<{
  page: ComponentType;
  parent?: string;
  navigation?: boolean;
}>({
  packageName: '@nocoreach/app-plugin-mock',
  locales: {
    'en-US': () => Promise.resolve({ default: { mockData: 'Simulated data' } }),
    'zh-CN': () => Promise.resolve({ default: { mockData: '模拟数据' } }),
  },
  routes: (options) =>
    defineAppRoutes(
      options && mockSettingsAvailable()
        ? [
            {
              name: 'mock-integrations',
              path: '/mock-integrations',
              auth: 'required',
              authz: 'skip',
              ...(options.parent ? { parent: options.parent } : {}),
              ...(options.navigation === false
                ? {}
                : {
                    navigation: {
                      title: 'mockData',
                      icon: FlaskConical,
                      order: 4,
                    },
                  }),
              componentLoader: () => Promise.resolve({ default: options.page }),
            },
          ]
        : [],
    ),
});
