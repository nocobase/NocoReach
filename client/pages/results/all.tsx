import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import { usePageBreadcrumb } from '@nocobase/app-client';
import { ListChecks, RefreshCw, SearchX } from 'lucide-react';
import { $t } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, ListSkeleton } from '#components/reach/states';
import { InfoTip } from '#components/reach/info-tip';
import { RouteChildPage } from '#components/route-child-page';
import { SortableHeader } from '#components/seo/sortable-header';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
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
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { useProject } from '../reach-data.js';
import { RangePicker } from '../range-picker.js';
import { useRange, validRange } from '../range-state.js';
import { PrimaryComparison } from './comparison.js';
import {
  DEFAULT_RESULT_RANGE,
  LIST_PARAMS,
  denied,
  RESULT_RANGES,
  shortDate,
} from './format.js';
import { ResultsLoadError } from './states.js';
import { ResultTag } from './status-tag.js';
import type { ResultSummary } from './types.js';

// 全部成果 (/results/all): every result of the dashboard's period, over the dashboard. The period is the dashboard's
// own (`days`, `from`, `to`), so the two always count the same records; search, status, order and page are this
// page's parameters (LIST_PARAMS), which the breadcrumb back drops.
export default function AllResultsPage() {
  const { project } = useProject();
  return (
    <RouteChildPage>
      {project ? (
        <ResultsList key={project.id} projectId={String(project.id)} />
      ) : null}
    </RouteChildPage>
  );
}

// Filter values follow the tags: work that is not live by its phase, live work by its comparison status.
const STATUS_FILTERS = [
  'pendingLive',
  'delivered',
  'up',
  'down',
  'flat',
  'waiting',
  'insufficient',
  'unavailable',
];
const filterLabel = (value: string) =>
  value === 'all'
    ? $t('results.all')
    : $t(
        value === 'pendingLive' || value === 'delivered'
          ? `results.phase.${value}`
          : `results.status.${value}`,
      );

function ResultsList({ projectId }: { projectId: string }) {
  const [params, setParams] = useSearchParams(),
    location = useLocation();
  const [range, setRange] = useRange(DEFAULT_RESULT_RANGE);
  const r = RESULT_RANGES.includes(range.range)
    ? range
    : { range: DEFAULT_RESULT_RANGE };
  const valid = validRange(r);
  const parent = new URLSearchParams(params);
  for (const key of LIST_PARAMS) parent.delete(key);
  usePageBreadcrumb([
    {
      label: $t('results.title'),
      to: { pathname: '/results', search: parent.toString() },
    },
    { label: $t('results.allTitle') },
  ]);
  const page = Math.max(1, Number(params.get('page')) || 1),
    q = params.get('q') || '',
    status = STATUS_FILTERS.includes(params.get('status') || '')
      ? params.get('status')!
      : '',
    order = params.get('order') === 'asc' ? 'asc' : 'desc';
  // The box keeps what is typed; the URL changes only when the search is submitted (A7).
  const [query, setQuery] = useState(q);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const [reload, setReload] = useState({ count: 0, refresh: false });
  const request = JSON.stringify({ ...r, page, q, status, order }),
    key = `${request}:${reload.count}`;
  const [result, setResult] = useState<{
    key: string;
    data?: { items: ResultSummary[]; total: number };
    error?: unknown;
  }>();
  useEffect(() => {
    if (!valid) return;
    let alive = true;
    const requested = `${request}:${reload.count}`;
    const {
      status: s,
      q: text,
      ...rest
    } = JSON.parse(request) as {
      status: string;
      q: string;
    };
    void api
      .action<{ items: ResultSummary[]; total: number }>(
        'nrTaskWork',
        'results',
        {
          method: 'POST',
          body: {
            projectId,
            ...rest,
            ...(text ? { q: text } : {}),
            ...(s ? { status: s } : {}),
          },
          unwrap: 'data',
        },
      )
      .then(
        (data) => {
          if (alive) setResult({ key: requested, data });
        },
        (error: unknown) => {
          if (alive)
            setResult((previous) => ({
              key: requested,
              error,
              data: denied(error) ? undefined : previous?.data,
            }));
        },
      );
    return () => {
      alive = false;
    };
  }, [projectId, request, reload.count, valid]);
  const loading = valid && result?.key !== key;
  const data = result?.data,
    error = loading ? undefined : result?.error;
  const filtered = Boolean(q || status);
  const change = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    p.delete('page');
    for (const [k, v] of Object.entries(next))
      if (v) p.set(k, v);
      else p.delete(k);
    setParams(p);
  };
  const clear = () => {
    setQuery('');
    change({ q: '', status: '' });
  };
  const retry = () => {
    setReload((n) => ({ count: n.count + 1, refresh: true }));
    refreshRef.current?.focus();
  };
  return (
    <PageContainer>
      <PageHeader
        title={$t('results.allTitle')}
        description={$t('results.allDescription')}
        info={
          <InfoTip label={$t('common.aboutData')}>
            {$t('results.board.caveat')}
          </InfoTip>
        }
        actions={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  ref={refreshRef}
                  variant='outline'
                  size='icon'
                  aria-label={$t('results.refresh')}
                  onClick={() =>
                    setReload((n) => ({ count: n.count + 1, refresh: true }))
                  }
                />
              }
            >
              <RefreshCw
                className={
                  loading && reload.refresh ? 'animate-spin' : undefined
                }
              />
            </TooltipTrigger>
            <TooltipContent>{$t('results.refresh')}</TooltipContent>
          </Tooltip>
        }
      />
      <RangePicker
        value={r}
        onChange={(next) => {
          setReload((n) => ({ ...n, refresh: false }));
          setRange(next, ['page']);
        }}
        options={RESULT_RANGES}
      />
      <form
        className='flex flex-wrap items-center gap-2'
        onSubmit={(e) => {
          e.preventDefault();
          change({ q: query.trim() });
        }}
      >
        <Input
          className='w-full sm:max-w-xs'
          aria-label={$t('results.search')}
          placeholder={$t('results.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant='outline' type='submit'>
          {$t('results.searchButton')}
        </Button>
        <Select
          value={status || 'all'}
          onValueChange={(value) =>
            change({ status: value === 'all' ? '' : String(value) })
          }
        >
          <SelectTrigger
            className='w-full sm:w-40'
            aria-label={$t('results.statusLabel')}
          >
            <SelectValue>{(value: string) => filterLabel(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
            <SelectGroup>
              {['all', ...STATUS_FILTERS].map((value) => (
                <SelectItem key={value} value={value}>
                  {filterLabel(value)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {filtered ? (
          <Button variant='ghost' type='button' onClick={clear}>
            {$t('results.clear')}
          </Button>
        ) : null}
      </form>
      {error && data ? (
        <ResultsLoadError
          title={$t('results.stale')}
          error={error}
          onRetry={retry}
        />
      ) : null}
      {error && !data ? (
        <ResultsLoadError
          title={$t('results.board.loadFailed')}
          error={error}
          onRetry={retry}
        />
      ) : !data ? (
        valid ? (
          <ListSkeleton rows={6} />
        ) : null
      ) : !data.items.length ? (
        filtered ? (
          <EmptyState
            className='min-h-48'
            icon={<SearchX />}
            title={$t('results.noMatches')}
            action={
              <Button variant='outline' onClick={clear}>
                {$t('results.clear')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            className='min-h-48'
            icon={<ListChecks />}
            title={$t('results.board.empty')}
            description={$t('results.board.emptyDescription')}
          />
        )
      ) : (
        <div aria-busy={loading || undefined} className='flex flex-col gap-4'>
          <div className='overflow-hidden rounded-lg border'>
            <Table className='min-w-[50rem]'>
              <TableHeader>
                <TableRow>
                  <TableHead>{$t('results.board.task')}</TableHead>
                  <TableHead>{$t('results.change')}</TableHead>
                  <TableHead>{$t('results.windowsLabel')}</TableHead>
                  <TableHead
                    aria-sort={order === 'asc' ? 'ascending' : 'descending'}
                  >
                    <SortableHeader
                      label={$t('results.occurred')}
                      help={false}
                      column={{
                        getIsSorted: () => order,
                        getToggleSortingHandler: () => () =>
                          change({ order: order === 'asc' ? '' : 'asc' }),
                      }}
                    />
                  </TableHead>
                  <TableHead>{$t('results.board.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.taskId}>
                    <TableCell className='max-w-[22rem]'>
                      <Link
                        className='nr-link block truncate'
                        title={`${item.taskNo ? `T-${item.taskNo} · ` : ''}${item.title}`}
                        to={{ pathname: item.taskId, search: location.search }}
                      >
                        {item.taskNo ? `T-${item.taskNo} · ` : ''}
                        {item.title}
                      </Link>
                      <p className='text-xs text-muted-foreground'>
                        {$t(`results.taskState.${item.taskState}`)}
                        {item.closed ? ` · ${$t('common.closed')}` : ''}
                        {item.simulated ? ` · ${$t('results.simulated')}` : ''}
                      </p>
                    </TableCell>
                    <TableCell>
                      {item.latest ? (
                        <PrimaryComparison result={item.latest} />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className='text-xs tabular-nums'>
                      {item.latest ? (
                        <>
                          <b>{$t('results.day', { 0: item.latest.day })}</b>
                          <p>
                            {item.latest.baseline.start} –{' '}
                            {item.latest.baseline.end}
                          </p>
                          <p>
                            {item.latest.after.start} – {item.latest.after.end}
                          </p>
                        </>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {item.occurredAt
                        ? shortDate(item.occurredAt)
                        : $t('results.timeUnknown')}
                    </TableCell>
                    <TableCell>
                      <ResultTag
                        phase={item.phase}
                        status={item.status}
                        taskState={item.taskState}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className='flex flex-wrap items-center justify-end gap-3'>
            <span className='text-sm text-muted-foreground'>
              {$t('results.total', { 0: data.total })}
            </span>
            <Button
              variant='outline'
              disabled={page <= 1}
              onClick={() => change({ page: String(page - 1) })}
            >
              {$t('results.previous')}
            </Button>
            <Button
              variant='outline'
              disabled={page * 20 >= data.total}
              onClick={() => change({ page: String(page + 1) })}
            >
              {$t('results.next')}
            </Button>
          </div>
        </div>
      )}
      <Outlet />
    </PageContainer>
  );
}
