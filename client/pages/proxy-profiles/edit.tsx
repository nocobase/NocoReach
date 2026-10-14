import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNocoReachLocale, $t } from '#i18n';
import { toast } from '#lib/toast';
import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Checkbox } from '#components/ui/checkbox';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
} from '#components/ui/field';
import { Skeleton } from '#components/ui/skeleton';
import {
  proxyKey,
  proxyRequest,
  type Profile,
  type ProfileCapabilities,
} from './api';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '#components/ui/select';
import { MockProfileFields } from './mock-fields';
import { ProxyError } from './feedback';

export default function EditProfile() {
  useNocoReachLocale();
  const { profileId } = useParams(),
    navigate = useNavigate(),
    location = useLocation(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: [...proxyKey, profileId],
    queryFn: () => proxyRequest<Profile>('get', { id: profileId }),
    enabled: !!profileId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  // Background refreshes must not unmount the draft or replace its original revision.
  // A concurrent edit is still rejected by the server when this form is saved.
  if (profileId && !query.data)
    return (
      <RouteDialog
        title={$t('proxyProfiles.editProxyProfile')}
        closeTo={`/proxy-profiles${location.search}`}
      >
        {query.error ? (
          <>
            <ProxyError
              error={query.error}
              retry={() => void query.refetch()}
            />
            <Button
              variant='outline'
              onClick={() => {
                void client.invalidateQueries({ queryKey: proxyKey });
                void navigate(`/proxy-profiles${location.search}`);
              }}
            >
              {$t('proxyProfiles.backList')}
            </Button>
          </>
        ) : (
          <Skeleton className='h-64 w-full' />
        )}
      </RouteDialog>
    );
  return (
    <ProfileForm
      key={profileId || 'new'}
      profile={profileId ? query.data : undefined}
    />
  );
}
function ProfileForm({ profile }: { profile?: Profile }) {
  const profileId = profile?.id;
  const navigate = useNavigate(),
    location = useLocation(),
    client = useQueryClient();
  const capabilities = useQuery({
    queryKey: [...proxyKey, 'capabilities'],
    queryFn: () => proxyRequest<ProfileCapabilities>('capabilities'),
  });
  const [form, setForm] = useState(() => ({
    kind: profile?.kind ?? 'proxy',
    mock: profile?.mock ?? {
      scenario: 'normal',
      seed: 'nocoreach-demo',
      clock: new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z',
    },
    name: profile?.name ?? '',
    url: profile?.url ?? '',
    username: profile?.username ?? '',
    password: '',
    clearAuth: false,
  }));
  const [revision] = useState(profile?.revision);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const close = () => void navigate(`/proxy-profiles${location.search}`);
  function validate(value: typeof form) {
    const issues: Record<string, string> = {};
    if (!value.name.trim()) issues.name = 'proxyProfiles.enterName';
    if (value.kind === 'mock') {
      if (!/^[\p{L}\p{N}_.: -]{1,128}$/u.test(value.mock.seed.trim()))
        issues.seed = 'networkProfiles.invalidSeed';
      if (
        !/(Z|[+-]\d{2}:\d{2})$/.test(value.mock.clock) ||
        !Number.isFinite(Date.parse(value.mock.clock))
      )
        issues.clock = 'networkProfiles.invalidClock';
      return issues;
    }
    try {
      const u = new URL(value.url);
      if (
        !['http:', 'https:', 'socks5:', 'socks5h:'].includes(u.protocol) ||
        !u.hostname ||
        u.username ||
        u.password ||
        !['', '/'].includes(u.pathname) ||
        u.port === '0' ||
        u.search ||
        u.hash
      )
        throw new Error();
    } catch {
      issues.url = 'proxyProfiles.enterHttpHttpsSocks5';
    }
    if (!value.clearAuth && value.password && !value.username)
      issues.username = 'proxyProfiles.enterUsernameWhenUsingPassword';
    return issues;
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const issues = validate(form);
    setErrors(issues);
    if (Object.keys(issues).length) {
      formRef.current
        ?.querySelector<HTMLInputElement>(`[name="${Object.keys(issues)[0]}"]`)
        ?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await proxyRequest('save', {
        ...(form.kind === 'mock'
          ? { kind: 'mock', name: form.name, mock: form.mock }
          : {
              kind: 'proxy',
              name: form.name,
              url: form.url,
              username: form.username,
              password: form.password,
              clearAuth: form.clearAuth,
            }),
        ...(profileId ? { id: profileId, revision } : {}),
      });
      await client.invalidateQueries({ queryKey: proxyKey });
      toast.success(() => $t('proxyProfiles.proxyProfileSaved'));
      close();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <RouteDialog
      title={
        profileId
          ? $t('proxyProfiles.editProxyProfile')
          : $t('proxyProfiles.newProfile')
      }
      description={$t(
        form.kind === 'mock'
          ? 'networkProfiles.mockDescription'
          : 'proxyProfiles.supportsHttpHttpsSocks5',
      )}
      beforeClose={() => !busy}
      closeTo={`/proxy-profiles${location.search}`}
      footer={
        <>
          <Button variant='outline' disabled={busy} onClick={close}>
            {$t('common.cancel')}
          </Button>
          <Button type='submit' form='proxy-profile-form' disabled={busy}>
            {busy ? $t('common.working') : $t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id='proxy-profile-form'
        ref={formRef}
        onSubmit={(e) => void save(e)}
        noValidate
        className='flex flex-col gap-4'
      >
        <ProxyError error={error} />
        {(error as { status?: number })?.status === 409 && (
          <p className='text-sm text-muted-foreground'>
            {$t('proxyProfiles.checkDuplicateNameIfProfile')}
          </p>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor='profile-kind'>
              {$t('networkProfiles.kind')}
            </FieldLabel>
            <Select
              value={form.kind}
              disabled={busy || !!profileId}
              onValueChange={(kind) => {
                if (kind === 'proxy' || kind === 'mock') {
                  setForm({ ...form, kind });
                  setErrors({});
                }
              }}
            >
              <SelectTrigger id='profile-kind' className='w-full'>
                <SelectValue>{$t(`networkProfiles.${form.kind}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='proxy'>
                    {$t('networkProfiles.proxy')}
                  </SelectItem>
                  {(capabilities.data?.mockEnabled || form.kind === 'mock') && (
                    <SelectItem value='mock'>
                      {$t('networkProfiles.mock')}
                    </SelectItem>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
            {capabilities.error && !profileId && (
              <FieldDescription>
                {$t('networkProfiles.capabilitiesUnavailable')}
              </FieldDescription>
            )}
          </Field>
          {(['name', 'url', 'username', 'password'] as const)
            .filter((key) => form.kind !== 'mock' || key === 'name')
            .map((key) => (
              <Field key={key} data-invalid={!!errors[key]}>
                <FieldLabel htmlFor={`proxy-${key}`}>
                  {
                    {
                      name: $t('common.name'),
                      url: $t('proxyProfiles.proxyAddress'),
                      username: $t('proxyProfiles.username'),
                      password: $t('proxyProfiles.password'),
                    }[key]
                  }
                  {['name', 'url'].includes(key) ? ' *' : ''}
                </FieldLabel>
                <Input
                  id={`proxy-${key}`}
                  name={key}
                  type={key === 'password' ? 'password' : 'text'}
                  autoComplete={key === 'password' ? 'new-password' : 'off'}
                  disabled={
                    busy ||
                    (form.clearAuth && ['username', 'password'].includes(key))
                  }
                  required={['name', 'url'].includes(key)}
                  maxLength={
                    { name: 80, url: 2048, username: 256, password: 1024 }[key]
                  }
                  value={form[key]}
                  aria-invalid={!!errors[key]}
                  aria-describedby={`proxy-${key}-help`}
                  placeholder={
                    key === 'url' ? 'http://proxy.example.com:7890' : undefined
                  }
                  onChange={(e) => {
                    const next = { ...form, [key]: e.target.value };
                    setForm(next);
                    if (Object.keys(errors).length) setErrors(validate(next));
                  }}
                />
                <FieldDescription id={`proxy-${key}-help`}>
                  {$t(errors[key]) ||
                    (key === 'password'
                      ? profile?.hasPassword
                        ? $t('proxyProfiles.passwordSavedLeaveBlankKeep')
                        : $t(
                            'proxyProfiles.credentialsEncryptedRestPasswordsNever',
                          )
                      : key === 'url'
                        ? $t('proxyProfiles.socks5ResolvesTargetNames')
                        : '')}
                </FieldDescription>
              </Field>
            ))}
          {form.kind === 'mock' && (
            <MockProfileFields
              value={form.mock}
              disabled={busy}
              errors={errors}
              onChange={(mock) => setForm({ ...form, mock })}
            />
          )}
        </FieldGroup>
        {profileId && form.kind === 'proxy' && (
          <Field orientation='horizontal'>
            <Checkbox
              id='clear-proxy-auth'
              checked={form.clearAuth}
              disabled={busy}
              onCheckedChange={(checked) =>
                setForm({ ...form, clearAuth: checked === true })
              }
            />
            <FieldLabel htmlFor='clear-proxy-auth'>
              {$t('proxyProfiles.clearUsernamePasswordWhenSaving')}
            </FieldLabel>
          </Field>
        )}
      </form>
    </RouteDialog>
  );
}
