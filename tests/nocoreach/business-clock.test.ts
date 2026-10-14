import { expect, test, vi } from 'vitest';
import { businessNow } from '../../server/nocoreach/business-clock';
import { buildInput } from '../../server/nocoreach/daily-analysis';

test('production and globally disabled simulation retain the real business clock', () => {
  const before = Date.now();
  const clock = vi.fn(() => '2026-01-15T12:00:00.000Z');
  for (const host of [{}, { mock: { enabled: false, clock } }]) {
    const now = businessNow(host, '1');
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  }
  expect(clock).not.toHaveBeenCalled();
});

test('an explicit mock business clock does not alter the global wall clock', () => {
  const before = Date.now();
  const clock = vi.fn(() => '2026-01-15T12:00:00.000Z');
  expect(businessNow({ mock: { enabled: true, clock } }, '7')).toBe(
    Date.parse('2026-01-15T12:00:00.000Z'),
  );
  expect(clock).toHaveBeenCalledWith('7');
  expect(Date.now()).toBeGreaterThanOrEqual(before);
});

test('legacy numeric IDs are normalized and clock methods keep their receiver', () => {
  const mock = {
    enabled: true,
    value: '2026-01-15T12:00:00.000Z',
    clock(projectId?: string) {
      expect(projectId).toBe('7');
      return this.value;
    },
  };
  expect(businessNow({ mock }, 7)).toBe(Date.parse(mock.value));
});

test('invalid enabled clock boundaries fail without falling back to real time', () => {
  expect(() => businessNow({ mock: { enabled: true } }, '7')).toThrow(
    'Invalid business clock provider',
  );
  expect(() =>
    businessNow({ mock: { enabled: true, clock: () => 42 } }, '7'),
  ).toThrow('Invalid business clock value');
  expect(() =>
    businessNow({ mock: { enabled: true, clock: () => 'invalid' } }, '7'),
  ).toThrow('Invalid business clock value');
  expect(() =>
    businessNow({ mock: { enabled: true, clock: () => '' } }, {}),
  ).toThrow('Invalid business clock project ID');
});

test('analysis uses the source date while watch deadlines keep their operational dates', () => {
  const input = JSON.parse(
    buildInput(
      { evidence: { signals: { items: [{ key: 'test-signal' }] } } },
      {
        watch: {
          'test-signal': {
            since: '2026-10-01T00:00:00.000Z',
            decideBy: '2026-10-10',
          },
        },
      },
      '2026-10-12T09:00:00.000Z',
      '2026-01-15T12:00:00.000Z',
    ),
  );
  expect(input.today).toBe('2026-01-15');
  expect(input.evidence.signals.items[0].watch).toMatchObject({
    days: 12,
    mustDecide: true,
    decideBy: '2026-10-10',
  });
});

test('source-specific clocks override the project view without changing live clock behavior', () => {
  const clock = vi.fn(() => '2026-01-15T12:00:00.000Z');
  const network = {
    value: '2026-03-15T12:00:00.000Z',
    mockClock: vi.fn(function (connection: string, id?: string) {
      expect(connection).toBe('discord');
      expect(id).toBe('7');
      return network.value;
    }),
  };
  expect(
    businessNow({ mock: { enabled: true, clock }, network }, 7, 'discord'),
  ).toBe(Date.parse(network.value));
  expect(clock).not.toHaveBeenCalled();
  network.mockClock.mockClear();
  const before = Date.now();
  expect(
    businessNow({ mock: { enabled: false, clock }, network }, 7, 'discord'),
  ).toBeGreaterThanOrEqual(before);
  expect(network.mockClock).not.toHaveBeenCalled();
});

test('invalid source-specific clock values fail instead of borrowing another profile clock', () => {
  expect(() =>
    businessNow(
      {
        mock: { enabled: true, clock: () => '2026-01-15T12:00:00.000Z' },
        network: { mockClock: () => 'invalid' },
      },
      '7',
      'slack',
    ),
  ).toThrow('Invalid business clock value');
});
