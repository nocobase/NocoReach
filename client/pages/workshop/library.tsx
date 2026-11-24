import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileText, Search } from 'lucide-react';
import { EmptyState } from '#components/reach/states';
import { InfoTip } from '#components/reach/info-tip';
import { SourceLogo } from '#components/reach/source-logo';
import { Tag } from '#components/reach/tag';
import { DataTableTabs } from '#components/seo/data-table-toolbar';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { TabsTrigger } from '#components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import { formatCount, formatDate } from '#lib/format';
import { cn } from '#lib/utils';
import {
  carouselOrder,
  isCarouselForm,
  type RepurposeForm,
} from '../../../shared/repurpose.js';
import { $t, getCurrentLocale } from '#i18n';
import { CarouselMark } from './carousel-mark.js';
import {
  carouselPlaceName,
  getFormNames,
  libraryFilter,
  librarySearch,
  logoOf,
  pathOf,
  resultName,
  shownVersion,
  standingText,
  taskNo,
  versionName,
  type Article,
  type ArticleVersion,
  type LibraryFilter as Filter,
  type Made,
  type WorkshopView,
} from './model.js';

// Library (homepage v5, 2026-11-13 user decision, ui-references/content-workshop-2026-11-12/homepage-v5.png): every blog
// article, newest first, picked by hand to go out to the fixed channels. Each row shows which forms were already made
// from it as read-only icons (lit or grey), never a grid of choices; Adapt opens step 2 for it. An article is one row
// for all its translations (2026-11-17 user decision): the row shows the version in the interface language, else the
// original, tags its languages and adds up their clicks; Adapt starts from the version shown.

/** Rows shown before Show more, and how many more each press shows. */
const PAGE = 20;
/**
 * The forms a row's icons stand for, in this order: Carousel is one icon for all its places (2026-11-24), as Community
 * post is for its destinations.
 */
type Group =
  | Exclude<RepurposeForm, 'xhs' | 'instagram' | 'linkedin-carousel'>
  | 'carousel';
const GROUPS: Group[] = ['x', 'linkedin', 'carousel', 'community'];
const groupOf = (form: RepurposeForm): Group =>
  isCarouselForm(form) ? 'carousel' : form;

export function Library({ view }: { view: WorkshopView }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const counts = {
    all: view.articles.length,
    todo: view.articles.filter(libraryFilter('todo')).length,
    made: view.articles.filter(libraryFilter('made')).length,
  };
  const rows = useMemo(
    () =>
      view.articles.filter(
        (a) => libraryFilter(filter)(a) && librarySearch(a, query),
      ),
    [view.articles, filter, query],
  );
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
  // Languages are tagged only on a site with translations: on one written in a single language, every row would say it.
  const multilingual = view.articles.some((a) => a.versions.length > 1);
  const adapt = (v: ArticleVersion) =>
    void navigate({
      pathname: 'new',
      search: `?${new URLSearchParams({ url: v.url, title: v.title })}`,
    });
  return (
    <div className='overflow-hidden rounded-lg border bg-card' data-library=''>
      <DataTableTabs
        value={filter}
        onValueChange={(v) => {
          setFilter(v as Filter);
          setLimit(PAGE);
        }}
        actions={
          <label className='relative flex items-center'>
            <Search className='pointer-events-none absolute left-2.5 size-4 text-muted-foreground' />
            <Input
              aria-label={$t('workshop.librarySearch')}
              placeholder={$t('workshop.librarySearch')}
              className='h-8 w-64 pl-8'
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
            />
          </label>
        }
      >
        <TabsTrigger value='all'>
          {$t('common.allCount', { 0: counts.all })}
        </TabsTrigger>
        <TabsTrigger value='todo'>
          {$t('workshop.libraryNotMade')} {counts.todo}
        </TabsTrigger>
        <TabsTrigger value='made'>
          {$t('workshop.libraryMade')} {counts.made}
        </TabsTrigger>
      </DataTableTabs>
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{$t('workshop.articleColumn')}</TableHead>
              <TableHead className='w-32'>
                {$t('workshop.publishedColumn')}
              </TableHead>
              <TableHead className='w-36 text-right'>
                <span className='inline-flex items-center gap-1'>
                  {$t('workshop.clicks30Column')}
                  <InfoTip
                    label={$t('common.what', {
                      0: $t('workshop.clicks30Column'),
                    })}
                  >
                    <span className='block max-w-xs'>
                      {$t('workshop.clicks30Info')}
                    </span>
                  </InfoTip>
                </span>
              </TableHead>
              <TableHead className='w-40'>
                {$t('workshop.madeColumn')}
              </TableHead>
              <TableHead className='w-20' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, limit).map((a) => {
              const v = shownVersion(a);
              return (
                <TableRow
                  key={a.url}
                  data-article={a.made.length ? 'made' : ''}
                >
                  <TableCell className='max-w-0'>
                    <a
                      href={v.url}
                      target='_blank'
                      rel='noreferrer'
                      className='block truncate font-medium hover:underline'
                      title={v.title}
                    >
                      {v.title}
                    </a>
                    <div className='mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
                      {multilingual && a.versions.some((x) => x.lang) ? (
                        <span
                          className='flex shrink-0 items-center gap-1'
                          data-languages=''
                        >
                          {a.versions.map((x) => (
                            <Tag key={x.url} tone='grey' title={x.title}>
                              {versionName(x)}
                            </Tag>
                          ))}
                        </span>
                      ) : null}
                      <span className='truncate'>{pathOf(v.url)}</span>
                    </div>
                  </TableCell>
                  <TableCell className='text-muted-foreground tabular-nums'>
                    {a.published ? formatDate(a.published) : '—'}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    <Clicks article={a} />
                  </TableCell>
                  <TableCell>
                    <MadeIcons made={a.made} />
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => adapt(v)}
                    >
                      {$t('workshop.adapt')}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <p className='px-4 py-6 text-center text-sm text-muted-foreground'>
          {query.trim()
            ? $t('workshop.noMatch', { 0: query.trim() })
            : $t('workshop.libraryNone')}
        </p>
      )}
      {rows.length > limit ? (
        <div className='border-t px-4 py-2 text-center'>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setLimit((n) => n + PAGE)}
          >
            {$t('workshop.showMore', { 0: rows.length - limit })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** An article's clicks, all its languages together; hovering them gives each language's. */
function Clicks({ article }: { article: Article }) {
  if (article.clicks30 === null) return <>—</>;
  const total = formatCount(article.clicks30);
  if (article.versions.length < 2) return <>{total}</>;
  const each = article.versions.map(
    (v) => `${versionName(v)} ${formatCount(v.clicks30 ?? 0)}`,
  );
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className='rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
            aria-label={`${total}: ${each.join('; ')}`}
            data-clicks-each=''
          />
        }
      >
        {total}
      </TooltipTrigger>
      <TooltipContent>{each.join(' · ')}</TooltipContent>
    </Tooltip>
  );
}

/**
 * What an article was made into: X posts, LinkedIn post, Carousel (any of its places) and community posts, each lit when a
 * task made it (not closed), with the number of carousels or community posts beside it when more than one. Hovering one
 * lists its tasks, Carousel's after the places it went to.
 */
function MadeIcons({ made }: { made: Made[] }) {
  const names = getFormNames();
  return (
    <span className='inline-flex items-center gap-1.5' data-made-icons=''>
      {GROUPS.map((group) => {
        const mine = made
          .filter((m) => groupOf(m.form) === group)
          .sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
        const name =
          group === 'carousel' ? $t('workshop.formCarousel') : names[group];
        // Carousel says the places made first: "Carousel: Xiaohongshu, Instagram".
        const places =
          group === 'carousel' && mine.length
            ? [
                $t('workshop.carouselMade', {
                  0: carouselOrder(getCurrentLocale())
                    .filter((form) => mine.some((m) => m.form === form))
                    .map(carouselPlaceName)
                    .join($t('workshop.listSeparator')),
                }),
              ]
            : [];
        const tip = mine.length
          ? [
              ...places,
              ...mine.map((m) =>
                [
                  [taskNo(m.no), resultName(m.form, m.destination)]
                    .filter(Boolean)
                    .join(' '),
                  standingText(m.standing),
                ].join(' · '),
              ),
            ]
          : [`${name} · ${$t('workshop.libraryNotMade')}`];
        return (
          <Tooltip key={group}>
            <TooltipTrigger
              render={
                <span
                  tabIndex={0}
                  className='inline-flex items-center gap-0.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  aria-label={tip.join('; ')}
                  data-form={group}
                  data-lit={mine.length ? '' : undefined}
                />
              }
            >
              {/* Lit in the mark's own colour (the community and carousel icons in the text colour), grey when nothing
                  was made. */}
              {group === 'carousel' ? (
                <CarouselMark
                  className={cn(
                    'size-3.5 border-0 bg-transparent [&_svg]:size-3.5',
                    mine.length ? 'text-foreground' : 'opacity-30',
                  )}
                />
              ) : (
                <SourceLogo
                  source={logoOf(group)}
                  size='xs'
                  className={cn(
                    mine.length ? 'text-foreground' : 'opacity-30 grayscale',
                  )}
                />
              )}
              {(group === 'community' || group === 'carousel') &&
              mine.length > 1 ? (
                <span className='text-xs text-muted-foreground tabular-nums'>
                  {mine.length}
                </span>
              ) : null}
            </TooltipTrigger>
            <TooltipContent>
              <span className='flex flex-col gap-0.5'>
                {tip.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}
