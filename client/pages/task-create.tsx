import {
  ApiClientError,
  useApiClient,
  useNavigationGuard,
} from '@nocobase/app-client';
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
import { z } from 'zod';
import { $t, $legacyText } from '#i18n';
import chinese from '../../shared/i18n/zh.json';
import { nocobaseClient } from '#lib/nocoreach-api';
import { TaskAgentField } from './task-detail/agent-field.js';
import { type TaskData, hasTaskAgent } from './task-execution-types.js';
import {
  playbookRequest,
  localizePlaybookList,
  stagesFor,
  withoutRepo,
  type PlaybookList,
} from './playbook-model.js';
import { CreatedTaskStarter, creationStartState } from './task-create-start.js';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '#components/ui/select';
import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group';
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

// This existing service error uses newer copy than its historical i18n alias.
// Translate presentation only; authorization and retry decisions use HTTP status.
const startFailureMessage = (failure: unknown) =>
  failure instanceof Error
    ? failure.message === chinese['agent.chooseAgentSharedEveryone']
      ? 'agent.chooseAgentSharedEveryone'
      : failure.message
    : 'common.operationFailed';

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
  const [startNow, setStartNow] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [playbookId, setPlaybookId] = useState('optimize-page');
  const [agent, setAgent] = useState<TaskData['agent']>();
  const [playbooks, setPlaybooks] = useState<PlaybookList>();
  const [optionsError, setOptionsError] = useState('');
  const [optionsVersion, setOptionsVersion] = useState(0);
  const [created, setCreated] = useState<ManualTaskView>();
  const [startData, setStartData] = useState<TaskData>();
  const [startError, setStartError] = useState('');
  const starterRef = useRef<CreatedTaskStarter | undefined>(undefined);
  const startChoiceRef = useRef<
    { agentId: string | null; playbookId: string } | undefined
  >(undefined);
  useEffect(() => {
    if (!startNow || created || !validScope) return;
    let current = true;
    void Promise.all([
      nocobaseClient.action<NonNullable<TaskData['agent']>>(
        'nrAgent',
        'status',
        {
          method: 'POST',
          body: { projectId: scope.projectId },
        },
      ),
      playbookRequest<PlaybookList>('list', scope.projectId),
    ])
      .then(([nextAgent, nextPlaybooks]) => {
        if (current && scopeValidRef.current) {
          setOptionsError('');
          setAgent(nextAgent);
          setPlaybooks(nextPlaybooks);
        }
      })
      .catch((failure) => {
        if (current)
          setOptionsError(
            failure instanceof Error
              ? failure.message
              : $t('common.operationFailed'),
          );
      });
    return () => {
      current = false;
    };
  }, [startNow, created, validScope, scope.projectId, optionsVersion]);
  const pickerRef = useRef<HTMLInputElement>(null);
  const dirty = form.formState.isDirty || entries.length > 0;
  useNavigationGuard(() => {
    if (submittingRef.current) return false;
    if (savedRef.current || allowLeaveRef.current) return true;
    return !dirty || window.confirm($t('reachData.unsavedChangesLeaveAnyway'));
  });
  useEffect(() => {
    if (!busy && (isSaved || !dirty)) return;
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
  const selectedAgent = agentId || agent?.defaultAgentId;
  const selected = {
    work: { agentId: agentId || undefined },
    agent: agent && {
      ...agent,
      agentId: selectedAgent,
      online: Boolean(
        agent.options?.find((option) => option.id === selectedAgent)?.online,
      ),
    },
  };
  const list = localizePlaybookList(playbooks);
  const playbook = list?.playbooks.find((item) => item.id === playbookId);
  const stages = playbook ? stagesFor(playbook) : [];
  const needsRepo = Boolean(
    playbook && !agent?.repo && !withoutRepo(stages[0], stages),
  );
  const canStart = Boolean(
    agent && playbook && hasTaskAgent(selected) && !needsRepo && !optionsError,
  );
  const createdStages = startData?.work.flow?.stages || [];
  const createdStage = createdStages[startData?.work.stageIndex || 0];
  const missingStartRepo =
    createdStage?.kind === 'agent' &&
    !startData?.agent?.repo &&
    !withoutRepo(createdStage, createdStages);
  const retryableStage =
    !startData ||
    (!startData.work.cancelledAt &&
      !startData.work.archivedAt &&
      startData.work.stage !== 'done' &&
      (!startData.work.flow ||
        (startData.work.flow.stages[startData.work.stageIndex || 0]?.kind ===
          'agent' &&
          !startData.work.results[startData.work.stageIndex || 0])));
  async function startCreated(task: ManualTaskView) {
    starterRef.current ??= new CreatedTaskStarter((action, body = {}) => {
      if (!activeRef.current || !scopeValidRef.current)
        throw new Error($t('manualTask.scopeChanged'));
      return nocobaseClient.action<TaskData>('nrTaskWork', action, {
        method: 'POST',
        body: { projectId: scope.projectId, taskId: task.id, ...body },
      });
    });
    setStartError('');
    try {
      const choice = startChoiceRef.current!;
      const next = await starterRef.current.start(
        choice.agentId,
        choice.playbookId,
      );
      if (activeRef.current && scopeValidRef.current) setStartData(next);
    } catch (failure) {
      if (activeRef.current && scopeValidRef.current) {
        const observed = starterRef.current.data;
        setStartData(observed);
        setStartError(
          creationStartState(observed) === 'waiting'
            ? startFailureMessage(failure)
            : '',
        );
      }
    }
    if (activeRef.current && scopeValidRef.current) refreshNavBadges();
  }
  async function retryStart() {
    if (submittingRef.current || !created || !validScope) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      await startCreated(created);
    } finally {
      submittingRef.current = false;
      if (activeRef.current) setBusy(false);
    }
  }
  const createTask = async (fields: Fields) => {
    if (
      submittingRef.current ||
      savedRef.current ||
      blocked ||
      !validScope ||
      (startNow && !canStart)
    )
      return;
    submittingRef.current = true;
    setBusy(true);
    setError(false);
    const payload = attempt ?? {
      ...fields,
      projectId: scope.projectId,
      requestId: scope.requestId,
      ...(startNow ? { playbookId } : {}),
      attachmentIds: entries.flatMap((entry) =>
        entry.record ? [entry.record.id] : [],
      ),
    };
    startChoiceRef.current ??= { agentId, playbookId };
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
      setCreated(data);
      if (startNow) {
        await startCreated(data);
        return;
      }
      refreshNavBadges();
      toast.success(() => $t('manualTask.created', { 0: data.title }));
      submittingRef.current = false;
      setBusy(false);
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
        ) {
          setAttempt(undefined);
          startChoiceRef.current = undefined;
        }
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
            {$t(created ? 'manualTask.close' : 'common.cancel')}
          </Button>
          {created ? (
            <>
              <Button
                type='button'
                variant='outline'
                disabled={busy || !validScope}
                onClick={() =>
                  void navigate(`/actions/${encodeURIComponent(created.id)}`, {
                    replace: true,
                  })
                }
              >
                {$t('manualTask.viewTask')}
              </Button>
              {creationStartState(startData) === 'waiting' &&
                retryableStage && (
                  <Button
                    type='button'
                    disabled={busy || !validScope}
                    onClick={() => void retryStart()}
                  >
                    {$t(busy ? 'manualTask.starting' : 'manualTask.retryStart')}
                  </Button>
                )}
            </>
          ) : (
            <Button
              type='submit'
              form='manual-task-form'
              disabled={
                busy || blocked || !validScope || (startNow && !canStart)
              }
            >
              {busy
                ? $t('manualTask.creating')
                : attempt
                  ? $t('manualTask.retry')
                  : $t(
                      startNow
                        ? 'manualTask.createAndStart'
                        : 'manualTask.create',
                    )}
            </Button>
          )}
        </>
      }
    >
      {created ? (
        <div className='space-y-4'>
          <p role='status'>
            {$t('manualTask.created', {
              0: `${created.number} · ${created.title}`,
            })}
          </p>
          <p role='status'>
            {$t(
              busy
                ? 'manualTask.starting'
                : `manualTask.${creationStartState(startData)}`,
            )}
          </p>
          {(creationStartState(startData) === 'queued' ||
            creationStartState(startData) === 'running') && (
            <p className='text-sm text-muted-foreground'>
              {$t('manualTask.statusHint')}
            </p>
          )}
          {startError && (
            <p role='alert' className='text-sm text-destructive'>
              {$legacyText(startError)}
            </p>
          )}
          {creationStartState(startData) === 'waiting' && missingStartRepo && (
            <p role='alert' className='text-sm text-destructive'>
              {$t('taskExecution.connectRepositoryUnderDataSources')}{' '}
              <Link to='/connections?source=repo' className='underline'>
                {$t('common.goDataSources')}
              </Link>
            </p>
          )}
          {creationStartState(startData) === 'waiting' && (
            <p className='text-sm text-muted-foreground'>
              {$t('manualTask.recoveryHint')}
            </p>
          )}
          {!validScope && <p role='alert'>{$t('manualTask.scopeChanged')}</p>}
        </div>
      ) : (
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
          <Field>
            <FieldLabel id='manual-task-start-label'>
              {$t('manualTask.startWhen')}
            </FieldLabel>
            <RadioGroup
              aria-labelledby='manual-task-start-label'
              value={startNow ? 'now' : 'later'}
              disabled={busy || Boolean(attempt) || !validScope}
              onValueChange={(value) => {
                if (value) setStartNow(value === 'now');
              }}
            >
              <div className='flex items-center gap-2'>
                <RadioGroupItem id='manual-task-later' value='later' />
                <FieldLabel htmlFor='manual-task-later'>
                  {$t('manualTask.startLater')}
                </FieldLabel>
              </div>
              <div className='flex items-center gap-2'>
                <RadioGroupItem id='manual-task-now' value='now' />
                <FieldLabel htmlFor='manual-task-now'>
                  {$t('manualTask.startNow')}
                </FieldLabel>
              </div>
            </RadioGroup>
            <FieldDescription>
              {$t(
                startNow
                  ? 'manualTask.startNowHint'
                  : 'manualTask.startLaterHint',
              )}
            </FieldDescription>
          </Field>
          {startNow && (
            <div className='space-y-4'>
              {optionsError ? (
                <p role='alert' className='text-sm text-destructive'>
                  {$legacyText(optionsError)}{' '}
                  <Button
                    type='button'
                    variant='ghost'
                    disabled={busy}
                    onClick={() => {
                      setOptionsError('');
                      setOptionsVersion((value) => value + 1);
                    }}
                  >
                    {$t('common.retry')}
                  </Button>
                </p>
              ) : !agent || !list ? (
                <p role='status'>{$t('common.loading')}</p>
              ) : (
                <>
                  <TaskAgentField
                    data={selected}
                    busy={busy || Boolean(attempt)}
                    onChange={async (value) => {
                      setAgentId(value);
                      // Selection is a local draft until the task exists.
                      return false;
                    }}
                  />
                  <Field>
                    <FieldLabel htmlFor='manual-task-playbook'>
                      {$t('common.playbook')}
                    </FieldLabel>
                    <Select
                      items={list.playbooks.map((item) => ({
                        value: item.id,
                        label: item.name,
                      }))}
                      value={playbookId}
                      disabled={busy || Boolean(attempt)}
                      onValueChange={(value) => {
                        if (value) setPlaybookId(value);
                      }}
                    >
                      <SelectTrigger
                        id='manual-task-playbook'
                        className='w-full'
                      >
                        <SelectValue className='min-w-0 truncate' />
                      </SelectTrigger>
                      <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width)'>
                        <SelectGroup>
                          {list.playbooks.map((item) => (
                            <SelectItem
                              key={item.id}
                              value={item.id}
                              className='[&>span:first-child]:whitespace-normal [&>span:first-child]:break-words'
                            >
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {playbook && (
                      <FieldDescription>
                        {playbook.description}
                      </FieldDescription>
                    )}
                  </Field>
                  {needsRepo && (
                    <p role='alert' className='text-sm text-destructive'>
                      {$t('taskExecution.connectRepositoryUnderDataSources')}{' '}
                      <Link to='/connections?source=repo' className='underline'>
                        {$t('common.goDataSources')}
                      </Link>
                    </p>
                  )}
                </>
              )}
              {!canStart && (
                <p className='text-sm text-muted-foreground'>
                  {$t('manualTask.createOnlyHint')}{' '}
                  <Button
                    type='button'
                    variant='outline'
                    disabled={busy || Boolean(attempt)}
                    onClick={() => setStartNow(false)}
                  >
                    {$t('manualTask.chooseCreateOnly')}
                  </Button>
                </p>
              )}
            </div>
          )}
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
      )}
    </RouteDialog>
  );
}
