import { useEffect, useRef, useState } from 'react';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { Trash2 } from 'lucide-react';
import { $t, useNocoReachLocale } from '#i18n';
import { useBusinessAccess } from '#hooks/use-business-access';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { toast } from '#lib/toast';
import { Button } from '#components/ui/button';
import { confirmCollectorClear } from '#lib/collector-clear';

type Props = {
  projectId: number;
  resource: 'nrBilibili' | 'nrXiaohongshu' | 'nrYouTube';
  revision: string | number | null;
  total: number;
  disabled: boolean;
  onCleared: () => void | Promise<void>;
  errorMessage: (error: Error) => string;
};

export function CollectorClear(props: Props) {
  const { session, isPending } = useAuthentication();
  const authorizationRevision = useAuthorizationRevision();
  const { can } = useBusinessAccess(`${props.resource}.clear`, props.projectId);
  if (isPending || !session || !can || props.total === 0) return null;
  return (
    <ClearButton
      key={JSON.stringify([
        session.user.id,
        session.session.id,
        authorizationRevision,
        props.projectId,
        props.resource,
        props.revision,
        props.total,
        props.disabled,
      ])}
      {...props}
      sessionId={session.session.id}
    />
  );
}

function ClearButton({
  projectId,
  resource,
  revision,
  disabled,
  onCleared,
  errorMessage,
  sessionId,
}: Props & { sessionId: string }) {
  useNocoReachLocale();
  const { refresh } = useAuthentication();
  const [busy, setBusy] = useState(false);
  const pendingRef = useRef(false);
  const ownerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const owner = new AbortController();
    ownerRef.current = owner;
    return () => owner.abort();
  }, []);
  async function clear() {
    const owner = ownerRef.current;
    if (disabled || pendingRef.current || !owner || owner.signal.aborted)
      return;
    pendingRef.current = true;
    setBusy(true);
    try {
      if (!(await confirmCollectorClear(resource, owner.signal))) return;
      if (owner.signal.aborted) return;
      await api.action(resource, 'clear', {
        method: 'POST',
        body: { projectId, revision },
        headers: { 'X-NocoReach-Confirmation-Session': sessionId },
        unwrap: 'data',
      });
      if (owner.signal.aborted) return;
      toast.success(() => $t('collectorClear.success'));
      await onCleared();
    } catch (error) {
      if (owner.signal.aborted) return;
      if (
        (error as { code?: string })?.code ===
        'NOCOREACH_CONFIRMATION_SESSION_CHANGED'
      ) {
        await refresh();
        return;
      }
      toast.error(() =>
        error instanceof Error
          ? errorMessage(error)
          : $t('common.operationFailedRetry'),
      );
    } finally {
      if (!owner.signal.aborted) {
        pendingRef.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <Button
      variant='outline'
      size='sm'
      disabled={disabled || busy}
      title={disabled ? $t('collectorClear.waitForCollection') : undefined}
      onClick={() => void clear()}
    >
      <Trash2 data-icon='inline-start' />
      {busy ? $t('common.loadingLoading') : $t('collectorClear.action')}
    </Button>
  );
}
