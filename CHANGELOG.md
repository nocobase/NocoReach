# NocoReach Changelog

## Unreleased — PM-276

- Reuse the sidebar-footer shield slot for demo status without adding a footer row.
- Replace the global demo banner with a compact sidebar-footer indicator, with localized hover/focus details and scoped status refresh.

- Reconcile the default template from beta.58 to beta.67, align shared NocoBase dependencies, and register Mail with empty providers.
- Remove the retired `/settings` administration UI and dead member-page shortcut while preserving backend services, authorization, NocoReach identity, and CLI/Runner distribution.
- Adopt password-reset capability checks, localized sign-out errors, accessible theme controls, shared component fixes, and template locale layering.
- Preserve application-owned branding, business homepage, inbox shortcut, session boundaries, and historical migrations. See `docs/TEMPLATE-UPGRADE-beta67.md` for the full three-way inventory.

Record significant changes affecting usage, upgrades, or maintenance, with links to detailed records. Not every task needs an entry. Versions refer to NocoReach application releases unless explicitly identified as template or dependency versions. See the [development guide](docs/DEVELOPMENT.md) for current constraints; historical entries do not replace current rules.

## Unreleased

- Retain task text drafts across in-app navigation within the authenticated session, isolate drafts by project/task/editor, and clear only the saved or discarded area (PM-281). Refresh and close remain protected while any draft is pending.
- Bind retained task drafts to their source artifact, expose earlier and closed-task drafts for recovery, guard authentication-boundary navigation, and keep pending saves mounted. Confirm draft deletion before removing text and separate hooks from components without lint suppressions. Restore affected locale test callers and allow new semantic copy without fabricated historical aliases.
- Stabilize the affected Agent reassignment regression by opening the selected dropdown with its keyboard interaction and waiting for the option before asserting failed-save behavior.
- Navigate the application brand directly to the insights landing page so retained task drafts prompt once, without a cancellable root redirect leaving an empty page.
- Enable browser sign-in for the branded NocoReach CLI and add a bilingual account-menu setup dialog with short-lived download instructions. Preserve existing account permissions and served CLI distribution.

- fix: Classify daily analysis failures at the model preparation boundary and show permission-aware model setup guidance instead of billing uncertainty for missing configuration (PM-289).
  Validate model credentials before invocation and keep configuration guidance distinct from transient preparation failures.

- Keep task titles fully readable and row actions reachable in medium and phone layouts; collapse secondary columns according to available list width while retaining the full desktop table (PM-290).

- Mark discovered sources using saved project connections, disable already connected selections, and require explicit selection before replacing singleton sources and clearing their history (PM-325).

- Provide project-scoped Insights, Opportunities, and personal pending-task navigation counts using the existing page predicates. Isolate count state by session and project, reject stale/invalid responses, refresh after decisions and task changes, and remove silent task-count/list truncation. Render the three menu counts with shared solid orange, right-aligned badges and dark digits (single-digit circles and multi-digit capsules), hiding zero/unknown counts and retaining count meaning in collapsed navigation accessibility and tooltips. [Count contract](docs/NAV-BADGES.md)

- fix: distinguish independent insight request failures from empty results, retain stale data with section retries, reset project-scoped page state, and discard cached results after authorization or not-found responses. Preserve paused report snapshots while editing date ranges within the same session (PM-282).

- Isolate Trends, Community, Reddit, Hacker News, Packages, X, and Chat collector runs by project. Coalesce duplicate operations, preserve each queued request's settings context, retain pending project work, bound each source’s upstream requests, and discard cancelled results while preserving billed X usage. Keep connection probes and their configuration writes within the same lifecycle, retain paid probe accounting during cancellation, and distinguish brand refreshes from full keyword checks. Keep new work blocked until disconnect changes are committed; report rejected background submissions and cancelled queued connections as cancellations. Fence Trends keyword additions and competitor selections before configuration writes, including cancellation while waiting for the write lock (PM-283).

- Preserve the insights waiting-task scope when opening the task list, sharing ownership and lifecycle filtering with an explicit URL-backed scope (PM-288).

- Add a manual-only Studio demo deployment workflow targeting `nocoreach-demo`, sharing the existing tested archive upload and verification path with the main deployment. Keep independent target URLs and concurrency; remove the dated demo deployment report.

- Gate mock settings navigation and routes on server-published deployment configuration. Allow real Agent configuration and execution in demo deployments while completing reviewed releases as explicitly simulated, without merge/revert runs or live-effect tracking. Retire the application-level `agents.server.enabled` switch: existing false overrides no longer block Online Agents, with startup and shutdown ownership preserved through the official executor. [Deployment guidance](docs/MOCK-DATA.md)
- Automatically initialize a persistent NocoBloom demo project in isolated mock deployments, with every available source connected by default, including the repository target, confirmed Google resources, source histories, SEO and AI research, 36 tasks, 108 comments, 18 synthetic deliverables, and project knowledge. Resume incomplete phases after failures without rewriting completed data; support `nocoreachMock.initializeData: false` for empty test fixtures. [Demo initialization](docs/MOCK-DATA.md#自动初始化演示项目)
- Rewrite the README as a product introduction in English, Chinese and Japanese with screenshots from simulated data; move the template's README to [docs/APP-TEMPLATE.md](docs/APP-TEMPLATE.md), license the project under Apache-2.0, and shorten English menu labels that wrapped or were cut off.

- Correct mock-acceptance source status and read-only controls: show actionable disabled-project errors, retain Reddit failure and data-cutoff history, record Bilibili cancellation, include all 28 completed package-download days, hide administrator-only memory actions from members, and translate recognized persisted source errors without altering user values, including malformed package responses. [Browser acceptance evidence and limits](docs/qa/mock-acceptance-2026-10-12.md) · [Final route and fixture follow-up](docs/qa/mock-acceptance-2026-10-12.followup.md)

- Preserve template beta.67 and ReplyDrafts fixes when integrating simulated data. In mock mode, retain Mail migration metadata while suppressing Mail workers and routes, rejecting enabled providers and non-local queues to preserve the no-outbound boundary.
- Migrate 4,733 business translations to module-scoped English semantic keys with explicit Chinese and English resources shared by the client and server. Update static callers, dynamic display mappings, health metadata and server message generation; retain original wording, interpolation and historical system-text compatibility without rewriting stored user data or executed migrations. Add coverage against Chinese translation keys and locale drift. Preserve task status values, persisted message formats, simulated-data isolation and Mail boundaries; no database migration is required.

- Persist YouTube research videos by project and video ID, append discoveries, and preserve last valid metrics and captions with their read times. Keep saved records across changed criteria, disconnected sources, failed reads, and elapsed time. Migrate surviving snapshots and provide paginated browsing and an explicit administrator-only delete action. The data migration is irreversible to prevent dropping durable records during rollback; downgrade requires a pre-upgrade backup. Source discovery remains capped and does not guarantee newest results. [Storage and provider boundaries](docs/YOUTUBE.md)
- Render review reply drafts with the same safe Markdown preview as execution records, preserving source text and explicitly labeling Markdown source copying (PM-286).
- Add GitHub Actions test and build checks for pull requests, main pushes, and manual runs, reporting pass/fail status and logs directly in GitHub.
- Add a `main`-only Studio deployment workflow, triggered automatically on pushes and optionally by manual dispatch, that tests and builds one commit, uploads its archive directly with `nb-studio`, and reports approval requests or verified deployment results without GitHub Artifact storage.
- Stabilize locale regression tests by waiting for the Agent picker to open and validating legacy aliases against current bilingual resources as the compatibility map grows.

- Add the opt-in NocoReach mock integration package for isolated demo/test deployments, retaining production parsers and persistence while blocking live upstream I/O. Provide administrator-only scenario controls, member-readable status, and simulated-data banners. [Deployment, coverage, and verification](docs/MOCK-DATA.md)
- Correct four issues found during mock integration QA:
  - Include consistent DataForSEO ranked-keyword summary metrics, with zero totals for the empty scenario.
  - Return distinct GitHub popular paths for the repository, README, SKILL, and issues, and no paths for the empty scenario.
  - Fix inherited report date filters for calendar-string partitions and error handling: propagate genuine failures, normalize HTTP error statuses, and reject error envelopes before client report caching.
  - Keep connection-sheet dismissal below header hover-menu triggers so closing a sheet does not open a menu beneath a stationary pointer.
- Simplify the root `AGENTS.md` to core rules, task-specific references, and validation requirements. Move application constraints to `docs/DEVELOPMENT.md` and maintain historical changes here.
- Make `CLAUDE.md` reference only `AGENTS.md`. Keep general framework tutorials in dependency-provided Skills instead of duplicating them in root guidance. Maintain developer guidance, changelogs, PR metadata, and commit messages in English.

## Recent fixes

- Allow up to 1000 characters in `report.asOf` for timing notes covering multiple sources. Task instructions and validation share the limit; oversized results identify the field and limit. [PR #18](https://github.com/nocobase/nocoreach/pull/18)
- Clarify that `allowedPaths: []` permits the entire repository. Keep Runner instructions consistent with repository settings and server validation. [PR #17](https://github.com/nocobase/nocoreach/pull/17)

## beta.62–beta.64: Runner protocol and CLI distribution

- beta.62: Upgrade to Agents beta.7, Runner beta.6, and CLI Client beta.4, sharing agent-protocol beta.5 and supporting protocols 3–9. This updates dependencies; the full template source marker remains beta.58. [Upgrade and validation record](docs/DEPENDENCY-UPGRADE-agents-protocol9.md)
- beta.63: Include NocoReach CLI and Runner universal archives and manifests in `dist/runners` during application builds. This fixes Studio deployments omitting the CLI and falling back to preinstalled mode.
- beta.64: Resolve the distribution directory relative to the configuration module, fixing incorrect paths caused by different Studio and standalone root directories. Preserve explicit `agents.dist.dir` overrides. [Distribution and host path record](docs/CLI-DISTRIBUTION-beta63.md)

## beta.61: Dependencies and theme adaptation

- Use default beta.61 as the dependency reference and adapt to app-client 3. Remove Hub CLI and official Workflow. Maintain administration page source in the application while retaining original authorization resources and official service tokens. The full template source marker remains beta.58. [Dependency upgrade](docs/DEPENDENCY-UPGRADE-beta61.md), [deployment record](docs/DEPLOYMENT-beta61.md)
- Selectively adopt the blue primary color, navigation, table headers, and overlay styles across official components and legacy business pages. Preserve branding, semantic colors, density, and browser preferences; fix comfortable-density task tables and mobile headers. [Theme adaptation](docs/THEME-UPGRADE-beta61.md)
- Move identity and request caches into the authenticated subtree. Isolate persisted reports by user, session, and authorization revision; reject writes from stale requests. [Commit 2f9d87f](https://github.com/nocobase/nocoreach/commit/2f9d87f)

## beta.58 and subsequent business adaptations

- Upgrade to template beta.58 and integrate official Agents/Runner, removing the legacy local Agent protocol. Projects and tasks can select shared Agents; research and drafts support Online or Runner, while repository changes require Runner. [Upgrade record](docs/UPGRADE-beta.58.md), [deployment record](docs/DEPLOYMENT-beta.58.md)
- Deliver task materials, knowledge, and Skills through immutable input snapshots; prepare forum sources for community replies and use official execution components on task pages. Preserve business review, cancellation, and retry boundaries. [Business adaptation record](docs/PORT-PLAN.md#%E4%B8%9A%E5%8A%A1-agent-%E9%80%82%E9%85%8D%E4%B8%8E%E6%89%A7%E8%A1%8C%E5%8F%AF%E8%A7%81%E6%80%A72026-10-11)
- Add proxy Profiles selected per project and connection, supporting HTTP, HTTPS, SOCKS5, and SOCKS5H. Public fetching retains public-IP validation and fixed-IP tunnels. [Proxy record](docs/PORT-PLAN.md#%E4%BB%A3%E7%90%86-profile2026-10-10)
- Claim and commit Google sync batches in short transactions, with collection outside transactions. Isolate snapshot caches from transactions to prevent single-connection database blocking. [PR #8](https://github.com/nocobase/nocoreach/pull/8)

## Initial port (2026-10-09)

Move the classic NocoBase plugin and portal to a NocoBase 3 application that runs on Studio. Preserve business services and pages through a compatibility layer for databases, users, notifications, and Scheduler. Provide a one-time classic data import command; the initial deployment started with fresh business configuration. See the [port plan](docs/PORT-PLAN.md) for implementation steps and validation at the time.
