import type { MetricKey, Report, Values } from './model';

// 变化来自哪里: where a figure's change against the previous period came from, by rule rather than by a model, so every
// number can be found again in the report tables. A count splits exactly over channels, and over pages (views, key
// events) or landing pages (sessions, new users, which start on one). Active users do not add up across channels (one
// person can come from several), so they get the channels without shares and no pages. Rates and averages are not
// explained: a rate moves both with each channel's own rate and with the channels' mix.

export type ChangeRow = { key: string; current: Values; previous: Values };
export type ChangeTables = Partial<
  Record<'channel' | 'page' | 'landing', ChangeRow[]>
>;

const EXPLAINED: Partial<
  Record<
    MetricKey,
    { field: keyof Values; pages: 'page' | 'landing' | null; shares: boolean }
  >
> = {
  views: { field: 'views', pages: 'page', shares: true },
  keyEvents: { field: 'keyEvents', pages: 'page', shares: true },
  sessions: { field: 'sessions', pages: 'landing', shares: true },
  newUsers: { field: 'newUsers', pages: 'landing', shares: true },
  users: { field: 'users', pages: null, shares: false },
};

export type Driver = {
  key: string;
  delta: number;
  /** This driver's part of the total change; only for counts that add up, and only when nothing went the other way. */
  share: number | null;
  /** In this period only, or in the previous one only. */
  status?: 'new' | 'gone';
};
export type ChangeExplanation = {
  delta: number;
  channels: Driver[];
  /** A channel that moved the other way by at least a fifth of the total change. */
  counter: Driver | null;
  pages: Driver[];
  pagesAre: 'page' | 'landing' | null;
};

const MIN_COUNTER = 0.2;

export function explainChange(
  report: Report,
  metric: MetricKey,
): ChangeExplanation | null {
  const spec = EXPLAINED[metric];
  if (!spec) return null;
  const now = report.totals?.current?.[spec.field];
  const before = report.totals?.previous?.[spec.field];
  if (now == null || before == null || now === before) return null;
  const delta = now - before;
  const movers = (rows: ChangeRow[] | undefined): Driver[] =>
    (rows ?? [])
      .map((r) => {
        const a = r.current[spec.field] ?? 0,
          b = r.previous[spec.field] ?? 0;
        return {
          key: r.key,
          delta: a - b,
          share: null,
          status: !b ? ('new' as const) : !a ? ('gone' as const) : undefined,
        };
      })
      .filter((d) => d.delta !== 0)
      .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const sameWay = (d: Driver) => Math.sign(d.delta) === Math.sign(delta);
  const channelMoves = movers(report.changes?.channel);
  const counter =
    channelMoves.find(
      (d) => !sameWay(d) && Math.abs(d.delta) >= MIN_COUNTER * Math.abs(delta),
    ) ?? null;
  const channels = channelMoves
    .filter(sameWay)
    .slice(0, 2)
    .map((d) => ({
      ...d,
      share: spec.shares && !counter ? d.delta / delta : null,
      status: undefined,
    }));
  const pages = spec.pages
    ? movers(report.changes?.[spec.pages]).filter(sameWay).slice(0, 3)
    : [];
  if (!channels.length && !pages.length) return null;
  return {
    delta,
    channels,
    counter: counter && { ...counter, share: null, status: undefined },
    pages,
    pagesAre: pages.length ? spec.pages : null,
  };
}
