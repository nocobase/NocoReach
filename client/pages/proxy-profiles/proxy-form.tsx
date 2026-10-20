import { useId, useRef, useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { $t, useNocoReachLocale } from '#i18n';
import { toast } from '#lib/toast';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { InfoTip } from '#components/reach/info-tip';
import { Button } from '#components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import { Skeleton } from '#components/ui/skeleton';
import { Switch } from '#components/ui/switch';
import {
  networkKey,
  proxyKey,
  proxyRequest,
  type NetworkSettings,
} from './api';
import { ProxyError } from './feedback';
import type { NetworkOutletContext } from './network-settings';

const PROXY_URL = /^(https?|socks5h?):\/\/[^\s/@]+/i;

/** Settings › Network › Set up / Edit proxy. Reads the saved proxy again before prefilling, and saves it for every
 * project; an empty address is turned off from the card's menu instead. */
export default function ProxyForm() {
  useNocoReachLocale();
  const busyRef = useRef(false);
  const query = useQuery({
    queryKey: networkKey,
    queryFn: () => proxyRequest<NetworkSettings>('network'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  // Prefill only from a read made for this dialog. The form keeps its own state, so a later refresh never replaces
  // what the user is typing.
  const saved = query.isFetchedAfterMount ? query.data : undefined;
  return (
    <RouteDialog
      className='sm:max-w-md'
      title={$t(query.data?.proxy ? 'network.editProxy' : 'network.setUp')}
      beforeClose={() => !busyRef.current}
    >
      {query.error && !saved ? (
        <ProxyError error={query.error} retry={() => void query.refetch()} />
      ) : !saved ? (
        <Skeleton
          className='h-48 w-full'
          role='status'
          aria-label={$t('common.loading')}
        />
      ) : (
        <Form saved={saved.proxy} busyRef={busyRef} />
      )}
    </RouteDialog>
  );
}

function Form({
  saved,
  busyRef,
}: {
  saved: NetworkSettings['proxy'];
  busyRef: { current: boolean };
}) {
  const { close } = useRouteOverlay();
  const { onSaved } = useOutletContext<NetworkOutletContext>() ?? {};
  const client = useQueryClient();
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [url, setUrl] = useState(saved?.url ?? ''),
    [login, setLogin] = useState(!!saved?.username),
    [username, setUsername] = useState(saved?.username ?? ''),
    [password, setPassword] = useState(''),
    [errors, setErrors] = useState<{ url?: string; username?: string }>({}),
    [submitted, setSubmitted] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const validate = (next: {
    url: string;
    login: boolean;
    username: string;
  }) => ({
    url: !next.url.trim()
      ? $t('network.addressRequired')
      : PROXY_URL.test(next.url.trim())
        ? undefined
        : $t('proxyProfiles.enterHttpHttpsSocks5'),
    username:
      next.login && !next.username.trim()
        ? $t('network.usernameRequired')
        : undefined,
  });
  // After a failed submission a field is checked again as it changes.
  const revalidate = (next: {
    url: string;
    login: boolean;
    username: string;
  }) => {
    if (submitted) setErrors(validate(next));
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    const found = validate({ url, login, username });
    setErrors(found);
    if (found.url || found.username) {
      formRef.current
        ?.querySelector<HTMLElement>(
          found.url ? '[name=url]' : '[name=username]',
        )
        ?.focus();
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await proxyRequest<NetworkSettings>('saveNetwork', {
        url: url.trim(),
        // Without sign-in, an empty username and password clear any saved credentials.
        username: login ? username.trim() : '',
        password: login && password ? password : undefined,
        revision: saved?.revision,
      });
      // Connection drawers and the data source list read the same settings.
      await client.invalidateQueries({ queryKey: proxyKey });
      toast.success(() => $t('network.saved'));
      busyRef.current = false;
      onSaved?.();
      void close();
    } catch (e) {
      setError(e);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <form
      ref={formRef}
      className='flex flex-col gap-6'
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <ProxyError error={error} />
      <FieldGroup>
        <Field data-invalid={!!errors.url}>
          <div className='flex items-center gap-1'>
            <FieldLabel htmlFor={`${id}-url`}>
              {$t('proxyProfiles.proxyAddress')}{' '}
              <span aria-hidden='true'>*</span>
            </FieldLabel>
            <InfoTip
              label={$t('common.what', { 0: $t('proxyProfiles.proxyAddress') })}
            >
              <p>{$t('network.addressTechnical')}</p>
            </InfoTip>
          </div>
          <Input
            id={`${id}-url`}
            name='url'
            autoFocus
            autoComplete='off'
            placeholder='http://proxy.example.com:8080'
            value={url}
            disabled={busy}
            aria-invalid={!!errors.url}
            aria-required
            onChange={(e) => {
              setUrl(e.target.value);
              revalidate({ url: e.target.value, login, username });
            }}
          />
          {errors.url ? (
            <FieldError>{errors.url}</FieldError>
          ) : (
            <FieldDescription>{$t('network.addressHelp')}</FieldDescription>
          )}
        </Field>
        <Field orientation='horizontal'>
          <Switch
            id={`${id}-login`}
            checked={login}
            disabled={busy}
            onCheckedChange={(next) => {
              setLogin(next);
              revalidate({ url, login: next, username });
            }}
          />
          <FieldLabel htmlFor={`${id}-login`}>
            {$t('network.needsLogin')}
          </FieldLabel>
        </Field>
        {login && (
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field data-invalid={!!errors.username}>
              <FieldLabel htmlFor={`${id}-user`}>
                {$t('proxyProfiles.username')} <span aria-hidden='true'>*</span>
              </FieldLabel>
              <Input
                id={`${id}-user`}
                name='username'
                autoComplete='off'
                value={username}
                disabled={busy}
                aria-invalid={!!errors.username}
                aria-required
                onChange={(e) => {
                  setUsername(e.target.value);
                  revalidate({ url, login, username: e.target.value });
                }}
              />
              {errors.username && <FieldError>{errors.username}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-password`}>
                {$t('proxyProfiles.password')}
              </FieldLabel>
              <Input
                id={`${id}-password`}
                type='password'
                autoComplete='new-password'
                value={password}
                disabled={busy}
                placeholder={
                  saved?.hasPassword ? $t('network.passwordSaved') : undefined
                }
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </div>
        )}
        <FieldDescription>{$t('network.appliesToAll')}</FieldDescription>
      </FieldGroup>
      <div className='flex flex-wrap justify-end gap-2'>
        <Button
          type='button'
          variant='outline'
          disabled={busy}
          onClick={() => void close()}
        >
          {$t('common.cancel')}
        </Button>
        <Button type='submit' disabled={busy}>
          {busy ? $t('common.working') : $t('common.save')}
        </Button>
      </div>
    </form>
  );
}
