import { useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ContactRound, Plus, Pencil, Trash2 } from 'lucide-react';
import { $t, useNocoReachLocale } from '#i18n';
import { PageContainer } from '#components/reach/page';
import { EmptyState, ListSkeleton } from '#components/reach/states';
import { confirmAction } from '#components/reach/confirm';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Badge } from '#components/ui/badge';
import { InfoTip } from '#components/reach/info-tip';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableCell,
  TableRow,
} from '#components/ui/table';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '#components/ui/dropdown-menu';
import { toast } from '#lib/toast';
import {
  useAccessApi,
  useAccessQuery,
  roleTitle,
  accessMessage,
  type BusinessRole,
} from './api';
import {
  AccessError,
  AccessHeader,
  Refresh,
  RowMenu,
  Pager,
} from './components';

export default function Roles() {
  const locale = useNocoReachLocale();
  const query = useAccessQuery<{ items: BusinessRole[]; canManage: boolean }>(
    '/roles',
  );
  const members = useAccessQuery<{ canManage: boolean }>('/members');
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [search, setSearch] = useState(params.get('q') || '');
  const [sort, setSort] = useState(1);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const call = useAccessApi();
  const queries = useQueryClient();
  const rows = (query.data?.items || [])
    .filter((role) =>
      roleTitle(role).toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => sort * roleTitle(a).localeCompare(roleTitle(b), locale));
  const canManage = query.data?.canManage;
  const reload = () =>
    void queries.invalidateQueries({ queryKey: ['reach-access'] });
  const commit = () => {
    const next = new URLSearchParams(params);
    if (search) next.set('q', search);
    else next.delete('q');
    setParams(next, { replace: true });
  };
  const clear = () => {
    setSearch('');
    const next = new URLSearchParams(params);
    next.delete('q');
    setParams(next, { replace: true });
  };
  const remove = async (role: BusinessRole) => {
    if (
      !(await confirmAction({
        title: () =>
          $t('accessMembers.deleteRoleTitle', { 0: roleTitle(role) }),
        description: () => $t('accessMembers.deleteRoleDescription'),
        action: () => $t('common.delete'),
      }))
    )
      return;
    setBusy(true);
    try {
      await call(
        `/roles/${encodeURIComponent(role.key)}`,
        { revision: role.revision },
        'DELETE',
      );
      reload();
      toast.success(() =>
        $t('accessMembers.deletedRole', { 0: roleTitle(role) }),
      );
      document.getElementById('role-search')?.focus();
    } catch (error) {
      toast.error(() => accessMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const create = canManage ? (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'roles/new', search: location.search }} />}
    >
      <Plus />
      {$t('accessMembers.newRole')}
    </Button>
  ) : null;
  const activePage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 20) - 1),
  );
  return (
    <PageContainer className='nr-page'>
      <AccessHeader
        tab='roles'
        invitations={members.data?.canManage === true}
        actions={
          <>
            {query.data?.items.length ? create : null}
            <Refresh busy={query.isFetching} onClick={reload} />
          </>
        }
      />
      <AccessError error={query.error} retry={reload} />
      {!query.data ? (
        !query.error && <ListSkeleton />
      ) : !query.data.items.length ? (
        <EmptyState
          className='min-h-48'
          icon={<ContactRound />}
          title={$t('accessMembers.noRoles')}
          description={$t('accessMembers.rolesDescription')}
          action={create}
        />
      ) : (
        <>
          <div className='flex flex-wrap gap-2'>
            <Input
              id='role-search'
              className='sm:max-w-xs'
              aria-label={$t('accessMembers.searchRoles')}
              placeholder={$t('accessMembers.searchRoles')}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing)
                  commit();
              }}
            />
            {search ? (
              <Button variant='ghost' onClick={clear}>
                {$t('accessMembers.clear')}
              </Button>
            ) : null}
          </div>
          {!rows.length ? (
            <EmptyState
              className='min-h-48'
              icon={<ContactRound />}
              title={$t('accessMembers.noResults')}
              description={$t('accessMembers.noResultsDescription')}
              action={
                <Button variant='outline' onClick={clear}>
                  {$t('accessMembers.clear')}
                </Button>
              }
            />
          ) : (
            <div className='rounded-lg border bg-card'>
              <Table aria-label={$t('accessMembers.roles')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button variant='ghost' onClick={() => setSort(-sort)}>
                        {$t('accessMembers.roleName')} {sort === 1 ? '↑' : '↓'}
                      </Button>
                    </TableHead>
                    <TableHead>{$t('accessMembers.projectScope')}</TableHead>
                    <TableHead>{$t('accessMembers.type')}</TableHead>
                    <TableHead>{$t('accessMembers.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* System administrators are not a business role, but members can hold it; the list names it so
                      Members and Roles agree (UI review 2026-10-21). It cannot be edited here. */}
                  {activePage === 0 &&
                  $t('accessMembers.systemAdministrator')
                    .toLowerCase()
                    .includes(search.toLowerCase()) ? (
                    <TableRow data-role='system-administrator'>
                      <TableCell>
                        <span className='inline-flex items-center gap-1 font-medium'>
                          {$t('accessMembers.systemAdministrator')}
                          <InfoTip
                            label={$t('accessMembers.systemAdministrator')}
                          >
                            {$t('accessMembers.systemAdministratorHelp')}
                          </InfoTip>
                        </span>
                      </TableCell>
                      <TableCell>{$t('accessMembers.scopes.all')}</TableCell>
                      <TableCell>
                        <Badge variant='secondary'>
                          {$t('accessMembers.builtIn')}
                        </Badge>
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  ) : null}
                  {rows
                    .slice(activePage * 20, activePage * 20 + 20)
                    .map((role) => (
                      <TableRow key={role.key}>
                        <TableCell>
                          <Link
                            className='block max-w-md truncate font-medium hover:underline'
                            title={roleTitle(role)}
                            to={{
                              pathname: `roles/${encodeURIComponent(role.key)}`,
                              search: location.search,
                            }}
                          >
                            {roleTitle(role)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {$t(`accessMembers.scopes.${role.scope}`)}
                        </TableCell>
                        <TableCell>
                          <Badge variant='secondary'>
                            {$t(
                              role.builtIn
                                ? 'accessMembers.builtIn'
                                : 'accessMembers.custom',
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {canManage && !role.builtIn ? (
                            <RowMenu name={roleTitle(role)}>
                              <DropdownMenuItem
                                render={
                                  <Link
                                    to={{
                                      pathname: `roles/${encodeURIComponent(role.key)}`,
                                      search: location.search,
                                    }}
                                  />
                                }
                              >
                                <Pencil />
                                {$t('common.edit')}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant='destructive'
                                disabled={busy}
                                onClick={() => void remove(role)}
                              >
                                <Trash2 />
                                {$t('common.delete')}
                              </DropdownMenuItem>
                            </RowMenu>
                          ) : null}
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
      <Outlet />
    </PageContainer>
  );
}
