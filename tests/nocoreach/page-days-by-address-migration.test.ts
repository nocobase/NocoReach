// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

// The old rows and their marks go together: a mark left without its rows would read as a day without figures.
describeMigration('202611070003_page_days_by_address', {
  sources: [
    {
      packageName: 'nocoreach',
      directory: fileURLToPath(
        new URL('../../database/main/migrations', import.meta.url),
      ),
    },
  ],
  before: async ({ database }) => {
    await database
      .query()
      .insertInto('nrPageDayMarks')
      .values([
        {
          dayKey: 'k',
          projectId: '1',
          source: 'gsc',
          resource: 'sc-domain:example.test',
          day: 20000,
          pages: 1,
          payloadHash: 'h',
        },
      ])
      .execute();
  },
  up: async ({ database, expectCollection }) => {
    await expectCollection('nrPageDays').toHaveIndex(['scopeId', 'day']);
    await expectCollection('nrPageDays').toHaveField('pageId');
    await expectCollection('nrPageDays').not.toHaveField('id');
    await expectCollection('nrPageDays').not.toHaveField('host');
    await expectCollection('nrPageAddresses').toHaveIndex(['addressKey']);
    await expectCollection('nrPageAddresses').toHaveIndex([
      'scopeId',
      'pathHash',
    ]);
    await expectCollection('nrPageScopes').toHaveIndex(['scopeKey']);
    expect(await database.repository('nrPageDayMarks').count({})).toBe(0);
  },
  down: async ({ expectCollection }) => {
    await expectCollection('nrPageAddresses').not.toExist();
    await expectCollection('nrPageScopes').not.toExist();
    await expectCollection('nrPageDays').toHaveIndex([
      'projectId',
      'pathHash',
      'day',
    ]);
  },
});
