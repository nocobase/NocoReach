import { useState } from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  Pencil,
  UserRoundMinus,
  Send,
  Link2,
  Ban,
} from 'lucide-react';
import { useNocoReachLocale, $t } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, ListSkeleton } from '#components/reach/states';
import { confirmAction } from '#components/reach/confirm';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Badge } from '#components/ui/badge';
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
import { useMe } from './me';
import {
  useAccessApi,
  useAccessQuery,
  roleTitle,
  accessMessage,
  type AccessMember,
  type MemberInvitation,
  type BusinessRole,
} from './access/api';
import { AccessError, Refresh, RowMenu, Pager } from './access/components';
import { InvitationLink } from './access/invitation-link';

export default function Members() {
  const locale = useNocoReachLocale();
  const { me } = useMe();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const invites = params.get('tab') === 'invitations';
  const members = useAccessQuery<{ items: AccessMember[]; canManage: boolean }>(
    '/members',
  );
  const roles = useAccessQuery<{ items: BusinessRole[] }>('/roles');
  const canManage = members.data?.canManage === true;
  const pending = useAccessQuery<MemberInvitation[]>('/invitations', canManage);
  const call = useAccessApi();
  const client = useQueryClient();
  const [search, setSearch] = useState(params.get('q') || '');
  const [busy, setBusy] = useState('');
  const [sort, setSort] = useState<'asc' | 'desc'>('asc');
  const [sortField, setSortField] = useState<'name' | 'expires'>('expires');
  const [page, setPage] = useState(0);
  const [link, setLink] = useState<{
    inviteUrl?: string;
    emailSent: boolean;
    email: string;
  }>();
  const reload = () =>
    void client.invalidateQueries({ queryKey: ['reach-access'] });
  const title = (key: string) =>
    roleTitle(roles.data?.items.find((role) => role.key === key) || { key });
  const query = search.trim().toLowerCase();
  const rows = (members.data?.items || [])
    .filter((row) => `${row.name} ${row.account}`.toLowerCase().includes(query))
    .sort(
      (a, b) =>
        (sort === 'asc' ? 1 : -1) * a.name.localeCompare(b.name, locale),
    );
  const invitations = (pending.data || [])
    .filter((row) => row.email.toLowerCase().includes(query))
    .sort((a, b) =>
      sortField === 'name'
        ? (sort === 'asc' ? 1 : -1) * a.email.localeCompare(b.email, locale)
        : (sort === 'asc' ? -1 : 1) * a.expiresAt.localeCompare(b.expiresAt),
    );
  const total = invites ? invitations.length : rows.length;
  const activePage = Math.min(page, Math.max(0, Math.ceil(total / 20) - 1));
  const nonempty = invites
    ? !!pending.data?.length
    : !!members.data?.items.length;
  const editSearch = (value: string) => {
    setSearch(value);
    setPage(0);
  };
  const commitSearch = () => {
    const next = new URLSearchParams(params);
    if (search) next.set('q', search);
    else next.delete('q');
    setParams(next, { replace: true });
  };
  const clear = () => {
    editSearch('');
    const next = new URLSearchParams(params);
    next.delete('q');
    setParams(next, { replace: true });
  };
  const inviteButton = canManage ? (
    <Button
      nativeButton={false}
      render={<Link to={{ pathname: 'invite', search: location.search }} />}
    >
      <UserPlus data-icon='inline-start' />
      {$t('accessMembers.inviteMember')}
    </Button>
  ) : null;
  const action = async (
    row: MemberInvitation,
    kind: 'resend' | 'revoke',
    sendEmail = true,
  ) => {
    if (
      !(await confirmAction({
        title: () =>
          $t(
            kind === 'revoke'
              ? 'accessMembers.revokeTitle'
              : 'accessMembers.regenerateTitle',
            { 0: row.email },
          ),
        description: () =>
          $t(
            kind === 'revoke'
              ? 'accessMembers.revokeDescription'
              : 'accessMembers.regenerateDescription',
          ),
        action: () =>
          $t(
            kind === 'revoke'
              ? 'accessMembers.revoke'
              : sendEmail
                ? 'accessMembers.resend'
                : 'accessMembers.regenerate',
          ),
        destructive: kind === 'revoke',
      }))
    )
      return;
    setBusy(row.id);
    try {
      const result = await call<{
        inviteUrl?: string;
        emailSent: boolean;
        email: string;
      }>(
        `/invitations/${row.source}/${row.id}/${kind}`,
        kind === 'resend' ? { sendEmail } : {},
      );
      if (kind === 'resend') setLink(result);
      toast.success(() =>
        $t(
          kind === 'revoke'
            ? 'accessMembers.revokedToast'
            : 'accessMembers.renewedToast',
          { 0: row.email },
        ),
      );
      reload();
    } catch (error) {
      toast.error(() => accessMessage(error));
    } finally {
      setBusy('');
    }
  };
  const remove = async (row: AccessMember) => {
    if (
      !(await confirmAction({
        title: () => $t('accessMembers.removeTitle', { 0: row.name }),
        description: () => $t('accessMembers.removeDescription'),
        action: () => $t('accessMembers.remove'),
      }))
    )
      return;
    setBusy(row.id);
    try {
      await call(`/members/${row.id}/remove`, {});
      reload();
      toast.success(() => $t('accessMembers.removedToast', { 0: row.name }));
      document.getElementById('member-search')?.focus();
    } catch (error) {
      toast.error(() => accessMessage(error));
    } finally {
      setBusy('');
    }
  };
  const error =
    members.error ||
    roles.error ||
    (invites && canManage ? pending.error : null);
  return (
    <PageContainer className='nr-page'>
      <PageHeader
        title={$t('accessMembers.members')}
        description={$t('accessMembers.membersDescription')}
        actions={
          <>
            {nonempty ? inviteButton : null}
            <Refresh
              busy={
                members.isFetching || pending.isFetching || roles.isFetching
              }
              onClick={reload}
            />
          </>
        }
      />
      <nav
        className='flex flex-wrap gap-2'
        aria-label={$t('accessMembers.memberViews')}
      >
        {[
          ['members', 'accessMembers.members'],
          ['invitations', 'accessMembers.pending'],
        ].map(([tab, key]) =>
          tab === 'members' || canManage ? (
            <Button
              key={tab}
              variant={
                (invites ? 'invitations' : 'members') === tab
                  ? 'secondary'
                  : 'ghost'
              }
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('tab', tab);
                setParams(next);
                setPage(0);
              }}
              aria-current={
                (invites ? 'invitations' : 'members') === tab
                  ? 'page'
                  : undefined
              }
            >
              {$t(key)}
            </Button>
          ) : null,
        )}
      </nav>
      <AccessError error={error} retry={reload} />
      {!members.data || (invites && canManage && !pending.data) ? (
        !error && <ListSkeleton />
      ) : (
        <>
          {invites && !canManage ? (
            <p>{$t('accessMembers.errors.denied')}</p>
          ) : !nonempty ? (
            <EmptyState
              className='min-h-48'
              icon={<Users />}
              title={$t(
                invites
                  ? 'accessMembers.noInvitations'
                  : 'accessMembers.noMembers',
              )}
              description={$t('accessMembers.emptyDescription')}
              action={inviteButton}
            />
          ) : (
            <>
              <div className='flex flex-wrap items-center gap-2'>
                <Input
                  id='member-search'
                  className='sm:max-w-xs'
                  aria-label={$t(
                    invites
                      ? 'accessMembers.searchInvitations'
                      : 'accessMembers.search',
                  )}
                  placeholder={$t(
                    invites
                      ? 'accessMembers.searchInvitations'
                      : 'accessMembers.search',
                  )}
                  value={search}
                  onChange={(event) => editSearch(event.target.value)}
                  onBlur={commitSearch}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing)
                      commitSearch();
                  }}
                />
                {search ? (
                  <Button variant='ghost' onClick={clear}>
                    {$t('accessMembers.clear')}
                  </Button>
                ) : null}
              </div>
              {!total ? (
                <EmptyState
                  className='min-h-48'
                  icon={<Users />}
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
                  <Table
                    aria-label={$t(
                      invites
                        ? 'accessMembers.pending'
                        : 'accessMembers.members',
                    )}
                  >
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <Button
                            variant='ghost'
                            onClick={() => {
                              setSortField('name');
                              setSort(sort === 'asc' ? 'desc' : 'asc');
                            }}
                          >
                            {$t(
                              invites ? 'accessMembers.email' : 'members.name',
                            )}{' '}
                            {!invites || sortField === 'name'
                              ? sort === 'asc'
                                ? '↑'
                                : '↓'
                              : null}
                          </Button>
                        </TableHead>
                        <TableHead>
                          {$t(
                            invites
                              ? 'accessMembers.status'
                              : 'members.account',
                          )}
                        </TableHead>
                        <TableHead>{$t('accessMembers.roles')}</TableHead>
                        {invites ? (
                          <TableHead>
                            <Button
                              variant='ghost'
                              onClick={() => {
                                setSortField('expires');
                                setSort(sort === 'asc' ? 'desc' : 'asc');
                              }}
                            >
                              {$t('accessMembers.expires')}{' '}
                              {sortField === 'expires'
                                ? sort === 'asc'
                                  ? '↓'
                                  : '↑'
                                : null}
                            </Button>
                          </TableHead>
                        ) : null}
                        <TableHead>
                          <span className='sr-only'>
                            {$t('accessMembers.actions')}
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invites
                        ? invitations
                            .slice(activePage * 20, activePage * 20 + 20)
                            .map((row) => (
                              <TableRow key={row.id}>
                                <TableCell>
                                  <span
                                    className='block max-w-xs truncate'
                                    title={row.email}
                                  >
                                    {row.email}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Badge variant='secondary'>
                                    {$t(`accessMembers.statuses.${row.status}`)}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className='flex flex-wrap gap-1'>
                                    {row.roles.map((key) => (
                                      <Badge variant='outline' key={key}>
                                        {title(key)}
                                      </Badge>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {new Date(row.expiresAt).toLocaleString(
                                    locale,
                                  )}
                                </TableCell>
                                <TableCell>
                                  <RowMenu name={row.email}>
                                    <DropdownMenuItem
                                      disabled={!!busy}
                                      onClick={() =>
                                        void action(row, 'resend', true)
                                      }
                                    >
                                      <Send />
                                      {$t('accessMembers.resend')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      disabled={!!busy}
                                      onClick={() =>
                                        void action(row, 'resend', false)
                                      }
                                    >
                                      <Link2 />
                                      {$t('accessMembers.regenerate')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant='destructive'
                                      disabled={!!busy}
                                      onClick={() => void action(row, 'revoke')}
                                    >
                                      <Ban />
                                      {$t('accessMembers.revoke')}
                                    </DropdownMenuItem>
                                  </RowMenu>
                                </TableCell>
                              </TableRow>
                            ))
                        : rows
                            .slice(activePage * 20, activePage * 20 + 20)
                            .map((row) => (
                              <TableRow key={row.id} data-member={row.id}>
                                <TableCell>
                                  <span
                                    className='block max-w-xs truncate'
                                    title={row.name}
                                  >
                                    {row.id === me?.id
                                      ? $t('common.selfName', { 0: row.name })
                                      : row.name}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span
                                    className='block max-w-xs truncate'
                                    title={row.account}
                                  >
                                    {row.account}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <div className='flex flex-wrap gap-1'>
                                    {row.locked ? (
                                      <Badge>
                                        {$t(
                                          'accessMembers.systemAdministrator',
                                        )}
                                      </Badge>
                                    ) : (
                                      row.roles.map((key) => (
                                        <Badge variant='secondary' key={key}>
                                          {title(key)}
                                        </Badge>
                                      ))
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {canManage &&
                                  !row.locked &&
                                  row.id !== me?.id ? (
                                    <RowMenu name={row.name}>
                                      <DropdownMenuItem
                                        render={
                                          <Link
                                            to={{
                                              pathname: `${row.id}/roles`,
                                              search: location.search,
                                            }}
                                          />
                                        }
                                      >
                                        <Pencil />
                                        {$t('accessMembers.editRoles')}
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        variant='destructive'
                                        disabled={!!busy}
                                        onClick={() => void remove(row)}
                                      >
                                        <UserRoundMinus />
                                        {$t('accessMembers.remove')}
                                      </DropdownMenuItem>
                                    </RowMenu>
                                  ) : (
                                    <span className='text-xs text-muted-foreground'>
                                      {row.locked
                                        ? $t('accessMembers.systemLocked')
                                        : row.id === me?.id
                                          ? $t('accessMembers.selfLocked')
                                          : '—'}
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <Pager total={total} page={activePage} onChange={setPage} />
            </>
          )}
        </>
      )}
      {link ? (
        <InvitationLink value={link} onClose={() => setLink(undefined)} />
      ) : null}
      <Outlet />
    </PageContainer>
  );
}
