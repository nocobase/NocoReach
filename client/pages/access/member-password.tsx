import { ApiClientError, copyText } from '@nocobase/app-client';
import { Check, Copy } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { $t, useNocoReachLocale } from '#i18n';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Button } from '#components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '#components/ui/input-group';
import { ListSkeleton } from '#components/reach/states';
import { MIN_PASSWORD_LENGTH, randomPassword } from '#lib/password';
import { toast } from '#lib/toast';
import { useAccessApi, useAccessQuery, type AccessMember } from './api';
import { AccessError } from './components';

/** Members > Reset password: give a member who cannot sign in a new password, generated at random. */
export default function MemberPassword() {
  useNocoReachLocale();
  const { memberId } = useParams();
  const member = useAccessQuery<AccessMember>(`/members/${memberId}`);
  const busyRef = useRef(false);
  return (
    <RouteDialog
      title={$t('accessMembers.resetPassword')}
      description={$t('accessMembers.resetPasswordHelp')}
      beforeClose={() => !busyRef.current}
    >
      {member.error ? (
        <AccessError error={member.error} retry={() => void member.refetch()} />
      ) : !member.data ? (
        <ListSkeleton rows={2} />
      ) : (
        <Form key={memberId} member={member.data} busyRef={busyRef} />
      )}
    </RouteDialog>
  );
}

function Form({
  member,
  busyRef,
}: {
  member: AccessMember;
  busyRef: { current: boolean };
}) {
  const { close } = useRouteOverlay();
  const id = useId();
  const [password, setPassword] = useState(randomPassword);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [fieldError, setFieldError] = useState('');
  const call = useAccessApi();
  const copy = () =>
    void copyText(password).then((done) => {
      if (done) setCopied(true);
      else toast.error(() => $t('accessMembers.copyPasswordFailed'));
    });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldError($t('changePassword.minLength', { 0: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await call(`/members/${member.id}/password`, { password });
      toast.success(() =>
        $t('accessMembers.resetPasswordDone', { 0: member.name }),
      );
      busyRef.current = false;
      setBusy(false);
      await close();
    } catch (failure) {
      const reason =
        failure instanceof ApiClientError ? failure.reason : undefined;
      if (reason === 'PASSWORD_TOO_SHORT' || reason === 'PASSWORD_TOO_LONG')
        setFieldError(
          $t(
            reason === 'PASSWORD_TOO_SHORT'
              ? 'changePassword.tooShort'
              : 'changePassword.tooLong',
          ),
        );
      else setError(failure);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      className='flex flex-col gap-6'
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <AccessError error={error} />
      <p className='break-words text-sm'>
        {member.name} · {member.account}
      </p>
      <FieldGroup>
        <Field data-invalid={!!fieldError}>
          <FieldLabel htmlFor={id}>{$t('changePassword.new')}</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={id}
              className='font-mono'
              autoComplete='off'
              spellCheck={false}
              aria-invalid={!!fieldError}
              value={password}
              disabled={busy}
              onChange={(event) => {
                setPassword(event.target.value);
                setCopied(false);
                setFieldError('');
              }}
            />
            <InputGroupAddon align='inline-end'>
              <InputGroupButton
                size='icon-xs'
                aria-label={$t(
                  copied
                    ? 'accessMembers.copied'
                    : 'accessMembers.copyPassword',
                )}
                title={$t(
                  copied
                    ? 'accessMembers.copied'
                    : 'accessMembers.copyPassword',
                )}
                onClick={copy}
              >
                {copied ? (
                  <Check aria-hidden='true' />
                ) : (
                  <Copy aria-hidden='true' />
                )}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {fieldError ? (
            <FieldError>{fieldError}</FieldError>
          ) : (
            <FieldDescription>
              {$t('accessMembers.resetPasswordHint', {
                0: MIN_PASSWORD_LENGTH,
              })}
            </FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <div className='flex flex-wrap justify-end gap-2'>
        <Button variant='outline' disabled={busy} onClick={() => void close()}>
          {$t('common.cancel')}
        </Button>
        <Button type='submit' disabled={busy}>
          {$t(busy ? 'accessMembers.resetting' : 'accessMembers.resetPassword')}
        </Button>
      </div>
    </form>
  );
}
