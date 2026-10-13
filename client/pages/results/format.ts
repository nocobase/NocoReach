import { $t, getCurrentLocale } from '#i18n';
export const number = (value: number | null) =>
  value === null
    ? '—'
    : value.toLocaleString(getCurrentLocale(), { maximumFractionDigits: 2 });
export const resultStatus = (status: string) => $t(`results.status.${status}`);
