import { abortable } from './abort.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  DEFAULT_ONLINE_AGENT,
  onlineRunActive,
  type OnlineAgentDefinition,
  type OnlineConversation,
  type OnlineEvent,
  type OnlineModel,
  type OnlineRun,
} from '../../shared/online-agent.js';
import {
  OnlineAgentError,
  type ExecutionHost,
  type ModelPort,
  type Message,
  type OnlineExecutor,
  type OnlineStore,
  type StoredRecord,
} from './contracts.js';

const now = () => new Date().toISOString();
const fingerprint = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const zeroUsage = () => ({ inputTokens: 0, outputTokens: 0 });
const record = (
  kind: StoredRecord['kind'],
  value: OnlineAgentDefinition | OnlineConversation | OnlineRun,
): StoredRecord => ({
  id: value.id,
  kind,
  ownerId: 'ownerId' in value ? value.ownerId : '',
  groupId: 'conversationId' in value ? value.conversationId : '',
  status:
    'status' in value
      ? value.status
      : 'enabled' in value
        ? value.enabled
          ? 'enabled'
          : 'disabled'
        : '',
  revision: value.revision,
  payload: value,
});
interface EnqueueChatTurn {
  id: string;
  agentId: string;
  ownerId: string;
  projectId: string | null;
  conversationId: string;
  sequence: number;
  input: string;
  model?: OnlineModel | null;
}

/** Owns online definitions, conversations and durable runs. Business rules enter only through the host port. */
export class OnlineAgentService {
  private readonly holder = randomUUID();
  private readonly active = new Map<
    string,
    { abort: AbortController; promise: Promise<void> }
  >();
  private timer?: ReturnType<typeof setInterval>;
  private scan?: Promise<void>;
  private stopping = false;
  constructor(
    readonly store: OnlineStore,
    readonly models: ModelPort,
    private readonly executor: OnlineExecutor,
    private readonly host: ExecutionHost,
    private readonly onError: (error: unknown) => void = () => {},
  ) {}

  async read<T>(
    id: string,
    kind: StoredRecord['kind'],
    context?: unknown,
  ): Promise<T | null> {
    const row = await this.store.get(id, context);
    return row?.kind === kind ? (row.payload as T) : null;
  }
  private async save(
    kind: StoredRecord['kind'],
    value: OnlineAgentDefinition | OnlineConversation | OnlineRun,
    context?: unknown,
  ) {
    const next = { ...value, revision: value.revision + 1 };
    if (
      !(await this.store.replace(record(kind, next), value.revision, context))
    )
      throw new OnlineAgentError('revisionConflict');
    return next;
  }
  async initialize() {
    if (await this.read(DEFAULT_ONLINE_AGENT, 'agent')) return;
    const value: OnlineAgentDefinition = {
      id: DEFAULT_ONLINE_AGENT,
      name: 'Online Agent',
      instructions: '',
      enabled: true,
      model: null,
      revision: 0,
    };
    try {
      await this.store.create(record('agent', value));
    } catch (error) {
      if (!(await this.read(DEFAULT_ONLINE_AGENT, 'agent'))) throw error;
    }
  }
  async definitions(context?: unknown): Promise<OnlineAgentDefinition[]> {
    return (await this.store.list({ kind: 'agent' }, context)).map(
      (row) => row.payload as OnlineAgentDefinition,
    );
  }
  async definition(id: string, context?: unknown) {
    const agent = await this.read<OnlineAgentDefinition>(id, 'agent', context);
    if (!agent) throw new OnlineAgentError('agentNotFound', 404);
    return agent;
  }
  async saveDefinition(value: Omit<OnlineAgentDefinition, 'id'>, id?: string) {
    if (value.enabled && value.model) await this.models.resolve(value.model);
    if (!id) {
      const agent = { ...value, id: `online-${randomUUID()}`, revision: 0 };
      await this.store.create(record('agent', agent));
      return agent;
    }
    return this.store.transaction(async (context) => {
      const current = await this.definition(id, context);
      if (current.revision !== value.revision)
        throw new OnlineAgentError('revisionConflict');
      return (await this.save(
        'agent',
        { ...value, id },
        context,
      )) as OnlineAgentDefinition;
    });
  }
  private async enqueue(
    input: EnqueueChatTurn,
    context?: unknown,
  ): Promise<OnlineRun> {
    const requestHash = fingerprint([
      input.agentId,
      input.ownerId,
      input.projectId,
      input.conversationId,
      input.input,
      input.model?.modelService ?? null,
      input.model?.model ?? null,
    ]);
    const existing = await this.read<OnlineRun>(input.id, 'run', context);
    if (existing) {
      if (existing.requestHash !== requestHash)
        throw new OnlineAgentError('requestConflict');
      return existing;
    }
    const agent = await this.definition(input.agentId, context);
    if (!agent.enabled) throw new OnlineAgentError('agentDisabled');
    const model = await this.models.resolve(
      input.model ?? agent.model,
      context,
    );
    const run: OnlineRun = {
      ...input,
      requestHash,
      agentName: agent.name,
      model,
      instructions: agent.instructions,
      status: 'queued',
      createdAt: now(),
      startedAt: null,
      finishedAt: null,
      deadline: null,
      holder: null,
      cancelRequested: false,
      output: '',
      events: [],
      usage: zeroUsage(),
      error: null,
      revision: 0,
    };
    await this.store.create(record('run', run), context);
    return run;
  }
  async conversation(id: string, ownerId: string, context?: unknown) {
    const conversation = await this.read<OnlineConversation>(
      id,
      'conversation',
      context,
    );
    if (!conversation || conversation.ownerId !== ownerId)
      throw new OnlineAgentError('conversationNotFound', 404);
    return conversation;
  }
  async conversations(ownerId: string) {
    return (await this.store.list({ kind: 'conversation', ownerId }))
      .map((row) => row.payload as OnlineConversation)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async conversationRuns(conversation: OnlineConversation, context?: unknown) {
    return (
      await this.store.list(
        {
          kind: 'run',
          groupId: conversation.id,
          ownerId: conversation.ownerId,
        },
        context,
      )
    )
      .map((row) => row.payload as OnlineRun)
      .sort((a, b) => a.sequence - b.sequence);
  }
  async createConversation(input: {
    requestId: string;
    ownerId: string;
    projectId: string | null;
    agentId: string;
    model?: OnlineModel | null;
    text: string;
  }) {
    return this.store.transaction(async (context) => {
      const requestHash = fingerprint([
        input.ownerId,
        input.projectId,
        input.agentId,
        input.text,
        input.model?.modelService ?? null,
        input.model?.model ?? null,
      ]);
      const id = `online-chat-${input.requestId}`;
      const existing = await this.read<OnlineConversation>(
        id,
        'conversation',
        context,
      );
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new OnlineAgentError('requestConflict');
        return existing;
      }
      const run = await this.enqueue(
        {
          id: `online-run-${input.requestId}`,
          agentId: input.agentId,
          ownerId: input.ownerId,
          projectId: input.projectId,
          conversationId: id,
          sequence: 0,
          input: input.text,
          model: input.model,
        },
        context,
      );
      const conversation: OnlineConversation = {
        id,
        requestHash,
        ownerId: input.ownerId,
        projectId: input.projectId,
        agentId: input.agentId,
        model: run.model,
        title: input.text.slice(0, 100),
        activeRunId: run.id,
        createdAt: now(),
        updatedAt: now(),
        revision: 0,
      };
      await this.store.create(record('conversation', conversation), context);
      return conversation;
    });
  }
  async send(
    id: string,
    ownerId: string,
    input: { requestId: string; revision: number; text: string },
  ) {
    return this.store.transaction(async (context) => {
      const conversation = await this.conversation(id, ownerId, context);
      const existing = await this.read<OnlineRun>(
        `online-run-${input.requestId}`,
        'run',
        context,
      );
      if (existing) {
        if (
          existing.ownerId !== ownerId ||
          existing.conversationId !== id ||
          existing.input !== input.text
        )
          throw new OnlineAgentError('requestConflict');
        return conversation;
      }
      if (conversation.revision !== input.revision)
        throw new OnlineAgentError('revisionConflict');
      const previous = await this.conversationRuns(conversation, context);
      if (previous.some(onlineRunActive))
        throw new OnlineAgentError('runActive');
      const run = await this.enqueue(
        {
          id: `online-run-${input.requestId}`,
          agentId: conversation.agentId,
          ownerId,
          projectId: conversation.projectId,
          conversationId: id,
          sequence: conversation.revision + 1,
          model: conversation.model,
          input: input.text,
        },
        context,
      );
      return (await this.save(
        'conversation',
        { ...conversation, activeRunId: run.id, updatedAt: now() },
        context,
      )) as OnlineConversation;
    });
  }
  async run(id: string, context?: unknown) {
    const value = await this.read<OnlineRun>(id, 'run', context);
    if (!value) throw new OnlineAgentError('runNotFound', 404);
    return value;
  }
  async cancel(id: string) {
    const mutate = async (tx: unknown) => {
      const run = await this.run(id, tx);
      if (!onlineRunActive(run)) return run;
      return (await this.save(
        'run',
        {
          ...run,
          cancelRequested: true,
          ...(run.status === 'queued'
            ? { status: 'cancelled' as const, finishedAt: now() }
            : {}),
        },
        tx,
      )) as OnlineRun;
    };
    const result = await this.store.transaction(mutate);
    this.active.get(id)?.abort.abort();
    return result;
  }
  private async updateRun(id: string, change: (run: OnlineRun) => OnlineRun) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await this.store.transaction(async (context) => {
          const run = await this.run(id, context);
          return (await this.save('run', change(run), context)) as OnlineRun;
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
  private async messages(run: OnlineRun): Promise<Message[]> {
    const conversation = await this.conversation(
      run.conversationId,
      run.ownerId,
    );
    const previous = await this.conversationRuns(conversation);
    // Store each prompt once. Failed or cancelled partial replies do not become model history.
    const messages: Message[] = previous
      .filter(
        (turn) => turn.sequence < run.sequence && turn.status === 'completed',
      )
      .flatMap((turn): Message[] => [
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
    try {
      const agent = await this.definition(run.agentId);
      if (!agent.enabled) throw new OnlineAgentError('agentDisabled');
      await this.models.resolve(run.model);
      const context = await abortable(
        this.host.prepare(run, abort.signal),
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
      const output = await abortable(
        this.executor.execute({
          model: run.model,
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
      await this.updateRun(run.id, (current) => {
        if (current.holder !== this.holder || current.status !== 'running')
          return current;
        return {
          ...current,
          status: current.cancelRequested ? 'cancelled' : 'completed',
          output,
          finishedAt: now(),
          error: null,
        };
      });
    } catch (error) {
      if (!abort.signal.aborted) this.onError(error);
      await flush().catch(this.onError);
      await this.updateRun(run.id, (current) => {
        if (current.holder !== this.holder || current.status !== 'running')
          return current;
        const code =
          error instanceof OnlineAgentError
            ? error.code
            : abort.signal.reason instanceof OnlineAgentError
              ? abort.signal.reason.code
              : this.stopping
                ? 'interrupted'
                : 'modelFailed';
        return {
          ...current,
          status: current.cancelRequested ? 'cancelled' : 'failed',
          error: current.cancelRequested ? null : code,
          finishedAt: now(),
        };
      }).catch(this.onError);
    } finally {
      clearTimeout(timeout);
      clearInterval(poll);
    }
  }
  /** Persisted claims fence multiple workers. Expired work fails visibly; it is never replayed automatically. */
  async drain() {
    if (this.scan) return this.scan;
    this.scan = (async () => {
      for (const row of await this.store.list({
        kind: 'run',
        status: 'running',
      })) {
        const run = row.payload as OnlineRun;
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
      for (const row of await this.store.list({
        kind: 'run',
        status: 'queued',
      })) {
        if (this.stopping || this.active.size >= 2) break;
        const run = {
          ...(row.payload as OnlineRun),
          status: 'running' as const,
          holder: this.holder,
          startedAt: now(),
          deadline: new Date(Date.now() + 270000).toISOString(),
          revision: row.revision + 1,
        };
        if (!(await this.store.replace(record('run', run), row.revision)))
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
