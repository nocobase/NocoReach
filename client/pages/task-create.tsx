import { useApiClient, useNavigationGuard } from '@nocobase/app-client';
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
import { useNavigate, useLocation } from 'react-router';
import { z } from 'zod';
import { $t } from '#i18n';
import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
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
  TASK_MEDIA_COUNT,
  TASK_MEDIA_LIMIT,
  TASK_MEDIA_TYPES,
  type ManualTaskView,
  type TaskMediaView,
  type ManualTaskInput,
} from '../../shared/manual-task.js';

type Entry = {
  key: string;
  file: File;
  status: 'uploading' | 'done' | 'failed';
  record?: TaskMediaView;
  controller: AbortController;
};
type Fields = { title: string; description: string };

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
    defaultValues: { title: '', description: '' },
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
  const dirty = form.formState.isDirty || entries.length > 0;
  useNavigationGuard(() => {
    if (savedRef.current || allowLeaveRef.current) return true;
    if (submittingRef.current) return false;
    return !dirty || window.confirm($t('reachData.unsavedChangesLeaveAnyway'));
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
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
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
      const entry: Entry = {
        key: crypto.randomUUID(),
        file,
        controller: new AbortController(),
        status:
          entriesRef.current.length >= TASK_MEDIA_COUNT ||
          file.size > TASK_MEDIA_LIMIT ||
          !TASK_MEDIA_TYPES.some((type) => type === file.type)
            ? 'failed'
            : 'uploading',
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
          () => {
            if (activeRef.current)
              change(
                entriesRef.current.map((value) =>
                  value.key === entry.key
                    ? { ...value, status: 'failed' }
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
      } catch {
        setError(true);
        return;
      }
    }
    change(entriesRef.current.filter((value) => value.key !== entry.key));
  }
  const blocked = entries.some((entry) => entry.status !== 'done');
  const createTask = async (fields: Fields) => {
    if (submittingRef.current || blocked || !validScope) return;
    submittingRef.current = true;
    setBusy(true);
    setError(false);
    const payload = attempt ?? {
      ...fields,
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
        setError(true);
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
  return (
    <RouteDialog
      title={$t('manualTask.newTask')}
      description={$t('manualTask.createHint')}
      beforeClose={beforeClose}
      closeTo={{ pathname: '/actions', search: location.search }}
      footer={
        <>
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
      }
    >
      <form
        id='manual-task-form'
        noValidate
        onSubmit={(event) => void submit(event)}
        className='space-y-4'
      >
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
        <Field>
          <FieldLabel>{$t('common.currentProject')}</FieldLabel>
          <p className='text-sm'>{scope.projectName}</p>
        </Field>
        <Field data-invalid={Boolean(form.formState.errors.title)}>
          <FieldLabel htmlFor='manual-task-title'>
            {$t('manualTask.title')}{' '}
            <span aria-hidden='true' className='text-destructive'>
              *
            </span>
          </FieldLabel>
          <Input
            id='manual-task-title'
            autoFocus
            aria-required='true'
            aria-invalid={Boolean(form.formState.errors.title)}
            disabled={busy || Boolean(attempt) || !validScope}
            {...form.register('title')}
          />
          <FieldError errors={[form.formState.errors.title]} />
        </Field>
        <div
          onDrop={drop}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files'))
              event.preventDefault();
          }}
        >
          <Field data-invalid={Boolean(form.formState.errors.description)}>
            <FieldLabel htmlFor='manual-task-description'>
              {$t('manualTask.description')}{' '}
              <span aria-hidden='true' className='text-destructive'>
                *
              </span>
            </FieldLabel>
            <Textarea
              id='manual-task-description'
              rows={7}
              aria-required='true'
              aria-invalid={Boolean(form.formState.errors.description)}
              disabled={busy || Boolean(attempt) || !validScope}
              onPaste={paste}
              {...form.register('description')}
            />
            <FieldError errors={[form.formState.errors.description]} />
            <FieldDescription>{$t('manualTask.mediaHint')}</FieldDescription>
          </Field>
          <input
            ref={pickerRef}
            type='file'
            multiple
            accept={TASK_MEDIA_TYPES.join(',')}
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
            disabled={busy || Boolean(attempt) || !validScope}
            onClick={() => pickerRef.current?.click()}
          >
            {$t('manualTask.upload')}
          </Button>
          <ul className='mt-3 space-y-2'>
            {entries.map((entry) => (
              <li key={entry.key} className='flex items-center gap-2 text-sm'>
                <span className='min-w-0 flex-1 break-all'>
                  {entry.file.name}
                </span>
                <span role={entry.status === 'failed' ? 'alert' : 'status'}>
                  {$t(
                    entry.status === 'done'
                      ? 'manualTask.uploaded'
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
        </div>
      </form>
    </RouteDialog>
  );
}
