import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { $t, useNocoReachLocale } from '#i18n';
import { useMe } from '../me';
import { PageContainer, PageHeader } from '#components/reach/page';
import { EmptyState, ListSkeleton } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { Badge } from '#components/ui/badge';
import { useAccessApi, useAccessQuery, type MemberInvitation } from './api';
import { AccessError, Refresh } from './components';

export default function AcceptInvitation() {
  const locale = useNocoReachLocale();
  const { invitationId } = useParams();
  const navigate = useNavigate();
  const { reload: reloadMe } = useMe();
  const query = useAccessQuery<MemberInvitation | MemberInvitation[]>(
    invitationId ? `/mine/${invitationId}` : '/mine',
  );
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState('');
  const call = useAccessApi();
  const queries = useQueryClient();
  const rows = Array.isArray(query.data)
    ? query.data
    : query.data
      ? [query.data]
      : [];
  const accept = async (id: string) => {
    setBusy(id);
    setError(undefined);
    try {
      await call(`/mine/${id}/accept`, {});
      await navigate(`/member-invitations/${id}`, { replace: true });
      void queries.invalidateQueries({ queryKey: ['reach-access'] });
      reloadMe();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy('');
    }
  };
  return (
    <PageContainer>
      <PageHeader
        title={$t('accessMembers.yourInvitations')}
        description={$t('accessMembers.acceptHelp')}
        actions={
          <Refresh
            busy={query.isFetching}
            onClick={() => void query.refetch()}
          />
        }
      />
      <AccessError
        error={error || query.error}
        retry={() => void query.refetch()}
      />
      {invitationId && rows.some((row) => row.status === 'accepted') ? (
        <EmptyState
          icon={<MailCheck />}
          title={$t('accessMembers.acceptedTitle')}
          description={$t('accessMembers.acceptedDescription')}
          action={
            <Button nativeButton={false} render={<Link to='/home' />}>
              {$t('accessMembers.enterApplication')}
            </Button>
          }
        />
      ) : !query.data && !query.error ? (
        <ListSkeleton />
      ) : !rows.length && !query.error ? (
        <EmptyState
          className='min-h-48'
          icon={<MailCheck />}
          title={$t('accessMembers.noOwnInvitations')}
          description={$t('accessMembers.noOwnInvitationsDescription')}
        />
      ) : (
        rows.map((row) => (
          <section
            className='flex flex-col gap-4 rounded-lg border bg-card p-6'
            key={row.id}
          >
            <h2 className='break-words text-base font-medium'>{row.email}</h2>
            <Badge variant='secondary'>
              {$t(`accessMembers.statuses.${row.status}`)}
            </Badge>
            <p className='text-sm text-muted-foreground'>
              {$t('accessMembers.acceptIdentity')}
            </p>
            <p className='text-sm'>
              {$t('accessMembers.expires')}:{' '}
              {new Date(row.expiresAt).toLocaleString(locale)}
            </p>
            <div>
              <Button
                disabled={!!busy || row.status !== 'pending'}
                onClick={() => void accept(row.id)}
              >
                {$t(busy === row.id ? 'common.saving' : 'accessMembers.accept')}
              </Button>
            </div>
          </section>
        ))
      )}
    </PageContainer>
  );
}
