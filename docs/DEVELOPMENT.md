# NocoReach Development Constraints

This document covers application adaptations to the template and business boundaries prone to regressions. Read the relevant sections when changing those features. Follow the [application development Skill](../.agents/skills/nocobase-app-development/SKILL.md) and its references for general development; explicit application adaptations below take precedence over template examples.

See the [changelog](../CHANGELOG.md) and [port plan](PORT-PLAN.md) for historical context. Legacy Agent and AI configuration, deployment steps, and outstanding items in the port plan reflect their time, not current implementation requirements. Dependency versions come from `package.json` and the lockfile.

## Frontend

Before changing `client/`, read the [frontend workflow](../.agents/skills/nocobase-app-development/references/frontend/ui-workflow.md) for task-specific component, styling, interaction, and validation guidance. Preserve the application differences below.

### Business pages and copy

- Ported business pages and components live in `client/pages/` and `client/components/`. Requests use the `nocobaseClient.action()` contract in `client/lib/nocoreach-api.ts`; toasts use `client/lib/toast.ts`.
- Business copy uses stable, module-scoped English semantic keys (`common.save`, `playbooks.communityReplyInstruction`, `dataHealth.retryScheduled`). Use lower camelCase segments, reuse only the same meaning/context, and keep keys stable when wording changes. Do not use Chinese keys, whole sentences, hashes, or numbered identifiers. Both translations live in `shared/i18n/en.json` and `zh.json`, registered in the application client/server locales. Preserve translation values, numeric `{0}` interpolation, and intentionally empty measure words. Business pages use `$t()` / `$tj()` from `client/i18n`; deferred messages still follow the application runtime's resolved locale.
- `shared/i18n/legacy-keys.json` is a compatibility manifest for pre-migration system text, not the active dictionary. `$t()` does not resolve Chinese aliases. Only `$legacyText()` / `$legacyJsx()` at historical API/snapshot boundaries may read them. Keep custom/edited playbooks, user names, queries, notes, and interpolation values literal. Dynamic keyword groups retain their persisted Chinese identities and map explicitly to semantic display keys. Glossary lookups accept original server metric labels and translated display labels; these lookup identities are not translation keys.
- This translation migration does not change database fields, task status values, URL semantics or persisted message formats. Do not introduce data migrations or serialized message markers for i18n. Keep server error messages, codes and control-flow predicates unchanged; use response metadata and presentation mappings to translate existing dynamic system text.
- Server-owned copy is emitted with `systemMessageText(semanticKey, params)`. The Chinese default preserves existing stored/display text and older clients. Data-health `*Text.key` metadata now carries semantic keys while the legacy fields retain their original Chinese values. API errors preserve status, reason and raw message, and add semantic metadata when recognized; the request adapter re-renders that key when language changes. Historical rendered text, built-in playbook snapshots, audit/analysis labels, and old errors are read through the explicit compatibility manifest/pattern reader. Do not rewrite executed migrations or stored user data for key renames.
- Business navigation keeps its existing `nocoreach.nav.*` keys in `client/locales/`; shell and administration copy retains application locales and official namespace overrides. Upstream plugin keys are outside this migration. Run semantic locale coverage and affected bilingual component/server tests when changing copy; coverage rejects Chinese keys and checks both resources, legacy aliases and interpolation parity.
- Internal imports use `package.json#imports` mappings such as `#components/*`. Directory entry points explicitly target `index`; do not add Vite aliases or TypeScript paths.
- When users refer to UI annotations, marks, or selections, first run `pnpm exec agent-annotations list --json` from the application root. Ask only if no record matches or the target remains unclear. Do not implement changes when the user only asks where annotations are.

### Routes, identity, and shell

- Business routes are declared in `client/nocoreach-routes.ts` and guarded by membership and project checks in `client/pages/nocoreach-page.tsx`. Business pages use `authz: 'skip'`; official Agents pages retain plugin grants. APIs independently enforce NocoReach business authorization.
- All pages use `defineAppRoutes()` and the single `AppLayout`. The retired `/settings` UI, administration routes, and dedicated source are removed; unmatched URLs follow the normal home fallback. Keep backend plugin services and stored authorization independent of UI availability. Do not restore `defineSettingsRoutes()`, `defineDevRoutes()`, or a second administration shell.
- NocoReach identity and request caches belong in the authenticated subtree of `client/routing/app-router.tsx`, using official session boundaries and authorization revisions. Do not move them to the application provider layer. Failed identity reads or missing roles grant no access. Isolate persisted reports by user/session/revision; requests from unmounted components must not write back.
- Preserve sign-out error checks and notifications, permission snapshot clearing on account changes, and page rechecks triggered by authorization revisions. Hide protected content while checks are pending or have failed.
- Task drafts share the authenticated session boundary. Keep their navigation guard beside the authenticated Outlet so guest/optional history navigation cannot silently destroy drafts after leaving a task page. Retained stage drafts belong to their original artifact; show older drafts for comparison instead of rebinding them to a newer artifact/revision. Keep task mutations mounted until they settle.
- Layouts render breadcrumbs; pages only declare their trails. The project switcher lives in `client/layouts/app-layout.tsx`. App uses the desktop collapse preference `nocobase:sidebar:collapsed`; mobile menu state remains local. Preserve permission filtering, group expansion state, collapsed tooltips/popovers, and keyboard interaction.

- NocoReach retains its header inbox shortcut and unread title badge as application-owned UI; the upstream template no longer supplies that entry. Keep its notification permission and session checks.

### Themes and components

- Use existing shadcn/ui components and semantic theme tokens. Add missing primitives through the CLI rather than rewriting generated components. Page overlays use route components; read the [overlay reference](../.agents/skills/nocobase-app-development/references/frontend/references/overlay.md) first.
- `client/theme/presentation.css` adapts official `data-slot` components and legacy `.nr-page` tables outside generated components. App retains `app-brand-surface`. Preserve NocoReach branding, semantic Tag colors, both densities, and browser preferences; do not restyle one page independently.
- Calculate task table minimum width from spacing units needed by fixed columns and the title column, preventing single-character wrapping in comfortable density. Mobile headers retain compact branding, project icons, and smaller button gaps. Show breadcrumbs at sm and above; retain full project names in the switcher menu and accessible text.

## Backend and data

Follow the application Skill references for [routes](../.agents/skills/nocobase-app-development/references/server-routes.md), [HTTP contracts](../.agents/skills/nocobase-app-development/references/http-api.md), [services](../.agents/skills/nocobase-app-development/references/services-and-jobs.md), and [data access](../.agents/skills/nocobase-app-development/references/database-and-data.md). Database APIs are documented in the [database Skill](../.agents/skills/nocobase-db/SKILL.md).

### Compatibility layer and authorization

- `server/nocoreach/*.ts` contains ported classic services, retaining dense formatting and `// @ts-nocheck`. Put NocoBase 3 adaptations in `server/nocoreach/legacy/` and business behavior in services. Do not rewrite the entire compatibility layer as incidental cleanup.
- The compatibility layer rebuilds repositories, filters, transactions, resource actions, timers, and other classic interfaces. Classic advisory locks use keyed in-process locks. Store settings in `nrVariables` and seal secrets. Users come from NocoBase 3 accounts; transactional reads use the caller's connection.
- `server/providers/nocoreach.ts` assembles the layer and manages timers. `server/routes/nocoreach.ts` dispatches `/api/nocoreach/<resource>/<action>`. Each action checks administrator/member eligibility in `nr-members` through `server/nocoreach/policy.ts`; root users are always administrators. Page or collection grants do not replace business authorization.
- Notifications use the official Notification plugin and its configured in-app channel; inbox adaptation lives in `legacy/notifications.ts`. Daily analysis is the Scheduler target `nocoreach.daily-analysis`, with runs available through the official Scheduler API/CLI. `pm.get('workflow')` and `workflows` are compatibility names in `legacy/schedule.ts`; official Workflow was removed and must not be reintroduced.
- Server routes own their authorization; page `auth`/`authz` is not server protection. Register background work through providers rather than directory discovery.

### Transactions and synchronization

- SQLite uses one connection. Do not wait for another database connection inside a business transaction. Legacy online tasks explicitly pass `tx.connection` when reading the Agents default model; user reads also use the caller's transaction.
- Google sync claims work in a short transaction, collects outside transactions, then validates and commits in another short transaction. Never wait for OAuth or Google APIs while holding a transaction. A single-instance `busy` guard protects in-flight batches. Pausing cancels the old batch; its results must not be committed even if immediately resumed. Limit collection to two minutes per batch and retain bounded retries.
- `transactionContext()` in `legacy/database.ts` isolates snapshot caches and construction promises. A transaction must neither wait for snapshot construction outside its scope nor publish uncommitted results to shared caches.
- Do not edit executed migrations or migration history tables to silence checksum errors. Collection files are generated caches; see the [migration reference](../.agents/skills/nocobase-app-development/references/migrations.md). Preserve compiled migration and seed `.manifest.json` generation; do not regenerate manifests for installed dependencies.

### Simulated integrations

- `app-plugins/nocoreach-mock` is an explicitly requested independent package boundary, registered from source in `server/plugins.ts`. It is disabled by default and may run only against a fresh, dedicated demo/test database and storage. Explicitly disable both `agents.server.enabled` and `agents.vectors.store`; reject existing business data or credentials on first activation.
- Consume raw fixtures through instance-scoped transports, production media adapters, and explicit business AI operations. Retain real authentication, parsing, jobs, persistence, and business checks. Never replace global fetch, bypass production public-IP validation, or fall back to live upstream services. Unknown targets and unsupported operations fail closed; disabling simulation for one project blocks its upstream requests rather than enabling live traffic.
- Block real model calls, Runner execution, and external writes. Allow only in-app notification channels. Before providers start, validate that the selected `jobs.default`, `scheduler.jobs`, and `notification.jobs` queues resolve to process-local memory configurations, never shared workers. These are application integration boundaries, not a process-wide network sandbox.
- Capture an immutable project-scoped settings snapshot for every operation; Google queued jobs persist it across queue and process boundaries. Preserve cancellation and late-write rejection when settings change. The permanent simulated-dataset marker prevents restarting the same database with simulation disabled. Reset restores only the scenario, preserving project availability, seed, clock, business data, credentials, and active runs.
- Register `/mock-integrations` in the NocoReach settings group through the host component and authorization adapters. The settings form is administrator-only; ordinary members see an access explanation, retain the simulated-data banner on business pages, and can read project status through `/api/nocoreach/nrMock/status`. Only administrators may call `configure` or `reset`; preserve server-side membership and project checks and the global simulated-data marker.
- Keep provider coverage, finite fixture bounds, deployment precautions, and acceptance steps in [MOCK-DATA.md](MOCK-DATA.md). New provider, background, AI, or external-write entry points require explicit isolation and tests proving they do not call real upstream I/O. Mock results do not verify real provider availability, credentials, extraction tools, or network security.

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

- The full template source marker is `nocobase.defaultTemplateVersion: 1.0.0-beta.67`; see the [three-way upgrade record](TEMPLATE-UPGRADE-beta67.md). Do not overwrite this application with a fresh template or advance the marker without a corresponding source merge.
- `README.md` and its `README.zh-CN.md` / `README.ja-JP.md` translations introduce the product and are application-owned. The template's README lives in [APP-TEMPLATE.md](APP-TEMPLATE.md); merge upstream README changes there.
- README images are kept in `docs/images/readme/` and `public/assets/` but linked through jsDelivr (`https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/<path>`), because GitHub serves repository images from `raw.githubusercontent.com`, which is often unreachable from mainland China. After replacing an image under the same name, purge it at `https://purge.jsdelivr.net/gh/nocobase/NocoReach@main/<path>`.
- Hub CLI and official Workflow were removed; do not restore them for releases or business features. AI employee, local Agent, and configuration references in old port records are historical.
- Declare runtime dependencies in `dependencies`; client libraries, build tools, and type-only dependencies in `devDependencies`. All application plugins, including client-only and disabled plugins, still belong in `dependencies`. Keep `@nocobase/db` and its driver as runtime dependencies. Synchronize manifests and the lockfile; client/server/cli composition roots remain authoritative for plugin registration.

### Continuous integration

- `.github/workflows/ci.yml` runs independent `tests` and `build` checks on pull requests, `main` pushes, and manual runs using Ubuntu 24.04, Node 24, and the pnpm version in `packageManager`. Both jobs use frozen dependency installation. Tests run with two workers and fail if no tests are found; the build targets Linux x64 and includes the existing CLI/Runner build hooks.
- CI reports pass/fail status and execution logs directly in GitHub. It does not upload artifacts or deploy the application; no Studio credentials are required. Repository administrators can require the `tests` and `build` checks before merging.
- `.github/workflows/deploy-studio.yml` is a separate, manual-only deployment path for `main`. It tests and builds the dispatched commit on one runner, then uses pinned `nb-studio` to upload directly to the `nocoreach` app, track deployment or approval, and verify release identity and health. It uses the `studio` GitHub environment and never stores GitHub Artifacts.

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
