# Login session preparation integration

## Upstream evidence

- PR: [nocobase/nocobase#10986](https://github.com/nocobase/nocobase/pull/10986), `fix(templates): prepare session connection before mounting pages`.
- Merged by `gchust` on 2026-10-18 at 00:44:56 UTC; commit `c0b75379ca471cc902a2baf41d1fe022957a9d42`.
- Published in [2026-10-18.1](https://github.com/nocobase/nocobase/releases/tag/release-beta%2F2026-10-18.1): Authentication `2.0.0-beta.10`, Realtime `0.1.0-beta.2`, Default Template `1.0.0-beta.69`.

The protected page previously mounted before the realtime connection had authenticated as the current session. The subsequent open notification invalidated permissions and unmounted the page, producing a second load and duplicate requests. This is a React lifecycle issue, not a second browser document navigation.

## Scope and merge decisions

The application started from commit `c42e9fccaaf48ef8876adf007c8c73912b95899a` with a clean tree. Work is isolated on `fix/login-session-preparation`.

Compare the published Default Template `beta.68` and `beta.69` archives. Apply the session-preparation files from #10986 only:

| File                                          | Decision                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `client/routing/session-preparation.tsx`      | Add the upstream component.                                                                                                          |
| `client/routing/app-router.tsx`               | Preserve NocoReach providers and wrap them together inside the new preparation boundary, under `RequiredAuthentication`.             |
| `client/locales/system/en-US.ts`, `zh-CN.ts`  | Add preparation messages; simplify the connection error for end users. Preserve existing product copy.                               |
| Upstream shell guidance                       | Integrate the invariant into `docs/DEVELOPMENT.md`.                                                                                  |
| Upstream session-preparation regression tests | Adapt into `tests/nocoreach/session-preparation.test.tsx`, retaining real member/cache providers and checking member request counts. |
| Existing shell test harness                   | Supply the service container's `resolveIfCreated` contract; session IDs already exist.                                               |

Do not advance `nocobase.defaultTemplateVersion`: this is not a complete `beta.69` merge. Its administration pages, permission editor, data table, sidebar changes and unrelated styling are outside this fix. No plugin or capability is removed. A future full merge must recognize this patch as already applied and preserve the application's retired administration routes.

Authentication's published peer requirements also require App Client `3.0.0-beta.2`, App Server `2.0.0-beta.8` and DB `1.0.0-beta.21`. Update SQLite and Drive to `0.1.0-beta.6` for the server's supported driver and shared type identity. App Client resolves the updated Realtime dependency. Align the local mock plugin's framework peer minimums with these versions so its workspace installation cannot retain a separate older App Client. Keep the existing Agents, Runner, CLI Client and Scheduler pins. Update the lockfile and synchronize package-owned Skills through the plugin command; do not modify generated Skills.

## Runtime contract

Initial preparation finishes only after realtime open listeners invalidate permissions. No business identity read or protected page may mount before that point. No active subscription means preparation can finish immediately. An active connection that fails to open within ten seconds exposes retry and sign-out without showing protected content. Guest login remains reachable.

Preparation is not a replacement for runtime authorization checks. Later reconnects, permission revocations and identity changes must continue to dispose protected effects, dialogs and caches. Failed sign-out must remain visible and must not discard the session locally.

## Verification

- 81 frontend tests pass across session preparation, NocoReach session/cache boundaries, task drafts, application shell, routes and locale coverage. The preparation regression uses the real authentication and authorization providers and asserts that member reads wait for the handshake and occur only once.
- 32 backend tests pass across member access and API-key access with real test applications. Synthetic failure logs are expected assertions in those suites.
- `pnpm build` succeeds, including client/tooling type checks, client/server compilation, CLI/Runner packaging and deployment dependency verification. The local artifact targets Linux x64, Node 26; rebuild for the deployment runtime before releasing.
- Changed TypeScript files pass ESLint; changed source and guidance pass Prettier and relative documentation link checks. Frozen-lockfile installation succeeds.
- Existing unrelated peer warnings remain for the Anthropic SDK, Tiptap and the Agents plugin's exact react-day-picker peer. The new React DOM peer conflict was eliminated by reconciling application and mock-plugin framework changes together against the original lockfile, preserving existing third-party resolutions.
- Actual browser verification passed with Playwright and local Chromium 152 against the production build, using a disposable SQLite application and a synthetic administrator. Login used the real form, cookies, HTTP API and WebSocket endpoint. No personal browser session or application database was used.
- Normal login and an authenticated reload each issue exactly one `nrMembers/me` request. Normal login, delayed connection and retry recovery each keep the original browser document (one document load including initial navigation), with no uncaught page errors.
- Holding the server's real HTTP Upgrade handshake for two seconds shows the preparation screen with zero member reads. Releasing it enters the protected application with one member read. Holding it beyond ten seconds shows the connection failure screen; retry after restoring connectivity succeeds with one member read. Signing out from the failure screen returns to the login form without mounting member consumers.
- Screenshots and machine-readable results were saved locally under `storage/auth-browser-142/`. Playwright WebSocket routing was deliberately not used for failure simulation because it can open a synthetic connection before the real server handshake.
- The fresh application reaches the first-project onboarding page. It also requests `nrMock/status`, which returns 404 without a project; this observation is outside the session-preparation assertions. These checks do not cover an existing populated workspace, production reverse proxies, other login providers or later reconnects. The change has not been deployed.
- GitHub Actions tests and the Node 24 production build passed for implementation commit `2f0f3068a15f14702facdc81351d6921b8206067`.

## Rollback

Before deployment, return to the recorded baseline in a separate clean checkout and reinstall from its lockfile. If committed, revert this integration as one unit: dependencies, lockfile, component, router and translations must move together. No database migration or configuration change is introduced by the session-preparation patch. A deployed application needs a rebuild and restart to receive the new dependencies and frontend.
