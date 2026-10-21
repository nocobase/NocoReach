import {
  $legacyText,
  $t,
  $tj,
  getCurrentLocale,
  useMessageState,
  useNocoReachLocale,
} from '#i18n';
import { useRef, useState, type ReactElement } from 'react';
import { useOutletContext, useParams } from 'react-router';
import { confirmAction } from '#components/reach/confirm';
import { ListSkeleton } from '#components/reach/states';
import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { useRouteOverlay } from '#components/use-route-overlay';
import { useBusinessAccess } from '#hooks/use-business-access';
import {
  getMemorySections,
  memoryOf,
  request,
  SECTION_MAX,
  type MemoryKey,
  type ProjectKnowledgeContext,
} from './model';

// One 记忆 item edited on its own (user decision 2026-10-20), at /project/memory/<item>/edit over the 记忆 tab: the
// project name or one of the nine sections. Only that item is sent; the server merges it into what is saved now, so an
// item someone else changed meanwhile is kept.
const FORM_ID = 'memory-item-form';
export default function MemoryEditDialog(): ReactElement {
  useNocoReachLocale();
  const { section = '' } = useParams();
  // Another item's address starts over with that item's text.
  return <ItemDialog key={section} section={section} />;
}

function ItemDialog({ section }: { section: string }): ReactElement {
  const context = useOutletContext<ProjectKnowledgeContext>();
  const { project } = context;
  const entry =
    section === 'name'
      ? ([section, $t('common.projectName'), ''] as const)
      : getMemorySections().find(([k]) => k === section);
  const current = entry
    ? section === 'name'
      ? project.name
      : memoryOf(project)[section as MemoryKey]
    : '';
  const { can: canSave, isPending } = useBusinessAccess(
    'nrKnowledge.saveMemory',
    project.id,
  );
  const [text, setText] = useState(current),
    [busy, setBusy] = useState(false);
  // What beforeClose reads besides the text: a state would lag one render behind a save that closes right away.
  const busyRef = useRef(false),
    savedRef = useRef(false);
  if (entry && isPending)
    return (
      <RouteDialog title={entry[1]} className='sm:max-w-xl'>
        <ListSkeleton rows={3} />
      </RouteDialog>
    );
  if (!entry)
    return (
      <RouteDialog
        title={$t('projectKnowledge.itemNotFound')}
        className='sm:max-w-md'
        footer={<CloseButton />}
      >
        <p className='text-sm text-muted-foreground'>
          {$t('projectKnowledge.itemNotFoundHelp')}
        </p>
      </RouteDialog>
    );
  return (
    <RouteDialog
      title={
        !canSave
          ? entry[1]
          : current
            ? $t('projectKnowledge.editValue', { 0: entry[1] })
            : $t('projectKnowledge.fillValue', { 0: entry[1] })
      }
      description={entry[2] || undefined}
      className='sm:max-w-xl'
      beforeClose={async () => {
        if (busyRef.current) return false;
        if (savedRef.current || text === current) return true;
        return confirmAction({
          title: () => $t('common.discardUnsavedChanges'),
          description: () => $t('projectKnowledge.discardItemChanges'),
          action: () => $t('projectKnowledge.discard'),
        });
      }}
      footer={
        canSave ? (
          <SaveFooter
            busy={busy}
            disabled={section === 'name' && !text.trim()}
          />
        ) : (
          <CloseButton />
        )
      }
    >
      {canSave ? (
        <EditForm
          section={section}
          title={entry[1]}
          text={text}
          onText={setText}
          busy={busy}
          save={async () => {
            busyRef.current = true;
            setBusy(true);
            try {
              await request(
                'saveMemory',
                project.id,
                section === 'name'
                  ? { name: text.trim() }
                  : { section, text: text.trim() },
              );
              savedRef.current = true;
              context.projectSaved(() =>
                $t('projectKnowledge.itemSaved', { 0: entry[1] }),
              );
            } finally {
              busyRef.current = false;
              setBusy(false);
            }
          }}
        />
      ) : (
        <p className='text-sm whitespace-pre-wrap'>
          {current || $t('projectKnowledge.notFilledTag')}
        </p>
      )}
    </RouteDialog>
  );
}

// The field, its length and any error; submitting saves and closes the dialog.
function EditForm({
  section,
  title,
  text,
  onText,
  busy,
  save,
}: {
  section: string;
  title: string;
  text: string;
  onText: (t: string) => void;
  busy: boolean;
  save: () => Promise<void>;
}): ReactElement {
  const { close } = useRouteOverlay();
  const [error, setError] = useMessageState('');
  return (
    <form
      id={FORM_ID}
      className='flex flex-col gap-2'
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || (section === 'name' && !text.trim())) return;
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
      <label className='nr-field'>
        <span className='sr-only'>{title}</span>
        {section === 'name' ? (
          <input
            value={text}
            maxLength={200}
            disabled={busy}
            autoFocus
            onChange={(e) => onText(e.target.value)}
          />
        ) : (
          <textarea
            rows={10}
            maxLength={SECTION_MAX}
            value={text}
            disabled={busy}
            autoFocus
            onChange={(e) => onText(e.target.value)}
          />
        )}
      </label>
      {section === 'name' ? null : (
        <p className='text-xs text-muted-foreground tabular-nums'>
          {$tj('projectKnowledge.itemLength', {
            0: text.trim().length.toLocaleString(getCurrentLocale()),
            1: SECTION_MAX.toLocaleString(getCurrentLocale()),
          })}
        </p>
      )}
      {error ? (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      ) : null}
    </form>
  );
}
function SaveFooter({
  busy,
  disabled,
}: {
  busy: boolean;
  disabled: boolean;
}): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      <Button
        variant='outline'
        disabled={busy || isClosing}
        onClick={() => void close()}
      >
        {$t('common.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={busy || disabled}>
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
