import { countIn, formatCount, formatDate, formatDateTime } from '#lib/format';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { $t, useMessageState, useNocoReachLocale } from '#i18n';
import {
  collectorDocs,
  collectorName,
  type CollectorChoice,
} from '#lib/collector-platforms';
import { Link } from 'react-router';
import {
  xiaohongshuErrorMessage,
  xiaohongshuRunMessage,
} from './xiaohongshu-errors';
import { xiaohongshuRequest } from './xiaohongshu-api';
import { ListSkeleton } from '#components/reach/states';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import { Spinner } from '#components/ui/spinner';
import { chipClass } from '#components/reach/chip';
import { confirmAction } from '#components/reach/confirm';
import { InfoTip } from '#components/reach/info-tip';
import { useBusinessAccess } from '#hooks/use-business-access';
import { CollectorClear } from '#components/collector-clear';
import { safeLink } from './analytics';
import { sentences } from './task-detail/failure-model';
import { shownLikes } from './collector-columns';

// Xiaohongshu (2026-11-02): laid out as Bilibili's panel, but read by hand only, since frequent reads through the
// signed-in account can get it limited. A read the busy collector turned away is queued and retried the same way.

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
  /** A read the busy collector turned away, waiting for its retry. */
  queued: { retries: number; retryAt: string } | null;
  recent: Pick<
    XiaohongshuNote,
    'id' | 'title' | 'url' | 'likes' | 'likesText' | 'estimatedPublishedAt'
  >[];
  recordingSince: string | null;
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
  const locale = useNocoReachLocale();
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
  // The dialog closes for good when its collector or connect permission goes away, so it does not reopen by itself.
  const editable = canConnect && Boolean(data?.configured);
  if (editing && !editable) setEditing(false);
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
        // A read the busy collector turned away is queued: the queue notice below says when it tries again.
        if (value.queued) setNotice('');
        else setNotice(() => $t('xiaohongshu.xiaohongshuNotesCollectedSaved'));
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
  const form = canConnect && data.configured && editing;
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
  const locked = Boolean(busy) || running || blocked;
  const startEdit = () =>
    void run('edit', async () => {
      const latest = await load();
      if (latest && mountedRef.current) {
        setQuery(latest.query);
        setCollectorId(collectorSelection(latest));
        setEditing(true);
        resetValidation();
      }
    });
  const cancelEdit = () => {
    setEditing(false);
    // What the dialog said (a failed save) belongs to the discarded draft.
    setError(null);
    setNotice('');
    setQuery(data.query);
    setCollectorId(collectorSelection(data));
    resetValidation();
  };
  const disconnect = () =>
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
          error.code === 'NOCOREACH_CONFIRMATION_SESSION_CHANGED'
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
          $t('xiaohongshu.xiaohongshuDisconnectedSavedNotesKept'),
        );
        onChange();
      }
    });
  const stop = () => {
    const requestId = data.running;
    if (!requestId || !accessRef.current.cancel || cancelLockRef.current)
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
  };
  const collectorField = (
    <>
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
    </>
  );
  const testButton = canTest ? (
    <Button
      type='button'
      variant='outline'
      size='sm'
      className='justify-self-start'
      disabled={Boolean(busy) || running || !collectorId || blocked}
      onClick={() =>
        void run('test', async () => {
          await xiaohongshuRequest(projectId, 'test', {
            collectorId,
          });
          if (mountedRef.current)
            setNotice(() =>
              $t('xiaohongshu.collectorReachableOpencliInstalledBrowser'),
            );
        })
      }
    >
      {busy === 'test' ? $t('common.checking') : $t('common.checkCollector')}
    </Button>
  ) : null;
  const likes = (note: XiaohongshuView['recent'][number]) => {
    const shown = shownLikes(note);
    return shown === null ? null : countIn('xiaohongshu.likesCount', shown);
  };
  return (
    <div className='grid gap-4' data-xiaohongshu-connect>
      {!form && errorState}
      {notice && !form && (
        <p role='status' className='text-sm'>
          {notice}
        </p>
      )}
      {data.connected && !running ? <Problem data={data} /> : null}
      {!data.configured && !canConnect && (
        <div className='grid gap-2 text-sm'>
          <h3 className='font-medium'>
            {$t('xiaohongshu.noXiaohongshuCollectorConfigured')}
          </h3>
          <p className='text-muted-foreground'>
            {$t('xiaohongshu.collectorSetupHelp')}{' '}
            <a
              className='nr-link'
              href={collectorDocs.xiaohongshu}
              target='_blank'
              rel='noreferrer'
            >
              {$t('sourceConnections.deployGuide')}
            </a>
          </p>
        </div>
      )}
      {data.connected ? (
        <section
          className='nr-guide-connected grid gap-3'
          aria-label={$t('youtube.searchTerms')}
        >
          <div className='flex items-center justify-between gap-2'>
            <h3 className='!mb-0'>{$t('youtube.searchTerms')}</h3>
            {canConnect ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={locked}
                onClick={startEdit}
              >
                {$t('common.modify')}
              </Button>
            ) : null}
          </div>
          <div className='flex flex-wrap gap-1.5'>
            <span className={chipClass}>{data.query}</span>
          </div>
          {data.total > 0 ? (
            <p className='text-muted-foreground'>
              {$t('xiaohongshu.notesRecorded', {
                0: formatCount(data.total),
                1: data.recordingSince
                  ? $t('common.recordingSince', {
                      0: formatDate(data.recordingSince, { withYear: true }),
                    })
                  : '',
              })}
              {scopeTip}
            </p>
          ) : null}
          {running ? (
            <div className='flex items-center justify-between gap-3'>
              <p role='status' className='flex items-center gap-2'>
                <Spinner />
                {$t('xiaohongshu.searchingCollectorBrowserUpAbout')}
              </p>
              {canCancel && data.running ? (
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={cancelling || blocked}
                  onClick={stop}
                >
                  {cancelling
                    ? $t('xiaohongshu.cancelling')
                    : $t('xiaohongshu.cancelCollection')}
                </Button>
              ) : null}
            </div>
          ) : null}
          {data.recent.length ? (
            <div>
              <p className='nr-guide-subtitle !mt-1'>
                {$t('xiaohongshu.recentNotes')}
              </p>
              <ul className='grid gap-1'>
                {data.recent.map((note) => (
                  <li key={note.id} className='flex min-w-0 gap-1'>
                    <a
                      className='nr-link min-w-0 truncate'
                      href={safeLink(note.url)}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {note.title}
                    </a>
                    <span className='shrink-0 text-muted-foreground'>
                      {note.estimatedPublishedAt
                        ? ` · ${formatDate(note.estimatedPublishedAt)}`
                        : ''}
                      {likes(note) ? ` · ${likes(note)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className='flex items-center justify-between gap-3 pt-1'>
            <span className='min-w-0'>
              {$t('xiaohongshu.manualRead')}
              {data.verifiedAt ? (
                <span className='text-muted-foreground'>
                  {' · '}
                  {$t('xiaohongshu.lastSuccessfulCollection', {
                    0: formatDateTime(data.verifiedAt),
                  })}
                </span>
              ) : null}
            </span>
            {canSearch ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={locked}
                onClick={() => void run('search', () => search(data.revision))}
              >
                {running ? $t('youtube.readingShort') : $t('common.readNow')}
              </Button>
            ) : null}
          </div>
        </section>
      ) : data.configured ? (
        <section className='nr-guide-connected flex items-center justify-between gap-3'>
          <div className='min-w-0'>
            <h3>{$t('youtube.searchTerms')}</h3>
            <p className='text-muted-foreground'>
              {canConnect
                ? $t('youtube.noTermsYet')
                : $t('xiaohongshu.noConfirmedNotesYetAsk')}
            </p>
          </div>
          {canConnect ? (
            <Button type='button' disabled={locked} onClick={startEdit}>
              {$t('youtube.addTerms')}
            </Button>
          ) : null}
        </section>
      ) : null}
      {/* Someone who may check the collector but not change the search gets the check alone. */}
      {canTest && !canConnect && data.configured ? (
        <div className='grid gap-3'>
          {collectorField}
          {testButton}
        </div>
      ) : null}
      {data.total > 0 || (data.connected && canDisconnect) ? (
        <div className='flex flex-wrap items-center justify-between gap-2'>
          {data.total > 0 ? (
            <Link to='/data/xiaohongshu' className='nr-link text-sm'>
              {$t('collectorPage.viewData')}
            </Link>
          ) : (
            <span />
          )}
          <div className='flex flex-wrap gap-1'>
            <CollectorClear
              projectId={projectId}
              resource='nrXiaohongshu'
              revision={data.revision}
              total={data.total}
              size='sm'
              disabled={Boolean(busy || data.running)}
              errorMessage={xiaohongshuErrorMessage}
              onCleared={async () => {
                await load();
                onChange();
              }}
            />
            {canDisconnect && data.connected ? (
              <Button
                type='button'
                size='sm'
                variant='ghost'
                disabled={locked}
                onClick={disconnect}
              >
                {$t('common.disconnect')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <Dialog
        open={form}
        onOpenChange={(open) => {
          if (!open && busy !== 'connect') cancelEdit();
        }}
      >
        {form ? (
          <DialogContent className='sm:max-w-lg'>
            <DialogHeader>
              <DialogTitle>
                {$t(
                  data.connected
                    ? 'xiaohongshu.editTermsTitle'
                    : 'xiaohongshu.addTermsTitle',
                )}
              </DialogTitle>
            </DialogHeader>
            <form
              className='grid gap-3'
              onSubmit={(e) => {
                e.preventDefault();
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
              {/* The panel's own errors are hidden behind the dialog, so it shows them. */}
              {loadError ? (
                <p role='alert' className='nr-error'>
                  {loadError.message()}
                </p>
              ) : null}
              {error ? (
                <p role='alert' className='nr-error'>
                  {error.message()}
                </p>
              ) : null}
              {/* The collector is checked from its row in the drawer, not here. */}
              {collectorField}
              {/* The same field as Bilibili's search terms, as one line: the collector takes a single term. */}
              <Field data-invalid={fieldErrors.query}>
                <FieldLabel htmlFor='xhs-query'>
                  {$t('common.searchTerm')}
                </FieldLabel>
                <Input
                  ref={queryInputRef}
                  id='xhs-query'
                  aria-required='true'
                  aria-invalid={fieldErrors.query}
                  aria-describedby='xhs-query-help xhs-query-error'
                  value={query}
                  disabled={Boolean(busy) || running}
                  maxLength={60}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <FieldDescription id='xhs-query-help'>
                  {$t('xiaohongshu.termHelp')}
                </FieldDescription>
                <FieldError
                  id='xhs-query-error'
                  errors={
                    fieldErrors.query
                      ? [{ message: $t('xiaohongshu.errors.invalidQuery') }]
                      : []
                  }
                />
              </Field>
              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  disabled={busy === 'connect'}
                  onClick={cancelEdit}
                >
                  {$t('common.cancel')}
                </Button>
                <Button
                  type='submit'
                  disabled={Boolean(busy) || running || blocked}
                >
                  {busy === 'connect' && <Spinner data-icon='inline-start' />}
                  {$t('common.save')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

/** A read waiting for the busy collector, or the last read's problem. Reading stays manual, so nothing pauses. */
function Problem({ data }: { data: XiaohongshuView }) {
  const box = (title: string, body: string) => (
    <section className='nr-guide-step !mt-0 grid gap-1' role='status'>
      <h3 className='!mb-0'>{title}</h3>
      <p className='text-muted-foreground'>{body}</p>
    </section>
  );
  if (data.queued)
    return box($t('collectorQueue.title'), $t('collectorQueue.help'));
  const last = data.lastRun;
  if (!last || last.ok || last.errorCode === 'cancelled') return null;
  return box(
    $t(
      last.errorCode === 'busy'
        ? 'collectorQueue.gaveUp'
        : 'youtube.lastReadFailedTitle',
    ),
    sentences(
      last.errorCode === 'busy' ? '' : xiaohongshuRunMessage(last.errorCode),
      $t('youtube.retryManually'),
    ),
  );
}
