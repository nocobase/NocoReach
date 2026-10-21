# NocoReach Changelog

## Unreleased — Insights as a conversation with the daily analysis

- Insights now reads as the daily analysis speaking, so it no longer looks like Opportunities or opens on a wall of text. The key numbers stay on top as tiles with their trend (at most five, only those with data), with Status (the standing facts, in a drawer) and All data (every data page, grouped) below them.
- Under the date, the daily analysis says how many decisions wait and which key numbers moved by 5% or more, with its notes folded. The opportunities waiting for a decision, the same ones as Opportunities › To do, follow as one line each with Hand off to agent and Ignore (five shown, the rest folded; the evidence stays on Opportunities), then the watches that ended that day, the tasks waiting for you and data that failed to sync.
- Earlier days fold into one line each, with how many opportunities were raised that day and where each went (handed off, awaiting decision, dismissed, expired), opening to the list and the watches that ended. Ask AI at the bottom opens the chat with the day's analysis named.
- The numbers, Status and the waiting tasks keep their own loading, failure and Retry. A change no analysis judged yet is still judged once in the background. Today's changes, with its standalone changes and their own hand-off, is gone: since #178 every change worth doing has an opportunity.

## Unreleased — Start card: playbook steps, article link, Change dialog

- The task start card's playbook line gains View steps: a drawer over the task page lists what the Agent does and what you check, with View or edit in Playbooks for the full page. The choices on the card stay as they are.
- The article to change links to where readers see it, in a new tab: the address found from the task's page, or one built from the target's page pattern for an article saved on the task (the header's Article does the same). Without a pattern the title stays plain text. The task page now receives each target's public page patterns, never its key or API address.
- Change opens a dialog with Publish to, Also publish to, New or Existing article and the article search; nothing changes until Save, and the card goes back to its one-line summary. When no article was found from the page, the line says why and Choose article opens the same dialog; the card no longer expands into the old two-column form.

## Unreleased — Full-width pages and Your invitations on demand

- Your invitations appears in the account menu, with a count, only when an invitation is waiting for the signed-in account. Inviting someone who already has an account adds them at once, so the entry was nearly always an empty page; the emailed invitation link still opens it.
- Your invitations and the role form (Members & roles › a role, New role) use the page's full width instead of leaving the right side empty; the role's name and identifier inputs keep a readable width. docs/DEVELOPMENT.md records full-width pages as a NocoReach rule.

## Unreleased — Verdicts and opportunities agree

- A change the analysis judges worth doing always ends up as an opportunity, so Insights › Today's changes › To do and Opportunities list the same things. When a task, an opportunity or an ignored opportunity already covers the change or its page, the verdict becomes "No action needed" with the reason (for example "Task T-32 is already on it"); otherwise an opportunity is written from the change and its verdict, marked as needing checking. Verdicts filled in afterwards go through the same check.
- Keep the page and the change on a task handed off on its own (Insights › Today's changes, data pages), so its start card finds the article to change instead of asking for one. Pages outside Site content are kept too.

## Unreleased — Automatic runs in plain words

- Settings › Scheduled tasks is now Settings › Automatic runs. The daily analysis card says what it does, "Daily at 09:00" with the timezone by name (China Standard Time rather than `Asia/Shanghai`), how the last run went (projects analyzed, suggestions written) and when the next one is. Change time opens a dialog over the list that also says when most data sources update in the chosen timezone; Run history opens a drawer that names each project instead of its id. Run now, Pause or Turn on, and Technical details (cron, Scheduler states, target, counters) are in the card's "…" menu. Pagination shows only when there is a second page.
- Data sources › Data health › View sync status gains a Frequency column (daily, weekly or manual). The daily analysis row says "Runs daily at 09:00 (China Standard Time)" with a Change time link to Settings › Automatic runs for those who may open it, and gives its next run; it no longer shows the cron expression or speaks of a workflow. The other automatic work is listed there per project rather than repeated on Settings › Automatic runs.

## Unreleased — Settings › Network at full width

- Settings › Network no longer caps its content at 48rem: the proxy card and the data source table use the page's width, as the other pages do, instead of leaving the right side empty.

## Unreleased — Ignored opportunities stay off Insights

- Keep the changes behind an ignored opportunity out of Insights › Today's changes › To do, whichever analysis raised the opportunity. Opportunities ignored from an earlier analysis used to come back there as changes to act on with Hand off to agent and Ignore.

## Unreleased — Article found from the task's page

- Find the article a task changes from its page instead of picking it from hundreds: the page address is read back through each publishing target's page pattern to a slug and looked up there. The start card shows the article found with Change; it is linked as the task starts.
- Decide where a change goes from where the page lives: a page no target holds goes to the website repository as a pull request (unless the playbook names a target), a blog post stays a new article in the playbook's target. Publish to, also-publish and the new/existing choice appear only after Change, when nothing was found, or when the targets could not be asked.

## Unreleased — English code comments

- AGENTS.md now asks for code comments in English, with interface elements named by their English labels. `tests/logic/comment-language.test.ts` parses every source file and fails when a file has more comments containing Chinese than `tests/logic/comment-language-baseline.json` allows (195 files, 595 older comments today); `COMMENT_LANGUAGE_BASELINE=lower` lowers the baseline after a cleanup and never raises it.
- `.github/workflows/pr-language.yml` fails a pull request whose title, description or commit messages contain Chinese, and runs again when the description is edited, without rerunning the tests.

## Unreleased — Page names shown once

- Top-level pages no longer repeat their name in the header beside the sidebar toggle: the name fades in there only once the page's large title has scrolled out of view.
- Pages below another one show their full path in the header, with the earlier levels as links back: Keywords › the keyword, Members & roles › the role, Scheduled tasks › Execution history (without the Settings group). Keyword details and the role form drop their own Back link.
- Below 768px the header shows the brand on top-level pages and "‹ the parent page" on pages below another one.

## Unreleased — Connection drawers in plain words

- Describe how each data source connects at the top of the drawer, in product voice instead of an AI's first person, followed by a What you need list; only the title stays pinned while the drawer scrolls. The Agent avatar and grey message box are gone from the top of the drawer: no AI is answering there.
- Remove the question buttons at the bottom of the drawer. They opened the online chat with the question alone, which knows neither the data source nor how NocoReach connects it, so it could not answer; help with connecting will come through the user's own agent and the NocoReach CLI.
- Correct the GA4 intro: choosing the Google resources does not start a sync; Sync now pulls the last 56 days by default.

## Unreleased — Why a data source cannot be reached

- When the server gets no answer from a data source, say which site, why (timed out, interrupted, refused, address not found, untrusted certificate, no response) and whether the request went through the proxy, instead of "the direct request failed". Proxy failures still never fall back to a direct connection.
- Connection panels, Google sync and authorization errors and the Skill link dialog link to Settings › Network; an untrusted certificate explains the company root certificate in ⓘ, and the Skill link dialog also offers uploading the folder instead.
- Direct public reads (website content, Skill links, public sources) report a refused, reset, timed-out or unresolvable site the same way as proxied ones, with status 502 and the original code.

## Unreleased — Memory: one Edit, and choose what generating reads

- Memory has one Edit (`/project/memory/edit`) that opens every item in a dialog instead of a pencil on each row; only the items changed there are saved, merged into the saved memory.
- Generate from the website and materials (`/project/memory/generate`) first lists the pages and knowledge base materials the AI will read — by default the home page and main pages, and the newest six materials — to remove, add (up to eight public https pages) or tick before generating. A changed list is kept for later drafts and for the weekly check; Use the automatic choice goes back.
- The memory list reloads when a draft or a check finishes, also when it finishes before the first status poll.

## Unreleased — Project knowledge in two tabs

- Split Project knowledge into Memory (`/project/memory`, the default) and Knowledge base (`/project/knowledge`) tabs. The Memory tab counts pending suggestions; the Knowledge base tab counts material.
- Memory: a line with how many items are filled and the length (a Too long tag over 3,000 characters), the AI's suggestions with the reason in one line and its examples behind ⓘ, then one row per item — project name, AI content language, nine sections — each edited on its own in a dialog with its own address (`/project/memory/<item>/edit`). Saving one item merges it into the saved memory on the server, so people editing different items keep each other's changes. Long items show five lines and unfold. The whole-card edit form is gone.
- Knowledge base: search, category and date order are kept in the address; Add material and each material's drawer have their own addresses (`/project/knowledge/new`, `/project/knowledge/<id>`); row actions sit behind "…"; Clear filters appears while a search or category is applied. On phones the list keeps the title, category and actions.

## Unreleased — Settings › Network for marketers

- Show the proxy's state first (in use or not set, server, sign-in) and edit it in a dialog; turning it off asks first.
- List every data source of the current project with its own Use the proxy switch and a Check access action that says, per data source, whether the server can reach it, and why not with what to try next. YouTube, Bilibili and Xiaohongshu are noted as read through collectors.
- Stop giving YouTube the default proxy, which made its Collector refuse to collect; an explicit YouTube proxy from before keeps its switch in the connection so it can be turned off.
- Reword the connection drawer's switch, link it to Settings › Network, and drop the save message's reference to an Advanced section that does not exist.

## Unreleased — Skills notes in ⓘ

- Move the three grey notes on Skills into ⓘ tips beside what they explain: the This project column, the Skill link field and the Skill folder field.

## Unreleased — Opportunity briefs

- Keep the list of pending opportunities on the left and read the selected one on the right: what happened, why it is worth doing, what to do and where, with priority, effort and confidence as tags and the limitations behind ⓘ. Handled opportunities open the same detail. The audience and goal are not shown.
- Remove the owner, executor and playbook choices from the Opportunities page: Hand off to agent uses the recommended playbook and makes you the owner, and both can still be changed on the task before it starts.

## Unreleased — The AIs in NocoReach, by role

- Agent page: three cards above the tabs present daily analysis, the chat agent and the execution agent by what each does, never does and needs, with whether it works now and one action to fix it. A three-step quickest setup shows while something is missing; enabling a discovered agent and making it the project default is one action.
- Tabs run in setup order (Models, Chat agent, Runtimes, Execution agent, Usage), each with one sentence on what it is for. "Online agent" and "Runner agent" are renamed "Chat agent" and "Execution agent" on the page and in the chat picker, which also says what each kind can do. The Chinese copy uses one term for a runner machine throughout.
- The separate Runner and model setup guides are replaced by the roles overview.

## Unreleased — Opportunities kept and not repeated

- Keep an undecided opportunity pending for 14 days after the last analysis that raised it, instead of expiring it the first day an analysis leaves it out; the menu count follows.
- Keep an opportunity's card, number and first-seen day when the analysis raises the same thing again in other words: the same changes cited and the same page, or the same title apart from its numbers. A card already handed off is not reused.
- Keep an earlier copy of an opportunity out of To do once a later analysis raised the same thing, or the same page, as another card, whatever was decided on that card.

## Unreleased — Agent page tabs

- Merge the Runner, Models and Usage menus into the Agent page as tabs (`/agents/runtimes`, `/agents/models`, `/agents/usage`), each shown only to holders of its existing grant. Tabs pair Runner agents with runtimes and online agents with models. The old `/runtimes`, `/models` and `/usage` addresses are gone.
- Guide setup on the Agent page: the Runner tab asks to add a runtime, start one, or enable a discovered agent until an agent is enabled, and the online tab asks to add a model service while none is configured.

## Unreleased — Article publishing to several targets

- Let administrators choose, per playbook, where new tasks publish: the default target, a specific target, or the website repository as a pull request.
- Publish one reviewed article to up to four other targets as well. Other targets are matched by slug (updated or created), leave out languages and fields they cannot hold, and publish, retry, rebase, export and report overwrites independently; the task card lists each target's state.

## Unreleased — Article publishing

- Preserve publication status when manually editing an article draft, and reject targets beyond the ten-target limit before saving configuration.
- Create new articles as drafts unless the reviewer chooses Published in the article editor, whatever the target's own default, and show status changes as words in the review.
- Keep an edited publishing target in its place and let administrators choose the default target new tasks publish to.
- Tell the Agent where a malformed result goes wrong (extra content after a complete JSON value, or an unreadable position) so it can correct the submission.
- Add publishing targets under Data sources: a NocoBase collection through its API, the new NocoReach article API protocol, or Markdown files in a GitHub repository. Each kind declares how it protects concurrent writes; credentials stay sealed on the server.
- Blog and article tasks can publish to a target instead of opening a pull request. The Agent drafts a structured article (per-language title, summary and body), the owner reviews and edits it field by field, and the server publishes only the approved fields after rechecking the article. Conflicting edits keep both versions for a new review; retries never write twice.
- For targets that export to Git, block publishing over Git-only edits, track the export before checking the live page, and block code changes to exported article files. Show an overwrite of a published article on its task for 14 days.
- Preserve the approved publication status in export and overwrite comparisons so a newly saved draft does not trigger a false overwrite warning.

## Unreleased — YouTube metadata-only collection

- Stop requesting and downloading YouTube captions in Collector. Keep video discovery, metadata and public metrics, with the existing bounded output and refusal handling.
- Remove the caption section from YouTube data rows and update connection guidance. Retain the protocol-v1 empty transcript placeholder for compatibility.

## Unreleased — Collector data page follow-up

- Move "Clear collected data" from the Xiaohongshu, Bilibili and YouTube data pages to their connection panels, and reduce the data page headers to the single read/search action used by the other Community pages.
- Reuse a collector report read today when its data page opens again; read it again on a new day, an explicit read/search, Retry, the end of a collection, or a connection-panel change.
- Update the YouTube authentication-provider tests to the two-step clear confirmation that failed CI after #146.

## Unreleased — Clear collected platform data

- Add project-scoped clear actions to Bilibili, Xiaohongshu and YouTube data pages with two sequential confirmations. Upgrade the existing YouTube connection-panel action to the same confirmation flow.
- Preserve collector settings and search criteria, enforce configuration permissions and session/revision checks, and reject concurrent collection. Clear saved metrics and provenance; YouTube also clears captions and pauses automatic collection.

## Unreleased — Request SQL measurement isolation

- Scope the access-key request cost test to its own asynchronous query context so background job transactions cannot cause intermittent CI failures. Retain zero-transaction and lock checks, add measurement calibration, and create an independent project fixture.

## Unreleased — Collector data page layout

- Lay out the Xiaohongshu, Bilibili and YouTube data pages like the other Community pages: a publishing trend chart, a table with right-aligned, server-sorted count and date columns, and a side card counting records by search term, video link or channel. Rows can be ticked and handed to the Agent. Platform caveats move into the header notes; unknown counts show "—".
- Add `sort`/`order` parameters and `trend`/`groups` fields to the `nrXiaohongshu`, `nrBilibili` and `nrYouTube` `report` actions. Add a Refresh action, a page-shaped loading skeleton and Retry on failed loads.

## Unreleased — Refresh saved Bilibili videos

- Refresh saved videos even when they no longer appear on the first search page, updating changing metrics and filling missing publication dates. Preserve known values on incomplete responses and retain bounded sequential collection.
- Adopt the current configuration revision after a successful refresh and record fresh metric timestamps.

## Unreleased — Login session preparation

- Update Authentication to `2.0.0-beta.10` with its required framework companions and port Default Template PR [#10986](https://github.com/nocobase/nocobase/pull/10986). Prepare the authenticated realtime connection before mounting business identity, caches and pages, preventing the initial permission invalidation from causing a second load and duplicate requests.
- Show localized retry and sign-out actions when session preparation times out. Preserve later permission invalidation, session isolation and protected dialog cleanup. The full template baseline remains `1.0.0-beta.68`; this is a selective source update from `beta.69`.

## Unreleased — Collector payload limits

- Raise collector response and output limits from 1 MiB to 20 MiB across application, subprocess and browser collection boundaries. Raise automatic content ingestion from 1,000,000 to 20,000,000 JSON characters while retaining its 500-record batch limit.

## Unreleased — Collector data pages

- Add Xiaohongshu, Bilibili and YouTube pages under Community. Each lists the saved notes or videos published in the selected period, compares publications with the previous period, sums the latest views, likes and comments, and can start a collection for members with the platform's use capability.
- Add `report` actions to `nrXiaohongshu`, `nrBilibili` and `nrYouTube` on a shared period helper, granted through each platform's use capability; the pages are granted to every role like the other data pages.
- Remove result lists from the connection panels, which now show the saved count and link to the data page. The Xiaohongshu panel reads `status` instead of `view`.

## Unreleased — Task draft navigation

- Remember navigation confirmation for unchanged task drafts, preventing repeated prompts after leaving a manual Agent result editor while preserving draft recovery, new-edit confirmation, and browser unload protection.

## Unreleased — Online task tools

- Preserve the application shell and active Agent conversation when a task link selects another project; reset only project-scoped navigation badge data.

- Preserve the current user name when online tools claim unowned tasks; remove redundant task conversion and reuse Runner status within each detail request. Skip status calculation for ordinary list entries outside the requested page.

- Open Markdown links to task details through the current router, preserving deployment paths, task project parameters and draft navigation guards; keep external links in separate tabs.

- Let online assistants list current-user tasks across authorized projects and inspect Runner readiness with clickable, project-aware task links.
- Delegate explicitly requested task starts and retries to Runner agents through existing business authorization, revision and idempotency checks; keep human review and publication in the task page.

## Unreleased — Stable restart and health retry tests

- Restart the timezone test application in a later second than the previous process, so Snowflake IDs cannot repeat on the same database.
- Wait for the asynchronous YouTube sync grant check before asserting it in the health panel test.

## Unreleased — Project members and capability roles

- Give projects their own members. Roles choose a project scope (the projects their holders belong to, or every project) and a short list of capabilities instead of individual actions with per-action project selections; the server expands capabilities into the existing action grants and resolves `$member` grants against project membership. Pages follow from capabilities.
- Collapse data source permissions into "use" per source (read, sync, search and test) and a single "configure sources" capability.
- Invite up to 50 addresses at once into the member role and chosen projects, with a per-address outcome; existing members join the projects directly. Edit a member's roles and projects together, and add a project's creator as its member.
- On upgrade, remove custom roles saved as individual actions, keep their holders as members, and add every current business member to every existing project. Built-in roles follow the capability catalogue at every start.

## Unreleased — Remove UI annotation tooling

- Remove the `@gchust/agent-annotations` development dependency, Vite integration, theme host, environment toggle, and obsolete test and documentation references to align with the upstream template.
- Business Agents, Runners, and task execution remain unchanged.

## Unreleased — Bilibili search detail enrichment

- Enrich up to 20 unique search discoveries with sequential Collector video requests, prioritizing recent publications and sharing the existing batch deadline and cancellation boundary.
- Preserve successful discovery results on optional detail failures, stop on throttling or access refusals without retries, and retain known metrics, titles and publication dates during incomplete refreshes.
- Retain per-metric collection timestamps so incomplete refreshes cannot turn stale Bilibili metrics into fresh analysis signals.

## Unreleased — Source publication ordering

- Preserve validated Bilibili search publication timestamps and precision, retain known dates across incomplete refreshes, and order saved/recent videos by publication before truncation with stable ID ties.
- Project YouTube publication dates into indexed database fields, backfill existing records, and sort before pagination with unknown dates last. Preserve known dates when refreshes return null.
- Cover Xiaohongshu Collector order and estimated-date boundaries; document the existing YouTube search keyword configuration.

## Unreleased — Application permissions, members and API keys

- Preserve collector configuration and connection navigation guards when syncing main. Authorize collector configuration by project action grants and hand conversation saves to the browser for session confirmation.

- Use framework permission sets as the application role source, with multiple-role assignments, explicit page/action grants, project data selections and protection for the final active administrator. Migrate existing members and retire unscoped default API keys atomically at release cutover.
- Apply the same authorization boundary to legacy APIs, task execution, online work and plugin surfaces while retaining task ownership, review and attachment rules. Recheck actor and owner execution grants in Runner admission after source preparation, while allowing read-only selection without preparation. Share the action catalogue and application/project classifier across runtime checks, the role editor and key scopes.
- Require application grants for shared Skill changes, including imports from Project Knowledge; keep project enablement scoped to its project. Project-limited keys cannot change shared configuration or another project's language settings.
- Add Members, Roles and API Keys under Settings. Use action permissions for settings controls and preserve domain administrator semantics for task ownership/review. Expose My invitations in the account menu before business membership. Open source drawers for their permitted actions, and independently check each connection control, health retry and project or application-wide network operation.
- Store one canonical business offer per invited email, with database-enforced deduplication, seven-day expiry, explicit acceptance, copy delivery, renewal and revocation. Bind new-account offers to public Users invitation tokens, keep existing-account offers identity-bound, and recheck current inviter grants and the original ceiling on acceptance. Recover interrupted issuance without duplicate authorization state.
- Serialize role definitions and assignments with a database transaction lock. Preserve each editor's opening role revision or assignments across background refreshes, and validate them with current grantors after locking so concurrent saves, deletion, membership changes and invitation acceptance cannot silently overwrite one another. Reject API-key membership changes through both the new and classic endpoints.
- Let active people manage their personal scoped keys; use independent service identities for organization keys. Recheck mutation authority under the management lock and validate organization scope against combined selected roles before creation. Keep credential changes, service identity retirement and audit atomic, and provide immediate rotation, stop and owner-authorized history after credential removal.
- Keep invitation links and newly issued secrets visible after a follow-up query error, in transient component state only. Filter retired key history by actual owner and type before loading event payloads.
- Remove the unmerged intermediate grant migration, unused administrator-only UI helpers, no-op task brief registration, redundant role queries and temporary measurement/export scaffolding. Keep regression coverage for actual authorization, concurrency, rollback and read-path cost invariants.

## Unreleased — Runner chat business access

- Let enabled Runner conversations discover and call existing NocoReach business actions, including task queries, creation, and execution, with the conversation user's permissions. Keep assigned-task snapshot/result credentials separate and recheck membership on every call.
- Hand off OAuth and header-based credential configuration to the browser instead of advertising operations that cannot receive their required credentials through chat.
- Preserve browser session confirmation for collector disconnections and YouTube connection changes or data clearing by handing those operations back to their connection panels.
- Keep task review, manual execution and publication attestations in the browser; conversation task mutations use an explicit allowlist so new commands cannot silently bypass human review.

## Unreleased — Calendar date ranges

- Data pages and Results: Custom picks its dates from a calendar instead of two native date inputs. An outline trigger shows the committed range in the interface language and opens two months side by side (one on phones); days after today cannot be picked, and the range applies only on Apply. The first click starts a range and the second ends it, and a link with only one valid end keeps it. Closing without Apply, a preset or navigation discards the draft. The URL (`days=custom&from&to`), validation messages and the 490-day limit are unchanged.
- Move `useMediaQuery` to `client/hooks/` so pages share it with the Agent chat panel.

## Unreleased — Collector connection settings

- Configure Xiaohongshu, Bilibili and YouTube Collector URLs and access tokens directly from Data connections, without restarting the application. Preserve deployment configuration for projects without an explicit override.
- Encrypt project-scoped credentials, redact tokens, bind saves to the initiating session, reject stale edits and prevent configuration changes during collection. Retain saved content, invalidate previous verification and preserve YouTube automatic read preferences after credential changes.
- Simplify connection panels around a ready Collector: remove the obsolete Xiaohongshu confirmation contract, unused setup guides and their translations. Resolve source configurations through one project-scoped Collector registry, store only credentials and their revision, and derive project metadata when reading.
- Keep simulated collectors read-only, preserve actionable errors and refresh changed sessions, and guard connection saves across navigation. Keep saved content readable when collector credentials cannot be decrypted.
- Preserve unsaved collection filters when Collector credentials change, refresh the source revision without remounting its form, and keep conflict recovery available after cancelling an edit. Recover from failed status refreshes, ignore superseded reads and errors, clear obsolete health notices and report unreadable local credentials accurately. Unchanged Collector saves no longer refresh the source panels.
- Restore keyboard focus without removing source buttons from the tab order. Show collector choices by their count, retain a usable selection when deployment collectors change, translate generated project labels at render time while preserving custom names, and include the linked Collector setup guides in source packages.

## Unreleased — Results dashboard

- Results opens on a dashboard of the project's own work for a period (28 days, 90 days by default, 12 months, all time or custom): what went live and what still waits to go live, how many live changes went up, down or stayed flat, the summed search clicks and views of the changed pages before and after going live, each live change as a bar with its status word, and up to ten results ordered for attention (down first, then work waiting for a person, then checks still to come). Site-wide metrics stay on Insights and the data pages.
- `nrTaskWork:board` returns the period's counts, page totals, changes and attention list from the existing task evidence; results gain `phase` (`live`, `pendingLive`, `delivered`) and the next checkpoint with its expected date, so work that never goes live reads as delivered instead of "no comparable data".
- Results › View all (`/results/all`) lists the same period over the dashboard: the task first, date order either way (`order`), status values that match the tags (phases included), and skeleton, empty, no-match and failure states by error type. Its own date inputs are replaced by the shared period; result drawers open over either view and close back to it without their checkpoint parameter.

## Unreleased — Task page for marketers

- Task page: one full-width column in three parts — why the task exists (one line of evidence, with all of it under View evidence), the playbook's steps with the owner, source and linked page, then one stage card for what the task needs now, and an activity timeline. The properties column, Run history and Deliverables lists and the in-page breadcrumb are gone; the shell header shows the trail.
- The stage card keeps its title and buttons in view while a long result scrolls. Documents show in full; a page change shows the Agent's summary and a before/after table of what visitors see; change requests are written in the card. After going live the card shows the effect at days 7 and 28.
- Pull requests, branches, file paths, check output, the Runner and model, error codes and the execution transcript move to a Technical details dialog (⋯ menu or the card's link). `?run=` links open it on their run. Release states, failures and the Agent picker are worded for non-engineers; with one Agent available the picker is not shown.
- Build results add an optional `visibleChanges` list (page, label, before, after); malformed entries are dropped. The task list subtitle no longer mentions Runner Agents.

## Unreleased — Demo opportunity coverage

- Add twelve authored opportunities and sixteen signals to the demo-only startup upgrade, populating the actual today/pending selectors, linked tasks, ignored decisions and watch records.
- Back up and preserve existing strategy content, retain user decisions on repeated starts, and verify page selectors against real SQLite data.

## Unreleased — Authored demo content

- Permit manually dispatched `demo/` branches in the fixed demo workflow, while retaining the main-only production deployment guard.

- Rename the predefined demo project to `nocobase.example` and install 20 individually authored editorial scenarios with eight project knowledge documents. Populate board states, revision/cancellation/archive examples and all six result filters with clearly labeled synthetic history.
- Upgrade only the initializer-owned project in explicitly marked demo deployments. Preserve edited tasks, archive untouched legacy fixtures, back up changed rows and commit content and its version marker atomically. Leave live/test deployments unchanged.
- Keep synthetic observations out of background effect tracking; verify new installs, upgrades, rollback on write failure, repeated starts, project isolation and result projections against real test databases.

## Unreleased — Project default Runner Agent

- Restore administrator configuration of the current project default Agent on `/agents/runner`, preserving task overrides, project isolation, and revision conflict checks.

## Unreleased — YouTube Collector migration

- Move production YouTube metadata and caption requests to the authenticated Collector protocol v1, preserving project-scoped storage, deduplication, retained history, retry classification and cancellation/late-write guards. Validate identity, freshness, bounded fields and nested transcript errors before accepting data.
- Resolve exactly one deployment-owned YouTube Collector per project. Fail explicitly for missing/ambiguous configuration, unsupported service, authentication failure and legacy selected/default proxy routing; never fall back to local yt-dlp or direct captions.
- Remove Python/yt-dlp from the NocoReach image and package; document Collector-first rollout and network-egress migration. Retain explicitly injected synthetic normalization without subprocess or live-network defaults.
- Add focused protocol, isolation, malformed-response, cancellation and migration regressions; keep the existing persistence and project-authorization suites.

## Unreleased — Durable search history

- Persist final, unfiltered web-search daily totals in existing date partitions; fill only missing dates across 90-day and annual ranges, without downloading annual query/page detail. Preserve historical totals across cache expiry and restart, and retain the existing recent seven-day scheduled refresh.
- Add administrator-only summary backfill and re-fetch through the existing Google sync queue. Preserve old values on failure, bounded retries, pause/resume, resource isolation and captured simulated transports. No new tables or migrations.
- Show recorded, no-record and missing coverage prominently. Keep omitted dates blank, preserve real zero values and hide incomplete comparisons. Load query/page/breakdown details independently on demand and query filtered or alternate search types across their actual date range.
- Clear both search summary and detail caches after connection changes, scoped to the affected project. Validate upstream rows at a typed boundary and retain pagination, error propagation and isolated detail-loading regressions.

## Unreleased — Reliable task results

- Add run-scoped `task result --content-file` submission with immediate field validation, immutable idempotent storage, and consumption only after normal Runner completion. Retain the final-summary fallback and existing business review/authorization checks.
- Support typed task-material citations alongside HTTP(S) sources. Normalize only known historical mount aliases and the producing task reference; tolerate only the exact Runner continuation footer and report actionable validation errors without echoing rejected values.
- Let task owners and administrators explicitly revalidate the latest format-rejected research/outline result into human review. Preserve original failures and audit recovery; reject stale, superseded, cancelled, repository-changing and already reviewed work.

## Unreleased — Keyword details

- Keywords › any tab: a keyword opens a full page over the tab it came from (`/keywords/detail?kw=…&kwLoc=…&kwLang=…`), after Ahrefs' Keywords Explorer: overview (volume with year-over-year and 3-month growth, difficulty with the top 10's referring domains, CPC and ad competition, intent, parent topic, SERP features), 12-month volume and the site's daily Search Console impressions and clicks, related keywords (related searches, phrases containing it, questions, the site's nearby queries), the site's pages Google showed for it and pages mentioning it without being shown, the top 10 with the site marked, and the weekly rank history when tracked. Save, Start tracking and Hand off to agent work from the page.
- `nrKeywordDetail`: `site` is free (saved record, rank checks, Search Console, Website content); `market` and `serp` run DataForSEO lookups when the page opens (about $0.04 for a new keyword), each reused for 30 days; a tracked keyword's top 10 comes from its latest weekly check. These lookups stay out of Find keywords' recent research.
- Fix: the 12-month chart was empty for keywords saved from AI suggestions (`volume` instead of `search_volume`).
- Data sources › DataForSEO: Change budget sets the monthly budget without re-entering the API credentials.
- Tabs reordered to AI suggestions · Find keywords · Saved · Rank tracking. NocoReach's page wrapper is no longer positioned, so covering child pages lay over the layout's main area.

## Unreleased — Agents plugin upgrade

- Upgrade Agents to `0.1.0-beta.11`, Runner to `0.1.0-beta.9`, and CLI Client to `0.1.0-beta.7`, with required framework peers. Bump the application CLI release to `1.0.0-beta.68` without changing template ancestry.
- Manage Runner and online agents in tabs under Agent. Remove the Project AI configuration page and preserve explicit task-level Runner selection.
- Run all business tasks through official Runner runs and one execution-record UI. Remove the online task runtime, task tools, AI flow stages, legacy startRun endpoint and retired-run recovery branches; this unreleased product provides no compatibility path for online tasks.
- Keep online agents for private conversations with read-only project and public-webpage tools. Preserve idempotency, cancellation, bounded execution, crash fencing and session isolation. Daily analysis continues to use the model gateway independently.
- Store each chat prompt once, reconstruct completed history in sequence order and stop polling terminal conversations. Refresh on focus or demand, preserve drafts, and use the shared API client. Distinguish safe model authentication, quota, rate-limit and network errors without exposing provider details.
- Present online conversations as user bubbles and continuous assistant replies, with collapsed tool and reply details, a pinned composer, IME-safe Enter submission, and scroll following that respects reading history. Merge streaming text before rendering Markdown and allow existing conversations to use their pinned model when the agent default changes.
- Choose online or Runner agents from one avatar/name menu in the composer, without Agent-type tabs. Reuse Runner conversations and history, retain transport-specific drafts and attachments when switching, and confirm before replacing a drafted conversation.
- Use the public model gateway and typed application records directly. Share initial-message and follow-up submission, idempotency and finalization; remove the separate model/store/executor ports and general-purpose text-preview layer.
- Remove unmounted standalone chat and floating launchers, their page-only layouts, project-default writes, duplicate task-run reads and unused lease metadata.
- Keep repository PR operations on GitHub CLI. Cover Runner claims, results, manual takeover, cancellation, chat authorization and compact history with application and component tests.

## Unreleased — Scheduled task management

- Allow each currently managed task to choose an IANA scheduling timezone. Persist the selection, recalculate future runs without changing pause state, and use the task's local date and the existing scheduler's DST rules for daily-analysis catch-up and success checks. Keep existing defaults until explicitly saved.

- Fill the available content height when viewing scheduled task history, keeping the list and detail scrolling within the page instead of limiting history to the list's height.

- Add live daily analysis time editing and idempotent manual triggering under Settings → Scheduled tasks. Keep settings in application storage and reuse Scheduler dispatch and history through a version-pinned pnpm patch maintained in this repository. Preserve paused schedules and prevent catch-up immediately after changing to a past time.

- Add application-owned scheduled task management under Settings, using the official Scheduler page permission and APIs. Show task configuration, scheduling timezones, enable/disable actions and paginated execution history with project result summaries. Preserve server-owned definitions and existing authorization assignments.

## Unreleased — Google report caching

- Reuse the bounded, transaction-aware GA4 report cache for Search Console performance, breakdowns, row details, countries, sitemaps, and local content/rank aggregates. Persist completed reports across restarts and share concurrent reads while isolating projects, resources, authorization, dates, filters, and simulated transports.
- Cache upstream history for six hours and partial results for five minutes, retaining original expiry timestamps. Keep synced frontend views fresh for one minute and indexing progress for thirty seconds; preserve running-job polling, manual retries, and invalidation after connection or website-content changes.
- Stop background Search Console breakdown requests on indexing/sitemap tabs. Restore same-session reports after refresh, retain all-time/custom dates, share concurrent token refreshes within the captured authorization scope, and bound cache entry, project, and memory bytes.

## Unreleased — Built-in marketing Skills

- New libraries start with 15 marketing Skills from coreyhaines31/marketingskills (MIT), pinned by `scripts/sync-marketing-skills.mjs`: seo-audit, ai-seo, schema, site-architecture, programmatic-seo, content-strategy, copywriting, copy-editing, launch, competitor-profiling, competitors, customer-research, community-marketing, cro and analytics. Each keeps its upstream text with `LICENSE.md` and its source; upstream evals are left out. Like the other built-ins they are off in every project.
- Built-in playbook steps name the Skills they need (for example Technical fix: seo-audit, schema and site-architecture), so a task brings them without turning them on. A Skill imported under the same name stands in for a built-in.
- An existing library gets the new built-ins once, on start or first read, skipping names already present; deleted built-ins never come back. A fresh application stays empty until Skills is first opened.
- The Agent is told that the project memory and knowledge are the product marketing context these Skills ask for.

## Unreleased — Consistent data time ranges

- Share GitHub's 7-day, 28-day, 90-day, 12-month, all-time and custom controls across data pages, removing the duplicate three-month option and normalizing old links.
- Query all saved history with explicit coverage dates and no previous-period comparison. Carry custom dates through website/content reports, caches and details; align content cutoff dates and preserve editable incomplete date inputs.
- Validate custom date ranges and expand daily GA4 report limits for long saved histories. Cover range selection, persistence, source reports and permissions-preserving read paths with component and backend tests.
- Keep native date segments in a local draft until Apply, preserving both endpoints while typing or deleting a segment. Validate complete dates, ordering and the existing inclusive 490-day limit before updating the URL and data queries.

## Unreleased — Analysis rule adjustments

- Persist up to five independent analysis schemes per project, migrate existing settings into the default, and activate exactly one with revision-checked mutations. Preserve scheme/configuration snapshots through daily insights and task evidence.
- Add editable custom rules and real AI-assisted drafting in the rule dialog. Require explicit draft fill and save; evaluate rules against bounded saved evidence with validated citations, distinguishing missing data and provider failures from no match.
- Keep source status inline, expose refresh, and protect cancelled/stale AI drafts and cross-scheme edits. Add SQLite integration, component and production-component browser checks.

- Add authenticated generic content ingestion with bounded schema recognition and evidence-validated model suggestions. Persist project-scoped capabilities, generate editable rule catalogs dynamically, and include unfamiliar channels in daily signals without user field mapping. Preserve valid batches and overrides across retries; test an unregistered source against SQLite.

- Match reusable content-discovery and metric-threshold rules to source capabilities. Feed saved YouTube, Bilibili and Xiaohongshu samples into daily signals, excluding disconnected, stale, missing and previous-scope data. Keep metric timestamps and sample limitations explicit; preserve all existing rule settings.

- Show complete rule descriptions, switches and parameter values using existing product components, retaining the full catalog, defaults, team focus and watch settings.
- Preview natural-language adjustments with the configured online model, review explicit before/after values, and apply only after confirmation. Validate known rules, parameter ranges and ranking bounds; reject stale writes across manual and AI edits.

## Unreleased — Reddit search diagnostics and retries

- Preserve safe provider/task diagnostics and distinguish valid empty searches from malformed or billing-uncertain responses. Use the provider-recommended 120-second SERP timeout without changing cache identity.
- Persist per-term request plans in existing snapshots. Retry explicit zero-cost transient failures at most twice, after one and six hours; retain successful terms and indefinitely block uncertain Reddit runs across cache expiry and month boundaries.
- Preserve historical posts and advance complete coverage only after every term succeeds. Cached responses retain their original query date. Show attempts, successful queries, scheduling and timezone consistently in both Reddit pages and data health.

## Unreleased — One default proxy

- Settings › Network sets one proxy for the deployment (address, optional username and password); every project and connection uses it unless a connection's "Use the proxy" switch is off. The per-connection profile dropdown and the profile list remain only in mock deployments. Browser collectors never take the default, and a failed proxy still never falls back to a direct request. [Design](docs/NETWORK-EGRESS.md)
- On upgrade the most used live proxy becomes the default and every connection keeps its route: connections that were direct are switched off, and those on another proxy move to the default (logged on the server).
- Skills page links follow the same routing, as knowledge links already do: GitHub repositories use the GitHub connection and other SKILL.md URLs the website connection.

## Unreleased — Studio timestamp migration recovery

- Interpret unmapped historical wall timestamps as UTC during the PR #87 migration so existing Studio deployments can start. Preserve explicit per-field provenance, absolute instants, invalid-value validation and transactional preflight.
- Amend the existing migration with maintainer authorization; completed installations skip it and may report checksum drift. Add SQLite host-timezone and Postgres upgrade regressions.

## Unreleased — GA4 request reuse

- Reuse website reports and row details for six hours within the authenticated workspace, respecting the server's expiry instead of extending it. Persist GA4 history in bounded project-scoped database caches keyed by the actual query, independent of unrelated sync partition writes; reuse results across browsers and server restarts, expire partial reports after five minutes, and roll relative reports over on the next business day.
- Reuse today's data for ten minutes and realtime data for one minute across page and browser tab switches; pause hidden polling and defer failed retries until the next interval.
- Back off failed historical report and row-detail reads for five minutes across navigation, retaining previous data and allowing explicit reloads to retry immediately.
- Coalesce in-flight GA4 report reads and token refreshes, and bound per-property report concurrency, counting each report within a batch. Preserve project/session isolation and queued network contexts.
- Invalidate project report caches after Google connection changes, including Search Console-only resource switches, and fence late responses. Pin row details to the displayed historical cutoff, normalize their query identity, and shorten caching whenever any historical subreport is missing. Today and realtime responses now share their server expiry with the browser.

## Unreleased — PM-375

- Load actual application migrations in snapshot and partition SQLite tests; exercise both fresh installation and proven historical timestamp upgrades without relaxing the absolute-time contract.

- Preserve absolute task update timestamps across browser and server timezones. Add a SQLite/Postgres migration for ten business tables, including media expiry, with complete provenance preflight, atomic conversion and unchanged constraints.
- Reject implicit wall-clock parsing and invalid imported dates; preserve nullable history and require a proven source timezone for classic wall timestamps. Keep list/board rounding and use an empty display for unknown times.
- Truncate valid classic Postgres microseconds to API milliseconds without rounding or changing timezone provenance. Verify real Postgres source snapshots and target migration rollback, and reject duplicate/stale source mappings before mutation.
- Add database, API, DST, backup restoration and browser regressions. Document the pre-merge maintenance window and first-start configuration in [timestamp migration](docs/TIMESTAMP-MIGRATION.md); production provenance and other database dialects remain unverified.

## Unreleased — Network profiles

- Integrate the newer GitHub history and trends collectors with source-scoped Profile snapshots and clocks. Preserve the redesigned GitHub/website reports; allow supported repository-independent GitHub queries for long project domains without relaxing unknown-operation or mutation rejection. Extend both all-source projects and paused-history regressions to cover the integrated flows.

- Remove the application's retired mock settings form and unused host UI adapters. Reuse a standalone read-only indicator while preserving the independent plugin's settings API and legacy bookmark redirect. Move standalone form coverage to test-only primitives and migrate the opt-in Reddit scenario test to Network Profiles; paused-project guidance now points to the active configuration.

- Cover every available connection entry for newly created mock projects: requested package/forum/competitor targets, project-aware social/media/SEO responses, Discord forum messages and recent GitHub history. Keep legacy catalogs and real transports intact. Add a catalog-to-acceptance guard and full application regressions for all 21 entries, including local source-code configuration, with zero provider I/O assertions.

- Capture credential-free project targets with mock runs and queued jobs. Generate website/Google fixtures from the project domain and supported GitHub responses from the requested repository; preserve legacy replay and fail-closed routing. Keep unsupported mock sitemap errors actionable instead of reporting a missing sitemap, and cover blank-project collection/persistence.

- Reuse network profiles for simulated upstreams: add a mock profile type, per-connection and atomic project-wide selection, immutable mock operation/Google job snapshots, and scenario-aware DataForSEO query reuse. Preserve real proxy transports, credentials, DNS/security checks and dedicated mock dataset isolation; migrate old enabled/paused projects without activating real routes. Redirect the retired mock settings page to network profiles. [Usage and upgrade contract](docs/NETWORK-PROFILES.md)

## Unreleased — PM-368

- Add manual task creation through the task list and the shared typed `task create` API/CLI, preserving task numbering, ownership and pending execution defaults.
- Persist private image/video attachments with draft ownership, session and project checks, bounded uploads, atomic linking and expiring draft cleanup. Support native file paste, picker/drop fallback, authenticated previews and byte-range video reads.
- Document clipboard limitations and idempotent CLI retries in [manual tasks](docs/MANUAL-TASKS.md).
- Retry durable draft media deletion claims before expiry and let the create form recover when background cleanup has already removed an attachment.

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

- Pages list: visits, search clicks and impressions now come from every synced day (GA4 page and Search Console query × page partitions) instead of the snapshots' top-60-page and query samples, so every page has its own figures (0 when it has none) rather than "—" for most. Pages on a site GA4 does not track read "Not tracked". New sortable "Visits change" and "Clicks change" columns compare with the period before, once it is fully synced. Built once per synced data and range and saved like Search performance; the samples remain the fallback.

- Read the GitHub history's long lists by the next page GitHub links instead of by page number. GitHub refuses a page number past 100 on the issues list (422, "use cursor based pagination"), so the history of a repository with more than 10,000 issues and pull requests (nocobase/nocobase on Studio) failed every time and the page showed 补全失败. Verified against nocobase/nocobase: 102 pages, 10,116 issues and pull requests. A failed history is read again six hours after the failure, or at once from 重新补全.

- Retain task text drafts across in-app navigation within the authenticated session, isolate drafts by project/task/editor, and clear only the saved or discarded area (PM-281). Refresh and close remain protected while any draft is pending.
- Bind retained task drafts to their source artifact, expose earlier and closed-task drafts for recovery, guard authentication-boundary navigation, and keep pending saves mounted. Confirm draft deletion before removing text and separate hooks from components without lint suppressions. Restore affected locale test callers and allow new semantic copy without fabricated historical aliases.
- Stabilize the affected Agent reassignment regression by opening the selected dropdown with its keyboard interaction and waiting for the option before asserting failed-save behavior.
- Navigate the application brand directly to the insights landing page so retained task drafts prompt once, without a cancellable root redirect leaving an empty page.

- Pages list: add pages with visits or search data that the site's sitemap does not list (GA4's top pages and Search Console's pages on a connected site, of a page type it keeps), marked "Not in sitemap" with their figures. On Studio, www pages such as /cn/solutions/all-in-one (~1,000 visits) and /cn/blog/timeline (~1,600) were missing because nocobase.com's sitemap does not list them.

- 访问: note data that may be off, by rule, in an amber note under the figures with why and where in GA4 to fix it: a channel with at least 5% of sessions engaged at under 10% and under a third of the site's rate (likely bots; on Studio, Unassigned at 0.6%), with the sessions it gained while the site fell; a key event rate of 20% or more, naming a key event that fires on most visits; and 10% or more of sessions without a source. The suspect channel is marked in the channel card and in the change sentence, and the key event rate figure is marked. Not yet on Insights.

- 访问: say where the picked figure's change came from, in one sentence under the eight figures, computed by rule. Views and key events split over channels (with each one's share) and pages; sessions and new users over channels and landing pages; active users only rank channels (they do not add up across channels). A channel that moved the other way by a fifth of the change or more is named, and then shares are left out. Rates and averages are not explained. The period report reads channels, pages and landing pages for both periods for this (three more GA4 reports), and the saved view key gains a version so today's saved view is rebuilt with them.

- Reload into the new build when a tab left open across a deployment cannot load a page's files ("Unable to load page … route"). The previous build's files are gone after a deploy, so such a tab failed on its next page until reloaded by hand. At most one automatic reload a minute, and none without session storage, so a real failure still shows the page's error. Registered from the application's client service provider; the template's route component is unchanged.

- 访问 channel shares: drop the separate "of which AI assistants" line. GA4 now groups AI assistants into its own default channel, so the card showed two different AI shares (AI Assistant 1.1% and NocoReach's source-name count 1.2%) with an explanation that no longer matched. The card keeps GA4's channel, labelled AI 助手 and highlighted; ChatGPT, Perplexity and others stay one by one under Traffic acquisition → AI assistants.

- 访问 Today card: the figures, the comparison with yesterday and last week, and today's sources now stop two hours before the last hour GA4 has data for, since GA4 is still filling those in (on Studio they read 63 and 10 views against 119 and 188 the day before, turning a flat day into ▼21.5%); the hourly line draws those hours dashed. Today's sources use the same hours as the sessions beside them. A failed GA4 time zone lookup is retried after five minutes instead of leaving the card on UTC hours for a day, is logged, does not cap the hours by a guessed clock, and is labelled "time zone unconfirmed". The realtime events list counts events only: the Realtime API refuses event names with active users, which left the list empty.

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

- Drop the Insights navigation badge, which repeated the Opportunities count, and keep badge counts visible while they refresh so switching menus no longer blinks them. [Count contract](docs/NAV-BADGES.md)

- Integrate PR #59 with the beta.68 route-name navigation badge adapter, preserving its refresh stability and Opportunities/Tasks-only mapping. Retain the template's `99+` display and collapsed corner dot; the Insights display scope still awaits owner confirmation. [Count contract](docs/NAV-BADGES.md)

- Redesign the GitHub page's Our repository tab in the shape of Traffic (user feedback: it copied the first NocoReach's page and showed the repository's own description). The header describes the page; the repository links from the range line. Eight figures (new stars, new forks, views, clones, commits, active contributors, issues opened, PRs merged) each show the change against the previous period and pick the daily line below; figures that need the full history say whether it needs a token, is being read or failed, instead of showing "—". Three cards follow: community health (merge and close medians, outside shares, open issues and PRs, watchers, each against the previous period), where visits come from (referring sites by kind, AI assistants included) and what the repository is made of (languages, topics, contributors and releases in all). One table with tabs lists referring sites and popular pages (against the snapshot a week before, a row opening its line over the saved snapshots), contributors, issues and pull requests opened in the period, releases and discussions; each tab sorts and searches, and referring sites, pages, issues and discussions can be ticked for the Agent. New stars and forks count only additions. Issue and pull request titles, links, comments and authors of the last 400 days are now kept with the history, which existing projects re-read once.

- Rebuild the Downloads page after the first NocoReach's product adoption page, in the shape of Traffic and GitHub. One figure per package (npm and PyPI downloads, Docker Hub pulls gained between daily samples) and one for the GitHub release files, each with the change against the previous period, picking the daily line below; a growth-index view compares how they move. Three cards follow: versions and releases (each dist-tag's version and age, the newest image tag and release, and how much was published in the period), downloads by version (npm's last 7 days, grouped by version line; hidden when npm's endpoint gives nothing) and where it runs (the platforms the image tags are built for, PyPI's Python versions and systems). One table with tabs lists packages (a row opens its days; ticked rows go to the Agent as before), versions, Docker tags and release files, with release-line filters for versions and tags. The package source now also keeps, per package and replaced daily, npm's dist-tags and version publish times plus last week by version, PyPI's versions and 30 days by Python version and system, and Docker Hub's newest 1,000 tags; npm's package document is read with a 10 MB limit, the only read above the shared 2 MB.

- Search performance shows everything Search Console's Performance report has, in the shape of Traffic (user request; GSC's Indexing and Sitemaps follow as sub-pages in the next change). A search-type switch covers web, image, video, news, Discover and Google News; web keeps reading the daily sync, the others are read from Search Console for the selected period (Discover and Google News have no queries or positions). The four figures pick the daily line, now also for CTR and position. Three cards break the period down by country/region (a click filters the page), device and search appearance, read live when the page asks and kept six hours. The table gains Rising, Falling and New (queries or pages by clicks against the previous period, like Search Console Insights' trending items, which stay here rather than under a second "Insights") and a Breakdown tab (country/region, device, appearance, date); a query or page opens its days against the previous period and the pages it shows with (or the queries a page shows for). The synced report now also reads the previous period's query × page rows, for the comparison.

- Downloads: add Docker release coverage, as the first NocoReach's product adoption page had it. Per release line of an image (latest, releases, version lines, beta, alpha…), the card shows its tags, tag × platform builds, the CPUs they cover, the largest single-platform image and the latest push, over the newest tags read daily.

- Search performance gains Indexing and Sitemaps sub-pages beside Performance (`?view=index`, `?view=sitemaps`), bringing in the rest of what Search Console's API offers (user request). Search Console's page indexing report has no API, so Indexing is built from the URL Inspection API: the Content pages inside the property are inspected through the project's Google connection, 25 every ten minutes and at most 500 a day per project (Google allows 2,000), never-checked pages first and each page again after a week; results and one count a day are kept in `nrSnapshots` (`search-index:<id>`), and opening the page before anything was checked starts the first batch. It shows indexed, not indexed, canonical mismatch and rich-result issue figures (each picking the table's tab), the daily counts, why pages are not indexed (a reason filters the table), when Google last crawled them and the rich result types found; one table with a page's whole result in its detail (verdict, reason, crawl time and agent, robots.txt, indexing, fetch, Google-selected and declared canonicals, sitemaps, referring URLs, rich-result issues, a Search Console link), and ticked pages go to the Agent with Optimize page. Sitemaps lists the Sitemaps API's submitted sitemaps (read when asked and kept six hours) with the files under an index, last submitted and read, status, errors, warnings and submitted URLs by type, the sitemaps NocoReach read from robots.txt that Search Console does not list (Not submitted), and per sitemap how many checked pages are indexed. The existing `webmasters.readonly` scope covers both APIs. Simulated data gains URL Inspection and Sitemaps routes for the fictional property.
- Let the Studio deployment's health check wait for the app to restart: after Studio reports success, network errors and non-2xx responses are retried every 10 seconds for up to three minutes (within the existing ten-minute window) before failing with the last status. Identity checks, release/commit/checksum assertions and the no-redeploy/no-rollback rule are unchanged. Previously a single early probe (HTTP 404 while restarting) marked a good deployment as failed.

- GitHub history: one GitHub request that does not complete (or a GitHub server error) no longer fails the whole history read; each page is tried four more times, 2 to 30 seconds apart, as rate limits already were. A history read in full stays shown when reading it again fails, with the reason in the notes, and is tried again after six hours; on Studio the re-read that added issue titles had failed on one dropped request and hidden commits, contributors, issues and pull requests. Projects whose history was hidden that way show it again without a new read.
- GitHub and Downloads: drop the strip of daily average, peak and last 7 days under the trend chart, which read differently from the rest of the data pages (user feedback); the figures above the chart and the tables keep these numbers.

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
