# NocoReach Development Constraints

This document covers application adaptations to the template and business boundaries prone to regressions. Read the relevant sections when changing those features. Follow the [application development Skill](../.agents/skills/nocobase-app-development/SKILL.md) and its references for general development; explicit application adaptations below take precedence over template examples.

See the [changelog](../CHANGELOG.md) and [port plan](PORT-PLAN.md) for historical context. Legacy Agent and AI configuration, deployment steps, and outstanding items in the port plan reflect their time, not current implementation requirements. Dependency versions come from `package.json` and the lockfile.

## Frontend

Before changing `client/`, read the [frontend workflow](../.agents/skills/nocobase-app-development/references/frontend/ui-workflow.md) for task-specific component, styling, interaction, and validation guidance. Preserve the application differences below.

### Business pages and copy

- Ported business pages and components live in `client/pages/` and `client/components/`. Requests use the `nocobaseClient.action()` contract in `client/lib/nocoreach-api.ts`; toasts use `client/lib/toast.ts`.
- Business copy uses `$t()` from `client/i18n`, with the original Chinese text as the key and English translations in `client/i18n/en.json`. Business navigation uses `nocoreach.nav.*` in `client/locales/`; the shell and administration pages use application locales and overrides for official namespaces. Do not apply template copy conventions directly to legacy business pages.
- Internal imports use `package.json#imports` mappings such as `#components/*`. Directory entry points explicitly target `index`; do not add Vite aliases or TypeScript paths.
- When users refer to UI annotations, marks, or selections, first run `pnpm exec agent-annotations list --json` from the application root. Ask only if no record matches or the target remains unclear. Do not implement changes when the user only asks where annotations are.

### Routes, identity, and shell

- Business routes are declared in `client/nocoreach-routes.ts` and guarded by membership and project checks in `client/pages/nocoreach-page.tsx`. Business pages use `authz: 'skip'`; official Agents pages retain plugin grants. APIs independently enforce NocoReach business authorization.
- All pages use `defineAppRoutes()`. `defineAdministrationRoutes()` in `client/pages/settings/routes.ts` declares ordinary `/settings/...` routes rendered by the application's `SettingsLayout`. Do not call the removed `defineSettingsRoutes()` or `defineDevRoutes()`, or assume `/dev` is automatically excluded from production builds.
- Settings navigation selects `/settings` routes from `useClientApplication().runtime.routes`; show its entry only when an administration page is accessible. The application owns administration page source while preserving original authorization resource IDs. Menus use `management.*`; page copy uses overrides for the original plugin namespaces. Import official services and tokens rather than copying token creation code.
- NocoReach identity and request caches belong in the authenticated subtree of `client/routing/app-router.tsx`, using official session boundaries and authorization revisions. Do not move them to the application provider layer. Failed identity reads or missing roles grant no access. Isolate persisted reports by user/session/revision; requests from unmounted components must not write back.
- Preserve sign-out error checks and notifications, permission snapshot clearing on account changes, and page rechecks triggered by authorization revisions. Hide protected content while checks are pending or have failed.
- Layouts render breadcrumbs; pages only declare their trails. The project switcher lives in `client/layouts/app-layout.tsx`. App and Settings share the desktop collapse preference `nocobase:sidebar:collapsed`; mobile menu state remains local. Preserve permission filtering, group expansion state, collapsed tooltips/popovers, and keyboard interaction.

### Themes and components

- Use existing shadcn/ui components and semantic theme tokens. Add missing primitives through the CLI rather than rewriting generated components. Page overlays use route components; read the [overlay reference](../.agents/skills/nocobase-app-development/references/frontend/references/overlay.md) first.
- `client/theme/presentation.css` adapts official `data-slot` components and legacy `.nr-page` tables outside generated components. App and Settings share `app-brand-surface`. Preserve NocoReach branding, semantic Tag colors, both densities, and browser preferences; do not restyle one page independently.
- Calculate task table minimum width from spacing units needed by fixed columns and the title column, preventing single-character wrapping in comfortable density. Mobile headers retain compact branding, project icons, and smaller button gaps. Show breadcrumbs at sm and above; retain full project names in the switcher menu and accessible text.

## Backend and data

Follow the application Skill references for [routes](../.agents/skills/nocobase-app-development/references/server-routes.md), [HTTP contracts](../.agents/skills/nocobase-app-development/references/http-api.md), [services](../.agents/skills/nocobase-app-development/references/services-and-jobs.md), and [data access](../.agents/skills/nocobase-app-development/references/database-and-data.md). Database APIs are documented in the [database Skill](../.agents/skills/nocobase-db/SKILL.md).

### Compatibility layer and authorization

- `server/nocoreach/*.ts` contains ported classic services, retaining dense formatting and `// @ts-nocheck`. Put NocoBase 3 adaptations in `server/nocoreach/legacy/` and business behavior in services. Do not rewrite the entire compatibility layer as incidental cleanup.
- The compatibility layer rebuilds repositories, filters, transactions, resource actions, timers, and other classic interfaces. Classic advisory locks use keyed in-process locks. Store settings in `nrVariables` and seal secrets. Users come from NocoBase 3 accounts; transactional reads use the caller's connection.
- `server/providers/nocoreach.ts` assembles the layer and manages timers. `server/routes/nocoreach.ts` dispatches `/api/nocoreach/<resource>/<action>`. Each action checks administrator/member eligibility in `nr-members` through `server/nocoreach/policy.ts`; root users are always administrators. Page or collection grants do not replace business authorization.
- Notifications use the official Notification plugin and its configured in-app channel; inbox adaptation lives in `legacy/notifications.ts`. Daily analysis is the Scheduler target `nocoreach.daily-analysis`, with runs visible at `/settings/schedules`. `pm.get('workflow')` and `workflows` are compatibility names in `legacy/schedule.ts`; official Workflow was removed and must not be reintroduced.
- Server routes own their authorization; page `auth`/`authz` is not server protection. Register background work through providers rather than directory discovery.

### Transactions and synchronization

- SQLite uses one connection. Do not wait for another database connection inside a business transaction. Legacy online tasks explicitly pass `tx.connection` when reading the Agents default model; user reads also use the caller's transaction.
- Google sync claims work in a short transaction, collects outside transactions, then validates and commits in another short transaction. Never wait for OAuth or Google APIs while holding a transaction. A single-instance `busy` guard protects in-flight batches. Pausing cancels the old batch; its results must not be committed even if immediately resumed. Limit collection to two minutes per batch and retain bounded retries.
- `transactionContext()` in `legacy/database.ts` isolates snapshot caches and construction promises. A transaction must neither wait for snapshot construction outside its scope nor publish uncommitted results to shared caches.
- Do not edit executed migrations or migration history tables to silence checksum errors. Collection files are generated caches; see the [migration reference](../.agents/skills/nocobase-app-development/references/migrations.md). Preserve compiled migration and seed `.manifest.json` generation; do not regenerate manifests for installed dependencies.

## Outbound networking

When changing collection, OAuth, connection tests, or project-scoped background network calls, check this section and the transaction constraints above.

- `server/nocoreach/proxy-profiles.ts` seals global Profiles and project/connection references together in `nrVariables`. `outbound-network.ts` uses instance-scoped AsyncLocalStorage. Inject this transport layer into new collection services. Wrap all project-ID-bearing background/internal entry points in `network.bind`; URL-only previews inherit project scope from the route.
- Explicitly pass the project fetcher to Google OAuth/sync. Derived Google/DataForSEO features share the actual connection's settings. Project icon homepage and image requests share the website egress. Connection selection lives in `client/components/connection-network.tsx`; Profile management lives in `client/pages/proxy-profiles/`.
- Fixed APIs reuse bounded pools by origin and Profile version; public fetching and connection tests use separate dispatchers. Do not change global fetch/dispatchers or Studio environment variables. Profile updates send new requests through new connections; release old connections after in-flight requests finish. Close pools on application shutdown.
- Public fetching must use `download` public-IP validation and fixed-IP tunnels while retaining TLS verification for the original hostname. Proxy failures must not fall back to direct connections.
- `socks-proxy.ts` establishes SOCKS tunnels: `socks5` resolves locally and `socks5h` through the proxy. Public fetching connects to validated IPs with either protocol. Clean up sockets during connection establishment and retain bounded pools.
- Runner and online AI do not use these proxy settings. Do not turn them into a host-wide network policy.

## Task execution

Read the [Agents plugin Skill](../.agents/skills/nocobase-app-plugin-agents/SKILL.md) first. Agent, Runner, model, and usage pages reuse the official plugin. Manage models and keys through official model management; business model calls use `online.gateway`. The legacy local program and key protocol were removed; do not restore legacy credential migration.

### Enqueueing, selection, and retries

- `server/nocoreach/execution/agents-runtime.ts` registers the `nocoreachTask` subject. Enqueue official runs inside the business transaction, emit events after commit, and synchronize results through `pluginRunId`. Keep review, revision, and cancellation checks in business services.
- `nr-task-agent:<project>` stores the default shared Agent and repository constraints; `/project-ai` manages the project default. Task `evidence.work.agentId` overrides the default. Record the actual Agent ID/name in each business run. Only the owner or an administrator may reassign, and never while queued, running, completed, or closed.
- Research and drafts may use Online or Runner; tasks involving repository changes reject Online. Evaluate readiness using the current user's official eligibility. Read models and Runners outside business transactions to avoid single-connection deadlocks.
- Manual takeover uses `runs.withdrawQueued` in the same transaction to exclude simultaneous official claiming. The read-only subject `assemble` must not change business state. Cancellation must complete even when the Agent is unavailable; record failed PR cleanup and instruct the user to close it manually.
- `server/app.ts` registers `server/routes/agent-retry-guard.ts` before plugin routes, blocking generic HTTP/CLI retry only for `nocoreachTask`. Business retries must go through TaskService to check stage and review state and create new input snapshots. Copying the old subject into a new official run bypasses those checks. Replace this guard only when upstream `SubjectBinding` provides an equivalent retry extension point; other subjects retain official behavior.

### Capabilities, materials, and sources

- `execution/task-business.ts` provides business capabilities, presets, and run-specific `task data` / `task draft` commands. Validate capability grants, caller/owner eligibility, revision, and run state together. `task draft --content-file` accepts complete multiline drafts and stages them without advancing the workflow stage.
- `execution/task-materials.ts` delivers materials through official mounts. Keep bodies in immutable business input snapshots; `nr-task-materials:<pluginRunId>` only references the snapshot. Preserve file locations in prompts. Deliver knowledge and Skills with the input snapshot.
- Paginate long materials by offset. Online uses separate budgets for task context, knowledge, Skills, and sources; Runner retains complete mounts. Do not let a shared budget crowd out other materials.
- `execution/community-materials.ts` reads original posts and replies from configured forum connections. Use official briefs prepare outside the claiming transaction to create immutable source snapshots. Limit access to configured forum domains, five topics, 100 posts per topic, and a total body budget. Record missing/truncated content with stable codes and parameters, translate it in the UI, and retain readable explanations for the Agent. Do not relax Runner local tool policies. Isolate sources and candidate drafts by business run.
- `allowedPaths: []` permits the entire repository with no additional directory restriction. Nonempty values permit only matching files or files within matching directories. Keep Runner instructions, repository settings, and `allowedPath()` validation consistent while preserving task scope, repository rules, and Runner policies.

### Results and execution records

- Task pages reuse official `RunHeader` / `RunTranscript`, selecting historical runs through `?run=`. Only participants and administrators may read transcripts. Show the actual model/Runner, tool inputs/outputs, and permission denials. Business failures take precedence over tool-turn completion.
- Validate `report.kind` separately for research, community replies, and content results. Preserve `sources`, `asOf`, and `uncertainties` before human review. `report.asOf` allows up to 1000 characters; do not truncate timing notes covering multiple sources. Instructions and validation share the limit, and oversized-result errors identify the field and limit.
- `execution/agent-result.ts` manages result validation and Runner instructions. Build results must include release notes, page validation evidence, and change comparisons, returning explicit empty values when verification is unavailable.
- Business tests live in `tests/nocoreach/`. `agents-app.test.ts` covers the official Runner protocol against real plugins and a database. Check relevant coverage when changing enqueueing, materials, cancellation, retries, or CLI distribution.

## Upgrades and releases

Read the [application upgrade Skill](../.agents/skills/nocobase-app-upgrade/SKILL.md) before upgrades and the [deployment Skill](../.agents/skills/nocobase-deployment/SKILL.md) before building deployment packages or investigating production issues. Read the [CLI reference](../.agents/skills/nocobase-app-development/references/cli.md) before running `pnpm nocobase` commands. The following points differ from the general workflow.

### Template and dependencies

- The full template source marker is `nocobase.defaultTemplateVersion: 1.0.0-beta.58`. Subsequent selective dependency, theme, and compatibility changes are not full template upgrades. Do not overwrite this application with a fresh template or advance the marker without a corresponding source upgrade.
- Hub CLI and official Workflow were removed; do not restore them for releases or business features. AI employee, local Agent, and configuration references in old port records are historical.
- Declare runtime dependencies in `dependencies`; client libraries, build tools, and type-only dependencies in `devDependencies`. All application plugins, including client-only and disabled plugins, still belong in `dependencies`. Keep `@nocobase/db` and its driver as runtime dependencies. Synchronize manifests and the lockfile; client/server/cli composition roots remain authoritative for plugin registration.

### CLI and Runner distribution

- Application-owned `afterServerBuild` hooks in `cli/plugins.ts` build both the NocoReach CLI and Runner universal archives into `dist/runners`. Do not build only in local storage and omit them from deployment packages. Rebuild both distribution products when deploying dependency upgrades.
- `server/config/agents.ts` resolves the distribution directory relative to the configuration module. Do not assume Studio's rootDir is dist. Explicit `agents.dist.dir` overrides remain supported. Before deployment, confirm the actual distribution directory contains matching manifests and archives.
- Fix the Runner application identity and CLI name to `nocoreach`, matching `package.json`'s `nocobase.cli.bin` and published archives. Do not derive them from `/main` or the deployment path.
- Validate distribution by downloading into an empty cache, verifying, unpacking, and executing. Verify embedded Studio deployments through the actual application; standalone success does not establish correct host paths. See the [CLI distribution record](CLI-DISTRIBUTION-beta63.md) for steps and historical context.

### Configuration and static assets

- Do not hard-code deployment prefixes in routes. Use `resolveAppUrl` for pages, APIs, and dynamic artifacts, and `resolveAssetUrl` for static files. Use shared `AppPaths` on the server and preserve configuration, host logging, and lifecycle binding through `createAppFromRuntime(runtime)`.
- The browser origin must match `app.publicOrigin` / `APP_PUBLIC_ORIGIN`. Do not disable origin checks to resolve authentication failures. Writes through a remote development proxy affect the target backend.
- `CDN_BASE_URL` is a build variable requiring a full HTTPS URL and trailing `/`. It defaults to `./` and is ignored in development. Precedence is process environment, `.env.local`, then `.env`. Upload the complete `dist/client/` assets and configure CORS; the application server still retains its client directory and HTML injection. Docker source builds use the same build-arg name; runtime changes cannot alter compiled asset URLs.
- Development watching excludes this application's entire `dist/`, but not linked workspace dependencies. Auxiliary Vite tests use isolated temporary `cacheDir` values; never clear or rewrite the cache of a running development server.

### Classic data import

`pnpm nocobase app import-classic` is implemented in `cli/commands/import-classic.ts`. Run it on a machine that can access classic Postgres through `CLASSIC_DB_*`. It calls the target application's `nrImport` actions over HTTP with a root user's `NOCOREACH_API_KEY`, rather than connecting directly to Studio's database. Decrypt classic secrets on the source machine and reseal them at the target. Import is a separate data migration task, not a routine deployment step; consult the [port record](PORT-PLAN.md) before proceeding.
