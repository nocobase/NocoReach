import { cn } from '#lib/utils';
import {
  segmentedItemClass,
  segmentedListClass,
} from '#components/reach/segmented';
import {
  $legacyText,
  $t,
  $tj,
  getCurrentLocale,
  useMessageState,
  type Message,
  useNocoReachLocale,
} from '#i18n';
import { useRef, useState, type ReactElement } from 'react';
import { useOutletContext } from 'react-router';
import { confirmAction } from '#components/reach/confirm';
import { InlineError, ListSkeleton } from '#components/reach/states';
import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { useRouteOverlay } from '#components/use-route-overlay';
import { useBusinessAccess } from '#hooks/use-business-access';
import type { KnowledgeTabContext } from './knowledge-base';
import { addRequest, getCategories, type MemoryKey } from './model';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

// 添加资料 (项目知识 step 3), at /project/knowledge/new over the list: a link, text or a file. The online AI suggests the
// 知识库 title and category and new 记忆 lines; a SKILL.md or a Skill link goes to Skills. Nothing is saved until 确认.
type MemoryLine = {
  section: MemoryKey;
  label: string;
  text: string;
  reason?: string;
  examples?: string[];
};
type Suggestion = {
  kind: 'knowledge' | 'skill' | 'skills';
  draftId?: string;
  source?: string;
  chars?: number;
  aiUsed?: boolean;
  aiError?: string;
  title?: string;
  category?: string;
  summary?: string;
  memory?: MemoryLine[];
  skill?: { name: string; description: string; files: number };
  choices?: {
    path: string;
    name: string;
    description: string;
    exists?: boolean;
  }[];
};
type Mode = 'text' | 'file' | 'link';
const toBase64 = (f: File) =>
  new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () =>
      ok(typeof r.result === 'string' ? r.result.split(',')[1] || '' : '');
    r.onerror = () => no(new Error($t('projectKnowledge.notReadFile')));
    r.readAsDataURL(f);
  });

export default function AddKnowledgeDialog(): ReactElement {
  useNocoReachLocale();
  const context = useOutletContext<KnowledgeTabContext>();
  const projectId = context.project.id;
  const { can: canSuggest, isPending: suggestPending } = useBusinessAccess(
      'nrKnowledgeAdd.suggest',
      projectId,
    ),
    { can: canConfirmAdd, isPending: confirmPending } = useBusinessAccess(
      'nrKnowledgeAdd.confirm',
      projectId,
    ),
    { can: canImport } = useBusinessAccess('nrSkills.import'),
    { can: canImportLink } = useBusinessAccess('nrSkills.importLink');
  const [mode, setMode] = useState<Mode>('text'),
    [text, setText] = useState(''),
    [url, setUrl] = useState(''),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useMessageState('');
  const [sug, setSug] = useState<Suggestion>(),
    [keep, setKeep] = useState(true),
    [title, setTitle] = useState(''),
    [category, setCategory] = useState('other'),
    [lines, setLines] = useState<Record<number, boolean>>({}),
    [paths, setPaths] = useState<string[]>([]);
  // What beforeClose reads: no closing while a request runs; ask before throwing away what was entered.
  const busyRef = useRef(false),
    savedRef = useRef(false);
  const entered = Boolean(sug || text.trim() || url.trim() || file);
  const changeBusy = (next: boolean) => {
    busyRef.current = next;
    setBusy(next);
  };
  const allowed = canSuggest && canConfirmAdd;
  async function look() {
    setError('');
    if (mode === 'text' && !text.trim())
      return setError(() => $t('projectKnowledge.pasteSomeContent'));
    if (mode === 'file' && !file)
      return setError(() => $t('projectKnowledge.pickFile'));
    if (mode === 'link' && !url.trim())
      return setError(() => $t('projectKnowledge.urlRequired'));
    if (mode === 'file' && file && file.size > 5 * 1024 * 1024)
      return setError(() => $t('projectKnowledge.fileTooLargeKeepUnder'));
    changeBusy(true);
    try {
      const body =
        mode === 'file' && file
          ? { file: { name: file.name, data: await toBase64(file) } }
          : mode === 'link'
            ? { url: url.trim() }
            : { text };
      const r = await addRequest<Suggestion>('suggest', projectId, body);
      setSug(r);
      setKeep(true);
      setTitle(r.title || '');
      setCategory(r.category || 'other');
      setLines(Object.fromEntries((r.memory || []).map((_, i) => [i, true])));
      setPaths([]);
    } catch (e) {
      setError(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('projectKnowledge.notLoadTryAgain'),
      );
    } finally {
      changeBusy(false);
    }
  }
  const canConfirm =
    sug?.kind === 'knowledge' ||
    (sug?.kind === 'skills' ? canImportLink : canImport);
  async function confirmAdd(): Promise<boolean> {
    if (!sug || !canConfirm) return false;
    changeBusy(true);
    setError('');
    try {
      const memory = (sug.memory || [])
        .filter((_, i) => lines[i])
        .map((m) => ({ section: m.section, text: m.text }));
      const r = await addRequest<{
        item?: { title: string };
        memory?: string[];
        skill?: { skill?: { name: string }; imported?: string[] };
      }>(
        'confirm',
        projectId,
        sug.kind === 'knowledge'
          ? {
              draftId: sug.draftId,
              saveKnowledge: keep,
              title,
              category,
              memory,
            }
          : sug.draftId
            ? { draftId: sug.draftId }
            : { kind: sug.kind, link: sug.source, paths },
      );
      const message: Message = () =>
        [
          r.item
            ? $t('projectKnowledge.savedKnowledgeBase', { 0: r.item.title })
            : '',
          r.memory?.length
            ? $t('projectKnowledge.addedMemory', { 0: r.memory.join('、') })
            : '',
          r.skill?.skill
            ? $t('projectKnowledge.skillImported', { 0: r.skill.skill.name })
            : r.skill?.imported?.length
              ? $t('projectKnowledge.skillImported', {
                  0: r.skill.imported.join('、'),
                })
              : '',
        ]
          .filter(Boolean)
          .join('；') || $t('projectKnowledge.nothingSaved');
      savedRef.current = true;
      void context.reloadItems();
      context.projectSaved(message);
      return true;
    } catch (e) {
      setError(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('common.notSavedTryAgain'),
      );
      return false;
    } finally {
      changeBusy(false);
    }
  }
  const picked = (sug?.memory || []).filter((_, i) => lines[i]).length,
    nothing = sug?.kind === 'knowledge' && !keep && !picked;
  return (
    <RouteDialog
      title={$t('projectKnowledge.addMaterial')}
      description={
        sug
          ? $t('projectKnowledge.lookOverAiSuggestionsSelect')
          : $t('projectKnowledge.pasteTextUploadFileEnter')
      }
      className='sm:max-w-xl'
      beforeClose={async () => {
        if (busyRef.current) return false;
        if (savedRef.current || !entered) return true;
        return confirmAction({
          title: () => $t('common.discardUnsavedChanges'),
          description: () => $t('projectKnowledge.discardAddDescription'),
          action: () => $t('projectKnowledge.discard'),
        });
      }}
      footer={
        allowed ? (
          sug ? (
            <>
              <Button
                variant='outline'
                disabled={busy}
                onClick={() => setSug(undefined)}
              >
                {$t('projectKnowledge.back')}
              </Button>
              <ConfirmButton
                busy={busy}
                disabled={
                  !canConfirm ||
                  nothing ||
                  (sug.kind === 'skills' && !paths.length)
                }
                confirm={confirmAdd}
              />
            </>
          ) : (
            <>
              <CancelButton busy={busy} />
              <Button disabled={busy} onClick={() => void look()}>
                {busy
                  ? $t('common.loadingLoading')
                  : $t('projectKnowledge.next')}
              </Button>
            </>
          )
        ) : (
          <CancelButton busy={false} />
        )
      }
    >
      <div data-knowledge-add-body>
        {suggestPending || confirmPending ? (
          <ListSkeleton rows={3} />
        ) : !allowed ? (
          <p role='alert' className='nr-error'>
            {$t('projectKnowledge.addDenied')}
          </p>
        ) : !sug ? (
          <div className='flex flex-col gap-3'>
            <div
              className={cn(segmentedListClass, 'self-start')}
              role='group'
              aria-label={$t('projectKnowledge.howAdd')}
            >
              {(
                [
                  ['text', $t('projectKnowledge.pasteText')],
                  ['file', $t('projectKnowledge.uploadFile')],
                  ['link', $t('projectKnowledge.urlPlaceholder')],
                ] as const
              ).map(([k, v]) => (
                <button
                  key={k}
                  type='button'
                  className={segmentedItemClass}
                  aria-pressed={mode === k}
                  onClick={() => {
                    setMode(k);
                    setError('');
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
            {mode === 'text' ? (
              <label className='nr-field'>
                {$t('projectKnowledge.content')}
                <textarea
                  rows={8}
                  value={text}
                  disabled={busy}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={$t(
                    'projectKnowledge.pasteArticleInterviewNotesCompetitor',
                  )}
                />
              </label>
            ) : mode === 'file' ? (
              <label className='nr-field'>
                {$t('projectKnowledge.file')}
                <input
                  type='file'
                  accept='.pdf,.docx,.doc,.pptx,.xlsx,.xls,.md,.markdown,.txt,.csv,.json'
                  disabled={busy}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <span className='text-xs font-normal text-muted-foreground'>
                  {$t('projectKnowledge.pdfWordPowerpointExcelMarkdown')}
                </span>
              </label>
            ) : (
              <label className='nr-field'>
                {$t('projectKnowledge.url')}
                <input
                  value={url}
                  disabled={busy}
                  placeholder={$t('projectKnowledge.httpsWebPageSkillLink')}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </label>
            )}
            {error ? (
              <p role='alert' className='nr-error'>
                {error}
              </p>
            ) : null}
          </div>
        ) : sug.kind === 'knowledge' ? (
          <div className='flex flex-col gap-3' data-suggestion='knowledge'>
            {sug.aiError ? (
              <InlineError>{$legacyText(sug.aiError)}</InlineError>
            ) : null}
            <label className='flex items-center gap-2 text-sm font-medium'>
              <input
                type='checkbox'
                checked={keep}
                disabled={busy}
                onChange={(e) => setKeep(e.target.checked)}
              />
              {$t('projectKnowledge.saveKnowledgeBase')}
              <span className='text-xs font-normal text-muted-foreground'>
                {$tj('common.characters', {
                  0: sug.chars?.toLocaleString(getCurrentLocale()),
                })}
              </span>
            </label>
            {keep ? (
              <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]'>
                <label className='nr-field'>
                  {$t('common.title')}
                  <input
                    value={title}
                    maxLength={120}
                    disabled={busy}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className='nr-field'>
                  {$t('common.category')}
                  <Select
                    value={category}
                    disabled={busy}
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
            ) : null}
            {sug.summary && keep ? (
              <p className='text-xs text-muted-foreground'>{sug.summary}</p>
            ) : null}
            <div className='flex flex-col gap-2'>
              <p className='text-sm font-medium'>
                {$tj('projectKnowledge.addMemory', {
                  0: sug.memory?.length
                    ? ''
                    : $t('projectKnowledge.nothingWorthRememberingLongTerm'),
                })}
              </p>
              {(sug.memory || []).map((m, i) => (
                <label
                  key={`${m.section}:${m.text}`}
                  className='flex items-start gap-2 rounded-md border p-2.5 text-sm'
                  data-memory-line={m.section}
                >
                  <input
                    type='checkbox'
                    className='mt-1'
                    checked={Boolean(lines[i])}
                    disabled={busy}
                    onChange={(e) =>
                      setLines({ ...lines, [i]: e.target.checked })
                    }
                  />
                  <span className='min-w-0'>
                    <span className='text-xs text-muted-foreground'>
                      {m.label}
                    </span>
                    <span className='block'>{m.text}</span>
                    {m.reason ? (
                      <span className='block text-xs text-muted-foreground'>
                        {m.reason}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
            {error ? (
              <p role='alert' className='nr-error'>
                {error}
              </p>
            ) : null}
          </div>
        ) : (
          <div className='flex flex-col gap-3' data-suggestion='skill'>
            {!canConfirm ? (
              <p role='alert' className='nr-error'>
                {$t('projectKnowledge.skillImportDenied')}
              </p>
            ) : null}
            {sug.kind === 'skill' ? (
              <p className='text-sm'>
                {$t('projectKnowledge.skill')}
                <b className='font-medium'>{sug.skill?.name}</b>
                {$tj('projectKnowledge.onceConfirmedGoesSkillsAgent', {
                  0: sug.skill?.description
                    ? ` — ${sug.skill.description}`
                    : '',
                })}
              </p>
            ) : (
              <>
                <p className='text-sm'>
                  {$tj('projectKnowledge.repositorySkillsSelectOnesImport', {
                    0: sug.choices?.length,
                  })}
                </p>
                {(sug.choices || []).map((c) => (
                  <label
                    key={c.path}
                    className='flex items-start gap-2 text-sm'
                  >
                    <input
                      type='checkbox'
                      className='mt-1'
                      disabled={busy || c.exists}
                      checked={paths.includes(c.path)}
                      onChange={(e) =>
                        setPaths(
                          e.target.checked
                            ? [...paths, c.path]
                            : paths.filter((x) => x !== c.path),
                        )
                      }
                    />
                    <span>
                      <b className='font-medium'>{c.name}</b>
                      {c.exists ? $t('projectKnowledge.exists') : ''}
                      <span className='block text-xs text-muted-foreground'>
                        {c.description}
                      </span>
                    </span>
                  </label>
                ))}
              </>
            )}
            {error ? (
              <p role='alert' className='nr-error'>
                {error}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </RouteDialog>
  );
}

function CancelButton({ busy }: { busy: boolean }): ReactElement {
  const { close, isClosing } = useRouteOverlay();
  return (
    <Button
      variant='outline'
      disabled={busy || isClosing}
      onClick={() => void close()}
    >
      {$t('common.cancel')}
    </Button>
  );
}
function ConfirmButton({
  busy,
  disabled,
  confirm,
}: {
  busy: boolean;
  disabled: boolean;
  confirm: () => Promise<boolean>;
}): ReactElement {
  const { close } = useRouteOverlay();
  return (
    <Button
      disabled={busy || disabled}
      onClick={() => {
        void confirm().then((ok) => {
          if (ok) void close();
        });
      }}
    >
      {busy ? $t('common.saving') : $t('projectKnowledge.confirm')}
    </Button>
  );
}
