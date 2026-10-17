import { $t } from '#i18n';
import { useSearchParams } from 'react-router';
// Shared time range for data pages (like GA): kept in the URL so it survives reloads and page switches.
export const getRanges = (): [string, string][] => [
  ['7', $t('common.last7Days')],
  ['28', $t('common.last28Days')],
  ['90', $t('rangePicker.last90Days')],
  ['3m', $t('rangePicker.last3Months')],
  ['6m', $t('rangePicker.last6Months')],
  ['12m', $t('rangePicker.last12Months')],
  ['16m', $t('rangePicker.last16Months')],
  ['all', $t('rangePicker.allTime')],
  ['custom', $t('rangePicker.custom')],
];
// Shown when a page does not pass its own options.
export const presetRanges = ['7', '28', '90', '12m'];
export const defaultRanges = [...presetRanges, 'all', 'custom'];
export const githubRanges = defaultRanges;
export type Range = { range: string; from?: string; to?: string };
export type CustomRangeError =
  | 'rangePicker.invalidStart'
  | 'rangePicker.invalidEnd'
  | 'rangePicker.reversedDates'
  | 'rangePicker.futureDate'
  | 'rangePicker.rangeTooLong';

const calendarDate = (date?: string) => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const time = Date.parse(`${date}T00:00:00Z`);
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date
  );
};

export function customRangeError(
  from: string | undefined,
  to: string | undefined,
  today = new Date().toISOString().slice(0, 10),
): CustomRangeError | null {
  if (!calendarDate(from)) return 'rangePicker.invalidStart';
  if (!calendarDate(to)) return 'rangePicker.invalidEnd';
  if (from! > to!) return 'rangePicker.reversedDates';
  if (to! > today) return 'rangePicker.futureDate';
  if (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000 +
      1 >
    490
  )
    return 'rangePicker.rangeTooLong';
  return null;
}

export function validRange(value: Range): boolean {
  if (value.range !== 'custom') return true;
  return customRangeError(value.from, value.to) === null;
}
// `fallback` is the page's default period when the URL names none (成果 opens on 90 days).
export function useRange(
  fallback = '28',
): [Range, (r: Range, drop?: string[]) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get('days');
  const range =
    requested === '3m'
      ? '90'
      : defaultRanges.includes(requested || '')
        ? requested!
        : fallback;
  const value: Range = {
    range,
    ...(range === 'custom'
      ? {
          from: params.get('from') || undefined,
          to: params.get('to') || undefined,
        }
      : {}),
  };
  // `drop` removes the page's own parameters that a new period invalidates, such as a list's page number.
  const set = (r: Range, drop: string[] = []) => {
    const p = new URLSearchParams(params);
    for (const key of drop) p.delete(key);
    p.set('days', r.range);
    if (r.range === 'custom') {
      if (r.from) p.set('from', r.from);
      else p.delete('from');
      if (r.to) p.set('to', r.to);
      else p.delete('to');
    } else {
      p.delete('from');
      p.delete('to');
    }
    setParams(p, { replace: true });
  };
  return [value, set];
}
