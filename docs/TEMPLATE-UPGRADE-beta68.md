# Template upgrade: beta.67 → beta.68

Registry resolution: 2026-10-14, https://registry.npmjs.org. `@nocobase/app-template-default` dist-tags `beta` and `latest` both resolved to `1.0.0-beta.68`; the beta baseline keeps the beta channel. BASE `1.0.0-beta.67` and TARGET `1.0.0-beta.68` were compared as published tarballs. The upgrade branch starts from `main` plus the Agents pin (`chore/pin-agents-packages`).

## Resolved application decisions

- Keep top-level navigation groups collapsible: `AppLayout` passes `sections={false}` instead of adopting the template's always-open sections.
- Adopt the template's visual refresh in full: lighter borders, the `--hover` token, the unified focus treatment, light overlay frames without the overlay backdrop/shadow tokens, the `text-2xl` page title, the compact density's spacing and radius, and scrollbars that show only while scrolling.
- Replace NocoReach's own navigation count rendering with the template's entry badges. `usePendingNavigationBadges` (`client/components/app-shell/pending-navigation-badges.ts`) feeds the existing `nav-badges.tsx` counts through `NavigationMenu`'s `badges` prop; `client/theme/presentation.css` keeps them orange (`--attention`), including the icon mode's dot. Entries are named `Tasks · 100` and show at most `99+`, as the template does.
- Preserve NocoReach's sign-in brand panel (dark grid, white feature card, NocoReach mark and icons) as product branding; adopt only the template's `auth-page` surface (`auth-page.css`, dark-mode form palette) and its calmer heading/paragraph scale.
- Keep the Agents plugin, Runner and CLI client pinned at `0.1.0-beta.7` / `0.1.0-beta.6` / `0.1.0-beta.4`. They are application-only dependencies, not part of the template manifest; `0.1.0-beta.10` removes configured and online agents and needs its own adaptation.
- Keep `docs/DEVELOPMENT.md` as the project's guidance instead of the template's `.agents/rules/`; the navigation hook, badges/sections choice and `StatusBadge` small size are recorded there.
- The template's homepage change does not apply: NocoReach keeps its business homepage.

## Direct NocoBase dependency changes

| Package                                       | Previous declaration | Final declaration |
| --------------------------------------------- | -------------------- | ----------------- |
| `@nocobase/app-server`                        | `^2.0.0-beta.5`      | `^2.0.0-beta.6`   |
| `@nocobase/app-plugin-authentication`         | `^2.0.0-beta.7`      | `^2.0.0-beta.8`   |
| `@nocobase/app-plugin-notification-providers` | `^0.2.0-beta.11`     | `^0.2.0-beta.12`  |
| `@nocobase/lifecycle`                         | `^0.1.0-beta.1`      | `^0.1.0-beta.2`   |
| `@nocobase/app-skills`                        | `0.1.0-beta.34`      | `0.1.0-beta.35`   |

No direct `@nocobase/*` package was removed. `pnpm dedupe` refreshed compatible transitive resolutions.

## Files

Taken from TARGET (unchanged by NocoReach since BASE): `client/components/page-header.tsx`, `client/components/status-badge.tsx`, `client/extensions/nocobase-inbox/inbox-item.tsx`, `client/extensions/nocobase-inbox/inbox-list.tsx`, `client/index.tsx`, `client/layouts/components/layout-header.tsx`, `client/locales/system/en-US.ts`, `client/locales/system/zh-CN.ts`, `client/pages/auth/reset-password.tsx`, `client/routing/route-navigation.ts`, `client/theme/theme-settings.tsx`, `server/config/notification.ts`, `tests/components/navigation-menu.test.tsx`, `tests/components/sidebar-permissions.test.tsx`, and both theme presets (NocoReach had only reordered their declarations).

Added from TARGET: `client/lib/navigation-transform.ts`, `client/lib/scrollbar.ts`, `client/pages/auth/auth-page.css`, `tests/components/status-badge.test.tsx`, `tests/logic/scrollbar.test.ts`.

Merged by hand:

- `client/layouts/components/navigation-menu.tsx`: TARGET; NocoReach's badge hook moved to the layout as above.
- `client/layouts/app-layout.tsx`: `sections={false}` and `badges`.
- `client/styles.css`: TARGET plus NocoReach's `nocoreach.css`/`presentation.css` imports and status colour mappings.
- `client/theme/presentation.css`: reduced to NocoReach's own rules. The interaction, overlay, dialog, alert, toast, table and navigation blocks it had copied from BASE are now TARGET's, in `styles.css`; legacy `.nr-page` tables use `--hover` for the same header.
- `client/layouts/components/app-sidebar.tsx`, `sidebar-footer.tsx`, `user-menu.tsx`: TARGET's full-strength borders. NocoReach had already made TARGET's sidebar width and menu-button changes.
- `client/pages/auth/shared.tsx`: as decided above.
- `server/app.ts`: registers `MailerProvider` beside NocoReach's mock isolation checks and retry guard. It reads only configured, enabled `notification` mail channels; NocoReach configures none. `SMTP_PASSWORD`/`RESEND_API_KEY` would add a `system-email` channel, which the existing mock notification isolation refuses in demo/test deployments.
- `package.json`, `vitest.config.ts`, `tests/components/auth-i18n.test.tsx`, `tests/logic/theme-tokens.test.ts` (the overlay tokens are gone), `tests/components/navigation-badges.test.tsx` (now asserts the template badge).

Not applicable: `.agents/rules/components.md`, `.agents/rules/shell.md` (see `docs/DEVELOPMENT.md`), `client/pages/home/index.tsx`.

## Migrations

The template adds none. Application migrations are unchanged.

## Rollback

Revert the upgrade merge (or abandon the `template-upgrade-1.0.0-beta.68` branch) and reinstall from the previous lockfile. No migration or data change is involved.
