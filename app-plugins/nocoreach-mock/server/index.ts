import path from 'node:path';
import {
  defineServerPlugin,
  type AppPluginApplication,
} from '@nocobase/app-server/plugins';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';
import { MockEngine } from './engine.js';
import type { MockConfig } from './types.js';

export * from './types.js';
export {
  MockEngine,
  MockError,
  mockDelay,
  MOCK_SETTINGS_KEY,
} from './engine.js';
export const mockEngineToken: ServiceToken<MockEngine> =
  createServiceToken<MockEngine>('nocoreach-mock/engine');
class MockProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name = 'nocoreach-mock/provider';
  public override register(): void {
    this.app.container.singleton(
      mockEngineToken,
      () =>
        new MockEngine(
          this.app.config.get<MockConfig>('nocoreachMock') ?? {
            enabled: false,
          },
        ),
    );
  }
}
export default defineServerPlugin({
  packageName: '@nocoreach/app-plugin-mock',
  baseDir: path.resolve(import.meta.dirname, '..'),
  serviceProviders: [MockProvider],
});
