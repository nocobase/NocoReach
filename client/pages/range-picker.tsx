import { $t, useNocoReachLocale } from '#i18n';
import { addMonths, format, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useLocation } from 'react-router';
import { useId, useState, type ReactNode } from 'react';
import {
  enUS,
  zhCN,
  zhTW,
  ja,
  es,
  ptBR,
  fr,
  de,
  vi,
  id,
} from 'react-day-picker/locale';
import { resolveLocale } from '../../shared/i18n/locales';
import { Button } from '#components/ui/button';
import { Calendar } from '#components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import { useMediaQuery } from '#hooks/use-media-query';
import {
  calendarDate,
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
type Draft = { from?: string; to?: string };

// The URL keeps yyyy-mm-dd strings; the calendar shows the same days as local dates.
const toDay = (date?: string) =>
  calendarDate(date) ? parseISO(date) : undefined;
const utcToday = () => new Date().toISOString().slice(0, 10);
const committedDraft = (value: Range, today: string): Draft =>
  value.range === 'custom'
    ? { from: value.from, to: value.to }
    : {
        from: new Date(Date.parse(`${today}T00:00:00Z`) - 27 * 86400000)
          .toISOString()
          .slice(0, 10),
        to: today,
      };

export function RangePicker({ value, onChange, summary, options }: Props) {
  const location = useLocation();
  const localeCode = useNocoReachLocale();
  const locale = {
    'en-US': enUS,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    'ja-JP': ja,
    'es-ES': es,
    'pt-BR': ptBR,
    'fr-FR': fr,
    'de-DE': de,
    'vi-VN': vi,
    'id-ID': id,
  }[resolveLocale(localeCode)];
  // Two months side by side wherever the calendar lays its months out in a row.
  const wide = useMediaQuery('(min-width: 48rem)', true);
  const errorId = useId();
  const [today, setToday] = useState(utcToday);
  const [custom, setCustom] = useState(value.range === 'custom');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => committedDraft(value, today));
  const [error, setError] = useState<CustomRangeError | null>(null);
  // Navigation (including Back/Forward) or a new committed range replaces the draft.
  // Summary/data rerenders keep it, and the buttons stay mounted so focus stays put.
  const committedKey = `${location.key}:${JSON.stringify(value)}`;
  const [draftKey, setDraftKey] = useState(committedKey);
  if (draftKey !== committedKey) {
    const nextToday = utcToday();
    setDraftKey(committedKey);
    setToday(nextToday);
    setCustom(value.range === 'custom');
    setOpen(false);
    setDraft(committedDraft(value, nextToday));
    setError(null);
  }

  const select = (day: Date) => {
    const picked = format(day, 'yyyy-MM-dd');
    const from = calendarDate(draft.from) ? draft.from : undefined;
    const to = calendarDate(draft.to) ? draft.to : undefined;
    // The first click starts a new range and the second ends it. A link with only one
    // valid end keeps that end, so the click supplies the other.
    const kept = from && to ? undefined : from || to;
    const next: Draft = !kept
      ? { from: picked }
      : picked < kept
        ? { from: picked, to: kept }
        : { from: kept, to: picked };
    setDraft(next);
    if (error) setError(customRangeError(next.from, next.to, today));
  };
  const apply = () => {
    const nextError = customRangeError(draft.from, draft.to, today);
    setError(nextError);
    if (nextError) return;
    setOpen(false);
    onChange({ range: 'custom', from: draft.from, to: draft.to });
  };
  const changeOpen = (next: boolean) => {
    setOpen(next);
    // Closing without Apply discards the draft.
    if (!next) {
      setDraft(committedDraft(value, today));
      setError(null);
    }
  };

  const start = toDay(draft.from);
  const end = toDay(draft.to);
  const last = parseISO(today);
  // The trigger shows the committed range and the calendar shows the draft. A trigger that
  // changed width between the two clicks would move an end-aligned calendar under the pointer.
  const shown = committedDraft(value, today);
  const dayText = (day: Date | undefined, missing: string) =>
    day
      ? day.toLocaleDateString(localeCode, { dateStyle: 'medium' })
      : $t(missing);
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
              if (k === 'custom') {
                setCustom(true);
                changeOpen(true);
              } else {
                setCustom(false);
                changeOpen(false);
                onChange({ range: k });
              }
            }}
          >
            {label}
          </button>
        ))}
      {custom && (
        <Popover open={open} onOpenChange={changeOpen}>
          <PopoverTrigger
            render={
              <Button variant='outline' size='sm' className='font-normal' />
            }
          >
            <CalendarIcon data-icon='inline-start' />
            {dayText(toDay(shown.from), 'rangePicker.startDate')} –{' '}
            {dayText(toDay(shown.to), 'rangePicker.endDate')}
          </PopoverTrigger>
          <PopoverContent align='start' className='w-auto gap-0 p-0'>
            <Calendar
              mode='range'
              selected={{ from: start, to: end }}
              onSelect={(_, day) => select(day)}
              numberOfMonths={wide ? 2 : 1}
              defaultMonth={
                wide
                  ? end
                    ? addMonths(end, -1)
                    : (start ?? addMonths(last, -1))
                  : (end ?? start ?? last)
              }
              endMonth={last}
              disabled={{ after: last }}
              showOutsideDays={false}
              locale={locale}
            />
            <div className='flex flex-col gap-2 border-t p-2.5'>
              {error && (
                // Zero intrinsic width: the message wraps within the calendar's width.
                <p
                  id={errorId}
                  role='alert'
                  className='w-0 min-w-full text-sm text-destructive'
                >
                  {$t(error)}
                </p>
              )}
              <Button
                size='sm'
                className='self-end'
                aria-describedby={error ? errorId : undefined}
                onClick={apply}
              >
                {$t('rangePicker.apply')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
      {summary && <span className='nr-range-summary'>{summary}</span>}
    </div>
  );
}
