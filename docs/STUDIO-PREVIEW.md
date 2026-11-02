# Pull request previews on Studio

A successful upload is not a ready preview. `scripts/ci/preview-studio.mjs` reports **Preview ready** only after verifying the release, generated dataset, native visitor entry, enabled demo adapters, refused external probes, Insights, Opportunities and the Tasks filter. The first deployment normally stops at the dataset check until an operator initializes its new storage. Existing previews are never imported, cleared or reset by CI.

Publication belongs to the dedicated NocoReach job in `2013xile/nocobase-ci`, following its CustomerPortal application workflow. This repository has no preview publication trigger. Its existing host checks (`tests`, `build`, `english` and the three database checks) remain unchanged. The unified job is an additional `Preview` check mirrored by nocobase-bot; do not change Studio's checks source or replace the existing checks with reports from the agent.

The companion unified-CI patch and bot registration must be reviewed and installed by their maintainers before this path can run. Removing the duplicate trigger does not register this repository with the bot. No source-repository `preview` label or source-repository deployment secret is needed.

Land the application integration and update candidate branches to include this publisher contract before enabling general bot routing. Older heads without the scripts or required source-identity mapping are unsupported; there is no fallback that publishes them without application acceptance.

## Dispatch and application contract

The proposed `nocoreach-ci.yml` uses `workflow_dispatch` with the same seven fields as [CustomerPortal](https://github.com/2013xile/nocobase-ci/blob/d6c1d6ebe58b83e7b7816e59e5544d5162b0f408/.github/workflows/customerportal-ci.yml): `request_id`, `event_name`, `head_sha`, `base_sha`, `target_branch`, `pr_number`, `skip_label`. Its run name must be `nocoreach-ci:<request_id>` and the mirrored job name must remain exactly `Preview`. The bot must forward only open, same-repository PRs, whatever their target, never forks or pushes. Its actual routing configuration and deployment are a maintainer-owned prerequisite, not included in this application change.

After protected-environment approval, trusted CI helpers validate inputs and check out the fixed head with `merge-pull-request: 'false'` into `nocoreach`. They reread the live PR to reject closed/fork/stale dispatches, then skip `no-preview` or documentation/test/CI-only changes without calling Studio. The source checkout token and PR-read token are revoked before any source dependency installation or script runs. The application is built at its own root with its own `packageManager` and lockfile; its CLI/Runner build hooks and `storage/exports/dist.tar.gz` layout are retained.

Run the application publisher from that source directory. `GITHUB_REPOSITORY` and `GITHUB_SHA` belong to the unified CI and must never identify an uploaded application build. Map these values explicitly:

| Publisher variable                   | Unified-CI value                                                     |
| ------------------------------------ | -------------------------------------------------------------------- |
| `PREVIEW_SOURCE_REPOSITORY`          | `nocobase/NocoReach` (exact spelling)                                |
| `PREVIEW_PR_NUMBER`                  | Validated `inputs.pr_number`                                         |
| `PREVIEW_HEAD_SHA`                   | Validated immutable `inputs.head_sha`                                |
| `NB_STUDIO_SERVER`                   | Unified environment's `NB_STUDIO_URL`                                |
| `NB_STUDIO_API_KEY`                  | Environment-only `NOCOREACH_NB_STUDIO_API_KEY`, only in Studio steps |
| `STUDIO_TARGET`, `STUDIO_NODE_MAJOR` | `linux-x64`, `24`                                                    |
| `STUDIO_CLI`                         | Absolute path to the CLI installed by the trusted CI job             |

The publisher checks `git HEAD`, App/release/deployment identity and fresh/reused archive checksums. `app ensure` and `deploy` explicitly name the source repository. Install the Studio-served CLI on Node 24 and use its native CI login with the key on stdin; never read or copy a management run's credential file. Install Chromium in the job before invoking the publisher. A missing/unready dataset or failed visitor/page check fails `Preview`; a skipped check is not a published preview.

## Required configuration before enabling the workflow

1. In **2013xile/nocobase-ci** GitHub **Settings › Environments › nocoreach-preview**, enable **Required reviewers**, choose a maintainer other than the person triggering the run, and enable **Prevent self-review**. Disable administrator bypass of protection rules. If the repository plan cannot enforce these protections, do not add the secret or run this workflow. Allow only the reviewed unified-CI workflow ref to deploy through this environment.
2. Before approving **every run**, inspect `inputs.head_sha` and the environment's direct source-commit link. The stable `Preview` job name is the bot protocol, not a head approval. Review that source commit's deployment/verification scripts, package scripts, lockfile and executable dependencies, together with the trusted unified-CI workflow revision. A new head or rerun needs a new environment approval. Reject stale or unreviewed runs; approve only the intended current head. The environment gate runs before checkout/install/build and before any step can receive its secret.
3. Store `NOCOREACH_NB_STUDIO_API_KEY` **only in this protected unified-CI environment**, never as a source/repository/organization secret. Use a repository-specific Studio CI key restricted by Studio permissions to ensuring/deploying/reading NocoReach preview Apps in the Preview environment. The App-name restriction in the script is not a permission boundary. Do not reuse Studio, CustomerPortal, main/demo deployment keys or any agent's management credential. Keep host CI as the repository's checks source.
4. Set the unified environment's `NB_STUDIO_URL`; confirm the job targets Linux x64 / Node 24. Configure the existing `NOCOBASE_APP_ID` / `NOCOBASE_APP_PRIVATE_KEY` integration for read-only contents and PR access to `nocobase/NocoReach`. Source access and Preview-check mirroring require the bot's GitHub App installation/permissions; their actual registration and configuration remain external prerequisites. Keep `studio` and its production workflows unchanged.
5. Studio's Preview environment must provision each `nocoreach-pr-<number>` with its own new database and persistent storage. Do not inherit production database connections, remote file buckets, Redis queues or provider credentials. The application has no need for live external credentials in a preview. Review all additional connections and remote services too.

These protections are external configuration, not created or verified by a YAML declaration. A repository administrator must verify them before installing the key. Environment approval grants the reviewed code access to this key, including any code it invokes.

## First deployment and controlled initialization

1. After maintainers install the unified-CI patch and bot route, use a runtime-changing same-repository PR and approve its exact head in the unified protected environment. Forks, stale/closed PR dispatches, `no-preview` and documentation/test/CI-only changes do not publish. The workflow checks out that SHA rather than a moving branch or merge commit.
2. The first run ensures `nocoreach-pr-<number>` and refuses to upload until `NOCOBASE_DEMO_MODE=true` is configured on that App or its Preview environment. Configure its own public origin/base path and isolated storage in Studio. Do not enable Demo Mode against an existing business database.
3. Rerun and approve that same reviewed head. CI deploys and checks identity/health, then fails with **Demo data is not ready** if the dataset has not been generated. This is an initialization requirement, not a ready preview. Record the App ID, deployment/release IDs, exact source SHA, archive checksum and evidence that its database/storage were newly provisioned.
4. An authorized operator opens the new preview URL directly in a browser. Demo Mode's native automatic Super Admin entry supplies the preview's own session; **Demo mode · Switch account** or `/demo-sign-in` provides the other visitor entries. No Studio management token, copied cookie or password is used. Open **Settings › Demo data** to inspect the status. Do not log or attach API bodies: they include synthetic account passwords.
5. Only after independently confirming this is the **new, empty, isolated storage**, generate its first dataset once with the preview's own administrator session. The management page is read-only. In that preview tab's developer console, use the native API below. It refuses existing, importing or failed state. Import itself performs business cleanup, so an empty plugin status alone is not proof that the storage is safe.

```js
const mount = location.pathname.match(/^\/nocoreach-pr-[1-9]\d*(?=\/|$)/)?.[0];
if (!mount) throw new Error('Open the independent preview App first');
const call = async (path, data) => {
  const response = await fetch(`${mount}/api/demoMode/data${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.ok)
    throw new Error(`Demo operation failed: ${response.status}`);
  return (await response.json()).data;
};
const before = await call('');
if (
  !before.enabled ||
  !before.available ||
  before.present ||
  before.state !== null ||
  before.records !== 0
)
  throw new Error('Not a new empty demo; inspect it without resetting');
await call('/import', { language: 'en-US' });
```

6. Poll the status with the following read until `state` is `ready`, `present` is true, `failure` is null, `finished` is true, and all four counts are positive. If generation fails or stays interrupted, inspect the preview's logs; do not blindly retry import, clear or reset. Existing previews whose dataset is already ready skip steps 5–6 entirely.

```js
const status = await call('');
console.log({
  state: status.state,
  present: status.present,
  failed: status.failure !== null,
  finished: Boolean(status.finishedAt),
  projects: status.counts.projects,
  accounts: status.counts.accounts,
  tasks: status.counts.tasks,
  opportunities: status.counts.opportunities,
});
```

7. Rerun the reviewed head through environment approval. CI may reuse the stored release for this commit: it verifies that release's App, commit and checksum separately, and reports the reused checksum rather than claiming the rebuilt archive was deployed. CI does not regenerate data.
8. Require the final **Preview ready** result. In a fresh browser tab verify automatic entry and **Demo mode · Switch account**, populated Insights, Opportunities and Tasks, a working task search, and a representative non-admin account's permitted project. Publish the URL and `/demo-sign-in` entry with the tested SHA and checks. A failed dataset, entry, page or effects check blocks readiness even when health is green.

## Failure and update handling

- New uploads must match the local SHA-256; reused releases are independently read and pinned by App/commit/checksum. A mismatch stops the job without another upload or rollback. An uncertain upload needs inspection of the existing release/deployment before retrying.
- An updated head always receives a new protected-environment job and exact-head review. Existing preview data/storage are retained. CI verifies the current dataset and pages, and never runs import/clear/reset.
- Initialization and real preview browser acceptance remain pending until the external configuration exists and the actual run passes. Unit tests and a local demo cannot establish the remote environment's protection rules or data isolation.
- These changes add no application request/poll/runner-claim queries, writes, locks or transactions. Verification issues a bounded set of reads and native demo sign-in requests per deployment; first generation is an explicit operator action on new isolated storage.
