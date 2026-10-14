import { expect, it } from 'vitest';
import { getCatalog } from '../../client/pages/data-sources';
import { ALL_SOURCE_IDS } from '../nocoreach/fixtures/all-source-ids';

it('requires simulated acceptance for every available data connection, including source-code configuration', () => {
  const ids = getCatalog()
    .filter((source) => source.availability === 'available')
    .map((source) => source.id)
    .sort();
  expect([...ALL_SOURCE_IDS].sort()).toEqual(ids);
  expect(new Set(ALL_SOURCE_IDS).size).toBe(ALL_SOURCE_IDS.length);
});
