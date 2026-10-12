import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { $t, useMessageState, useNocoReachLocale } from '#i18n';
import { xiaohongshuErrorMessage } from './xiaohongshu-errors';
import { xiaohongshuRequest } from './xiaohongshu-api';
import { ListSkeleton, EmptyState } from '#components/reach/states';
import { Search } from 'lucide-react';
import { Button } from '#components/ui/button';
import { confirmAction } from '#components/reach/confirm';
import { useMe } from './me';

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
  collectors: { id: string; name: string }[];
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
  notes: XiaohongshuNote[];
  latestIds: string[];
}
const messages: Record<string, string> = {
  collector_unreachable: 'xiaohongshu.cannotReachXiaohongshuCollectorCheck',
  collector_unauthorized:
    'xiaohongshu.collectorAuthenticationFailedAskAdministrator',
  tool_missing: 'common.opencliNotInstalledCollectorAsk',
  browser_unavailable: 'xiaohongshu.collectorCannotReachBrowserOpen',
  login_required: 'xiaohongshu.signXiaohongshuYourselfCollectorBrowser',
  security_block: 'xiaohongshu.xiaohongshuRequiresVerificationRestrictedAccess',
  timeout: 'xiaohongshu.collectionTimedOutPreviousSuccessful',
  invalid_response: 'xiaohongshu.collectorReturnedIncompleteInvalidData',
  busy: 'common.collectorBusyAnotherRequestTry',
  no_results: 'xiaohongshu.noVerifiableNotesReturnedCurrent',
  cancelled: 'xiaohongshu.collectionCanceledPreviousSuccessfulResults',
};

export function XiaohongshuConnect({
  projectId,
  onChange,
}: {
  projectId: number;
  onChange: () => void;
}) {
  const { isAdmin } = useMe();
  const { session, refresh } = useAuthentication();
  const locale = useNocoReachLocale();
  const adminRef = useRef(isAdmin);
  useEffect(() => {
    adminRef.current = isAdmin;
  }, [isAdmin]);
  const [data, setData] = useState<XiaohongshuView | null>(null);
  const [collectorId, setCollectorId] = useState('');
  const [query, setQuery] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useMessageState('');
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useMessageState('');
  const [submitted, setSubmitted] = useState(false);
  const [shown, setShown] = useState(20);
  const mountedRef = useRef(true);
  const confirmationRef = useRef<AbortController | null>(null);
  const lockRef = useRef(false);
  const cancelLockRef = useRef(false);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const collectorInputRef = useRef<HTMLSelectElement>(null);
  const authorizationInputRef = useRef<HTMLInputElement>(null);
  const setFailure = useCallback(
    (e: unknown) => {
      if (!mountedRef.current) return;
      const status = (e as { status?: number }).status;
      setBlocked([401, 403, 404].includes(status ?? 0));
      setError(() =>
        status === 401
          ? $t('xiaohongshu.sessionExpiredSignNocoreachAgain')
          : status === 403
            ? $t('xiaohongshu.notPermissionPerformAction')
            : status === 404
              ? $t('xiaohongshu.projectEndpointNoLongerExists')
              : e instanceof Error
                ? xiaohongshuErrorMessage(e)
                : $t('common.operationFailedRetry'),
      );
    },
    [setError],
  );
  const load = useCallback(async () => {
    const value = await xiaohongshuRequest<XiaohongshuView>(projectId, 'view');
    if (mountedRef.current) setData(value);
    return value;
  }, [projectId]);
  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    void xiaohongshuRequest<XiaohongshuView>(projectId, 'view')
      .then((value) => {
        if (disposed) return;
        setData(value);
        setCollectorId(value.collectorId || value.collectors[0]?.id || '');
        setQuery(value.query);
      })
      .catch((e: unknown) => {
        if (!disposed) setFailure(e);
      });
    return () => {
      disposed = true;
      mountedRef.current = false;
    };
    // Each project is keyed by the parent. Closing does not cancel an explicitly started collection.
  }, [projectId, setFailure]);
  useEffect(() => {
    const owner = new AbortController();
    confirmationRef.current = owner;
    if (!isAdmin) owner.abort();
    return () => owner.abort();
  }, [isAdmin]);
  useEffect(() => {
    if (!data?.running && busy !== 'search') return;
    const timer = setInterval(() => {
      void load().catch(setFailure);
    }, 1500);
    return () => clearInterval(timer);
    // Polling deliberately never updates the editable query or collector draft.
  }, [data?.running, busy, load, setFailure]);
  async function run(action: string, task: () => Promise<void>) {
    if (
      !mountedRef.current ||
      lockRef.current ||
      (action !== 'load' && !adminRef.current)
    )
      return;
    lockRef.current = true;
    setBusy(action);
    setError('');
    setNotice('');
    setBlocked(false);
    try {
      await task();
    } catch (e) {
      setFailure(e);
      if (mountedRef.current && (e as { status?: number }).status === 409)
        await load().catch(setFailure);
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
        setData(value);
        setNotice(() => $t('xiaohongshu.xiaohongshuNotesCollectedSaved'));
      }
    } finally {
      if (mountedRef.current) await load().catch(setFailure);
      // Keep the catalog's outcome current after errors and after this sheet
      // has closed, not only after a successful collection.
      onChange();
    }
  }
  const running = Boolean(data?.running || busy === 'search');
  if (!data)
    return (
      <div className='grid gap-3'>
        {error ? (
          <>
            <p role='alert' className='nr-error'>
              {error}
            </p>
            {!blocked && (
              <Button
                variant='outline'
                onClick={() =>
                  void run('load', async () => {
                    const v = await load();
                    setCollectorId(v.collectorId || v.collectors[0]?.id || '');
                    setQuery(v.query);
                  })
                }
              >
                {$t('common.retry')}
              </Button>
            )}
          </>
        ) : (
          <div role='status' aria-label={$t('common.loadingLoading')}>
            <ListSkeleton rows={3} />
          </div>
        )}
      </div>
    );
  const form = isAdmin && (!data.connected || editing);
  const queryValid =
    query.trim().length >= 2 &&
    query.trim().length <= 60 &&
    !/^-/.test(query.trim()) &&
    ![...query].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
  const fieldErrors = {
    collector: submitted && !collectorId,
    query: submitted && !queryValid,
    authorization: submitted && !authorized,
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
    if (!authorized) {
      authorizationInputRef.current?.focus();
      return false;
    }
    return true;
  };
  return (
    <div className='grid gap-4' data-xiaohongshu-connect>
      <div className='rounded-md border border-border bg-muted/30 p-3 text-sm'>
        <p className='font-medium'>
          {$t('xiaohongshu.useAuthorizedBrowserManualCollection')}
        </p>
        <p className='mt-1 text-muted-foreground'>
          {$t('xiaohongshu.searchPublicNotesReadUsing')}
        </p>
        <p className='mt-1 text-muted-foreground'>
          {$t('xiaohongshu.resultsAvailableViewingArchivingNot')}
        </p>
        <p className='mt-1 text-muted-foreground'>
          {$t('xiaohongshu.browserUsesCollectorComputerS')}
        </p>
      </div>
      {error && (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      )}
      {notice && (
        <p role='status' className='text-sm'>
          {notice}
        </p>
      )}
      {!data.configured && (
        <div className='grid gap-2 text-sm'>
          <h3 className='font-medium'>
            {$t('xiaohongshu.noXiaohongshuCollectorConfigured')}
          </h3>
          <p className='text-muted-foreground'>
            {$t('xiaohongshu.collectorSetupHelp')}
          </p>
        </div>
      )}
      {form && data.configured && (
        <form
          className='grid gap-3'
          onSubmit={(e) => {
            e.preventDefault();
            if (!validate()) return;
            void run('save', async () => {
              const value = await xiaohongshuRequest<XiaohongshuView>(
                projectId,
                'connect',
                {
                  collectorId,
                  query: query.trim(),
                  revision: data.revision,
                  authorized,
                },
              );
              if (mountedRef.current) {
                setData(value);
                setEditing(false);
                setAuthorized(false);
                resetValidation();
                setNotice(() =>
                  $t('xiaohongshu.connectionSavedBrowserLoginNot'),
                );
                onChange();
              }
            });
          }}
        >
          <label className='nr-field'>
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
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {fieldErrors.collector && (
            <p role='alert' className='nr-error'>
              {$t('xiaohongshu.selectConfiguredCollector')}
            </p>
          )}
          <label className='nr-field'>
            {$t('xiaohongshu.xiaohongshuSearchPhrase')}{' '}
            <span aria-hidden='true' className='text-destructive'>
              *
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
          <p className='nr-footnote'>
            {$t('xiaohongshu.enterOnePhraseManualSearch')}
          </p>
          <label className='flex items-start gap-2 text-sm'>
            <input
              ref={authorizationInputRef}
              type='checkbox'
              aria-required='true'
              aria-invalid={fieldErrors.authorization}
              checked={authorized}
              disabled={Boolean(busy) || running}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            <span>
              {$t('xiaohongshu.iAmAuthorizedUseCollector')}{' '}
              <span aria-hidden='true' className='text-destructive'>
                *
              </span>
            </span>
          </label>
          {fieldErrors.authorization && (
            <p role='alert' className='nr-error'>
              {$t('xiaohongshu.errors.authorizationRequired')}
            </p>
          )}
          <div className='nr-step-actions flex-wrap'>
            <Button
              type='submit'
              disabled={Boolean(busy) || running || blocked}
            >
              {busy === 'save'
                ? $t('common.saving')
                : $t('xiaohongshu.saveConnection')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={Boolean(busy) || running || !collectorId || blocked}
              onClick={() =>
                void run('test', async () => {
                  await xiaohongshuRequest(projectId, 'test', { collectorId });
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
            {editing && (
              <Button
                type='button'
                variant='ghost'
                disabled={Boolean(busy)}
                onClick={() => {
                  setEditing(false);
                  setQuery(data.query);
                  setCollectorId(data.collectorId || '');
                  setAuthorized(false);
                  resetValidation();
                }}
              >
                {$t('common.cancel')}
              </Button>
            )}
          </div>
        </form>
      )}
      {data.connected && !editing && (
        <section className='grid gap-2'>
          <h3 className='font-medium'>
            {$t('common.search', { 0: data.query })}
          </h3>
          <p className='nr-footnote'>
            {data.collectors.find((c) => c.id === data.collectorId)?.name} ·{' '}
            {data.verifiedAt
              ? $t('xiaohongshu.lastSuccessfulCollection', {
                  0: new Date(data.verifiedAt).toLocaleString(locale),
                })
              : $t('xiaohongshu.browserXiaohongshuLoginNotYet')}
          </p>
          {isAdmin && (
            <div className='nr-step-actions flex-wrap'>
              <Button
                disabled={Boolean(busy) || running || blocked}
                onClick={() => void run('search', () => search(data.revision))}
              >
                {running
                  ? $t('xiaohongshu.collecting')
                  : $t('xiaohongshu.searchNow')}
              </Button>
              <Button
                variant='outline'
                disabled={Boolean(busy) || running || blocked}
                onClick={() =>
                  void run('edit', async () => {
                    const latest = await load();
                    if (mountedRef.current) {
                      setQuery(latest.query);
                      setCollectorId(latest.collectorId || '');
                      setEditing(true);
                      setAuthorized(false);
                      resetValidation();
                    }
                  })
                }
              >
                {$t('xiaohongshu.editConnection')}
              </Button>
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
                      !adminRef.current ||
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
                        !adminRef.current ||
                        confirmation.signal.aborted
                      )
                        return;
                      if (
                        error instanceof Error &&
                        'code' in error &&
                        error.code === 'NOCOREACH_CONFIRMATION_SESSION_CHANGED'
                      ) {
                        await refresh();
                        return;
                      }
                      throw error;
                    }
                    if (
                      mountedRef.current &&
                      adminRef.current &&
                      !confirmation.signal.aborted
                    ) {
                      setData(value);
                      setNotice(() =>
                        $t('xiaohongshu.xiaohongshuDisconnectedSavedNotesKept'),
                      );
                      onChange();
                    }
                  })
                }
              >
                {$t('common.disconnect')}
              </Button>
            </div>
          )}
        </section>
      )}
      {running && (
        <div className='grid gap-2'>
          <p role='status' className='nr-footnote'>
            {$t('xiaohongshu.searchingCollectorBrowserUpAbout')}
          </p>
          {isAdmin && data.running && (
            <Button
              variant='outline'
              disabled={cancelling || blocked}
              onClick={() => {
                const requestId = data.running;
                if (!requestId || !adminRef.current || cancelLockRef.current)
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
          {$t(
            messages[data.lastRun.errorCode || 'invalid_response'] ||
              messages.invalid_response,
          )}{' '}
          {data.notes.length > 0 &&
            $t('xiaohongshu.dataBelowPreviousSuccessfulCollection')}
        </p>
      )}
      {!data.notes.length ? (
        <EmptyState
          icon={<Search />}
          title={$t('xiaohongshu.noSavedNotesYet')}
          description={$t(
            isAdmin
              ? 'xiaohongshu.saveConnectionChooseSearchNow'
              : 'xiaohongshu.noConfirmedNotesYetAsk',
          )}
        />
      ) : (
        <section className='grid gap-2'>
          <h3 className='font-medium'>
            {$t('xiaohongshu.savedNotes', { 0: data.total })}
          </h3>
          <p className='nr-footnote'>
            {$t('xiaohongshu.retentionAndMetricsHelp')}
          </p>
          <ul className='grid gap-3'>
            {data.notes.slice(0, shown).map((note) => (
              <li
                className='min-w-0 rounded-md border border-border p-3'
                key={note.id}
              >
                <a
                  className='nr-link break-words font-medium'
                  href={note.url}
                  target='_blank'
                  rel='noreferrer'
                >
                  {note.title}
                </a>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {$t('xiaohongshu.displayedLikes', {
                    0: note.likesText ?? $t('common.unknown'),
                  })}
                </p>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {note.estimatedPublishedAt
                    ? $t('xiaohongshu.estimatedPublicationDate', {
                        0: note.estimatedPublishedAt,
                      })
                    : $t('xiaohongshu.publicationTimeUnknown')}{' '}
                  ·{' '}
                  {$t('xiaohongshu.collected', {
                    0: new Date(note.lastSeenAt).toLocaleString(locale),
                  })}
                </p>
                <p className='mt-1 break-words text-xs text-muted-foreground'>
                  {$t('common.searchTermValue', { 0: note.query })}
                </p>
              </li>
            ))}
          </ul>
          {shown < data.notes.length && (
            <Button variant='outline' onClick={() => setShown((n) => n + 20)}>
              {$t('xiaohongshu.showMore')}
            </Button>
          )}
        </section>
      )}
      <p className='nr-footnote'>
        {$t('xiaohongshu.currentlySupportsSearchResultCollection')}
      </p>
    </div>
  );
}
