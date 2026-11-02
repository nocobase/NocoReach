import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthenticationErrorResolver } from '@nocobase/app-plugin-authentication/client/actions';
import { useId, useState, type FormEvent, type RefObject } from 'react';
import { $t, useNocoReachLocale } from '#i18n';
import { PasswordInput } from '#extensions/nocobase-auth-forms/password-input';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { MIN_PASSWORD_LENGTH } from '#lib/password';
import { toast } from '#lib/toast';

type FieldName = 'current' | 'next' | 'confirmation';

/**
 * Account menu > Change password. Every other session of the account ends, including command-line sign-ins, because a
 * password is usually changed when it may have leaked; this browser stays signed in.
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
  returnFocus,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly returnFocus?: RefObject<HTMLButtonElement | null>;
}) {
  useNocoReachLocale();
  const [busy, setBusy] = useState(false);
  // A fresh form each time, cleared once the dialog has finished closing so the closing dialog keeps its content.
  const [generation, setGeneration] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
      onOpenChangeComplete={(next) => {
        if (!next) setGeneration((value) => value + 1);
      }}
    >
      <DialogContent finalFocus={returnFocus} className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{$t('changePassword.title')}</DialogTitle>
          <DialogDescription>
            {$t('changePassword.description')}
          </DialogDescription>
        </DialogHeader>
        <ChangePasswordForm
          key={generation}
          busy={busy}
          onBusyChange={setBusy}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordForm({
  busy,
  onBusyChange,
  onDone,
}: {
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const { client } = useAuthentication();
  const resolveError = useAuthenticationErrorResolver();
  const id = useId();
  const [values, setValues] = useState<Record<FieldName, string>>({
    current: '',
    next: '',
    confirmation: '',
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [failure, setFailure] = useState('');
  const toggle = {
    showLabel: $t('changePassword.show'),
    hideLabel: $t('changePassword.hide'),
  };
  const edit = (name: FieldName, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
    setFailure('');
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const found: Partial<Record<FieldName, string>> = {};
    if (!values.current) found.current = $t('changePassword.currentRequired');
    if (values.next.length < MIN_PASSWORD_LENGTH)
      found.next = $t('changePassword.minLength', { 0: MIN_PASSWORD_LENGTH });
    else if (values.confirmation !== values.next)
      found.confirmation = $t('changePassword.mismatch');
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`${id}-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    onBusyChange(true);
    setFailure('');
    try {
      // Better Auth reports API failures in the result rather than throwing.
      const result = await client.changePassword({
        currentPassword: values.current,
        newPassword: values.next,
        revokeOtherSessions: true,
      });
      if (result.error) {
        const code = (result.error as { code?: string }).code;
        if (code === 'INVALID_PASSWORD') {
          setErrors({ current: $t('changePassword.wrongCurrent') });
          document.getElementById(`${id}-current`)?.focus();
        } else if (
          code === 'PASSWORD_TOO_SHORT' ||
          code === 'PASSWORD_TOO_LONG'
        )
          setErrors({
            next: $t(
              code === 'PASSWORD_TOO_SHORT'
                ? 'changePassword.tooShort'
                : 'changePassword.tooLong',
            ),
          });
        else
          setFailure(
            resolveError(result.error)?.message ?? $t('changePassword.failed'),
          );
        return;
      }
      toast.success(() => $t('changePassword.done'));
      onDone();
    } catch (error) {
      setFailure(resolveError(error)?.message ?? $t('changePassword.failed'));
    } finally {
      onBusyChange(false);
    }
  };
  const field = (name: FieldName, label: string, autoComplete: string) => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={`${id}-${name}`}>{label}</FieldLabel>
      <PasswordInput
        {...toggle}
        id={`${id}-${name}`}
        autoComplete={autoComplete}
        autoFocus={name === 'current'}
        disabled={busy}
        aria-invalid={!!errors[name]}
        value={values[name]}
        onChange={(event) => edit(name, event.target.value)}
      />
      {errors[name] ? (
        <FieldError>{errors[name]}</FieldError>
      ) : name === 'next' ? (
        <FieldDescription>
          {$t('changePassword.minLength', { 0: MIN_PASSWORD_LENGTH })}
        </FieldDescription>
      ) : null}
    </Field>
  );
  return (
    <form
      className='flex flex-col gap-6'
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      {failure ? (
        <Alert variant='destructive'>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        {field('current', $t('changePassword.current'), 'current-password')}
        {field('next', $t('changePassword.new'), 'new-password')}
        {field('confirmation', $t('changePassword.confirm'), 'new-password')}
      </FieldGroup>
      <div className='flex flex-wrap justify-end gap-2'>
        <Button
          type='button'
          variant='outline'
          disabled={busy}
          onClick={onDone}
        >
          {$t('common.cancel')}
        </Button>
        <Button type='submit' disabled={busy}>
          {$t(busy ? 'changePassword.submitting' : 'changePassword.title')}
        </Button>
      </div>
    </form>
  );
}
