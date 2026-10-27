import { $t } from '#i18n';

// An npm dist-tag in words where there are words for it (UI review 2026-10-22: the tile said "Latest version" while the
// list said "latest"; 2026-10-23: alpha too); any other tag shows as published.
export const distTagLabel = (tag: string): string =>
  tag === 'latest'
    ? $t('dataDownloads.latestVersion')
    : tag === 'beta'
      ? $t('dataDownloads.betaTag')
      : tag === 'alpha'
        ? $t('dataDownloads.alphaTag')
        : tag;
