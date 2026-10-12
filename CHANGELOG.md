# NocoReach Changelog

## Unreleased — PM-276

- Reconcile the default template from beta.58 to beta.67, align shared NocoBase dependencies, and register Mail with empty providers.
- Remove the retired `/settings` administration UI and dead member-page shortcut while preserving backend services, authorization, NocoReach identity, and CLI/Runner distribution.
- Adopt password-reset capability checks, localized sign-out errors, accessible theme controls, shared component fixes, and template locale layering.
- Preserve application-owned branding, business homepage, inbox shortcut, session boundaries, and historical migrations. See `docs/TEMPLATE-UPGRADE-beta67.md` for the full three-way inventory.

Record significant changes affecting usage, upgrades, or maintenance, with links to detailed records. Not every task needs an entry. Versions refer to NocoReach application releases unless explicitly identified as template or dependency versions. See the [development guide](docs/DEVELOPMENT.md) for current constraints; historical entries do not replace current rules.

## Unreleased

- Persist YouTube research videos by project and video ID, append discoveries, and preserve last valid metrics and captions with their read times. Keep saved records across changed criteria, disconnected sources, failed reads, and elapsed time. Migrate surviving snapshots and provide paginated browsing and an explicit administrator-only delete action. The data migration is irreversible to prevent dropping durable records during rollback; downgrade requires a pre-upgrade backup. Source discovery remains capped and does not guarantee newest results. [Storage and provider boundaries](docs/YOUTUBE.md)
- Render review reply drafts with the same safe Markdown preview as execution records, preserving source text and explicitly labeling Markdown source copying (PM-286).

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
