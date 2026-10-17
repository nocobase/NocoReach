import { $t, $legacyText } from '#i18n';
import { getSourceNames, taskEvidence } from './evidence-model.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Markdown } from '../doc-view.js';
import { ResultSourcePanel } from '../results/source.js';
import type { TaskData } from '../task-execution-types.js';
import { TaskMedia } from './media.js';

export function EvidenceDialog({
  open,
  onClose,
  data,
  projectId,
  taskId,
}: {
  open: boolean;
  onClose: () => void;
  data: TaskData;
  projectId: number;
  taskId: string;
}) {
  const { signals, brief, briefTitle, note, resultSource, attachments } =
    taskEvidence(data);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{$t('taskDetail.evidence')}</DialogTitle>
        </DialogHeader>
        <div className='-mx-4 flex min-h-0 flex-col gap-6 overflow-y-auto px-4'>
          {resultSource ? <ResultSourcePanel source={resultSource} /> : null}
          {signals.length ? (
            <ul className='grid gap-3 sm:grid-cols-2'>
              {signals.map((s) => (
                <li
                  key={s.key}
                  className='flex flex-col gap-1 rounded-lg border p-3 text-sm'
                >
                  <span className='text-xs text-muted-foreground'>
                    {getSourceNames()[s.source] || s.source}
                  </span>
                  <b className='font-medium'>{$legacyText(s.title)}</b>
                  {s.facts.map((f) => (
                    <small key={f} className='text-xs text-muted-foreground'>
                      {$legacyText(f)}
                    </small>
                  ))}
                </li>
              ))}
            </ul>
          ) : null}
          {brief ? (
            <section className='flex flex-col gap-2'>
              <h3 className='text-base font-medium'>{briefTitle}</h3>
              <Markdown content={brief} />
            </section>
          ) : null}
          {note ? (
            <section className='flex flex-col gap-2'>
              <h3 className='text-base font-medium'>
                {$t('taskDetail.notes')}
              </h3>
              <p className='text-sm whitespace-pre-wrap'>{note}</p>
            </section>
          ) : null}
          {attachments ? (
            <TaskMedia projectId={projectId} taskId={taskId} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
