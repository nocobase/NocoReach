import { $t, getCurrentLocale } from '#i18n';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Link } from 'react-router';
import { cn } from '#lib/utils';
import { RequestBlock, type RequestState } from './request-block';
import { percent, type MetricItem } from './insights-view';

// Insights' numbers after Plausible and Vercel Web Analytics (2026-10-22 user-approved design): one card with the
// metrics as tabs across the top and one large chart of the selected metric's days below, the previous period dashed.
// The page's one visual focus; the rest of the page is text.

const number = (i: MetricItem) =>
  `${i.signed && i.value! > 0 ? '+' : ''}${i.value!.toLocaleString(getCurrentLocale())}`;
const arrow = (change: number) =>
  `${change >= 0 ? '↑' : '↓'} ${percent(change)}`;
const known = (v: number | null): v is number => v !== null;

/** The element's width, followed as the page resizes (the chart is drawn in pixels so its text never stretches). */
function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** A round top for the axis: 1, 2 or 5 times a power of ten, in three steps. */
function axisTop(max: number) {
  if (max <= 0) return { top: 3, step: 1 };
  const raw = max / 3,
    p = 10 ** Math.floor(Math.log10(raw)),
    step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
  return { top: step * 3, step };
}

const HEIGHT = 220,
  PAD = { top: 10, right: 10, bottom: 26, left: 44 };

/** The selected metric's days as an area, the previous period's days dashed, gridlines with y labels and dates on x. */
function Chart({ item, days }: { item: MetricItem; days: number }) {
  const [ref, width] = useWidth(),
    locale = getCurrentLocale();
  const cur = item.series ?? [],
    prev = item.previous ?? [],
    hasPrev = prev.filter((p) => known(p.value)).length >= 2,
    drawn = cur.filter((p) => known(p.value)).length >= 2;
  const legend = (
    <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'>
      <span className='inline-flex items-center gap-1.5'>
        <i aria-hidden='true' className='w-4 border-t-2 border-nr-ink-violet' />
        {$t('strategy.chartCurrent', { 0: days })}
      </span>
      {hasPrev ? (
        <span className='inline-flex items-center gap-1.5'>
          <i
            aria-hidden='true'
            className='w-4 border-t-2 border-dashed border-muted-foreground/50'
          />
          {$t('strategy.chartPrevious', { 0: days })}
        </span>
      ) : (
        <span>{$t('strategy.chartPreviousMissing', { 0: days })}</span>
      )}
      <Link className='ml-auto hover:text-foreground' to={item.to}>
        {$t('strategy.chartDaily', { 0: item.label })}
      </Link>
    </div>
  );
  if (!drawn)
    return (
      <div className='flex flex-col gap-2 px-5 pt-3 pb-4'>
        {legend}
        <p className='py-10 text-center text-sm text-muted-foreground'>
          {$t('strategy.noDailyData')}
        </p>
      </div>
    );
  const values = [...cur, ...(hasPrev ? prev : [])]
      .map((p) => p.value)
      .filter(known),
    { top, step } = axisTop(Math.max(0, ...values)),
    n = Math.max(cur.length, 2),
    plotW = Math.max(0, width - PAD.left - PAD.right),
    plotH = HEIGHT - PAD.top - PAD.bottom,
    x = (i: number) => PAD.left + (i * plotW) / (n - 1),
    y = (v: number) => PAD.top + (1 - v / top) * plotH,
    line = (pts: typeof cur) =>
      pts.flatMap((p, i) =>
        known(p.value) ? [`${x(i).toFixed(1)},${y(p.value).toFixed(1)}`] : [],
      ),
    curLine = line(cur),
    lastIndex = cur.map((p) => known(p.value)).lastIndexOf(true),
    firstIndex = cur.findIndex((p) => known(p.value)),
    compact = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }),
    ticks = [0, step, step * 2, step * 3],
    // Seven dates across a wide chart, four on a phone, so the labels never run together.
    steps = width < 520 ? 3 : 6,
    dateTicks = Array.from({ length: steps + 1 }, (_, k) =>
      Math.round((k * (n - 1)) / steps),
    ),
    dateOf = (iso?: string) =>
      iso
        ? new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
            month: 'numeric',
            day: 'numeric',
          })
        : '';
  return (
    <div className='flex flex-col gap-2 px-5 pt-3 pb-2'>
      {legend}
      <div ref={ref} className='w-full'>
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role='img'
            aria-label={$t('strategy.chartDaily', { 0: item.label })}
            className='block overflow-visible'
          >
            <defs>
              <linearGradient id='nr-metric-fill' x1='0' y1='0' x2='0' y2='1'>
                <stop
                  offset='0'
                  stopColor='var(--nr-ink-violet)'
                  stopOpacity='0.14'
                />
                <stop
                  offset='1'
                  stopColor='var(--nr-ink-violet)'
                  stopOpacity='0'
                />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke='var(--border)'
                  strokeWidth='1'
                />
                <text
                  x={PAD.left - 8}
                  y={y(t) + 4}
                  textAnchor='end'
                  className='fill-muted-foreground text-[11px]'
                >
                  {compact.format(t)}
                </text>
              </g>
            ))}
            {dateTicks.map((i, k) => (
              <text
                key={cur[i]?.date ?? `tick-${i}`}
                x={x(i)}
                y={HEIGHT - 6}
                textAnchor={k === 0 ? 'start' : k === steps ? 'end' : 'middle'}
                className='fill-muted-foreground text-[11px]'
              >
                {dateOf(cur[i]?.date)}
              </text>
            ))}
            {hasPrev && (
              <polyline
                points={line(prev).join(' ')}
                fill='none'
                stroke='var(--muted-foreground)'
                strokeOpacity='0.5'
                strokeWidth='1.5'
                strokeDasharray='4 4'
              />
            )}
            <polygon
              points={`${x(firstIndex).toFixed(1)},${y(0)} ${curLine.join(' ')} ${x(lastIndex).toFixed(1)},${y(0)}`}
              fill='url(#nr-metric-fill)'
            />
            <polyline
              points={curLine.join(' ')}
              fill='none'
              stroke='var(--nr-ink-violet)'
              strokeWidth='2'
              strokeLinejoin='round'
            />
            <circle
              cx={x(lastIndex)}
              cy={y(cur[lastIndex].value!)}
              r='3.5'
              fill='var(--nr-ink-violet)'
            />
          </svg>
        )}
      </div>
    </div>
  );
}

/**
 * The key numbers (at most five with a value) as tabs, Search clicks first, and the selected one's days as a chart.
 * The read has its own loading, failure and retry.
 */
export function MetricChart({
  metrics,
  overview,
  days,
}: {
  metrics: MetricItem[];
  overview: RequestState;
  days: number;
}) {
  const items = metrics.filter((i) => i.value != null).slice(0, 5),
    [selected, setSelected] = useState(0),
    index = Math.min(selected, items.length - 1),
    item = items[index];
  return (
    <RequestBlock
      compact
      title={$t('strategy.keyMetrics')}
      request={overview}
      empty={!items.length}
      emptyText={$t('strategy.noDataYet')}
    >
      <div className='min-w-0 flex-1 overflow-hidden rounded-xl border bg-card text-card-foreground'>
        <div
          role='tablist'
          aria-label={$t('strategy.keyMetrics')}
          className='flex overflow-x-auto border-b'
        >
          {items.map((i, k) => (
            <button
              key={i.label}
              type='button'
              role='tab'
              aria-selected={k === index}
              onClick={() => setSelected(k)}
              className={cn(
                'relative min-w-36 flex-1 border-r px-4 py-3 text-left transition-colors last:border-r-0 hover:bg-muted/40 sm:px-5',
                k === index &&
                  'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-foreground',
              )}
            >
              <span className='block text-xs text-muted-foreground'>
                {i.label}
              </span>
              <span className='mt-0.5 flex flex-wrap items-baseline gap-x-1.5'>
                <span
                  className={cn(
                    'text-2xl font-semibold tabular-nums',
                    k === index ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {number(i)}
                </span>
                {i.change == null ? (
                  <span className='text-xs text-muted-foreground'>
                    {$t('strategy.noComparisonYet')}
                  </span>
                ) : (
                  <span
                    className={cn(
                      'text-xs font-medium tabular-nums',
                      i.change >= 0 ? 'text-nr-ink-green' : 'text-nr-ink-red',
                    )}
                  >
                    {arrow(i.change)}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
        {item && <Chart key={item.label} item={item} days={days} />}
      </div>
    </RequestBlock>
  );
}
