import { useNocoReachLocale, $t } from '#i18n';
import { useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
// Ask before anything with consequences (NocoSolution frontend standard §9.3): the title names the thing, the line below
// says what happens, the button says the action. Replaces the browser's own confirm() box everywhere. Mounts itself once,
// so pages call `if(await confirmAction({...}))` without placing a component.
export type ConfirmAsk = {
  title: string | (() => string);
  description?: ReactNode | (() => ReactNode);
  action: string | (() => string);
  /** Deleting, disconnecting, discarding: red. Set false for an action that only needs a second look. */
  destructive?: boolean;
  /** Cancel the pending intent and dismiss its dialog when the initiating owner is gone. */
  signal?: AbortSignal;
};
let root: Root | null = null;
let activeAbort: (() => void) | null = null;
export function confirmAction(ask: ConfirmAsk): Promise<boolean> {
  if (ask.signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      ask.signal?.removeEventListener('abort', abort);
      if (activeAbort === abort) activeAbort = null;
      resolve(ok);
    };
    const abort = () => {
      // An older owner's cancellation must not dismiss a newer confirmation.
      if (activeAbort === abort) root?.render(null);
      finish(false);
    };
    if (!root) {
      const host = document.createElement('div');
      host.setAttribute('data-confirm-host', '');
      document.body.appendChild(host);
      root = createRoot(host);
    }
    activeAbort = abort;
    ask.signal?.addEventListener('abort', abort, { once: true });
    root.render(
      <ConfirmDialog key={Math.random()} ask={ask} onDone={finish} />,
    );
  });
}
// eslint-disable-next-line react-refresh/only-export-components -- The imperative confirmation API owns this private dialog root.
function ConfirmDialog({
  ask,
  onDone,
}: {
  ask: ConfirmAsk;
  onDone: (ok: boolean) => void;
}) {
  useNocoReachLocale();
  const renderText = (value: ReactNode | (() => ReactNode)) =>
    typeof value === 'function'
      ? value()
      : typeof value === 'string'
        ? $t(value)
        : value;
  const [open, setOpen] = useState(true),
    doneRef = useRef(false);
  const finish = (ok: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setOpen(false);
    onDone(ok);
  };
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) finish(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{renderText(ask.title)}</AlertDialogTitle>
          {ask.description ? (
            <AlertDialogDescription>
              {renderText(ask.description)}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{$t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant={ask.destructive === false ? 'default' : 'destructive'}
            onClick={() => finish(true)}
          >
            {renderText(ask.action)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The question before leaving a form or page with unsaved input: discard and leave, or stay. */
export function confirmUnsavedLeave(): Promise<boolean> {
  return confirmAction({
    title: () => $t('common.discardUnsavedChanges'),
    description: () => $t('common.unsavedChangesLost'),
    action: () => $t('common.discard'),
  });
}

/** The question before leaving a task page with drafts, which are kept while moving within the workspace. */
export function confirmLeaveWithDrafts(): Promise<boolean> {
  return confirmAction({
    title: () => $t('taskDetail.leaveWithDraftsTitle'),
    description: () => $t('taskDetail.leaveWithDrafts'),
    action: () => $t('common.leaveAnyway'),
    destructive: false,
  });
}
