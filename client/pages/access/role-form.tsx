import {
  APP_CAPABILITIES,
  PROJECT_CAPABILITIES,
  SITES,
  SOURCES_CONFIGURE,
  appCapability,
  siteCapability,
  type RoleScope,
} from '../../../shared/access-capabilities.js';
import { capabilityLabelKey } from '../../../shared/member-access.js';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiClientError,
  useNavigationGuard,
  usePageBreadcrumb,
} from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { $t, useNocoReachLocale } from '#i18n';
import { useBusinessAccess } from '#hooks/use-business-access';
import { PageContainer, PageHeader } from '#components/reach/page';
import { ListSkeleton } from '#components/reach/states';
import { RouteChildPage } from '#components/route-child-page';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '#components/ui/field';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group';
import { confirmAction } from '#components/reach/confirm';
import { toast } from '#lib/toast';
import {
  accessMessage,
  useAccessApi,
  useAccessQuery,
  roleTitle,
  type BusinessRole,
} from './api';
import { AccessError } from './components';

export default function RoleForm() {
  useNocoReachLocale();
  const { roleKey } = useParams();
  const access = useBusinessAccess('nrMembers.setRole');
  const detail = useAccessQuery<BusinessRole>(
    `/roles/${encodeURIComponent(roleKey || '')}`,
    !!roleKey,
  );
  const { t } = useTranslation();
  const location = useLocation();
  // The header's trail is the way back to the roles tab with its search (L6), so the page has no BackButton. Built-in
  // roles are named before they load; a custom role shows its key until its title arrives.
  usePageBreadcrumb([
    {
      label: t('nocoreach.nav.members'),
      to: { pathname: '/members', search: location.search },
    },
    {
      label: roleKey
        ? roleTitle(detail.data ?? { key: roleKey })
        : $t('accessMembers.newRole'),
    },
  ]);
  return (
    <RouteChildPage>
      <PageContainer>
        {access.isPending || access.error || (roleKey && !detail.data) ? (
          access.error || detail.error ? (
            <AccessError
              error={access.error || detail.error}
              retry={() => {
                access.retry();
                if (roleKey) void detail.refetch();
              }}
            />
          ) : (
            <ListSkeleton />
          )
        ) : (
          <Form
            key={roleKey || 'new'}
            role={detail.data}
            canManage={access.can}
          />
        )}
      </PageContainer>
    </RouteChildPage>
  );
}

function Form({
  role,
  canManage,
}: {
  role?: BusinessRole;
  canManage: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queries = useQueryClient();
  const call = useAccessApi();
  const readOnly = role?.builtIn || !canManage;
  const [expectedRevision] = useState(role?.revision);
  const [name, setName] = useState(() => (role ? roleTitle(role) : ''));
  const [key, setKey] = useState(role?.key.slice(3) || '');
  const [scope, setScope] = useState<RoleScope>(role?.scope ?? 'member');
  const [capabilities, setCapabilities] = useState<string[]>(
    () => role?.capabilities ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [keyError, setKeyError] = useState('');
  const [validated, setValidated] = useState(false);
  const [initial, setInitial] = useState(() =>
    JSON.stringify({ name, key, scope, capabilities }),
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!busy && keyError)
      formRef.current?.querySelector<HTMLElement>('[name=key]')?.focus();
  }, [busy, keyError]);
  const savedRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const dirty = initial !== JSON.stringify({ name, key, scope, capabilities });
  useNavigationGuard(
    () =>
      savedRef.current ||
      allowLeaveRef.current ||
      (!busy &&
        (!dirty || window.confirm($t('accessMembers.discardDescription')))),
  );
  const nameInvalid = !name.trim() || name.length > 100;
  const keyInvalid = !/^[a-zA-Z0-9_.-]{1,61}$/.test(key);
  const has = (capability: string) => capabilities.includes(capability);
  const toggle = (capability: string, value: boolean) =>
    setCapabilities((before) =>
      value
        ? [...new Set([...before, capability])]
        : before.filter((item) => item !== capability),
    );
  const sites = SITES.map(siteCapability);
  const allSites = sites.every(has);
  const back = async () => {
    if (
      !dirty ||
      (await confirmAction({
        title: () => $t('accessMembers.discardTitle'),
        description: () => $t('accessMembers.discardDescription'),
        action: () => $t('accessMembers.discard'),
      }))
    ) {
      allowLeaveRef.current = true;
      void navigate(
        { pathname: '..', search: location.search },
        { replace: true },
      );
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setValidated(true);
    if (nameInvalid || keyInvalid) {
      formRef.current
        ?.querySelector<HTMLElement>(
          nameInvalid ? '[name=title]' : '[name=key]',
        )
        ?.focus();
      return;
    }
    if (busy || readOnly) return;
    setBusy(true);
    setError(undefined);
    setKeyError('');
    try {
      await call(
        role ? `/roles/${encodeURIComponent(role.key)}` : '/roles',
        {
          key: role?.key || `nr.${key}`,
          title: name.trim(),
          scope,
          capabilities,
          ...(role ? { revision: expectedRevision } : {}),
        },
        role ? 'PUT' : 'POST',
      );
      savedRef.current = true;
      setInitial(JSON.stringify({ name, key, scope, capabilities }));
      void queries.invalidateQueries({ queryKey: ['reach-access'] });
      toast.success(() => $t('accessMembers.savedRole', { 0: name }));
      void navigate(
        { pathname: '..', search: location.search },
        { replace: true },
      );
    } catch (failure) {
      if (
        failure instanceof ApiClientError &&
        failure.reason === 'roleExists'
      ) {
        setKeyError(accessMessage(failure));
        formRef.current?.querySelector<HTMLElement>('[name=key]')?.focus();
      } else setError(failure);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      ref={formRef}
      className='flex flex-col gap-6'
      noValidate
      onSubmit={(event) => void save(event)}
    >
      <PageHeader
        title={role ? roleTitle(role) : $t('accessMembers.newRole')}
        description={$t(
          readOnly
            ? 'accessMembers.readOnlyRole'
            : 'accessMembers.roleFormDescription',
        )}
      />
      <AccessError error={error} />
      <Field>
        <FieldLabel htmlFor='role-title'>
          {$t('accessMembers.roleName')} *
        </FieldLabel>
        <Input
          id='role-title'
          className='max-w-md'
          name='title'
          value={name}
          disabled={readOnly || busy}
          aria-invalid={validated && nameInvalid}
          onChange={(event) => setName(event.target.value)}
        />
        {validated && nameInvalid ? (
          <FieldError>{$t('accessMembers.enterRoleName')}</FieldError>
        ) : null}
      </Field>
      {!role ? (
        <Field>
          <FieldLabel htmlFor='role-key'>
            {$t('accessMembers.roleIdentifier')} *
          </FieldLabel>
          <Input
            id='role-key'
            className='max-w-md'
            name='key'
            value={key}
            disabled={readOnly || busy}
            aria-invalid={!!keyError || (validated && keyInvalid)}
            onChange={(event) => {
              setKey(event.target.value);
              setKeyError('');
            }}
          />
          <FieldDescription>
            {$t('accessMembers.identifierHelp')}
          </FieldDescription>
          {keyError ? (
            <FieldError>{keyError}</FieldError>
          ) : validated && keyInvalid ? (
            <FieldError>{$t('accessMembers.enterRoleKey')}</FieldError>
          ) : null}
        </Field>
      ) : null}
      <Section
        title={$t('accessMembers.projectScope')}
        description={$t('accessMembers.projectScopeHelp')}
      >
        <RadioGroup
          value={scope}
          disabled={readOnly || busy}
          onValueChange={(value) => setScope(value as RoleScope)}
          aria-label={$t('accessMembers.projectScope')}
        >
          {(['member', 'all'] as const).map((value) => (
            <label key={value} className='flex items-start gap-2 text-sm'>
              <RadioGroupItem value={value} className='mt-0.5' />
              <span className='flex flex-col'>
                <span>{$t(`accessMembers.scopes.${value}`)}</span>
                <span className='text-xs text-muted-foreground'>
                  {$t(`accessMembers.scopeHints.${value}`)}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </Section>
      <Section
        title={$t('accessMembers.projectWork')}
        description={$t('accessMembers.projectWorkHelp')}
      >
        {PROJECT_CAPABILITIES.map((capability) => (
          <Capability
            key={capability}
            capability={capability}
            checked={has(capability)}
            disabled={readOnly || busy}
            onChange={(value) => toggle(capability, value)}
          />
        ))}
      </Section>
      <Section
        title={$t('accessMembers.sources')}
        description={$t('accessMembers.sourcesHelp')}
      >
        <div className='flex flex-col gap-2'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <span className='text-sm font-medium'>
              {$t('accessMembers.useSources')}
            </span>
            {!readOnly ? (
              <Button
                variant='ghost'
                size='sm'
                disabled={busy}
                onClick={() =>
                  setCapabilities((before) =>
                    allSites
                      ? before.filter((item) => !sites.includes(item))
                      : [...new Set([...before, ...sites])],
                  )
                }
              >
                {$t(
                  allSites
                    ? 'accessMembers.clearSites'
                    : 'accessMembers.allSites',
                )}
              </Button>
            ) : null}
          </div>
          <div
            className='grid gap-3 sm:grid-cols-3'
            role='group'
            aria-label={$t('accessMembers.useSources')}
          >
            {SITES.map((site) => (
              <label key={site} className='flex items-center gap-2 text-sm'>
                <Checkbox
                  checked={has(siteCapability(site))}
                  disabled={readOnly || busy}
                  onCheckedChange={(checked) =>
                    toggle(siteCapability(site), checked)
                  }
                />
                {$t(capabilityLabelKey(siteCapability(site)))}
              </label>
            ))}
          </div>
        </div>
        <Capability
          capability={SOURCES_CONFIGURE}
          checked={has(SOURCES_CONFIGURE)}
          disabled={readOnly || busy}
          onChange={(value) => toggle(SOURCES_CONFIGURE, value)}
        />
      </Section>
      <Section
        title={$t('accessMembers.administration')}
        description={$t('accessMembers.administrationHelp')}
      >
        {APP_CAPABILITIES.map((name) => (
          <Capability
            key={name}
            capability={appCapability(name)}
            checked={has(appCapability(name))}
            disabled={readOnly || busy}
            onChange={(value) => toggle(appCapability(name), value)}
          />
        ))}
      </Section>
      {!readOnly ? (
        <div className='sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background py-3'>
          <Button variant='outline' disabled={busy} onClick={() => void back()}>
            {$t('common.cancel')}
          </Button>
          <Button type='submit' disabled={busy}>
            {$t(busy ? 'common.saving' : 'common.save')}
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <fieldset className='flex flex-col gap-4 rounded-lg border p-4'>
      <legend className='px-1 text-base font-medium'>{title}</legend>
      <p className='text-sm text-muted-foreground'>{description}</p>
      {children}
    </fieldset>
  );
}

function Capability({
  capability,
  checked,
  disabled,
  onChange,
}: {
  capability: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className='flex items-start gap-2 text-sm'>
      <Checkbox
        className='mt-0.5'
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
      <span className='flex flex-col'>
        <span>{$t(capabilityLabelKey(capability))}</span>
        <span className='text-xs text-muted-foreground'>
          {$t(`${capabilityLabelKey(capability)}Hint`)}
        </span>
      </span>
    </label>
  );
}
