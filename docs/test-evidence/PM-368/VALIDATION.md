# PM-368 validation record

The implementation keeps `nrTasks`, the schema-v2 work projection, task-number hooks, ownership and existing execution APIs. The UI and `nocoreach task create` share `POST /api/nocoreachTasks`. Task creation never enqueues an Agent. The feature branch is `agent/PM-368`, based on main `11f92f386744e2c6105bad14a38a205e97c19c15` after merging the newer Google resource-switch change.

## Runtime evidence

Dependencies were installed with `pnpm install`, using the repository versions, without dependency upgrades. The only installation lockfile mutation was reverted. The isolated server was started with:

```sh
APP_STORAGE_DIR=<temporary-directory>/dev-storage DB_FILENAME=<temporary-directory>/dev.sqlite APP_SERVER_PORT=13168 APP_PUBLIC_ORIGIN=http://localhost:13168 pnpm dev
```

Initial readiness took 18.6 seconds. `GET http://localhost:13168/main/api/healthz` returned HTTP 200 with `ok: true`, application `main` and base path `/main`. The isolated database began empty, used the seeded test administrator, and had no configured Agent/model/repository. No production app was used. The test database/storage are disposable and are not committed.

The actual final run used `tests/nocoreach/manual-task-runtime.mjs` against the same server, with a local CLI created by `pnpm nocobase cli link`. Its synthetic administrator API key was passed to CLI child processes through their environment, never through command arguments or evidence. The test fetched the authenticated Swagger document before calling APIs. The key and browser session were kept in memory; no credential file is included.

| Path               | Task ID           | Number | Verified                                                                              |
| ------------------ | ----------------- | ------ | ------------------------------------------------------------------------------------- |
| Browser plain text | `392041775235072` | T-1    | List/detail reload, pending plan, zero operations                                     |
| Browser image      | `392041789915136` | T-2    | Native File in synthetic ClipboardEvent, persisted image bytes/render after reload    |
| Browser video      | `392041802498048` | T-3    | Synthetic file paste, picker and drop, three persisted attachments, playback and seek |
| CLI plain text     | `392041823469568` | T-4    | JSON ID/source/number, identical retry, browser retrieval/reload                      |
| CLI multiline file | `392041836052480` | T-5    | `--description-file`, identical retry, browser retrieval/reload                       |

The valid 1-second, 160×120 VP8/WebM was generated with ffmpeg, not renamed text. Playback advanced to approximately 0.25 seconds, seek reached 0.7 seconds, and `Range: bytes=10-29` returned 206 with `Content-Range: bytes 10-29/1232` and matching bytes. Videos have controls and no autoplay. These are programmatic file clipboard tests, not an OS clipboard test. Copied URLs remain text; OS/browser video clipboard availability varies.

CLI `task create --help` advertised `--description-file`. Successful creates and identical retries exited 0. Changed input with the original UUID returned conflict and exited 6; an empty title exited 5. Commands and complete redacted JSON outputs are in [runtime-evidence.json](runtime-evidence.json). CLI attachment uploads are not claimed.

Browser Back was tested both ways: dismissing the confirmation preserved the form and title; accepting returned to the list. No browser page errors were recorded. Screenshots include [list](browser-list.png), [image](browser-image-media.png), [video](browser-video-media.png), [CLI multiline](cli-multiline.png), and [mobile create](create-mobile.png). Media sits after the title/brief and before execution history. A development hot restart interrupted one intermediate browser attempt; the final stable-server run was rerun successfully and supplies the recorded IDs.

## Automated checks

```sh
pnpm exec vitest run tests/nocoreach/manual-tasks-app.test.ts tests/nocoreach/manual-task-ui.test.tsx tests/nocoreach/strategy-service.test.ts tests/nocoreach/results-app.test.ts tests/nocoreach/results-create.test.tsx tests/nocoreach/task-work.test.ts tests/nocoreach/task-waiting-navigation.test.tsx tests/nocoreach/task-flow.test.ts tests/logic/client-routes.test.ts tests/nocoreach/i18n-semantic-migration.test.tsx tests/nocoreach/sync-service.test.ts
pnpm exec tsc --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
```

All 11 test files / 101 tests passed. The owning server test file was rerun after the cleanup change: 3 tests passed. Scoped ESLint on every affected source/test file and Prettier on the new files passed; `git diff --check` passed. Upstream package sourcemap and in-memory-job configuration warnings remain; no failed assertions or type/lint failures remain in these checks.

Coverage includes anonymous/outsider rejection, strict body validation and creator/status/work forgery, unavailable projects, session preconditions, same-instance and separate-service-instance concurrency, mismatched UUID reuse, zero enqueue, work defaults, draft owner/session/project checks, invalid MIME/signatures/size/count, concurrent upload quota, private reads, wrong-project listing, expiry cleanup, create-versus-discard races, extensionless PNG persistence, Range/suffix/invalid-range reads, pending/failed UI uploads, image/video paste, text/URL paste, picker/drop, immutable network retry, editable definitive 4xx, project/session invalidation, safe filename/video rendering and media scope/reset/retry. Existing opportunity/result creation and task flow/route/locale checks passed.

To repeat runtime verification, provision a fresh local SQLite app with the same startup isolation, generate `<evidence-dir>/valid.webm` using `ffmpeg -f lavfi -i color=c=blue:s=160x120:d=1 -c:v libvpx -b:v 60k <evidence-dir>/valid.webm`, run `pnpm nocobase cli link`, then execute the opt-in harness:

```sh
NOCOREACH_MANUAL_TEST_URL=http://localhost:13168/main NOCOREACH_MANUAL_EVIDENCE_DIR=<evidence-dir> node tests/nocoreach/manual-task-runtime.mjs
```

An installed Playwright Chromium is required; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select it. The harness intentionally allows only explicit localhost/127.0.0.1 targets and uses the isolated app's default synthetic administrator.

## Persistence and request cost

`nrTaskMedia` is the only new collection. It stores plugin file metadata plus server-owned owner/session/project/draft/task IDs, expiry and a deletion claim. Its draft and expiry indexes support bounded lookups. Task idempotency reuses the existing unique `nrTasks.taskKey`; digest and manual origin are stored in evidence, not global strategy state. The existing task-number hook runs inside the create transaction.

Costs below describe application-level operations; framework authorization/storage SQL is additional and was not profiled:

- Create: existing membership/root and project reads, one indexed idempotency read, one short transaction containing one task insert plus the existing number-counter read/write, and one media read/CAS write per attachment (maximum five). Identical retries return after reads. Separate service instances reconcile uniqueness races after rollback. No storage/network I/O occurs in this transaction.
- Upload: membership/project checks, two persisted quota counts, one file-plugin storage write and metadata insert, then one metadata read. Per-creator serialization is outside database transactions; a creator may hold at most 20 unlinked records and a draft five. This is the application's single-process upload quota, not a distributed quota.
- Content read: membership/project checks, one media read and (for linked media) one task read. Range reads delegate directly to the installed disk's ranged stream; no database write or lock is added. List reads are bounded to five attachments.
- Cleanup: every 60 seconds, one query for at most 50 expired unlinked rows; per row, a conditional deletion-claim update, storage deletion and metadata deletion. Storage failures retain the claim for retry and are isolated per file. Linked files are never removed by draft cleanup.

Member access follows the existing NocoReach shared-project policy; an invalid project or a file from another project cannot be linked or listed as that task's media. Existing polling, runner claim, heartbeat and task execution code have no new queries or write locks. No strategy proposal cap or revision dependency is introduced.

## Independent review

An independent sub-agent `/root/implementation_review` was launched with the explicit requested model `gpt-6-astra`. Its initial review found extensionless media URLs and browser-history unsaved protection as blockers. Both were fixed and tested; final verification is recorded in the accompanying review record.
