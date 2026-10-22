import type { ReactElement } from 'react';
import { $t } from '#i18n';
import { Tag } from '#components/reach/tag';
import { getWorkColumns, isClosed, workState, type Work } from './task-execution-types';
import { stateTone } from './task-list-model';

// A task's status as the task list and board show it (To do, In progress, Needs you, Done, or Closed); the task page
// header shows the same tag.
export function TaskStatusTag({
  work,
  status,
}: {
  work?: Work;
  status: string;
}): ReactElement {
  if (isClosed(work))
    return (
      <Tag tone='slate' dot>
        {$t('common.closed')}
      </Tag>
    );
  const s = workState(work, status);
  return (
    <Tag tone={stateTone[s]} dot>
      {getWorkColumns()[s]}
    </Tag>
  );
}
