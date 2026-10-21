import {
  $legacyText,
  $t,
  $tj,
  getCurrentLocale,
  useMessageState,
  useNocoReachLocale,
} from '#i18n';
import { useRef, useState, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';
import { confirmAction } from '#components/reach/confirm';
import { ListSkeleton } from '#components/reach/states';
import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { useRouteOverlay } from '#components/use-route-overlay';
import { useBusinessAccess } from '#hooks/use-business-access';
import { cn } from '#lib/utils';
import {
  getMemorySections,
  memoryOf,
  MEMORY_MAX,
  request,
  SECTION_MAX,
  SUGGESTED,
  type Memory,
  type ProjectKnowledgeContext,
} from './model';

// 编辑记忆 (user decision 2026-10-21: one 编辑 for every item instead of a pencil per row), at /project/memory/edit over
// the 记忆 tab: the project name and the nine sections. Only the items changed here are sent; the server merges them
// into what is saved now, so an item someone else changed meanwhile is kept.
const FORM_ID = 'memory-edit-form';
export default function MemoryEditDialog(): ReactElement {
  useNocoReachLocale();
  const context = useOutletContext<ProjectKnowledgeContext>();
  const { project } = context;
  const { can: canSave, isPending } = useBusinessAccess(
    'nrKnowledge.saveMemory',
    project.id,
  );
  // What the dialog opened with; the edits are compared against it.
  const [initial] = useState(() => ({
    name: project.name,
    memory: memoryOf(project),
  }));
  const [name, setName] = useState(initial.name),
    [memory, setMemory] = useState<Memory>(initial.memory),
    [busy, setBusy] = useState(false);
  // What beforeClose reads besides the fields: a state would lag one render behind a save that closes right away.
  const busyRef = useRef(false),
    savedRef = useRef(false);
  const changed = getMemorySections()
    .map(([k]) => k)
    .filter((k) => memory[k].trim() !== initial.memory[k].trim());
  const nameChanged = name.trim() !== initial.name.trim();
  const dirty = nameChanged || changed.length > 0;
  if (isPending)
    return (
      <RouteDialog title={$t('projectKnowledge.editMemory')}>
        <ListSkeleton rows={4} />
      </RouteDialog>
    );
  return (
    <RouteDialog
      title={$t('projectKnowledge.editMemory')}
      description={$t('projectKnowledge.editMemoryHelp')}
      className='sm:max-w-2xl'
      beforeClose={async () => {
        if (busyRef.current) return false;
        if (savedRef.current || !dirty) return true;
        return confirmAction({
          title: () => $t('common.discardUnsavedChanges'),
          description: () => $t('projectKnowledge.discardItemChanges'),
          action: () => $t('projectKnowledge.discard'),
        });
      }}
      footer={
        canSave ? (
          <EditFooter
            busy={busy}
            canSubmit={dirty && Boolean(name.trim())}
            memory={memory}
          />
        ) : (
          <CloseButton />
        )
      }
    >
      {canSave ? (
        <EditForm
          name={name}
          onName={setName}
          memory={memory}
          onMemory={setMemory}
          busy={busy}
          save={async () => {
            busyRef.current = true;
            setBusy(true);
            try {
              await request('saveMemory', project.id, {
                ...(nameChanged ? { name: name.trim() } : {}),
                ...(changed.length
                  ? {
                      sections: Object.fromEntries(
                        changed.map((k) => [k, memory[k].trim()]),
                      ),
                    }
                  : {}),
              });
              savedRef.current = true;
              context.projectSaved(() => $t('projectKnowledge.memorySaved'));
            } finally {
              busyRef.current = false;
              setBusy(false);
            }
          }}
        />
      ) : (
        <p role='alert' className='nr-error'>
          {$t('projectKnowledge.editDenied')}
        </p>
      )}
    </RouteDialog>
  );
}

// Every field with its hint; submitting saves and closes the dialog.
function EditForm({
  name,
  onName,
  memory,
  onMemory,
  busy,
  save,
}: {
  name: string;
  onName: (name: string) => void;
  memory: Memory;
  onMemory: (memory: Memory) => void;
  busy: boolean;
  save: () => Promise<void>;
}): ReactElement {
  const { close } = useRouteOverlay();
  const [error, setError] = useMessageState('');
  return (
    <form
      id={FORM_ID}
      className='flex flex-col gap-4'
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || !name.trim()) return;
        setError('');
        save().then(
          () => void close(),
          (err: unknown) =>
            setError(() =>
              err instanceof Error
                ? $legacyText(err.message)
                : $t('common.notSavedTryAgain'),
            ),
        );
      }}
    >
      {/* At the top, so a failed save is seen however far the form was scrolled. */}
      {error ? (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      ) : null}
      <label className='nr-field'>
        <span>
          {$t('common.projectName')} <span aria-hidden='true'>*</span>
        </span>
        <input
          value={name}
          maxLength={200}
          required
          disabled={busy}
          onChange={(e) => onName(e.target.value)}
        />
      </label>
      {getMemorySections().map(([k, title, hint]) => (
        <label key={k} className='nr-field' data-memory-field={k}>
          <span>
            {title}
            <span className='font-normal text-muted-foreground'>
              {' · '}
              {hint}
            </span>
          </span>
          <textarea
            rows={k === 'brand' || k === 'product' ? 5 : 3}
            maxLength={SECTION_MAX}
            value={memory[k]}
            disabled={busy}
            onChange={(e) => onMemory({ ...memory, [k]: e.target.value })}
          />
        </label>
      ))}
    </form>
  );
}

function EditFooter({
  busy,
  canSubmit,
  memory,
}: {
  busy: boolean;
  canSubmit: boolean;
  memory: Memory;
}): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  const total = Object.values(memory).reduce((n, t) => n + t.trim().length, 0);
  return (
    <>
      {/* A hint, not a status: it turns red only past what the server accepts. */}
      <span
        className={cn(
          'mr-auto self-center text-xs tabular-nums',
          total > MEMORY_MAX ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {$tj('projectKnowledge.memoryTotal', {
          0: total.toLocaleString(getCurrentLocale()),
          1: SUGGESTED.toLocaleString(getCurrentLocale()),
        })}
      </span>
      <Button
        variant='outline'
        disabled={busy || isClosing}
        onClick={() => void close()}
      >
        {$t('common.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={busy || !canSubmit}>
        {busy ? $t('common.saving') : $t('common.save')}
      </Button>
    </>
  );
}
export function CloseButton(): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <Button variant='outline' onClick={() => void close()}>
      {$t('projectKnowledge.close')}
    </Button>
  );
}
