import { useId } from 'react';
import { Link } from 'react-router';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import { Alert, AlertDescription } from '#components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '#components/ui/alert-dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '#components/ui/select';
import { Field, FieldLabel } from '#components/ui/field';
import { OnlineApiError } from './api.js';
const knownErrors = new Set([
  'agentDisabled',
  'modelRequired',
  'modelUnavailable',
  'revisionConflict',
  'requestConflict',
  'runActive',
  'contextLimit',
  'runnerRequired',
  'timeout',
  'interrupted',
  'accessDenied',
  'taskChanged',
  'taskUnavailable',
  'sessionChanged',
]);
function onlineError(error: unknown) {
  if (error instanceof OnlineApiError) {
    if (error.status === 401) return $t('common.sessionExpiredSignAgain');
    if (error.status === 403) return $t('onlineAgent.accessDenied');
    if (error.status === 404) return $t('onlineAgent.notFound');
    return $t(
      knownErrors.has(error.code)
        ? `onlineAgent.${error.code}`
        : 'onlineAgent.requestFailed',
    );
  }
  return $t('onlineAgent.requestFailed');
}
export function OnlineError({
  error,
  retry,
}: {
  error?: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <Alert variant='destructive'>
      <AlertDescription>
        <p>{onlineError(error)}</p>
        {error instanceof OnlineApiError && error.status === 401 && (
          <Button
            variant='outline'
            nativeButton={false}
            render={<Link to='/login' />}
          >
            {$t('common.signAgain')}
          </Button>
        )}
        {retry &&
          (!(error instanceof OnlineApiError) ||
            ![401, 403, 404, 409].includes(error.status)) && (
            <Button variant='outline' onClick={retry}>
              {$t('common.retry')}
            </Button>
          )}
      </AlertDescription>
    </Alert>
  );
}
export function OnlineSelect({
  label,
  value,
  items,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  items: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field className='min-w-0'>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className='w-full min-w-0'>
          <SelectValue className='truncate' />
        </SelectTrigger>
        <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                disabled={item.disabled}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
export function OnlineConfirm({
  open,
  onClose,
  title,
  description,
  busy,
  confirm,
  error,
  action,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  busy: boolean;
  confirm: () => void;
  action: string;
  error?: unknown;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <OnlineError error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {$t('common.cancel')}
          </AlertDialogCancel>
          <Button variant='destructive' disabled={busy} onClick={confirm}>
            {busy ? $t('common.working') : action}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
