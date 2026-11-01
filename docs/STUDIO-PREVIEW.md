# Pull request previews on Studio

A successful upload is not a ready preview. The workflow reports **Preview ready** only after verifying the release, generated dataset, native visitor entry, simulated external effects, Insights, Opportunities and the Tasks filter. The first deployment normally stops at the dataset check until an operator initializes its new storage. Existing previews are never imported, cleared or reset by CI.

## Required configuration before enabling the workflow

1. In GitHub **Settings › Environments › studio-preview**, enable **Required reviewers**, choose a maintainer other than the person triggering the run, and enable **Prevent self-review**. Disable administrator bypass of protection rules. If the repository plan cannot enforce these protections, do not add the secret or run this workflow.
2. Before approving **every run**, inspect the full head SHA in the job name and environment link. Review that commit's workflows, deployment/verification scripts, package scripts, lockfile and executable dependencies. A persistent `preview` label is only a request; it is not approval of later commits. A new head or rerun needs a new environment approval. Reject stale or unreviewed runs; approve only the intended current head. The environment gate runs before checkout/install/build and before any step can receive its secret.
3. Store `NB_STUDIO_PREVIEW_API_KEY` **only in this protected environment**, never as a repository/organization secret. Use a repository-specific Studio CI key restricted by Studio permissions to ensuring/deploying/reading preview Apps in the Preview environment. The App-name restriction in the script is not a permission boundary. Do not reuse the main/demo deployment key or any agent's management credential. Keep host CI as the repository's checks source.
4. Set environment variables `NB_STUDIO_SERVER`, `STUDIO_TARGET=linux-x64` and `STUDIO_NODE_MAJOR=24`. Keep `studio` and its production workflows unchanged.
5. Studio's Preview environment must provision each `nocoreach-pr-<number>` with its own new database and persistent storage. Do not inherit production database connections, remote file buckets, Redis queues or provider credentials. The application has no need for live external credentials in a preview. Review all additional connections and remote services too.

These protections are external configuration, not created or verified by a YAML declaration. A repository administrator must verify them before installing the key. Environment approval grants the reviewed code access to this key, including any code it invokes.

## First deployment and controlled initialization

1. Include the workflow on the candidate branch; after reviewing its exact head, label the same-repository PR `preview` and approve the protected environment job. Fork PRs are excluded. The workflow checks out that SHA rather than a moving branch or merge commit.
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
