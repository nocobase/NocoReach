import { $t, getCurrentLocale } from '#i18n';
import { duration } from '../data-parts';
// 访问 (GA4): the shapes the server answers with (server/nocoreach/website-report.ts), the metrics as GA4 names and
// computes them, and how dimension values read in the page's language.

export type Values = {
  users?: number;
  newUsers?: number;
  sessions?: number;
  engaged?: number;
  duration?: number;
  views?: number;
  events?: number;
  keyEvents?: number;
  keyEventRate?: number;
};
export type Query = {
  keyword: string;
  clicks: number;
  impressions: number;
  position: number;
};
export type Row = Values & {
  key: string;
  dims: Record<string, string>;
  title?: string;
  ai?: string;
  queries?: Query[];
};
export type TableName =
  | 'channel'
  | 'sourceMedium'
  | 'campaign'
  | 'landing'
  | 'page'
  | 'event'
  | 'newVsReturning'
  | 'device'
  | 'country'
  | 'city'
  | 'language'
  | 'browser'
  | 'os';
export type Window = {
  start: string;
  end: string;
  days: number;
  previousStart: string;
  previousEnd: string;
};
export type Day = Values & { date: string };
export type Report = {
  connected: boolean;
  cutoff?: string | null;
  window?: Window;
  totals?: { current: Values | null; previous: Values | null };
  daily?: Day[];
  previousDaily?: Day[];
  tables?: Partial<Record<TableName, Row[]>>;
  missing?: TableName[];
  ai?: { sessions: number; sources: number };
};
export type RowDetail = {
  connected: boolean;
  window?: Window;
  daily?: Day[];
  previousDaily?: Day[];
  totals?: { current: Values | null; previous: Values | null };
};
export type TodayTotals = {
  users: number;
  views: number;
  sessions: number;
  keyEvents: number;
};
export type Today = {
  connected: boolean;
  timeZone: string;
  date: string;
  lastWeekDate: string;
  time: string;
  through: number;
  hours: {
    hour: number;
    today: number | null;
    yesterday: number;
    lastWeek: number;
  }[];
  totals: {
    today: TodayTotals | null;
    yesterday: TodayTotals | null;
    lastWeek: TodayTotals | null;
  };
  fullDay: { yesterday: number; lastWeek: number };
  sources: {
    source: string;
    medium: string;
    sessions: number;
    users: number;
    ai: string | null;
  }[];
};
export type Realtime = {
  connected: boolean;
  fetchedAt: string;
  users: number;
  views: number;
  eventCount: number;
  keyEvents: number;
  perMinute: number[];
  pages: { title: string; users: number; views: number }[];
  countries: { id: string; name: string; users: number }[];
  cities: { name: string; countryId: string; users: number }[];
  devices: { name: string; users: number }[];
  events: { name: string; count: number; users: number }[];
  /** Queries GA4 refused, left out on their own, with Google's reason. */
  missing?: { part: string; reason: string }[];
};

const ratio = (a?: number | null, b?: number | null) =>
  a == null || !b ? null : a / b;
export type Format = 'count' | 'percent' | 'duration' | 'decimal';
export type MetricKey =
  | 'users'
  | 'newUsers'
  | 'sessions'
  | 'views'
  | 'engagementRate'
  | 'engagementTime'
  | 'sessionTime'
  | 'keyEvents'
  | 'keyEventRate'
  | 'eventsPerSession'
  | 'events'
  | 'viewsPerUser'
  | 'eventsPerUser';
// Labels are translation keys, translated where they are shown; the glossary explains them under the same keys.
export const METRICS: Record<
  MetricKey,
  { label: string; of: (v: Values) => number | null; format: Format }
> = {
  users: {
    label: 'dataWebsite.activeUsers',
    of: (v) => v.users ?? null,
    format: 'count',
  },
  newUsers: {
    label: 'dataWebsite.newUsers',
    of: (v) => v.newUsers ?? null,
    format: 'count',
  },
  sessions: {
    label: 'dataWebsite.sessions',
    of: (v) => v.sessions ?? null,
    format: 'count',
  },
  views: {
    label: 'common.viewCount',
    of: (v) => v.views ?? null,
    format: 'count',
  },
  engagementRate: {
    label: 'dataWebsite.engagementRate',
    of: (v) => ratio(v.engaged, v.sessions),
    format: 'percent',
  },
  engagementTime: {
    label: 'dataWebsite.averageEngagementTime',
    of: (v) => ratio(v.duration, v.users),
    format: 'duration',
  },
  sessionTime: {
    label: 'dataWebsite.engagementTimePerSession',
    of: (v) => ratio(v.duration, v.sessions),
    format: 'duration',
  },
  keyEvents: {
    label: 'common.keyEvents',
    of: (v) => v.keyEvents ?? null,
    format: 'count',
  },
  keyEventRate: {
    label: 'dataWebsite.keyEventRate',
    of: (v) => v.keyEventRate ?? null,
    format: 'percent',
  },
  eventsPerSession: {
    label: 'dataWebsite.eventsPerSession',
    of: (v) => ratio(v.events, v.sessions),
    format: 'decimal',
  },
  events: {
    label: 'dataWebsite.eventCount',
    of: (v) => v.events ?? null,
    format: 'count',
  },
  viewsPerUser: {
    label: 'dataWebsite.viewsPerUser',
    of: (v) => ratio(v.views, v.users),
    format: 'decimal',
  },
  eventsPerUser: {
    label: 'dataWebsite.eventsPerUser',
    of: (v) => ratio(v.events, v.users),
    format: 'decimal',
  },
};
// GA4's home: the eight figures above the line, each one switching the line to itself.
export const KPI_KEYS: MetricKey[] = [
  'users',
  'newUsers',
  'sessions',
  'views',
  'engagementRate',
  'engagementTime',
  'keyEvents',
  'keyEventRate',
];

export const count = (v: number | null | undefined) =>
  v == null ? '—' : Math.round(v).toLocaleString(getCurrentLocale());
export function show(v: number | null | undefined, format: Format): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (format === 'percent') return `${(v * 100).toFixed(1)}%`;
  if (format === 'duration') return duration(v);
  if (format === 'decimal') return v.toFixed(2);
  return count(v);
}
// A chart tooltip's title: the day, and the day of the period before it is drawn against.
export function dayLabel(
  day: unknown,
  items?: readonly { payload?: unknown }[],
): string {
  const previous = (
    items?.[0]?.payload as { previousDate?: string } | undefined
  )?.previousDate;
  return `${typeof day === 'string' ? day : ''}${previous ? $t('common.previousPeriod', { 0: previous }) : ''}`;
}
export const change = (now: number | null, before: number | null) =>
  now == null || before == null || before === 0
    ? null
    : (now - before) / before;

// GA4's default channel groups, as GA4's Chinese interface names them.
const CHANNELS: Record<string, string> = {
  'Organic Search': 'dataWebsite.channelOrganicSearch',
  Direct: 'dataWebsite.channelDirect',
  Referral: 'dataWebsite.channelReferral',
  'Organic Social': 'dataWebsite.channelOrganicSocial',
  'Organic Video': 'dataWebsite.channelOrganicVideo',
  'Organic Shopping': 'dataWebsite.channelOrganicShopping',
  Email: 'dataWebsite.channelEmail',
  'Paid Search': 'dataWebsite.channelPaidSearch',
  'Paid Social': 'dataWebsite.channelPaidSocial',
  'Paid Video': 'dataWebsite.channelPaidVideo',
  'Paid Shopping': 'dataWebsite.channelPaidShopping',
  'Paid Other': 'dataWebsite.channelPaidOther',
  Display: 'dataWebsite.channelDisplay',
  'Cross-network': 'dataWebsite.channelCrossNetwork',
  Affiliates: 'dataWebsite.channelAffiliates',
  SMS: 'dataWebsite.channelSms',
  'Mobile Push Notifications': 'dataWebsite.channelMobilePush',
  Audio: 'dataWebsite.channelAudio',
  Unassigned: 'dataWebsite.channelUnassigned',
};
const DEVICES: Record<string, string> = {
  desktop: 'dataWebsite.deviceDesktop',
  mobile: 'dataWebsite.deviceMobile',
  tablet: 'dataWebsite.deviceTablet',
  'smart tv': 'dataWebsite.deviceSmartTv',
};
const SPECIAL: Record<string, string> = {
  '(not set)': 'dataWebsite.notSet',
  '(direct)': 'dataWebsite.direct',
  '(none)': 'dataWebsite.none',
  '(organic)': 'dataWebsite.organic',
  '(referral)': 'dataWebsite.referral',
  '(other)': 'dataWebsite.other',
  '(data deleted)': 'dataWebsite.dataDeleted',
};
export const special = (v: string) =>
  SPECIAL[v] ? $t(SPECIAL[v]) : v || $t('dataWebsite.notSet');
export const channelName = (v: string) =>
  CHANNELS[v] ? $t(CHANNELS[v]) : special(v);
export const deviceName = (v: string) =>
  DEVICES[v] ? $t(DEVICES[v]) : special(v);
export const visitorName = (v: string) =>
  v === 'new'
    ? $t('dataWebsite.newVisitor')
    : v === 'returning'
      ? $t('dataWebsite.returningVisitor')
      : special(v);
const display = (type: 'region' | 'language') => {
  try {
    return new Intl.DisplayNames([getCurrentLocale()], { type });
  } catch {
    return null;
  }
};
export function regionName(id: string | undefined, fallback: string): string {
  if (!id || id === '(not set)') return special(fallback);
  try {
    return display('region')?.of(id) || fallback;
  } catch {
    return fallback;
  }
}
export function languageName(
  code: string | undefined,
  fallback: string,
): string {
  if (!code || code === '(not set)') return special(fallback);
  try {
    return display('language')?.of(code) || fallback;
  } catch {
    return fallback;
  }
}
// The report each table is, for the note naming the ones GA4 did not return.
export const TABLE_LABELS: Record<TableName, string> = {
  channel: 'dataWebsite.channel',
  sourceMedium: 'dataWebsite.sourceMedium',
  campaign: 'dataWebsite.campaign',
  landing: 'dataWebsite.landingPage',
  page: 'common.page',
  event: 'dataWebsite.eventName',
  newVsReturning: 'dataWebsite.newVsReturning',
  device: 'dataWebsite.device',
  country: 'dataWebsite.countryRegion',
  city: 'dataWebsite.city',
  language: 'dataWebsite.language',
  browser: 'dataWebsite.browser',
  os: 'dataWebsite.operatingSystem',
};
