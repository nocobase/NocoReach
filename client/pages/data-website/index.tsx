import { $t, $tj, getCurrentLocale, isChinese } from '#i18n';
import {
  GA4_HISTORY_CACHE_MS,
  GA4_PARTIAL_CACHE_MS,
  ga4CacheExpiry,
} from '../../../shared/ga4-cache.js';
// 访问 (网站与产品, GA4), rebuilt 2026-10-14 after GA4's own reports (user request: show everything GA4 has). From the
// top: 今天 (实时 and today against yesterday and last week, today.tsx), the range, GA4's eight figures (a figure picks
// the line below it), where sessions come from (channels with AI 助手, new and returning visitors, devices) and the
// report tables (reports.tsx). The numbers are read live from GA4 for a window ending yesterday; the line's last two
// days are dotted because GA4 is still processing them.
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { BarChart3, TriangleAlert } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, ListSkeleton, LoadError } from '#components/reach/states';
import { NotesTip, InfoTip, WithInfo } from '#components/reach/info-tip';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { cn } from '#lib/utils';
import { useProject } from '../reach-data';
import { useFreshData } from '../workspace-cache';
import { RangePicker } from '../range-picker';
import { validRange, useRange, defaultRanges } from '../range-state';
import { MetricTile } from '../data-parts';
import { HandOffBar } from '../hand-off-bar';
import { ReportCard } from './reports';
import { TodayCard } from './today';
import { explainChange, type Driver } from './drivers';
import {
  issuesFor,
  qualityIssues,
  suspectChannels,
  type QualityIssue,
} from './quality';
import {
  change,
  channelName,
  count,
  dayLabel,
  deviceName,
  KPI_KEYS,
  METRICS,
  ownDays,
  show,
  TABLE_LABELS,
  visitorName,
  type MetricKey,
  type Report,
  type Row,
} from './model';
import '../data-views.css';
import { formatDate } from '#lib/format';
import { Tag } from '#components/reach/tag';

const RANGES = defaultRanges;

// How the numbers are counted, and which reports GA4 left out this time.
function notesOf(report: Report): string[] {
  const missing = report.missing ?? [];
  return [
    $t('dataWebsite.usersDeduplicatedPeriod'),
    $t('dataWebsite.aiAssistantsBySourceName'),
    $t('dataWebsite.keyEventsFollowDefinitionGa'),
    $t('dataWebsite.latestDaysPreliminary'),
    ...(missing.length
      ? [
          $t('dataWebsite.ga4DidNotReturn', {
            0: missing
              .map((n) => $t(TABLE_LABELS[n]))
              .join(isChinese() ? '、' : ', '),
          }),
        ]
      : []),
  ];
}

export default function DataWebsite() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [range, setRange] = useRange();
  const r = RANGES.includes(range.range) ? range : { range: '28' };
  const valid = validRange(r);
  const [metric, setMetric] = useState<MetricKey>('users');
  const { data: report, error } = useFreshData<Report>(
    project && valid
      ? `data-view:website:${project.id}:${project.analyticsPropertyId}:${project.searchConsoleProperty}:${JSON.stringify(r)}`
      : null,
    () =>
      api.action<Report>('nrDataViews', 'website', {
        method: 'POST',
        body: { projectId: project!.id, ...r },
        unwrap: 'data',
      }),
    {
      staleTime: GA4_HISTORY_CACHE_MS,
      retryDelay: GA4_PARTIAL_CACHE_MS,
      expiresAt: ga4CacheExpiry,
    },
  );
  const w = report?.window;
  const ready = Boolean(report?.connected && report.cutoff && report.totals);
  const issues = ready ? qualityIssues(report!) : [];
  const suspect = suspectChannels(issues);
  const keyEventRateSuspect = issues.some((i) => i.kind === 'highKeyEventRate');
  const pageUrl = (page: string) =>
    page.startsWith('http')
      ? page
      : `https://${project?.domains?.[0] ?? ''}${page}`;
  return (
    <PageContainer className='nr-data-page'>
      <PageHeader
        info={ready ? <NotesTip notes={notesOf(report!)} /> : null}
        title={$t('dataWebsite.traffic')}
        description={$t('dataWebsite.visitorsSourcesPagesEvents')}
      />
      <RangePicker
        value={r}
        onChange={setRange}
        options={RANGES}
        summary={
          w
            ? 'all' in w && w.all
              ? $t('rangePicker.availableRange', {
                  0: formatDate(w.start),
                  1: formatDate(w.end),
                })
              : $t('common.comparedPreviousDaysDataThrough', {
                  0: formatDate(w.start),
                  1: formatDate(w.end),
                  2: w.days,
                  3: formatDate(report?.cutoff),
                })
            : undefined
        }
      />
      {/* The date range sits right under the header, as on every data page; Today follows it (UI review 2026-10-22). */}
      {report?.connected ? (
        <TodayCard
          projectId={project?.id}
          propertyId={project?.analyticsPropertyId}
        />
      ) : null}
      {error ? (
        <LoadError
          title={$t('dataWebsite.notLoadTrafficData')}
          message={
            error instanceof Error ? error.message : $t('common.tryAgainLater')
          }
        />
      ) : null}
      {!report && !error ? <ListSkeleton rows={6} /> : null}
      {report && (!report.connected || !report.cutoff) ? (
        <EmptyState
          icon={<BarChart3 />}
          title={$t('dataWebsite.onceGa4ConnectedWebsite')}
          description={$t('common.authorizationReadsDataSyncsAutomatically')}
          action={
            <Button onClick={() => void navigate('/connections?source=ga4')}>
              {$t('dataWebsite.connectGa4')}
            </Button>
          }
        />
      ) : null}
      {ready ? (
        <>
          <div
            className='grid grid-cols-2 gap-3 lg:grid-cols-4'
            role='group'
            aria-label={$t('dataWebsite.metrics')}
          >
            {KPI_KEYS.map((key) => {
              const m = METRICS[key],
                value = m.of(report!.totals!.current ?? {}),
                previous = report!.totals!.previous
                  ? m.of(report!.totals!.previous)
                  : null;
              // The whole tile picks the line; the button lies under the figures so the tile's ⓘ stays its own button.
              return (
                <div
                  key={key}
                  data-metric={key}
                  className={cn(
                    'relative rounded-xl',
                    metric === key && 'ring-2 ring-primary',
                  )}
                >
                  <button
                    type='button'
                    aria-pressed={metric === key}
                    aria-label={$t(m.label)}
                    onClick={() => setMetric(key)}
                    className='absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
                  />
                  <Card className='pointer-events-none relative h-full gap-0 p-4 [&_[data-info-tip]]:pointer-events-auto'>
                    <MetricTile
                      m={{
                        key,
                        label: $t(m.label),
                        value,
                        previous,
                        complete: true,
                        change: change(value, previous),
                        format: m.format === 'count' ? undefined : m.format,
                      }}
                    />
                  </Card>
                  {(key === 'keyEvents' || key === 'keyEventRate') &&
                  keyEventRateSuspect ? (
                    <Tag
                      tone='amber'
                      className='pointer-events-none absolute top-3 right-3'
                      data-quality-mark=''
                    >
                      {$t('dataWebsite.qualitySuspect')}
                    </Tag>
                  ) : null}
                </div>
              );
            })}
          </div>
          {/* The change sentence and the notes about the same figure read as one block; nothing when both are empty. */}
          <div className='flex flex-col gap-2 empty:hidden'>
            <ChangeDrivers report={report!} metric={metric} suspect={suspect} />
            <QualityNotes issues={issuesFor(issues, metric)} />
          </div>
          <TrendCard report={report!} metric={metric} />
          <div className='grid gap-3 lg:grid-cols-2'>
            <ChannelCard report={report!} issues={issues} />
            <AudienceCard report={report!} />
          </div>
          <ReportCard
            report={report!}
            range={r}
            projectId={project?.id}
            propertyId={project?.analyticsPropertyId}
            toUrl={pageUrl}
          />
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

// 变化来自哪里: one sentence under the figures for the one picked, from explainChange (drivers.ts). A channel the data
// quality notes suspect says so where it is named.
function ChangeDrivers({
  report,
  metric,
  suspect,
}: {
  report: Report;
  metric: MetricKey;
  suspect: Set<string>;
}) {
  const x = explainChange(report, metric);
  if (!x) return null;
  const channel = (key: string) =>
    `${channelName(key)}${suspect.has(key) ? $t('dataWebsite.qualitySuspectSuffix') : ''}`;
  const signed = (n: number) => `${n > 0 ? '+' : '−'}${count(Math.abs(n))}`;
  const list = (items: string[]) =>
    new Intl.ListFormat(getCurrentLocale(), { type: 'conjunction' }).format(
      items,
    );
  const driver = (name: string, d: Driver) =>
    d.share != null && d.share <= 1
      ? $t('dataWebsite.changeDriverShare', {
          0: name,
          1: signed(d.delta),
          2: `${Math.round(d.share * 100)}%`,
        })
      : $t(
          d.status === 'new'
            ? 'dataWebsite.changeDriverNew'
            : d.status === 'gone'
              ? 'dataWebsite.changeDriverGone'
              : 'dataWebsite.changeDriver',
          { 0: name, 1: signed(d.delta) },
        );
  const total = $t(
    x.delta < 0 ? 'dataWebsite.changeDown' : 'dataWebsite.changeUp',
    { 0: $t(METRICS[metric].label), 1: count(Math.abs(x.delta)) },
  );
  const parts = [
    x.channels.length
      ? $t('dataWebsite.changeWithChannels', {
          0: total,
          1: list(x.channels.map((d) => driver(channel(d.key), d))),
        })
      : $t('dataWebsite.changeAlone', { 0: total }),
  ];
  if (x.counter)
    parts.push(
      $t('dataWebsite.changeCounter', {
        0: channel(x.counter.key),
        1: signed(x.counter.delta),
      }),
    );
  if (x.pages.length)
    parts.push(
      $t(
        x.pagesAre === 'landing'
          ? 'dataWebsite.changeLandingPages'
          : 'dataWebsite.changePages',
        { 0: list(x.pages.map((d) => driver(d.key, d))) },
      ),
    );
  // What moved the figure is a finding, not a warning: plain text under the figures (UI review 2026-10-21).
  return (
    <p className='text-sm' data-change-drivers=''>
      {parts.join(isChinese() ? '' : ' ')}
    </p>
  );
}

// The chosen figure per day against the same day of the period before; days GA4 is still processing are dotted.
function TrendCard({ report, metric }: { report: Report; metric: MetricKey }) {
  const m = METRICS[metric],
    settled = report.settledThrough ?? report.cutoff!;
  const days = ownDays(report.window, report.daily, report.previousDaily);
  const points = days.current.map((d, i) => {
    const before = days.previous[i];
    const value = m.of(d);
    return {
      date: d.date,
      value: d.date <= settled ? value : null,
      fresh: d.date >= settled ? value : null,
      previous: before ? m.of(before) : null,
      previousDate: before?.date ?? '',
    };
  });
  const fresh = points.some((p) => p.date > settled);
  if (points.filter((p) => p.value !== null || p.fresh !== null).length < 2)
    return null;
  const axis = (v: number) =>
    m.format === 'percent'
      ? `${Math.round(v * 100)}%`
      : m.format === 'duration'
        ? `${Math.round(v)}s`
        : m.format === 'decimal'
          ? v.toFixed(1)
          : show(v, 'count');
  return (
    <Card className='gap-3 px-4'>
      <div className='flex items-center gap-1'>
        <h2 className='text-sm font-semibold'>
          {$tj('dataWebsite.metricPerDay', { 0: $t(m.label) })}
        </h2>
        <InfoTip label={$t('common.howReadChart')}>
          {$t('dataWebsite.trendHowToRead', {
            0: fresh ? $t('dataWebsite.dottedLatestDaysPreliminary') : '',
          })}
        </InfoTip>
      </div>
      <div className='nr-chart-box' data-website-chart={metric}>
        <ResponsiveContainer width='100%' height={240}>
          <ComposedChart
            data={points}
            margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray='3 3' vertical={false} />
            <XAxis
              dataKey='date'
              tickFormatter={(d: string) => d.slice(5)}
              minTickGap={32}
              fontSize={11}
            />
            <YAxis fontSize={11} width={56} tickFormatter={axis} />
            <Tooltip
              formatter={(v) => show(Number(v), m.format)}
              labelFormatter={dayLabel}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              isAnimationActive={false}
              type='linear'
              dataKey='value'
              name={$t(m.label)}
              stroke='var(--chart-3)'
              fill='var(--chart-3)'
              fillOpacity={0.1}
            />
            <Line
              isAnimationActive={false}
              type='linear'
              dataKey='previous'
              name={$t('dataWebsite.previousPeriod')}
              stroke='var(--muted-foreground)'
              strokeDasharray='4 4'
              dot={false}
            />
            {fresh ? (
              <Line
                isAnimationActive={false}
                type='linear'
                dataKey='fresh'
                name={$t('dataWebsite.preliminaryData')}
                stroke='var(--chart-3)'
                strokeDasharray='2 3'
                dot={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// Shares of sessions, which add up across the rows of one dimension (users do not).
function Bars({
  rows,
  total,
  name,
  accent,
  mark,
}: {
  rows: Row[];
  total: number;
  name: (r: Row) => string;
  accent?: (r: Row) => boolean;
  /** A mark before a row's name, such as a ⚠ explaining data that may be off. */
  mark?: (r: Row) => ReactNode;
}) {
  return (
    <ul className='flex flex-col gap-1.5'>
      {rows.map((r) => {
        const share = total ? (r.sessions ?? 0) / total : 0;
        return (
          <li
            key={r.key}
            className='grid grid-cols-[7rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-sm'
          >
            <span className='flex min-w-0 items-center gap-1'>
              {mark?.(r)}
              <span className='truncate' title={name(r)}>
                {name(r)}
              </span>
            </span>
            <span className='h-2 overflow-hidden rounded-sm bg-muted'>
              <span
                className={cn(
                  'block h-full rounded-sm',
                  accent?.(r) ? 'bg-nr-ink-violet' : 'bg-primary/70',
                )}
                style={{ width: `${Math.max(share * 100, share ? 1 : 0)}%` }}
              />
            </span>
            <span className='text-right tabular-nums text-muted-foreground'>
              {show(share, 'percent')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// 数据可能有问题: an issue qualityIssues (quality.ts) found, as its title, what was seen, and where in GA4 to fix it.
// The text is written here, per rule; nothing is generated.
function qualityText(i: QualityIssue): [string, string, string] {
  const pct = (v: number) => show(v, 'percent');
  if (i.kind === 'lowEngagementChannel') {
    const detail = $t('dataWebsite.qualityLowEngagementDetail', {
      0: pct(i.share),
      1: pct(i.rate),
      2: pct(i.siteRate),
    });
    return [
      $t('dataWebsite.qualityLowEngagementTitle', {
        0: channelName(i.channel),
      }),
      i.gained
        ? `${detail}${isChinese() ? '' : ' '}${$t('dataWebsite.qualityGained', { 0: count(i.gained) })}`
        : detail,
      $t('dataWebsite.qualityLowEngagementFix'),
    ];
  }
  if (i.kind === 'highKeyEventRate')
    return [
      $t('dataWebsite.qualityKeyEventRateTitle', { 0: pct(i.rate) }),
      i.events.length
        ? $t('dataWebsite.qualityKeyEventSuspects', {
            0: i.events
              .map((e) =>
                $t(
                  e.reason === 'pageView'
                    ? 'dataWebsite.qualityKeyEventPageView'
                    : e.reason === 'automatic'
                      ? 'dataWebsite.qualityKeyEventAutomatic'
                      : 'dataWebsite.qualityKeyEventDominant',
                  { 0: e.name, 1: pct(e.share) },
                ),
              )
              .join(isChinese() ? '；' : '; '),
          })
        : $t('dataWebsite.qualityKeyEventRateDetail'),
      $t('dataWebsite.qualityKeyEventRateFix'),
    ];
  return [
    $t('dataWebsite.qualityNoSourceTitle', { 0: pct(i.share) }),
    $t('dataWebsite.qualityNoSourceDetail'),
    $t('dataWebsite.qualityNoSourceFix'),
  ];
}

function QualityText({ issue }: { issue: QualityIssue }) {
  const [, detail, fix] = qualityText(issue);
  return (
    <>
      <p>{detail}</p>
      <p>
        <span className='font-medium'>{$t('dataWebsite.qualityHowToFix')}</span>
        {fix}
      </p>
    </>
  );
}

// The issues about the picked figure, under the figures: one line each, marked as needing a look, with why and how to
// fix it in GA4 in its ⓘ rather than a paragraph of steps on the page (UI review 2026-10-21).
function QualityNotes({ issues }: { issues: QualityIssue[] }) {
  if (!issues.length) return null;
  return (
    <section
      aria-label={$t('dataWebsite.qualityHeading')}
      className='flex flex-col gap-1.5 text-sm'
      data-quality-notes=''
    >
      {issues.map((i) => (
        <p
          key={`${i.kind}:${'channel' in i ? i.channel : ''}`}
          className='flex flex-wrap items-center gap-2'
        >
          <Tag tone='amber'>{$t('dataWebsite.qualitySuspect')}</Tag>
          <WithInfo
            help={
              <span className='flex flex-col gap-1'>
                <QualityText issue={i} />
              </span>
            }
          >
            {qualityText(i)[0]}
          </WithInfo>
        </p>
      ))}
    </section>
  );
}

function ChannelCard({
  report,
  issues,
}: {
  report: Report;
  issues: QualityIssue[];
}) {
  const issueOf = (r: Row) =>
    issues.find(
      (i) =>
        i.kind === 'lowEngagementChannel' &&
        i.channel === r.dims.sessionDefaultChannelGroup,
    );
  const total = report.totals?.current?.sessions ?? 0;
  const rows = (report.tables?.channel ?? []).slice(0, 7);
  return (
    <Card className='gap-3 px-4'>
      <div className='flex items-center gap-1'>
        <h2 className='text-sm font-semibold'>{$t('dataWebsite.channel')}</h2>
        <InfoTip label={$t('dataWebsite.howChannelsGrouped')}>
          {$t('dataWebsite.channelShareNote')}
        </InfoTip>
      </div>
      {rows.length ? (
        <Bars
          rows={rows}
          total={total}
          name={(r) => channelName(r.dims.sessionDefaultChannelGroup)}
          accent={(r) => r.dims.sessionDefaultChannelGroup === 'AI Assistant'}
          mark={(r) => {
            const issue = issueOf(r);
            return issue ? (
              <InfoTip
                label={qualityText(issue)[0]}
                icon={<TriangleAlert className='size-3.5' aria-hidden='true' />}
                className='text-nr-ink-amber hover:text-nr-ink-amber data-[popup-open]:text-nr-ink-amber'
              >
                <p className='font-medium'>{qualityText(issue)[0]}</p>
                <QualityText issue={issue} />
              </InfoTip>
            ) : null;
          }}
        />
      ) : (
        <p className='text-sm text-muted-foreground'>
          {$t('dataWebsite.noDataSelectedPeriod')}
        </p>
      )}
    </Card>
  );
}

function AudienceCard({ report }: { report: Report }) {
  const total = report.totals?.current?.sessions ?? 0;
  const visitors =
    report.tables?.newVsReturning?.filter(
      (r) =>
        r.dims.newVsReturning === 'new' ||
        r.dims.newVsReturning === 'returning',
    ) ?? [];
  const devices = (report.tables?.device ?? []).slice(0, 4);
  return (
    <Card className='gap-3 px-4'>
      <div className='flex items-center gap-1'>
        <h2 className='text-sm font-semibold'>
          {$t('dataWebsite.newReturningDevices')}
        </h2>
        <InfoTip label={$t('dataWebsite.howCounted')}>
          {$t('dataWebsite.newReturningShareNote')}
        </InfoTip>
      </div>
      {visitors.length ? (
        <Bars
          rows={visitors}
          total={total}
          name={(r) => visitorName(r.dims.newVsReturning)}
        />
      ) : null}
      {devices.length ? (
        <div className={cn(visitors.length && 'border-t border-border pt-2')}>
          <Bars
            rows={devices}
            total={total}
            name={(r) => deviceName(r.dims.deviceCategory)}
          />
        </div>
      ) : null}
      {!visitors.length && !devices.length ? (
        <p className='text-sm text-muted-foreground'>
          {$t('dataWebsite.noDataSelectedPeriod')}
        </p>
      ) : null}
    </Card>
  );
}
