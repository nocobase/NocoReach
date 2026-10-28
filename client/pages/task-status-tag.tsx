import type { ReactElement } from 'react';
import { $t } from '#i18n';
import { Tag } from '#components/reach/tag';
import { Clock } from 'lucide-react';
import {
  getWorkColumns,
  isClosed,
  isSnoozed,
  workState,
  type Work,
} from './task-execution-types';
import { stateTone } from './task-list-model';
import type { TaskStanding } from '../../shared/task-pending.js';

// A task's status as the task list and board show it (To do, In progress, Needs you, Done, Closed or Snoozed); the task page
// header shows the same tag.
export function TaskStatusTag({
  work,
  status,
}: {
  work?: Work;
  status: string;
}): ReactElement {
  return (
    <TaskStandingTag
      state={
        isClosed(work)
          ? 'closed'
          : isSnoozed(work)
            ? 'snoozed'
            : workState(work, status)
      }
    />
  );
}

/** The same tag for a task whose standing is already known (the task page's tasks of the same opportunity). */
export function TaskStandingTag({
  state,
}: {
  state: TaskStanding;
}): ReactElement {
  if (state === 'closed')
    return (
      <Tag tone='slate' dot>
        {$t('common.closed')}
      </Tag>
    );
  // Snoozed (2026-10-28): neutral, with a clock, as nothing waits on anyone until its day.
  if (state === 'snoozed')
    return (
      <Tag tone='slate' icon={<Clock />}>
        {$t('common.snoozed')}
      </Tag>
    );
  return (
    <Tag tone={stateTone[state]} dot>
      {getWorkColumns()[state]}
    </Tag>
  );
}
