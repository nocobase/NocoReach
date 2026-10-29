import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  BotMessageSquare,
  History,
  RefreshCwIcon,
  SquareIcon,
  SquarePenIcon,
} from 'lucide-react';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '#components/ui/input-group';
import { Spinner } from '#components/ui/spinner';
import { Skeleton } from '#components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
  EmptyContent,
} from '#components/ui/empty';
import { useBusinessAccess } from '#hooks/use-business-access';
import { ActorAvatar } from '#components/reach/actor';
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
import { OnlineChatAction, OnlineConfirm, OnlineError } from './controls.js';
import { ChatAgentChoice } from '../extensions/nocobase-agent-chat/agent-choice.js';
import { OnlineTranscript } from './transcript.js';
import { useOnlineChat } from './context.js';

export function OnlineChatView({ actions }: { actions?: ReactNode }) {
  const chat = useOnlineChat(),
    api = useOnlineApi(),
    { can: canManage } = useBusinessAccess('nrOnline.manage'),
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
      id: string | null;
      error: unknown;
    }>(),
    [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false),
    [stopping, setStopping] = useState(false),
    [stopOpen, setStopOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<string | null>();
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const refreshing =
    agents.loading ||
    conversations.loading ||
    Boolean(chat.conversationId && loadingDetail === chat.conversationId);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const detailControllerRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const scrollConversationRef = useRef<string | null>(null);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
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
  // Existing conversations keep their own model; the agent's new default only gates new chats.
  const eligible = selected?.enabled && (!!current || selected.ready);
  const requested = chat.conversationId;
  const loadError =
    loadFailure?.id === requested ? loadFailure.error : undefined;
  const ready =
    !busy &&
    (!requested || !!current) &&
    !loadError &&
    (chat.request || (eligible && !active));
  const canSend = ready && !!chat.draft.trim();
  useLayoutEffect(() => {
    const element = transcriptRef.current;
    if (!element || !current) return;
    if (scrollConversationRef.current !== current.conversation.id) {
      scrollConversationRef.current = current.conversation.id;
      followingRef.current = true;
    }
    if (followingRef.current) element.scrollTop = element.scrollHeight;
  }, [current, history]);
  // A reply's parts can grow after it is drawn (a proposal card reading the rules), and the transcript shrinks when a
  // notice appears above the composer: keep following the end.
  useEffect(() => {
    const element = transcriptRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (followingRef.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => observer.disconnect();
  }, [current, history]);
  useEffect(() => {
    if (chat.mode === 'online' && !history && !busy)
      composerRef.current?.focus();
  }, [chat.mode, history, requested, busy]);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    detailControllerRef.current = controller;
    let loading = false,
      permanent = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (loading || permanent || controller.signal.aborted) return;
      clearTimeout(timer);
      loading = true;
      setLoadingDetail(requested);
      let poll = true;
      try {
        const next = await api<ConversationDetail>(
          `conversations/${requested}`,
          undefined,
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          poll = next.runs.some(onlineRunActive);
          setDetail(next);
          setAgentId(next.conversation.agentId);
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
        if (!controller.signal.aborted) setLoadingDetail(null);
        if (poll && !permanent && !controller.signal.aborted)
          timer = setTimeout(() => void load(), 2000);
      }
    };
    void load();
    const onFocus = () => void load();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [api, requested, refresh, setAgentId]);
  function reload() {
    if (!requested) setLoadFailure(undefined);
    setRefresh((value) => value + 1);
  }
  function writeFailed(failure: unknown) {
    if (
      failure instanceof OnlineApiError &&
      [401, 403, 404].includes(failure.status)
    ) {
      // A pending poll must not restore content after access has been denied.
      detailControllerRef.current?.abort();
      setLoadingDetail(null);
      setDetail(undefined);
      setLoadFailure({ id: requested, error: failure });
      setStopOpen(false);
    } else setError(failure);
  }
  function choose(id: string | null, discard = false) {
    if (chat.draft.trim() && !discard) {
      setPendingSelection(id);
      return;
    }
    setPendingSelection(undefined);
    followingRef.current = true;
    setAwayFromEnd(false);
    chat.select(id);
    chat.setDraft('');
    setHistory(false);
    setLoadFailure(undefined);
    setError(undefined);
    setDetail(undefined);
    composerRef.current?.focus();
  }
  // A page entry's prompt is sent as it is clicked, as if typed (it stays in the composer if sending fails).
  async function send(text = chat.draft) {
    if (!ready || !text.trim()) return;
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
            text: text.trim(),
          }
        : {
            requestId: crypto.randomUUID(),
            agentId,
            projectId: chat.projectId || (project ? String(project.id) : null),
            ...(chat.subject && chat.projectId
              ? { subject: chat.subject }
              : {}),
            text: text.trim(),
          },
    };
    chat.setRequest(request);
    try {
      const conversation = await api<OnlineConversation>(
        request.path,
        request.body,
      );
      chat.setRequest(null);
      if (!current) chat.started(conversation.id);
      chat.select(conversation.id);
      chat.setDraft('');
      chat.touch();
      setRefresh((value) => value + 1);
      composerRef.current?.focus();
    } catch (failure) {
      if ((failure as Error).name === 'AbortError') return;
      if (failure instanceof OnlineApiError && failure.status < 500)
        chat.setRequest(null);
      writeFailed(failure);
      if (failure instanceof OnlineApiError && failure.status === 409)
        setRefresh((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }
  // A reply that stopped partway is picked up where it stopped, as the same turn.
  async function continueReply(runId: string) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await api(`runs/${runId}/continue`, {});
      chat.touch();
      followingRef.current = true;
      setRefresh((value) => value + 1);
    } catch (failure) {
      if ((failure as Error).name === 'AbortError') return;
      writeFailed(failure);
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
      if ((failure as Error).name !== 'AbortError') writeFailed(failure);
    } finally {
      setStopping(false);
    }
  }
  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <div className='flex min-w-0 items-center gap-1'>
        <h2
          className='min-w-0 flex-1 truncate text-base font-medium'
          title={current?.conversation.title}
        >
          {history
            ? $t('onlineAgent.history')
            : current?.conversation.title || $t('onlineAgent.newChat')}
        </h2>
        {(!history || !!conversations.data?.length) && (
          <OnlineChatAction
            label={$t('onlineAgent.newChat')}
            disabled={busy || !!chat.request}
            onClick={() => choose(null)}
          >
            <SquarePenIcon />
          </OnlineChatAction>
        )}
        <OnlineChatAction
          label={$t(history ? 'onlineAgent.backChat' : 'onlineAgent.history')}
          disabled={busy || !!chat.request}
          onClick={() => {
            followingRef.current = true;
            setAwayFromEnd(false);
            setHistory(!history);
            setRefresh((value) => value + 1);
          }}
        >
          {history ? <ArrowLeftIcon /> : <History />}
        </OnlineChatAction>
        <OnlineChatAction
          label={$t('onlineAgent.refresh')}
          variant='outline'
          disabled={refreshing}
          onClick={reload}
        >
          <RefreshCwIcon className={refreshing ? 'animate-spin' : undefined} />
        </OnlineChatAction>
        {actions}
      </div>
      <p className='text-xs text-muted-foreground'>
        {boundProject
          ? $t('onlineAgent.projectContext', { 0: projectName || boundProject })
          : $t('onlineAgent.noProject')}
      </p>
      {history ? (
        <div className='relative min-h-0 flex-1 overflow-y-auto'>
          <OnlineError error={conversations?.error} retry={reload} />
          {conversations.loading && !conversations.data && (
            <div role='status' aria-label={$t('common.loading')}>
              <Skeleton className='h-10 w-full' />
              <Skeleton className='mt-3 h-10 w-full' />
              <Skeleton className='mt-3 h-10 w-3/4' />
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
          <OnlineError error={agents?.error} retry={reload} />
          <div
            ref={transcriptRef}
            role='log'
            aria-live='off'
            tabIndex={-1}
            onScroll={(event) => {
              const element = event.currentTarget;
              followingRef.current =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                48;
              setAwayFromEnd(!followingRef.current);
            }}
            // `relative`: screen-reader-only text (`sr-only`, absolutely positioned) is laid out against this scroller
            // and clipped by it. Positioned against the panel instead, it stretched the whole document, and the page
            // beside the chat scrolled on into blank space (2026-10-28, Keywords).
            className='relative flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto overscroll-contain px-1 py-3 focus-visible:outline-2 focus-visible:outline-ring'
            aria-label={$t('onlineAgent.transcript')}
          >
            <OnlineError
              error={current ? undefined : loadError}
              retry={reload}
            />
            {requested && !current && !loadError && (
              <div role='status' aria-label={$t('common.loading')}>
                <Skeleton className='ml-auto h-10 w-1/3' />
                <Skeleton className='mt-6 h-4 w-1/4' />
                <Skeleton className='mt-3 h-16 w-3/4' />
              </div>
            )}
            {!requested && chat.page && (
              <Empty data-page-opening=''>
                <EmptyHeader>
                  <EmptyMedia>
                    <ActorAvatar type='agent' size='default' />
                  </EmptyMedia>
                  <EmptyTitle>{chat.page.label}</EmptyTitle>
                  {chat.page.description && (
                    <EmptyDescription>{chat.page.description}</EmptyDescription>
                  )}
                </EmptyHeader>
                <EmptyContent>
                  <ul
                    className='flex w-full flex-col gap-2'
                    aria-label={$t('onlineAgent.suggestions')}
                  >
                    {chat.page.presets.map((preset) => (
                      <li key={preset}>
                        <Button
                          variant='outline'
                          className='h-auto w-full justify-start py-2 text-left font-normal whitespace-normal'
                          disabled={!ready || !!chat.request}
                          onClick={() => {
                            chat.setDraft(preset);
                            void send(preset);
                          }}
                        >
                          {preset}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </EmptyContent>
              </Empty>
            )}
            {!requested && !chat.page && (
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
              <OnlineTranscript
                key={run.id}
                run={run}
                {...(run.id === current.conversation.activeRunId && !active
                  ? {
                      onContinue: () => void continueReply(run.id),
                      continuing: busy,
                    }
                  : {})}
              />
            ))}
          </div>
          {awayFromEnd && current && (
            <Button
              size='sm'
              variant='outline'
              className='self-center'
              onClick={() => {
                const element = transcriptRef.current;
                if (element) {
                  followingRef.current = true;
                  element.scrollTop = element.scrollHeight;
                  element.focus({ preventScroll: true });
                }
                setAwayFromEnd(false);
              }}
            >
              <ArrowDownIcon data-icon='inline-start' />
              {$t('onlineAgent.latest')}
            </Button>
          )}
          {agents?.data && !eligible && (
            <p className='text-sm text-muted-foreground'>
              {$t('onlineAgent.unavailable')}
              {canManage && (
                <>
                  {' '}
                  <Link className='nr-link-quiet' to='/agents'>
                    {$t('onlineAgent.settings')}
                  </Link>
                </>
              )}
            </p>
          )}
          {/* A loaded conversation that cannot be read again (NocoReach restarting) says so here, where the reader
              follows the latest reply, not at the top of the transcript. It blocks sending, so it wins over a send
              error, which shows again once a read succeeds. */}
          {current && loadError ? (
            <OnlineError error={loadError} retry={reload} />
          ) : (
            <OnlineError error={!stopOpen ? error : undefined} />
          )}
          {chat.request && (
            <p className='text-sm text-muted-foreground'>
              {$t('onlineAgent.ambiguousRequest')}
            </p>
          )}
          <form
            className='shrink-0'
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <InputGroup className='@container rounded-2xl bg-background shadow-sm has-disabled:bg-background has-disabled:opacity-100 dark:has-disabled:bg-input/30'>
              <InputGroupTextarea
                ref={composerRef}
                aria-label={$t('onlineAgent.message')}
                placeholder={$t('onlineAgent.messagePlaceholder')}
                value={chat.draft}
                maxLength={30000}
                rows={3}
                className='max-h-40 min-h-20 resize-none px-3 py-3'
                disabled={busy || !!chat.request}
                onChange={(event) => chat.setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    event.nativeEvent.keyCode !== 229
                  ) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <InputGroupAddon align='block-end' className='justify-between'>
                <ChatAgentChoice
                  onlineAgents={agents.data || []}
                  onlineAgent={selected}
                  disabled={busy || !!chat.request || !!(requested && !current)}
                  onlineLoading={agents.loading}
                  onlineError={agents.error}
                  retryOnline={reload}
                />
                {active ? (
                  <OnlineChatAction
                    label={$t(
                      active.cancelRequested
                        ? 'onlineAgent.stopping'
                        : 'onlineAgent.stop',
                    )}
                    variant='outline'
                    className='shrink-0 rounded-full'
                    disabled={stopping || active.cancelRequested}
                    onClick={() => setStopOpen(true)}
                  >
                    {stopping || active.cancelRequested ? (
                      <Spinner />
                    ) : (
                      <SquareIcon />
                    )}
                  </OnlineChatAction>
                ) : (
                  <OnlineChatAction
                    label={$t(
                      busy
                        ? 'common.working'
                        : chat.request
                          ? 'common.retry'
                          : 'onlineAgent.send',
                    )}
                    type='submit'
                    variant='default'
                    className='shrink-0 rounded-full'
                    disabled={!canSend}
                  >
                    {busy ? <Spinner /> : <ArrowUpIcon />}
                  </OnlineChatAction>
                )}
              </InputGroupAddon>
            </InputGroup>
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
