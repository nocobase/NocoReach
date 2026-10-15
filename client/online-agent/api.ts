import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveAppUrl } from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import type {
  OnlineAgentDefinition,
  OnlineConversation,
  OnlineRun,
} from '../../shared/online-agent.js';
export type Agent = OnlineAgentDefinition & { ready: boolean };
export type ConversationDetail = {
  conversation: OnlineConversation;
  runs: OnlineRun[];
};
export class OnlineApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
/** Lives inside MeProvider's session + authorization boundary. No shared cache or global credentials. */
export function useOnlineApi() {
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
      method = 'POST',
      signal?: AbortSignal,
    ): Promise<T> => {
      const controller = new AbortController();
      pendingRef.current.add(controller);
      const combined = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      try {
        const response = await fetch(
          resolveAppUrl(`/api/onlineAgents/${path}`),
          {
            method: body === undefined ? 'GET' : method,
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(identity ? { 'X-NocoReach-Session': identity } : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: combined,
          },
        );
        const payload = (await response.json()) as {
          data: T;
          error?: { reason?: string };
        };
        combined.throwIfAborted();
        if (!response.ok || payload.error)
          throw new OnlineApiError(
            response.status,
            payload.error?.reason || 'requestFailed',
          );
        return payload.data;
      } finally {
        pendingRef.current.delete(controller);
      }
    },
    [identity],
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
