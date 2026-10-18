# Article publishing

Blog and article tasks can publish a structured article to a configured **publishing target** instead of opening a pull request. The writing steps (outline, draft, rewrite, review) are unchanged; only the change step's deliverable and the release differ. Code and page-layout tasks keep the pull-request flow.

Administrators configure targets under Data sources › Article publishing. Operator instructions in Chinese: [ARTICLE-PUBLISHING.zh-CN.md](ARTICLE-PUBLISHING.zh-CN.md). The HTTP protocol a site implements for the `http` kind: [ARTICLE-API.md](ARTICLE-API.md).

## Model

- `shared/article-publishing.ts` defines the article model (`slug`, `status`, `locales: { <locale>: { title, description, body } }`, Markdown bodies), the target schemas and presets, and each kind's capabilities.
- `server/nocoreach/articles/` holds the providers behind one interface (`provider.ts`): `nocobase-api.ts` (a NocoBase collection through its resource API — the same requests as the CMS pages, not direct database access), `http-protocol.ts` (the NocoReach article API), `git-files.ts` (Markdown files in a GitHub repository). `targets.ts` stores targets per project in `nrVariables`, sealed with their credentials; the browser receives views without credentials. `downstream.ts` checks the Git export of a target that exports to a repository. `delivery.ts` publishes a proposal.
- `server/nocoreach/execution/article-flow.ts` connects this to the task flow; `service.ts` only calls into it.

| Kind           | Concurrency                                                          | Idempotency       | Notes                                                                                                  |
| -------------- | -------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| `nocobase-api` | check before write (compare `version` field, by default `updatedAt`) | lookup by slug    | NocoBase has no conditional update. Action-bound workflows only run when listed in `triggerWorkflows`. |
| `http`         | conditional (`baseVersion`, 409)                                     | `Idempotency-Key` | See [ARTICLE-API.md](ARTICLE-API.md).                                                                  |
| `git-files`    | conditional (file blob SHAs; fast-forward-only ref update)           | lookup by slug    | Front matter or a JSON metadata file for title and description.                                        |

## Task flow

1. Before start, `linkArticle` reads the article (outside the business transaction) and stores an immutable snapshot (`nr-task-article:*`). `startTask` freezes `work.delivery` (`{ kind: 'article', targetId, articleId|null, sourceKey }`): the linked article, a chosen target (`delivery: { targetId }`, new article), the first target for `blog-post`, or `delivery: 'repo'` for a pull request.
2. The change step runs in mode `article`: no repository, read-only Runner, capability `article.draft`. The source goes to the Runner as the `article.json` material. The result's `article` is validated against the target (locales, mapped fields, slug for new articles) by `task result` and again on acceptance; a draft that changes nothing is invalid. The artifact keeps the proposal: `draft`, `changes` (field paths), `baseKey`, `baseVersion`.
3. Review compares each changed field with the base. `editArticleDraft` saves a new artifact version. On a target with a status (`supportsStatus`), a new article is a draft unless the reviewer chooses Published; the editor offers the choice and the server defaults a missing status to `draft`. Approval binds the artifact; `w.release` becomes `publishing` with a fresh idempotency key.
4. Publishing runs after commit (and from `tick()` for an interrupted attempt), outside transactions, and records the outcome under the task lock:
   - The target is read first. Changes already present are adopted (a retry after an unknown outcome never writes twice).
   - A field changed in the target since the base **and** changed differently by the draft is a conflict. Changes to fields the draft leaves alone are kept; only the draft's fields are written.
   - With a downstream export, a body or metadata field whose Git copy differs from the target and whose latest commit is not the exporter's blocks publishing (the export would replace a Git-only edit).
   - States: `exporting` (downstream) → `verifying` / `not_seen` → `live`; or `publish_failed` (`retryPublish`), `publish_conflict` (`rebaseArticle` keeps the approved draft, rebases it on the current article, records the conflicting fields and returns to review), `export_late` after six hours.
5. For 14 days after publishing, the written fields are compared with the target hourly; a difference is recorded as `release.article.drift` and shown on the task.
6. A build pull request touching a file a target's exporter owns cannot be approved (`pr.protected`); the Runner is told the protected templates.

Mock deployments simulate the release as before and never call a target.

## Guarantees and limits

- `http` and `git-files` targets cannot overwrite a concurrent change. `nocobase-api` checks just before writing: a save that lands between the check and the write (about a second) can be overwritten, and an editor who saves an old form after publishing overwrites the published version. The second case is detected afterwards (drift) and shown on the task, not prevented. A database-level revision check in the CMS would remove both; it is not part of this change.
- The NocoBase CMS export to Git is unchanged. Git-only edits to articles other than the one being published can still be replaced by that export, as before.
- Tags, categories, covers and other relations are not written.

## Tests

- `tests/nocoreach/article-publishing.test.ts`: providers and publishing against in-memory NocoBase, article API and GitHub stand-ins (`article-fakes.ts`): concurrent edits, unknown outcomes, slugs, downstream divergence and export, ref races.
- `tests/nocoreach/article-flow.test.ts`: the task flow end to end with the fixture of `task-flow.test.ts`.
- `tests/components/article-publishing.test.tsx`: settings panel, review, editor and drift notice.
