/**
 * The markets Opportunities looks at for content in other languages (2026-11-10 step 2b, "Other-language markets"):
 * a country and the language its people search in, as Google Ads search volume takes them (DataForSEO location and
 * language codes). The AI suggests up to MARKETS_MAX for the product; the team can change them in Analysis rules.
 * Names read `growthMarket.<id>` in the reader's language.
 */
export const GROWTH_MARKETS = [
  { id: 'jp', locationCode: 2392, language: 'ja' },
  { id: 'de', locationCode: 2276, language: 'de' },
  { id: 'fr', locationCode: 2250, language: 'fr' },
  { id: 'es', locationCode: 2724, language: 'es' },
  { id: 'mx', locationCode: 2484, language: 'es' },
  { id: 'br', locationCode: 2076, language: 'pt' },
  { id: 'kr', locationCode: 2410, language: 'ko' },
  { id: 'tw', locationCode: 2158, language: 'zh-TW' },
  { id: 'it', locationCode: 2380, language: 'it' },
  { id: 'nl', locationCode: 2528, language: 'nl' },
  { id: 'id', locationCode: 2360, language: 'id' },
  { id: 'vn', locationCode: 2704, language: 'vi' },
] as const;
export type GrowthMarketId = (typeof GROWTH_MARKETS)[number]['id'];
export const MARKETS_MAX = 5;
export const isGrowthMarket = (value: unknown): value is GrowthMarketId =>
  GROWTH_MARKETS.some((m) => m.id === value);
export const growthMarket = (id: unknown) =>
  GROWTH_MARKETS.find((m) => m.id === id) ?? null;

/** The markets as saved: known ones, each once, at most MARKETS_MAX. */
export function cleanMarkets(value: unknown): GrowthMarketId[] {
  const out: GrowthMarketId[] = [];
  for (const id of Array.isArray(value) ? value : [])
    if (isGrowthMarket(id) && !out.includes(id)) out.push(id);
  return out.slice(0, MARKETS_MAX);
}
