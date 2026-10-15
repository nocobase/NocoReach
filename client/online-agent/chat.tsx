import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { BotMessageSquare, History } from 'lucide-react';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import { Textarea } from '#components/ui/textarea';
import { Label } from '#components/ui/label';
import { Skeleton } from '#components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from '#components/ui/empty';
import { useMe } from '../pages/me.js';
import { useProjects, useProject } from '../pages/reach-data.js';
import {
  onlineRunActive,
  type OnlineConversation,
} from '../../shared/online-agent.js';
import {
  useOnlineApi,
  useOnlineResource,
  OnlineApiError,
  type Agent,
  type ConversationDetail,
} from './api.js';
import { OnlineConfirm, OnlineError, OnlineSelect } from './controls.js';
import { OnlineTranscript } from './transcript.js';
import { useOnlineChat } from './context.js';

export function OnlineChatView() {
  const chat = useOnlineChat(),
    api = useOnlineApi(),
    { isAdmin } = useMe(),
    { project } = useProject();
  const [refresh, setRefresh] = useState(0),
    [history, setHistory] = useState(false);
  const { agentId, setAgentId } = chat;
  const { projects } = useProjects();
  const agents = useOnlineResource<Agent[]>('definitions', refresh);
  const conversations = useOnlineResource<OnlineConversation[]>(
    'conversations',
    refresh,
  );
  const [detail, setDetail] = useState<ConversationDetail>();
  const [loadFailure, setLoadFailure] = useState<{
      id: string;
      error: unknown;
    }>(),
    [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false),
    [stopping, setStopping] = useState(false),
    [stopOpen, setStopOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<string | null>();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const current =
    detail?.conversation.id === chat.conversationId ? detail : undefined;
  const boundProject = current
    ? current.conversation.projectId
    : chat.projectId || (project ? String(project.id) : null);
  const projectName = projects?.find(
    (item) => String(item.id) === boundProject,
  )?.name;
  const selected = agents?.data?.find(
    (agent) => agent.id === (current?.conversation.agentId || agentId),
  );
  const active = current?.runs.find(onlineRunActive);
  const eligible = selected?.enabled && selected.ready;
  const requested = chat.conversationId;
  const loadError =
    loadFailure?.id === requested ? loadFailure.error : undefined;
  const canSend =
    !busy &&
    !!chat.draft.trim() &&
    (!requested || !!current) &&
    !loadError &&
    (chat.request || (eligible && !active));
  useEffect(() => {
    if (!history && !busy) composerRef.current?.focus();
  }, [history, requested, busy]);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    let loading = false,
      permanent = false;
    const load = async () => {
      if (loading || permanent) return;
      loading = true;
      try {
        const next = await api<ConversationDetail>(
          `conversations/${requested}`,
          undefined,
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setDetail(next);
          setLoadFailure(undefined);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setLoadFailure({ id: requested, error: failure });
          permanent =
            failure instanceof OnlineApiError &&
            [401, 403, 404].includes(failure.status);
          if (permanent) setDetail(undefined);
        }
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 2000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [api, requested, refresh]);
  function choose(id: string | null, discard = false) {
    if (chat.draft.trim() && !discard) {
      setPendingSelection(id);
      return;
    }
    setPendingSelection(undefined);
    chat.select(id);
    chat.setDraft('');
    setHistory(false);
    setLoadFailure(undefined);
    setError(undefined);
    setDetail(undefined);
    composerRef.current?.focus();
  }
  async function send() {
    if (!canSend) return;
    setBusy(true);
    setError(undefined);
    // Preserve the exact request after an ambiguous failure, including its idempotency key and original revision.
    const request = chat.request || {
      path: current
        ? `conversations/${current.conversation.id}/messages`
        : 'conversations',
      body: current
        ? {
            requestId: crypto.randomUUID(),
            revision: current.conversation.revision,
            text: chat.draft.trim(),
          }
        : {
            requestId: crypto.randomUUID(),
            agentId,
            projectId: chat.projectId || (project ? String(project.id) : null),
            text: chat.draft.trim(),
          },
    };
    chat.setRequest(request);
    try {
      const conversation = await api<OnlineConversation>(
        request.path,
        request.body,
      );
      chat.setRequest(null);
      chat.select(conversation.id);
      chat.setDraft('');
      setRefresh((value) => value + 1);
      composerRef.current?.focus();
    } catch (failure) {
      if ((failure as Error).name === 'AbortError') return;
      if (failure instanceof OnlineApiError && failure.status < 500)
        chat.setRequest(null);
      setError(failure);
      if (failure instanceof OnlineApiError && failure.status === 409)
        setRefresh((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    if (!active) return;
    setStopping(true);
    setError(undefined);
    try {
      await api(`runs/${active.id}/cancel`, {});
      setStopOpen(false);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure);
    } finally {
      setStopping(false);
    }
  }
  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <div className='flex flex-wrap gap-2'>
        <Button
          size='sm'
          variant='outline'
          disabled={busy || !!chat.request}
          onClick={() => choose(null)}
        >
          {$t('onlineAgent.newChat')}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={busy || !!chat.request}
          onClick={() => {
            setHistory(!history);
            setRefresh((value) => value + 1);
          }}
        >
          {$t(history ? 'onlineAgent.backChat' : 'onlineAgent.history')}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          onClick={() => setRefresh((value) => value + 1)}
        >
          {$t('onlineAgent.refresh')}
        </Button>
      </div>
      <p className='text-xs text-muted-foreground'>
        {boundProject
          ? $t('onlineAgent.projectContext', { 0: projectName || boundProject })
          : $t('onlineAgent.noProject')}
      </p>
      {history ? (
        <div className='min-h-0 flex-1 overflow-y-auto'>
          <OnlineError
            error={conversations?.error}
            retry={() => setRefresh((value) => value + 1)}
          />
          {conversations.loading && !conversations.data && (
            <div role='status' aria-label={$t('common.loading')}>
              <Skeleton className='h-40 w-full' />
            </div>
          )}
          {conversations?.data?.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <History />
                </EmptyMedia>
                <EmptyTitle>{$t('onlineAgent.noHistory')}</EmptyTitle>
                <EmptyDescription>{$t('onlineAgent.welcome')}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => choose(null)}>
                  {$t('onlineAgent.newChat')}
                </Button>
              </EmptyContent>
            </Empty>
          )}
          {conversations?.data?.map((conversation) => (
            <Button
              className='mb-2 h-auto w-full justify-start whitespace-normal text-left break-words'
              key={conversation.id}
              variant='outline'
              onClick={() => choose(conversation.id)}
            >
              {conversation.title}
            </Button>
          ))}
        </div>
      ) : (
        <>
          {!requested && agents.loading && !agents.data && (
            <div role='status' aria-label={$t('common.loading')}>
              <Skeleton className='h-12 w-full' />
            </div>
          )}
          {!requested && agents.data && (
            <OnlineSelect
              label={$t('common.onlineAgent')}
              value={agentId}
              disabled={busy || !!chat.request}
              items={(agents?.data || [])
                .filter((agent) => agent.enabled)
                .map((agent) => ({ value: agent.id, label: agent.name }))}
              onChange={setAgentId}
            />
          )}
          <OnlineError
            error={agents?.error}
            retry={() => setRefresh((value) => value + 1)}
          />
          <div
            className='min-h-0 flex-1 overflow-y-auto'
            aria-label={$t('onlineAgent.transcript')}
          >
            <OnlineError
              error={loadError}
              retry={() => setRefresh((value) => value + 1)}
            />
            {requested && !current && !loadError && (
              <div role='status' aria-label={$t('common.loading')}>
                <Skeleton className='h-40 w-full' />
              </div>
            )}
            {!requested && (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant='icon'>
                    <BotMessageSquare />
                  </EmptyMedia>
                  <EmptyTitle>{$t('onlineAgent.newChat')}</EmptyTitle>
                  <EmptyDescription>
                    {$t('onlineAgent.welcome')}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {current?.runs.map((run) => (
              <div key={run.id} className='flex flex-col gap-3 border-b py-4'>
                <p className='whitespace-pre-wrap break-words font-medium'>
                  {run.messages.at(-1)?.content}
                </p>
                <OnlineTranscript run={run} />
              </div>
            ))}
          </div>
          {agents?.data && !eligible && (
            <p className='text-sm text-muted-foreground'>
              {$t('onlineAgent.unavailable')}
              {isAdmin && (
                <>
                  {' '}
                  <Link className='underline' to='/online-agents'>
                    {$t('onlineAgent.settings')}
                  </Link>
                </>
              )}
            </p>
          )}
          <OnlineError error={!stopOpen ? error : undefined} />
          {chat.request && (
            <p className='text-sm text-muted-foreground'>
              {$t('onlineAgent.ambiguousRequest')}
            </p>
          )}
          <form
            className='flex shrink-0 flex-col gap-2'
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <Label htmlFor='online-composerRef'>
              {$t('onlineAgent.message')}
            </Label>
            <Textarea
              ref={composerRef}
              id='online-composerRef'
              value={chat.draft}
              maxLength={30000}
              rows={3}
              className='max-h-40 resize-y'
              disabled={busy || !!chat.request}
              onChange={(event) => chat.setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  (event.ctrlKey || event.metaKey) &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className='flex justify-end gap-2'>
              {active && (
                <Button
                  variant='outline'
                  type='button'
                  disabled={stopping || active.cancelRequested}
                  onClick={() => setStopOpen(true)}
                >
                  {$t(
                    active.cancelRequested
                      ? 'onlineAgent.stopping'
                      : 'onlineAgent.stop',
                  )}
                </Button>
              )}
              <Button type='submit' disabled={!canSend}>
                {$t(
                  busy
                    ? 'common.working'
                    : chat.request
                      ? 'common.retry'
                      : 'onlineAgent.send',
                )}
              </Button>
            </div>
          </form>
        </>
      )}
      <OnlineConfirm
        open={pendingSelection !== undefined}
        onClose={() => setPendingSelection(undefined)}
        title={$t('onlineAgent.discardDraftTitle')}
        description={$t('onlineAgent.discardDraftDescription')}
        action={$t('onlineAgent.discard')}
        busy={false}
        confirm={() => {
          if (pendingSelection !== undefined) choose(pendingSelection, true);
        }}
      />
      <OnlineConfirm
        open={stopOpen}
        onClose={() => setStopOpen(false)}
        title={$t('onlineAgent.stopTitle', {
          0: current?.conversation.title || '',
        })}
        description={$t('onlineAgent.stopDescription')}
        action={$t('onlineAgent.stop')}
        busy={stopping}
        confirm={() => void stop()}
        error={error}
      />
    </div>
  );
}
