export type RouteResources = Readonly<Record<string, readonly string[]>>;

let cachedResources: RouteResources | undefined;

/** Fetch metadata only. Failure is optional and must never affect route loading. */
export async function loadRouteResources(
  signal: AbortSignal,
): Promise<RouteResources> {
  // HTML binds metadata to this document's build without changing JS hashes.
  const manifestUrl = document.querySelector<HTMLMetaElement>(
    'meta[name="nocoreach-route-prefetch"]',
  )?.content;
  if (!manifestUrl) return {};
  if (cachedResources) return cachedResources;
  const response = await fetch(manifestUrl, { signal });
  if (!response.ok) return {};
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const base = new URL(manifestUrl, document.baseURI);
  const resources = Object.fromEntries(
    Object.entries(data).flatMap(([name, files]) =>
      Array.isArray(files) && files.every((file) => typeof file === 'string')
        ? [[name, files.map((file: string) => new URL(file, base).href)]]
        : [],
    ),
  );
  // A disposed scheduler must not publish its late result. Failures remain retryable.
  if (!signal.aborted) cachedResources = resources;
  return resources;
}
