import { $t } from '#i18n';
import { NocoReachHttpError } from '#lib/nocoreach-api';
import {
  formatChange,
  formatCount,
  formatDate,
  formatSigned,
} from '#lib/format';
export const number = (value: number | null) => formatCount(value, 2);
export const resultStatus = (status: string) => $t(`results.status.${status}`);
// The periods the dashboard and the full list offer; both keep it in the URL (`days`, `from`, `to`) and open on 90 days,
// since the day-28 check needs a month after going live.
export const RESULT_RANGES = ['28', '90', '12m', 'all', 'custom'];
export const DEFAULT_RESULT_RANGE = '90';
// The full list's own URL parameters; the breadcrumb back to the dashboard drops them and keeps the period.
export const LIST_PARAMS = ['q', 'status', 'order', 'page'];
// A difference with its sign (a true minus, so "−20" lines up with "+20").
export const signed = (value: number) => formatSigned(value, 1);
// A change given in percent (12 for 12%), written like every other change: "↑ 12%".
export const signedPercent = (value: number) => formatChange(value / 100);
// A calendar date from the server (YYYY-MM-DD or an ISO time, read as UTC like every results date) as month and
// day in the current language, with the year when it is not this year.
export function shortDate(date: string) {
  return formatDate(date.slice(0, 10));
}
export const httpStatus = (error: unknown) =>
  error instanceof NocoReachHttpError ? error.status : 0;
// Access is gone (signed out, no longer a member, the project removed): nothing read before may stay on screen.
export const denied = (error: unknown) =>
  [401, 403, 404].includes(httpStatus(error));
