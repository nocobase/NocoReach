// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Application,
  type ApplicationServiceProviderConstructor,
} from '@nocobase/app-server/application';
import { createAppPaths } from '@nocobase/app-server/config';
import { DatabaseProvider } from '@nocobase/app-server/database';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import {
  defineServerPlugin,
  defineServerPlugins,
} from '@nocobase/app-server/plugins';
import type { AppRuntimeContext } from '@nocobase/app-server/runtime';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceContainer,
  ServiceProvider,
  ServiceProviderRegistry,
} from '@nocobase/service-provider';
import { MOCK_DATASET_MARKER } from '../../app-plugins/nocoreach-mock/server/engine.js';
import { createApp } from '../../server/app.js';
import { MockDatasetSafetyProvider } from '../../server/providers/mock-dataset.js';

afterEach(() => vi.restoreAllMocks());

function lifecycle(marker: string | undefined) {
  const container = new ServiceContainer();
  let databaseReady = false;
  const read = vi.fn(async () => {
    if (!databaseReady)
      throw new Error('Database must boot before the preflight');
    return marker === undefined
      ? []
      : [{ name: MOCK_DATASET_MARKER, value: marker, secret: false }];
  });
  const app = {
    container,
    config: { get: () => ({ enabled: false }) },
  } as unknown as Application;
  const registry = new ServiceProviderRegistry();
  class DatabaseFixture extends ServiceProvider<Application> {
    readonly name = 'test/database';
    override register() {
      container.instance(databaseManagerToken, {
        repository: (name: string) => {
          expect(name).toBe('nrVariables');
          return { findMany: read };
        },
        collections: () => ({ get: async () => ({ fields: [] }) }),
      } as never);
      container.instance(idGeneratorToken, { generate: () => '1' } as never);
    }
    override async boot() {
      databaseReady = true;
    }
  }
  const workerBoot = vi.fn(async () => {});
  const workerStart = vi.fn(async () => {});
  class ExternalWorker extends ServiceProvider<Application> {
    readonly name = 'test/external-worker';
    override boot = workerBoot;
    override start = workerStart;
  }
  registry.add(new DatabaseFixture(app));
  // Use the actual preflight provider and actual lifecycle registry. Only database I/O is doubled.
  registry.add(new MockDatasetSafetyProvider(app));
  registry.add(new ExternalWorker(app));
  registry.registerAll();
  const start = async () => {
    await registry.bootAll();
    await registry.startAll();
  };
  return { registry, start, read, workerBoot, workerStart };
}

describe('mock dataset preflight lifecycle', () => {
  it.each(['{"version":1,"environment":"test"}', '', 'invalid marker'])(
    'rejects marked live startup before any external worker boots or starts: %s',
    async (marker) => {
      const f = lifecycle(marker);
      try {
        await expect(f.start()).rejects.toMatchObject({
          code: 'NR_MOCK_DATASET_CANNOT_RUN_LIVE',
        });
        expect(f.read).toHaveBeenCalledOnce();
        expect(f.workerBoot).not.toHaveBeenCalled();
        expect(f.workerStart).not.toHaveBeenCalled();
      } finally {
        await f.registry.shutdown();
      }
    },
  );

  it('allows the same external-worker lifecycle on an unmarked live database', async () => {
    const f = lifecycle(undefined);
    try {
      await f.start();
      expect(f.read).toHaveBeenCalledOnce();
      expect(f.workerBoot).toHaveBeenCalledOnce();
      expect(f.workerStart).toHaveBeenCalledOnce();
    } finally {
      await f.registry.shutdown();
    }
  });

  it('composes the actual application preflight after DatabaseProvider and before plugin and app workers', () => {
    class PluginWorker extends ServiceProvider<Application> {
      readonly name = 'test/plugin-worker';
    }
    class AppWorker extends ServiceProvider<Application> {
      readonly name = 'test/app-worker';
    }
    const definition = defineServerPlugins([
      defineServerPlugin({
        packageName: '@nocoreach/test-lifecycle',
        baseDir: import.meta.dirname,
        serviceProviders: [PluginWorker],
      }),
    ]).plugins[0]!;
    const register = vi.spyOn(Application.prototype, 'addServiceProvider');
    createApp({
      config: { get: () => undefined },
      env: {},
      scope: {},
      paths: createAppPaths({ rootDir: process.cwd() }),
      plugins: {
        appPackageName: 'nocoreach',
        plugins: [
          {
            definition,
            metadata: {
              packageName: definition.packageName,
              version: 'test',
              rootDir: import.meta.dirname,
              baseDir: definition.baseDir,
              jobLocations: [],
            },
          },
        ],
      },
      serviceProviders: [AppWorker],
      routes: [],
    } as unknown as AppRuntimeContext);
    const providers = register.mock.calls.map(([provider]) => provider);
    const position = (provider: ApplicationServiceProviderConstructor) => {
      const index = providers.indexOf(provider);
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    expect(position(DatabaseProvider)).toBeLessThan(
      position(MockDatasetSafetyProvider),
    );
    expect(position(MockDatasetSafetyProvider)).toBeLessThan(
      position(PluginWorker),
    );
    expect(position(MockDatasetSafetyProvider)).toBeLessThan(
      position(AppWorker),
    );
  });
});
