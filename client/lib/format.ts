import { $t, getCurrentLocale } from '#i18n';

// One way to write dates, numbers and changes on every page (UI review 2026-10-21: eight date styles and six
// ways of writing a change were in use). Chinese dates follow the agreed "2026-10-21", without the year in the
// current year ("10-21"), and times without seconds or a time zone ("10-21 14:03"); English uses the language's
// own short forms ("Oct 21", "Oct 21, 2025", "Oct 21, 2:03 PM"). Read the language at call time, never at
// module load, so a language switch takes effect on the next render.

export const EMPTY = '—';

type DateInput = string | number | Date | null | undefined;
type DateOptions = { withYear?: boolean; now?: Date; locale?: string };

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

// A calendar day from the server ("2026-10-21") names a day, not an instant: it is read in UTC so it shows the
// same day in every time zone. Anything else is an instant and shows in the browser's time zone.
function read(value: DateInput): { at: Date; utc: boolean } | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && CALENDAR_DAY.test(value)) {
    return { at: new Date(`${value}T00:00:00Z`), utc: true };
  }
  const at = value instanceof Date ? value : new Date(value);
  return Number.isNaN(at.getTime()) ? null : { at, utc: false };
}

const pad = (n: number) => String(n).padStart(2, '0');

function parts(at: Date, utc: boolean) {
  return utc
    ? {
        year: at.getUTCFullYear(),
        month: at.getUTCMonth() + 1,
        day: at.getUTCDate(),
        hour: at.getUTCHours(),
        minute: at.getUTCMinutes(),
      }
    : {
        year: at.getFullYear(),
        month: at.getMonth() + 1,
        day: at.getDate(),
        hour: at.getHours(),
        minute: at.getMinutes(),
      };
}

const thisYear = (year: number, now: Date) => year === now.getFullYear();

/** A browser-local day key for display grouping; calendar days retain their identity. */
export function localDateKey(value: DateInput): string {
  const r = read(value);
  if (!r) return '';
  const p = parts(r.at, r.utc);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** A day: "10-21" / "Oct 21" this year, "2025-10-21" / "Oct 21, 2025" otherwise; "—" when missing. */
export function formatDate(
  value: DateInput,
  { withYear, now = new Date(), locale = getCurrentLocale() }: DateOptions = {},
): string {
  const r = read(value);
  if (!r) return EMPTY;
  const p = parts(r.at, r.utc);
  const year = withYear ?? !thisYear(p.year, now);
  if (locale.startsWith('zh')) {
    return `${year ? `${p.year}-` : ''}${pad(p.month)}-${pad(p.day)}`;
  }
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(year ? { year: 'numeric' } : {}),
    ...(r.utc ? { timeZone: 'UTC' } : {}),
  }).format(r.at);
}

/** A time of day: "14:03" / "2:03 PM". */
export function formatTime(
  value: DateInput,
  {
    locale = getCurrentLocale(),
    seconds = false,
  }: { locale?: string; seconds?: boolean } = {},
): string {
  const r = read(value);
  if (!r) return EMPTY;
  if (locale.startsWith('zh')) {
    const p = parts(r.at, r.utc);
    return `${pad(p.hour)}:${pad(p.minute)}${seconds ? `:${pad(r.utc ? r.at.getUTCSeconds() : r.at.getSeconds())}` : ''}`;
  }
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    ...(seconds ? ({ second: '2-digit' } as const) : {}),
    ...(r.utc ? { timeZone: 'UTC' } : {}),
  }).format(r.at);
}

/** A day and time, without seconds or a time zone: "10-21 14:03" / "Oct 21, 2:03 PM". */
export function formatDateTime(
  value: DateInput,
  options: DateOptions = {},
): string {
  const r = read(value);
  if (!r) return EMPTY;
  const locale = options.locale ?? getCurrentLocale();
  if (locale.startsWith('zh'))
    return `${formatDate(value, options)} ${formatTime(value, { locale })}`;
  const p = parts(r.at, r.utc);
  const year = options.withYear ?? !thisYear(p.year, options.now ?? new Date());
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(year ? { year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
    ...(r.utc ? { timeZone: 'UTC' } : {}),
  }).format(r.at);
}

/** How long ago: "Just now", "5 min ago", "3 h ago", "2 days ago"; the day itself after a month. */
export function formatRelative(value: DateInput, now = Date.now()): string {
  const r = read(value);
  if (!r) return EMPTY;
  const minutes = Math.round((now - r.at.getTime()) / 60000);
  if (minutes < 1) return $t('common.now');
  if (minutes < 60) return $t('common.minAgo', { 0: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 48) return $t('common.hAgo', { 0: hours });
  const days = Math.round(hours / 24);
  if (days <= 30) return $t('dataHealth.daysAgo', { 0: days });
  return formatDate(value, { now: new Date(now) });
}

/** A count with the language's thousands separator: "12,246"; "—" when missing. */
export function formatCount(
  value: number | null | undefined,
  digits = 0,
): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  return value.toLocaleString(getCurrentLocale(), {
    maximumFractionDigits: digits,
  });
}

/** A share given as a ratio (0.462): "46.2%", always with the same decimals so a column of them lines up ("7.0%"). */
export function formatPercent(
  ratio: number | null | undefined,
  digits = 1,
): string {
  if (ratio == null || !Number.isFinite(ratio)) return EMPTY;
  return `${(ratio * 100).toLocaleString(getCurrentLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

const MINUS = '−';

/** A difference with its sign, a true minus so "−20" lines up with "+20": "+1,234", "−2,578", "0". */
export function formatSigned(
  value: number | null | undefined,
  digits = 0,
): string {
  if (value == null || !Number.isFinite(value)) return EMPTY;
  const shown = formatCount(Math.abs(value), digits);
  if (shown === formatCount(0, digits)) return shown;
  return `${value > 0 ? '+' : MINUS}${shown}`;
}

/** The size of a relative change (0.098 → "9.8%", 0.27 → "27%"): one decimal under 10%, whole numbers above. */
export function formatChangeSize(ratio: number): string {
  const percent = Math.abs(ratio * 100);
  return `${percent.toLocaleString(getCurrentLocale(), {
    maximumFractionDigits: percent < 10 ? 1 : 0,
  })}%`;
}

export type Direction = 'up' | 'down' | 'flat';

export const directionOf = (value: number): Direction =>
  value > 0 ? 'up' : value < 0 ? 'down' : 'flat';

export const ARROW: Record<Direction, string> = {
  up: '↑',
  down: '↓',
  flat: '',
};

/** A change as text, for places that cannot hold the Delta component: "↑ 12%", "↓ 9.8%", "0%". */
export function formatChange(ratio: number | null | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return EMPTY;
  const arrow = ARROW[directionOf(Math.round(ratio * 1000))];
  return `${arrow ? `${arrow} ` : ''}${formatChangeSize(ratio)}`;
}

/** A duration in seconds: "43 s", "2 min 37 s", "1 h 14 min". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return EMPTY;
  const s = Math.round(seconds);
  if (s < 60) return $t('dataParts.seconds', { 0: s });
  if (s < 3600) {
    return $t('dataParts.minutesSeconds', { 0: Math.floor(s / 60), 1: s % 60 });
  }
  return $t('common.hoursMinutes', {
    0: Math.floor(s / 3600),
    1: Math.round((s % 3600) / 60),
  });
}
