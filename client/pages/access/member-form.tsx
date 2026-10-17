import { ApiClientError } from '@nocobase/app-client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { $t, useNocoReachLocale } from '#i18n';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
} from '#components/ui/field';
import { ListSkeleton } from '#components/reach/states';
import { toast } from '#lib/toast';
import { memberInvitationSchema } from '../../../shared/member-access.js';
import {
  accessMessage,
  useAccessApi,
  useAccessQuery,
  type AccessMember,
  type BusinessRole,
} from './api';
import { AccessError, RolePicker } from './components';
import { InvitationLink } from './invitation-link';

type CreatedInvitation = {
  inviteUrl?: string;
  emailSent: boolean;
  email: string;
};

export default function MemberForm() {
  useNocoReachLocale();
  const { memberId } = useParams();
  const roles = useAccessQuery<{ items: BusinessRole[]; canManage: boolean }>(
    '/roles',
  );
  const member = useAccessQuery<AccessMember>(
    `/members/${memberId}`,
    !!memberId,
  );
  const busyRef = useRef(false);
  const [invitation, setInvitation] = useState<CreatedInvitation>();
  return (
    <RouteDialog
      title={$t(
        memberId ? 'accessMembers.editRoles' : 'accessMembers.inviteMember',
      )}
      description={$t(
        memberId
          ? 'accessMembers.multiRoleHelp'
          : 'accessMembers.invitationHelp',
      )}
      beforeClose={() => !busyRef.current}
    >
      {invitation ? (
        <InvitationCreated value={invitation} />
      ) : roles.error || member.error ? (
        <AccessError
          error={roles.error || member.error}
          retry={() => {
            void roles.refetch();
            if (memberId) void member.refetch();
          }}
        />
      ) : !roles.data || (memberId && !member.data) ? (
        <ListSkeleton />
      ) : roles.data.canManage ? (
        <Form
          key={memberId || 'invite'}
          member={member.data}
          roles={roles.data.items}
          busyRef={busyRef}
          onInvited={setInvitation}
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
  busyRef,
  onInvited,
}: {
  member?: AccessMember;
  roles: BusinessRole[];
  busyRef: { current: boolean };
  onInvited: (value: CreatedInvitation) => void;
}) {
  const { close } = useRouteOverlay();
  const [email, setEmail] = useState('');
  const [expectedRoles] = useState(() => [...(member?.roles || [])]);
  const [selected, setSelected] = useState(expectedRoles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [emailError, setEmailError] = useState('');
  const [roleError, setRoleError] = useState('');
  const [validated, setValidated] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!busy && (emailError || roleError))
      ref.current
        ?.querySelector<HTMLElement>(
          emailError ? '[name=email]' : '[role=checkbox]',
        )
        ?.focus();
  }, [busy, emailError, roleError]);
  const call = useAccessApi();
  const queries = useQueryClient();
  const emailInvalid =
    !member && !memberInvitationSchema.shape.email.safeParse(email).success;
  const rolesInvalid = !selected.length;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setValidated(true);
    if (emailInvalid || rolesInvalid) {
      ref.current
        ?.querySelector<HTMLElement>(
          emailInvalid ? '[name=email]' : '[role=checkbox]',
        )
        ?.focus();
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    setEmailError('');
    setRoleError('');
    try {
      if (member) {
        await call(`/members/${member.id}/roles`, {
          roles: selected,
          expectedRoles,
        });
        toast.success(() => $t('accessMembers.rolesSaved', { 0: member.name }));
      } else {
        onInvited(
          await call('/invitations', { email: email.trim(), roles: selected }),
        );
      }
      void queries.invalidateQueries({ queryKey: ['reach-access'] });
      busyRef.current = false;
      setBusy(false);
      if (member) await close();
    } catch (failure) {
      const reason =
        failure instanceof ApiClientError ? failure.reason : undefined;
      if (
        reason &&
        [
          'accountUnavailable',
          'systemAccount',
          'alreadyPending',
          'alreadyMember',
        ].includes(reason)
      ) {
        setEmailError(accessMessage(failure));
        ref.current?.querySelector<HTMLElement>('[name=email]')?.focus();
      } else if (
        reason &&
        ['invalidRole', 'ungrantable', 'roleExpanded'].includes(reason)
      ) {
        setRoleError(accessMessage(failure));
        ref.current?.querySelector<HTMLElement>('[role=checkbox]')?.focus();
      } else setError(failure);
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
      <FieldGroup>
        {member ? (
          <p className='break-words text-sm'>
            {member.name} · {member.account}
          </p>
        ) : (
          <Field data-invalid={!!emailError || (validated && emailInvalid)}>
            <FieldLabel htmlFor='invite-email'>
              {$t('accessMembers.email')} *
            </FieldLabel>
            <Input
              id='invite-email'
              name='email'
              autoComplete='off'
              type='email'
              value={email}
              disabled={busy}
              aria-invalid={!!emailError || (validated && emailInvalid)}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError('');
              }}
            />
            {emailError ? (
              <FieldError>{emailError}</FieldError>
            ) : validated && emailInvalid ? (
              <FieldError>{$t('accessMembers.enterEmail')}</FieldError>
            ) : null}
          </Field>
        )}
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
      </FieldGroup>
      <div className='sticky bottom-0 flex flex-wrap justify-end gap-2 bg-background py-2'>
        <Button variant='outline' disabled={busy} onClick={() => void close()}>
          {$t('common.cancel')}
        </Button>
        <Button type='submit' disabled={busy}>
          {$t(
            busy
              ? 'common.saving'
              : member
                ? 'common.save'
                : 'accessMembers.invite',
          )}
        </Button>
      </div>
    </form>
  );
}

function InvitationCreated({ value }: { value: CreatedInvitation }) {
  const { close } = useRouteOverlay();
  return (
    <div className='flex flex-col gap-4'>
      <InvitationLink value={value} />
      <div className='flex justify-end'>
        <Button onClick={() => void close()}>{$t('accessMembers.done')}</Button>
      </div>
    </div>
  );
}
