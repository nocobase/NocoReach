import { accessPageLabelKey } from '../../../shared/member-access.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiClientError, useNavigationGuard } from '@nocobase/app-client';
import { $t, useNocoReachLocale } from '#i18n';
import { useBusinessAccess } from '#hooks/use-business-access';
import { PageContainer, PageHeader } from '#components/reach/page';
import { ListSkeleton } from '#components/reach/states';
import { RouteChildPage } from '#components/route-child-page';
import { BackButton } from '#components/back-button';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '#components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectValue,
} from '#components/ui/select';
import { confirmAction } from '#components/reach/confirm';
import { toast } from '#lib/toast';
import {
  accessMessage,
  useAccessApi,
  useAccessQuery,
  roleTitle,
  type AccessCatalogue,
  type BusinessRole,
} from './api';
import { AccessError } from './components';

export default function RoleForm() {
  useNocoReachLocale();
  const { roleKey } = useParams();
  const access = useBusinessAccess('nrMembers.setRole');
  const catalogue = useAccessQuery<AccessCatalogue>('/catalog');
  const detail = useAccessQuery<BusinessRole>(
    `/roles/${encodeURIComponent(roleKey || '')}`,
    !!roleKey,
  );
  return (
    <RouteChildPage>
      <PageContainer className='max-w-4xl'>
        <BackButton />
        {access.isPending ||
        access.error ||
        !catalogue.data ||
        (roleKey && !detail.data) ? (
          access.error || catalogue.error || detail.error ? (
            <AccessError
              error={access.error || catalogue.error || detail.error}
              retry={() => {
                access.retry();
                void catalogue.refetch();
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
            catalogue={catalogue.data}
            canManage={access.can}
          />
        )}
      </PageContainer>
    </RouteChildPage>
  );
}

function Form({
  role,
  catalogue,
  canManage,
}: {
  role?: BusinessRole;
  catalogue: AccessCatalogue;
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
  const [grants, setGrants] = useState(() => {
    const selection: Record<string, string[]> = {};
    for (const grant of role?.grants || [])
      for (const action of grant.actions) {
        const id = `${grant.resource.type}:${action.action}:${grant.resource.type === 'nocoreach' ? '' : grant.resource.id}`;
        selection[id] = [...(selection[id] || []), grant.resource.id];
      }
    return selection;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [keyError, setKeyError] = useState('');
  const [validated, setValidated] = useState(false);
  const [initial, setInitial] = useState(() =>
    JSON.stringify({ name, key, grants }),
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!busy && keyError)
      formRef.current?.querySelector<HTMLElement>('[name=key]')?.focus();
  }, [busy, keyError]);
  const savedRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const dirty = initial !== JSON.stringify({ name, key, grants });
  useNavigationGuard(
    () =>
      savedRef.current ||
      allowLeaveRef.current ||
      (!busy &&
        (!dirty || window.confirm($t('accessMembers.discardDescription')))),
  );
  const nameInvalid = !name.trim() || name.length > 100;
  const keyInvalid = !/^[a-zA-Z0-9_.-]{1,61}$/.test(key);
  const scopeInvalid = Object.values(grants).some((ids) => !ids.length);
  const toggle = (id: string, value: boolean, defaults: string[]) =>
    setGrants((before) => {
      const next = { ...before };
      if (value) next[id] = defaults;
      else delete next[id];
      return next;
    });
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
    if (nameInvalid || keyInvalid || scopeInvalid) {
      formRef.current
        ?.querySelector<HTMLElement>(
          nameInvalid
            ? '[name=title]'
            : keyInvalid
              ? '[name=key]'
              : '[data-scope-error]',
        )
        ?.focus();
      return;
    }
    if (busy || readOnly) return;
    const value = Object.entries(grants).flatMap(([entry, ids]) => {
      const [type, action, resource] = entry.split(':');
      return ids.map((id) => ({
        resource: { type, id: type === 'nocoreach' ? id : resource },
        actions: [{ action }],
      }));
    });
    setBusy(true);
    setError(undefined);
    setKeyError('');
    try {
      await call(
        role ? `/roles/${encodeURIComponent(role.key)}` : '/roles',
        {
          key: role?.key || `nr.${key}`,
          title: name.trim(),
          grants: value,
          ...(role ? { revision: expectedRevision } : {}),
        },
        role ? 'PUT' : 'POST',
      );
      savedRef.current = true;
      setInitial(JSON.stringify({ name, key, grants }));
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
  const resources = [
    ...new Set(catalogue.actions.map((item) => item.resource)),
  ];
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
      <fieldset className='flex flex-col gap-3 rounded-lg border p-4'>
        <legend className='px-1 text-base font-medium'>
          {$t('accessMembers.pages')}
        </legend>
        <p className='text-sm text-muted-foreground'>
          {$t('accessMembers.pageHelp')}
        </p>
        <div className='grid gap-3 sm:grid-cols-2'>
          {catalogue.pages.map((page) =>
            page.actions.map((action) => {
              const id = `${page.type}:${action}:${page.id}`;
              return (
                <label className='flex items-start gap-2 text-sm' key={id}>
                  <Checkbox
                    checked={id in grants}
                    disabled={readOnly || busy}
                    onCheckedChange={(checked) =>
                      toggle(id, checked, [page.id])
                    }
                  />
                  <span>
                    {$t(accessPageLabelKey(page.id))}
                    {page.type === 'settings'
                      ? ` · ${$t(`accessMembers.operations.${action}`)}`
                      : ''}
                  </span>
                </label>
              );
            }),
          )}
        </div>
      </fieldset>
      <fieldset className='flex flex-col gap-4 rounded-lg border p-4'>
        <legend className='px-1 text-base font-medium'>
          {$t('accessMembers.operationsAndData')}
        </legend>
        <p className='text-sm text-muted-foreground'>
          {$t('accessMembers.scopeHelp')}
        </p>
        {resources.map((resource) => (
          <details key={resource} className='rounded-lg border'>
            <summary className='cursor-pointer p-3 font-medium text-sm'>
              {$t(`accessMembers.resources.${resource}`)}
            </summary>
            <div className='flex flex-col gap-3 border-t p-3'>
              {catalogue.actions
                .filter((item) => item.resource === resource)
                .map((item) => {
                  const action = `${item.resource}.${item.action}`;
                  const id = `nocoreach:${action}:`;
                  const scopes = grants[id];
                  const label = $t(`accessMembers.operations.${item.action}`);
                  return (
                    <div key={id} className='flex flex-col gap-2'>
                      <label className='flex items-center gap-2 text-sm'>
                        <Checkbox
                          checked={!!scopes}
                          disabled={readOnly || busy}
                          onCheckedChange={(checked) =>
                            toggle(id, checked, [
                              item.application ? '$app' : '*',
                            ])
                          }
                        />
                        <span>{label}</span>
                      </label>
                      {scopes ? (
                        item.application ? (
                          <span className='pl-6 text-xs text-muted-foreground'>
                            {$t('accessMembers.applicationScope')}
                          </span>
                        ) : (
                          <div className='flex flex-col gap-2 pl-6'>
                            <Select
                              value={scopes.includes('*') ? 'all' : 'selected'}
                              onValueChange={(value) => {
                                if (value)
                                  setGrants((before) => ({
                                    ...before,
                                    [id]: value === 'all' ? ['*'] : [],
                                  }));
                              }}
                              disabled={readOnly || busy}
                              items={{
                                all: $t('accessMembers.allProjects'),
                                selected: $t('accessMembers.selectedProjects'),
                              }}
                            >
                              <SelectTrigger
                                aria-label={$t('accessMembers.scopeFor', {
                                  0: label,
                                })}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
                                <SelectGroup>
                                  <SelectItem value='all'>
                                    {$t('accessMembers.allProjects')}
                                  </SelectItem>
                                  <SelectItem value='selected'>
                                    {$t('accessMembers.selectedProjects')}
                                  </SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            {!scopes.includes('*') ? (
                              <div className='flex flex-wrap gap-3'>
                                {catalogue.projects.map((project) => (
                                  <label
                                    key={project.id}
                                    className='flex items-center gap-2 text-sm'
                                  >
                                    <Checkbox
                                      checked={scopes.includes(project.id)}
                                      disabled={readOnly || busy}
                                      onCheckedChange={(checked) =>
                                        setGrants((before) => ({
                                          ...before,
                                          [id]: checked
                                            ? [...scopes, project.id]
                                            : scopes.filter(
                                                (key) => key !== project.id,
                                              ),
                                        }))
                                      }
                                    />
                                    {project.name}
                                  </label>
                                ))}
                                {!scopes.length && validated ? (
                                  <FieldError data-scope-error tabIndex={-1}>
                                    {$t('accessMembers.chooseScope')}
                                  </FieldError>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        )
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </details>
        ))}
      </fieldset>
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
