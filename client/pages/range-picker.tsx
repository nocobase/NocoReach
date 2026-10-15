import { $t } from '#i18n';
import { useId, useState, type ReactNode } from 'react';
import {
  getRanges,
  defaultRanges,
  validRange,
  type Range,
} from './range-state';
export function RangePicker({
  value,
  onChange,
  summary,
  options,
}: {
  value: Range;
  onChange: (r: Range) => void;
  summary?: ReactNode;
  options?: string[];
}) {
  const errorId = useId();
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
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
            aria-pressed={value.range === k}
            onClick={() =>
              onChange(
                k === 'custom'
                  ? {
                      range: 'custom',
                      from:
                        value.from ||
                        new Date(Date.now() - 27 * 86400000)
                          .toISOString()
                          .slice(0, 10),
                      to: value.to || today,
                    }
                  : { range: k },
              )
            }
          >
            {label}
          </button>
        ))}
      {value.range === 'custom' && (
        <span className='nr-range-custom'>
          <input
            type='date'
            aria-invalid={!validRange(value)}
            aria-describedby={!validRange(value) ? errorId : undefined}
            aria-label={$t('rangePicker.startDate')}
            max={value.to || today}
            value={value.from || ''}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
          –
          <input
            type='date'
            aria-invalid={!validRange(value)}
            aria-describedby={!validRange(value) ? errorId : undefined}
            aria-label={$t('rangePicker.endDate')}
            max={today}
            value={value.to || ''}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
          />
        </span>
      )}
      {!validRange(value) && (
        <span id={errorId} role='alert' className='text-sm text-destructive'>
          {$t('rangePicker.invalidCustom')}
        </span>
      )}
      {summary && <span className='nr-range-summary'>{summary}</span>}
    </div>
  );
}
