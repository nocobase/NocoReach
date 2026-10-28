import { $t } from '#i18n';
import { cn } from '#lib/utils';
import type { Stage } from '../playbook-model';
import { text } from './styles.js';

// Parts of a review step shared by the task's current card and the article's reading page, so both show the same
// checks. Feedback on either is written in the task's Activity.

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
