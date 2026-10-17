import { useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { $t, useNocoReachLocale } from '#i18n';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Checkbox } from '#components/ui/checkbox';
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
import { ListSkeleton } from '#components/reach/states';
import { useAccessApi, useAccessQuery } from './api';
import { AccessError } from './components';
import { KeySecretBody } from './key-secret';
import type { KeyOptions, CreatedApiKey } from '../../../shared/key-access';
export default function KeyForm() {
  useNocoReachLocale();
  const pendingRef = useRef(false);
  const [secret, setSecret] = useState<CreatedApiKey>();
  const options = useAccessQuery<KeyOptions>('/options', true, 'nocoreachKeys');
  return (
    <RouteDialog
      title={$t('accessKeys.create')}
      description={$t('accessKeys.createHelp')}
      beforeClose={() => !pendingRef.current}
    >
      {secret ? (
        <CreatedKey value={secret} />
      ) : options.error ? (
        <AccessError
          error={options.error}
          retry={() => void options.refetch()}
        />
      ) : !options.data ? (
        <ListSkeleton />
      ) : (
        <Form
          options={options.data}
          busyRef={pendingRef}
          onCreated={setSecret}
        />
      )}
    </RouteDialog>
  );
}
function CreatedKey({ value }: { value: CreatedApiKey }) {
  const { close } = useRouteOverlay();
  return <KeySecretBody value={value} onClose={() => void close()} />;
}
function Form({
  options,
  busyRef,
  onCreated,
}: {
  options: KeyOptions;
  busyRef: { current: boolean };
  onCreated: (value: CreatedApiKey) => void;
}) {
  const [params] = useSearchParams();
  const type =
    params.get('type') === 'organization' ? 'organization' : 'personal';
  const [name, setName] = useState('');
  const [days, setDays] = useState('90');
  const [level, setLevel] = useState('read');
  const [selection, setSelection] = useState(
    options.levels.includes('read') ? 'all' : 'selected',
  );
  const [projects, setProjects] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [validated, setValidated] = useState(false);
  const [error, setError] = useState<unknown>();
  const formRef = useRef<HTMLFormElement>(null);
  const { close } = useRouteOverlay();
  const cache = useQueryClient();
  const call = useAccessApi('nocoreachKeys');
  const offered =
    selection === 'all'
      ? options.levels
      : ['read', 'write', 'admin'].filter(
          (value) =>
            projects.length &&
            projects.every((id) =>
              options.projects
                .find((project) => project.id === id)
                ?.levels.includes(value),
            ),
        );
  const invalidName = !name.trim() || name.length > 100;
  const invalidDays =
    !/^\d+$/.test(days) || Number(days) < 1 || Number(days) > 365;
  const invalidScope = !offered.includes(level);
  const invalidRoles = type === 'organization' && !roles.length;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;
    setValidated(true);
    if (invalidName || invalidDays || invalidScope || invalidRoles) {
      formRef.current
        ?.querySelector<HTMLElement>(
          invalidName
            ? '#key-name'
            : invalidDays
              ? '#key-days'
              : '[role=combobox]',
        )
        ?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      onCreated(
        await call<CreatedApiKey>('', {
          name: name.trim(),
          type,
          roles: type === 'organization' ? roles : undefined,
          expiresInDays: Number(days),
          scope: {
            groups: {
              'nocoreach.business': {
                level,
                objects: selection === 'all' ? 'all' : projects,
              },
            },
          },
        }),
      );
      void cache.invalidateQueries({
        queryKey: ['reach-access', 'nocoreachKeys'],
      });
    } catch (failure) {
      setError(failure);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      ref={formRef}
      noValidate
      className='flex flex-col gap-5'
      onSubmit={(event) => void submit(event)}
    >
      <AccessError error={error} />
      <p className='text-sm font-medium'>{$t(`accessKeys.${type}`)}</p>
      <Field data-invalid={validated && invalidName}>
        <FieldLabel htmlFor='key-name'>{$t('accessKeys.name')} *</FieldLabel>
        <Input
          id='key-name'
          autoComplete='off'
          maxLength={100}
          disabled={busy}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {validated && invalidName ? (
          <FieldError>{$t('accessKeys.enterName')}</FieldError>
        ) : null}
      </Field>
      <Field data-invalid={validated && invalidDays}>
        <FieldLabel htmlFor='key-days'>{$t('accessKeys.days')} *</FieldLabel>
        <Input
          id='key-days'
          type='number'
          min={1}
          max={365}
          disabled={busy}
          value={days}
          onChange={(event) => setDays(event.target.value)}
        />
        <FieldDescription>{$t('accessKeys.daysHelp')}</FieldDescription>
        {validated && invalidDays ? (
          <FieldError>{$t('accessKeys.invalidDays')}</FieldError>
        ) : null}
      </Field>
      <Field>
        <FieldLabel>{$t('accessKeys.projects')}</FieldLabel>
        <Select
          value={selection}
          disabled={busy}
          onValueChange={(value) => value && setSelection(value)}
        >
          <SelectTrigger aria-label={$t('accessKeys.projects')}>
            <SelectValue>
              {$t(
                selection === 'all'
                  ? 'accessMembers.allProjects'
                  : 'accessMembers.selectedProjects',
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
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
        {selection === 'selected' ? (
          <div className='flex max-h-48 flex-col gap-2 overflow-auto rounded-lg border p-3'>
            {options.projects.length ? (
              options.projects.map((project) => (
                <label
                  key={project.id}
                  className='flex items-center gap-2 text-sm'
                >
                  <Checkbox
                    disabled={busy || !project.levels.length}
                    checked={projects.includes(project.id)}
                    onCheckedChange={(value) =>
                      setProjects((before) =>
                        value
                          ? [...before, project.id]
                          : before.filter((id) => id !== project.id),
                      )
                    }
                  />
                  {project.name}
                </label>
              ))
            ) : (
              <p className='text-sm text-muted-foreground'>
                {$t('accessKeys.noProjects')}
              </p>
            )}
          </div>
        ) : null}
      </Field>
      <Field data-invalid={validated && invalidScope}>
        <FieldLabel>{$t('accessKeys.permissions')} *</FieldLabel>
        <Select
          value={level}
          disabled={busy}
          onValueChange={(value) => value && setLevel(value)}
        >
          <SelectTrigger aria-label={$t('accessKeys.permissions')}>
            <SelectValue>{$t(`accessKeys.${level}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {['read', 'write', 'admin'].map((value) => (
                <SelectItem
                  key={value}
                  value={value}
                  disabled={!offered.includes(value)}
                >
                  {$t(`accessKeys.${value}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>{$t('accessKeys.scopeHelp')}</FieldDescription>
        {validated && invalidScope ? (
          <FieldError>{$t('accessKeys.invalidScope')}</FieldError>
        ) : null}
      </Field>
      {type === 'organization' ? (
        <Field data-invalid={validated && invalidRoles}>
          <FieldLabel>{$t('accessMembers.roles')} *</FieldLabel>
          <FieldDescription>{$t('accessKeys.rolesHelp')}</FieldDescription>
          <div className='flex flex-col gap-2'>
            {options.roles.map((role) => (
              <label key={role.key} className='flex gap-2 text-sm'>
                <Checkbox
                  disabled={busy}
                  checked={roles.includes(role.key)}
                  onCheckedChange={(value) =>
                    setRoles((before) =>
                      value
                        ? [...before, role.key]
                        : before.filter((key) => key !== role.key),
                    )
                  }
                />
                {role.key === 'nr.member'
                  ? $t('accessMembers.member')
                  : role.key === 'nr.admin'
                    ? $t('accessMembers.administrator')
                    : typeof role.title === 'string'
                      ? role.title
                      : role.key}
              </label>
            ))}
          </div>
          {validated && invalidRoles ? (
            <FieldError>{$t('accessMembers.chooseRole')}</FieldError>
          ) : null}
        </Field>
      ) : null}
      <div className='sticky bottom-0 flex justify-end gap-2 bg-background py-2'>
        <Button variant='outline' disabled={busy} onClick={() => void close()}>
          {$t('common.cancel')}
        </Button>
        <Button type='submit' disabled={busy}>
          {$t(busy ? 'common.saving' : 'accessKeys.create')}
        </Button>
      </div>
    </form>
  );
}
