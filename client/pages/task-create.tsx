import {
  ApiClientError,
  useApiClient,
  useNavigationGuard,
} from '@nocobase/app-client';
import { confirmUnsavedLeave } from '#components/reach/confirm';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useLocation } from 'react-router';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { SparklesIcon } from 'lucide-react';
import { z } from 'zod';
import { $legacyText, $t } from '#i18n';
import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { InfoTip } from '#components/reach/info-tip';
import { nocobaseClient } from '#lib/nocoreach-api';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '#components/ui/field';
import { confirmAction } from '#components/reach/confirm';
import { refreshNavBadges } from '#components/app-shell/nav-badges';
import { toast } from '#lib/toast';
import { useProject } from './reach-data.js';
import {
  TASK_DRAFT_IDEA_MAX,
  TASK_FILE_ACCEPT,
  TASK_MEDIA_COUNT,
  TASK_MEDIA_LIMIT,
  taskFileType,
  TASK_WHY_MAX,
  type ManualTaskDraftView,
  type ManualTaskView,
  type TaskMediaView,
  type ManualTaskInput,
} from '../../shared/manual-task.js';

type Entry = {
  key: string;
  file: File;
  status: 'uploading' | 'done' | 'failed';
  /** Why it failed, when there is more to say than "upload failed". */
  problem?: 'legacy' | 'encoding';
  record?: TaskMediaView;
  controller: AbortController;
};
type Fields = { title: string; description: string; why: string };
// The Suggested playbook select's value for leaving the choice to the task page.
const LATER = 'later';

export default function TaskCreatePage() {
  const { project } = useProject();
  const { session } = useAuthentication();
  return project && session ? (
    <CreateTask
      projectId={String(project.id)}
      projectName={project.name}
      sessionId={session.session.id}
    />
  ) : null;
}

function CreateTask({
  projectId,
  projectName,
  sessionId,
}: {
  projectId: string;
  projectName: string;
  sessionId: string;
}) {
  const api = useApiClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [scope] = useState(() => ({
    projectId,
    projectName,
    sessionId,
    requestId: crypto.randomUUID(),
  }));
  const validScope =
    projectId === scope.projectId && sessionId === scope.sessionId;
  const scopeValidRef = useRef(validScope);
  useLayoutEffect(() => {
    scopeValidRef.current = validScope;
  }, [validScope]);
  const headers = { 'X-NocoReach-Task-Session': scope.sessionId };
  const form = useForm<Fields>({
    defaultValues: { title: '', description: '', why: '' },
    resolver: zodResolver(
      z.object({
        title: z
          .string()
          .trim()
          .min(1, $t('manualTask.titleRequired'))
          .max(200, $t('manualTask.titleRequired')),
        description: z
          .string()
          .trim()
          .min(1, $t('manualTask.descriptionRequired'))
          .max(30000, $t('manualTask.descriptionRequired')),
        why: z.string().trim().max(TASK_WHY_MAX),
      }),
    ),
  });
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef<Entry[]>([]);
  const activeRef = useRef(true);
  const savedRef = useRef(false);
  const submittingRef = useRef(false);
  const allowLeaveRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState<ManualTaskInput>();
  const pickerRef = useRef<HTMLInputElement>(null);
  // New task opens on the rough idea; Organize with AI or Fill in manually leads to the form (2026-10-23).
  const [step, setStep] = useState<'idea' | 'form'>('idea');
  const [idea, setIdea] = useState('');
  const [ideaMissing, setIdeaMissing] = useState(false);
  const [draft, setDraft] = useState<ManualTaskDraftView>();
  const [playbookId, setPlaybookId] = useState(LATER);
  const [drafting, setDrafting] = useState(false);
  const [draftFailure, setDraftFailure] = useState<
    'manualTask.draftFailed' | 'manualTask.draftUnusable' | 'noModel'
  >();
  // Unknown counts as ready: the draft request itself reports a missing model.
  const [modelReady, setModelReady] = useState(true);
  const draftRef = useRef<AbortController | null>(null);
  const dirty =
    form.formState.isDirty || entries.length > 0 || idea.trim() !== '';
  // Leaving with unsaved input asks in the application's own dialog, not the browser's (UI review 2026-10-22).
  useNavigationGuard(async () => {
    if (savedRef.current || allowLeaveRef.current) return true;
    if (submittingRef.current) return false;
    return !dirty || (await confirmUnsavedLeave());
  });
  useEffect(() => {
    if (isSaved || (!dirty && !busy)) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, busy, isSaved]);
  function change(next: Entry[]) {
    entriesRef.current = next;
    if (activeRef.current) setEntries(next);
  }
  const discard = useCallback(
    (record: TaskMediaView) =>
      api.request({
        path: `nocoreachTasks/media/${record.id}`,
        method: 'DELETE',
        headers: { 'X-NocoReach-Task-Session': scope.sessionId },
      }),
    [api, scope.sessionId],
  );
  // The same chat model as the daily analysis and the chat panel (Agent › Model services).
  useEffect(() => {
    const controller = new AbortController();
    nocobaseClient
      .action<{ connected?: boolean } | null>('nrOnlineAI', 'status', {
        body: { projectId: scope.projectId },
        signal: controller.signal,
      })
      .then(
        (status) => {
          if (!controller.signal.aborted)
            setModelReady(status?.connected !== false);
        },
        () => undefined,
      );
    return () => controller.abort();
  }, [scope.projectId]);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      draftRef.current?.abort();
      for (const entry of entriesRef.current) {
        entry.controller.abort();
        if (entry.record && !savedRef.current)
          void discard(entry.record).catch(() => undefined);
      }
    };
  }, [discard]);
  async function addFiles(files: File[]) {
    if (!validScope || busy || attempt) return;
    for (const file of files) {
      const type = taskFileType(file.name, file.type);
      const entry: Entry = {
        key: crypto.randomUUID(),
        file,
        controller: new AbortController(),
        status:
          entriesRef.current.length >= TASK_MEDIA_COUNT ||
          file.size > TASK_MEDIA_LIMIT ||
          !type ||
          type === 'legacy'
            ? 'failed'
            : 'uploading',
        // Macro-enabled and legacy Office files are named before any upload.
        ...(type === 'legacy' ? { problem: 'legacy' as const } : {}),
      };
      change([...entriesRef.current, entry]);
      if (entry.status === 'failed') continue;
      const body = new FormData();
      body.set('file', file);
      void api
        .request<{ data: TaskMediaView }>({
          path: 'nocoreachTasks/media',
          method: 'POST',
          query: { projectId: scope.projectId, requestId: scope.requestId },
          body,
          headers,
          signal: entry.controller.signal,
        })
        .then(
          ({ data }) => {
            if (
              !activeRef.current ||
              !scopeValidRef.current ||
              !entriesRef.current.some((value) => value.key === entry.key)
            ) {
              void discard(data).catch(() => undefined);
              return;
            }
            change(
              entriesRef.current.map((value) =>
                value.key === entry.key
                  ? { ...value, status: 'done', record: data }
                  : value,
              ),
            );
          },
          (failure: unknown) => {
            const reason =
              failure instanceof ApiClientError ? failure.reason : undefined;
            const problem =
              reason === 'TASK_MEDIA_LEGACY_FORMAT'
                ? ('legacy' as const)
                : reason === 'TASK_MEDIA_TEXT_ENCODING'
                  ? ('encoding' as const)
                  : undefined;
            if (activeRef.current)
              change(
                entriesRef.current.map((value) =>
                  value.key === entry.key
                    ? {
                        ...value,
                        status: 'failed',
                        ...(problem ? { problem } : {}),
                      }
                    : value,
                ),
              );
          },
        );
    }
  }
  function paste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (!files.length) return;
    // Same native-file pattern as agent-composer; mixed clipboard text remains text.
    if (!event.clipboardData.getData('text/plain')) event.preventDefault();
    void addFiles(files);
  }
  function drop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    void addFiles(Array.from(event.dataTransfer.files));
  }
  async function remove(entry: Entry) {
    entry.controller.abort();
    if (entry.record) {
      try {
        await discard(entry.record);
      } catch (failure) {
        // Cleanup or a prior response may already have removed this exact file.
        // Keep authorization, project and storage failures visible/retryable.
        if (
          !(failure instanceof ApiClientError) ||
          failure.status !== 404 ||
          failure.domain !== 'nocoreach' ||
          failure.reason !== 'TASK_MEDIA_NOT_FOUND'
        ) {
          setError(true);
          return;
        }
      }
    }
    setError(false);
    change(entriesRef.current.filter((value) => value.key !== entry.key));
  }
  const blocked = entries.some((entry) => entry.status !== 'done');
  const createTask = async (fields: Fields) => {
    if (submittingRef.current || blocked || !validScope) return;
    submittingRef.current = true;
    setBusy(true);
    setError(false);
    const why = draft ? fields.why.trim() : '';
    const payload = attempt ?? {
      title: fields.title,
      description: fields.description,
      ...(why ? { why } : {}),
      ...(draft && playbookId !== LATER ? { playbookId } : {}),
      projectId: scope.projectId,
      requestId: scope.requestId,
      attachmentIds: entries.flatMap((entry) =>
        entry.record ? [entry.record.id] : [],
      ),
    };
    setAttempt(payload);
    try {
      const { data } = await api.request<{ data: ManualTaskView }>({
        path: 'nocoreachTasks',
        method: 'POST',
        json: payload,
        headers,
      });
      savedRef.current = true;
      setIsSaved(true);
      if (!activeRef.current || !scopeValidRef.current) return;
      refreshNavBadges();
      toast.success(() => $t('manualTask.created', { 0: data.title }));
      await navigate(`/actions/${encodeURIComponent(data.id)}`, {
        replace: true,
      });
    } catch (failure) {
      if (activeRef.current) {
        // Demo Mode already explains this refusal through its global toast.
        setError(
          !(
            failure instanceof ApiClientError &&
            failure.reason === 'DEMO_READ_ONLY'
          ),
        );
        const status =
          failure && typeof failure === 'object' && 'status' in failure
            ? failure.status
            : undefined;
        // Confirmed validation/access failures did not commit. Allow correcting
        // the same draft; ambiguous transport/server failures keep immutable retries.
        if (
          typeof status === 'number' &&
          [400, 401, 403, 404, 413, 415, 422, 429].includes(status)
        )
          setAttempt(undefined);
      }
    } finally {
      submittingRef.current = false;
      if (activeRef.current) setBusy(false);
    }
  };
  // One model call; the draft fills the form and nothing is saved until Create.
  async function organize() {
    if (drafting || busy || blocked || !validScope) return;
    const text = idea.trim();
    setIdeaMissing(!text);
    if (!text) return;
    setDraftFailure(undefined);
    setDrafting(true);
    const controller = new AbortController();
    draftRef.current = controller;
    try {
      const { data } = await api.request<{ data: ManualTaskDraftView }>({
        path: 'nocoreachTasks/draft',
        method: 'POST',
        // The documents among the uploaded files are read for the draft.
        json: {
          projectId: scope.projectId,
          idea: text,
          requestId: scope.requestId,
          attachmentIds: entriesRef.current.flatMap((entry) =>
            entry.record ? [entry.record.id] : [],
          ),
        },
        headers,
        signal: controller.signal,
      });
      if (!activeRef.current || !scopeValidRef.current) return;
      setDraft(data);
      setPlaybookId(data.playbookId ?? LATER);
      form.reset({
        title: data.title,
        description: data.description,
        why: data.why,
      });
      setStep('form');
    } catch (failure) {
      if (!activeRef.current || controller.signal.aborted) return;
      const reason =
        failure instanceof ApiClientError ? failure.reason : undefined;
      if (reason === 'DEMO_READ_ONLY') return;
      if (reason === 'TASK_DRAFT_NO_MODEL') setModelReady(false);
      setDraftFailure(
        reason === 'TASK_DRAFT_NO_MODEL'
          ? 'noModel'
          : reason === 'TASK_DRAFT_UNUSABLE'
            ? 'manualTask.draftUnusable'
            : 'manualTask.draftFailed',
      );
    } finally {
      if (draftRef.current === controller) draftRef.current = null;
      if (activeRef.current) setDrafting(false);
    }
  }
  // Today's form; what was written as the idea becomes its description.
  function fillManually() {
    setDraft(undefined);
    setPlaybookId(LATER);
    setDraftFailure(undefined);
    setIdeaMissing(false);
    form.reset({ title: '', description: idea.trim(), why: '' });
    setStep('form');
  }
  // Restore original text: back to the idea as written; the draft and any edits to it are dropped.
  async function restore() {
    if (
      form.formState.isDirty &&
      !(await confirmAction({
        title: 'manualTask.restoreTitle',
        description: 'manualTask.restoreDescription',
        action: 'manualTask.restoreOriginal',
      }))
    )
      return;
    setDraft(undefined);
    setPlaybookId(LATER);
    form.reset({ title: '', description: '', why: '' });
    setStep('idea');
  }
  const submit = (event: React.FormEvent<HTMLFormElement>) =>
    form.handleSubmit(createTask)(event);
  async function beforeClose() {
    if (submittingRef.current) return false;
    const allowed =
      !dirty ||
      savedRef.current ||
      (await confirmAction({
        title: 'manualTask.discardTitle',
        description: 'manualTask.discardDescription',
        action: 'manualTask.discard',
      }));
    allowLeaveRef.current = allowed;
    return allowed;
  }
  const locked = busy || Boolean(attempt) || !validScope;
  // Images, videos and documents attach to the draft in either step, by paste or drop on the text or with the button.
  const media = (
    <>
      <input
        ref={pickerRef}
        type='file'
        multiple
        accept={TASK_FILE_ACCEPT}
        className='sr-only'
        aria-label={$t('manualTask.upload')}
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <Button
        type='button'
        variant='outline'
        className='mt-3'
        disabled={locked}
        onClick={() => pickerRef.current?.click()}
      >
        {$t('manualTask.upload')}
      </Button>
      <ul className='mt-3 space-y-2'>
        {entries.map((entry) => (
          <li key={entry.key} className='flex items-center gap-2 text-sm'>
            <span className='min-w-0 flex-1 break-all'>{entry.file.name}</span>
            <span role={entry.status === 'failed' ? 'alert' : 'status'}>
              {$t(
                entry.status === 'done'
                  ? 'manualTask.uploaded'
                  : entry.problem === 'legacy'
                    ? 'manualTask.legacyFormat'
                    : entry.problem === 'encoding'
                      ? 'manualTask.textEncoding'
                      : entry.status === 'failed'
                        ? 'manualTask.uploadFailed'
                        : 'manualTask.uploading',
              )}
            </span>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              disabled={busy || Boolean(attempt)}
              onClick={() => void remove(entry)}
            >
              {$t('common.remove')}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
  const dropFiles = {
    onDrop: drop,
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (event.dataTransfer.types.includes('Files')) event.preventDefault();
    },
  };
  const required = (
    <span aria-hidden='true' className='text-destructive'>
      *
    </span>
  );
  const alerts = (
    <>
      {!validScope && (
        <p role='alert' className='text-sm text-destructive'>
          {$t('manualTask.scopeChanged')}
        </p>
      )}
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {$t('manualTask.createFailed')}
        </p>
      )}
      {draftFailure && (
        <p role='alert' className='text-sm text-destructive'>
          {draftFailure === 'noModel' ? <ModelSetup /> : $t(draftFailure)}
        </p>
      )}
      <Field>
        <FieldLabel>{$t('common.currentProject')}</FieldLabel>
        <p className='text-sm'>{scope.projectName}</p>
      </Field>
    </>
  );
  const cancel = (
    <Button
      type='button'
      variant='outline'
      disabled={busy}
      onClick={() =>
        void beforeClose().then((allowed) => {
          if (allowed)
            void navigate({
              pathname: '/actions',
              search: location.search,
            });
        })
      }
    >
      {$t('common.cancel')}
    </Button>
  );
  return (
    <RouteDialog
      title={$t('manualTask.newTask')}
      description={$t(
        step === 'idea' ? 'manualTask.ideaHint' : 'manualTask.createHint',
      )}
      beforeClose={beforeClose}
      closeTo={{ pathname: '/actions', search: location.search }}
      footer={
        step === 'idea' ? (
          <>
            <Button
              type='button'
              variant='ghost'
              className='mr-auto'
              disabled={drafting || !validScope}
              onClick={fillManually}
            >
              {$t('manualTask.fillManually')}
            </Button>
            {cancel}
            {/* Wrapped: the footer pads its direct child buttons, which would hide the ⓘ. */}
            {!modelReady && (
              <span className='flex items-center'>
                <InfoTip>
                  <ModelSetup />
                </InfoTip>
              </span>
            )}
            <Button
              type='button'
              disabled={drafting || blocked || !modelReady || !validScope}
              onClick={() => void organize()}
            >
              <SparklesIcon />
              {drafting
                ? $t('manualTask.organizing')
                : $t('manualTask.organize')}
            </Button>
          </>
        ) : (
          <>
            {draft && (
              <Button
                type='button'
                variant='ghost'
                className='mr-auto'
                disabled={locked}
                onClick={() => void restore()}
              >
                {$t('manualTask.restoreOriginal')}
              </Button>
            )}
            {cancel}
            <Button
              type='submit'
              form='manual-task-form'
              disabled={busy || blocked || !validScope}
            >
              {busy
                ? $t('manualTask.creating')
                : attempt
                  ? $t('manualTask.retry')
                  : $t('manualTask.create')}
            </Button>
          </>
        )
      }
    >
      {step === 'idea' ? (
        <div className='space-y-4'>
          {alerts}
          <div {...dropFiles}>
            <Field data-invalid={ideaMissing}>
              <FieldLabel htmlFor='manual-task-idea'>
                {$t('manualTask.idea')} {required}
              </FieldLabel>
              <Textarea
                id='manual-task-idea'
                autoFocus
                rows={6}
                className='min-h-32'
                maxLength={TASK_DRAFT_IDEA_MAX}
                aria-required='true'
                aria-invalid={ideaMissing}
                placeholder={$t('manualTask.ideaPlaceholder')}
                disabled={drafting || locked}
                value={idea}
                onChange={(event) => {
                  setIdea(event.target.value);
                  if (event.target.value.trim()) setIdeaMissing(false);
                }}
                onPaste={paste}
              />
              <FieldError
                errors={
                  ideaMissing
                    ? [{ message: $t('manualTask.ideaRequired') }]
                    : []
                }
              />
              <FieldDescription>{$t('manualTask.mediaHint')}</FieldDescription>
            </Field>
            {media}
          </div>
        </div>
      ) : (
        <form
          id='manual-task-form'
          noValidate
          onSubmit={(event) => void submit(event)}
          className='space-y-4'
        >
          {alerts}
          <Field data-invalid={Boolean(form.formState.errors.title)}>
            <FieldLabel htmlFor='manual-task-title'>
              {$t('manualTask.title')} {required}
            </FieldLabel>
            <Input
              id='manual-task-title'
              autoFocus
              aria-required='true'
              aria-invalid={Boolean(form.formState.errors.title)}
              disabled={locked}
              {...form.register('title')}
            />
            <FieldError errors={[form.formState.errors.title]} />
          </Field>
          {draft && (
            <Field>
              <FieldLabel htmlFor='manual-task-why'>
                {$t('taskDetail.whyTitle')}
                <InfoTip>{$t('manualTask.whyHint')}</InfoTip>
              </FieldLabel>
              <Textarea
                id='manual-task-why'
                rows={2}
                maxLength={TASK_WHY_MAX}
                disabled={locked}
                {...form.register('why')}
              />
            </Field>
          )}
          <div {...dropFiles}>
            <Field data-invalid={Boolean(form.formState.errors.description)}>
              <FieldLabel htmlFor='manual-task-description'>
                {$t('manualTask.description')} {required}
              </FieldLabel>
              <Textarea
                id='manual-task-description'
                rows={draft ? 12 : 7}
                aria-required='true'
                aria-invalid={Boolean(form.formState.errors.description)}
                disabled={locked}
                onPaste={paste}
                {...form.register('description')}
              />
              <FieldError errors={[form.formState.errors.description]} />
              <FieldDescription>{$t('manualTask.mediaHint')}</FieldDescription>
            </Field>
            {media}
          </div>
          {draft && (
            <Field>
              <FieldLabel htmlFor='manual-task-playbook'>
                {$t('manualTask.playbook')}
                <InfoTip>{$t('manualTask.playbookHint')}</InfoTip>
              </FieldLabel>
              <Select
                items={[
                  { value: LATER, label: $t('manualTask.playbookLater') },
                  ...draft.playbooks.map((playbook) => ({
                    value: playbook.id,
                    label: playbookName(playbook),
                  })),
                ]}
                value={playbookId}
                disabled={locked}
                onValueChange={(next) => setPlaybookId(String(next ?? LATER))}
              >
                <SelectTrigger id='manual-task-playbook' className='w-full'>
                  <SelectValue className='truncate' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LATER}>
                    {$t('manualTask.playbookLater')}
                  </SelectItem>
                  {draft.playbooks.map((playbook) => (
                    <SelectItem key={playbook.id} value={playbook.id}>
                      {playbookName(playbook)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </form>
      )}
    </RouteDialog>
  );
}

// Built-in playbooks are stored in their system wording, as localizePlaybook (playbook-model.ts) reads them.
const playbookName = (playbook: ManualTaskDraftView['playbooks'][number]) =>
  playbook.system ? $legacyText(playbook.name) : playbook.name;

// Where a chat model is set up: a link for those who may change model services, the place's name for the others.
function ModelSetup() {
  const read = useCan({
    resource: { type: 'settings', id: 'agents.services' },
    action: 'read',
  });
  const manage = useCan({
    resource: { type: 'settings', id: 'agents.services' },
    action: 'manage',
  });
  const path = $t('manualTask.modelSettingsPath');
  return (
    <>
      {$t('manualTask.noModel')}{' '}
      {read.can && manage.can ? (
        <Link to='/agents/models' className='nr-link'>
          {path}
        </Link>
      ) : (
        <span className='font-medium'>{path}</span>
      )}
    </>
  );
}
