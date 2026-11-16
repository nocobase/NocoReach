import { $t } from '#i18n';
import { Fragment, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRightIcon } from 'lucide-react';
import {
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartBar,
  ChartLegend,
  TrendChart,
} from '#components/reach/chart-legend';
import { Tag } from '#components/reach/tag';
import { CATEGORY } from './growth-category';
import { InfoTip } from '#components/reach/info-tip';
import { ScoreBadge } from '#components/seo/score-badge';
import { useLinkInMenu } from '#components/app-shell/nav-sources';
import {
  formatChange,
  formatCount,
  formatDate,
  formatPercent,
} from '#lib/format';
import { cn } from '#lib/utils';
import {
  TOPIC_SOURCES,
  type DiscussionWeek,
  type EvidenceCell,
  type EvidenceColumn,
  type EvidenceTable,
  type Growth,
  type GrowthCategory,
  type GrowthFigure,
  type GrowthKind,
  type GrowthText,
  type TopicSource,
} from '../../../shared/growth.js';

// A growth opportunity's parts on Opportunities (2026-11-10, ui-references/growth-opportunities-2026-11-10): its category
// and kind as its two tags, its size as a row of figures (Growth potential), and the rows behind it (Evidence) with the
// page that lists all of them. The server computed every number (shared/growth.ts).

const KIND: Record<GrowthKind, string> = {
  rising: 'growth.kind.rising',
  'new-query': 'growth.kind.newQuery',
  'topic-heat': 'growth.kind.topicHeat',
  'new-repo': 'growth.kind.newRepo',
  'demand-gap': 'growth.kind.demandGap',
  'competitor-gap': 'growth.kind.competitorGap',
  'not-mentioned': 'growth.kind.notMentioned',
  'cited-sources': 'growth.kind.citedSources',
  'competitor-launch': 'growth.kind.competitorLaunch',
  'near-first': 'growth.kind.nearFirst',
  'low-ctr': 'growth.kind.lowCtr',
  uncited: 'growth.kind.uncited',
  'rank-drop': 'growth.kind.rankDrop',
  'click-drop': 'growth.kind.clickDrop',
  'stale-page': 'growth.kind.stalePage',
  'thin-page': 'growth.kind.thinPage',
  'ai-dropped': 'growth.kind.aiDropped',
  'page-issue': 'growth.kind.pageIssue',
  'topic-rise': 'growth.kind.topicRise',
  'new-topic': 'growth.kind.newTopic',
  'hot-discussion': 'growth.kind.hotDiscussion',
  'hot-video': 'growth.kind.hotVideo',
  'asked-often': 'growth.kind.askedOften',
  'other-market': 'growth.kind.otherMarket',
  'site-search': 'growth.kind.siteSearch',
  'people-also-ask': 'growth.kind.peopleAlsoAsk',
  'link-gap': 'growth.kind.linkGap',
};
const say = (text?: GrowthText) => (text ? $t(text.key, text.params) : '');

/** The category tag, as the list, the detail and Insights' decisions show it. */
export function CategoryTag({
  category,
}: {
  category: GrowthCategory;
}): ReactElement {
  const [tone, label] = CATEGORY[category];
  return (
    <Tag tone={tone} data-growth-category={category}>
      {label()}
    </Tag>
  );
}

/** Its category, then its kind: "Trending now" "Rising searches". */
export function GrowthTags({ growth }: { growth: Growth }): ReactElement {
  return (
    <>
      <CategoryTag category={growth.category} />
      <Tag tone='grey' data-growth-kind={growth.kind}>
        {$t(KIND[growth.kind])}
      </Tag>
    </>
  );
}

const figureValue = (f: GrowthFigure): string =>
  typeof f.value !== 'number'
    ? f.format === 'date'
      ? formatDate(f.value)
      : f.value
    : f.format === 'percent'
      ? formatPercent(f.value)
      : f.format === 'change'
        ? formatChange(f.value)
        : f.format === 'position'
          ? formatCount(f.value, 1)
          : formatCount(f.value);

/** A subreddit or a path ("r/projectmanagement", "/docs/import") wraps after a slash rather than inside a word. */
const slashBreaks = (s: string): ReactNode =>
  s.includes('/')
    ? s.split('/').map((part, j) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- the parts of one fixed string
        <Fragment key={j}>
          {j > 0 ? (
            <>
              /<wbr />
            </>
          ) : null}
          {part}
        </Fragment>
      ))
    : s;

/** Growth potential: up to four figures side by side, each a label over a number and its unit. */
export function GrowthRow({ growth }: { growth: Growth }): ReactElement {
  const estimated = growth.figures.some((f) => f.estimate);
  return (
    <section
      className='flex flex-col gap-1.5'
      aria-label={$t('growth.title')}
      data-growth={growth.kind}
    >
      <h3 className='flex items-center gap-1 text-xs font-medium text-muted-foreground'>
        {$t('growth.title')}
        {estimated ? (
          <InfoTip label={$t('growth.estimateHelpLabel')}>
            <p>{$t('growth.estimateHelp')}</p>
          </InfoTip>
        ) : null}
      </h3>
      <dl className='grid grid-cols-2 rounded-lg border sm:grid-cols-4'>
        {growth.figures.map((f, i) => (
          <div
            // eslint-disable-next-line @eslint-react/no-array-index-key -- the figures are fixed for a growth and never reorder
            key={i}
            className={cn(
              'flex min-w-0 flex-col gap-0.5 px-3 py-2',
              i > 0 && 'sm:border-l',
              i % 2 === 1 && 'max-sm:border-l',
              i > 1 && 'max-sm:border-t',
            )}
          >
            <dt className='text-xs text-muted-foreground'>{say(f.label)}</dt>
            <dd className='flex min-w-0 flex-wrap items-baseline gap-x-1'>
              {/* Nothing is cut short: a name (a domain, a version) is set smaller, and it and the unit wrap. */}
              <span
                className={cn(
                  typeof f.value === 'number'
                    ? 'shrink-0 text-lg font-semibold tabular-nums'
                    : 'max-w-full py-1 text-sm leading-5 font-medium break-words',
                )}
              >
                {typeof f.value === 'number'
                  ? figureValue(f)
                  : slashBreaks(figureValue(f))}
              </span>
              {f.detail ? (
                <span className='max-w-full text-xs text-muted-foreground break-words'>
                  {/* A list ("ChatGPT 15 · AI Overviews 11") wraps between its items, not inside one. */}
                  {say(f.detail)
                    .split(' · ')
                    .map((part, j) => (
                      // eslint-disable-next-line @eslint-react/no-array-index-key -- the parts of one fixed string
                      <Fragment key={j}>
                        {j > 0 ? ' · ' : ''}
                        <span className='inline-block max-w-full'>{part}</span>
                      </Fragment>
                    ))}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const NUMERIC = new Set([
  'count',
  'delta',
  'percent',
  'position',
  'difficulty',
  'change',
]);
const PLATFORM: Record<string, () => string> = {
  chat_gpt: () => 'ChatGPT',
  google: () => $t('common.googleAiOverviews'),
};
function cellText(value: EvidenceCell, column: EvidenceColumn): ReactNode {
  if (value == null || value === '') return '—';
  // A list (products, sources, competitors) breaks between its items, never inside one.
  if (Array.isArray(value))
    return value.length
      ? value.map((v, i) => (
          <Fragment key={typeof v === 'string' ? v : v.name}>
            {i > 0 ? ' · ' : ''}
            <span className='whitespace-nowrap'>
              {typeof v === 'string'
                ? v
                : $t('growth.rankOf', { 0: v.name, 1: v.rank })}
            </span>
          </Fragment>
        ))
      : '—';
  // A cell the server wrote as words (a heat, a rank) reads in the reader's language.
  if (typeof value === 'object') return say(value);
  if (typeof value === 'number')
    return column.format === 'percent' ? (
      formatPercent(value)
    ) : column.format === 'change' ? (
      formatChange(value)
    ) : column.format === 'delta' ? (
      `${value > 0 ? '+' : ''}${formatCount(value)}`
    ) : column.format === 'position' ? (
      formatCount(value, 1)
    ) : column.format === 'difficulty' ? (
      <ScoreBadge value={value} />
    ) : (
      formatCount(value)
    );
  return column.format === 'platform'
    ? (PLATFORM[value]?.() ?? value)
    : column.format === 'label'
      ? $t(value)
      : column.format === 'date'
        ? formatDate(value)
        : value;
}

/** Evidence: the rows behind the growth (at most ten), and "View all N" to the page that lists all of them. */
export function EvidenceTableView({
  evidence,
}: {
  evidence: EvidenceTable;
}): ReactElement | null {
  const inMenu = useLinkInMenu();
  if (!evidence.rows.length) return null;
  const unit = $t(evidence.unit, { 0: formatCount(evidence.total) });
  return (
    <section
      className='flex flex-col gap-1.5'
      aria-label={$t('growth.evidence', { 0: unit })}
      data-evidence=''
    >
      <h3 className='text-xs font-medium text-muted-foreground'>
        {$t('growth.evidence', { 0: unit })}
      </h3>
      <div className='overflow-x-auto rounded-lg border'>
        <table className='w-full border-collapse text-sm'>
          <thead className='text-xs text-muted-foreground'>
            <tr className='border-b'>
              {evidence.columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-3 py-1.5 font-normal whitespace-nowrap',
                    NUMERIC.has(c.format) ? 'text-right' : 'text-left',
                  )}
                >
                  {$t(c.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {evidence.rows.map((row, i) => (
              // eslint-disable-next-line @eslint-react/no-array-index-key -- the rows are a fixed snapshot the server wrote
              <tr key={i} className='border-b last:border-0 align-top'>
                {evidence.columns.map((c, j) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-3 py-1.5',
                      NUMERIC.has(c.format)
                        ? 'text-right whitespace-nowrap tabular-nums'
                        : 'min-w-0 break-words',
                      j > 0 &&
                        !NUMERIC.has(c.format) &&
                        'text-muted-foreground',
                      // Tables keep the columns after the first on one line and the first at least 160px wide
                      // (reach.css); here a list may wrap and the first column narrows a little, so a detail as
                      // narrow as this one shows every column.
                      Array.isArray(row[c.key]) && 'whitespace-normal!',
                      j === 0 && 'min-w-28!',
                    )}
                  >
                    {j === 0 && row.url ? (
                      <a
                        className='nr-link'
                        href={row.url}
                        target='_blank'
                        rel='noreferrer'
                      >
                        {cellText(row[c.key], c)}
                      </a>
                    ) : (
                      cellText(row[c.key], c)
                    )}
                    {c.from && row[c.from] != null ? (
                      <span className='ml-1.5 text-xs text-muted-foreground'>
                        ← {cellText(row[c.from], c)}
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {inMenu(evidence.link) ? (
        <Link
          className='nr-link inline-flex items-center gap-1 self-start text-sm'
          to={evidence.link}
        >
          {$t('growth.viewAll', { 0: unit })}
          <ArrowRightIcon className='size-3.5' />
        </Link>
      ) : null}
    </section>
  );
}

const WEEK_SERIES: Record<TopicSource, [string, () => string]> = {
  reddit: ['var(--chart-1)', () => 'Reddit'],
  hackernews: ['var(--chart-2)', () => 'Hacker News'],
  youtube: ['var(--chart-3)', () => 'YouTube'],
  github: ['var(--chart-4)', () => $t('growth.chart.githubRepos')],
};

/**
 * Discussions a week (2026-11-10 step 2b): a trending topic's last weeks, each a bar stacked by source with the week's
 * total above it. Only the sources counted for the topic are drawn.
 */
export function DiscussionWeeks({
  weeks,
}: {
  weeks: DiscussionWeek[];
}): ReactElement | null {
  // A source with no discussions in any week draws no bar, so it gets no legend entry either.
  const shown = TOPIC_SOURCES.filter((s) =>
    weeks.some((w) => (w.counts[s] ?? 0) > 0),
  );
  if (weeks.length < 2 || !shown.length) return null;
  // The week's total goes above the highest source with discussions that week (`total_<source>`): a source with none
  // draws no bar, so it cannot carry the label.
  const data = weeks.map((w) => {
    const total = shown.reduce((a, s) => a + (w.counts[s] ?? 0), 0),
      top = [...shown].reverse().find((s) => (w.counts[s] ?? 0) > 0);
    return {
      week: w.week,
      ...w.counts,
      ...(top ? { [`total_${top}`]: total } : {}),
    };
  });
  return (
    <section
      className='flex flex-col gap-1.5'
      aria-label={$t('growth.chart.title')}
      data-discussion-weeks=''
    >
      <h3 className='text-xs font-medium text-muted-foreground'>
        {$t('growth.chart.title')}
      </h3>
      <div className='nr-chart-box rounded-lg border px-2 pt-3'>
        <ResponsiveContainer width='100%' height={180}>
          <TrendChart
            as={BarChart}
            data={data}
            margin={{ top: 16, right: 8, left: 8, bottom: 0 }}
          >
            <XAxis
              dataKey='week'
              tickFormatter={(d: string) => formatDate(d, { withYear: false })}
              interval={0}
              fontSize={11}
              tickLine={false}
            />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'var(--muted)' }}
              labelFormatter={(d) =>
                typeof d === 'string'
                  ? $t('growth.chart.weekOf', { 0: formatDate(d) })
                  : ''
              }
            />
            <ChartLegend order={shown} />
            {shown.map((s) => (
              <ChartBar
                key={s}
                isAnimationActive={false}
                stackId='week'
                dataKey={s}
                name={WEEK_SERIES[s][1]()}
                fill={WEEK_SERIES[s][0]}
              >
                <LabelList
                  dataKey={`total_${s}`}
                  position='top'
                  fontSize={11}
                  fill='var(--foreground)'
                />
              </ChartBar>
            ))}
          </TrendChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
