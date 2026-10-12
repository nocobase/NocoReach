import type { Application } from '@nocobase/app-server/application';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceProvider } from '@nocobase/service-provider';
import type { MockConfig } from '../../app-plugins/nocoreach-mock/server/types.js';
import { LegacyDatabase } from '../nocoreach/legacy/database.js';
import { assertMockDatasetMode } from '../nocoreach/mock-isolation.js';

/** Registered after DatabaseProvider and before plugin contributions, so no recovered external worker can start first. */
export class MockDatasetSafetyProvider extends ServiceProvider<Application> {
  public readonly name = 'nocoreach/mock-dataset-safety';
  public override async boot(): Promise<void> {
    const db = new LegacyDatabase(
      this.app.container.resolve(databaseManagerToken),
      this.app.container.resolve(idGeneratorToken),
    );
    await assertMockDatasetMode(
      db,
      this.app.config.get<MockConfig>('nocoreachMock')?.enabled === true,
    );
  }
}
