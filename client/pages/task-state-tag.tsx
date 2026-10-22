import { $t } from '#i18n';
import type { ReactElement } from 'react';
import { Tag } from '#components/reach/tag';
import { getWorkColumns, type BoardState } from './task-execution-types';
import { stateTone } from './task-list-model';

export type TaskStanding = BoardState | 'closed';

/** Where a task stands, as the task list and board show it: its column, or Closed. */
export function TaskStateTag({ state }: { state: TaskStanding }): ReactElement {
  return state === 'closed' ? (
    <Tag tone='slate' dot>
      {$t('common.closed')}
    </Tag>
  ) : (
    <Tag tone={stateTone[state]} dot>
      {getWorkColumns()[state]}
    </Tag>
  );
}
