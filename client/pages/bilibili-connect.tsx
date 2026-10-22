import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router';
import { $t, getCurrentLocale, useNocoReachLocale } from '#i18n';
import { toast } from '#lib/toast';
import { collectorName } from '#lib/collector-platforms';
import { useBusinessAccess } from '#hooks/use-business-access';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
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
import { Textarea } from '#components/ui/textarea';
import { confirmAction } from '#components/reach/confirm';
import { CollectorClear } from '#components/collector-clear';
import {
  bilibiliErrorMessage,
  bilibiliMessage,
  bilibiliRequest,
  isBilibiliCancellation,
  type BilibiliStatus,
} from './bilibili-api';

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
          <Link className='underline' to='/login'>
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
    ? new Date(value).toLocaleString(getCurrentLocale())
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
        .max(2048, 'bilibili.enterUp3SearchTerms')
        .refine(
          (v) =>
            split(v).length <= 3 &&
            split(v).every(
              (s) =>
                s.length <= 80 &&
                ![...s].some(
                  (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
                ),
            ),
          'bilibili.enterUp3SearchTerms',
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
  return (
    <form
      noValidate
      onSubmit={(event) => {
        if (canConnect) void submit(event);
        else event.preventDefault();
      }}
      className='flex flex-col gap-4'
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
                    {$t('bilibili.onePerLineUp3')}
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
      {canConnect && (
        <>
          <p className='text-sm text-muted-foreground'>
            {$t('bilibili.savingUpdatesCriteriaWithoutStarting')}
          </p>
          <div className='flex flex-wrap justify-end gap-2'>
            {state.connected && (
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={cancel}
              >
                {$t('bilibili.cancelChanges')}
              </Button>
            )}
            <Button type='submit' disabled={disabled}>
              {form.formState.isSubmitting
                ? $t('common.saving')
                : $t('bilibili.saveConfiguration')}
            </Button>
          </div>
        </>
      )}
    </form>
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
  const navigate = useNavigate();
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
  useEffect(() => {
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
  useEffect(() => {
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
        if (next.lastRun?.ok)
          toast.success(() => $t('bilibili.bilibiliCollectionCompleted'));
        else if (next.lastRun?.partial)
          toast.info(() => $t('bilibili.verifiablePartialResultsSaved'));
        else
          toast.warning(() =>
            bilibiliMessage(next.lastRun?.errorCode || 'invalid_response'),
          );
      } else
        toast.success(() =>
          action === 'disconnect'
            ? $t('bilibili.bilibiliDisconnectedSavedPublicRecords')
            : $t('bilibili.bilibiliConfigurationSaved'),
        );
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
  const edit = canConnect && state.configured && (editing || !state.connected);
  const running = state.checking || busy === 'sync';
  const unavailable = [error, loadError].some(
    (value) => value !== null && [401, 403, 404].includes(value.status),
  );
  const cooling =
    !!state.lastRun?.retryAt && Date.parse(state.lastRun.retryAt) > now;
  return (
    <div className='flex min-w-0 flex-col gap-4' data-bilibili-connection>
      <Alert>
        <AlertDescription className='flex flex-col gap-2'>
          <p>{$t('bilibili.manuallyCollectPublicSearchSummaries')}</p>
          <p>{$t('bilibili.collectorHostManagesNetworkAccess')}</p>
        </AlertDescription>
      </Alert>
      {error && <FailureAlert value={error} retry={refresh} />}
      {loadError && <FailureAlert value={loadError} retry={refresh} />}
      {toolChecked && (
        <p role='status' className='text-sm text-muted-foreground'>
          {toolChecked === 'anonymous-http'
            ? $t('bilibili.anonymousHttpReadyPlatformNot')
            : $t('bilibili.opencliAvailablePlatformNotVerified')}
        </p>
      )}
      {!state.configured && !canConnect && (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>
              {$t('bilibili.noBilibiliCollectorAvailable')}
            </EmptyTitle>
            <EmptyDescription>
              {$t('bilibili.askAdministratorDeployCollectorEnable')}{' '}
              <a
                href='https://github.com/nocobase/nocoreach/blob/main/docs/BILIBILI-COLLECTOR.md'
                target='_blank'
                rel='noreferrer'
              >
                {$t('bilibili.viewDeploymentInstructions')}
              </a>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {state.configured && !state.connected && (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>{$t('bilibili.bilibiliNotConfigured')}</EmptyTitle>
            <EmptyDescription>
              {canConnect
                ? $t('bilibili.selectCollectorEnterSearchTerms')
                : $t('bilibili.askAdministratorConfigureCollectorStart')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {state.connected && (
        <Card size='sm'>
          <CardHeader>
            <CardTitle>{$t('bilibili.bilibiliCollectionStatus')}</CardTitle>
            <CardDescription>
              {collectorName(
                state.collectors.find((c) => c.id === state.collectorId),
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <div className='flex flex-wrap gap-2'>
              <Badge variant='secondary'>
                {running
                  ? $t('common.loadingLoading')
                  : state.lastRun && !state.lastRun.ok
                    ? $t('bilibili.lastCollectionIncomplete')
                    : state.verifiedAt
                      ? $t('bilibili.verifiableContentCollected')
                      : $t('bilibili.configuredNotVerified')}
              </Badge>
            </div>
            <p className='break-words text-sm'>
              {$t('common.searchTerm')}：{state.terms.join('、') || '—'}
              <br />
              {$t('bilibili.bvIdsVideoLinks')}：{state.bvids.join('、') || '—'}
            </p>
            <p className='text-sm text-muted-foreground'>
              {$t('bilibili.lastSuccessfulCollection', {
                0: stamp(state.verifiedAt),
              })}
            </p>
            {isAdmin && !edit && (
              <div className='flex flex-wrap gap-2'>
                {running
                  ? canCancel && (
                      <Button
                        type='button'
                        variant='outline'
                        disabled={stopping || !state.requestId}
                        onClick={() => {
                          if (
                            stoppingRef.current ||
                            !accessRef.current.cancel ||
                            !aliveRef.current
                          )
                            return;
                          stoppingRef.current = true;
                          setStopping(true);
                          const current = epochRef.current;
                          void bilibiliRequest<BilibiliStatus>(
                            projectId,
                            'cancel',
                            { requestId: state.requestId },
                          )
                            .then((next) => {
                              if (
                                aliveRef.current &&
                                accessRef.current.cancel &&
                                current === epochRef.current
                              ) {
                                setState(next);
                                toast.info(() =>
                                  $t(
                                    'bilibili.requestedStopBilibiliCollection',
                                  ),
                                );
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
                        }}
                      >
                        {stopping
                          ? $t('bilibili.stopping')
                          : $t('bilibili.stopCollection')}
                      </Button>
                    )
                  : canSync && (
                      <Button
                        type='button'
                        disabled={!!busy || unavailable || cooling}
                        onClick={() => {
                          void mutate('sync');
                        }}
                      >
                        {$t('common.readNow')}
                      </Button>
                    )}
                {canConnect && (
                  <Button
                    type='button'
                    variant='outline'
                    disabled={!!busy || running || unavailable}
                    onClick={() => {
                      void load(true);
                    }}
                  >
                    {$t('common.modify')}
                  </Button>
                )}
                {canDisconnect && (
                  <Button
                    type='button'
                    variant='ghost'
                    disabled={!!busy || running || unavailable}
                    onClick={() => {
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
                              { revision: state.revision },
                              { signal: confirmation.signal, sessionId },
                            );
                        })
                        .finally(() => {
                          confirmingRef.current = false;
                        });
                    }}
                  >
                    {$t('common.disconnect')}
                  </Button>
                )}
                <Button
                  type='button'
                  variant='ghost'
                  disabled={!!busy || running}
                  onClick={refresh}
                >
                  {$t('bilibili.refresh')}
                </Button>
              </div>
            )}
            {cooling && (
              <p role='status' className='text-sm text-muted-foreground'>
                {$t('bilibili.tryAgainAfter', {
                  0: stamp(state.lastRun?.retryAt || null),
                })}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {state.lastRun && !state.lastRun.ok && (
        <Alert>
          <AlertDescription>
            {bilibiliMessage(state.lastRun.errorCode || 'invalid_response')}
            {state.lastRun.partial && (
              <p>{$t('bilibili.verifiablePartialResultsSaved')}</p>
            )}
          </AlertDescription>
        </Alert>
      )}
      {(edit || (canTest && !canConnect && state.configured)) && (
        <BilibiliForm
          state={state}
          canConnect={canConnect}
          canTest={canTest}
          blocked={unavailable || running || Boolean(busy)}
          resetTools={() => setToolChecked(null)}
          save={(values) => mutate('connect', values)}
          cancel={() => setEditing(false)}
          refresh={() => {
            void load(true);
          }}
          test={async (collectorId) => {
            if (
              !aliveRef.current ||
              !accessRef.current.test ||
              lockedRef.current
            )
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
      )}
      <div className='flex flex-col gap-2 text-sm'>
        <p className='text-muted-foreground'>
          {state.total
            ? $t('collectorPage.savedSummary', {
                0: state.total.toLocaleString(getCurrentLocale()),
              })
            : $t('bilibili.saveCriteriaStartCollectionManually')}
        </p>
        {state.total > 0 && (
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => void navigate('/data/bilibili')}
            >
              {$t('collectorPage.viewData')}
            </Button>
            {isAdmin ? (
              <CollectorClear
                projectId={projectId}
                resource='nrBilibili'
                revision={state.revision}
                total={state.total}
                disabled={Boolean(busy) || running}
                errorMessage={bilibiliErrorMessage}
                onCleared={async () => {
                  await load();
                  onChange();
                }}
              />
            ) : null}
          </div>
        )}
        <p className='text-muted-foreground'>
          {$t('bilibili.searchCoversReturnedFirstPage')}
        </p>
        <p className='text-muted-foreground'>
          {$t('bilibili.up500RecentPublicRecords')}
        </p>
      </div>
    </div>
  );
}
