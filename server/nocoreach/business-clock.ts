import type { Connection } from './proxy-profiles.js';

/**
 * Source dates, retention and reporting windows share the fixture run's clock.
 * Scheduling, elapsed time, rate limits, budgets and cache TTLs must keep Date.now().
 * The engine resolves this through its immutable project scope, including read-only
 * requests for disabled projects. No process-global clock is changed.
 */
export function businessNow(
  host: unknown,
  projectId?: unknown,
  connection?: Connection,
): number {
  // Ported services pass untyped hosts and IDs. Validate the small clock boundary
  // instead of propagating their `any` values into the fixture engine.
  if (
    !host ||
    typeof host !== 'object' ||
    !('mock' in host) ||
    host.mock == null
  )
    return Date.now();
  const mock: unknown = host.mock;
  if (!mock || typeof mock !== 'object' || !('enabled' in mock))
    throw new TypeError('Invalid business clock host');
  if (!mock.enabled) return Date.now();
  if (!('clock' in mock) || typeof mock.clock !== 'function')
    throw new TypeError('Invalid business clock provider');
  if (
    projectId !== undefined &&
    typeof projectId !== 'string' &&
    typeof projectId !== 'number'
  )
    throw new TypeError('Invalid business clock project ID');
  const id = projectId === undefined ? undefined : String(projectId);
  const network = 'network' in host ? host.network : undefined;
  let scoped: unknown;
  if (
    connection &&
    network &&
    typeof network === 'object' &&
    'mockClock' in network &&
    typeof network.mockClock === 'function'
  ) {
    const read = network.mockClock as (
      connection: Connection,
      projectId?: string,
    ) => unknown;
    scoped = read.call(network, connection, id);
  }
  const clock = mock.clock as (projectId?: string) => unknown;
  const value = scoped ?? clock.call(mock, id);
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new TypeError('Invalid business clock value');
  return Date.parse(value);
}
