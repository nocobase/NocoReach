import { useParams, useOutletContext } from 'react-router';
import { $t, useNocoReachLocale } from '#i18n';
import { RouteDrawer } from '#components/route-drawer';
import { ListSkeleton } from '#components/reach/states';
import { useAccessQuery } from './api';
import { AccessError } from './components';
import type { KeyEvent, ManagedKey } from '../../../shared/key-access';
import { formatDateTime } from '#lib/format';
export default function KeyHistory() {
  useNocoReachLocale();
  const { ownerId, keyId } = useParams();
  const items = useOutletContext<ManagedKey[]>();
  const item = items?.find(
    (key) => key.id === keyId && key.ownerId === ownerId,
  );
  const grant = item?.scope?.groups['nocoreach.business'];
  const query = useAccessQuery<KeyEvent[]>(
    `/history?ownerId=${encodeURIComponent(ownerId || '')}&keyId=${encodeURIComponent(keyId || '')}`,
    true,
    'nocoreachKeys',
  );
  return (
    <RouteDrawer
      title={$t('accessKeys.history')}
      description={$t('accessKeys.historyHelp')}
    >
      {item ? (
        <div className='flex flex-col gap-2 rounded-lg border p-3 text-sm'>
          <p className='font-medium'>{item.name || item.id}</p>
          {grant ? (
            <>
              <p>
                {$t('accessKeys.permissions')}:{' '}
                {$t(`accessKeys.${grant.level}`)}
              </p>
              <p>
                {$t('accessKeys.projects')}:{' '}
                {Array.isArray(grant.objects)
                  ? grant.objects.join(', ')
                  : $t('accessMembers.allProjects')}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
      <AccessError error={query.error} retry={() => void query.refetch()} />
      {!query.data ? (
        !query.error && <ListSkeleton />
      ) : (
        <ol className='flex flex-col gap-4'>
          {query.data.map((event) => (
            <li key={event.id} className='rounded-lg border p-3'>
              <p className='font-medium'>
                {$t(`accessKeys.events.${event.action.split('.')[1]}`)}
              </p>
              <p className='break-all text-sm text-muted-foreground'>
                {$t('accessKeys.actor', { 0: event.actorId })}
              </p>
              <time className='text-sm text-muted-foreground'>
                {formatDateTime(event.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </RouteDrawer>
  );
}
