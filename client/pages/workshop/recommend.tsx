import { Fragment, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { FileText, Flame } from 'lucide-react';
import { $legacyText, $t, $tj } from '#i18n';
import { InfoTip } from '#components/reach/info-tip';
import { Segmented } from '#components/reach/segmented';
import { EmptyState } from '#components/reach/states';
import { SourceLogo } from '#components/reach/source-logo';
import { Tag, type Tone } from '#components/reach/tag';
import { Button } from '#components/ui/button';
import {
  formatChange,
  formatChangeSize,
  formatCount,
  formatDate,
  formatRelative,
  joinClauses,
  withDetail,
} from '#lib/format';
import { cn } from '#lib/utils';
import type { ArticleReason } from '../../../shared/workshop-recommend.js';
import { TOPICS_EDIT_PATH } from '../followed-topics-scope';
import { playbookNameOf } from '../playbook-model';
import { GrowthTags } from '../strategy/growth';
import { figureValue, say } from '../strategy/growth-text';
import {
  hotHeadlineText,
  madeList,
  opportunityNo,
  standingText,
  taskNo,
  type Handed,
  type HotItem,
  type Made,
  type Suggested,
  type WorkshopView,
} from './model.js';

// Recommendations (v4, 2026-11-13 user decision, ui-references/content-workshop-2026-11-12/recommend-v4.png): two tabs.
// Trending now lists Opportunities' live Trending now opportunities as cards, each saying what is hot with the growth's
// own numbers, its discussions, the site's material and where it suits; Adapt now opens step 2 filled with it. Site
// articles lists the blog articles worth adapting now with their reasons and clicks; an adapted one comes back after a
// while to be told from a new angle. Every reason and number is the server's, from data already collected.

type Tab = 'hot' | 'articles';

export function Recommendations({ view }: { view: WorkshopView }) {
  const [tab, setTab] = useState<Tab>('hot');
  const count = (label: string, n: number) => (
    <>
      {label}
      <span className='text-xs text-muted-foreground tabular-nums'>{n}</span>
    </>
  );
  return (
    <section className='space-y-3' aria-labelledby='workshop-recommended'>
      <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-2'>
        <div className='flex items-center gap-2'>
          <h2
            id='workshop-recommended'
            className='font-heading text-sm font-semibold'
          >
            {$t('workshop.recommended')}
          </h2>
          <InfoTip label={$t('common.what', { 0: $t('workshop.recommended') })}>
            <span className='flex max-w-sm flex-col gap-1.5'>
              <span>{$t('workshop.recommendedInfoHot')}</span>
              <span>{$t('workshop.recommendedInfoArticles')}</span>
              <span>{$t('workshop.recommendedInfoAgain')}</span>
            </span>
          </InfoTip>
          <Segmented
            className='ml-1'
            label={$t('workshop.recommended')}
            value={tab}
            onChange={(id) => setTab(id as Tab)}
            options={[
              {
                id: 'hot',
                label: count($t('growth.category.trending'), view.hot.length),
              },
              {
                id: 'articles',
                label: count(
                  $t('workshop.siteArticles'),
                  view.suggested.length,
                ),
              },
            ]}
          />
        </div>
        <span className='text-xs text-muted-foreground' data-note={tab}>
          {tab === 'hot'
            ? $t('workshop.hotUpdated')
            : view.dataThrough
              ? $t('workshop.dataThrough', { 0: formatDate(view.dataThrough) })
              : $t('workshop.noSearchData')}
        </span>
      </div>
      {tab === 'hot' ? <HotList view={view} /> : <ArticleList view={view} />}
    </section>
  );
}

function HotList({ view }: { view: WorkshopView }) {
  if (!view.hot.length)
    return (
      <EmptyState
        icon={<Flame />}
        title={$t('workshop.hot.empty')}
        description={$t('workshop.hot.emptyHint')}
        action={
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to={TOPICS_EDIT_PATH} data-edit-topics='' />}
          >
            {$t('projectKnowledge.followedTopics')}
          </Button>
        }
      />
    );
  return (
    <div className='grid gap-3 lg:grid-cols-2' data-hot-list=''>
      {view.hot.map((h) => (
        <HotCard key={h.id} h={h} />
      ))}
    </div>
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

/**
 * What Content workshop already made from a hot item, by status: "Already adapted into X posts, LinkedIn post (T-59,
 * T-60, In progress)". Closed tasks are left out; nothing when none is left.
 */
function madeLine(h: HotItem): string {
  const groups = new Map<string, { names: string[]; nos: string[] }>();
  for (const m of [...h.made].sort((a, b) => (a.no ?? 0) - (b.no ?? 0))) {
    if (m.standing === 'closed') continue;
    const g = groups.get(m.standing) || { names: [], nos: [] };
    const name = madeList([m])[0];
    if (name && !g.names.includes(name)) g.names.push(name);
    if (m.no) g.nos.push(taskNo(m.no));
    groups.set(m.standing, g);
  }
  if (!groups.size) return '';
  return $t('workshop.hot.made', {
    0: [...groups]
      .map(([standing, g]) =>
        withDetail(
          g.names.join($t('common.listSeparator')),
          joinClauses(
            [
              g.nos.join($t('common.listSeparator')),
              standingText(standing as Made['standing']),
            ].filter(Boolean),
          ),
        ),
      )
      .join($t('common.entrySeparator')),
  });
}

/** A handed-off task's playbook in the interface language: built-in names come from the server untranslated. */
const handedName = (t: Handed) =>
  t.playbook
    ? $legacyText(t.playbook)
    : t.playbookId
      ? playbookNameOf(t.playbookId)
      : '';

function HotCard({ h }: { h: HotItem }) {
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
      {madeLine(h) ? (
        <p className='text-xs text-muted-foreground' data-made=''>
          {madeLine(h)}
        </p>
      ) : null}
      {/* The button stays on the right; a long list of places wraps beside it. */}
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

const REASON: Record<ArticleReason, [Tone, string]> = {
  rising: ['green', 'workshop.reason.rising'],
  new: ['blue', 'workshop.reason.new'],
  steady: ['amber', 'workshop.reason.steady'],
};

function ArticleList({ view }: { view: WorkshopView }) {
  const navigate = useNavigate();
  if (!view.articles.length)
    return (
      <EmptyState
        icon={<FileText />}
        title={$t('workshop.noArticles')}
        description={$t('workshop.noArticlesHint')}
        action={
          <Button
            variant='outline'
            onClick={() => void navigate('/connections?source=site')}
          >
            {$t('common.connectWebsiteContent')}
          </Button>
        }
      />
    );
  if (!view.suggested.length)
    return (
      <EmptyState
        icon={<FileText />}
        title={$t('workshop.noSuggested')}
        description={$t('workshop.noSuggestedHint')}
      />
    );
  return (
    <div
      className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'
      data-article-list=''
    >
      {view.suggested.map((a) => (
        <ArticleCard key={a.url} a={a} />
      ))}
    </div>
  );
}

function ArticleCard({ a }: { a: Suggested }) {
  const navigate = useNavigate();
  const reason = a.reasons[0];
  const steady = reason === 'steady';
  const change =
    a.previous7 > 0 ? (a.clicks7 - a.previous7) / a.previous7 : null;
  const adapt = () =>
    void navigate({
      pathname: 'new',
      search: `?${new URLSearchParams({ url: a.url, title: a.title })}`,
    });
  const since = a.last?.since ?? 0;
  const footer = a.last
    ? $t('workshop.lastAdapted', {
        0: formatDate(a.last.at),
        1: madeList(a.last.made).join($t('common.listSeparator')),
      })
    : $t('workshop.notMade');
  return (
    <article
      className='flex min-w-0 flex-col gap-2.5 rounded-lg border bg-card p-4 text-card-foreground'
      data-recommended={reason}
    >
      <div className='flex flex-wrap items-center gap-1.5'>
        {reason ? (
          <Tag tone={REASON[reason][0]}>{$t(REASON[reason][1])}</Tag>
        ) : null}
        {a.cited ? (
          <Tag tone='violet'>{$t('workshop.reason.cited')}</Tag>
        ) : null}
      </div>
      <a
        href={a.url}
        target='_blank'
        rel='noreferrer'
        className='line-clamp-2 text-sm leading-snug font-semibold hover:underline'
        title={a.title}
      >
        {a.title}
      </a>
      <div className='flex items-end gap-3'>
        <p className='min-w-0 flex-1 text-xs text-muted-foreground'>
          {steady ? (
            $tj('workshop.clicks12m', { 0: strong(formatCount(a.clicks12m)) })
          ) : (
            <>
              {reason === 'new' && a.published
                ? `${$t('workshop.publishedOn', { 0: formatDate(a.published) })} · `
                : null}
              {$tj('workshop.clicks7', { 0: strong(formatCount(a.clicks7)) })}
              {reason === 'rising' && change !== null ? (
                <b className='ml-1.5 font-semibold text-nr-ink-green tabular-nums'>
                  {formatChange(change).replace(' ', '')}
                </b>
              ) : null}
            </>
          )}
          {since > 0 ? (
            <span className='mt-1 block' data-since=''>
              {$tj('workshop.sinceClicks', {
                0: (
                  <b className='font-semibold text-nr-ink-green tabular-nums'>
                    +{formatChangeSize(since)}
                  </b>
                ),
              })}
            </span>
          ) : null}
        </p>
        {a.spark ? (
          <MiniChart
            points={a.spark.points}
            label={$t(
              a.spark.unit === 'week'
                ? 'workshop.sparkWeeks'
                : 'workshop.sparkMonths',
            )}
            tone='green'
          />
        ) : null}
      </div>
      <div className='mt-auto flex items-center gap-2 border-t pt-3'>
        {/* One line, so the footers of a row line up; the whole text stays in its title. */}
        <span
          className='min-w-0 flex-1 truncate text-xs text-muted-foreground'
          title={footer}
        >
          {footer}
        </span>
        <Button size='sm' variant='outline' onClick={adapt}>
          {a.last ? $t('workshop.adaptAgain') : $t('workshop.adapt')}
        </Button>
      </div>
    </article>
  );
}

const INK: Partial<Record<Tone, string>> = {
  orange: 'var(--nr-ink-orange)',
  green: 'var(--nr-ink-green)',
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
