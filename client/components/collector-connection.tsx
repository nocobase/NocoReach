import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { useNavigationGuard } from '@nocobase/app-client';
import { $t, useNocoReachLocale } from '#i18n';
import { nocobaseClient as api, NocoReachHttpError } from '#lib/nocoreach-api';
import { toast } from '#lib/toast';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '#components/ui/card';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '#components/ui/field';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Skeleton } from '#components/ui/skeleton';

const platforms = ['xiaohongshu', 'bilibili', 'youtube'] as const;
type Platform = (typeof platforms)[number];
export function isCollectorPlatform(value: string): value is Platform {
  return platforms.some((platform) => platform === value);
}
interface Status {
  revision: number;
  source: 'none' | 'deployment' | 'project' | 'mock';
  url: string;
  hasToken: boolean;
}
interface Props {
  projectId: number;
  platform: Platform;
  onSaved: () => void;
  onClose?: () => void;
  onSavingChange: (savingRef: boolean) => void;
  disabled?: boolean;
}
const normalize = (value: string) => value.trim().replace(/\/$/, '');
function validUrl(value: string) {
  try {
    const u = new URL(normalize(value));
    return (
      value.length <= 2048 &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      (u.protocol === 'https:' ||
        (u.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(u.hostname)))
    );
  } catch {
    return false;
  }
}
export function CollectorConnection(props: Props) {
  const { session, isPending } = useAuthentication();
  const revision = useAuthorizationRevision();
  if (isPending || !session) return null;
  return (
    <ConnectionForm
      key={JSON.stringify([
        session.user.id,
        session.session.id,
        revision,
        props.projectId,
        props.platform,
      ])}
      {...props}
      sessionId={session.session.id}
    />
  );
}
function ConnectionForm({
  projectId,
  platform,
  sessionId,
  onSaved,
  onSavingChange,
  onClose,
  disabled = false,
}: Props & { sessionId: string }) {
  const { refresh } = useAuthentication();
  useNocoReachLocale();
  const id = useId();
  const [data, setData] = useState<Status | null>(null);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const blocked = [
    'common.sessionExpiredSignAgain',
    'collectorConnection.noPermission',
    'collectorConnection.projectMissing',
  ].includes(error);
  const stale = error === 'collectorConnection.stale';
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(false);
  const [fieldError, setFieldError] = useState({ url: '', token: '' });
  const urlRef = useRef<HTMLInputElement>(null),
    tokenRef = useRef<HTMLInputElement>(null);
  const ownerRef = useRef<AbortController | null>(null),
    savingRef = useRef(false);
  const callbacksRef = useRef({ onSaved, onSavingChange });
  useEffect(() => {
    callbacksRef.current = { onSaved, onSavingChange };
  }, [onSaved, onSavingChange]);
  useNavigationGuard(() => !savingRef.current);
  const request = useCallback(
    (action: string, values: object = {}, signal?: AbortSignal) =>
      api.action<Status>('nrCollectors', action, {
        method: 'POST',
        body: { projectId, platform, ...values },
        unwrap: 'data',
        signal,
        headers: { 'X-NocoReach-Confirmation-Session': sessionId },
      }),
    [projectId, platform, sessionId],
  );
  const report = useCallback((e: unknown) => {
    const status = e instanceof NocoReachHttpError ? e.status : 0;
    const key = (
      e instanceof NocoReachHttpError
        ? (e.payload as { error?: { metadata?: { key?: string } } })
        : null
    )?.error?.metadata?.key;
    const known = [
      'stale',
      'activeRun',
      'invalidUrl',
      'tokenRequired',
      'tokenForNewUrl',
      'invalidToken',
      'unreadable',
      'mockSource',
    ].map((k) => `collectorConnection.${k}`);
    if (status === 400 && key && known.includes(key)) {
      const field =
        key === 'collectorConnection.invalidUrl'
          ? 'url'
          : [
                'collectorConnection.tokenRequired',
                'collectorConnection.tokenForNewUrl',
                'collectorConnection.invalidToken',
              ].includes(key)
            ? 'token'
            : null;
      if (field) {
        setFieldError({ url: '', token: '', [field]: key });
        setError('');
        setTimeout(
          () => (field === 'url' ? urlRef : tokenRef).current?.focus(),
          0,
        );
        return;
      }
    }
    setError(
      status === 401
        ? 'common.sessionExpiredSignAgain'
        : status === 403
          ? 'collectorConnection.noPermission'
          : status === 404
            ? 'collectorConnection.projectMissing'
            : key && known.includes(key)
              ? key
              : status === 503
                ? 'collectorConnection.encryptionUnavailable'
                : 'collectorConnection.saveFailed',
    );
  }, []);
  const load = useCallback(
    async (signal: AbortSignal, previousRevision?: number) => {
      if (signal.aborted || loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      try {
        const value = await request('status', {}, signal);
        if (signal.aborted) return;
        setData(value);
        setUrl(value.url);
        setToken('');
        setSubmitted(false);
        setFieldError({ url: '', token: '' });
        setEditing(value.source === 'none' || value.source === 'project');
        setError('');
        if (
          previousRevision !== undefined &&
          value.revision !== previousRevision
        )
          callbacksRef.current.onSaved();
      } catch (e) {
        if (!signal.aborted) report(e);
      } finally {
        loadingRef.current = false;
        if (!signal.aborted) setLoading(false);
      }
    },
    [request, report],
  );
  useEffect(() => {
    const controller = new AbortController();
    ownerRef.current = controller;
    void Promise.resolve().then(() => load(controller.signal));
    return () => {
      controller.abort();
      if (savingRef.current) callbacksRef.current.onSavingChange(false);
    };
    // Each ownerRef is keyed by session, authorization revision, project and platform.
  }, [load]);
  useEffect(() => {
    if (!busy) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [busy]);
  const tokenRequired = !data?.hasToken || normalize(url) !== data.url;
  const urlError =
    fieldError.url ||
    (submitted && !validUrl(url) ? 'collectorConnection.invalidUrl' : '');
  const tokenError =
    fieldError.token ||
    (submitted && tokenRequired && !token
      ? data?.hasToken
        ? 'collectorConnection.tokenForNewUrl'
        : 'collectorConnection.tokenRequired'
      : submitted && token && !/^[\x21-\x7e]{32,256}$/.test(token)
        ? 'collectorConnection.invalidToken'
        : '');
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const signal = ownerRef.current?.signal;
    if (
      !data ||
      data.source === 'mock' ||
      !signal ||
      signal.aborted ||
      savingRef.current ||
      loadingRef.current ||
      disabled ||
      blocked ||
      stale
    )
      return;
    setSubmitted(true);
    if (!validUrl(url)) {
      urlRef.current?.focus();
      return;
    }
    if (
      (tokenRequired && !token) ||
      (token && !/^[\x21-\x7e]{32,256}$/.test(token))
    ) {
      tokenRef.current?.focus();
      return;
    }
    savingRef.current = true;
    setBusy(true);
    setFieldError({ url: '', token: '' });
    setError('');
    callbacksRef.current.onSavingChange(true);
    try {
      const value = await request(
        'save',
        {
          revision: data.revision,
          url: normalize(url),
          ...(token ? { token } : {}),
        },
        signal,
      );
      if (signal.aborted) return;
      setData(value);
      setUrl(value.url);
      setToken('');
      setSubmitted(false);
      toast.success(() => $t('collectorConnection.saved'));
      if (value.revision !== data.revision) callbacksRef.current.onSaved();
    } catch (e) {
      if (signal.aborted) return;
      if (
        e instanceof NocoReachHttpError &&
        e.code === 'NOCOREACH_CONFIRMATION_SESSION_CHANGED'
      ) {
        setToken('');
        setError('common.sessionExpiredSignAgain');
        try {
          await refresh();
        } catch {
          // The sign-in action remains available if refreshing fails.
        }
        return;
      }
      report(e);
    } finally {
      savingRef.current = false;
      if (!signal.aborted) {
        setBusy(false);
        callbacksRef.current.onSavingChange(false);
      }
    }
  }
  const retry = () => {
    const signal = ownerRef.current?.signal;
    if (!disabled && signal && !signal.aborted)
      void load(signal, data?.revision);
  };
  const formDisabled = disabled || busy || loading || blocked || stale;
  return (
    <Card size='sm' className='shrink-0'>
      <CardHeader>
        <CardTitle>{$t('collectorConnection.title')}</CardTitle>
        <CardDescription>
          {$t(
            data?.source === 'mock'
              ? 'collectorConnection.mockSource'
              : 'collectorConnection.description',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-4' hidden={data?.source === 'mock'}>
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>
              {$t(error)}
              {error === 'collectorConnection.projectMissing' && onClose ? (
                <Button variant='outline' onClick={onClose} disabled={disabled}>
                  {$t('collectorConnection.close')}
                </Button>
              ) : null}
              {error === 'common.sessionExpiredSignAgain' ? (
                <a className='underline' href={api.resolveUrl('/login')}>
                  {$t('common.signAgain')}
                </a>
              ) : !blocked && (!data || stale) ? (
                <Button
                  type='button'
                  variant='outline'
                  onClick={retry}
                  disabled={disabled || loading}
                >
                  {$t(stale ? 'collectorConnection.reload' : 'common.retry')}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        )}
        {loading ? (
          <div
            role='status'
            aria-label={$t('common.loadingLoading')}
            className='grid gap-4'
          >
            <Skeleton className='h-8' />
            <Skeleton className='h-8' />
          </div>
        ) : null}
        {data?.source === 'project' ? (
          <p className='text-sm text-muted-foreground'>
            {$t('collectorConnection.projectSource')}
          </p>
        ) : null}
        {data?.source === 'deployment' && !editing ? (
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p>{$t('collectorConnection.deploymentSource')}</p>
            <Button
              variant='outline'
              disabled={formDisabled}
              onClick={() => {
                setEditing(true);
                setTimeout(() => urlRef.current?.focus(), 0);
              }}
            >
              {$t('collectorConnection.enterAddress')}
            </Button>
          </div>
        ) : null}
        {data && editing ? (
          <form
            id={`${id}-form`}
            onSubmit={(event) => {
              void save(event);
            }}
            className='grid gap-4'
          >
            <Field data-invalid={!!urlError}>
              <FieldLabel htmlFor={`${id}-url`}>
                {$t('collectorConnection.url')} *
              </FieldLabel>
              <Input
                ref={urlRef}
                id={`${id}-url`}
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setFieldError((old) => ({ ...old, url: '' }));
                }}
                disabled={formDisabled}
                aria-required
                aria-invalid={!!urlError}
                aria-describedby={urlError ? `${id}-url-error` : undefined}
                placeholder={$t('collectorConnection.urlPlaceholder')}
                maxLength={2048}
              />
              {urlError && (
                <FieldError id={`${id}-url-error`}>{$t(urlError)}</FieldError>
              )}
            </Field>
            <Field data-invalid={!!tokenError}>
              <FieldLabel htmlFor={`${id}-token`}>
                {$t('collectorConnection.token')}
                {tokenRequired ? ' *' : ''}
              </FieldLabel>
              <Input
                ref={tokenRef}
                id={`${id}-token`}
                type='password'
                autoComplete='new-password'
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  setFieldError((old) => ({ ...old, token: '' }));
                }}
                disabled={formDisabled}
                aria-required={tokenRequired}
                aria-invalid={!!tokenError}
                aria-describedby={
                  tokenError ? `${id}-token-error` : `${id}-token-help`
                }
                placeholder={$t('collectorConnection.tokenPlaceholder')}
                maxLength={256}
              />
              <FieldDescription id={`${id}-token-help`}>
                {$t(
                  data.hasToken
                    ? 'collectorConnection.tokenSaved'
                    : 'collectorConnection.tokenHelp',
                )}
              </FieldDescription>
              {tokenError && (
                <FieldError id={`${id}-token-error`}>
                  {$t(tokenError)}
                </FieldError>
              )}
            </Field>
          </form>
        ) : null}
      </CardContent>
      {data && editing ? (
        <CardFooter className='justify-end gap-2'>
          {data.source === 'deployment' && (
            <Button
              variant='ghost'
              disabled={disabled || busy || loading}
              onClick={() => {
                setEditing(false);
                setToken('');
                setUrl('');
                setSubmitted(false);
                setFieldError({ url: '', token: '' });
                // Cancelling the draft must not hide an unresolved conflict or access error.
                if (!blocked && !stale) setError('');
              }}
            >
              {$t('common.cancel')}
            </Button>
          )}
          <Button type='submit' form={`${id}-form`} disabled={formDisabled}>
            {$t(busy ? 'common.saving' : 'common.save')}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
