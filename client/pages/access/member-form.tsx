import { ApiClientError } from '@nocobase/app-client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { $t, useNocoReachLocale } from '#i18n';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Button } from '#components/ui/button';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
} from '#components/ui/field';
import { ListSkeleton } from '#components/reach/states';
import { toast } from '#lib/toast';
import {
  accessMessage,
  useAccessApi,
  useAccessQuery,
  type AccessCatalogue,
  type AccessMember,
  type BusinessRole,
} from './api';
import { AccessError, RolePicker } from './components';
import { ProjectPicker } from './project-picker';

/** Change a member's roles and the projects they belong to. */
export default function MemberForm() {
  useNocoReachLocale();
  const { memberId } = useParams();
  const roles = useAccessQuery<{ items: BusinessRole[]; canManage: boolean }>(
    '/roles',
  );
  const catalogue = useAccessQuery<AccessCatalogue>('/catalog');
  const member = useAccessQuery<AccessMember>(`/members/${memberId}`);
  const busyRef = useRef(false);
  const error = roles.error || catalogue.error || member.error;
  return (
    <RouteDialog
      title={$t('accessMembers.editMember')}
      description={$t('accessMembers.editMemberHelp')}
      beforeClose={() => !busyRef.current}
    >
      {error ? (
        <AccessError
          error={error}
          retry={() => {
            void roles.refetch();
            void catalogue.refetch();
            void member.refetch();
          }}
        />
      ) : !roles.data || !catalogue.data || !member.data ? (
        <ListSkeleton />
      ) : roles.data.canManage ? (
        <Form
          key={memberId}
          member={member.data}
          roles={roles.data.items}
          projects={catalogue.data.projects}
          busyRef={busyRef}
        />
      ) : (
        <p>{$t('accessMembers.errors.denied')}</p>
      )}
    </RouteDialog>
  );
}

function Form({
  member,
  roles,
  projects,
  busyRef,
}: {
  member: AccessMember;
  roles: BusinessRole[];
  projects: AccessCatalogue['projects'];
  busyRef: { current: boolean };
}) {
  const { close } = useRouteOverlay();
  // Background refetches never move the snapshot the server compares against.
  const [expectedRoles] = useState(() => [...member.roles]);
  const [expectedProjects] = useState(() => [...member.projects]);
  // Projects the viewer cannot see stay as they are.
  const visible = new Set(projects.map((project) => project.id));
  const [selected, setSelected] = useState(expectedRoles);
  const [projectIds, setProjectIds] = useState(() =>
    expectedProjects.filter((id) => visible.has(id)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [roleError, setRoleError] = useState('');
  const [validated, setValidated] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!busy && roleError)
      ref.current?.querySelector<HTMLElement>('[role=checkbox]')?.focus();
  }, [busy, roleError]);
  const call = useAccessApi();
  const queries = useQueryClient();
  const rolesInvalid = !selected.length;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setValidated(true);
    if (rolesInvalid) {
      ref.current?.querySelector<HTMLElement>('[role=checkbox]')?.focus();
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    setRoleError('');
    try {
      await call(`/members/${member.id}/roles`, {
        roles: selected,
        expectedRoles,
        projectIds: [
          ...expectedProjects.filter((id) => !visible.has(id)),
          ...projectIds,
        ],
        expectedProjects,
      });
      toast.success(() => $t('accessMembers.memberSaved', { 0: member.name }));
      void queries.invalidateQueries({ queryKey: ['reach-access'] });
      busyRef.current = false;
      setBusy(false);
      await close();
    } catch (failure) {
      const reason =
        failure instanceof ApiClientError ? failure.reason : undefined;
      if (
        reason &&
        ['invalidRole', 'ungrantable', 'roleExpanded'].includes(reason)
      )
        setRoleError(accessMessage(failure));
      else setError(failure);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      ref={ref}
      className='flex flex-col gap-6'
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <AccessError error={error} />
      <p className='break-words text-sm'>
        {member.name} · {member.account}
      </p>
      <FieldGroup>
        <Field data-invalid={!!roleError || (validated && rolesInvalid)}>
          <FieldLabel>{$t('accessMembers.roles')} *</FieldLabel>
          <FieldDescription>
            {$t('accessMembers.multiRoleHelp')}
          </FieldDescription>
          <RolePicker
            roles={roles}
            selected={selected}
            onChange={(value) => {
              setSelected(value);
              setRoleError('');
            }}
            disabled={busy}
          />
          {roleError ? (
            <FieldError>{roleError}</FieldError>
          ) : validated && rolesInvalid ? (
            <FieldError>{$t('accessMembers.chooseRole')}</FieldError>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor='member-projects'>
            {$t('accessMembers.projects')}
          </FieldLabel>
          <ProjectPicker
            id='member-projects'
            projects={projects}
            value={projectIds}
            onChange={setProjectIds}
            disabled={busy}
          />
          <FieldDescription>
            {$t('accessMembers.memberProjectsHint')}
          </FieldDescription>
        </Field>
      </FieldGroup>
      <div className='sticky bottom-0 flex flex-wrap justify-end gap-2 bg-background py-2'>
        <Button variant='outline' disabled={busy} onClick={() => void close()}>
          {$t('common.cancel')}
        </Button>
        <Button type='submit' disabled={busy}>
          {$t(busy ? 'common.saving' : 'common.save')}
        </Button>
      </div>
    </form>
  );
}
