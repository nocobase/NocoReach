import { $t, getCurrentLocale } from '#i18n';
import {
  GA4_TODAY_CACHE_MS,
  GA4_REALTIME_CACHE_MS,
  ga4CacheExpiry,
} from '../../../shared/ga4-cache.js';
// 访问 · 今天 (2026-10-14 user request): GA4's last 30 minutes (实时) and today so far against yesterday and the same
// weekday last week, up to the same hour, per hour, with today's sources. Read from GA4 while the page is open:
// 实时 every minute, 今天 every ten minutes, paused while the tab is hidden. GA4's realtime API has no source, so
// where visitors come from is today's standard data, which lags; the ⓘ says so.
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronRight } from 'lucide-react';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Card } from '#components/ui/card';
import { Button } from '#components/ui/button';
import { InfoTip } from '#components/reach/info-tip';
import { InlineError } from '#components/reach/states';
import { Tag } from '#components/reach/tag';
import { cn } from '#lib/utils';
import { DetailDrawer } from '../detail-drawer';
import { usePolled } from './use-polled';
import {
  change,
  count,
  deviceName,
  regionName,
  type Realtime,
  type Today,
} from './model';

const message = (e: unknown) =>
  e instanceof Error ? e.message : $t('common.tryAgainLater');
function Delta({
  now,
  before,
  label,
}: {
  now: number | null | undefined;
  before: number | null | undefined;
  label: string;
}) {
  const c = change(now ?? null, before ?? null);
  return (
    <p className='flex items-baseline justify-between gap-2 text-xs text-muted-foreground'>
      <span>{label}</span>
      <span className='tabular-nums'>
        {count(before)}
        {c !== null ? (
          <span className={cn('ml-1.5', c >= 0 ? 'nr-up' : 'nr-down')}>
            {c > 0 ? '▲ ' : c < 0 ? '▼ ' : ''}
            {Math.abs(Math.round(c * 1000) / 10)}%
          </span>
        ) : null}
      </span>
    </p>
  );
}

export function TodayCard({
  projectId,
  propertyId,
}: {
  projectId?: number;
  propertyId?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = usePolled<Today>(
    projectId ? `today:${projectId}:${propertyId}` : null,
    () =>
      api.action<Today>('nrDataViews', 'websiteToday', {
        method: 'POST',
        body: { projectId },
        unwrap: 'data',
      }),
    GA4_TODAY_CACHE_MS,
    ga4CacheExpiry,
  );
  const live = usePolled<Realtime>(
    projectId ? `live:${projectId}:${propertyId}` : null,
    () =>
      api.action<Realtime>('nrDataViews', 'websiteRealtime', {
        method: 'POST',
        body: { projectId },
        unwrap: 'data',
      }),
    GA4_REALTIME_CACHE_MS,
    ga4CacheExpiry,
  );
  const t = today.data?.connected ? today.data : null;
  const r = live.data?.connected ? live.data : null;
  if (today.data?.connected === false) return null;
  const weekday = t
    ? new Date(`${t.lastWeekDate}T00:00:00Z`).toLocaleDateString(
        getCurrentLocale(),
        { weekday: 'short', timeZone: 'UTC' },
      )
    : '';
  const through = t ? `${String(t.through).padStart(2, '0')}:00` : '';
  const zone =
    t && t.timeZoneConfirmed === false
      ? $t('dataWebsite.timeZoneUnconfirmed', { 0: t.timeZone })
      : t?.timeZone;
  return (
    <Card className='gap-3 px-4' data-today-card=''>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
        <h2 className='text-sm font-semibold'>{$t('dataWebsite.today')}</h2>
        {t ? (
          <span className='text-xs text-muted-foreground'>
            {t.through
              ? $t('dataWebsite.todayThroughHour', {
                  0: through,
                  1: zone,
                })
              : $t('dataWebsite.todayNotProcessed', { 0: zone })}
          </span>
        ) : null}
        <InfoTip label={$t('dataWebsite.howTodayCounted')}>
          <p>{$t('dataWebsite.todayComparedSameHours')}</p>
          <p>{$t('dataWebsite.realtimeLast30MinutesNote')}</p>
        </InfoTip>
      </div>
      {today.error && !t ? (
        <InlineError>
          {$t('dataWebsite.todayNotLoaded', { 0: message(today.error) })}
        </InlineError>
      ) : null}
      <div className='grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)_16rem]'>
        <div className='flex flex-col gap-4'>
          <div>
            <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
              <span
                aria-hidden='true'
                className={cn(
                  'size-1.5 rounded-full',
                  r ? 'bg-nr-ink-green' : 'bg-muted-foreground',
                )}
              />
              {$t('dataWebsite.last30Minutes')}
            </p>
            <p
              className='text-2xl leading-tight font-semibold tabular-nums'
              data-realtime-users=''
            >
              {r ? count(r.users) : live.error ? '—' : '…'}
            </p>
            {r ? <MinuteBars values={r.perMinute} /> : null}
            {live.error && !r ? (
              <p className='mt-1 text-xs text-nr-ink-red' role='status'>
                {$t('dataWebsite.realtimeNotLoaded', {
                  0: message(live.error),
                })}
              </p>
            ) : null}
            <Button
              variant='link'
              size='sm'
              className='h-auto px-0 text-xs'
              onClick={() => setOpen(true)}
              disabled={!r}
            >
              {$t('dataWebsite.realtimeDetails')}
              <ChevronRight data-icon='inline-end' />
            </Button>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>
              {$t('dataWebsite.viewsToday')}
            </p>
            <p
              className='text-2xl leading-tight font-semibold tabular-nums'
              data-today-views=''
            >
              {t ? count(t.totals.today?.views ?? 0) : '…'}
            </p>
            {t?.through ? (
              <div className='mt-1 flex flex-col gap-0.5'>
                <Delta
                  label={$t('dataWebsite.yesterdaySameHours')}
                  now={t.totals.today?.views}
                  before={t.totals.yesterday?.views}
                />
                <Delta
                  label={$t('dataWebsite.lastWeekdaySameHours', { 0: weekday })}
                  now={t.totals.today?.views}
                  before={t.totals.lastWeek?.views}
                />
                <p className='mt-1 text-xs text-muted-foreground tabular-nums'>
                  {$t('dataWebsite.todaySummary', {
                    0: count(t.totals.today?.sessions),
                    1: count(t.totals.today?.users),
                    2: count(t.totals.today?.keyEvents),
                  })}
                </p>
              </div>
            ) : t ? (
              <p className='text-xs text-muted-foreground'>
                {$t('dataWebsite.yesterdayFullDay', {
                  0: count(t.fullDay.yesterday),
                })}
              </p>
            ) : null}
          </div>
        </div>
        <div className='min-w-0'>
          <p className='mb-1 text-xs text-muted-foreground'>
            {$t('dataWebsite.viewsPerHour')}
          </p>
          {t ? (
            <HourChart today={t} weekday={weekday} />
          ) : (
            <div className='h-44' />
          )}
        </div>
        <div className='min-w-0'>
          <p className='mb-1 text-xs text-muted-foreground'>
            {$t('dataWebsite.todaySources')}
          </p>
          {t?.sources.length ? (
            <ul className='flex flex-col gap-1 text-sm'>
              {t.sources.slice(0, 8).map((s) => (
                <li
                  key={`${s.source}|${s.medium}`}
                  className='flex items-center justify-between gap-2'
                >
                  <span className='flex min-w-0 items-center gap-1.5'>
                    <span
                      className='truncate'
                      title={`${s.source} / ${s.medium}`}
                    >
                      {s.source}
                      <span className='text-muted-foreground'>
                        {' '}
                        / {s.medium || '—'}
                      </span>
                    </span>
                    {s.ai ? <Tag tone='violet'>{s.ai}</Tag> : null}
                  </span>
                  <span className='tabular-nums'>{count(s.sessions)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t ? $t('dataWebsite.todaySourcesNotReady') : '…'}
            </p>
          )}
        </div>
      </div>
      {open && r ? (
        <RealtimeDrawer live={r} onClose={() => setOpen(false)} />
      ) : null}
    </Card>
  );
}

function MinuteBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div
      className='mt-1 flex h-6 items-end gap-px'
      role='img'
      aria-label={$t('dataWebsite.activeUsersPerMinute')}
    >
      {values
        .map((users, i) => ({ ago: values.length - 1 - i, users }))
        .map(({ ago, users }) => (
          <span
            key={ago}
            className='flex-1 rounded-[1px] bg-primary/70'
            style={{
              height: `${Math.max(users ? 8 : 2, (users / max) * 100)}%`,
            }}
          />
        ))}
    </div>
  );
}

function HourChart({ today, weekday }: { today: Today; weekday: string }) {
  // Hours GA4 is still filling in are drawn dashed, joined to the last settled hour.
  const reached = today.reached ?? today.through;
  const data = today.hours.map((h) => ({
    hour: `${String(h.hour).padStart(2, '0')}:00`,
    today: h.hour < today.through ? h.today : null,
    partial:
      h.hour >= today.through - 1 && h.hour < reached && reached > today.through
        ? h.today
        : null,
    yesterday: h.yesterday,
    lastWeek: h.lastWeek,
  }));
  return (
    <div className='nr-chart-box' data-hour-chart=''>
      <ResponsiveContainer width='100%' height={176}>
        <LineChart
          data={data}
          margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray='3 3' vertical={false} />
          <XAxis dataKey='hour' interval={5} fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} width={44} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            isAnimationActive={false}
            type='linear'
            dataKey='today'
            name={$t('dataWebsite.today')}
            stroke='var(--chart-3)'
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Line
            isAnimationActive={false}
            type='linear'
            dataKey='partial'
            name={`${$t('dataWebsite.today')}${$t('dataWebsite.preliminary')}`}
            stroke='var(--chart-3)'
            strokeWidth={2}
            strokeDasharray='4 3'
            dot={false}
            connectNulls={false}
            legendType='none'
          />
          <Line
            isAnimationActive={false}
            type='linear'
            dataKey='yesterday'
            name={$t('dataWebsite.yesterday')}
            stroke='var(--muted-foreground)'
            dot={false}
          />
          <Line
            isAnimationActive={false}
            type='linear'
            dataKey='lastWeek'
            name={$t('dataWebsite.lastWeekday', { 0: weekday })}
            stroke='var(--muted-foreground)'
            strokeDasharray='4 4'
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function List({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; name: string; value: number; sub?: string }[];
}) {
  return (
    <section>
      <h3 className='mb-1 text-sm font-semibold'>{title}</h3>
      {rows.length ? (
        <ul className='flex flex-col text-sm'>
          {rows.map((r) => (
            <li
              key={r.key}
              className='flex items-center justify-between gap-3 border-t border-border py-1.5'
            >
              <span className='min-w-0 truncate' title={r.name}>
                {r.name}
                {r.sub ? (
                  <span className='text-muted-foreground'> · {r.sub}</span>
                ) : null}
              </span>
              <span className='tabular-nums'>{count(r.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {$t('dataWebsite.noneLast30Minutes')}
        </p>
      )}
    </section>
  );
}

function RealtimeDrawer({
  live,
  onClose,
}: {
  live: Realtime;
  onClose: () => void;
}) {
  const minutes = live.perMinute.map((users, i) => ({
    minute:
      i === 29 ? $t('dataWebsite.now') : $t('common.minAgo', { 0: 29 - i }),
    users,
  }));
  const at = new Date(live.fetchedAt).toLocaleTimeString(getCurrentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
  const figures = [
    ['dataWebsite.activeUsers', live.users],
    ['common.viewCount', live.views],
    ['dataWebsite.eventCount', live.eventCount],
    ['common.keyEvents', live.keyEvents],
  ] as const;
  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={$t('dataWebsite.realtimeLast30Minutes')}
      description={$t('dataWebsite.realtimeUpdatedAt', { 0: at })}
    >
      {live.missing?.length ? (
        <p className='mb-3 text-xs text-muted-foreground' role='status'>
          {$t('dataWebsite.realtimePartlyMissing', {
            0: [...new Set(live.missing.map((m) => m.reason))].join('; '),
          })}
        </p>
      ) : null}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {figures.map(([label, v]) => (
          <div key={label}>
            <p className='text-xs text-muted-foreground'>{$t(label)}</p>
            <p className='text-xl font-semibold tabular-nums'>{count(v)}</p>
          </div>
        ))}
      </div>
      <div className='nr-chart-box mt-4'>
        <ResponsiveContainer width='100%' height={120}>
          <BarChart
            data={minutes}
            margin={{ left: 0, right: 0, top: 4, bottom: 0 }}
          >
            <XAxis dataKey='minute' hide />
            <YAxis allowDecimals={false} fontSize={11} width={32} />
            <Tooltip />
            <Bar
              isAnimationActive={false}
              dataKey='users'
              name={$t('dataWebsite.activeUsers')}
              fill='var(--chart-3)'
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className='mt-4 flex flex-col gap-5'>
        <List
          title={$t('dataWebsite.pagesBeingViewed')}
          rows={live.pages.map((p) => ({
            key: p.title,
            name: p.title || $t('dataWebsite.noTitle'),
            value: p.users,
            sub: $t('dataWebsite.pageViewsValue', { 0: count(p.views) }),
          }))}
        />
        <div className='grid gap-5 sm:grid-cols-2'>
          <List
            title={$t('dataWebsite.countryRegion')}
            rows={live.countries.map((c) => ({
              key: c.id || c.name,
              name: regionName(c.id, c.name),
              value: c.users,
            }))}
          />
          <List
            title={$t('dataWebsite.city')}
            rows={live.cities.map((c) => ({
              key: `${c.name}|${c.countryId}`,
              name: c.name,
              sub: regionName(c.countryId, ''),
              value: c.users,
            }))}
          />
          <List
            title={$t('dataWebsite.device')}
            rows={live.devices.map((d) => ({
              key: d.name,
              name: deviceName(d.name),
              value: d.users,
            }))}
          />
          <List
            title={$t('dataWebsite.eventsReport')}
            rows={live.events.map((e) => ({
              key: e.name,
              name: e.name,
              value: e.count,
            }))}
          />
        </div>
      </div>
      <p className='mt-4 text-xs text-muted-foreground'>
        {$t('dataWebsite.realtimeNoSource')}
      </p>
    </DetailDrawer>
  );
}
