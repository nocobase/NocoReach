import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { $t } from '#i18n';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { toast } from '#lib/toast';

export function InvitationLink({
  value,
  onClose,
}: {
  value: { inviteUrl?: string; emailSent: boolean; email: string };
  onClose?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert>
      <Check />
      <AlertTitle>
        {$t('accessMembers.invitedToast', { 0: value.email })}
      </AlertTitle>
      <AlertDescription className='flex flex-col gap-3'>
        <span>
          {$t(
            value.emailSent
              ? 'accessMembers.emailSent'
              : 'accessMembers.copyDelivery',
          )}
        </span>
        {value.inviteUrl ? (
          <div className='flex flex-wrap gap-2'>
            <Input
              className='min-w-0 flex-1'
              data-invitation-link
              readOnly
              aria-label={$t('accessMembers.invitationLink')}
              value={value.inviteUrl}
            />
            <Button
              variant='outline'
              onClick={() => {
                void navigator.clipboard
                  .writeText(value.inviteUrl!)
                  .then(() => setCopied(true))
                  .catch(() =>
                    toast.error(() => $t('accessMembers.copyFailed')),
                  );
              }}
            >
              <Copy />
              {$t(copied ? 'accessMembers.copied' : 'accessMembers.copy')}
            </Button>
          </div>
        ) : null}
        {onClose ? (
          <Button variant='ghost' className='self-end' onClick={onClose}>
            {$t('accessMembers.dismiss')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
