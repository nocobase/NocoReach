import { $t, $tj, isChinese } from '#i18n';
// 访问 (网站与产品, GA4), rebuilt 2026-10-14 after GA4's own reports (user request: show everything GA4 has). From the
// top: 今天 (实时 and today against yesterday and last week, today.tsx), the range, GA4's eight figures (a figure picks
// the line below it), where sessions come from (channels with AI 助手, new and returning visitors, devices) and the
// report tables (reports.tsx). The numbers are read live from GA4 for a window ending at the synced cutoff, like the
// other data pages; the line runs on to yesterday with the days after the cutoff dotted.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BarChart3 } from 'lucide-react';
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
import { NotesTip, InfoTip } from '#components/reach/info-tip';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { cn } from '#lib/utils';
import { useProject } from '../reach-data';
import { useFreshData } from '../workspace-cache';
import { RangePicker, useRange } from '../range-picker';
import { MetricTile } from '../data-parts';
import { HandOffBar } from '../hand-off-bar';
import { ReportCard } from './reports';
import { TodayCard } from './today';
import {
  change,
  channelName,
  dayLabel,
  deviceName,
  KPI_KEYS,
  METRICS,
  show,
  TABLE_LABELS,
  visitorName,
  type MetricKey,
  type Report,
  type Row,
} from './model';
import '../data-views.css';

const RANGES = ['7', '28', '90', '3m', '12m'];

// How the numbers are counted, and which reports GA4 left out this time.
function notesOf(report: Report): string[] {
  const missing = report.missing ?? [];
  return [
    $t('dataWebsite.usersDeduplicatedPeriod'),
    $t('dataWebsite.aiAssistantsBySourceName'),
    $t('dataWebsite.keyEventsFollowDefinitionGa'),
    $t('dataWebsite.preliminaryAfterCutoff'),
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
  const r = RANGES.includes(range.range) ? range.range : '28';
  const [metric, setMetric] = useState<MetricKey>('users');
  const { data: report, error } = useFreshData<Report>(
    project ? `data-view:website:${project.id}:${r}` : null,
    () =>
      api.action<Report>('nrDataViews', 'website', {
        method: 'POST',
        body: { projectId: project!.id, range: r },
        unwrap: 'data',
      }),
  );
  const w = report?.window;
  const ready = Boolean(report?.connected && report.cutoff && report.totals);
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
      {report?.connected ? <TodayCard projectId={project?.id} /> : null}
      <RangePicker
        value={{ range: r }}
        onChange={setRange}
        options={RANGES}
        summary={
          w
            ? $t('common.comparedPreviousDaysDataThrough', {
                0: w.start,
                1: w.end,
                2: w.days,
                3: report?.cutoff,
              })
            : undefined
        }
      />
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
                </div>
              );
            })}
          </div>
          <TrendCard report={report!} metric={metric} />
          <div className='grid gap-3 lg:grid-cols-2'>
            <ChannelCard report={report!} />
            <AudienceCard report={report!} />
          </div>
          <ReportCard
            report={report!}
            range={r}
            projectId={project?.id}
            toUrl={pageUrl}
          />
        </>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

// The chosen figure per day against the same day of the period before; the days after the cutoff dotted (初步).
function TrendCard({ report, metric }: { report: Report; metric: MetricKey }) {
  const m = METRICS[metric],
    cutoff = report.cutoff!;
  const points = (report.daily ?? []).map((d, i) => {
    const before = report.previousDaily?.[i];
    const value = m.of(d);
    return {
      date: d.date,
      value: d.date <= cutoff ? value : null,
      fresh: d.date >= cutoff ? value : null,
      previous: before ? m.of(before) : null,
      previousDate: before?.date ?? '',
    };
  });
  const fresh = points.some((p) => p.date > cutoff);
  if (points.filter((p) => p.value !== null).length < 2) return null;
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
            0: fresh ? $t('dataWebsite.dottedPreliminaryAfterCutoff') : '',
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
}: {
  rows: Row[];
  total: number;
  name: (r: Row) => string;
  accent?: (r: Row) => boolean;
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
            <span className='truncate' title={name(r)}>
              {name(r)}
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

function ChannelCard({ report }: { report: Report }) {
  const total = report.totals?.current?.sessions ?? 0;
  const rows = (report.tables?.channel ?? []).slice(0, 7);
  const ai: Row | null = report.ai?.sessions
    ? { key: 'ai', dims: {}, sessions: report.ai.sessions }
    : null;
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
        />
      ) : (
        <p className='text-sm text-muted-foreground'>
          {$t('dataWebsite.noDataSelectedPeriod')}
        </p>
      )}
      {ai ? (
        <div className='border-t border-border pt-2'>
          <Bars
            rows={[ai]}
            total={total}
            name={() => $t('dataWebsite.ofWhichAiAssistants')}
            accent={() => true}
          />
        </div>
      ) : null}
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
