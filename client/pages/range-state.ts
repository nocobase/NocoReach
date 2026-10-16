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
export function validRange(value: Range): boolean {
  if (value.range !== 'custom') return true;
  const { from, to } = value;
  const valid = (d?: string) =>
    Boolean(
      d &&
      /^\d{4}-\d{2}-\d{2}$/.test(d) &&
      Number.isFinite(Date.parse(d)) &&
      new Date(d).toISOString().slice(0, 10) === d,
    );
  return (
    valid(from) &&
    valid(to) &&
    from! <= to! &&
    to! <= new Date().toISOString().slice(0, 10) &&
    (Date.parse(to!) - Date.parse(from!)) / 86400000 < 490
  );
}
export function useRange(): [Range, (r: Range) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get('days');
  const range =
    requested === '3m'
      ? '90'
      : defaultRanges.includes(requested || '')
        ? requested!
        : '28';
  const value: Range = {
    range,
    ...(range === 'custom'
      ? {
          from: params.get('from') || undefined,
          to: params.get('to') || undefined,
        }
      : {}),
  };
  const set = (r: Range) => {
    const p = new URLSearchParams(params);
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
