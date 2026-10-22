import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Bot, Clock3 } from 'lucide-react';
import { $t, getCurrentLocale, $legacyText } from '#i18n';
import { materialNoticeText } from './material-notices.js';
import { nocobaseClient as api, NocoReachHttpError } from '#lib/nocoreach-api';
import {
  RunHeader,
  RunTranscript,
  type AgentRunHistoryRun,
  type RunTranscriptEvent,
} from '#components/agent-run-history';
import { Button } from '#components/ui/button';
import { Alert, AlertDescription } from '#components/ui/alert';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '#components/ui/empty';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import { Label } from '#components/ui/label';
import { Reveal } from '#components/reach/reveal';
import type { TaskData, Run } from '../task-execution-types.js';
import { Markdown } from '../doc-view.js';
import { useMe } from '../me.js';
import {
  historyLabels,
  transcriptLabels,
  filterLabels,
} from './execution-labels.js';

/** Preserve tool details; only the final result envelope is presented as business content. */
function readableEvents(
  events: readonly RunTranscriptEvent[],
): RunTranscriptEvent[] {
  return events.map((event) => {
    if (event.type === 'text' && event.content) {
      try {
        const result = JSON.parse(
          event.content
            .trim()
            .replace(/^```json\s*/, '')
            .replace(/```$/, ''),
        ) as {
          ok?: boolean;
          content?: string;
          error?: string;
          message?: string;
        } | null;
        if (result && typeof result.ok === 'boolean')
          return {
            ...event,
            content: result.ok
              ? String(result.content || $t('taskDetail.resultSubmitted'))
              : `${$t('common.runNotComplete')}\n\n${String(result.error || result.message || $t('taskDetail.checkToolRecordsRetry'))}`,
          };
      } catch {
        /* Ordinary progress text or an unfinished streaming envelope. */
      }
    }
    if (event.type === 'usage' && Array.isArray(event.meta?.usage)) {
      const usage = event.meta.usage as {
        inputTokens?: number;
        outputTokens?: number;
      }[];
      return {
        ...event,
        meta: {
          ...event.meta,
          inputTokens: usage.reduce((n, x) => n + (x.inputTokens || 0), 0),
          outputTokens: usage.reduce((n, x) => n + (x.outputTokens || 0), 0),
        },
      };
    }
    if (event.type === 'status' && event.content === 'turnCompleted')
      return {
        ...event,
        content: $t('taskDetail.agentTurnEndedTaskSuccess'),
      };
    return event;
  });
}
export function TaskExecutionPanel({
  projectId,
  taskId,
  runs,
}: {
  projectId: number;
  taskId: string;
  runs: Run[];
}) {
  const [query, setQuery] = useSearchParams();
  const official = runs
    .filter((run) => run.pluginRunId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const selectedId = query.get('run') || official[0]?.id;
  const selected = official.find((run) => run.id === selectedId);
  const [loaded, setLoaded] = useState<{ key: string; data: TaskData }>();
  const [failure, setFailure] = useState<{ key: string; status: number }>();
  const [retry, setRetry] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { me } = useMe();
  const hasSelection = Boolean(selected);
  const requestKey = `${projectId}:${taskId}:${selectedId}:${retry}`;
  const detail = loaded?.key === requestKey ? loaded.data : undefined;
  const error = failure?.key === requestKey ? failure.status : null;
  useEffect(() => {
    let disposed = false,
      loading = false,
      permanent = false;
    if (!hasSelection) return;
    const load = async () => {
      if (loading || permanent) return;
      loading = true;
      try {
        const next = await api.action<TaskData>('nrTaskWork', 'get', {
          method: 'POST',
          body: { projectId: String(projectId), taskId, runId: selectedId },
          unwrap: 'data',
        });
        if (!disposed) {
          setLoaded({ key: requestKey, data: next });
          setFailure(undefined);
        }
      } catch (e) {
        if (!disposed) {
          const status = e instanceof NocoReachHttpError ? e.status : 0;
          permanent = [401, 403, 404].includes(status);
          if (permanent) setLoaded(undefined);
          setFailure({ key: requestKey, status });
        }
      } finally {
        loading = false;
      }
    };
    void load();
    // Polling also drains paginated event batches for a long, already completed run.
    const timer = setInterval(() => void load(), 5000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [projectId, taskId, selectedId, hasSelection, requestKey]);
  const choose = (id: string | null) =>
    setQuery((previous) => {
      const next = new URLSearchParams(previous);
      if (id) next.set('run', id);
      else next.delete('run');
      return next;
    });
  const execution = detail?.execution;
  const current = detail?.runs.find((run) => run.id === selectedId) || selected;
  const run: AgentRunHistoryRun | undefined =
    current && execution
      ? {
          id: current.id,
          agentId: current.agentId || '',
          agentName: current.agentName || $t('common.localAgent'),
          status:
            current.status === 'succeeded'
              ? 'completed'
              : current.status === 'failed'
                ? 'failed'
                : current.status === 'running'
                  ? 'running'
                  : 'queued',
          stopping: Boolean(current.cancelRequested),
          createdAt: current.createdAt,
          startedAt: execution.run.startedAt || null,
          finishedAt: current.endedAt || null,
          executions: execution.run.executions,
        }
      : undefined;
  const items = official.map((item) => ({
    value: item.id,
    label: `${new Date(item.createdAt).toLocaleString(getCurrentLocale())} · ${item.agentName || $t('common.localAgent')} · ${historyLabels().status[item.status === 'succeeded' ? 'completed' : item.status === 'failed' ? 'failed' : item.status === 'running' ? 'running' : 'queued']}`,
  }));
  return (
    // Shown on the Runs tab of Technical details, which supplies the frame; the heading stays for screen readers and
    // as the focus target after leaving a missing run.
    <section
      className='flex min-w-0 flex-col gap-4'
      aria-label={$t('common.runHistory')}
    >
      <h2 ref={headingRef} tabIndex={-1} className='sr-only'>
        {$t('common.runHistory')}
      </h2>
      {!official.length ? (
        <Empty className='min-h-48 border border-dashed'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <Bot />
            </EmptyMedia>
            <EmptyTitle>{$t('taskDetail.noRunsYet')}</EmptyTitle>
            <EmptyDescription>
              {$t('taskDetail.confirmStartTaskSeeAgent')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='task-run-select'>
              {$t('taskDetail.selectRun')}
            </Label>
            <Select
              items={items}
              value={selected?.id || null}
              onValueChange={choose}
            >
              <SelectTrigger id='task-run-select' className='w-full min-w-0'>
                <SelectValue
                  className='truncate'
                  placeholder={$t('taskDetail.selectRun')}
                />
              </SelectTrigger>
              <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
                <SelectGroup>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {(!selected || error !== null) && (
            <Alert variant='destructive'>
              <AlertDescription>
                <p>
                  {!selected || error === 404
                    ? $t('taskDetail.runNotExistNoLonger')
                    : error === 401
                      ? $t('common.sessionExpiredSignAgain')
                      : error === 403
                        ? $t('taskDetail.cannotViewRun')
                        : $t('taskDetail.notLoadExecutionLogRetry')}
                </p>
                {!selected || error === 404 ? (
                  <Button
                    variant='outline'
                    onClick={() => {
                      choose(null);
                      headingRef.current?.focus();
                    }}
                  >
                    {$t('taskDetail.viewLatestRun')}
                  </Button>
                ) : error === 401 ? (
                  <Link to='/login'>{$t('common.signAgain')}</Link>
                ) : error === 403 ? null : (
                  <Button
                    variant='outline'
                    onClick={() => setRetry((value) => value + 1)}
                  >
                    {$t('common.retry')}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {selected && !detail && error === null && (
            <div
              role='status'
              aria-label={$t('common.loading')}
              className='flex flex-col gap-3'
            >
              <Skeleton className='h-8 w-2/3' />
              <Skeleton className='h-40 w-full' />
            </div>
          )}
          {current?.errorDetail ? (
            <Alert variant='destructive'>
              <AlertDescription className='whitespace-pre-wrap break-words'>
                {$legacyText(current.errorDetail)}
              </AlertDescription>
            </Alert>
          ) : execution?.run.failureDetail ? (
            // What the tool itself said when the run stopped ("Not logged in · Please run /login"), as it said it.
            <Alert variant='destructive'>
              <AlertDescription className='whitespace-pre-wrap break-words'>
                {execution.run.failureDetail}
              </AlertDescription>
            </Alert>
          ) : null}
          {current?.restartedAt ? (
            // NocoReach restarted under this run (server/nocoreach/execution/restarts.ts); the official reason says how
            // the Runner was lost.
            <p className='text-sm text-muted-foreground'>
              {$t('taskDetail.restartTechnical', {
                0: new Date(current.restartedAt).toLocaleString(
                  getCurrentLocale(),
                ),
                1: execution?.run.failureReason || '—',
              })}
            </p>
          ) : null}
          {current?.autoRetry ? (
            <p className='text-sm text-muted-foreground'>
              {$t('taskDetail.restartRetryTechnical', {
                0: new Date(current.autoRetry.restartedAt).toLocaleString(
                  getCurrentLocale(),
                ),
              })}
            </p>
          ) : null}
          {run && execution && (
            <>
              <RunHeader
                run={run}
                trigger={$t('common.runnerAgent')}
                labels={historyLabels()}
              />
              <p className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                <Clock3 className='size-4' />
                {run.startedAt
                  ? new Date(run.startedAt).toLocaleString(getCurrentLocale())
                  : '—'}
                {run.finishedAt
                  ? ` → ${new Date(run.finishedAt).toLocaleString(getCurrentLocale())}`
                  : ''}
              </p>
              {execution.canInspect ? (
                <RunTranscript
                  locale={getCurrentLocale()}
                  events={readableEvents(execution.events)}
                  open={['queued', 'running'].includes(current?.status || '')}
                  failed={error !== null}
                  labels={transcriptLabels()}
                  filterLabels={filterLabels()}
                  preferenceKey={`nocoreach:task-transcript:${me?.id || 'anonymous'}`}
                  renderMarkdown={(content) => <Markdown content={content} />}
                />
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {$t('taskDetail.runParticipantsAdministratorsViewTool')}
                </p>
              )}
              {execution.truncated && (
                <p className='text-sm text-muted-foreground'>
                  {$t('taskDetail.showingLatest2000Events')}
                </p>
              )}
            </>
          )}
          {detail?.savedDraft && current?.status === 'failed' && (
            <Reveal label={$t('taskDetail.unsubmittedCandidateDraft')}>
              <p className='mb-3 text-sm text-muted-foreground'>
                {$t('taskDetail.contentSavedCandidateNotPassed')}
              </p>
              <Markdown content={detail.savedDraft.content} />
            </Reveal>
          )}
          {detail?.sources && (
            <Reveal label={$t('taskDetail.sourceSnapshotRun')}>
              <div className='flex flex-col gap-2 text-sm'>
                <p className='text-muted-foreground'>
                  {$t('taskDetail.sourcesPrepared', {
                    0: new Date(detail.sources.capturedAt).toLocaleString(
                      getCurrentLocale(),
                    ),
                  })}
                </p>
                {detail.sources.topics.map((topic) => (
                  <div key={topic.id}>
                    <a
                      className='underline break-all'
                      href={topic.url}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {topic.title || topic.url}
                    </a>
                    <p>
                      {$t('taskDetail.postsProvided', {
                        0: topic.posts.length,
                        1: topic.complete
                          ? $t('taskDetail.completeSources')
                          : $t('taskDetail.incompleteSources'),
                      })}
                    </p>
                    {topic.missing.map((warning) => (
                      <p
                        key={`${warning.code}:${warning.params?.post ?? ''}`}
                        className='text-muted-foreground'
                      >
                        {materialNoticeText(warning)}
                      </p>
                    ))}
                  </div>
                ))}
                {detail.sources.warnings.map((warning) => (
                  <p key={warning.code}>{materialNoticeText(warning)}</p>
                ))}
              </div>
            </Reveal>
          )}
        </>
      )}
    </section>
  );
}
