import { afterEach, expect, it, vi } from 'vitest';
import { PackagesSource } from '../../server/providers/reach/domain/packages-source.cjs';

afterEach(() => vi.useRealTimers());
it('reports a complete 28-day npm window including its first day, excluding today', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-09T06:00:00Z'));
  const daily: Record<string, number> = {};
  for (let i = 1; i <= 28; i += 1) {
    daily[new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)] = i;
  }
  daily['2026-10-09'] = 9999;
  daily['2026-09-10'] = 9999;
  const source = new PackagesSource({});
  source.state = async () => ({
    packages: [
      { id: 'npm:@nocobase/client', registry: 'npm', name: '@nocobase/client' },
    ],
    daily: { 'npm:@nocobase/client': daily },
  });
  expect((await source.status('test')).packages[0].downloads28).toBe(406);
  delete daily['2026-09-11'];
  expect((await source.status('test')).packages[0].downloads28).toBeNull();
});
