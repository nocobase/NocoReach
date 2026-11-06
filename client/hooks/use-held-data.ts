import { useState } from 'react';

/**
 * The last data read for `scope` while the next read is on its way: a page whose range changes keeps showing the
 * previous range's table, marked `held`, instead of a skeleton. `scope` names what the data must belong to (the project
 * and its connections), so another project's data is never shown; the data says which period it holds.
 */
export function useHeldData<T>(
  data: T | undefined,
  scope: string | null,
): { data?: T; held: boolean } {
  const [kept, setKept] = useState<{ scope: string | null; data: T } | null>(
    null,
  );
  // Kept as React's "information from previous renders": set while rendering, so the next render already holds it.
  if (data !== undefined && (kept?.data !== data || kept.scope !== scope))
    setKept({ scope, data });
  if (data !== undefined) return { data, held: false };
  return kept?.scope === scope
    ? { data: kept.data, held: true }
    : { held: false };
}
