import {
  $legacyText,
  $t,
  $tj,
  useMessageState,
  useNocoReachLocale,
} from '#i18n';
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from 'react';
import { useOutletContext } from 'react-router';
import { XIcon } from 'lucide-react';
import { InfoTip } from '#components/reach/info-tip';
import { InlineError, ListSkeleton } from '#components/reach/states';
import { RouteDialog } from '#components/route-dialog';
import { Tag } from '#components/reach/tag';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { useRouteOverlay } from '#components/use-route-overlay';
import { useBusinessAccess } from '#hooks/use-business-access';
import { toast } from '#lib/toast';
import { CloseButton } from './memory-edit';
import {
  memoryRequest,
  SOURCE_ITEMS,
  SOURCE_PAGES,
  type MemorySources,
  type ProjectKnowledgeContext,
} from './model';

// 根据官网和资料生成 (user decision 2026-10-21), at /project/memory/generate over the 记忆 tab: the pages and materials the
// AI will read, offered from the earlier choice or the automatic one (home page and main pages, newest materials), to
// change before it runs. A changed list is kept and also read by the weekly check; an untouched automatic choice stays
// automatic, so new main pages and materials are picked up later.
const FORM_ID = 'memory-generate-form';
// The same pages or materials, in any order.
const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));
export default function MemoryGenerateDialog(): ReactElement {
  useNocoReachLocale();
  const context = useOutletContext<ProjectKnowledgeContext>();
  const projectId = context.project.id;
  const { can: canDraft, isPending } = useBusinessAccess(
    'nrMemory.draft',
    projectId,
  );
  // What is offered, and the person's changes to it; both are set when the offer arrives.
  const [sources, setSources] = useState<MemorySources>(),
    [urls, setUrls] = useState<string[]>([]),
    [custom, setCustom] = useState(false),
    [itemIds, setItemIds] = useState<string[]>([]),
    [itemsCustom, setItemsCustom] = useState(false),
    [loadError, setLoadError] = useMessageState(''),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => {
    if (!canDraft) return;
    let active = true;
    void memoryRequest<MemorySources>('sources', projectId)
      .then((r) => {
        if (!active) return;
        setSources(r);
        setUrls(r.urls);
        setCustom(r.custom);
        setItemIds(r.itemIds);
        setItemsCustom(r.itemsCustom);
      })
      .catch((e: unknown) => {
        if (active)
          setLoadError(() =>
            e instanceof Error
              ? $legacyText(e.message)
              : $t('projectKnowledge.notLoadSources'),
          );
      });
    return () => {
      active = false;
    };
  }, [projectId, canDraft, attempt, setLoadError]);
  const running = Boolean(context.updates.status?.running);
  const empty = !urls.length && !itemIds.length;
  // One dialog throughout, so loading and then the form do not swap the panel under the person.
  return (
    <RouteDialog
      title={$t('projectKnowledge.generateTitle')}
      description={$t('projectKnowledge.generateHelp')}
      className='sm:max-w-xl'
      beforeClose={() => !busyRef.current}
      footer={
        sources && canDraft ? (
          <GenerateFooter
            busy={busy}
            disabled={running || empty}
            hint={
              running
                ? $t('projectKnowledge.readingWebsiteMaterialsWriteFirst')
                : empty
                  ? $t('projectKnowledge.nothingToRead')
                  : ''
            }
          />
        ) : isPending || (canDraft && !loadError) ? undefined : (
          <CloseButton />
        )
      }
    >
      {isPending ? (
        <ListSkeleton rows={4} />
      ) : !canDraft ? (
        <p role='alert' className='nr-error'>
          {$t('projectKnowledge.generateDenied')}
        </p>
      ) : sources ? (
        <SourcesBody
          sources={sources}
          urls={urls}
          setUrls={setUrls}
          custom={custom}
          setCustom={setCustom}
          itemIds={itemIds}
          setItemIds={setItemIds}
          itemsCustom={itemsCustom}
          setItemsCustom={setItemsCustom}
          busy={busy}
          disabled={busy || running || empty}
          start={async () => {
            // An untouched automatic choice is sent as null, so it stays automatic.
            const pagesChoice =
              custom || !same(urls, sources.auto) ? urls : null;
            const itemsChoice =
              itemsCustom || !same(itemIds, sources.autoItemIds)
                ? itemIds
                : null;
            busyRef.current = true;
            setBusy(true);
            try {
              await memoryRequest('draft', projectId, {
                urls: pagesChoice,
                itemIds: itemsChoice,
              });
              context.updates.reload();
              toast.success(() => $t('projectKnowledge.generateStarted'));
            } finally {
              busyRef.current = false;
              setBusy(false);
            }
          }}
        />
      ) : loadError ? (
        <InlineError
          action={
            <Button
              size='xs'
              variant='outline'
              className='ml-auto'
              onClick={() => {
                setLoadError('');
                setAttempt((n) => n + 1);
              }}
            >
              {$t('common.retry')}
            </Button>
          }
        >
          {loadError}
        </InlineError>
      ) : (
        <ListSkeleton rows={4} />
      )}
    </RouteDialog>
  );
}

// The pages and the materials, each changeable; submitting starts the draft.
function SourcesBody({
  sources,
  urls,
  setUrls,
  custom,
  setCustom,
  itemIds,
  setItemIds,
  itemsCustom,
  setItemsCustom,
  busy,
  disabled,
  start,
}: {
  sources: MemorySources;
  urls: string[];
  setUrls: (urls: string[]) => void;
  custom: boolean;
  setCustom: (custom: boolean) => void;
  itemIds: string[];
  setItemIds: (ids: string[]) => void;
  itemsCustom: boolean;
  setItemsCustom: (custom: boolean) => void;
  busy: boolean;
  disabled: boolean;
  start: () => Promise<void>;
}): ReactElement {
  const addRef = useRef<HTMLInputElement>(null);
  const autoPages = !custom && same(urls, sources.auto),
    autoItems = !itemsCustom && same(itemIds, sources.autoItemIds);
  return (
    <GenerateForm start={start} disabled={disabled}>
      <section className='flex flex-col gap-2' aria-labelledby='memory-pages'>
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <h3 id='memory-pages' className='text-sm font-medium'>
            {$t('projectKnowledge.pagesToRead')}
          </h3>
          <span className='text-xs text-muted-foreground'>
            {$tj('projectKnowledge.atMost', { 0: SOURCE_PAGES })}
          </span>
          <InfoTip label={$t('common.info')}>
            {$t('projectKnowledge.pagesToReadHelp')}
          </InfoTip>
          {autoPages ? (
            <Tag tone='grey' className='ml-auto'>
              {$t('projectKnowledge.autoPicked')}
            </Tag>
          ) : (
            <Button
              type='button'
              size='xs'
              variant='link'
              className='ml-auto h-auto px-0'
              disabled={busy}
              onClick={() => {
                setUrls(sources.auto);
                setCustom(false);
              }}
            >
              {$t('projectKnowledge.useAutoPages')}
            </Button>
          )}
        </div>
        {urls.length ? (
          <ul className='rounded-lg border text-sm' data-memory-pages>
            {urls.map((u) => (
              <li
                key={u}
                className='flex items-center gap-2 border-b px-3 py-1.5 last:border-0'
              >
                <a
                  className='min-w-0 flex-1 truncate hover:underline'
                  href={u}
                  target='_blank'
                  rel='noreferrer'
                  title={u}
                >
                  {u}
                </a>
                <Button
                  type='button'
                  size='icon-xs'
                  variant='ghost'
                  disabled={busy}
                  aria-label={$t('projectKnowledge.removePage', { 0: u })}
                  title={$t('projectKnowledge.remove')}
                  onClick={() => {
                    setUrls(urls.filter((x) => x !== u));
                    // The button is gone with its row: focus goes to adding a page (guideline A6).
                    requestAnimationFrame(() => addRef.current?.focus());
                  }}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className='rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground'>
            {$t('projectKnowledge.noPages')}
          </p>
        )}
        <AddPage
          urls={urls}
          busy={busy}
          inputRef={addRef}
          onAdd={(u) => setUrls([...urls, u])}
        />
      </section>
      <section
        className='flex flex-col gap-2'
        aria-labelledby='memory-materials'
      >
        <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
          <h3 id='memory-materials' className='text-sm font-medium'>
            {$t('projectKnowledge.materialsToUse')}
          </h3>
          <InfoTip label={$t('common.info')}>
            {$tj('projectKnowledge.materialsToUseHelp', { 0: SOURCE_ITEMS })}
          </InfoTip>
          {autoItems ? (
            <Tag tone='grey' className='ml-auto'>
              {$t('projectKnowledge.newestPicked')}
            </Tag>
          ) : (
            <Button
              type='button'
              size='xs'
              variant='link'
              className='ml-auto h-auto px-0'
              disabled={busy}
              onClick={() => {
                setItemIds(sources.autoItemIds);
                setItemsCustom(false);
              }}
            >
              {$t('projectKnowledge.useAutoPages')}
            </Button>
          )}
        </div>
        {sources.items.length ? (
          <ul className='flex flex-col gap-1.5 text-sm' data-memory-items>
            {sources.items.map((i) => {
              const checked = itemIds.includes(i.id);
              return (
                <li key={i.id}>
                  <label className='flex items-start gap-2'>
                    <input
                      type='checkbox'
                      className='mt-1'
                      checked={checked}
                      disabled={
                        busy || (!checked && itemIds.length >= SOURCE_ITEMS)
                      }
                      onChange={(e) =>
                        setItemIds(
                          e.target.checked
                            ? [...itemIds, i.id]
                            : itemIds.filter((x) => x !== i.id),
                        )
                      }
                    />
                    <span className='min-w-0'>{i.title}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {$t('projectKnowledge.noMaterialsToUse')}
          </p>
        )}
      </section>
    </GenerateForm>
  );
}

// One more page: a full https address not already listed, up to eight pages.
function AddPage({
  urls,
  busy,
  inputRef,
  onAdd,
}: {
  urls: string[];
  busy: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onAdd: (url: string) => void;
}): ReactElement {
  const [value, setValue] = useState(''),
    [error, setError] = useMessageState('');
  const full = urls.length >= SOURCE_PAGES;
  const add = () => {
    let u: URL;
    try {
      u = new URL(value.trim());
    } catch {
      return setError(() => $t('projectKnowledge.pageInvalid'));
    }
    // The same rule as the server: public https pages, no sign-in, port or bare address.
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      u.hostname === 'localhost' ||
      !u.hostname.includes('.') ||
      /^[\d.]+$/.test(u.hostname) ||
      u.hostname.startsWith('[')
    )
      return setError(() => $t('projectKnowledge.pageInvalid'));
    u.hash = '';
    if (urls.includes(u.href))
      return setError(() => $t('projectKnowledge.pageExists'));
    onAdd(u.href);
    setValue('');
    setError('');
  };
  return (
    <div className='flex flex-col gap-1'>
      <div className='flex gap-2'>
        <Input
          ref={inputRef}
          className='min-w-0 flex-1'
          type='url'
          aria-label={$t('projectKnowledge.addPageLabel')}
          placeholder='https://example.com/about'
          value={value}
          disabled={busy || full}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            // Enter adds the page instead of starting the draft.
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (value.trim()) add();
          }}
        />
        <Button
          type='button'
          variant='outline'
          disabled={busy || full || !value.trim()}
          onClick={add}
        >
          {$t('projectKnowledge.addPage')}
        </Button>
      </div>
      {full ? (
        <p className='text-xs text-muted-foreground'>
          {$tj('projectKnowledge.pagesFull', { 0: SOURCE_PAGES })}
        </p>
      ) : null}
      {error ? (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      ) : null}
    </div>
  );
}

// Submitting starts the draft and closes the dialog; the 记忆 tab shows it running.
function GenerateForm({
  start,
  disabled,
  children,
}: {
  start: () => Promise<void>;
  disabled: boolean;
  children: ReactElement[];
}): ReactElement {
  const { close } = useRouteOverlay();
  const [error, setError] = useMessageState('');
  return (
    <form
      id={FORM_ID}
      className='flex flex-col gap-5'
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled) return;
        setError('');
        start().then(
          () => void close(),
          (err: unknown) =>
            setError(() =>
              err instanceof Error
                ? $legacyText(err.message)
                : $t('common.retryFailure'),
            ),
        );
      }}
    >
      {/* At the top, so a refused start is seen however far the form was scrolled. */}
      {error ? (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      ) : null}
      {children}
    </form>
  );
}

function GenerateFooter({
  busy,
  disabled,
  hint,
}: {
  busy: boolean;
  disabled: boolean;
  hint: string;
}): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  return (
    <>
      {hint ? (
        <span className='mr-auto self-center text-xs text-muted-foreground'>
          {hint}
        </span>
      ) : null}
      <Button
        variant='outline'
        disabled={busy || isClosing}
        onClick={() => void close()}
      >
        {$t('common.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={busy || disabled}>
        {busy
          ? $t('common.loadingLoading')
          : $t('projectKnowledge.startGenerating')}
      </Button>
    </>
  );
}
