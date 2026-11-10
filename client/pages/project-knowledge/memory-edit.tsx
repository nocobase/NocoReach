import {
  $legacyText,
  $t,
  $tj,
  getCurrentLocale,
  useMessageState,
  useNocoReachLocale,
} from '#i18n';
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { useOutletContext, useSearchParams } from 'react-router';
import { XIcon } from 'lucide-react';
import { chipClass } from '#components/reach/chip';
import {
  TOPIC_MAX_LENGTH,
  TOPICS_MAX,
  cleanTopic,
  topicKey,
} from '../../../shared/followed-topics';
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
  topicsOf,
  type Memory,
  type ProjectKnowledgeContext,
} from './model';

// Edit memory (user decision 2026-10-21: one Edit for every item instead of a pencil per row), at /project/memory/edit over
// the Memory tab: the project name, the nine sections and the followed topics (2026-11-10, a tag field below
// Competitors; ?field=topics opens the dialog there, as the source pages' Edit in Memory does). Only the items changed
// here are sent; the server merges them into what is saved now, so an item someone else changed meanwhile is kept.
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
    topics: topicsOf(project),
  }));
  const [name, setName] = useState(initial.name),
    [memory, setMemory] = useState<Memory>(initial.memory),
    [topics, setTopics] = useState<string[]>(initial.topics),
    [busy, setBusy] = useState(false);
  // What beforeClose reads besides the fields: a state would lag one render behind a save that closes right away.
  const busyRef = useRef(false),
    savedRef = useRef(false);
  const changed = getMemorySections()
    .map(([k]) => k)
    .filter((k) => memory[k].trim() !== initial.memory[k].trim());
  const nameChanged = name.trim() !== initial.name.trim();
  const topicsChanged =
    JSON.stringify(topics) !== JSON.stringify(initial.topics);
  const dirty = nameChanged || changed.length > 0 || topicsChanged;
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
          topics={topics}
          onTopics={setTopics}
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
                ...(topicsChanged ? { topics } : {}),
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
  topics,
  onTopics,
  busy,
  save,
}: {
  name: string;
  onName: (name: string) => void;
  memory: Memory;
  onMemory: (memory: Memory) => void;
  topics: string[];
  onTopics: (topics: string[]) => void;
  busy: boolean;
  save: () => Promise<void>;
}): ReactElement {
  const { close } = useRouteOverlay();
  const [error, setError] = useMessageState('');
  const [params] = useSearchParams();
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
        <Fragment key={k}>
          <label className='nr-field' data-memory-field={k}>
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
          {k === 'competitors' ? (
            <TopicsField
              topics={topics}
              onTopics={onTopics}
              busy={busy}
              focus={params.get('field') === 'topics'}
            />
          ) : null}
        </Fragment>
      ))}
    </form>
  );
}

// Followed topics as tags: Enter (or a comma) adds the typed topic, × or Backspace in the empty box removes one, and a
// topic left typed is added when the box loses focus, so Save keeps it. Over TOPICS_MAX (lists moved here from the
// sources) the extra ones are faded and the field asks to trim the list.
function TopicsField({
  topics,
  onTopics,
  busy,
  focus,
}: {
  topics: string[];
  onTopics: (topics: string[]) => void;
  busy: boolean;
  focus: boolean;
}): ReactElement {
  const [draft, setDraft] = useState(''),
    [error, setError] = useMessageState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Focusing scrolls the field into view in the dialog.
    if (focus) inputRef.current?.focus();
  }, [focus]);
  const add = () => {
    const raw = draft.trim();
    if (!raw) return;
    const topic = cleanTopic(raw);
    if (!topic) {
      setError(() => $t('memory.invalidTopic', { 0: raw }));
      return;
    }
    if (topics.some((t) => topicKey(t) === topicKey(topic))) {
      setDraft('');
      setError('');
      return;
    }
    if (topics.length >= TOPICS_MAX) {
      setError(() => $t('memory.tooManyTopics', { 0: TOPICS_MAX }));
      return;
    }
    onTopics([...topics, topic]);
    setDraft('');
    setError('');
  };
  return (
    <div
      className='flex flex-col gap-2 text-sm font-medium'
      data-memory-field='topics'
    >
      <label htmlFor='memory-topics'>
        {$t('projectKnowledge.followedTopics')}
        <span className='font-normal text-muted-foreground'>
          {' · '}
          {$t('projectKnowledge.topicsFieldHint', { 0: TOPICS_MAX })}
        </span>
      </label>
      <div
        className='flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 font-normal focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30'
        onClick={() => inputRef.current?.focus()}
      >
        {topics.map((t, i) => (
          <span
            key={t}
            className={cn(
              chipClass,
              i >= TOPICS_MAX && 'border-dashed text-muted-foreground',
            )}
            data-topic={t}
          >
            {t}
            <button
              type='button'
              className='-mr-1 rounded-full text-muted-foreground hover:text-foreground'
              aria-label={$t('projectKnowledge.removeTopic', { 0: t })}
              disabled={busy}
              onClick={() => onTopics(topics.filter((x) => x !== t))}
            >
              <XIcon className='size-3' />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id='memory-topics'
          value={draft}
          maxLength={TOPIC_MAX_LENGTH}
          disabled={busy}
          placeholder={
            topics.length >= TOPICS_MAX
              ? ''
              : $t('projectKnowledge.topicPlaceholder')
          }
          className='min-h-0! min-w-40 flex-1 rounded-none! border-0! bg-transparent! p-0! shadow-none! outline-none'
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            } else if (e.key === 'Backspace' && !draft && topics.length)
              onTopics(topics.slice(0, -1));
          }}
          onBlur={add}
        />
      </div>
      {topics.length > TOPICS_MAX ? (
        <p className='text-xs font-normal text-nr-ink-amber'>
          {$t('projectKnowledge.trimTopicsHelp', {
            0: topics.length,
            1: TOPICS_MAX,
          })}
        </p>
      ) : null}
      {error ? (
        <p role='alert' className='text-xs font-normal text-destructive'>
          {error}
        </p>
      ) : null}
    </div>
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
