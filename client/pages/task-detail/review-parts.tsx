import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import { Textarea } from '#components/ui/textarea';
import { cn } from '#lib/utils';
import type { Stage } from '../playbook-model';
import { useTaskDraft } from './draft-store.js';
import { text } from './styles.js';

// Parts of a review step shared by the task's current card and the article's reading page, so both read the same
// drafts (the feedback being typed) and show the same checks.

// Change feedback typed beside the result it is about.
export function RequestBox({
  executor,
  busy,
  onSend,
  onCancel,
}: {
  executor: string;
  busy: boolean;
  onSend: (text: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [value, setValue, clearValue] = useTaskDraft('request', '');
  return (
    <div className='flex flex-col gap-2'>
      <Textarea
        autoFocus
        aria-label={$t('taskDetail.requestChanges')}
        rows={3}
        value={value}
        disabled={busy}
        placeholder={$t('taskDetail.writeFeedbackAfterSendRedoes', {
          0: executor,
        })}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className='flex justify-end gap-2'>
        <Button
          size='sm'
          variant='ghost'
          disabled={busy}
          onClick={() => {
            clearValue();
            onCancel();
          }}
        >
          {$t('common.cancel')}
        </Button>
        <Button
          size='sm'
          disabled={busy || !value.trim()}
          onClick={() =>
            void onSend(value).then((ok) => {
              if (ok) clearValue();
            })
          }
        >
          {$t('taskDetail.sendRequestChanges')}
        </Button>
      </div>
    </div>
  );
}

export const Checklist = ({
  stage,
  checked,
  setChecked,
  busy,
}: {
  stage: Stage;
  checked: string[];
  setChecked: (v: string[]) => void;
  busy: boolean;
}) =>
  (stage.checklist || []).length > 0 ? (
    <fieldset className={cn(text.body, 'flex flex-col gap-2')}>
      <legend className={cn(text.muted, 'mb-2')}>
        {$t('taskDetail.confirmFollowing')}
      </legend>
      {stage.checklist!.map((c) => (
        <label key={c.key} className='flex items-center gap-2'>
          <input
            type='checkbox'
            className='size-4 accent-primary'
            checked={checked.includes(c.key)}
            disabled={busy}
            onChange={(e) =>
              setChecked(
                e.target.checked
                  ? [...checked, c.key]
                  : checked.filter((k) => k !== c.key),
              )
            }
          />{' '}
          {c.label}
          {c.required ? '' : $t('taskDetail.optional')}
        </label>
      ))}
    </fieldset>
  ) : null;
