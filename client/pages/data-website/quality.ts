import type { MetricKey, Report, Row } from './model';

// 数据可能有问题: patterns in the period report that usually mean GA4's numbers are off rather than that visitors changed,
// found by rule from the report the page already has. Each names what it points at, so the page can mark that channel or
// figure where it is shown, and says why and where in GA4 to look.

export type QualityIssue =
  | {
      kind: 'lowEngagementChannel';
      channel: string;
      /** Share of all sessions. */
      share: number;
      rate: number;
      siteRate: number;
      /** Sessions gained on the previous period, when it grew while the site's sessions fell. */
      gained: number | null;
    }
  | { kind: 'highKeyEventRate'; rate: number; events: KeyEventSuspect[] }
  | { kind: 'noSource'; share: number };

/** A key event that is probably not a conversion: one that by its name counts page views, an event GA4 records on its own,
 * or one making up most key events. */
export type KeyEventSuspect = {
  name: string;
  /** Its part of all key events. */
  share: number;
  reason: 'pageView' | 'automatic' | 'dominant';
};

/** A channel this share of sessions or more, engaged at under 10% and under a third of the site's rate. */
export const LOW_ENGAGEMENT = { share: 0.05, rate: 0.1, ofSite: 1 / 3 };
/** Sessions with a key event: sites usually see a few percent. */
export const HIGH_KEY_EVENT_RATE = 0.2;
/** Events GA4 records by itself (automatically or with enhanced measurement) that fire on ordinary visits. */
const AUTOMATIC = new Set([
  'page_view',
  'session_start',
  'first_visit',
  'user_engagement',
  'scroll',
  'click',
]);
const PAGE_VIEW = /page_?view/i;
/** One key event making up this part of all key events or more. */
const DOMINANT = 0.5;
const MAX_SUSPECTS = 3;
/** Sessions without a source (Unassigned, or source (not set)). */
export const NO_SOURCE = 0.1;

const engagement = (r: { engaged?: number; sessions?: number }) =>
  r.sessions ? (r.engaged ?? 0) / r.sessions : null;

export function qualityIssues(report: Report): QualityIssue[] {
  const totals = report.totals?.current;
  const sessions = totals?.sessions ?? 0;
  if (!totals || !sessions) return [];
  const issues: QualityIssue[] = [];
  const siteRate = engagement(totals);
  const channels = report.tables?.channel ?? [];
  const before = new Map(
    (report.changes?.channel ?? []).map((r) => [r.key, r]),
  );
  const previousSessions = report.totals?.previous?.sessions;
  const siteFell = previousSessions != null && previousSessions > sessions;
  for (const r of channels) {
    const share = (r.sessions ?? 0) / sessions,
      rate = engagement(r);
    if (
      siteRate == null ||
      rate == null ||
      share < LOW_ENGAGEMENT.share ||
      rate >= LOW_ENGAGEMENT.rate ||
      rate >= siteRate * LOW_ENGAGEMENT.ofSite
    )
      continue;
    const change = before.get(channelKey(r));
    const gained = change
      ? (change.current.sessions ?? 0) - (change.previous.sessions ?? 0)
      : 0;
    issues.push({
      kind: 'lowEngagementChannel',
      channel: channelKey(r),
      share,
      rate,
      siteRate,
      gained: gained > 0 && siteFell ? gained : null,
    });
  }

  const keyEventRate = totals.keyEventRate;
  if (keyEventRate != null && keyEventRate >= HIGH_KEY_EVENT_RATE) {
    const keyed = (report.tables?.event ?? []).filter(
      (e) => (e.keyEvents ?? 0) > 0,
    );
    const all =
      totals.keyEvents || keyed.reduce((n, e) => n + (e.keyEvents ?? 0), 0);
    const events = keyed
      .map((e): KeyEventSuspect | null => {
        const name = e.dims.eventName ?? e.key,
          share = all ? (e.keyEvents ?? 0) / all : 0;
        const reason = PAGE_VIEW.test(name)
          ? 'pageView'
          : AUTOMATIC.has(name)
            ? 'automatic'
            : share >= DOMINANT
              ? 'dominant'
              : null;
        return reason ? { name, share, reason } : null;
      })
      .filter((e): e is KeyEventSuspect => e !== null)
      .sort((a, b) => b.share - a.share)
      .slice(0, MAX_SUSPECTS);
    issues.push({ kind: 'highKeyEventRate', rate: keyEventRate, events });
  }

  // Sessions GA4 could not attribute; left out when a low-engagement Unassigned channel already says so.
  if (
    !issues.some(
      (i) => i.kind === 'lowEngagementChannel' && i.channel === 'Unassigned',
    )
  ) {
    const unassigned =
      channels.find((r) => channelKey(r) === 'Unassigned')?.sessions ?? 0;
    const notSet = (report.tables?.sourceMedium ?? [])
      .filter((r) => r.dims.sessionSource === '(not set)')
      .reduce((n, r) => n + (r.sessions ?? 0), 0);
    const share = Math.max(unassigned, notSet) / sessions;
    if (share >= NO_SOURCE) issues.push({ kind: 'noSource', share });
  }
  return issues;
}

const channelKey = (r: Row) => r.dims.sessionDefaultChannelGroup ?? r.key;

/** The channels an issue points at, for marking them where they are shown. */
export const suspectChannels = (issues: QualityIssue[]) =>
  new Set(
    issues.flatMap((i) =>
      i.kind === 'lowEngagementChannel' ? [i.channel] : [],
    ),
  );

/** The figures an issue concerns: its note shows while one of them is picked. */
export const ISSUE_METRICS: Record<QualityIssue['kind'], MetricKey[]> = {
  lowEngagementChannel: [
    'users',
    'newUsers',
    'sessions',
    'views',
    'engagementRate',
    'engagementTime',
  ],
  noSource: ['users', 'newUsers', 'sessions', 'views'],
  highKeyEventRate: ['keyEvents', 'keyEventRate'],
};
export const issuesFor = (issues: QualityIssue[], metric: MetricKey) =>
  issues.filter((i) => ISSUE_METRICS[i.kind].includes(metric));
