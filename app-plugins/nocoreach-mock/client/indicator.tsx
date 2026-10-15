import { useEffect, useState, type ReactNode } from 'react';
import type { MockStatus } from '../server/types.js';
import type { MockIndicatorHost } from './types.js';
import { indicatorCopy } from './indicator-copy.js';

/** Read-only status UI, independent of the standalone settings form. */
export function createMockIndicator(
  host: MockIndicatorHost,
  subscribe?: (listener: () => void) => () => void,
) {
  function IndicatorBody({
    projectId,
    locale,
    fallback,
  }: {
    projectId: string;
    locale: string;
    fallback: ReactNode;
  }) {
    const c = indicatorCopy(locale),
      [epoch, setEpoch] = useState(0);
    const [result, setResult] = useState<{
      data?: MockStatus;
      error?: unknown;
    }>({});
    useEffect(() => subscribe?.(() => setEpoch((v) => v + 1)), []);
    useEffect(() => {
      const controller = new AbortController();
      let active = true;
      void host.request('status', { projectId }, controller.signal).then(
        (data) => {
          if (active && data.projectId === projectId) setResult({ data });
          else if (active)
            setResult({ error: new Error('NR_MOCK_PROJECT_MISMATCH') });
        },
        (error: unknown) => {
          if (active) setResult({ error });
        },
      );
      return () => {
        active = false;
        controller.abort();
      };
    }, [projectId, epoch]);
    if (result.error)
      return (
        <host.components.StatusIcon
          label={c.unknown}
          description={c.retry}
          state='unknown'
          onRetry={() => setEpoch((v) => v + 1)}
        />
      );
    if (!result.data?.globalEnabled) return fallback;
    return (
      <host.components.StatusIcon
        label={c.indicator}
        description={
          result.data.enabled ? c.indicatorBody : c.indicatorDisabled
        }
        state={result.data.enabled ? 'enabled' : 'disabled'}
      />
    );
  }
  function MockIndicator({ fallback = null }: { fallback?: ReactNode }) {
    const context = host.useContext();
    return context.role ? (
      <IndicatorBody
        key={context.scopeKey}
        projectId={context.projectId}
        locale={context.locale}
        fallback={fallback}
      />
    ) : (
      fallback
    );
  }
  return MockIndicator;
}
