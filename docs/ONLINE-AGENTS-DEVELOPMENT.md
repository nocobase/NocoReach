# Application-owned online chat

The Agents plugin owns all task execution and Runner chat. Application-owned online agents are conversation assistants using the public model gateway. They cannot be selected as task executors, and there is no online task adapter or fallback.

## Boundaries

| Module                                  | Responsibility                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `shared/online-agent.ts`                | Chat definitions, conversations, turns and transcript events                           |
| `server/online-agent/contracts.ts`      | Model, persistence and read-only host ports                                            |
| `server/online-agent/executor.ts`       | Bounded model/tool loop without ambient application access                             |
| `server/online-agent/service.ts`        | Owned conversations, idempotency, durable turn claims, cancellation and terminal state |
| `server/online-agent/database-store.ts` | Storage in `nrOnlineAgentRecords`                                                      |
| `server/providers/online-agents.ts`     | Lifecycle, public model gateway and safe error classification                          |
| `server/nocoreach/online-agent/`        | Membership checks, project context and public webpage reads                            |
| `server/routes/online-agents.ts`        | Authentication, session fence, member/admin policy and input validation                |
| `client/online-agent/`                  | Settings, chat and transcript UI using the shared application API client               |

The task service has no online-service dependency. Tasks use official `pluginRunId` records and `RunHeader`/`RunTranscript`. Online chat has a `conversationId`, not a generic task subject. Its only tools are `project_data` and `read_page`; task data/draft capabilities remain in the Runner task integration. Do not import plugin internals or introduce a separately published plugin.

## Execution and storage

Chat enqueue commits before model/network I/O. Model choice and instructions are snapshotted per turn; credentials remain in Model services. Only the current prompt is stored in each turn. Model history is assembled from earlier completed turns in sequence order; failed/cancelled partial answers stay visible but are not included in subsequent prompts. This avoids copying the full history into every turn.

Closing the panel does not cancel a submitted turn. The worker therefore retains durable revision-based claims, up to two concurrent turns per application process, a 16-step tool loop and a four-minute deadline. A 270-second persisted claim fence marks interrupted work failed without automatically repeating model calls. Cancellation, enabled-agent state and user membership are checked throughout execution and around tool calls. Shutdown aborts stalled model or host preparation. Multiple processes do not share a global concurrency quota.

The host snapshots read-only project context and reads at most eight public pages through existing project network policy and public-address protection. There are no task writes or task result validators in this module. Daily analysis, memory and rule helpers continue to use `OnlineProvider.complete` independently.

Gateway errors map to stable application codes for authentication, quota, rate limits, network, configuration and context size. Persist and display safe codes, never provider exception text. Unexpected execution failures are logged with a safe code. Token usage is recorded per chat turn; raw gateway streaming does not populate the plugin's aggregate usage dashboard.

History is private to its owner and retained without automatic expiry. The initial UI lists all owned conversations; pagination and retention remain separate product decisions. Active conversations poll; terminal conversations refresh on selection, explicit refresh, focus or visibility restoration. Transient read failures retry, while 401/403/404 clear protected content and stop polling. The session fence rejects stale browser-session requests.

This is an unreleased product: no migration, legacy AI-stage retry, old startRun API or historical online-task compatibility is provided.

## Verification

`online-agent-executor.test.ts` covers bounded tool/model execution. `online-agents-app.test.ts` exercises real routes and SQLite storage for ownership, idempotency, cancellation, interrupted claims, disabled accounts, Runner-only selection, read-only chat tools, compact history and safe gateway errors. `transaction-responsiveness.test.ts` verifies that model I/O does not hold the database connection. Component tests cover context, drafts, shortcuts, access denials and terminal refresh behavior. Existing Runner/task suites cover claims, materials, results and human review. Deterministic model fixtures do not replace acceptance with a live provider.
