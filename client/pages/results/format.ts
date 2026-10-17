import { $t, getCurrentLocale } from '#i18n';
import { NocoReachHttpError } from '#lib/nocoreach-api';
export const number = (value: number | null) =>
  value === null
    ? '—'
    : value.toLocaleString(getCurrentLocale(), { maximumFractionDigits: 2 });
export const resultStatus = (status: string) => $t(`results.status.${status}`);
// The periods the dashboard and the full list offer; both keep it in the URL (`days`, `from`, `to`) and open on 90 days,
// since the day-28 check needs a month after going live.
export const RESULT_RANGES = ['28', '90', '12m', 'all', 'custom'];
export const DEFAULT_RESULT_RANGE = '90';
// The full list's own URL parameters; the breadcrumb back to the dashboard drops them and keeps the period.
export const LIST_PARAMS = ['q', 'status', 'order', 'page'];
// A whole number with a sign for a change (a true minus, so "−20" lines up with "+20").
export const signed = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toLocaleString(
    getCurrentLocale(),
    { maximumFractionDigits: 1 },
  )}`;
export const signedPercent = (value: number) => `${signed(Math.round(value))}%`;
// A calendar date from the server (YYYY-MM-DD or an ISO time, read as UTC like every results date) as month and
// day in the current language, with the year when it is not this year.
export function shortDate(date: string) {
  const at = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return at.toLocaleDateString(getCurrentLocale(), {
    ...(at.getUTCFullYear() === new Date().getUTCFullYear()
      ? {}
      : { year: 'numeric' }),
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
export const httpStatus = (error: unknown) =>
  error instanceof NocoReachHttpError ? error.status : 0;
// Access is gone (signed out, no longer a member, the project removed): nothing read before may stay on screen.
export const denied = (error: unknown) =>
  [401, 403, 404].includes(httpStatus(error));
