# Application-owned online agents

The beta.11 Agents plugin owns Runner discovery, execution and historical plugin records. Online execution is a separate application module; it is not a fork, fake Runner or restoration of the old plugin protocol.

## Boundaries

| Module                                  | Responsibility                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `shared/online-agent.ts`                | Application-owned definitions, conversations, runs and events                                         |
| `server/online-agent/contracts.ts`      | Model, persistence and execution-host ports                                                           |
| `server/online-agent/executor.ts`       | Bounded model/tool loop, with no application data access                                              |
| `server/online-agent/service.ts`        | Definitions, owned conversations, idempotent enqueue, durable claims, cancellation and terminal state |
| `server/online-agent/database-store.ts` | NocoBase database adapter for `nrOnlineAgentRecords` only                                             |
| `server/providers/online-agents.ts`     | Composition and lifecycle; public Agents model gateway adapter                                        |
| `server/nocoreach/online-agent/`        | Membership, project context, public reads, task tools and existing task-result acceptance             |
| `server/routes/online-agents.ts`        | Authentication, session fencing, member/admin policy and validated HTTP inputs                        |
| `client/online-agent/`                  | Online settings, chat and transcript UI; no overrides of official plugin hooks                        |

To extract `plugin-online-agent`, move the shared contracts and core executor/service first. Supply the database/model adapters and lifecycle from the new package. NocoReach keeps its task/project host and HTTP authorization policy. Do not move business task schemas, project network policy or human-review rules into a generic engine. No new dependency or publishable package is required for this version.

## Execution and recovery

Enqueue persists before execution and joins the business transaction. Model and network I/O happens outside that transaction. Model choice and instructions are snapshotted per run. Explicit models are validated again by the worker; default model selection resolves at enqueue. Model credentials remain in the existing Model services plugin.

The worker claims with a revision compare-and-swap, runs up to two jobs per application process, allows 16 model turns, and imposes a four-minute deadline. A 270-second persisted claim fence makes an interrupted process's work fail visibly; it never resubmits that work automatically. Multiple processes do not share a global concurrency quota. Cancellation and agent/task authorization, including disabled user accounts, are checked during execution and around every tool call. Shutdown stops waiting for stalled provider/host work; business writes also check cancellation after acquiring their transaction lock. Completed model output still passes the task result validator and existing human review. Tool calls cannot approve, publish, send messages, execute shell commands or change repositories.

Tools page immutable task inputs, stage candidate drafts and read at most eight public pages using existing project network policy and public-address protection. Repository/build/merge/revert work requires a Runner. The built-in `online-default` uses the configured default chat model and serves saved legacy `ai` stages. Old removed plugin IDs are never remapped: choose a new online or Runner agent explicitly for project/task defaults.

The existing daily-analysis, memory and rules helpers still use `OnlineProvider.complete`. The new engine records token usage per online run. Raw gateway streaming does not populate the plugin's aggregate usage dashboard, so online run usage is shown in its transcript. No fake aggregate billing or usage records are written.

Conversation history is private to its owner, retained without automatic expiry, and listed newest first. This initial UI lists all owned conversations; pagination and retention policy are future product choices. Failed or interrupted turns keep partial transcripts. Follow-up sends preserve conversation/model identity; a new conversation permits choosing another definition. Historical plugin conversations remain in the official history, independently of new online conversations.

## Verification

`tests/nocoreach/online-agent-executor.test.ts` verifies the model/tool boundary. `tests/nocoreach/online-agents-app.test.ts` uses real application routes and SQLite storage with a deterministic model port: ownership, duplicate requests, revisions, cancellation, interrupted claims, task tools, result acceptance and saved workflow retries. It does not substitute a real provider acceptance test. `online-agent-task.test.ts` covers cancellation while waiting for the draft lock; `online-agent-ui.test.tsx` and the task-execution-panel component tests cover context, drafts, shortcuts, business failures and permanent access denials. Existing Runner/task suites remain regression coverage.
