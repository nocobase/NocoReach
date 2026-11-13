import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { FileText, Search } from 'lucide-react';
import { $t } from '#i18n';
import { EmptyState } from '#components/reach/states';
import { SourceLogo } from '#components/reach/source-logo';
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
import type { RepurposeForm } from '../../../shared/repurpose.js';
import {
  getFormNames,
  libraryFilter,
  librarySearch,
  logoOf,
  resultName,
  standingText,
  taskNo,
  type Article,
  type LibraryFilter as Filter,
  type Made,
  type WorkshopView,
} from './model.js';

// Library (homepage v5, 2026-11-13 user decision, ui-references/content-workshop-2026-11-12/homepage-v5.png): every blog
// article, newest first, picked by hand to go out to the fixed channels. Each row shows which forms were already made
// from it as read-only icons (lit or grey), never a grid of choices; Adapt opens step 2 for it.

/** Rows shown before Show more, and how many more each press shows. */
const PAGE = 20;
/** The forms a row's icons stand for, in this order. */
const FORMS: RepurposeForm[] = ['x', 'linkedin', 'xhs', 'community'];

/** An article's address without the site: "/blog/client-portal". */
const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return decodeURI(u.pathname) + u.search;
  } catch {
    return url;
  }
};

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
  const adapt = (a: Article) =>
    void navigate({
      pathname: 'new',
      search: `?${new URLSearchParams({ url: a.url, title: a.title })}`,
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
              <TableHead className='w-32 text-right'>
                {$t('workshop.clicks30Column')}
              </TableHead>
              <TableHead className='w-40'>
                {$t('workshop.madeColumn')}
              </TableHead>
              <TableHead className='w-20' />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, limit).map((a) => (
              <TableRow key={a.url} data-article={a.made.length ? 'made' : ''}>
                <TableCell className='max-w-0'>
                  <a
                    href={a.url}
                    target='_blank'
                    rel='noreferrer'
                    className='block truncate font-medium hover:underline'
                    title={a.title}
                  >
                    {a.title}
                  </a>
                  <div className='truncate text-xs text-muted-foreground'>
                    {pathOf(a.url)}
                  </div>
                </TableCell>
                <TableCell className='text-muted-foreground tabular-nums'>
                  {a.published ? formatDate(a.published) : '—'}
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {a.clicks30 === null ? '—' : formatCount(a.clicks30)}
                </TableCell>
                <TableCell>
                  <MadeIcons made={a.made} />
                </TableCell>
                <TableCell className='text-right'>
                  <Button size='sm' variant='outline' onClick={() => adapt(a)}>
                    {$t('workshop.adapt')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
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

/**
 * What an article was made into: X posts, LinkedIn post, Xiaohongshu note and community posts, each lit when a task made
 * it (not closed), with the number of community posts beside it when more than one. Hovering one lists its tasks.
 */
function MadeIcons({ made }: { made: Made[] }) {
  const names = getFormNames();
  return (
    <span className='inline-flex items-center gap-1.5' data-made-icons=''>
      {FORMS.map((form) => {
        const mine = made
          .filter((m) => m.form === form)
          .sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
        const tip = mine.length
          ? mine.map((m) =>
              [
                [taskNo(m.no), resultName(m.form, m.destination)]
                  .filter(Boolean)
                  .join(' '),
                standingText(m.standing),
              ].join(' · '),
            )
          : [
              `${names[form]} · ${$t(form === 'xhs' ? 'workshop.comingSoon' : 'workshop.libraryNotMade')}`,
            ];
        return (
          <Tooltip key={form}>
            <TooltipTrigger
              render={
                <span
                  tabIndex={0}
                  className='inline-flex items-center gap-0.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
                  aria-label={tip.join('; ')}
                  data-form={form}
                  data-lit={mine.length ? '' : undefined}
                />
              }
            >
              <SourceLogo
                source={logoOf(form)}
                size='xs'
                className={cn(!mine.length && 'opacity-30 grayscale')}
              />
              {form === 'community' && mine.length > 1 ? (
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
