// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describeMigration } from '@nocobase/app-testing/server';

describeMigration('202611070002_create_page_days', {
  sources: [
    {
      packageName: 'nocoreach',
      directory: fileURLToPath(
        new URL('../../database/main/migrations', import.meta.url),
      ),
    },
  ],
  up: async ({ expectCollection }) => {
    await expectCollection('nrPageDays').toHaveIndex([
      'projectId',
      'pathHash',
      'day',
    ]);
    await expectCollection('nrPageDays').toHaveIndex([
      'projectId',
      'source',
      'day',
    ]);
    await expectCollection('nrPageDayMarks').toHaveIndex(['dayKey']);
    await expectCollection('nrPageDayMarks').toHaveIndex([
      'projectId',
      'source',
      'day',
    ]);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('nrPageDays').not.toExist();
    await expectCollection('nrPageDayMarks').not.toExist();
  },
});
