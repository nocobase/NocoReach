import {
  formatCompact,
  formatCount,
  formatDate,
  formatDateTime,
} from '#lib/format';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router';
import { $t, useNocoReachLocale } from '#i18n';
import { toast } from '#lib/toast';
import { collectorDocs, collectorName } from '#lib/collector-platforms';
import { useBusinessAccess } from '#hooks/use-business-access';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';
import { chipClass } from '#components/reach/chip';
import { confirmAction } from '#components/reach/confirm';
import { CollectorClear } from '#components/collector-clear';
import { safeLink } from './analytics';
import { sentences } from './task-detail/failure-model';
import {
  bilibiliErrorMessage,
  bilibiliMessage,
  bilibiliRequest,
  isBilibiliCancellation,
  type BilibiliStatus,
} from './bilibili-api';

// Bilibili (2026-11-02): read through the deployment's or the project's collector, as YouTube is through DataForSEO.
// The page above says what is read and what is not, and folds the collector to one row; this panel holds the search
// terms, the videos found lately, daily reading and Read now, and Change opens the terms and videos in a dialog. Some
// labels are YouTube's: the same words for the same controls.
const MAX_TERMS = 5;

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
        ? $t('bilibili.sessionExpiredSignAgainContinue')
        : status === 403
          ? $t('bilibili.notPermissionManageBilibiliConnection')
          : status === 404
            ? $t('bilibili.projectNotExistDeleted')
            : status === 409
              ? $t('bilibili.configurationChangedOperationRunningReload')
              : error instanceof Error
                ? bilibiliErrorMessage(error)
                : $t('bilibili.bilibiliOperationNotCompleteTry'),
  };
}
function FailureAlert({
  value,
  retry,
}: {
  value: Failure;
  retry?: () => void;
}) {
  return (
    <Alert variant='destructive'>
      <AlertDescription className='flex flex-col items-start gap-2'>
        <p>{value.message()}</p>
        {value.status === 401 ? (
          <Link className='nr-link' to='/login'>
            {$t('common.signAgain')}
          </Link>
        ) : ![403, 404].includes(value.status) && retry ? (
          <Button type='button' variant='outline' size='sm' onClick={retry}>
            {$t('bilibili.reloadStatus')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
const split = (s: string) =>
  s
    .split(/[,，、\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
const validBvid = (s: string) => {
  if (/^BV[a-zA-Z0-9]{10}$/.test(s)) return true;
  try {
    const u = new URL(s);
    return (
      u.protocol === 'https:' &&
      ['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(
        u.hostname,
      ) &&
      !u.username &&
      !u.password &&
      !u.port &&
      /^\/video\/BV[a-zA-Z0-9]{10}\/?$/.test(u.pathname)
    );
  } catch {
    return false;
  }
};
const stamp = (value: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? formatDateTime(value)
    : $t('common.unknown');

function BilibiliForm({
  state,
  save,
  cancel,
  refresh,
  test,
  canConnect,
  canTest,
  blocked,
  resetTools,
  checked,
  readOnSave,
}: {
  state: BilibiliStatus;
  save: (data: object) => Promise<void>;
  cancel: () => void;
  refresh: () => void;
  test: (collectorId: string) => Promise<void>;
  canConnect: boolean;
  canTest: boolean;
  blocked: boolean;
  resetTools: () => void;
  /** What the collector check found, under its button. */
  checked?: ReactNode;
  /** Whether saving also reads (the first save, for someone who may read). */
  readOnSave: boolean;
}) {
  const schema = z
    .object({
      collectorId: z
        .string()
        .refine(
          (id) => state.collectors.some((c) => c.id === id),
          'bilibili.selectAvailableCollector',
        ),
      terms: z
        .string()
        .max(2048, 'bilibili.enterUp5SearchTerms')
        .refine(
          (v) =>
            split(v).length <= MAX_TERMS &&
            split(v).every(
              (s) =>
                s.length <= 80 &&
                ![...s].some(
                  (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
                ),
            ),
          'bilibili.enterUp5SearchTerms',
        ),
      bvids: z
        .string()
        .max(2048, 'bilibili.enterUp5ValidBv')
        .refine(
          (v) => split(v).length <= 5 && split(v).every(validBvid),
          'bilibili.enterUp5ValidBv',
        ),
    })
    .refine((v) => split(v.terms).length > 0 || split(v.bvids).length > 0, {
      path: ['terms'],
      message: 'bilibili.enterLeastOneSearchTerm',
    });
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      collectorId: state.collectorId || state.collectors[0]?.id || '',
      terms: state.terms.join('\n'),
      bvids: state.bvids.join('\n'),
    },
  });
  useEffect(() => {
    if (!state.collectors.some((c) => c.id === form.getValues('collectorId')))
      form.setValue(
        'collectorId',
        state.collectorId || state.collectors[0]?.id || '',
      );
  }, [form, state.collectorId, state.collectors]);
  const [problem, setProblem] = useState<Failure | null>(null);
  const [testing, setTesting] = useState(false);
  const busy = form.formState.isSubmitting || testing || blocked;
  const disabled =
    busy || (problem !== null && [401, 403, 404].includes(problem.status));
  const submit = form.handleSubmit(async (values) => {
    setProblem(null);
    try {
      await save({ ...values, revision: state.revision });
    } catch (error) {
      setProblem(failure(error));
    }
  });
  // In the dialog the fields scroll and the footer stays a direct child of the dialog, as in YouTube's.
  return (
    <>
      <form
        id='bili-terms-form'
        noValidate
        onSubmit={(event) => {
          if (canConnect) void submit(event);
          else event.preventDefault();
        }}
        className={
          canConnect
            ? '-mx-4 flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto px-4 pb-1'
            : 'flex min-w-0 flex-col gap-4'
        }
      >
        {problem && <FailureAlert value={problem} retry={refresh} />}
        <FieldGroup>
          <Controller
            name='collectorId'
            control={form.control}
            render={({ field, fieldState }) => (
              <>
                <Field
                  data-invalid={fieldState.invalid}
                  hidden={state.collectors.length === 1}
                >
                  <FieldLabel htmlFor='bili-collector'>
                    {$t('bilibili.selectCollector')}{' '}
                    <span aria-hidden='true' className='text-destructive'>
                      *
                    </span>
                  </FieldLabel>
                  <Select
                    items={state.collectors.map((c) => ({
                      value: c.id,
                      label: collectorName(c),
                    }))}
                    value={field.value}
                    onValueChange={(v) => {
                      if (v !== null) {
                        field.onChange(v);
                        resetTools();
                      }
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      ref={field.ref}
                      onBlur={field.onBlur}
                      id='bili-collector'
                      aria-describedby='bili-collector-error'
                      aria-required='true'
                      aria-invalid={fieldState.invalid}
                      className='w-full min-w-0'
                    >
                      <SelectValue className='min-w-0 truncate' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {state.collectors.map((c) => (
                          <SelectItem
                            key={c.id}
                            value={c.id}
                            className='[&>span]:min-w-0 [&>span]:shrink [&>span]:whitespace-normal'
                          >
                            <span className='min-w-0 whitespace-normal break-words'>
                              {collectorName(c)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError
                    id='bili-collector-error'
                    errors={
                      fieldState.error
                        ? [{ message: $t(fieldState.error.message || '') }]
                        : []
                    }
                  />
                </Field>
                {canTest && (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='self-start'
                    disabled={disabled || !field.value}
                    onClick={() => {
                      setTesting(true);
                      setProblem(null);
                      void test(field.value)
                        .catch((e) => setProblem(failure(e)))
                        .finally(() => setTesting(false));
                    }}
                  >
                    {testing
                      ? $t('common.checking')
                      : $t('common.checkCollector')}
                  </Button>
                )}
                {checked}
              </>
            )}
          />
          {canConnect && (
            <>
              <Controller
                name='terms'
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor='bili-terms'>
                      {$t('common.searchTerm')}
                    </FieldLabel>
                    <Textarea
                      {...field}
                      id='bili-terms'
                      aria-invalid={fieldState.invalid}
                      aria-describedby='bili-terms-help bili-terms-error'
                      disabled={disabled}
                      rows={3}
                    />
                    <FieldDescription id='bili-terms-help'>
                      {$t('bilibili.onePerLineUp5Terms')}
                    </FieldDescription>
                    <FieldError
                      id='bili-terms-error'
                      errors={
                        fieldState.error
                          ? [{ message: $t(fieldState.error.message || '') }]
                          : []
                      }
                    />
                  </Field>
                )}
              />
              <Controller
                name='bvids'
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor='bili-videos'>
                      {$t('bilibili.bvIdsVideoLinks')}
                    </FieldLabel>
                    <Textarea
                      {...field}
                      id='bili-videos'
                      aria-invalid={fieldState.invalid}
                      aria-describedby='bili-videos-help bili-videos-error'
                      disabled={disabled}
                      rows={3}
                    />
                    <FieldDescription id='bili-videos-help'>
                      {$t('bilibili.onePerLineUp5')}
                    </FieldDescription>
                    <FieldError
                      id='bili-videos-error'
                      errors={
                        fieldState.error
                          ? [{ message: $t(fieldState.error.message || '') }]
                          : []
                      }
                    />
                  </Field>
                )}
              />
            </>
          )}
        </FieldGroup>
      </form>
      {canConnect && (
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={busy}
            onClick={cancel}
          >
            {$t('common.cancel')}
          </Button>
          <Button type='submit' form='bili-terms-form' disabled={disabled}>
            {form.formState.isSubmitting && (
              <Spinner data-icon='inline-start' />
            )}
            {$t(readOnSave ? 'youtube.saveAndRead' : 'common.save')}
          </Button>
        </DialogFooter>
      )}
    </>
  );
}

export function BilibiliConnect(props: {
  projectId: number;
  isAdmin: boolean;
  refreshKey?: number;
  onChange: () => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  useNocoReachLocale();
  // A project switch remounts draft/sequence state; old responses cannot fill the new project.
  return <BilibiliPanel key={props.projectId} {...props} />;
}
function BilibiliPanel({
  projectId,
  isAdmin,
  refreshKey = 0,
  onChange,
  onSavingChange,
}: {
  projectId: number;
  isAdmin: boolean;
  refreshKey?: number;
  onChange: () => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  const { session, refresh: refreshSession } = useAuthentication();
  const { can: connectAllowed } = useBusinessAccess(
    'nrBilibili.connect',
    projectId,
  );
  const { can: testAllowed } = useBusinessAccess('nrBilibili.test', projectId);
  const { can: syncAllowed } = useBusinessAccess('nrBilibili.sync', projectId);
  const { can: cancelAllowed } = useBusinessAccess(
    'nrBilibili.cancel',
    projectId,
  );
  const { can: disconnectAllowed } = useBusinessAccess(
    'nrBilibili.disconnect',
    projectId,
  );
  const canConnect = isAdmin && connectAllowed;
  const canTest = isAdmin && testAllowed;
  const canSync = isAdmin && syncAllowed;
  const canCancel = isAdmin && cancelAllowed;
  const canDisconnect = isAdmin && disconnectAllowed;
  const accessRef = useRef({
    connect: canConnect,
    test: canTest,
    sync: canSync,
    cancel: canCancel,
    disconnect: canDisconnect,
  });
  // A layout effect, not a passive one: a button appears in the commit that grants its permission, and a passive
  // effect can run after the browser has already dispatched a click to it, so the handler would see the old denial.
  useLayoutEffect(() => {
    accessRef.current = {
      connect: canConnect,
      test: canTest,
      sync: canSync,
      cancel: canCancel,
      disconnect: canDisconnect,
    };
  }, [canConnect, canTest, canSync, canCancel, canDisconnect]);
  const confirmationRef = useRef<AbortController | null>(null);
  const confirmingRef = useRef(false);
  const stoppingRef = useRef(false);
  // A layout effect for the same reason: Disconnect must not reach the aborted owner of the denial it replaces.
  useLayoutEffect(() => {
    const owner = new AbortController();
    confirmationRef.current = owner;
    if (!canDisconnect) owner.abort();
    return () => owner.abort();
  }, [canDisconnect]);
  const [state, setState] = useState<BilibiliStatus | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [loadError, setLoadError] = useState<Failure | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [toolChecked, setToolChecked] = useState<
    'opencli' | 'anonymous-http' | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  const aliveRef = useRef(true),
    epochRef = useRef(0),
    readsRef = useRef(0),
    lockedRef = useRef(false);
  const load = useCallback(
    async (edit = false, collectorChanged = false) => {
      const current = epochRef.current,
        sequence = ++readsRef.current;
      try {
        const next = await bilibiliRequest<BilibiliStatus>(projectId, 'status');
        if (
          !aliveRef.current ||
          current !== epochRef.current ||
          sequence !== readsRef.current
        )
          return;
        setState(next);
        if (collectorChanged) setToolChecked(null);
        // A successful status read does not make the last mutation successful.
        setLoadError(null);
        if (edit) setEditing(true);
      } catch (e) {
        if (
          aliveRef.current &&
          current === epochRef.current &&
          sequence === readsRef.current
        )
          setLoadError(failure(e));
      }
    },
    [projectId],
  );
  useEffect(() => {
    let active = true;
    aliveRef.current = true;
    epochRef.current++;
    void Promise.resolve().then(() => {
      if (active) return load(false, true);
    });
    return () => {
      active = false;
      aliveRef.current = false;
    };
  }, [load, refreshKey]);
  // The dialog closes for good when its collector or connect permission goes away, so it does not reopen by itself.
  const editable = canConnect && Boolean(state?.configured);
  if (editing && !editable) setEditing(false);
  useEffect(() => {
    if (!state?.lastRun?.retryAt) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Date.parse(state.lastRun.retryAt) - Date.now()) + 20,
    );
    return () => clearTimeout(timer);
  }, [state?.lastRun?.retryAt]);
  useEffect(() => {
    if (!state?.checking && busy !== 'sync') return;
    const timer = setInterval(() => {
      void load();
    }, 1500);
    return () => clearInterval(timer);
  }, [state?.checking, busy, load]);
  async function mutate(
    action: 'connect' | 'sync' | 'disconnect',
    body: object = {},
    confirmation?: { signal: AbortSignal; sessionId: string },
    done?: string,
  ) {
    if (
      !aliveRef.current ||
      !accessRef.current[action] ||
      lockedRef.current ||
      confirmation?.signal.aborted
    )
      return;
    lockedRef.current = true;
    const current = ++epochRef.current;
    const ownsRequest = () =>
      aliveRef.current &&
      accessRef.current[action] &&
      current === epochRef.current &&
      !confirmation?.signal.aborted;
    setBusy(action);
    if (action === 'connect') onSavingChange?.(true);
    setError(null);
    try {
      const next = await bilibiliRequest<BilibiliStatus>(
        projectId,
        action,
        body,
        ...(confirmation ? ([confirmation.sessionId] as const) : []),
      );
      if (!ownsRequest()) return;
      epochRef.current++;
      setState(next);
      setLoadError(null);
      setEditing(false);
      setToolChecked(null);
      onChange();
      if (action === 'sync') {
        // A read the busy collector turned away is queued: the notice above says when it tries again.
        if (next.queued) toast.info(() => $t('collectorQueue.title'));
        else if (next.lastRun?.ok)
          toast.success(() => $t('bilibili.bilibiliCollectionCompleted'));
        else if (next.lastRun?.partial)
          toast.info(() => $t('bilibili.verifiablePartialResultsSaved'));
        else
          toast.warning(() =>
            bilibiliMessage(next.lastRun?.errorCode || 'invalid_response'),
          );
      } else
        toast.success(() =>
          done
            ? $t(done)
            : action === 'disconnect'
              ? $t('bilibili.bilibiliDisconnectedSavedPublicRecords')
              : $t('bilibili.bilibiliConfigurationSaved'),
        );
      return true;
    } catch (e) {
      if (ownsRequest()) {
        if (
          e instanceof Error &&
          'code' in e &&
          e.code === 'NOCOREACH_CONFIRMATION_SESSION_CHANGED'
        ) {
          await refreshSession();
          return;
        }
        if (action === 'connect') throw e;
        if (action === 'sync' && isBilibiliCancellation(e)) {
          void load();
          return;
        }
        setError(failure(e));
        void load();
      }
    } finally {
      if (action === 'connect') onSavingChange?.(false);
      if (aliveRef.current) setBusy(null);
      lockedRef.current = false;
    }
  }
  const refresh = () => {
    void load();
  };
  function stop() {
    if (
      !state?.requestId ||
      stoppingRef.current ||
      !accessRef.current.cancel ||
      !aliveRef.current
    )
      return;
    stoppingRef.current = true;
    setStopping(true);
    const current = epochRef.current;
    void bilibiliRequest<BilibiliStatus>(projectId, 'cancel', {
      requestId: state.requestId,
    })
      .then((next) => {
        if (
          aliveRef.current &&
          accessRef.current.cancel &&
          current === epochRef.current
        ) {
          setState(next);
          toast.info(() => $t('bilibili.requestedStopBilibiliCollection'));
        }
      })
      .catch((e) => {
        if (
          aliveRef.current &&
          accessRef.current.cancel &&
          current === epochRef.current
        )
          setError(failure(e));
      })
      .finally(() => {
        stoppingRef.current = false;
        if (aliveRef.current) setStopping(false);
      });
  }
  function disconnect(revision: string | null) {
    const confirmation = confirmationRef.current;
    const sessionId = session?.session.id;
    if (
      !confirmation ||
      confirmation.signal.aborted ||
      !sessionId ||
      !accessRef.current.disconnect ||
      confirmingRef.current
    )
      return;
    confirmingRef.current = true;
    void confirmAction({
      title: 'bilibili.disconnectBilibili',
      description: 'bilibili.stopFutureCollectionRetainSaved',
      action: 'common.disconnect',
      signal: confirmation.signal,
    })
      .then(async (ok) => {
        if (
          ok &&
          aliveRef.current &&
          accessRef.current.disconnect &&
          !confirmation.signal.aborted
        )
          await mutate(
            'disconnect',
            { revision },
            { signal: confirmation.signal, sessionId },
          );
      })
      .finally(() => {
        confirmingRef.current = false;
      });
  }
  if (!state)
    return loadError ? (
      <FailureAlert value={loadError} retry={refresh} />
    ) : (
      <div
        role='status'
        aria-label={$t('common.loadingLoading')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-6 w-1/2' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  const edit = canConnect && state.configured && editing;
  const running = state.checking || busy === 'sync';
  const unavailable = [error, loadError].some(
    (value) => value !== null && [401, 403, 404].includes(value.status),
  );
  const locked = !!busy || running || unavailable;
  const cooling =
    !!state.lastRun?.retryAt && Date.parse(state.lastRun.retryAt) > now;
  const checked = toolChecked ? (
    <p role='status' className='text-sm text-muted-foreground'>
      {toolChecked === 'anonymous-http'
        ? $t('bilibili.anonymousHttpReadyPlatformNot')
        : $t('bilibili.opencliAvailablePlatformNotVerified')}
    </p>
  ) : null;
  const form = (
    <BilibiliForm
      state={state}
      canConnect={canConnect}
      canTest={canTest}
      blocked={unavailable || running || Boolean(busy)}
      resetTools={() => setToolChecked(null)}
      checked={checked}
      readOnSave={!state.connected && canSync}
      save={async (values) => {
        // The first save reads right away, as YouTube's does; later changes wait for the next daily read.
        // A save that was skipped or superseded reads nothing.
        const first = !state.connected;
        const saved = await mutate('connect', values);
        if (saved && first && accessRef.current.sync) void mutate('sync');
      }}
      cancel={() => setEditing(false)}
      refresh={() => {
        void load(true);
      }}
      test={async (collectorId) => {
        if (!aliveRef.current || !accessRef.current.test || lockedRef.current)
          return;
        lockedRef.current = true;
        setBusy('test');
        const current = epochRef.current;
        setToolChecked(null);
        try {
          const health = await bilibiliRequest<{
            upstream?: 'anonymous-http';
          }>(projectId, 'test', { collectorId });
          if (
            aliveRef.current &&
            accessRef.current.test &&
            current === epochRef.current
          )
            setToolChecked(
              health.upstream === 'anonymous-http'
                ? 'anonymous-http'
                : 'opencli',
            );
        } finally {
          lockedRef.current = false;
          if (aliveRef.current) setBusy(null);
        }
      }}
    />
  );
  return (
    <div className='flex min-w-0 flex-col gap-4' data-bilibili-connection>
      {error && <FailureAlert value={error} retry={refresh} />}
      {loadError && <FailureAlert value={loadError} retry={refresh} />}
      {state.connected && !running ? <Problem state={state} /> : null}
      {!state.configured && !canConnect && (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>
              {$t('bilibili.noBilibiliCollectorAvailable')}
            </EmptyTitle>
            <EmptyDescription>
              {$t('bilibili.askAdministratorDeployCollectorEnable')}{' '}
              <a href={collectorDocs.bilibili} target='_blank' rel='noreferrer'>
                {$t('bilibili.viewDeploymentInstructions')}
              </a>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {state.connected ? (
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
                onClick={() => {
                  void load(true);
                }}
              >
                {$t('common.modify')}
              </Button>
            ) : null}
          </div>
          {state.terms.length ? (
            <div className='flex flex-wrap gap-1.5'>
              {state.terms.map((term) => (
                <span key={term} className={chipClass}>
                  {term}
                </span>
              ))}
            </div>
          ) : null}
          {state.bvids.length ? (
            <p className='text-muted-foreground'>
              {$t('youtube.trackedVideos', { 0: state.bvids.length })}
            </p>
          ) : null}
          {state.total > 0 ? (
            <p className='text-muted-foreground'>
              {$t('youtube.videosRecorded', {
                0: formatCount(state.total),
                1: state.recordingSince
                  ? $t('common.recordingSince', {
                      0: formatDate(state.recordingSince, { withYear: true }),
                    })
                  : '',
              })}
            </p>
          ) : null}
          {running ? (
            <div className='flex items-center justify-between gap-3'>
              <p role='status' className='flex items-center gap-2'>
                <Spinner />
                {$t('youtube.readingProgress')}
              </p>
              {isAdmin && canCancel ? (
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={stopping || !state.requestId}
                  onClick={stop}
                >
                  {stopping
                    ? $t('bilibili.stopping')
                    : $t('bilibili.stopCollection')}
                </Button>
              ) : null}
            </div>
          ) : null}
          {state.recent.length ? (
            <div>
              <p className='nr-guide-subtitle !mt-1'>
                {$t('youtube.recentVideos')}
              </p>
              <ul className='grid gap-1'>
                {state.recent.map((video) => (
                  <li key={video.id} className='flex min-w-0 gap-1'>
                    <a
                      className='nr-link min-w-0 truncate'
                      href={safeLink(video.url)}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {video.title || video.id}
                    </a>
                    <span className='shrink-0 text-muted-foreground'>
                      {video.publishedAt
                        ? ` · ${formatDate(video.publishedAt)}`
                        : ''}
                      {video.views !== null
                        ? ` · ${$t('youtube.viewsCount', { 0: formatCompact(video.views) })}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className='flex items-center justify-between gap-3 pt-1'>
            <label className='flex min-w-0 items-center gap-2'>
              <Switch
                checked={state.autoSync}
                disabled={!canConnect || locked}
                onCheckedChange={(next) =>
                  void mutate(
                    'connect',
                    {
                      collectorId: state.collectorId,
                      terms: state.terms,
                      bvids: state.bvids,
                      autoSync: next,
                      revision: state.revision,
                    },
                    undefined,
                    next ? 'youtube.autoReadOn' : 'youtube.autoReadOff',
                  ).catch((e) => setError(failure(e)))
                }
              />
              <span>
                {$t('youtube.autoRead')}
                {state.verifiedAt ? (
                  <span className='text-muted-foreground'>
                    {' · '}
                    {$t('bilibili.lastSuccessfulCollection', {
                      0: formatDateTime(state.verifiedAt),
                    })}
                  </span>
                ) : null}
              </span>
            </label>
            {canSync ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                disabled={locked || cooling}
                onClick={() => {
                  void mutate('sync');
                }}
              >
                {running ? $t('youtube.readingShort') : $t('common.readNow')}
              </Button>
            ) : null}
          </div>
          {cooling && (
            <p role='status' className='text-muted-foreground'>
              {$t('bilibili.tryAgainAfter', {
                0: stamp(state.lastRun?.retryAt || null),
              })}
            </p>
          )}
        </section>
      ) : state.configured ? (
        <section className='nr-guide-connected flex items-center justify-between gap-3'>
          <div className='min-w-0'>
            <h3>{$t('youtube.searchTerms')}</h3>
            <p className='text-muted-foreground'>
              {canConnect
                ? $t('youtube.noTermsYet')
                : $t('bilibili.askAdministratorConfigureCollectorStart')}
            </p>
          </div>
          {canConnect ? (
            <Button
              type='button'
              disabled={locked}
              onClick={() => {
                void load(true);
              }}
            >
              {$t('youtube.addTerms')}
            </Button>
          ) : null}
        </section>
      ) : null}
      {/* Someone who may check the collector but not change the terms gets the check alone. */}
      {canTest && !canConnect && state.configured ? form : null}
      {state.total > 0 || (state.connected && canDisconnect) ? (
        <div className='flex flex-wrap items-center justify-between gap-2'>
          {state.total > 0 ? (
            <Link to='/data/bilibili' className='nr-link text-sm'>
              {$t('collectorPage.viewData')}
            </Link>
          ) : (
            <span />
          )}
          <div className='flex flex-wrap gap-1'>
            {isAdmin ? (
              <CollectorClear
                projectId={projectId}
                resource='nrBilibili'
                revision={state.revision}
                total={state.total}
                size='sm'
                disabled={Boolean(busy) || running}
                errorMessage={bilibiliErrorMessage}
                onCleared={async () => {
                  await load();
                  onChange();
                }}
              />
            ) : null}
            {canDisconnect && state.connected ? (
              <Button
                type='button'
                size='sm'
                variant='ghost'
                disabled={locked}
                onClick={() => disconnect(state.revision)}
              >
                {$t('common.disconnect')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <Dialog
        open={edit}
        onOpenChange={(open) => {
          if (!open && busy !== 'connect') setEditing(false);
        }}
      >
        {edit ? (
          <DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg'>
            <DialogHeader>
              <DialogTitle>
                {$t(
                  state.connected
                    ? 'bilibili.editTermsTitle'
                    : 'bilibili.addTermsTitle',
                )}
              </DialogTitle>
            </DialogHeader>
            {form}
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

/** What stops or limits reading, most pressing first: a queued retry, paused daily reading, the last read's problem. */
function Problem({ state }: { state: BilibiliStatus }) {
  const box = (title: string, body: string) => (
    <section className='nr-guide-step !mt-0 grid gap-1' role='status'>
      <h3 className='!mb-0'>{title}</h3>
      <p className='text-muted-foreground'>{body}</p>
    </section>
  );
  if (state.queued)
    return box($t('collectorQueue.title'), $t('collectorQueue.help'));
  if (state.pausedCode)
    return box(
      $t('bilibili.pausedTitle'),
      sentences(bilibiliMessage(state.pausedCode), $t('bilibili.pausedHelp')),
    );
  const last = state.lastRun;
  if (!last || last.ok || last.errorCode === 'cancelled') return null;
  const retry =
    state.autoSync && state.nextSyncAt
      ? $t('bilibili.retryAt', { 0: formatDateTime(state.nextSyncAt) })
      : $t('youtube.retryManually');
  if (last.errorCode === 'busy') return box($t('collectorQueue.gaveUp'), retry);
  const reason = bilibiliMessage(last.errorCode || 'invalid_response');
  return last.partial
    ? box(
        $t('bilibili.partialTitle'),
        sentences(reason, $t('bilibili.verifiablePartialResultsSaved')),
      )
    : box($t('youtube.lastReadFailedTitle'), sentences(reason, retry));
}
