import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { $t } from '#i18n';
import { Button, buttonVariants } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { DataTable, useDataTable } from '#components/seo/data-table';
import { SortableHeader } from '#components/seo/sortable-header';
import { TablePagination } from '#components/seo/table-pagination';
import { HeaderActions } from '#components/reach/page';
import { RefreshButton } from '#components/reach/refresh-button';
import { LoadError, InlineError } from '#components/reach/states';
import { useBusinessAccess } from '#hooks/use-business-access';
import { formatCount, formatDate } from '#lib/format';
import { toast } from '#lib/toast';
import {
  discoveryRequest,
  useDiscoveryStatus,
  discoveryDetection,
  retryable,
  type DiscoveryList,
  type DiscoveryStatus,
  type DiscoveredRepository,
} from './api.js';
import {
  DetectionBadge,
  DiscoverySelect,
  DiscoveryState,
  OverflowText,
} from './components.js';

export function DiscoveryResults({ projectId }: { projectId: number }) {
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const {
    data: status,
    error: statusError,
    reload,
    accept,
  } = useDiscoveryStatus(projectId);
  const [params, setParams] = useSearchParams(),
    location = useLocation();
  const [data, setData] = useState<DiscoveryList>(),
    [error, setError] = useState<unknown>(),
    [finishedKey, setFinishedKey] = useState(''),
    [version, setVersion] = useState(0),
    [scanError, setScanError] = useState('');
  const [starting, setStarting] = useState(false);
  const { can: canConfigure } = useBusinessAccess(
    'nrGitHubDiscovery.saveRule',
    projectId,
  );
  const { can: canScan } = useBusinessAccess(
    'nrGitHubDiscovery.scan',
    projectId,
  );
  const filter = params.get('status') || 'all',
    ruleId = params.get('rule') || '',
    sort = params.get('sort') || 'checkedAt',
    order = params.get('order') === 'asc' ? 'asc' : 'desc',
    page = Math.max(1, Number(params.get('page')) || 1),
    query = params.get('search') || '';
  const requestKey = JSON.stringify([
    projectId,
    query,
    ruleId,
    filter,
    sort,
    order,
    page,
    version,
    status?.lastRun?.finishedAt,
    location.pathname,
  ]);
  const loading = finishedKey !== requestKey;
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };
  const clear = () => {
    update({ search: '', status: '', rule: '' });
  };
  useEffect(() => {
    const controller = new AbortController();
    void discoveryRequest<DiscoveryList>(
      projectId,
      'list',
      {
        search: query,
        ruleId,
        status: filter,
        sort,
        order,
        page,
        pageSize: 20,
      },
      { signal: controller.signal },
    )
      .then((next) => {
        if (!controller.signal.aborted) {
          setData(next);
          setError(undefined);
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          setError(e);
          if (!retryable(e)) setData(undefined);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setFinishedKey(requestKey);
      });
    return () => controller.abort();
  }, [
    projectId,
    query,
    ruleId,
    filter,
    sort,
    order,
    page,
    version,
    status?.lastRun?.finishedAt,
    location.pathname,
    requestKey,
  ]);
  const sorting: SortingState = [{ id: sort, desc: order === 'desc' }];
  const columns: ColumnDef<DiscoveredRepository>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label={$t('githubDiscovery.repository')}
          help={false}
        />
      ),
      cell: ({ row }) => (
        <OverflowText text={row.original.name}>
          <Link
            className='font-medium text-foreground underline-offset-4 hover:underline'
            to={`/data/github/discovery/${row.original.id}?${params}`}
          >
            {row.original.name}
          </Link>
        </OverflowText>
      ),
    },
    {
      id: 'detection',
      enableSorting: false,
      header: $t('githubDiscovery.detection'),
      cell: ({ row }) => (
        <DetectionBadge status={discoveryDetection(row.original)} />
      ),
    },
    {
      id: 'review',
      enableSorting: false,
      header: $t('githubDiscovery.review'),
      cell: ({ row }) => <DetectionBadge status={row.original.review} />,
    },
    {
      accessorKey: 'stars',
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label={$t('githubDiscovery.stars')}
          help={false}
          align='right'
        />
      ),
      cell: ({ row }) => formatCount(row.original.stars),
      meta: {
        headerClassName: 'text-right',
        cellClassName: 'text-right tabular-nums',
      },
    },
    ...(['createdAt', 'firstDiscoveredAt', 'checkedAt'] as const).map(
      (key): ColumnDef<DiscoveredRepository> => ({
        accessorKey: key,
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t(`githubDiscovery.${key}`)}
            help={false}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap'>
            {formatDate(row.original[key])}
          </span>
        ),
      }),
    ),
  ];
  const table = useDataTable({
    data: data?.items || [],
    columns,
    manualSorting: true,
    manualPagination: true,
    enableSortingRemoval: false,
    state: { sorting },
    onSortingChange: (change) => {
      const next = typeof change === 'function' ? change(sorting) : change;
      update({
        sort: next[0]?.id || 'checkedAt',
        order: next[0]?.desc ? 'desc' : 'asc',
      });
    },
  });
  async function scan() {
    setStarting(true);
    setScanError('');
    try {
      const next = await discoveryRequest<DiscoveryStatus>(projectId, 'scan');
      if (!aliveRef.current) return;
      accept(next);
      toast.success(() => $t('githubDiscovery.scanStarted'));
      setVersion((v) => v + 1);
    } catch (e) {
      if (aliveRef.current)
        setScanError(
          e instanceof Error ? e.message : $t('common.operationFailedRetry'),
        );
    } finally {
      if (aliveRef.current) setStarting(false);
    }
  }
  const scanDisabled =
    !status?.connected || !status.rules.some((r) => r.enabled);
  const configure = canConfigure ? (
    <Link
      className={buttonVariants({ variant: 'outline' })}
      to='/connections?source=github-discovery'
    >
      {$t('githubDiscovery.configure')}
    </Link>
  ) : undefined;
  return (
    <>
      <HeaderActions>
        {data?.storedTotal ? configure : null}
        <RefreshButton
          busy={starting || !!status?.running || loading}
          label={$t(
            canScan && !scanDisabled
              ? 'githubDiscovery.scan'
              : 'common.refresh',
          )}
          onClick={() => {
            if (canScan && !scanDisabled) void scan();
            else {
              reload();
              setVersion((v) => v + 1);
            }
          }}
        />
      </HeaderActions>
      {status && <DiscoveryState data={status} />}
      {Boolean(error || statusError) && (
        <LoadError
          title={$t('githubDiscovery.loadFailed')}
          message={
            (error || statusError) instanceof Error
              ? ((error || statusError) as Error).message
              : undefined
          }
          onRetry={
            retryable(error || statusError)
              ? () => {
                  reload();
                  setVersion((v) => v + 1);
                }
              : undefined
          }
        />
      )}
      {scanError && <InlineError>{scanError}</InlineError>}
      <DataTable
        table={table}
        isLoading={loading && !data}
        isFiltered={!!query || !!ruleId || filter !== 'all'}
        onClearFilters={clear}
        empty={{
          title: $t('githubDiscovery.noResults'),
          description: $t(
            canConfigure
              ? 'githubDiscovery.emptyHelp'
              : 'githubDiscovery.askAdmin',
          ),
          action: configure,
        }}
        toolbar={
          <div
            className='flex flex-wrap items-center gap-2 pb-4'
            aria-busy={loading}
          >
            {loading && data && (
              <span role='status' className='text-sm text-muted-foreground'>
                {$t('common.loading')}
              </span>
            )}
            <SearchForm
              key={query}
              query={query}
              onSearch={(search) => update({ search })}
            />
            <DiscoverySelect
              label={$t('githubDiscovery.rules')}
              value={ruleId || 'all'}
              options={[
                { value: 'all', label: $t('githubDiscovery.allRules') },
                ...(status?.rules.map((r) => ({
                  value: r.id,
                  label: r.name,
                })) || []),
              ]}
              onChange={(v) => update({ rule: v === 'all' ? '' : v })}
            />
            <DiscoverySelect
              label={$t('common.status')}
              value={filter}
              options={[
                'all',
                'verified',
                'candidate',
                'mention',
                'confirmed',
                'ignored',
                'favorite',
              ].map((value) => ({
                value,
                label: $t(`githubDiscovery.${value}`),
              }))}
              onChange={(v) => update({ status: v === 'all' ? '' : v })}
            />
            {(query || ruleId || filter !== 'all') && (
              <Button variant='ghost' onClick={clear}>
                {$t('githubDiscovery.clearFilters')}
              </Button>
            )}
          </div>
        }
        footer={
          data && (
            <TablePagination
              page={page}
              pageSize={20}
              totalCount={data.total}
              onPageChange={(next) => update({ page: String(next) })}
            />
          )
        }
      />
      {data?.capped && (
        <p className='text-sm text-muted-foreground'>
          {$t('githubDiscovery.storageCap')}
        </p>
      )}
    </>
  );
}

function SearchForm({
  query,
  onSearch,
}: {
  query: string;
  onSearch: (value: string) => void;
}) {
  const [search, setSearch] = useState(query);
  return (
    <form
      className='flex w-full items-center gap-2 sm:w-auto'
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(search);
      }}
    >
      <Input
        aria-label={$t('githubDiscovery.search')}
        placeholder={$t('githubDiscovery.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Button type='submit' variant='outline'>
        {$t('githubDiscovery.searchButton')}
      </Button>
    </form>
  );
}
