# NocoReach Changelog

## Unreleased — PM-276

- Isolate historical collection tests from scheduled daily analysis and verify that signal first-seen timestamps survive subsequent analysis reads.

- Reuse the sidebar-footer shield slot for demo status without adding a footer row.
- Replace the global demo banner with a compact sidebar-footer indicator, with localized hover/focus details and scoped status refresh.

- Reconcile the default template from beta.58 to beta.67, align shared NocoBase dependencies, and register Mail with empty providers.
- Remove the retired `/settings` administration UI and dead member-page shortcut while preserving backend services, authorization, NocoReach identity, and CLI/Runner distribution.
- Adopt password-reset capability checks, localized sign-out errors, accessible theme controls, shared component fixes, and template locale layering.
- Preserve application-owned branding, business homepage, inbox shortcut, session boundaries, and historical migrations. See `docs/TEMPLATE-UPGRADE-beta67.md` for the full three-way inventory.

Record significant changes affecting usage, upgrades, or maintenance, with links to detailed records. Not every task needs an entry. Versions refer to NocoReach application releases unless explicitly identified as template or dependency versions. See the [development guide](docs/DEVELOPMENT.md) for current constraints; historical entries do not replace current rules.

## Unreleased — PM-317

- Read execution receipt `recordedAt` and actual execution history events in Results date projection; keep execution-day filters accurate when earlier deliverables exist.

- Add a peer Results page with project-scoped 7/28-day observations, explicit coverage and safe zero/missing-data comparisons. Preserve task results and history; remove the duplicate recent-effects section from Insights only after validating the Results handover (PM-319, PM-320).
- Create follow-up opportunities or pending tasks only after user confirmation, retain an immutable source observation, and return the existing target on retries of the same submission. Manual opportunities survive analysis rotation and preserve their source when handed off (PM-321 / PM-317). Reuse existing JSON storage without schema migrations.

## Unreleased

- 访问 channel shares: drop the separate "of which AI assistants" line. GA4 now groups AI assistants into its own default channel, so the card showed two different AI shares (AI Assistant 1.1% and NocoReach's source-name count 1.2%) with an explanation that no longer matched. The card keeps GA4's channel, labelled AI 助手 and highlighted; ChatGPT, Perplexity and others stay one by one under Traffic acquisition → AI assistants.

- Correct English copy: site-audit change titles and short change chips ("16 页", "42 分") read in English, including in stored analyses; task briefs created from opportunities label their goal, suggestion, observation, evidence and limitation in the creator's language, and briefs created from changes translate the change facts; task-list steps read "Agent: Change" and "Waiting for the agent to pick it up". Chinese text is unchanged and no stored data is migrated.

- Add GitHub hot topics as a second tab of the GitHub page: followed topics (by default the repository's own topics with the most repositories) with their repositories, new ones in 7 days and per week for 12 weeks; a gainers list from the stars NocoReach records daily; the official GitHub Trending page, read once a day; and the newest popular repositories. A heating topic and a competitor's star surge become signals in the daily analysis.

- 访问 realtime (last 30 minutes): each of its seven GA4 Realtime queries now stands alone, so one GA4 refuses is left out and named instead of blanking the whole view; only a failed totals query or lost access fails it. GA4 read failures on the page now carry Google's status and message (e.g. `HTTP 429 · Exhausted concurrent requests quota.`) instead of a generic message, shown under the realtime figure and in the realtime drawer, and logged with status and part.

- Show the GA4 property's name next to its ID in the Google panel's current resources. The name is kept on the project when the property is chosen; projects that chose it earlier get it from the property details the next GA4 sync already reads. No schema change.

- Rebuild the GitHub page after the first NocoReach's GitHub page: stars, forks, contributors, commits, issues, pull requests and releases in one chart for any range up to all time (the full history GitHub keeps with dates is read once with the token, then daily); views and clones in a chart of their own, saved every day and now kept for good, since GitHub gives only 14 days; referring sites and popular content over their daily snapshots; repository composition and community efficiency. The demo fixtures serve pull requests, commits, contributors and languages.

- Let a project change its GA4 property and Search Console site after confirming them, instead of requiring a new project. Synced data is already read by resource, so the earlier resources' days stay stored but hidden and return if they are selected again; unfinished jobs for a replaced resource are dropped and the last sync time starts over. Sync status (jobs and "available through") follows the current resources. The Google panel shows the current resources, preselects them in the pickers, and asks for confirmation before a change.

- Match the Pages list's visits and search figures by host and path instead of path alone, so sites that share a path (`www` and `docs` both have `/`) no longer show each other's numbers. GA4 page snapshots now keep the hostname; GA4 days synced before this keep matching by path until they are synced again. The Agent's page summary and its top-pages line follow the same rule.

- Rebuild the Traffic (访问) page after GA4's reports: the period is read live from the GA4 Data API (users deduplicated over the period, once a day per range, through the project's Google connection) instead of adding up synced days. Add a Today card (realtime last 30 minutes with a details drawer; today against yesterday and the same weekday last week up to the same hour; today's sources), GA4's eight figures switching the daily line, channels with AI assistants listed apart, new/returning and device shares, and six report tabs whose rows open their days against the previous period. A report GA4 refuses is left out on its own and named. The simulated GA4 fixtures add `batchRunReports`, `runRealtimeReport`, named and relative date ranges, today's elapsed hours, filters and ordering. [Record](docs/PORT-PLAN.md#数据页补全2026-10-14-起)

- Split Audit into two tabs: Site audit and Performance. Performance lists every Lighthouse check made so far (up to 1,000; search, device filter, sorting) instead of the last 20, opens a check with the other checks of the same page and device, and hands one or several ticked results to the Agent. The Pages list's performance link opens this tab with the URL filled in.

- Sort the Pages list by update date, visits, search clicks or impressions newest or largest first, then flip between descending and ascending without an unsorted third click; pages without a value stay last both ways. Sortable table columns that are not sorted show a faint ↕.

- Fix the sidebar template version to use the application’s adopted template baseline at build time, independent of Studio host metadata; show a localized unknown state for missing or invalid versions (PM-277).

- Upgrade the default template from beta.67 to beta.68: the template's visual refresh (lighter borders, `--hover`, unified focus, light overlays, scrollbars shown while scrolling), its navigation badges for the pending counts with top-level groups kept collapsible, password-reset feedback, and the Mailer service. Agents packages stay pinned. See [TEMPLATE-UPGRADE-beta68.md](docs/TEMPLATE-UPGRADE-beta68.md).

- Pin the Agents plugin, Runner and CLI client to their current exact versions so dependency updates cannot install Agents 0.1.0-beta.10, whose migration removes configured agents; see [Template and dependencies](docs/DEVELOPMENT.md#template-and-dependencies).

- Make data discovery clearer and safer to repeat: prefill the project's website, retry the homepage once with the `www.` prefix toggled when the host does not answer, group findings by kind with a name and rule for each, make GitHub repositories single-choice, route X, YouTube and Reddit to their own connection panels, and refresh listed connection statuses from saved state after a panel saves (`nrDiscovery:connections`, administrators only, no homepage re-read).

- Include bounded deployment correlation IDs and a fixed polling phase in CI failure diagnostics, suppress unknown remote status values, preserve fail-closed deployment behavior, and distinguish pending approval from verified success in console output. This improves investigation only; it does not resolve a Studio runtime failure.

- Release the browser-enabled NocoReach CLI as 1.0.0-beta.67 so existing beta.66 installations download the new CLI instead of reusing the API-key-only binary.

- Increase the Studio archive-upload process limit from three to ten minutes, retain short read limits, and distinguish safe process diagnostics without retrying an uncertain upload.

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
