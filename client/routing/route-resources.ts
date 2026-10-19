import manifestUrl from 'virtual:nocoreach-route-prefetch';

export type RouteResources = Readonly<Record<string, readonly string[]>>;

/** Fetch metadata only. Failure is optional and must never affect route loading. */
export async function loadRouteResources(
  signal: AbortSignal,
): Promise<RouteResources> {
  if (!manifestUrl) return {};
  const response = await fetch(manifestUrl, { signal, cache: 'no-store' });
  if (!response.ok) return {};
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const base = new URL(manifestUrl, document.baseURI);
  return Object.fromEntries(
    Object.entries(data).flatMap(([name, files]) =>
      Array.isArray(files) && files.every((file) => typeof file === 'string')
        ? [[name, files.map((file: string) => new URL(file, base).href)]]
        : [],
    ),
  );
}
