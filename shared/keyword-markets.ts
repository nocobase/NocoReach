/**
 * Every market DataForSEO's Google keyword data covers: a country (its DataForSEO location code and ISO code) and the
 * languages it has keyword data in, from DataForSEO Labs' locations_and_languages list of 2026-11-02 (Google rows
 * only). Each country's first language is its default, the one most of its keywords are in (Arabic first where the
 * list gives no count for it). Keywords › Find keywords and AI suggestions pick from this list, and the server accepts
 * only its pairs; names come from the reader's Intl data, see marketName.
 */
export const KEYWORD_COUNTRIES: readonly (readonly [
  locationCode: number,
  iso: string,
  languages: readonly string[],
])[] = [
  [2008, 'AL', ['sq']], // Albania
  [2012, 'DZ', ['fr', 'ar']], // Algeria
  [2024, 'AO', ['pt']], // Angola
  [2031, 'AZ', ['az']], // Azerbaijan
  [2032, 'AR', ['es']], // Argentina
  [2036, 'AU', ['en']], // Australia
  [2040, 'AT', ['de']], // Austria
  [2048, 'BH', ['ar']], // Bahrain
  [2050, 'BD', ['bn']], // Bangladesh
  [2051, 'AM', ['hy']], // Armenia
  [2056, 'BE', ['nl', 'fr', 'de']], // Belgium
  [2068, 'BO', ['es']], // Bolivia
  [2070, 'BA', ['bs']], // Bosnia and Herzegovina
  [2076, 'BR', ['pt']], // Brazil
  [2100, 'BG', ['bg']], // Bulgaria
  [2104, 'MM', ['en']], // Myanmar (Burma)
  [2116, 'KH', ['en']], // Cambodia
  [2120, 'CM', ['fr']], // Cameroon
  [2124, 'CA', ['en', 'fr']], // Canada
  [2144, 'LK', ['en']], // Sri Lanka
  [2152, 'CL', ['es']], // Chile
  [2158, 'TW', ['zh-TW']], // Taiwan
  [2170, 'CO', ['es']], // Colombia
  [2188, 'CR', ['es']], // Costa Rica
  [2191, 'HR', ['hr']], // Croatia
  [2196, 'CY', ['el', 'en']], // Cyprus
  [2203, 'CZ', ['cs']], // Czechia
  [2208, 'DK', ['da']], // Denmark
  [2218, 'EC', ['es']], // Ecuador
  [2222, 'SV', ['es']], // El Salvador
  [2233, 'EE', ['et']], // Estonia
  [2246, 'FI', ['fi']], // Finland
  [2250, 'FR', ['fr']], // France
  [2276, 'DE', ['de']], // Germany
  [2288, 'GH', ['en']], // Ghana
  [2300, 'GR', ['el', 'en']], // Greece
  [2320, 'GT', ['es']], // Guatemala
  [2344, 'HK', ['zh-TW', 'en']], // Hong Kong
  [2348, 'HU', ['hu']], // Hungary
  [2356, 'IN', ['en', 'hi']], // India
  [2360, 'ID', ['id', 'en']], // Indonesia
  [2372, 'IE', ['en']], // Ireland
  [2376, 'IL', ['he', 'ar']], // Israel
  [2380, 'IT', ['it']], // Italy
  [2384, 'CI', ['fr']], // Cote d'Ivoire
  [2392, 'JP', ['ja']], // Japan
  [2398, 'KZ', ['ru']], // Kazakhstan
  [2400, 'JO', ['ar']], // Jordan
  [2404, 'KE', ['en']], // Kenya
  [2410, 'KR', ['ko']], // South Korea
  [2428, 'LV', ['lv']], // Latvia
  [2440, 'LT', ['lt']], // Lithuania
  [2458, 'MY', ['en', 'ms']], // Malaysia
  [2470, 'MT', ['en']], // Malta
  [2484, 'MX', ['es']], // Mexico
  [2492, 'MC', ['fr']], // Monaco
  [2498, 'MD', ['ro']], // Moldova
  [2504, 'MA', ['ar', 'fr']], // Morocco
  [2528, 'NL', ['nl']], // Netherlands
  [2554, 'NZ', ['en']], // New Zealand
  [2558, 'NI', ['es']], // Nicaragua
  [2566, 'NG', ['en']], // Nigeria
  [2578, 'NO', ['nb']], // Norway
  [2586, 'PK', ['en', 'ur']], // Pakistan
  [2591, 'PA', ['es']], // Panama
  [2600, 'PY', ['es']], // Paraguay
  [2604, 'PE', ['es']], // Peru
  [2608, 'PH', ['en', 'tl']], // Philippines
  [2616, 'PL', ['pl']], // Poland
  [2620, 'PT', ['pt']], // Portugal
  [2642, 'RO', ['ro']], // Romania
  [2682, 'SA', ['ar', 'en']], // Saudi Arabia
  [2686, 'SN', ['fr']], // Senegal
  [2688, 'RS', ['sr']], // Serbia
  [2702, 'SG', ['en', 'zh-CN']], // Singapore
  [2703, 'SK', ['sk']], // Slovakia
  [2704, 'VN', ['vi', 'en']], // Vietnam
  [2705, 'SI', ['sl']], // Slovenia
  [2710, 'ZA', ['en']], // South Africa
  [2724, 'ES', ['es']], // Spain
  [2752, 'SE', ['sv']], // Sweden
  [2756, 'CH', ['de', 'fr', 'it']], // Switzerland
  [2764, 'TH', ['th']], // Thailand
  [2784, 'AE', ['ar', 'en']], // United Arab Emirates
  [2788, 'TN', ['ar']], // Tunisia
  [2792, 'TR', ['tr']], // Turkiye
  [2804, 'UA', ['uk', 'ru']], // Ukraine
  [2807, 'MK', ['mk']], // North Macedonia
  [2818, 'EG', ['ar', 'en']], // Egypt
  [2826, 'GB', ['en']], // United Kingdom
  [2840, 'US', ['en', 'es']], // United States
  [2854, 'BF', ['fr']], // Burkina Faso
  [2858, 'UY', ['es']], // Uruguay
  [2862, 'VE', ['es']], // Venezuela
];

export type KeywordMarket = { locationCode: number; language: string };

const byCode = new Map(KEYWORD_COUNTRIES.map((c) => [c[0], c]));

/** Whether DataForSEO has keyword data for this country and language. */
export const isKeywordMarket = (locationCode: unknown, language: unknown) =>
  Boolean(
    typeof language === 'string' &&
    byCode.get(Number(locationCode))?.[2].includes(language),
  );

/** A country's default language, or null for a country not in the list. */
export const defaultLanguage = (locationCode: number) =>
  byCode.get(locationCode)?.[2][0] ?? null;

/** The languages a country can be looked up in, the default first. */
export const countryLanguages = (locationCode: number) =>
  byCode.get(locationCode)?.[2] ?? [];

/** The ISO code Intl names a country by. */
export const countryIso = (locationCode: number) =>
  byCode.get(locationCode)?.[1] ?? null;

// Intl names Chinese by its script, as people choose it.
const INTL_LANGUAGE: Record<string, string> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
};

const names = new Map<string, Intl.DisplayNames>();
function displayName(
  locale: string,
  type: 'region' | 'language',
  code: string,
) {
  const key = `${locale}:${type}`;
  let n = names.get(key);
  if (!n) {
    n = new Intl.DisplayNames([locale], { type, fallback: 'code' });
    names.set(key, n);
  }
  try {
    return n.of(code) ?? code;
  } catch {
    return code;
  }
}

/** A country's name in the locale, or its location code when it is not in the list. */
export const countryName = (locationCode: number, locale = 'en-US') => {
  const iso = countryIso(locationCode);
  return iso ? displayName(locale, 'region', iso) : String(locationCode);
};

/** A language's name in the locale ("Simplified Chinese"). */
export const languageName = (language: string, locale = 'en-US') =>
  displayName(locale, 'language', INTL_LANGUAGE[language] ?? language);

/**
 * A market as people name it ("Singapore · Simplified Chinese"). place overrides the country name where the product
 * has its own wording for it (the client's Taiwan and Hong Kong).
 */
export const marketName = (
  m: KeywordMarket,
  locale = 'en-US',
  place?: (locationCode: number) => string | undefined,
) =>
  `${place?.(m.locationCode) ?? countryName(m.locationCode, locale)} · ${languageName(m.language, locale)}`;
