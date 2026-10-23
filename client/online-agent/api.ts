import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { $t } from '#i18n';
import type { OnlineChatSettings } from '../../shared/online-agent.js';
/**
 * Chat panel › Settings, with whether the model it uses can answer now and whether a system default chat model exists,
 * without which the Agents plugin does not offer its `online` agent.
 */
export type OnlineSettings = OnlineChatSettings & {
  ready: boolean;
  defaultModel: boolean;
};
export class OnlineApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
const knownErrors = new Set([
  'chatDisabled',
  'modelUnavailable',
  'revisionConflict',
  'accessDenied',
  'sessionChanged',
]);
/** What a failed online request says to the reader. */
export function onlineError(error: unknown) {
  if (error instanceof OnlineApiError) {
    if (error.status === 401) return $t('common.sessionExpiredSignAgain');
    if (error.status === 403) return $t('onlineAgent.accessDenied');
    if (error.status === 404) return $t('onlineAgent.notFound');
    return $t(
      knownErrors.has(error.code)
        ? `onlineAgent.${error.code}`
        : 'onlineAgent.requestFailed',
    );
  }
  return $t('onlineAgent.requestFailed');
}
/** Lives inside MeProvider's session + authorization boundary. No shared cache or global credentials. */
export function useOnlineApi() {
  const api = useApiClient();
  const { session } = useAuthentication();
  const identity = session?.session.id;
  const pendingRef = useRef(new Set<AbortController>());
  useEffect(() => {
    const requests = pendingRef.current;
    return () => {
      for (const request of requests) request.abort();
    };
  }, [identity]);
  return useCallback(
    async <T>(
      path: string,
      body?: unknown,
      method: 'POST' | 'PUT' = 'POST',
      signal?: AbortSignal,
    ): Promise<T> => {
      const controller = new AbortController();
      pendingRef.current.add(controller);
      const combined = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      try {
        const payload = await api.request<{ data: T }>({
          path: `onlineAgents/${path}`,
          method: body === undefined ? 'GET' : method,
          headers: identity ? { 'X-NocoReach-Session': identity } : undefined,
          ...(body === undefined ? {} : { json: body }),
          signal: combined,
        });
        combined.throwIfAborted();
        return payload.data;
      } catch (error) {
        if (error instanceof ApiClientError)
          throw new OnlineApiError(
            error.status,
            error.reason || 'requestFailed',
          );
        throw error;
      } finally {
        pendingRef.current.delete(controller);
      }
    },
    [api, identity],
  );
}
export function useOnlineResource<T>(path: string, refresh = 0) {
  const api = useOnlineApi();
  const [state, setState] = useState<{
    key: string;
    path: string;
    data?: T;
    error?: unknown;
  }>();
  const key = `${path}:${refresh}`;
  useEffect(() => {
    const controller = new AbortController();
    void api<T>(path, undefined, undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, path, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState((previous) => ({
            key,
            path,
            error,
            data:
              error instanceof OnlineApiError &&
              [401, 403, 404].includes(error.status)
                ? undefined
                : previous?.path === path
                  ? previous.data
                  : undefined,
          }));
      });
    return () => controller.abort();
  }, [api, path, key]);
  const update = (change: (previous: T | undefined) => T) =>
    setState((previous) => ({
      key,
      path,
      data: change(previous?.path === path ? previous.data : undefined),
    }));
  return {
    ...(state?.path === path ? state : undefined),
    loading: state?.key !== key,
    update,
  };
}
