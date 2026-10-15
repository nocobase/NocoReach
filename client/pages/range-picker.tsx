/* eslint-disable react-refresh/only-export-components -- shared range helpers and the existing companion URL hook are intentionally colocated */
import { $t } from '#i18n';
import { useLocation, useSearchParams } from 'react-router';
import { useId, useRef, useState, type ReactNode } from 'react';

// Shared time range for data pages: only committed ranges belong in the URL.
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
export const defaultRanges = ['7', '28', '90', '3m', '12m', 'custom'];
export type Range = { range: string; from?: string; to?: string };
export function useRange(): [Range, (r: Range) => void] {
  const [params, setParams] = useSearchParams();
  const range = getRanges().some(([k]) => k === params.get('days'))
    ? params.get('days')!
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
    if (r.range === 'custom' && r.from && r.to) {
      p.set('from', r.from);
      p.set('to', r.to);
    } else {
      p.delete('from');
      p.delete('to');
    }
    setParams(p, { replace: true });
  };
  return [value, set];
}

const calendarDate = (date: string) => {
  const time = Date.parse(date + 'T00:00:00Z');
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === date
  );
};

// Match data-views.windowFor's inclusive 490-day limit; server validation remains authoritative.
export function customRangeError(from: string, to: string, today: string) {
  if (!calendarDate(from)) return 'rangePicker.invalidStart' as const;
  if (!calendarDate(to)) return 'rangePicker.invalidEnd' as const;
  if (from > to) return 'rangePicker.reversedDates' as const;
  if (to > today) return 'rangePicker.futureDate' as const;
  if ((Date.parse(to) - Date.parse(from)) / 86400000 + 1 > 490)
    return 'rangePicker.rangeTooLong' as const;
  return null;
}

type Props = {
  value: Range;
  onChange: (r: Range) => void;
  summary?: ReactNode;
  options?: string[];
};

export function RangePicker(props: Props) {
  const location = useLocation();
  // Navigation (including Back/Forward) or a new committed range replaces the draft.
  // Summary/data rerenders must leave the browser's partial date segments alone.
  return (
    <RangeEditor
      key={`${location.key}:${JSON.stringify(props.value)}`}
      {...props}
    />
  );
}

function RangeEditor({ value, onChange, summary, options }: Props) {
  const [custom, setCustom] = useState(value.range === 'custom');
  const [error, setError] = useState<ReturnType<typeof customRangeError>>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [defaults] = useState(() => ({
    today: new Date().toISOString().slice(0, 10),
    from: new Date(Date.now() - 27 * 86400000).toISOString().slice(0, 10),
  }));
  const validate = () =>
    customRangeError(
      startRef.current!.value,
      endRef.current!.value,
      defaults.today,
    );
  const apply = () => {
    const nextError = validate();
    setError(nextError);
    if (nextError) {
      (nextError === 'rangePicker.invalidEnd' ||
      nextError === 'rangePicker.futureDate'
        ? endRef
        : startRef
      ).current?.focus();
      return;
    }
    onChange({
      range: 'custom',
      from: startRef.current!.value,
      to: endRef.current!.value,
    });
  };
  return (
    <div
      className='nr-range'
      role='group'
      aria-label={$t('rangePicker.dateRange')}
    >
      {getRanges()
        .filter(([k]) => (options || defaultRanges).includes(k))
        .map(([k, label]) => (
          <button
            key={k}
            type='button'
            aria-pressed={custom ? k === 'custom' : value.range === k}
            onClick={() => {
              if (k === 'custom') setCustom(true);
              else {
                setCustom(false);
                onChange({ range: k });
              }
            }}
          >
            {label}
          </button>
        ))}
      {custom && (
        <div className='flex flex-col gap-1'>
          <span className='nr-range-custom flex-wrap'>
            {/* Uncontrolled on purpose: value="" also erases native partial year/month/day segments. */}
            <input
              ref={startRef}
              type='date'
              aria-label={$t('rangePicker.startDate')}
              defaultValue={
                value.range === 'custom' ? value.from || '' : defaults.from
              }
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onInput={() => {
                if (error) setError(validate());
              }}
            />
            –
            <input
              ref={endRef}
              type='date'
              aria-label={$t('rangePicker.endDate')}
              max={defaults.today}
              defaultValue={
                value.range === 'custom' ? value.to || '' : defaults.today
              }
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              onInput={() => {
                if (error) setError(validate());
              }}
            />
            <button type='button' onClick={apply}>
              {$t('rangePicker.apply')}
            </button>
          </span>
          {error && (
            <span
              id={errorId}
              role='alert'
              className='text-sm text-destructive'
            >
              {$t(error)}
            </span>
          )}
        </div>
      )}
      {summary && <span className='nr-range-summary'>{summary}</span>}
    </div>
  );
}
