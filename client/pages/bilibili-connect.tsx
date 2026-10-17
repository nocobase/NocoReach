import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router';
import { $t, isChinese, useNocoReachLocale } from '#i18n';
import { toast } from '#lib/toast';
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
    ? new Date(value).toLocaleString(isChinese() ? 'zh-CN' : 'en-US')
    : $t('common.unknown');
const count = (value: number | null) =>
  value == null
    ? $t('common.unknown')
    : value.toLocaleString(isChinese() ? 'zh-CN' : 'en-US');

function BilibiliForm({
  state,
  save,
  cancel,
  refresh,
  test,
  blocked,
  resetTools,
}: {
  state: BilibiliStatus;
  save: (data: object) => Promise<void>;
  cancel: () => void;
  refresh: () => void;
  test: (collectorId: string) => Promise<void>;
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
        void submit(event);
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
                hidden={
                  state.collectors.length === 1 &&
                  state.collectors[0].id.startsWith('project-bilibili-')
                }
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
                    label: c.name,
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
                            {c.name}
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
                {testing ? $t('common.checking') : $t('common.checkCollector')}
              </Button>
            </>
          )}
        />
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
      </FieldGroup>
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
    </form>
  );
}

export function BilibiliConnect(props: {
  projectId: number;
  isAdmin: boolean;
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
  onChange,
  onSavingChange,
}: {
  projectId: number;
  isAdmin: boolean;
  onChange: () => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  const { session, refresh: refreshSession } = useAuthentication();
  const adminRef = useRef(isAdmin);
  const confirmationRef = useRef<AbortController | null>(null);
  const confirmingRef = useRef(false);
  const stoppingRef = useRef(false);
  useEffect(() => {
    adminRef.current = isAdmin;
    const owner = new AbortController();
    confirmationRef.current = owner;
    if (!isAdmin) owner.abort();
    return () => owner.abort();
  }, [isAdmin]);
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
    async (edit = false) => {
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
    aliveRef.current = true;
    let active = true;
    void bilibiliRequest<BilibiliStatus>(projectId, 'status')
      .then((next) => {
        if (active) setState(next);
      })
      .catch((e) => {
        if (active) setLoadError(failure(e));
      });
    return () => {
      active = false;
      aliveRef.current = false;
    };
  }, [projectId]);
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
    action: string,
    body: object = {},
    confirmation?: { signal: AbortSignal; sessionId: string },
  ) {
    if (
      !aliveRef.current ||
      !adminRef.current ||
      lockedRef.current ||
      confirmation?.signal.aborted
    )
      return;
    lockedRef.current = true;
    const current = ++epochRef.current;
    const ownsRequest = () =>
      aliveRef.current &&
      adminRef.current &&
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
  const edit = isAdmin && state.configured && (editing || !state.connected);
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
      {!state.configured && !isAdmin && (
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
              {isAdmin
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
              {state.collectors.find((c) => c.id === state.collectorId)?.name}
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
                {running ? (
                  <Button
                    type='button'
                    variant='outline'
                    disabled={stopping || !state.requestId}
                    onClick={() => {
                      if (
                        stoppingRef.current ||
                        !adminRef.current ||
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
                            adminRef.current &&
                            current === epochRef.current
                          ) {
                            setState(next);
                            toast.info(() =>
                              $t('bilibili.requestedStopBilibiliCollection'),
                            );
                          }
                        })
                        .catch((e) => {
                          if (
                            aliveRef.current &&
                            adminRef.current &&
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
                ) : (
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
                      !adminRef.current ||
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
                          adminRef.current &&
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
      {edit && (
        <BilibiliForm
          state={state}
          blocked={unavailable}
          resetTools={() => setToolChecked(null)}
          save={(values) => mutate('connect', values)}
          cancel={() => setEditing(false)}
          refresh={() => {
            void load(true);
          }}
          test={async (collectorId) => {
            if (!aliveRef.current || !adminRef.current) return;
            const current = epochRef.current;
            setToolChecked(null);
            const health = await bilibiliRequest<{
              upstream?: 'anonymous-http';
            }>(projectId, 'test', { collectorId });
            if (
              aliveRef.current &&
              adminRef.current &&
              current === epochRef.current
            )
              setToolChecked(
                health.upstream === 'anonymous-http'
                  ? 'anonymous-http'
                  : 'opencli',
              );
          }}
        />
      )}
      <Card size='sm'>
        <CardHeader>
          <CardTitle>{$t('bilibili.recentlyCollectedVideos')}</CardTitle>
          <CardDescription>
            {$t('bilibili.showingLatest5RecordsRetained', {
              0: state.total.toLocaleString(),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {!state.recent.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{$t('bilibili.noVideosSavedYet')}</EmptyTitle>
                <EmptyDescription>
                  {$t('bilibili.saveCriteriaStartCollectionManually')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className='flex flex-col gap-4'>
              {state.recent.map((video) => (
                <li
                  key={video.id}
                  className='flex min-w-0 flex-col gap-1 text-sm'
                >
                  <a
                    className='break-words font-medium text-primary underline underline-offset-4'
                    href={`https://www.bilibili.com/video/${encodeURIComponent(video.id)}`}
                    target='_blank'
                    rel='noreferrer'
                  >
                    {video.title || video.id}
                  </a>
                  {video.fromEarlierConfig && (
                    <Badge variant='outline' className='self-start'>
                      {$t('bilibili.earlierConfiguration')}
                    </Badge>
                  )}
                  <p className='text-muted-foreground'>
                    {$t('bilibili.viewsLikesComments', {
                      0: count(video.views),
                      1: count(video.likes),
                      2: count(video.comments),
                    })}
                  </p>
                  <p className='text-muted-foreground'>
                    {$t('bilibili.published', {
                      0: video.publishedAt
                        ? `${video.publishedAt.slice(0, 16).replace('T', ' ')} UTC (${$t('bilibili.minutePrecision')})`
                        : $t('common.unknown'),
                    })}
                  </p>
                  <p className='text-muted-foreground'>
                    {$t('bilibili.collected', { 0: stamp(video.collectedAt) })}
                  </p>
                  <p className='break-words text-muted-foreground'>
                    {$t('common.source', {
                      0: video.sources
                        .map((s) =>
                          s.kind === 'search'
                            ? $t('common.search', { 0: s.value })
                            : s.value,
                        )
                        .join(' · '),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className='text-sm text-muted-foreground'>
            {$t('bilibili.searchCoversReturnedFirstPage')}
          </p>
          <p className='text-sm text-muted-foreground'>
            {$t('bilibili.up500RecentPublicRecords')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
