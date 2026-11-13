import { Fragment, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { $legacyText, $t } from '#i18n';
import { InfoTip } from '#components/reach/info-tip';
import { SourceLogo } from '#components/reach/source-logo';
import type { Tone } from '#components/reach/tag';
import { Button } from '#components/ui/button';
import { useBusinessAccess } from '#hooks/use-business-access';
import {
  formatDate,
  formatRelative,
  joinClauses,
  withDetail,
} from '#lib/format';
import { toast } from '#lib/toast';
import { cn } from '#lib/utils';
import { playbookNameOf } from '../playbook-model';
import { GrowthTags } from '../strategy/growth';
import { figureValue, say } from '../strategy/growth-text';
import {
  errorText,
  hotHeadlineText,
  opportunityNo,
  standingText,
  taskNo,
  workshopRequest,
  type Handed,
  type HotItem,
  type WorkshopView,
} from './model.js';

// Trending now (homepage v5, 2026-11-13 user decision, ui-references/content-workshop-2026-11-12/homepage-v5.png): the
// only recommendation. It lists Opportunities' live Trending now opportunities the workshop has not handled yet, as
// cards saying what is hot with the growth's own numbers, its discussions, the site's material and where it suits. Adapt
// now opens step 2 filled with it; Skip takes it off this list only. The section is left out when nothing is listed.

export function HotTopics({
  view,
  projectId,
  onChange,
}: {
  view: WorkshopView;
  projectId: string;
  onChange: () => void;
}) {
  const { can } = useBusinessAccess('nrWorkshop.skip', projectId);
  // Skipped here, before the page loads its view again.
  const [gone, setGone] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const items = view.hot.filter((h) => !h.away && !gone.includes(h.id));
  if (!items.length) return null;
  const skip = async (h: HotItem) => {
    setBusy(h.id);
    try {
      await workshopRequest('skip', projectId, { opportunityId: h.id });
      setGone((ids) => [...ids, h.id]);
      toast.success(() =>
        $t('workshop.hot.skipped', {
          0: opportunityNo(h.no) || hotHeadlineText(h),
        }),
      );
      onChange();
    } catch (e) {
      toast.error(() => errorText(e, $t('workshop.hot.skipFailed')));
    } finally {
      setBusy('');
    }
  };
  return (
    <section className='space-y-3' aria-labelledby='workshop-hot'>
      <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-2'>
        <div className='flex items-center gap-2'>
          <h2 id='workshop-hot' className='font-heading text-sm font-semibold'>
            {$t('growth.category.trending')}
          </h2>
          <span className='text-xs text-muted-foreground tabular-nums'>
            {items.length}
          </span>
          <InfoTip
            label={$t('common.what', { 0: $t('growth.category.trending') })}
          >
            <span className='block max-w-sm'>{$t('workshop.hot.info')}</span>
          </InfoTip>
        </div>
        <span className='text-xs text-muted-foreground'>
          {$t('workshop.hotUpdated')}
        </span>
      </div>
      <div className='grid gap-3 lg:grid-cols-2' data-hot-list=''>
        {items.map((h) => (
          <HotCard
            key={h.id}
            h={h}
            skipping={busy === h.id}
            onSkip={can ? () => void skip(h) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

const strong = (v: ReactNode, className?: string) => (
  <b
    className={cn(
      'text-base font-semibold text-foreground tabular-nums',
      className,
    )}
  >
    {v}
  </b>
);

/** Where a hot item suits: X, LinkedIn, then the subreddits and Hacker News its discussions are on. */
const suitsOf = (h: HotItem) => [
  { logo: 'x', name: 'X' },
  { logo: 'linkedin', name: 'LinkedIn' },
  ...h.communities.subreddits.map((s) => ({
    logo: 'reddit',
    name: `r/${s.subreddit}`,
  })),
  ...(h.communities.hn ? [{ logo: 'hackernews', name: 'Hacker News' }] : []),
];

/** A handed-off task's playbook in the interface language: built-in names come from the server untranslated. */
const handedName = (t: Handed) =>
  t.playbook
    ? $legacyText(t.playbook)
    : t.playbookId
      ? playbookNameOf(t.playbookId)
      : '';

function HotCard({
  h,
  skipping,
  onSkip,
}: {
  h: HotItem;
  skipping: boolean;
  onSkip?: () => void;
}) {
  const navigate = useNavigate();
  const no = opportunityNo(h.no);
  const found = h.firstSeenAt || h.foundAt;
  return (
    <article
      className='flex min-w-0 flex-col gap-2.5 rounded-lg border bg-card p-4 text-card-foreground'
      data-hot={h.kind}
      aria-label={hotHeadlineText(h)}
    >
      <div className='flex items-start gap-3'>
        <div className='min-w-0 flex-1 space-y-1.5'>
          <div className='flex flex-wrap items-center gap-1.5'>
            <GrowthTags growth={{ kind: h.kind, category: 'trending' }} />
            <Link
              to={`/opportunities?tab=pending&item=${encodeURIComponent(h.id)}`}
              className='text-xs text-muted-foreground tabular-nums hover:text-foreground hover:underline'
              data-opportunity-link=''
            >
              {found
                ? $t('workshop.hot.found', { 0: no, 1: formatDate(found) })
                : no}
            </Link>
          </div>
          <h3 className='text-sm leading-snug font-semibold'>
            {hotHeadlineText(h)}
          </h3>
        </div>
        {h.chart ? (
          <MiniChart
            points={h.chart.points}
            bars={h.chart.unit === 'week'}
            label={say(h.chart.label)}
            tone='orange'
          />
        ) : null}
      </div>
      {h.figures.length ? (
        <p className='flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-xs text-muted-foreground'>
          {h.figures.map((f, i) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- the figures of one growth are fixed
            <Fragment key={i}>
              {i ? <span aria-hidden='true'>·</span> : null}
              <span>{say(f.label)}</span>
              {strong(
                figureValue(f),
                f.format === 'change' && typeof f.value === 'number'
                  ? f.value > 0
                    ? 'text-nr-ink-orange'
                    : undefined
                  : undefined,
              )}
              {f.detail ? <span>{say(f.detail)}</span> : null}
            </Fragment>
          ))}
          {h.logos.length ? (
            <span className='ml-1 inline-flex items-center gap-1 self-center'>
              {h.logos.map((l) => (
                <SourceLogo key={l} source={l} size='xs' />
              ))}
            </span>
          ) : null}
        </p>
      ) : null}
      {h.discussions.length ? (
        <ul className='m-0 flex list-none flex-col gap-1 p-0 text-xs'>
          {h.discussions.map((d, i) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- two fixed rows of one growth
            <li key={i} className='flex min-w-0 items-center gap-1.5'>
              <SourceLogo source={d.logo} size='xs' />
              {d.url ? (
                <a
                  href={d.url}
                  target='_blank'
                  rel='noreferrer'
                  className='min-w-0 truncate hover:underline'
                  title={d.title}
                >
                  {d.title}
                </a>
              ) : (
                <span className='min-w-0 truncate' title={d.title}>
                  {d.title}
                </span>
              )}
              <span className='shrink-0 text-muted-foreground'>
                {[
                  d.place,
                  d.heat ? say(d.heat) : '',
                  d.date ? formatRelative(d.date) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {h.material.length ? (
        <p className='text-xs text-muted-foreground' data-material=''>
          {$t('common.labelValue', {
            0: $t('workshop.hot.materialLabel'),
            1: '',
          })}
          {h.material.map((m, i) => (
            <Fragment key={m.url}>
              {i ? ' · ' : null}
              <a
                href={m.url}
                target='_blank'
                rel='noreferrer'
                className='text-foreground hover:underline'
              >
                {m.title}
              </a>
            </Fragment>
          ))}
        </p>
      ) : null}
      {h.handed.length ? (
        <p className='text-xs text-muted-foreground' data-handed=''>
          {$t('workshop.hot.handed', {
            0: h.handed
              .map((t) =>
                withDetail(
                  handedName(t) || $t('workshop.hot.task'),
                  joinClauses(
                    [taskNo(t.no), standingText(t.standing)].filter(Boolean),
                  ),
                ),
              )
              .join($t('common.entrySeparator')),
          })}
        </p>
      ) : null}
      {/* The buttons stay on the right; a long list of places wraps beside them. */}
      <div className='mt-auto flex items-center gap-2 border-t pt-3'>
        <span className='flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
          {$t('common.labelValue', { 0: $t('workshop.hot.suits'), 1: '' })}
          {suitsOf(h).map((s) => (
            <span
              key={s.name}
              className='inline-flex items-center gap-1 text-foreground'
            >
              <SourceLogo source={s.logo} size='xs' />
              {s.name}
            </span>
          ))}
        </span>
        <Button
          size='sm'
          variant='ghost'
          className='shrink-0'
          disabled={!onSkip || skipping}
          onClick={onSkip}
          data-skip=''
        >
          {$t('workshop.hot.skip')}
        </Button>
        <Button
          size='sm'
          className='shrink-0'
          onClick={() =>
            void navigate({
              pathname: 'new',
              search: `?${new URLSearchParams({ opportunity: h.id })}`,
            })
          }
        >
          {$t('workshop.hot.adapt')}
        </Button>
      </div>
    </article>
  );
}

const INK: Partial<Record<Tone, string>> = {
  orange: 'var(--nr-ink-orange)',
};

/**
 * A small chart without axes, its meaning in its label: bars for counts per week, a line with a wash for anything
 * else (monthly searches, a repository's stars by day). Newest last.
 */
function MiniChart({
  points,
  bars = false,
  label,
  tone,
}: {
  points: number[];
  bars?: boolean;
  label: string;
  tone: Tone;
}) {
  if (points.length < 2) return null;
  const colour = INK[tone] || 'var(--muted-foreground)';
  const max = Math.max(...points),
    min = bars ? 0 : Math.min(...points),
    span = max - min || 1;
  const y = (v: number) => 30 - ((v - min) / span) * 26;
  return (
    <span
      className='block h-8 w-28 shrink-0'
      role='img'
      aria-label={label}
      title={label}
      data-chart={bars ? 'bars' : 'line'}
    >
      <svg
        viewBox='0 0 100 32'
        preserveAspectRatio='none'
        className='block size-full'
      >
        {bars ? (
          points.map((v, i) => {
            const w = 100 / points.length;
            return (
              <rect
                // eslint-disable-next-line @eslint-react/no-array-index-key -- one bar per period, in order
                key={i}
                x={i * w + w * 0.15}
                width={w * 0.7}
                y={Math.min(y(v), 30)}
                height={Math.max(30 - y(v), 1.5)}
                fill={colour}
                fillOpacity={0.35 + (0.65 * i) / (points.length - 1)}
              />
            );
          })
        ) : (
          <Line points={points} y={y} colour={colour} />
        )}
      </svg>
    </span>
  );
}

function Line({
  points,
  y,
  colour,
}: {
  points: number[];
  y: (v: number) => number;
  colour: string;
}) {
  const step = 100 / (points.length - 1);
  const d = points
    .map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
  return (
    <>
      <polygon points={`0,32 ${d} 100,32`} fill={colour} fillOpacity={0.1} />
      <polyline
        points={d}
        fill='none'
        stroke={colour}
        strokeWidth={1.5}
        vectorEffect='non-scaling-stroke'
      />
    </>
  );
}
