# Template upgrade: beta.58 → beta.67

Registry resolution: 2026-10-13 (Australia/Melbourne), https://registry.npmjs.org.
`@nocobase/create-app@latest` resolved to `0.1.0-beta.32`; its published `dist/lib/template.js` resolves the default alias to `@nocobase/app-template-default@latest`, which resolved to `1.0.0-beta.67`. Both template tarballs were compared directly against the clean application at `3b7b997ab5d3d2899526926f67d2892a82d4bfd2`.

## Resolved application decisions

- Remove all application-owned `/settings` pages, layout, route adapters, language resources and dedicated tests. Remove the member-page shortcut to the retired user page. Keep NocoReach member role assignment and project settings.
- Preserve backend Users, API Keys, authorization rules, Database Explorer, Scheduler and Notification registrations, permissions and persisted data. Keep the business retry guard, session-scoped identity/cache, Agents routes and CLI/Runner distribution hooks.
- Register Mail on Client and Server and its official configuration factory, with empty providers. No mailbox, external credentials, live mail sends or billing operations are introduced. Plugin migrations are exercised only against isolated test databases.
- Preserve NocoReach's root redirect and business homepage instead of adopting the template's scaffolding tutorial homepage. Its new capability cards, prompt dialog and corresponding homepage test do not apply.
- Preserve NocoReach's brand panel, assets, semantic Tag colors, sidebar width, mobile header, custom table/navigation styles, and both theme presets. Merge compatible overlay/toast primitives, theme radio controls, password-reset capability checks and localized sign-out errors. Adapt upstream stationary-mark loading to the existing NocoReach vector asset. Do not add the NocoBase watermark.
- Keep the inbox header shortcut, unread title badge, components and tests as application-owned code: it remains the only entry to the inbox. The upstream removes the default entry, not the backend capability.
- Split template locales into `client/locales/system/`; retain NocoReach branding and business navigation overrides. PM-275 owns the separate business translation-key migration.
- Keep the existing short AGENTS index and `docs/DEVELOPMENT.md` topic guidance instead of introducing duplicate `.agents/rules/`. Merge relevant shell/component/build guidance there. Preserve CLAUDE's existing AGENTS reference. Adapt the upstream guidance link test to check DEVELOPMENT too.
- Existing Workflow, Hub CLI and AI-avatar removals are already complete. No direct NocoBase package or backend capability is removed in this upgrade. Move the client-only template-print plugin to production dependencies as required by deployment composition.
- Preserve all application migrations byte-for-byte. Existing workflow-free compiler/configuration changes already match TARGET. Retain isolated Vite caches, Node test storage flags and Agents test transforms.

## Direct NocoBase dependency changes

The lockfile records exact reproducible resolutions after install and deduplication. Application-only Agents, Runner, CLI client and Mermaid packages retain their compatible declarations; the existing newer/ranged dev-config declaration remains `^0.1.0-beta.22`. Other non-NocoBase dependencies are not upgraded to latest.

| Package                                        | Previous declaration | Final declaration |
| ---------------------------------------------- | -------------------- | ----------------- |
| `@nocobase/app-cli`                            | `^1.0.0-beta.19`     | `^1.0.0-beta.21`  |
| `@nocobase/app-plugin-api-keys`                | `^1.0.0-beta.14`     | `^1.0.0-beta.16`  |
| `@nocobase/app-plugin-authentication`          | `^2.0.0-beta.6`      | `^2.0.0-beta.7`   |
| `@nocobase/app-plugin-authz-default-access`    | `^1.0.0-beta.12`     | `^1.0.0-beta.13`  |
| `@nocobase/app-plugin-authz-restriction-rules` | `^1.0.0-beta.11`     | `^1.0.0-beta.12`  |
| `@nocobase/app-plugin-authz-sharing-rules`     | `^1.0.0-beta.12`     | `^1.0.0-beta.13`  |
| `@nocobase/app-plugin-database-explorer`       | `^1.0.0-beta.12`     | `^1.0.0-beta.14`  |
| `@nocobase/app-plugin-i18n`                    | `^1.0.0-beta.14`     | `^1.0.0-beta.16`  |
| `@nocobase/app-plugin-mail`                    | `absent`             | `^1.0.0-beta.13`  |
| `@nocobase/app-plugin-notification`            | `^1.0.0-beta.25`     | `^1.0.0-beta.27`  |
| `@nocobase/app-plugin-notification-in-app`     | `^1.0.0-beta.23`     | `^1.0.0-beta.24`  |
| `@nocobase/app-plugin-notification-providers`  | `^0.2.0-beta.10`     | `^0.2.0-beta.11`  |
| `@nocobase/app-plugin-scheduler`               | `^1.0.0-beta.16`     | `^1.0.0-beta.17`  |
| `@nocobase/app-plugin-template-print`          | `0.0.2-beta.1`       | `0.0.2-beta.2`    |
| `@nocobase/app-plugin-users`                   | `^2.0.0-beta.2`      | `^2.0.0-beta.4`   |
| `@nocobase/app-server`                         | `^2.0.0-beta.4`      | `^2.0.0-beta.5`   |
| `@nocobase/app-skills`                         | `0.1.0-beta.29`      | `0.1.0-beta.34`   |
| `@nocobase/app-testing`                        | `0.1.0-beta.2`       | `0.1.0-beta.3`    |
| `@nocobase/app-websocket`                      | `^0.0.1`             | `^0.0.2-beta.0`   |
| `@nocobase/config`                             | `^0.1.0-beta.2`      | `^0.1.0-beta.3`   |
| `@nocobase/drive`                              | `^0.1.0-beta.4`      | `^0.1.0-beta.5`   |
| `@nocobase/lifecycle`                          | `^0.1.0-beta.0`      | `^0.1.0-beta.1`   |
| `@nocobase/logging`                            | `^0.1.0-beta.6`      | `^0.1.0-beta.7`   |
| `@nocobase/session`                            | `^0.1.0-beta.2`      | `^0.1.0-beta.3`   |
| `@nocobase/snowflake`                          | `^1.0.0-beta.3`      | `^1.0.0-beta.4`   |

## Complete upstream source inventory

`untouched`, `modified`, and `gone` describe PROJECT relative to BASE before this change. Ordinary unchanged template sources take TARGET; application-owned changes are reconciled as described above. A retained customization is an explicit full-merge decision, not a skipped upgrade.

| File                                                                            | BASE → TARGET | PROJECT   | Resolution                                                             |
| ------------------------------------------------------------------------------- | ------------- | --------- | ---------------------------------------------------------------------- |
| `.agents/rules/build-and-deploy.md`                                             | added         | gone      | Keep application index; reconcile guidance in DEVELOPMENT              |
| `.agents/rules/components.md`                                                   | added         | gone      | Keep application index; reconcile guidance in DEVELOPMENT              |
| `.agents/rules/shell.md`                                                        | added         | gone      | Keep application index; reconcile guidance in DEVELOPMENT              |
| `.prettierignore`                                                               | changed       | untouched | Take TARGET                                                            |
| `AGENTS.md`                                                                     | changed       | modified  | Keep application index; reconcile guidance in DEVELOPMENT              |
| `CLAUDE.md`                                                                     | changed       | modified  | Keep application index; reconcile guidance in DEVELOPMENT              |
| `README.MD`                                                                     | changed       | modified  | Merge TARGET; preserve application additions                           |
| `client/agent-annotations-host.ts`                                              | changed       | untouched | Take TARGET                                                            |
| `client/app.ts`                                                                 | changed       | modified  | Already incorporates target contract; preserve application adaptations |
| `client/components/brand-loading-mark.tsx`                                      | added         | gone      | Adapt loading orbit to NocoReach asset                                 |
| `client/components/brand-mark-geometry.ts`                                      | added         | gone      | Keep NocoReach geometry/brand surface; omit NocoBase watermark         |
| `client/components/brand-spinner.tsx`                                           | added         | gone      | Merge TARGET; preserve application additions                           |
| `client/components/brand-watermark.tsx`                                         | added         | gone      | Keep NocoReach geometry/brand surface; omit NocoBase watermark         |
| `client/components/inbox-badge.ts`                                              | removed       | untouched | Retain application-owned inbox shortcut and tests                      |
| `client/components/inbox-button.tsx`                                            | removed       | untouched | Retain application-owned inbox shortcut and tests                      |
| `client/components/inbox-header-button.tsx`                                     | removed       | untouched | Retain application-owned inbox shortcut and tests                      |
| `client/components/loading.tsx`                                                 | changed       | untouched | Take TARGET                                                            |
| `client/components/route-overlay.tsx`                                           | changed       | modified  | Merge TARGET; preserve application additions                           |
| `client/components/status-badge.tsx`                                            | added         | gone      | Merge TARGET; preserve application additions                           |
| `client/components/ui/alert-dialog.tsx`                                         | added         | modified  | Merge TARGET; preserve application additions                           |
| `client/components/ui/card.tsx`                                                 | added         | modified  | Merge TARGET; preserve application additions                           |
| `client/components/ui/dialog.tsx`                                               | changed       | untouched | Take TARGET                                                            |
| `client/components/ui/radio-group.tsx`                                          | added         | gone      | Merge TARGET; preserve application additions                           |
| `client/components/ui/sidebar.tsx`                                              | changed       | untouched | Take TARGET                                                            |
| `client/components/ui/spinner.tsx`                                              | changed       | untouched | Take TARGET                                                            |
| `client/components/ui/toast.tsx`                                                | changed       | untouched | Take TARGET                                                            |
| `client/extensions/nocobase-file-component-ui/components/file-upload-field.tsx` | changed       | untouched | Take TARGET                                                            |
| `client/extensions/nocobase-inbox/inbox-item.tsx`                               | changed       | untouched | Take TARGET                                                            |
| `client/layouts/app-layout.tsx`                                                 | changed       | modified  | Merge TARGET; preserve application additions                           |
| `client/layouts/components/app-sidebar.tsx`                                     | changed       | modified  | Retain application brand/mobile/navigation presentation                |
| `client/layouts/components/header-actions.tsx`                                  | changed       | modified  | Merge TARGET; preserve application additions                           |
| `client/layouts/components/surface-empty.tsx`                                   | removed       | untouched | Remove retired source                                                  |
| `client/layouts/components/user-menu.tsx`                                       | changed       | untouched | Take TARGET                                                            |
| `client/layouts/index.ts`                                                       | changed       | untouched | Take TARGET                                                            |
| `client/layouts/settings-layout.tsx`                                            | removed       | modified  | Remove retired source                                                  |
| `client/lib/toaster.ts`                                                         | changed       | untouched | Take TARGET                                                            |
| `client/locales/en-US.ts`                                                       | changed       | modified  | Merge TARGET; preserve application additions                           |
| `client/locales/system/en-US.ts`                                                | added         | gone      | Merge TARGET; preserve application additions                           |
| `client/locales/system/zh-CN.ts`                                                | added         | gone      | Merge TARGET; preserve application additions                           |
| `client/locales/zh-CN.ts`                                                       | changed       | modified  | Merge TARGET; preserve application additions                           |
| `client/pages/auth/forgot-password.tsx`                                         | changed       | untouched | Take TARGET                                                            |
| `client/pages/auth/login.tsx`                                                   | changed       | untouched | Take TARGET                                                            |
| `client/pages/auth/shared.tsx`                                                  | changed       | modified  | Retain application brand/mobile/navigation presentation                |
| `client/pages/home.tsx`                                                         | removed       | modified  | Retain application business homepage; omit scaffold tutorial           |
| `client/pages/home/capabilities.ts`                                             | added         | gone      | Retain application business homepage; omit scaffold tutorial           |
| `client/pages/home/index.tsx`                                                   | added         | gone      | Retain application business homepage; omit scaffold tutorial           |
| `client/pages/home/prompt-dialog.tsx`                                           | added         | gone      | Retain application business homepage; omit scaffold tutorial           |
| `client/pages/home/use-copy.ts`                                                 | added         | gone      | Retain application business homepage; omit scaffold tutorial           |
| `client/plugins.ts`                                                             | changed       | modified  | Merge TARGET; preserve application additions                           |
| `client/routes.ts`                                                              | changed       | modified  | Merge TARGET; preserve application additions                           |
| `client/routing/app-router.tsx`                                                 | changed       | modified  | Merge TARGET; preserve application additions                           |
| `client/routing/route-navigation.ts`                                            | changed       | untouched | Take TARGET                                                            |
| `client/styles.css`                                                             | changed       | modified  | Merge TARGET; preserve application additions                           |
| `client/theme/theme-settings.tsx`                                               | changed       | untouched | Take TARGET                                                            |
| `client/theme/themes/compact.css`                                               | changed       | modified  | Merge TARGET; preserve application additions                           |
| `client/theme/themes/default.css`                                               | changed       | modified  | Merge TARGET; preserve application additions                           |
| `config.example.yml`                                                            | changed       | modified  | Merge TARGET; preserve application additions                           |
| `eslint.config.js`                                                              | changed       | modified  | Already incorporates target contract; preserve application adaptations |
| `index.html`                                                                    | changed       | modified  | Merge TARGET; preserve application additions                           |
| `package.json`                                                                  | changed       | modified  | Merge TARGET; preserve application additions                           |
| `server/config/index.ts`                                                        | changed       | modified  | Merge TARGET; preserve application additions                           |
| `server/config/mail.ts`                                                         | added         | gone      | Merge TARGET; preserve application additions                           |
| `server/config/workflow.ts`                                                     | removed       | gone      | Remove retired source                                                  |
| `server/plugins.ts`                                                             | changed       | modified  | Merge TARGET; preserve application additions                           |
| `tests/components/app-layout-routes.test.tsx`                                   | changed       | modified  | Already incorporates target contract; preserve application adaptations |
| `tests/components/auth-i18n.test.tsx`                                           | changed       | modified  | Merge TARGET; preserve application additions                           |
| `tests/components/home.test.tsx`                                                | added         | gone      | Retain application business homepage; omit scaffold tutorial           |
| `tests/components/inbox.test.tsx`                                               | changed       | untouched | Retain application-owned inbox shortcut and tests                      |
| `tests/components/layout-i18n.test.tsx`                                         | changed       | modified  | Merge TARGET; preserve application additions                           |
| `tests/components/primitive-labels.test.tsx`                                    | changed       | untouched | Take TARGET                                                            |
| `tests/fixtures/theme-tokens.html`                                              | changed       | modified  | Already incorporates target contract; preserve application adaptations |
| `tests/fixtures/theme-tokens.tsx`                                               | changed       | untouched | Take TARGET                                                            |
| `tests/logic/agents-md.test.ts`                                                 | added         | gone      | Merge TARGET; preserve application additions                           |
| `tests/logic/app-server.test.ts`                                                | changed       | modified  | Already incorporates target contract; preserve application adaptations |
| `tests/logic/client-auth.test.tsx`                                              | changed       | modified  | Merge TARGET; preserve application additions                           |
| `tests/logic/client-plugin-registry.test.ts`                                    | changed       | modified  | Already incorporates target contract; preserve application adaptations |
| `tests/logic/client-routes.test.ts`                                             | changed       | modified  | Merge TARGET; preserve application additions                           |
| `tests/logic/client-settings.test.tsx`                                          | removed       | modified  | Remove retired source                                                  |
| `tests/logic/client-shell.test.tsx`                                             | changed       | modified  | Merge TARGET; preserve application additions                           |
| `tests/logic/client-theme.test.tsx`                                             | changed       | untouched | Take TARGET                                                            |
| `tests/logic/config.test.ts`                                                    | changed       | modified  | Already incorporates target contract; preserve application adaptations |
| `tests/logic/dev-routes-production-build.test.ts`                               | removed       | gone      | Remove retired source                                                  |
| `tests/logic/plugin-commands.test.ts`                                           | changed       | untouched | Take TARGET                                                            |
| `tests/logic/plugin-page-authz.test.ts`                                         | removed       | modified  | Remove retired source                                                  |
| `tests/logic/user-menu-sign-out.test.tsx`                                       | changed       | untouched | Take TARGET                                                            |
| `tsconfig.json`                                                                 | changed       | modified  | Already incorporates target contract; preserve application adaptations |
| `tsconfig.server.json`                                                          | changed       | modified  | Already incorporates target contract; preserve application adaptations |
| `vitest.config.ts`                                                              | changed       | modified  | Already incorporates target contract; preserve application adaptations |

## Validation and rollback

Actual checks on the upgrade branch:

- `pnpm install`, `pnpm dedupe`, and `pnpm nocobase skills sync`: passed. A separate source copy at `/home/gchust/work/.pm276-clean-install-9sw6j1y3` installed successfully with `pnpm install --frozen-lockfile --store-dir /home/gchust/.local/share/pnpm/store`, including postinstall. The first scratch install under `/tmp` hit its inode limit; only this task's failed copy was removed, and the shared cache was left intact.
- `pnpm typecheck`: all three owning configurations passed.
- `pnpm test`: 155 suites / 1,028 tests passed; one source-package suite timed out under concurrent checks. After relieving resource pressure, `vitest run tests/logic/nocoreach-source-package.test.ts tests/logic/config.test.ts tests/logic/client-plugin-registry.test.ts` passed all 3 suites / 14 tests without changing timeouts or disabling assertions. Existing Agents/Runner, authorization, notification, scheduler and session tests were included in the full run.
- Scoped ESLint passed for changed framework/source/tests. Three legacy files retain pre-existing lint debt: `members.tsx` now has 68 quote-style errors (80 in BASE PROJECT), `legacy/schedule.ts` 5 existing unsafe-type errors, and `providers/nocoreach.ts` 9 existing errors. The two server files change comments only. These were verified against the recorded pre-upgrade Git source with the same ESLint configuration; no blanket suppression or unrelated formatting was introduced.
- Scoped Prettier passed for changed template files and documentation; the three legacy files and the minimally edited legacy translation JSON retain surrounding formatting. `git diff --check` passed. The AGENTS/DEVELOPMENT link test passed.
- `pnpm build` and `pnpm nocobase dist check`: passed; all 27 imported runtime packages reach the deployment. Both distribution manifests and universal archives exist. SHA-256/size checks and clean extraction succeeded; both binaries executed `--version` successfully (`nocoreach 1.0.0-beta.66`, `nocobase-runner 0.1.0-beta.6`). Application version is intentionally separate from template version.
- An isolated SQLite development instance started at `http://127.0.0.1:13276/main/`, including Mail's default migrations/configuration without providers. Chromium checked login, `/settings`, `/settings/users`, `/settings/schedules/bookmark`, and password recovery with no page errors; retired paths follow the ordinary fallback to login while signed out. Both Spacious/Compact presets and Light/Dark modes were selected through visible labels and their radio checked state asserted. Desktop and 375px dark screenshots were inspected. Evidence/logs are under `/tmp/pm276-upgrade/`.
- No authenticated browser session was available: live signed-in business navigation, populated tables/dialogs, authorization differences between accounts and real task execution remain unverified in-browser. Component/integration tests cover those boundaries. Production/embedded Studio installation and HTTP artifact download from a signed-in session were not exercised; artifacts were verified locally. External mail delivery and billable AI/provider requests are intentionally not exercised. Production/Studio deployment is outside this task.

Before deployment, back up database and storage. Roll back source and locked dependencies to the recorded commit (or revert this PR), rebuild both CLI/Runner distributions, and restore the coordinated pre-upgrade backup if plugin migrations have run. Do not edit migration history or downgrade a live database in place by guessing.

## Locked direct NocoBase packages

| Package                                        | Section         | Resolved version |
| ---------------------------------------------- | --------------- | ---------------- |
| `@nocobase/app-cli`                            | dependencies    | `1.0.0-beta.21`  |
| `@nocobase/app-plugin-agents`                  | dependencies    | `0.1.0-beta.7`   |
| `@nocobase/app-plugin-api-keys`                | dependencies    | `1.0.0-beta.16`  |
| `@nocobase/app-plugin-authentication`          | dependencies    | `2.0.0-beta.7`   |
| `@nocobase/app-plugin-authorization`           | dependencies    | `1.0.0-beta.27`  |
| `@nocobase/app-plugin-authz-default-access`    | dependencies    | `1.0.0-beta.13`  |
| `@nocobase/app-plugin-authz-restriction-rules` | dependencies    | `1.0.0-beta.12`  |
| `@nocobase/app-plugin-authz-sharing-rules`     | dependencies    | `1.0.0-beta.13`  |
| `@nocobase/app-plugin-database-explorer`       | dependencies    | `1.0.0-beta.14`  |
| `@nocobase/app-plugin-file`                    | dependencies    | `1.0.0-beta.23`  |
| `@nocobase/app-plugin-i18n`                    | dependencies    | `1.0.0-beta.16`  |
| `@nocobase/app-plugin-mail`                    | dependencies    | `1.0.0-beta.13`  |
| `@nocobase/app-plugin-notification`            | dependencies    | `1.0.0-beta.27`  |
| `@nocobase/app-plugin-notification-in-app`     | dependencies    | `1.0.0-beta.24`  |
| `@nocobase/app-plugin-notification-providers`  | dependencies    | `0.2.0-beta.11`  |
| `@nocobase/app-plugin-scheduler`               | dependencies    | `1.0.0-beta.17`  |
| `@nocobase/app-plugin-template-print`          | dependencies    | `0.0.2-beta.2`   |
| `@nocobase/app-plugin-users`                   | dependencies    | `2.0.0-beta.4`   |
| `@nocobase/app-server`                         | dependencies    | `2.0.0-beta.5`   |
| `@nocobase/authorization`                      | dependencies    | `1.0.0-beta.13`  |
| `@nocobase/caching`                            | dependencies    | `0.1.0-beta.3`   |
| `@nocobase/config`                             | dependencies    | `0.1.0-beta.3`   |
| `@nocobase/db`                                 | dependencies    | `1.0.0-beta.19`  |
| `@nocobase/db-sqlite`                          | dependencies    | `0.1.0-beta.5`   |
| `@nocobase/i18n`                               | dependencies    | `1.0.0-beta.7`   |
| `@nocobase/jobs`                               | dependencies    | `0.1.0-beta.3`   |
| `@nocobase/lifecycle`                          | dependencies    | `0.1.0-beta.1`   |
| `@nocobase/queue`                              | dependencies    | `0.1.0-beta.9`   |
| `@nocobase/repository-input`                   | dependencies    | `0.1.0-beta.3`   |
| `@nocobase/service-provider`                   | dependencies    | `0.0.2-beta.2`   |
| `@nocobase/snowflake`                          | dependencies    | `1.0.0-beta.4`   |
| `@nocobase/agent-runner`                       | devDependencies | `0.1.0-beta.6`   |
| `@nocobase/app-cli-client`                     | devDependencies | `0.1.0-beta.4`   |
| `@nocobase/app-client`                         | devDependencies | `3.0.0-beta.1`   |
| `@nocobase/app-skills`                         | devDependencies | `0.1.0-beta.34`  |
| `@nocobase/app-testing`                        | devDependencies | `0.1.0-beta.3`   |
| `@nocobase/app-websocket`                      | devDependencies | `0.0.2-beta.0`   |
| `@nocobase/dev-config`                         | devDependencies | `0.1.0-beta.22`  |
| `@nocobase/drive`                              | devDependencies | `0.1.0-beta.5`   |
| `@nocobase/logging`                            | devDependencies | `0.1.0-beta.7`   |
| `@nocobase/markdown-mermaid`                   | devDependencies | `0.1.0-beta.2`   |
| `@nocobase/session`                            | devDependencies | `0.1.0-beta.3`   |
