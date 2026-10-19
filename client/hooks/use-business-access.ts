import { useEffect, useMemo, useState } from 'react';
import {
  useAuthorizationClient,
  useAuthorizationRevision,
  type UseCanResult,
} from '@nocobase/app-plugin-authorization/client';

/** Checks one business action, or any action needed to open a shared management panel. */
export function useBusinessAccess(
  actions: string | readonly string[],
  projectId: string | number | null = '$app',
): UseCanResult {
  const client = useAuthorizationClient();
  const revision = useAuthorizationRevision();
  const request = useMemo(
    () => ({ client, revision, actions, projectId }),
    [client, revision, actions, projectId],
  );
  const [result, setResult] = useState<{
    request: typeof request;
    can: boolean;
    error?: unknown;
  }>();
  const active = projectId !== null && actions.length > 0;
  useEffect(() => {
    if (!active) return;
    const { actions, client, projectId } = request;
    let current = true;
    const finish = (can: boolean, error?: unknown) => {
      if (current) setResult({ request, can, error });
    };
    const list = typeof actions === 'string' ? [actions] : actions;
    void Promise.all(
      list.map((action) =>
        client.can({
          resource: { type: 'nocoreach', id: String(projectId) },
          action,
        }),
      ),
    ).then(
      (checks) => finish(checks.some(Boolean)),
      (error) => finish(false, error),
    );
    return () => {
      current = false;
    };
  }, [request, active]);
  const fresh = result?.request === request;
  return {
    can: active && fresh && result.can,
    isPending: active && !fresh,
    error: active && fresh ? result.error : undefined,
    retry: () => client.invalidate(),
  };
}
