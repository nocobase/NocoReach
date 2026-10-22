import {
  $legacyText,
  $t,
  $tj,
  getCurrentLocale,
  useMessageState,
  useNocoReachLocale,
} from '#i18n';
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useOutletContext, useParams } from 'react-router';
import { Trash2Icon } from 'lucide-react';
import { confirmAction } from '#components/reach/confirm';
import { InlineError, ListSkeleton } from '#components/reach/states';
import { RouteDrawer } from '#components/route-drawer';
import { Button } from '#components/ui/button';
import { useRouteOverlay } from '#components/use-route-overlay';
import { useBusinessAccess } from '#hooks/use-business-access';
import { toast } from '#lib/toast';
import type { KnowledgeTabContext } from './knowledge-base';
import { day, getCategories, request, type Item } from './model';
import { CloseButton } from './memory-edit';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

// One material, at /project/knowledge/<id> over the list: its title and category (editable), where it came from, and
// its full text; it can be deleted from here too.
const FORM_ID = 'knowledge-item-form';
export default function KnowledgeItemDrawer(): ReactElement {
  useNocoReachLocale();
  const context = useOutletContext<KnowledgeTabContext>();
  const { itemId = '' } = useParams();
  const item = context.items?.find((i) => i.id === itemId);
  if (!context.items)
    return (
      <RouteDrawer
        title={$t('projectKnowledge.material')}
        footer={context.itemsError ? <CloseButton /> : undefined}
      >
        {context.itemsError ? (
          <InlineError
            action={
              <Button
                size='xs'
                variant='outline'
                className='ml-auto'
                onClick={() => void context.reloadItems()}
              >
                {$t('common.retry')}
              </Button>
            }
          >
            {context.itemsError}
          </InlineError>
        ) : (
          <ListSkeleton rows={3} />
        )}
      </RouteDrawer>
    );
  if (!item)
    return (
      <RouteDrawer
        title={$t('projectKnowledge.materialNotFound')}
        footer={<CloseButton />}
      >
        <p className='text-sm text-muted-foreground'>
          {$t('projectKnowledge.materialNotFoundHelp')}
        </p>
      </RouteDrawer>
    );
  return <ItemDrawer key={item.id} item={item} context={context} />;
}

function ItemDrawer({
  item,
  context,
}: {
  item: Item;
  context: KnowledgeTabContext;
}): ReactElement {
  const projectId = context.project.id;
  const { can: canEdit } = useBusinessAccess('nrKnowledge.edit', projectId),
    { can: canRemove } = useBusinessAccess('nrKnowledge.remove', projectId);
  const [text, setText] = useState<string>(),
    [title, setTitle] = useState(item.title),
    [category, setCategory] = useState(item.category),
    [busy, setBusy] = useState(false),
    [error, setError] = useMessageState(''),
    [textError, setTextError] = useState(false),
    [attempt, setAttempt] = useState(0);
  const busyRef = useRef(false),
    doneRef = useRef(false);
  const changed = title.trim() !== item.title || category !== item.category;
  useEffect(() => {
    let active = true;
    void request<{ text: string }>('get', projectId, { itemId: item.id })
      .then((r) => {
        if (active) setText(r.text);
      })
      .catch(() => {
        if (active) setTextError(true);
      });
    return () => {
      active = false;
    };
  }, [projectId, item.id, attempt]);
  const run = async (fn: () => Promise<boolean>) => {
    busyRef.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const save = () =>
    !canEdit || !changed || !title.trim()
      ? Promise.resolve(false)
      : run(async () => {
          setError('');
          try {
            await request('edit', projectId, {
              itemId: item.id,
              title,
              category,
            });
          } catch (e) {
            setError(() =>
              e instanceof Error
                ? $legacyText(e.message)
                : $t('common.notSavedTryAgain'),
            );
            return false;
          }
          doneRef.current = true;
          toast.success(() =>
            $t('projectKnowledge.materialSaved', { 0: title.trim() }),
          );
          void context.reloadItems();
          return true;
        });
  const remove = () =>
    run(async () => {
      const removed = await context.remove(item);
      if (removed) doneRef.current = true;
      return removed;
    });
  const source =
    item.kind === 'file'
      ? $t('projectKnowledge.fileValue', { 0: item.fileName })
      : item.kind === 'link'
        ? $t('projectKnowledge.webPageValue', { 0: item.source || '' })
        : $t('projectKnowledge.pastedText');
  return (
    <RouteDrawer
      title={item.title}
      description={$tj('projectKnowledge.charactersAdded', {
        0: source,
        1: item.chars.toLocaleString(getCurrentLocale()),
        2: day(item.addedAt),
      })}
      beforeClose={async () => {
        if (busyRef.current) return false;
        if (doneRef.current || !canEdit || !changed) return true;
        return confirmAction({
          title: () => $t('common.discardUnsavedChanges'),
          description: () => $t('projectKnowledge.discardItemChanges'),
          action: () => $t('projectKnowledge.discard'),
        });
      }}
      footer={
        canEdit || canRemove ? (
          <DrawerFooter
            busy={busy}
            canEdit={canEdit}
            canSave={changed && Boolean(title.trim())}
            remove={canRemove ? remove : undefined}
          />
        ) : undefined
      }
    >
      <ItemForm save={save}>
        <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]'>
          <label className='nr-field'>
            {$t('common.title')}
            <input
              value={title}
              maxLength={120}
              disabled={!canEdit || busy}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className='nr-field'>
            {$t('common.category')}
            <Select
              value={category}
              disabled={!canEdit || busy}
              onValueChange={(v) => setCategory(String(v))}
            >
              <SelectTrigger
                className='w-full'
                aria-label={$t('common.category')}
              >
                <SelectValue>
                  {(v: string) =>
                    getCategories().find(([k]) => k === v)?.[1] ?? v
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
                {getCategories().map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        {error ? (
          <p role='alert' className='nr-error'>
            {error}
          </p>
        ) : null}
        <div
          className='rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed break-words whitespace-pre-wrap'
          aria-label={$t('projectKnowledge.fullText')}
          role='region'
        >
          {text !== undefined ? (
            text
          ) : textError ? (
            <InlineError
              action={
                <Button
                  size='xs'
                  variant='outline'
                  className='ml-auto'
                  onClick={() => {
                    setTextError(false);
                    setAttempt((n) => n + 1);
                  }}
                >
                  {$t('common.retry')}
                </Button>
              }
            >
              {$t('projectKnowledge.notLoadFullText')}
            </InlineError>
          ) : (
            <ListSkeleton rows={4} />
          )}
        </div>
      </ItemForm>
    </RouteDrawer>
  );
}

// Enter in the title saves, as the footer's Save does: both submit this form, and a saved item closes the drawer.
function ItemForm({
  save,
  children,
}: {
  save: () => Promise<boolean>;
  children: ReactNode;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <form
      id={FORM_ID}
      className='flex flex-col gap-4'
      aria-label={$t('projectKnowledge.materialDetails')}
      onSubmit={(e) => {
        e.preventDefault();
        void save().then((ok) => {
          if (ok) void close();
        });
      }}
    >
      {children}
    </form>
  );
}

function DrawerFooter({
  busy,
  canEdit,
  canSave,
  remove,
}: {
  busy: boolean;
  canEdit: boolean;
  canSave: boolean;
  remove?: () => Promise<boolean>;
}): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      {remove ? (
        <Button
          variant='outline'
          className='text-destructive'
          disabled={busy}
          onClick={() => {
            void remove().then((ok) => {
              if (ok) void close();
            });
          }}
        >
          <Trash2Icon />
          {$t('common.delete')}
        </Button>
      ) : null}
      <Button
        variant='outline'
        disabled={busy || isClosing}
        onClick={() => void close()}
      >
        {canEdit ? $t('common.cancel') : $t('projectKnowledge.close')}
      </Button>
      {canEdit ? (
        <Button type='submit' form={FORM_ID} disabled={busy || !canSave}>
          {busy ? $t('common.saving') : $t('common.save')}
        </Button>
      ) : null}
    </>
  );
}
