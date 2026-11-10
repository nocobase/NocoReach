import { $t } from '#i18n';
import { Fragment, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRightIcon } from 'lucide-react';
import { Tag, type Tone } from '#components/reach/tag';
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
  type EvidenceCell,
  type EvidenceColumn,
  type EvidenceTable,
  type Growth,
  type GrowthArea,
  type GrowthFigure,
  type GrowthKind,
  type GrowthText,
} from '../../../shared/growth.js';

// A growth opportunity's parts on Opportunities (2026-11-10, ui-references/growth-opportunities-2026-11-10): where it
// comes from and what kind it is as its two tags, its size as a row of figures (Growth potential), and the rows behind
// it (Evidence) with the page that lists all of them. The server computed every number (shared/growth.ts).

const AREA: Record<GrowthArea, [Tone, () => string]> = {
  keywords: ['green', () => $t('common.keywords')],
  'ai-search': ['violet', () => $t('common.aiSearch')],
  github: ['slate', () => 'GitHub'],
  competitors: ['orange', () => $t('competitors.title')],
};
const KIND: Record<GrowthKind, string> = {
  'demand-gap': 'growth.kind.demandGap',
  'competitor-gap': 'growth.kind.competitorGap',
  'near-first': 'growth.kind.nearFirst',
  'low-ctr': 'growth.kind.lowCtr',
  rising: 'growth.kind.rising',
  'new-query': 'growth.kind.newQuery',
  'not-mentioned': 'growth.kind.notMentioned',
  'cited-sources': 'growth.kind.citedSources',
  uncited: 'growth.kind.uncited',
  'topic-heat': 'growth.kind.topicHeat',
  'new-repo': 'growth.kind.newRepo',
  'competitor-launch': 'growth.kind.competitorLaunch',
};
const say = (text?: GrowthText) => (text ? $t(text.key, text.params) : '');

/** Where the growth point comes from, then its kind: "Keywords" "Demand without a page". */
export function GrowthTags({ growth }: { growth: Growth }): ReactElement {
  const [tone, label] = AREA[growth.area];
  return (
    <>
      <Tag tone={tone} data-growth-area={growth.area}>
        {label()}
      </Tag>
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
            <dd className='flex min-w-0 items-baseline gap-1'>
              {/* A number never shrinks; a name (a domain, a version) is set smaller and cut short, as is the unit. */}
              <span
                className={cn(
                  typeof f.value === 'number'
                    ? 'shrink-0 text-lg font-semibold tabular-nums'
                    : 'min-w-0 truncate text-sm font-medium leading-7',
                )}
                title={figureValue(f)}
              >
                {figureValue(f)}
              </span>
              {f.detail ? (
                <span
                  className='min-w-0 truncate text-xs text-muted-foreground'
                  title={say(f.detail)}
                >
                  {say(f.detail)}
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
  if (typeof value === 'number')
    return column.format === 'percent' ? (
      formatPercent(value)
    ) : column.format === 'change' ? (
      formatChange(value)
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
                      // Tables keep the columns after the first on one line (reach.css); a list may wrap, so a
                      // detail as narrow as this one shows every column.
                      Array.isArray(row[c.key]) && 'whitespace-normal!',
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
