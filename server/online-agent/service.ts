import { abortable } from './abort.js';
import { createHash, randomUUID } from 'node:crypto';
import type {
  Agents,
  ModelMessage,
} from '@nocobase/app-plugin-agents/server/tokens';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  DEFAULT_ONLINE_AGENT,
  onlineRunActive,
  type OnlineAgentDefinition,
  type OnlineConversation,
  type OnlineEvent,
  type OnlineModel,
  type OnlineRun,
} from '../../shared/online-agent.js';
import { OnlineAgentError, onlineErrorCode } from './errors.js';
import { OnlineRecords } from './records.js';
import { executeChat, type ChatContext } from './executor.js';

const now = () => new Date().toISOString();
type MessageInput = { requestId: string; text: string } & (
  | { conversationId: string; revision: number }
  | { agentId: string; projectId: string | null; model?: OnlineModel | null }
);

/** Application-owned chat, with durable turns independent of the browser connection. */
export class OnlineAgentService {
  readonly records: OnlineRecords;
  private readonly holder = randomUUID();
  private readonly active = new Map<
    string,
    { abort: AbortController; promise: Promise<void> }
  >();
  private timer?: ReturnType<typeof setInterval>;
  private scan?: Promise<void>;
  private stopping = false;
  constructor(
    readonly database: DatabaseManager,
    readonly models: Agents['models'],
    private readonly prepare: (
      run: OnlineRun,
      signal: AbortSignal,
    ) => Promise<ChatContext>,
    private readonly onError: (error: unknown) => void = () => {},
    private readonly environmentModel: () => OnlineModel | undefined = () =>
      undefined,
  ) {
    this.records = new OnlineRecords(database);
  }

  async resolveModel(
    model?: OnlineModel | null,
    context?: DatabaseConnection,
  ): Promise<OnlineModel> {
    const selected =
      this.environmentModel() ??
      model ??
      (await this.models.services.defaults(context)).effectiveChat;
    if (!selected) throw new OnlineAgentError('modelRequired');
    // Creation reads defaults in its transaction; provider validation happens before worker I/O.
    if (!context) {
      try {
        await this.models.services.connectionFor(selected, 'chat');
      } catch {
        throw new OnlineAgentError('modelUnavailable');
      }
    }
    return { modelService: selected.modelService, model: selected.model };
  }
  async initialize() {
    if (await this.records.get('agent', DEFAULT_ONLINE_AGENT)) return;
    try {
      await this.records.create('agent', {
        id: DEFAULT_ONLINE_AGENT,
        name: 'Online Agent',
        instructions: '',
        enabled: true,
        model: null,
        revision: 0,
      });
    } catch (error) {
      if (!(await this.records.get('agent', DEFAULT_ONLINE_AGENT))) throw error;
    }
  }
  definitions() {
    return this.records.list('agent');
  }
  async definition(id: string, context?: DatabaseConnection) {
    const agent = await this.records.get('agent', id, context);
    if (!agent) throw new OnlineAgentError('agentNotFound', 404);
    return agent;
  }
  async saveDefinition(value: Omit<OnlineAgentDefinition, 'id'>, id?: string) {
    if (value.enabled && value.model) await this.resolveModel(value.model);
    if (!id)
      return this.records.create('agent', {
        ...value,
        id: `online-${randomUUID()}`,
        revision: 0,
      });
    return this.database.transaction(async (context) => {
      const current = await this.definition(id, context);
      if (current.revision !== value.revision)
        throw new OnlineAgentError('revisionConflict');
      return this.records.save('agent', { ...value, id }, context);
    });
  }
  async conversation(
    id: string,
    ownerId: string,
    context?: DatabaseConnection,
  ) {
    const conversation = await this.records.get('conversation', id, context);
    if (!conversation || conversation.ownerId !== ownerId)
      throw new OnlineAgentError('conversationNotFound', 404);
    return conversation;
  }
  async conversations(ownerId: string) {
    return (await this.records.list('conversation', { ownerId })).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  async conversationRuns(
    conversation: OnlineConversation,
    context?: DatabaseConnection,
  ) {
    return (
      await this.records.list(
        'run',
        { groupId: conversation.id, ownerId: conversation.ownerId },
        context,
      )
    ).sort((a, b) => a.sequence - b.sequence);
  }
  /** Initial messages and follow-ups share one transaction and one idempotency check. */
  async send(ownerId: string, input: MessageInput) {
    const target =
      'conversationId' in input
        ? [input.conversationId, input.revision]
        : [
            input.agentId,
            input.projectId,
            input.model?.modelService ?? null,
            input.model?.model ?? null,
          ];
    const requestHash = createHash('sha256')
      .update(JSON.stringify([ownerId, target, input.text]))
      .digest('hex');
    return this.database.transaction(async (context) => {
      const id = `online-run-${input.requestId}`;
      const existing = await this.records.get('run', id, context);
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new OnlineAgentError('requestConflict');
        return this.conversation(existing.conversationId, ownerId, context);
      }
      const conversation =
        'conversationId' in input
          ? await this.conversation(input.conversationId, ownerId, context)
          : null;
      if (conversation && 'revision' in input) {
        if (conversation.revision !== input.revision)
          throw new OnlineAgentError('revisionConflict');
        if (onlineRunActive(await this.run(conversation.activeRunId, context)))
          throw new OnlineAgentError('runActive');
      }
      const selection = 'agentId' in input ? input : conversation!;
      const agent = await this.definition(selection.agentId, context);
      if (!agent.enabled) throw new OnlineAgentError('agentDisabled');
      const model = await this.resolveModel(
        selection.model ?? agent.model,
        context,
      );
      const run: OnlineRun = {
        id,
        requestHash,
        ownerId,
        agentId: agent.id,
        agentName: agent.name,
        instructions: agent.instructions,
        projectId: selection.projectId,
        model,
        conversationId: conversation?.id ?? `online-chat-${input.requestId}`,
        sequence: conversation ? conversation.revision + 1 : 0,
        input: input.text,
        status: 'queued',
        createdAt: now(),
        startedAt: null,
        finishedAt: null,
        deadline: null,
        holder: null,
        cancelRequested: false,
        output: '',
        events: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        error: null,
        revision: 0,
      };
      await this.records.create('run', run, context);
      if (conversation)
        return this.records.save(
          'conversation',
          {
            ...conversation,
            activeRunId: run.id,
            updatedAt: now(),
          },
          context,
        );
      return this.records.create(
        'conversation',
        {
          id: run.conversationId,
          ownerId,
          projectId: run.projectId,
          agentId: run.agentId,
          model,
          title: input.text.slice(0, 100),
          activeRunId: run.id,
          createdAt: now(),
          updatedAt: now(),
          revision: 0,
        },
        context,
      );
    });
  }
  async run(id: string, context?: DatabaseConnection) {
    const value = await this.records.get('run', id, context);
    if (!value) throw new OnlineAgentError('runNotFound', 404);
    return value;
  }
  async cancel(id: string) {
    const mutate = async (tx: DatabaseConnection) => {
      const run = await this.run(id, tx);
      if (!onlineRunActive(run)) return run;
      return await this.records.save(
        'run',
        {
          ...run,
          cancelRequested: true,
          ...(run.status === 'queued'
            ? { status: 'cancelled' as const, finishedAt: now() }
            : {}),
        },
        tx,
      );
    };
    const result = await this.database.transaction(mutate);
    this.active.get(id)?.abort.abort();
    return result;
  }
  private async updateRun(id: string, change: (run: OnlineRun) => OnlineRun) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.database.transaction(async (context) => {
          const run = await this.run(id, context);
          return await this.records.save('run', change(run), context);
        });
      } catch (error) {
        if (
          !(error instanceof OnlineAgentError) ||
          error.code !== 'revisionConflict' ||
          attempt === 3
        )
          throw error;
      }
    }
    throw new OnlineAgentError('revisionConflict');
  }
  private async messages(run: OnlineRun): Promise<ModelMessage[]> {
    const conversation = await this.conversation(
      run.conversationId,
      run.ownerId,
    );
    const previous = await this.conversationRuns(conversation);
    // Store each prompt once. Failed or cancelled partial replies do not become model history.
    const messages: ModelMessage[] = previous
      .filter(
        (turn) => turn.sequence < run.sequence && turn.status === 'completed',
      )
      .flatMap((turn): ModelMessage[] => [
        { role: 'user', content: turn.input },
        { role: 'assistant', content: turn.output },
      ]);
    messages.push({ role: 'user', content: run.input });
    if (JSON.stringify(messages).length > 400000)
      throw new OnlineAgentError('contextLimit');
    return messages;
  }
  private async execute(run: OnlineRun, abort: AbortController) {
    const timeout = setTimeout(
      () => abort.abort(new OnlineAgentError('timeout')),
      240000,
    );
    let polling = false;
    let authorize: (() => Promise<void>) | undefined;
    const poll = setInterval(() => {
      if (polling) return;
      polling = true;
      void this.run(run.id)
        .then(async (current) => {
          if (
            current.cancelRequested ||
            current.holder !== this.holder ||
            current.status !== 'running'
          )
            abort.abort();
          if (!abort.signal.aborted) await authorize?.();
        })
        .catch((error) => abort.abort(error))
        .finally(() => {
          polling = false;
        });
    }, 500);
    let pending: OnlineEvent[] = [],
      lastFlush = 0;
    const flush = async () => {
      if (!pending.length) return;
      const batch = pending;
      pending = [];
      await this.updateRun(run.id, (current) => {
        if (current.holder !== this.holder || current.status !== 'running')
          throw new OnlineAgentError('runChanged');
        const events = [...current.events],
          usage = { ...current.usage };
        let output = current.output;
        for (const event of batch) {
          if (event.type === 'text') {
            output += event.text;
            const previous = events.at(-1);
            if (previous?.type === 'text')
              events[events.length - 1] = {
                type: 'text',
                text: previous.text + event.text,
              };
            else events.push(event);
          } else events.push(event);
          if (event.type === 'usage')
            for (const key of [
              'inputTokens',
              'outputTokens',
              'cacheReadTokens',
              'cacheWriteTokens',
              'reasoningTokens',
            ] as const)
              usage[key] = (usage[key] ?? 0) + (event.usage[key] ?? 0);
        }
        if (JSON.stringify(events).length > 2000000)
          throw new OnlineAgentError('transcriptLimit');
        return { ...current, output, events, usage };
      });
      lastFlush = Date.now();
    };
    let output = '',
      status: 'completed' | 'failed' = 'failed',
      failure: unknown;
    try {
      const agent = await this.definition(run.agentId);
      if (!agent.enabled) throw new OnlineAgentError('agentDisabled');
      const model = await this.resolveModel(run.model);
      const context = await abortable(
        this.prepare(run, abort.signal),
        abort.signal,
      );
      const check = context.authorize;
      context.authorize = async () => {
        abort.signal.throwIfAborted();
        if (!(await this.definition(run.agentId)).enabled)
          throw new OnlineAgentError('agentDisabled', 403);
        await check();
      };
      authorize = context.authorize;
      output = await abortable(
        executeChat(this.models.gateway, {
          model,
          messages: await this.messages(run),
          context,
          signal: abort.signal,
          emit: async (event) => {
            abort.signal.throwIfAborted();
            pending.push(event);
            if (event.type !== 'text' || Date.now() - lastFlush >= 300)
              await flush();
          },
        }),
        abort.signal,
      );
      await flush();
      await context.authorize();
      status = 'completed';
    } catch (error) {
      failure = error;
      if (!abort.signal.aborted) this.onError(error);
      await flush().catch(this.onError);
    } finally {
      await this.updateRun(run.id, (current) => {
        if (current.holder !== this.holder || current.status !== 'running')
          return current;
        return {
          ...current,
          status: current.cancelRequested ? 'cancelled' : status,
          ...(status === 'completed' ? { output } : {}),
          error:
            current.cancelRequested || status === 'completed'
              ? null
              : onlineErrorCode(abort.signal.reason ?? failure),
          finishedAt: now(),
        };
      }).catch(this.onError);
      clearTimeout(timeout);
      clearInterval(poll);
    }
  }
  /** Persisted claims fence multiple workers. Expired work fails visibly; it is never replayed automatically. */
  async drain() {
    if (this.scan) return this.scan;
    this.scan = (async () => {
      for (const run of await this.records.list('run', { status: 'running' })) {
        if (run.deadline && Date.parse(run.deadline) < Date.now())
          await this.updateRun(run.id, (current) =>
            current.status === 'running' &&
            current.deadline &&
            Date.parse(current.deadline) < Date.now()
              ? {
                  ...current,
                  status: 'failed',
                  error: 'interrupted',
                  finishedAt: now(),
                }
              : current,
          );
      }
      for (const queued of await this.records.list('run', {
        status: 'queued',
      })) {
        if (this.stopping || this.active.size >= 2) break;
        const run = {
          ...queued,
          status: 'running' as const,
          holder: this.holder,
          startedAt: now(),
          deadline: new Date(Date.now() + 270000).toISOString(),
          revision: queued.revision + 1,
        };
        if (!(await this.records.replace('run', run, queued.revision)))
          continue;
        const abort = new AbortController();
        const promise = this.execute(run, abort)
          .catch(this.onError)
          .finally(() => this.active.delete(run.id));
        this.active.set(run.id, { abort, promise });
      }
    })().finally(() => {
      this.scan = undefined;
    });
    return this.scan;
  }
  start() {
    if (this.timer) return;
    this.stopping = false;
    this.timer = setInterval(() => {
      void this.drain().catch(this.onError);
    }, 1000);
    this.timer.unref();
    void this.drain().catch(this.onError);
  }
  async stop() {
    this.stopping = true;
    clearInterval(this.timer);
    this.timer = undefined;
    await this.scan;
    for (const { abort } of this.active.values())
      abort.abort(new OnlineAgentError('interrupted'));
    await Promise.allSettled(
      [...this.active.values()].map((value) => value.promise),
    );
  }
  async idle() {
    await this.drain();
    await Promise.all([...this.active.values()].map((value) => value.promise));
  }
}
