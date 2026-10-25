import { formatDateTime } from '#lib/format';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { $t, useMessageState, useNocoReachLocale } from '#i18n';
import { collectorName, type CollectorChoice } from '#lib/collector-platforms';
import { useNavigate } from 'react-router';
import {
  xiaohongshuErrorMessage,
  xiaohongshuRunMessage,
} from './xiaohongshu-errors';
import { xiaohongshuRequest } from './xiaohongshu-api';
import { ListSkeleton } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { confirmAction } from '#components/reach/confirm';
import { InfoTip } from '#components/reach/info-tip';
import { useBusinessAccess } from '#hooks/use-business-access';
import { CollectorClear } from '#components/collector-clear';

export interface XiaohongshuNote {
  id: string;
  title: string;
  url: string;
  likes: number | null;
  likesText: string | null;
  publishedAt: null;
  estimatedPublishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  query: string;
}
export interface XiaohongshuView {
  connected: boolean;
  revision: number;
  configured: boolean;
  collectorId: string | null;
  collectors: CollectorChoice[];
  query: string;
  verifiedAt: string | null;
  lastRun: {
    at: string;
    ok: boolean;
    errorCode?: string;
    count?: number;
  } | null;
  total: number;
  running: string | null;
}
function collectorSelection(view: XiaohongshuView, current = '') {
  return view.collectors.some((collector) => collector.id === current)
    ? current
    : view.collectorId || view.collectors[0]?.id || '';
}
interface Failure {
  status: number;
  message: () => string;
}
function failure(error: unknown): Failure {
  const status = Number((error as { status?: number })?.status || 0);
  return {
    status,
    message: () =>
      status === 401
        ? $t('xiaohongshu.sessionExpiredSignNocoreachAgain')
        : status === 403
          ? $t('xiaohongshu.notPermissionPerformAction')
          : status === 404
            ? $t('xiaohongshu.projectEndpointNoLongerExists')
            : error instanceof Error
              ? xiaohongshuErrorMessage(error)
              : $t('common.operationFailedRetry'),
  };
}

export function XiaohongshuConnect({
  projectId,
  refreshKey = 0,
  onChange,
}: {
  projectId: number;
  refreshKey?: number;
  onChange: () => void;
}) {
  const { can: canConnect } = useBusinessAccess(
    'nrXiaohongshu.connect',
    projectId,
  );
  const { can: canTest } = useBusinessAccess('nrXiaohongshu.test', projectId);
  const { can: canSearch } = useBusinessAccess(
    'nrXiaohongshu.search',
    projectId,
  );
  const { can: canCancel } = useBusinessAccess(
    'nrXiaohongshu.cancel',
    projectId,
  );
  const { can: canDisconnect } = useBusinessAccess(
    'nrXiaohongshu.disconnect',
    projectId,
  );
  const { session, refresh } = useAuthentication();
  useNocoReachLocale();
  const accessRef = useRef({
    connect: canConnect,
    test: canTest,
    search: canSearch,
    cancel: canCancel,
    disconnect: canDisconnect,
  });
  // A layout effect, not a passive one: a button appears in the commit that grants its permission, and a passive
  // effect can run after the browser has already dispatched a click to it, so the handler would see the old denial.
  useLayoutEffect(() => {
    accessRef.current = {
      connect: canConnect,
      test: canTest,
      search: canSearch,
      cancel: canCancel,
      disconnect: canDisconnect,
    };
  }, [canConnect, canTest, canSearch, canCancel, canDisconnect]);
  const [data, setData] = useState<XiaohongshuView | null>(null);
  const [collectorId, setCollectorId] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [loadError, setLoadError] = useState<Failure | null>(null);
  const [notice, setNotice] = useMessageState('');
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const initializedRef = useRef(false);
  const readsRef = useRef(0);
  const confirmationRef = useRef<AbortController | null>(null);
  const lockRef = useRef(false);
  const cancelLockRef = useRef(false);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const collectorInputRef = useRef<HTMLSelectElement>(null);
  const setFailure = useCallback((e: unknown) => {
    if (mountedRef.current) setError(failure(e));
  }, []);
  function updateFromMutation(value: XiaohongshuView) {
    // Reads started before this write must not replace its state or report stale errors.
    readsRef.current += 1;
    setData(value);
    setLoadError(null);
  }
  const load = useCallback(async () => {
    const sequence = ++readsRef.current;
    try {
      const value = await xiaohongshuRequest<XiaohongshuView>(
        projectId,
        'status',
      );
      if (!mountedRef.current || sequence !== readsRef.current) return;
      setData(value);
      // A successful status read recovers read errors, not failed mutations.
      setLoadError(null);
      setCollectorId((current) => collectorSelection(value, current));
      if (!initializedRef.current) {
        setQuery(value.query);
        initializedRef.current = true;
      }
      return value;
    } catch (e) {
      if (mountedRef.current && sequence === readsRef.current)
        setLoadError(failure(e));
    }
  }, [projectId]);
  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    void Promise.resolve().then(() => {
      if (active) return load();
    });
    return () => {
      active = false;
      mountedRef.current = false;
    };
    // Each project is keyed by the parent. Closing does not cancel an explicitly started collection.
  }, [load]);
  const refreshedKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (busy || refreshedKeyRef.current === refreshKey) return;
    refreshedKeyRef.current = refreshKey;
    void Promise.resolve().then(() => {
      if (!mountedRef.current) return;
      setNotice('');
      return load();
    });
  }, [busy, load, refreshKey, setNotice]);
  // A layout effect for the same reason: Disconnect must not reach the aborted owner of the denial it replaces.
  useLayoutEffect(() => {
    const owner = new AbortController();
    confirmationRef.current = owner;
    if (!canDisconnect) owner.abort();
    return () => owner.abort();
  }, [canDisconnect]);
  useEffect(() => {
    if (!data?.running && busy !== 'search') return;
    const timer = setInterval(() => {
      void load();
    }, 1500);
    return () => clearInterval(timer);
    // Polling preserves the editable query and any still-valid collector choice.
  }, [data?.running, busy, load]);
  async function run(
    action: 'load' | 'edit' | 'connect' | 'test' | 'search' | 'disconnect',
    task: () => Promise<void>,
  ) {
    if (
      !mountedRef.current ||
      lockRef.current ||
      (action !== 'load' &&
        !accessRef.current[action === 'edit' ? 'connect' : action])
    )
      return;
    lockRef.current = true;
    setBusy(action);
    setError(null);
    setNotice('');
    try {
      await task();
    } catch (e) {
      setFailure(e);
      if (mountedRef.current && (e as { status?: number }).status === 409)
        await load();
    } finally {
      lockRef.current = false;
      if (mountedRef.current) setBusy('');
    }
  }
  async function search(rev: number) {
    try {
      const value = await xiaohongshuRequest<XiaohongshuView>(
        projectId,
        'search',
        { revision: rev },
      );
      if (mountedRef.current) {
        updateFromMutation(value);
        setNotice(() => $t('xiaohongshu.xiaohongshuNotesCollectedSaved'));
      }
    } finally {
      if (mountedRef.current) await load();
      // Keep the catalog's outcome current after errors and after this sheet
      // has closed, not only after a successful collection.
      onChange();
    }
  }
  const running = Boolean(data?.running || busy === 'search');
  const blocked = [loadError, error].some((problem) =>
    [401, 403, 404].includes(problem?.status ?? 0),
  );
  const errorState =
    error || loadError ? (
      <>
        {loadError && (
          <p role='alert' className='nr-error'>
            {loadError.message()}
          </p>
        )}
        {error && (
          <p role='alert' className='nr-error'>
            {error.message()}
          </p>
        )}
        {!blocked && (
          <Button
            type='button'
            variant='outline'
            disabled={Boolean(busy)}
            onClick={() =>
              void run('load', async () => {
                await load();
              })
            }
          >
            {$t('common.retry')}
          </Button>
        )}
      </>
    ) : null;
  if (!data)
    return (
      <div className='grid gap-3'>
        {errorState || (
          <div role='status' aria-label={$t('common.loadingLoading')}>
            <ListSkeleton rows={3} />
          </div>
        )}
      </div>
    );
  const form = canConnect && (!data.connected || editing);
  const queryValid =
    query.trim().length >= 2 &&
    query.trim().length <= 60 &&
    !/^-/.test(query.trim()) &&
    ![...query].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
  const fieldErrors = {
    collector: submitted && !collectorId,
    query: submitted && !queryValid,
  };
  const resetValidation = () => {
    setSubmitted(false);
  };
  const validate = () => {
    setSubmitted(true);
    if (!collectorId) {
      collectorInputRef.current?.focus();
      return false;
    }
    if (!queryValid) {
      queryInputRef.current?.focus();
      return false;
    }
    return true;
  };
  const scopeTip = (
    <InfoTip className='ml-1'>
      {$t('xiaohongshu.currentlySupportsSearchResultCollection')}
    </InfoTip>
  );
  return (
    <div className='grid gap-4' data-xiaohongshu-connect>
      {errorState}
      {notice && (
        <p role='status' className='text-sm'>
          {notice}
        </p>
      )}
      {!data.configured && !canConnect && (
        <div className='grid gap-2 text-sm'>
          <h3 className='font-medium'>
            {$t('xiaohongshu.noXiaohongshuCollectorConfigured')}
          </h3>
          <p className='text-muted-foreground'>
            {$t('xiaohongshu.collectorSetupHelp')}
          </p>
        </div>
      )}
      {(form || (canTest && !canConnect)) && data.configured && (
        <form
          className='grid gap-3'
          onSubmit={(e) => {
            e.preventDefault();
            if (!canConnect) return;
            if (!validate()) return;
            void run('connect', async () => {
              const value = await xiaohongshuRequest<XiaohongshuView>(
                projectId,
                'connect',
                {
                  collectorId,
                  query: query.trim(),
                  revision: data.revision,
                },
              );
              if (mountedRef.current) {
                updateFromMutation(value);
                setEditing(false);
                resetValidation();
                setNotice(() =>
                  $t('xiaohongshu.connectionSavedBrowserLoginNot'),
                );
                onChange();
              }
            });
          }}
        >
          <label className='nr-field' hidden={data.collectors.length === 1}>
            {$t('xiaohongshu.collector')}{' '}
            <span aria-hidden='true' className='text-destructive'>
              *
            </span>
            <select
              ref={collectorInputRef}
              aria-label={$t('xiaohongshu.collector')}
              aria-required='true'
              aria-invalid={fieldErrors.collector}
              disabled={Boolean(busy) || running}
              value={collectorId}
              onChange={(e) => {
                setCollectorId(e.target.value);
                setNotice('');
              }}
            >
              <option value=''>
                {$t('xiaohongshu.selectConfiguredCollector')}
              </option>
              {data.collectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {collectorName(c)}
                </option>
              ))}
            </select>
          </label>
          {fieldErrors.collector && (
            <p role='alert' className='nr-error'>
              {$t('xiaohongshu.selectConfiguredCollector')}
            </p>
          )}
          {canConnect && (
            <>
              <label className='nr-field'>
                <span className='inline-flex items-center gap-1'>
                  {$t('xiaohongshu.xiaohongshuSearchPhrase')}
                  <span aria-hidden='true' className='text-destructive'>
                    *
                  </span>
                  <InfoTip>
                    {$t('xiaohongshu.enterOnePhraseManualSearch')}
                  </InfoTip>
                </span>
                <input
                  ref={queryInputRef}
                  aria-label={$t('xiaohongshu.xiaohongshuSearchPhrase')}
                  aria-required='true'
                  aria-invalid={fieldErrors.query}
                  value={query}
                  disabled={Boolean(busy) || running}
                  maxLength={60}
                  placeholder='NocoBase'
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {fieldErrors.query && (
                <p role='alert' className='nr-error'>
                  {$t('xiaohongshu.errors.invalidQuery')}
                </p>
              )}
            </>
          )}
          <div className='nr-step-actions flex-wrap'>
            {canConnect && (
              <Button
                type='submit'
                disabled={Boolean(busy) || running || blocked}
              >
                {busy === 'connect'
                  ? $t('common.saving')
                  : $t('xiaohongshu.saveConnection')}
              </Button>
            )}
            {canTest && (
              <Button
                type='button'
                variant='outline'
                disabled={Boolean(busy) || running || !collectorId || blocked}
                onClick={() =>
                  void run('test', async () => {
                    await xiaohongshuRequest(projectId, 'test', {
                      collectorId,
                    });
                    if (mountedRef.current)
                      setNotice(() =>
                        $t(
                          'xiaohongshu.collectorReachableOpencliInstalledBrowser',
                        ),
                      );
                  })
                }
              >
                {busy === 'test'
                  ? $t('common.checking')
                  : $t('common.checkCollector')}
              </Button>
            )}
            {editing && canConnect && (
              <Button
                type='button'
                variant='ghost'
                disabled={Boolean(busy)}
                onClick={() => {
                  setEditing(false);
                  setQuery(data.query);
                  setCollectorId(collectorSelection(data));
                  resetValidation();
                }}
              >
                {$t('common.cancel')}
              </Button>
            )}
          </div>
        </form>
      )}
      {data.connected && !form && (
        <section className='grid gap-2'>
          <h3 className='font-medium'>
            {$t('common.search', { 0: data.query })}
          </h3>
          <p className='nr-footnote'>
            {collectorName(
              data.collectors.find((c) => c.id === data.collectorId),
            )}{' '}
            ·{' '}
            {data.verifiedAt
              ? $t('xiaohongshu.lastSuccessfulCollection', {
                  0: formatDateTime(data.verifiedAt),
                })
              : $t('xiaohongshu.browserXiaohongshuLoginNotYet')}
          </p>
          {(canConnect || canSearch || canDisconnect) && (
            <div className='nr-step-actions flex-wrap'>
              {canSearch && (
                <Button
                  disabled={Boolean(busy) || running || blocked}
                  onClick={() =>
                    void run('search', () => search(data.revision))
                  }
                >
                  {running
                    ? $t('xiaohongshu.collecting')
                    : $t('xiaohongshu.searchNow')}
                </Button>
              )}
              {canConnect && (
                <Button
                  variant='outline'
                  disabled={Boolean(busy) || running || blocked}
                  onClick={() =>
                    void run('edit', async () => {
                      const latest = await load();
                      if (latest && mountedRef.current) {
                        setQuery(latest.query);
                        setCollectorId(collectorSelection(latest));
                        setEditing(true);
                        resetValidation();
                      }
                    })
                  }
                >
                  {$t('xiaohongshu.editConnection')}
                </Button>
              )}
              {canDisconnect && (
                <Button
                  variant='ghost'
                  disabled={Boolean(busy) || running || blocked}
                  onClick={() =>
                    void run('disconnect', async () => {
                      const confirmation = confirmationRef.current;
                      const confirmationSessionId = session?.session.id;
                      if (
                        !confirmation ||
                        confirmation.signal.aborted ||
                        !confirmationSessionId
                      )
                        return;
                      if (
                        !(await confirmAction({
                          title: 'xiaohongshu.disconnectXiaohongshuCollector',
                          description: 'xiaohongshu.savedNotesKeptConnectionNo',
                          action: 'common.disconnect',
                          signal: confirmation.signal,
                        }))
                      )
                        return;
                      // The shared dialog has its own root; the initiating owner must still be active.
                      if (
                        !mountedRef.current ||
                        !accessRef.current.disconnect ||
                        confirmation.signal.aborted
                      )
                        return;
                      let value: XiaohongshuView;
                      try {
                        // Keep the initiating session, even when another tab replaces the cookie.
                        value = await xiaohongshuRequest<XiaohongshuView>(
                          projectId,
                          'disconnect',
                          { revision: data.revision },
                          confirmationSessionId,
                        );
                      } catch (error) {
                        // A late response must not refresh or report into a replacement owner.
                        if (
                          !mountedRef.current ||
                          !accessRef.current.disconnect ||
                          confirmation.signal.aborted
                        )
                          return;
                        if (
                          error instanceof Error &&
                          'code' in error &&
                          error.code ===
                            'NOCOREACH_CONFIRMATION_SESSION_CHANGED'
                        ) {
                          await refresh();
                          return;
                        }
                        throw error;
                      }
                      if (
                        mountedRef.current &&
                        accessRef.current.disconnect &&
                        !confirmation.signal.aborted
                      ) {
                        updateFromMutation(value);
                        setNotice(() =>
                          $t(
                            'xiaohongshu.xiaohongshuDisconnectedSavedNotesKept',
                          ),
                        );
                        onChange();
                      }
                    })
                  }
                >
                  {$t('common.disconnect')}
                </Button>
              )}
            </div>
          )}
        </section>
      )}
      {running && (
        <div className='grid gap-2'>
          <p role='status' className='nr-footnote'>
            {$t('xiaohongshu.searchingCollectorBrowserUpAbout')}
          </p>
          {canCancel && data.running && (
            <Button
              variant='outline'
              disabled={cancelling || blocked}
              onClick={() => {
                const requestId = data.running;
                if (
                  !requestId ||
                  !accessRef.current.cancel ||
                  cancelLockRef.current
                )
                  return;
                cancelLockRef.current = true;
                setCancelling(true);
                void xiaohongshuRequest(projectId, 'cancel', { requestId })
                  .then(() => {
                    if (mountedRef.current)
                      setNotice(() => $t('xiaohongshu.cancellationRequested'));
                    return load();
                  })
                  .catch(setFailure)
                  .finally(() => {
                    cancelLockRef.current = false;
                    if (mountedRef.current) setCancelling(false);
                  });
              }}
            >
              {cancelling
                ? $t('xiaohongshu.cancelling')
                : $t('xiaohongshu.cancelCollection')}
            </Button>
          )}
        </div>
      )}
      {data.lastRun && !data.lastRun.ok && (
        <p role='status' className='nr-footnote'>
          {xiaohongshuRunMessage(data.lastRun.errorCode)}
        </p>
      )}
      {data.total > 0 ? (
        <section className='grid gap-2'>
          <p className='nr-footnote'>
            {$t('collectorPage.savedSummary', { 0: data.total })}
            {scopeTip}
          </p>
          <div className='nr-step-actions'>
            <Button
              type='button'
              variant='outline'
              onClick={() => void navigate('/data/xiaohongshu')}
            >
              {$t('collectorPage.viewData')}
            </Button>
            <CollectorClear
              projectId={projectId}
              resource='nrXiaohongshu'
              revision={data.revision}
              total={data.total}
              disabled={Boolean(busy || data.running)}
              errorMessage={xiaohongshuErrorMessage}
              onCleared={async () => {
                await load();
                onChange();
              }}
            />
          </div>
        </section>
      ) : (
        <p className='nr-footnote'>
          {$t(
            canConnect && canSearch
              ? 'xiaohongshu.saveConnectionChooseSearchNow'
              : 'xiaohongshu.noConfirmedNotesYetAsk',
          )}
          {scopeTip}
        </p>
      )}
    </div>
  );
}
