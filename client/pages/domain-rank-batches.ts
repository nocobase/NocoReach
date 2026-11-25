// Domain lookup's keyword pages, grouped for Search Console clicks (client/pages/domain-overview.tsx).
// Pages grouped so each group's keywords fit one site-clicks request (the server reads at most RANK_LIMIT of them).
const RANK_LIMIT = 1000;
export function rankBatches<T extends { result?: { items: unknown[] } }>(
  pages: T[],
): T[][] {
  const batches: T[][] = [];
  let size = RANK_LIMIT;
  for (const p of pages) {
    const n = p.result?.items.length ?? 0;
    if (!n) continue;
    if (size + n > RANK_LIMIT) {
      batches.push([]);
      size = 0;
    }
    batches.at(-1)!.push(p);
    size += n;
  }
  return batches;
}
