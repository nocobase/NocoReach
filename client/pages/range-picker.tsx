import { $t } from '#i18n';
import { useLocation } from 'react-router';
import { useId, useRef, useState, type ReactNode } from 'react';
import {
  customRangeError,
  defaultRanges,
  getRanges,
  type CustomRangeError,
  type Range,
} from './range-state';
// The picker's own styles (.nr-range), so a page using it needs no other import.
import './data-views.css';

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
  const [error, setError] = useState<CustomRangeError | null>(null);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [defaults] = useState(() => ({
    today: new Date().toISOString().slice(0, 10),
    from: new Date(Date.now() - 27 * 86400000).toISOString().slice(0, 10),
  }));
  const validate = () =>
    customRangeError(
      startRef.current?.value,
      endRef.current?.value,
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
