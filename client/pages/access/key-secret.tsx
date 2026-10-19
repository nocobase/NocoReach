import { useState } from 'react';
import { Copy } from 'lucide-react';
import { $t } from '#i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '#components/ui/dialog';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { toast } from '#lib/toast';
import type { CreatedApiKey } from '../../../shared/key-access';

// Secrets live only in the mutation caller's component, never in a query or persisted cache.
export function KeySecretBody({
  value,
  onClose,
}: {
  value: CreatedApiKey;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className='flex flex-col gap-4'>
      <p className='text-sm text-muted-foreground'>
        {$t('accessKeys.secretHelp')}
      </p>
      <Input
        data-key-secret
        readOnly
        aria-label={$t('accessKeys.secret')}
        value={value.secret}
        autoComplete='off'
      />
      <div className='flex flex-wrap justify-end gap-2'>
        <Button
          variant='outline'
          onClick={() =>
            void navigator.clipboard
              .writeText(value.secret)
              .then(() => setCopied(true))
              .catch(() => toast.error(() => $t('accessMembers.copyFailed')))
          }
        >
          <Copy />
          {$t(copied ? 'accessMembers.copied' : 'accessKeys.copy')}
        </Button>
        <Button onClick={onClose}>{$t('accessMembers.done')}</Button>
      </div>
    </div>
  );
}
export function KeySecret(props: {
  value: CreatedApiKey;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{$t('accessKeys.secretTitle')}</DialogTitle>
          <DialogDescription>{$t('accessKeys.secretHelp')}</DialogDescription>
        </DialogHeader>
        <KeySecretBody {...props} />
      </DialogContent>
    </Dialog>
  );
}
