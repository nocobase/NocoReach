import { useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import { KeyRound, Plus, History, RotateCw, Ban } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { $t, useNocoReachLocale } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, ListSkeleton } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '#components/ui/table';
import { DropdownMenuItem } from '#components/ui/dropdown-menu';
import { StatusBadge } from '#components/status-badge';
import { confirmAction } from '#components/reach/confirm';
import { toast } from '#lib/toast';
import type {
  KeyList,
  ManagedKey,
  CreatedApiKey,
} from '../../../shared/key-access';
import { useAccessApi, useAccessQuery, accessMessage } from './api';
import { AccessError, Refresh, RowMenu, Pager } from './components';
import { KeySecret } from './key-secret';
import { formatDate, formatDateTime } from '#lib/format';

const keyState = (key: ManagedKey) =>
  key.expiresAt && Date.parse(key.expiresAt) <= Date.now()
    ? 'expired'
    : key.revoked || !key.enabled
      ? 'revoked'
      : 'active';
export function ScopeSummary({ item }: { item: ManagedKey }) {
  const grant = item.scope?.groups['nocoreach.business'];
  return (
    <span className='text-sm'>
      {grant ? (
        <>
          {$t(`accessKeys.${grant.level}`)} ·{' '}
          {Array.isArray(grant.objects)
            ? $t('accessKeys.projectCount', { 0: grant.objects.length })
            : $t('accessMembers.allProjects')}
        </>
      ) : (
        '—'
      )}
    </span>
  );
}
export default function Keys() {
  const locale = useNocoReachLocale();
  const [params, setParams] = useSearchParams();
  const type =
    params.get('type') === 'organization' ? 'organization' : 'personal';
  const query = useAccessQuery<KeyList>(
    `/list?type=${type}`,
    true,
    'nocoreachKeys',
  );
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<CreatedApiKey>();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState(params.get('q') || '');
  const call = useAccessApi('nocoreachKeys');
  const cache = useQueryClient();
  const reload = () =>
    void cache.invalidateQueries({
      queryKey: ['reach-access', 'nocoreachKeys'],
    });
  const rows = (query.data?.items || []).filter((row) =>
    (row.name || row.id)
      .toLocaleLowerCase(locale)
      .includes(search.toLocaleLowerCase(locale)),
  );
  const activePage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 20) - 1),
  );
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
    setPage(0);
    setSecret(undefined);
  };
  const manage = async (item: ManagedKey, action: 'rotate' | 'revoke') => {
    if (
      busy ||
      !(await confirmAction({
        title: () =>
          $t(`accessKeys.${action}Title`, { 0: item.name || item.id }),
        description: () => $t(`accessKeys.${action}Help`),
        action: () => $t(`accessKeys.${action}`),
      }))
    )
      return;
    setBusy(true);
    try {
      const result = await call<CreatedApiKey>(`/${action}`, {
        keyId: item.id,
        ownerId: item.ownerId,
      });
      if (action === 'rotate') setSecret(result);
      else toast.success(() => $t('accessKeys.revokedToast'));
      reload();
    } catch (error) {
      toast.error(() => accessMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const create = (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'new', search: location.search }} />}
    >
      <Plus />
      {$t('accessKeys.create')}
    </Button>
  );
  return (
    <PageContainer className='nr-page'>
      <PageHeader
        title={$t('accessKeys.title')}
        description={$t('accessKeys.description')}
        actions={
          <>
            <Refresh busy={query.isFetching || busy} onClick={reload} />
            {query.data?.items.length ? create : null}
          </>
        }
      />
      <div
        role='tablist'
        aria-label={$t('accessKeys.type')}
        className='flex gap-2'
      >
        <Button
          role='tab'
          aria-selected={type === 'personal'}
          variant={type === 'personal' ? 'secondary' : 'ghost'}
          onClick={() => change('type', 'personal')}
        >
          {$t('accessKeys.personal')}
        </Button>
        {query.data?.canManage || type === 'organization' ? (
          <Button
            role='tab'
            aria-selected={type === 'organization'}
            variant={type === 'organization' ? 'secondary' : 'ghost'}
            onClick={() => change('type', 'organization')}
          >
            {$t('accessKeys.organization')}
          </Button>
        ) : null}
      </div>
      <p className='text-sm text-muted-foreground'>
        {$t(
          type === 'organization'
            ? 'accessKeys.organizationHelp'
            : 'accessKeys.personalHelp',
        )}
      </p>
      <AccessError error={query.error} retry={reload} />
      {!query.data ? (
        !query.error && <ListSkeleton />
      ) : (
        <>
          <Input
            className='sm:max-w-xs'
            aria-label={$t('accessKeys.search')}
            placeholder={$t('accessKeys.search')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            onBlur={() => change('q', search)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing)
                change('q', search);
            }}
          />
          {!rows.length ? (
            <EmptyState
              icon={<KeyRound />}
              title={$t(
                search ? 'accessMembers.noResults' : 'accessKeys.empty',
              )}
              description={$t('accessKeys.description')}
              action={
                search ? (
                  <Button
                    onClick={() => {
                      setSearch('');
                      change('q', '');
                    }}
                  >
                    {$t('accessMembers.clear')}
                  </Button>
                ) : (
                  create
                )
              }
            />
          ) : (
            <div className='rounded-lg border bg-card'>
              <Table aria-label={$t('accessKeys.title')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{$t('accessKeys.name')}</TableHead>
                    <TableHead>{$t('accessKeys.status')}</TableHead>
                    <TableHead className='hidden md:table-cell'>
                      {$t('accessKeys.scope')}
                    </TableHead>
                    <TableHead className='hidden sm:table-cell'>
                      {$t('accessKeys.expires')}
                    </TableHead>
                    <TableHead className='hidden lg:table-cell'>
                      {$t('accessKeys.lastUsed')}
                    </TableHead>
                    <TableHead>{$t('accessMembers.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows
                    .slice(activePage * 20, activePage * 20 + 20)
                    .map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className='max-w-64 break-words whitespace-normal'>
                          <Link
                            className='font-medium underline-offset-4 hover:underline'
                            to={{
                              pathname: `${item.ownerId}/${item.id}`,
                              search: location.search,
                            }}
                          >
                            {item.name || item.id}
                          </Link>
                          <div className='text-xs text-muted-foreground md:hidden'>
                            <ScopeSummary item={item} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            tone={
                              keyState(item) === 'active'
                                ? 'success'
                                : 'neutral'
                            }
                          >
                            {$t(`accessKeys.${keyState(item)}`)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className='hidden md:table-cell'>
                          <ScopeSummary item={item} />
                        </TableCell>
                        <TableCell className='hidden sm:table-cell'>
                          {formatDate(item.expiresAt, { withYear: true })}
                        </TableCell>
                        <TableCell className='hidden lg:table-cell'>
                          {formatDateTime(item.lastUsedAt)}
                        </TableCell>
                        <TableCell>
                          <RowMenu name={item.name || item.id}>
                            <DropdownMenuItem
                              render={
                                <Link
                                  to={{
                                    pathname: `${item.ownerId}/${item.id}`,
                                    search: location.search,
                                  }}
                                />
                              }
                            >
                              <History />
                              {$t('accessKeys.history')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={busy || keyState(item) !== 'active'}
                              onClick={() => void manage(item, 'rotate')}
                            >
                              <RotateCw />
                              {$t('accessKeys.rotate')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant='destructive'
                              disabled={busy || item.revoked}
                              onClick={() => void manage(item, 'revoke')}
                            >
                              <Ban />
                              {$t('accessKeys.revoke')}
                            </DropdownMenuItem>
                          </RowMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Pager total={rows.length} page={activePage} onChange={setPage} />
        </>
      )}
      {secret ? (
        <KeySecret value={secret} onClose={() => setSecret(undefined)} />
      ) : null}
      <Outlet context={query.data?.items || []} />
    </PageContainer>
  );
}
