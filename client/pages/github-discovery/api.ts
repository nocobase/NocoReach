import { useCallback, useEffect, useState } from 'react';
import { nocobaseClient as api, NocoReachHttpError } from '#lib/nocoreach-api';
import type { DiscoveryStatus } from '../../../shared/github-discovery.js';
export * from '../../../shared/github-discovery.js';
export const discoveryRequest = <T>(
  projectId: number,
  action: string,
  body: object = {},
  options: { signal?: AbortSignal; headers?: Record<string, string> } = {},
) =>
  api.action<T>('nrGitHubDiscovery', action, {
    method: 'POST',
    body: { projectId, ...body },
    unwrap: 'data',
    ...options,
  });
export const retryable = (error: unknown) =>
  !(error instanceof NocoReachHttpError) ||
  ![401, 403, 404].includes(error.status);
export function useDiscoveryStatus(projectId: number) {
  const [data, setData] = useState<DiscoveryStatus>();
  const [error, setError] = useState<unknown>();
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const next = await discoveryRequest<DiscoveryStatus>(
          projectId,
          'status',
          {},
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setData(next);
        setError(undefined);
        if (next.running) timer = setTimeout(() => void read(), 2500);
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e);
          if (!retryable(e)) setData(undefined);
        }
      }
    };
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [projectId, version]);
  const accept = (next: DiscoveryStatus) => {
    setData(next);
    reload();
  };
  return { data, error, reload, accept };
}
