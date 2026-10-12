import { describe, expect, it, vi } from 'vitest';
import { PackagesSource } from '../../server/nocoreach/packages-source.js';

const clock = '2026-10-12T00:00:00.000Z';
const day = 86_400_000;
const date = (daysAgo: number) =>
  new Date(Date.parse(clock) - daysAgo * day).toISOString().slice(0, 10);

describe('package connection download totals', () => {
  it.each(['npm', 'pypi'])(
    'includes all 28 completed days for %s and excludes today and earlier history',
    async (registry) => {
      const id = `${registry}:nocobloom`;
      const daily = Object.fromEntries(
        Array.from({ length: 28 }, (_, index) => [date(index + 1), index + 1]),
      );
      daily[date(0)] = 10000;
      daily[date(29)] = 10000;
      const source = new PackagesSource({
        mock: { enabled: true, clock: () => clock },
      });
      vi.spyOn(source, 'state').mockResolvedValue({
        packages: [{ id, registry, name: 'nocobloom' }],
        daily: { [id]: daily },
      });
      expect((await source.status('1')).packages[0].downloads28).toBe(406);
      delete daily[date(28)];
      expect((await source.status('1')).packages[0].downloads28).toBeNull();
    },
  );
});
