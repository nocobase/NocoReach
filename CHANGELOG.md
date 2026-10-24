# NocoReach Changelog

## Unreleased — One place for instructions to the Agent

- The start card no longer has its own optional note: the activity's message box serves the same purpose, and before the task starts its placeholder says the Agent reads it when the task starts. Existing tasks keep their note, and the server still accepts one.
- What a run reads as the person's messages keeps those left before the start (the first five) with the latest five, oldest first and within 6,000 characters, so an instruction given at the start does not drop out as later messages pile up (`runNotes` in `execution/flow.ts`).

## Unreleased — Articles in several languages: the primary first, then the translations

- A publishing target's first language is its primary language: its card reads "Primary language English · other languages Chinese, Japanese", and its form has a Primary language choice that moves a language to the front.
- The start card names the task's languages ("Languages: English (primary) · Chinese · Japanese"). Change lets the person pick this task's primary language and leave languages out; every language of the target is chosen by default.
- With two or more languages, the Agent writes the primary one only, and change requests touch only it. Its review card reads "The English version is ready; approve it to translate it", and approving it ("Approve and translate") publishes nothing yet: the Agent translates it into the other languages ("The Agent is translating into Chinese, Japanese"), the translated version ("The translations are ready; approve to publish them all") is reviewed with a tab per language, and one Approve and publish publishes them all. Before approval the review says which languages follow.
- Tasks started before this, and tasks with one language, write every language at once as before.

## Unreleased — Related tasks in groups

- The task page's Properties card lists related tasks in a section of their own below the properties, in groups: Previous step (this task was handed off from it), Same opportunity O-n (tasks changing other places), and Next step. Each task is one row (its number, its title on one line, its status tag) that opens it. A task is listed once, in its closest relation; empty groups and an empty section are left out. The previous and next steps now carry their number and status from the server too.

## Unreleased — Watching: the current value in the colour of its change

- Opportunities › Watching shows each change's current value in the colour the analysis rule gave it (red for a drop that hurts, green for good news, also when the good news is a drop), in the Value column, without "Now" before it; the grey line under it still says where it started. Before #198 the colour came as a chip beside the title and the value was repeated in plain text; now it shows once. A change without a figure reads "—" in grey.

## Unreleased — Demo environment

- Add a dedicated demo deployment enabled with `NOCOBASE_DEMO_MODE=true`, using the published Demo Mode plugin. Settings › Demo management provides one page for importing, resetting and clearing demo data, configuring daily resets and managing demo accounts; its menu and route are available only while Demo Mode is enabled. The same lifecycle operations are available through `demo-mode data status|import|clear|reset` in standalone installations.
- Provide Chinese and English datasets with two projects, connected data sources, site and market reports, opportunities, knowledge, tasks across execution and release states, conversations, inbox notifications and AI usage history. Reports follow consistent scenarios and dates relative to today; resets retain the selected language and refresh the data. Ordinary installations are not populated automatically.
- Let visitors switch demo accounts from the account menu and try roles restricted to the demo projects, including a demo administrator. Reset and clear preserve the acting administrator's identity, session and management access; imports reject collisions with existing accounts.
- Enforce read-only access by default, with administrator-configured collection write exceptions that still respect business permissions. Skills and Playbooks browsing does not persist missing built-ins or require a write exception, and preserves edited and deleted Skills.
- Enable integrated demo chat with server-declared local reads and configurable policies. Simulate data collection, business analysis, Agent drafts and publishing after human review; demo project requests use local fixtures, tasks never dispatch to real Runners, and publishing records a simulated release. Disabled simulations refuse execution instead of falling back to external services.
- Restrict imports, resets and clears to enabled demo deployments. Clear all project business data, including visitor additions, orphan records, attachments, credentials, conversations and task notifications, while retaining system accounts, configuration and the environment model. Failed imports use the same cleanup boundary.
- Scope session cookies to the complete application mount and support root-mounted API paths.
- Align Demo Mode `0.1.0-beta.2`, App Client `4.0.0-beta.3`, Agents `1.0.0-beta.23`, Jobs `0.1.0-beta.4`, Runner `0.1.0-beta.18` and CLI Client `0.1.0-beta.15`. Release the application CLI as `1.0.0-beta.70` so existing installations receive the compatible client. Rebuild the CLI and Runner distributions with the application and deploy the server before upgrading installed runners.

## Unreleased — Read an article full screen

- The article review card has a Read full screen button beside Preview | Changes. It opens the article on a page of its own (`/actions/:taskId/article?lang=en&view=preview`), at reading width with nothing beside it, under a slim bar with Back to task, the languages, Preview | Changes, and the review's actions (Approve and publish, Request changes, Edit directly). Editing there uses the full width for the editor and its live preview. The page opens from its address or in a new tab, its trail reads Tasks › T-n › Article, and Back to task or Esc returns to the task where it was scrolled. Feedback and edits started on either page are the same drafts.
- The status help in Chinese, Traditional Chinese and Japanese names the Published option by its current label.

## Unreleased — A new article reads as one

- The article review card opens with tags instead of a sentence and a tab with a diff block for the address and the status: the target by its own name (a mark tells a CMS from a Git repository), New article or Update article, and the status it is published with (Save as draft, Publish publicly, Make draft). A new article adds its address; a changed one names its title, and its address only when it changes. Other targets get the same row after "Also to". Conflicts and post-publish drift show a changed address or status inline.
- Language tabs carry the language's name only, without a change count. A changed language is read as Preview or Changes, without the Show before link and its separate view of the earlier version; a new article, or a language the article did not have, has one version and no switch. Once live, a new article's card says "New article" with View article instead of listing changed fields.
- A language with no text in the draft or the article is left out of the tabs, with a line under them: "Only English was written this time." for a new article, "This article has no Chinese version." for a changed one.
- An article's review card no longer asks for release notes, and its live card shows none: no publishing target receives them (a Git target writes a fixed commit message), and the task's record keeps the Agent's summary. Page changes that open a pull request keep them.
- In Chinese, Traditional Chinese and Japanese, the Published status reads as a state rather than as the verb.
- Every review card's subtitle names the version only ("Version 2 · 10-16 18:29"), without "Agent", which Properties already shows; a version a person made adds "edited by hand" or "completed by hand".

## Unreleased — Current situation lists what is worth caring about, from the analysis rules

- Insights › Current situation now lists, in this order, what is getting worse (red), what to handle (amber), opportunities and share of voice, each line only when its number is above zero. Besides its own lines it adds what sixteen analysis rules find in the saved data now, with the switches and thresholds of Settings › Analysis rules, so the list and the daily analysis use the same standard: pages losing search clicks, competitors with a new release or new site pages, AI platforms mentioning competitors more, competitor repositories gaining stars fast; pages with many impressions and few clicks, pages with many visits and few key events, pages with traffic not updated in a long time or with little content, AI platforms mentioning you without citing your site; related searches starting to rise, popular Hacker News posts, X posts with high engagement, topics the community keeps asking about, sites that doubled visits to your repository and your new releases. A line opens what its rule found. A rule switched off adds no line.
- Hacker News mentions and new Reddit posts in the last 7 days and downloads in the last 28 are added with their change, since the metric cards show only five numbers and these were cut once Search Console, GA4 and GitHub were connected. X mentions show their change against the week before.
- Average CTR (no comparison to judge it by), saved keywords (an inventory) and the single competitor line (now two rules) are gone; pages not updated in a year are now the analysis rule's pages that still get traffic. Rankings this week counts as getting worse only when a keyword dropped.
- A rule item that sums up several things (an X post among the high-engagement ones, a week's releases, a term's rising searches) carries how many, so the counts read as posts, releases and searches rather than rule items.

## Unreleased — Current situation reads as a list that fits its column; quiet links in grey text

- Insights › Current situation is a plain list: each row is a short label on the left (Google interest, Pages not updated for a year, Rankings this week, Competitor updates · last 7 days, X mentions · last 7 days) and its value on the right in tabular figures, with no icons or logos, in the small size the metric cards' labels use (at the conversation's size the column competed with it). Counts that need attention are amber; a change is coloured by its direction as on the metric cards (up green, down red, a zero plain); the rest stay plain. Rows are still buttons that open the source, with the detail on hover. The title is 14px semibold with its ⓘ. The Needs attention and Normal captions are gone: the lines to deal with come first, and their coloured values set them apart.
- The list shows the rows its column has room for and puts the rest behind "Show all N", so the column no longer scrolls on its own: on wide screens it has the window's height, all fourteen rows of the demo data at 860px. Collapse folds them again. The rows' hover background no longer makes the column scroll sideways.
- Lines whose numbers are all zero are left out (no queries close to page one, no competitor updates, no ranking moves, 0 critical audit issues); lines without numbers, such as AI search not asked yet, stay. "0 critical audit issues" also no longer reads as needing attention (the audit marks itself amber when it has warnings), here and in the "N need attention" line Current situation folds to while the side panel is open.
- The logos added to Current situation in the icon tidy-up are gone again, and with them `SourceLogo`'s grey `mono` option, which only this list used. Data sources and the other pages keep their coloured logos.
- Links have two styles in one place (`client/components/reach/reach.css`). `.nr-link` is the action link, blue on its own. `.nr-link-quiet` is a link inside grey text: one step darker than the text, no underline until hover, when it turns blue and underlined; `.nr-quiet-links` gives every link in a block that style. Both show a focus ring for the keyboard. The Insights subtitle ("Analyzed every day at 08:00 using your analysis rules.") uses the quiet style for both links, and links that were underlined grey or styled one by one now use one of the two: dialogs, empty states, field and alert descriptions and the sign-in pages use quiet links; standalone links such as Sign in again, Proxy profiles and links in Markdown results use action links.

## Unreleased — Skill summaries in every UI language

- Skills shows the 18 product Skills' "when to use" as a short summary in the UI language, in the list, in search and in the Skill drawer, whose ⓘ shows the original text the Agent reads. Names, bodies and the description the Agent gets stay unchanged; edited and custom Skills show as written. The sync script now unescapes quoted YAML descriptions, which removes stray backslashes from the bundled community-marketing description.

## Unreleased — Review, then Publish

- The step where a person approves a change is named Review instead of "Review and publish", and the step after it, where the system merges or writes to the CMS and confirms the page is live, is named Publish instead of "Live", in the task header, start card, Opportunities, Playbooks and the playbook editor's note. The flow and the number of clicks are unchanged.
- The review card's button reads "Approve and publish" ("Approve and simulate publishing" in the demo) instead of "Publish".
- Built-in playbooks name their final review step with `common.review`, as the system already did when it adds one. Tasks started before keep their stored names but show the new ones: `playbook-snapshot.ts` treats `playbook.reviewPublish` as `common.review`. Custom and edited playbooks keep their own step names.

## Unreleased — Folds that say what they show and open into view

- Technical details › Runs no longer shows "Source snapshot for this run" for runs that read no forum posts (every run but community replies), where it opened a single grey line out of view. A run that read posts lists them under "Posts the Agent read": each topic with its post count and whether it was complete, the first five shown and "N more topics" for the rest.
- Every fold (`Reveal`) keeps its label with a chevron once open instead of turning into a bare "Collapse", and scrolls what it opened into view. A live change without release notes no longer offers an empty Release notes fold.

## Unreleased — Task header: the steps are tags again

- Under a task's title, the playbook's steps are a row of tags joined by chevrons again, as before the one-layout change: done steps ticked in green, the current one outlined (violet for a person's step, blue for the Agent's), the rest grey. The grey "Now: …" text after them is gone, since the highlighted step says where the task stands. Nothing else in the header changed.

## Unreleased — One opportunity, a task for each place to change

- Hand off to agent on an opportunity whose changes point to several places (pages to improve or fix, a release to announce, community posts awaiting a reply) first lists one task per place, with its title ("Update Top 11 Open Source No-Code AI Tools"), page and playbook; untick the ones not to do now. One task is created per ticked place, and Opportunities shows the opportunity with its tasks instead of opening one of them. An opportunity with one place is handed off as one task, as before. The same rule applies on Opportunities, on Insights and to a hand-off asked for in a conversation (every place without a task).
- The opportunity lists its tasks with their states and a count per state; on Insights its line reads "6 tasks · 1 done". Places that no open task changes yet can be handed off later from the opportunity.
- A task's Related tasks list the other tasks of the same opportunity with their states, linked to the opportunity. Its brief starts by saying it is one of several tasks of the opportunity, the one place it changes and what the others change, and to keep one approach across them; its Agent reads the changes about its own place only. Its Performance and its article lookup use its own page only.
- There are no parent tasks: the opportunity is the grouping, and the task list and board stay flat. Tasks handed off before this change keep their single task (T-34 stays as it is); its opportunity can hand off the places left.

## Unreleased — Competitor activity: only problems the person can fix

- Removing or editing a competitor clears its errors at once. Each competitor keeps its own errors, and the source's last run (Data health, the Activity tab) is derived from the competitors still listed, also when it is read, instead of waiting for the next weekly look. On Studio, Data health still showed Competitor activity failing with "Baserow website: No sitemap found" after Baserow had been removed.
- A competitor's website without a readable sitemap is no longer a failure that asks to change settings: its card shows an ⓘ beside the website ("No sitemap was found, so new pages on the website cannot be followed for now. GitHub is followed as usual."), Data health stays healthy, and its GitHub repository is read as before. A wrong address, a missing or private repository and network or proxy problems remain failures with Change or Retry.
- Before giving up on a sitemap, discovery also tries `/sitemap.xml`, `/sitemap_index.xml`, `/sitemap-index.xml` and `/wp-sitemap.xml` when the sitemaps robots.txt names do not open. A site whose sitemap reads makes no extra requests. This applies to Site & product › Pages too.
- Add competitor no longer splits memory's free-text Competitors field on punctuation, which offered half-sentences and single words (permissions, deployment) as names. It offers the competitors AI detect found and checked (each with a website or a repository), less those already listed, and a chip fills the name, website and repository; with none, the row is not shown. No other place splits memory text into a list: Trends, X and Hacker News split terms the person types into an input, and Trends takes competitor names from this list.

## Unreleased — Competitors: a lookup that did not complete is tried again the next day

- Search & market › Competitors kept a site's failed DataForSEO lookup for 30 days, like a successful one: its error stayed in the site's drawer and its traffic stayed empty until the monthly refresh. On Studio, our own site still showed `Operator "$gte" is not supported for Field "createdAt" of type "datetime"` from a lookup on 2026-10-09, before the classic filter bridge learned datetime comparisons (#13); DataForSEO lookups have worked since. A site whose last lookup did not complete is now due again a day later, at the daily refresh or when the page is opened. Only the failed parts cost again: DataForSEO reuses completed runs, and an uncertain run still blocks its query for the reuse time.
- A site's drawer no longer says "Search data is still loading." under the error when its lookup failed.

## Unreleased — Opportunities' tables fit and sort

- Opportunities › Handled no longer scrolls sideways: the actions column was too narrow for Restore, so the table overflowed its card, clipping the number and leaving a blank above Restore. Number, Where it went, First found and the actions have fixed widths; the title takes the rest, truncated with the full title on hover. On a phone the number and first found drop out, and a change's chip hides so its title shows.
- Every Handled column except the title sorts, with the arrows the other tables use, and the sort is kept in the URL (`sort`, `order`). Where it went sorts in a meaningful order: pending, needs confirmation, in progress, handed off, done, closed, dismissed, expired, no action needed. Changes without a number or first-found day stay last.
- Watching's deadline sorts too, soonest first; its other columns are free text. Switching tabs clears the sort.
- Restore in Handled and in Watching's Recently ended is an undo arrow, explained on hover, instead of the word; not the refresh arrows, which read as refreshing the item.

## Unreleased — A result's drawer without follow-ups, in one text size

- A result's drawer no longer offers Follow-ups or the full-width "Create follow-up" button (2026-10-23 user decision: the flow ran too long). The follow-up page, its routes, the `result-create` page permission, the `createFromResult` capability and the `nrStrategy:createFromResult` action are removed. Opportunities and tasks raised from a result before keep showing where they came from and keep working.
- The drawer is laid out in three parts instead of a block of text: facts as a short list (Status, Went live as a date, Changed pages with an external-link mark, Original task), then Data change with the 7-day / 28-day switch and refresh on its label row and the waiting note in a light box, then What was done with the summary as plain text (no Markdown markers). One text size throughout.
- The comparison block (the result drawer, the task page's effect detail and a result's source panel) shows its outcome as a tag beside the windows, column headers aligned with their numbers, and every note in the same small grey text.

## Unreleased — New task: Organize with AI

- Tasks › New task opens on one field, What you want done, with Organize with AI and Fill in manually. Organize with AI makes one call to the chat model in Model services (the one the daily analysis and the chat panel use, not a local agent) and fills the form for editing: a title starting with the action, a description in three labelled parts (Background, What to do, Completion criteria) in the project's AI language, and a Why this task sentence or two (checked like the background, kept as `evidence.why` for the task page's Why card) and a Suggested playbook preselected from the project's playbooks and kept as the task's suggested playbook. Restore original text goes back to what was written, asking first when the draft was edited; Fill in manually opens the form as before with the idea as its description. Nothing is created until Create; the task records "Found by <name>" as before.
- The background cites figures only from the pages the idea names (by a quoted address, words in a page's address or title), with their visits and search clicks for the last 28 synced days, read from saved data and only for people who may open Site & product › Pages; nothing is fetched for a draft. A background sentence citing a figure the model was not given is left out, so an idea with no matching page gets no figures.
- Without a chat model, Organize with AI is disabled with an ⓘ naming AI team › Agent › Model services (a link for those who may change it); Fill in manually keeps working. An unusable answer is 422 and asks to rephrase or fill in manually; a failed call is 503. One draft runs at a time per person (429), with a 90-second limit and at most 4,000 output tokens.
- `ManualTaskInput` takes an optional `why` (at most 300 characters), stored as `evidence.why`; Fill in manually does not ask for one.
- `POST /nocoreachTasks/draft` checks the new `nrTasks.draftManual` action, which the Tasks capability grants with `nrTasks.createManual`; existing roles gain it when NocoReach starts. It is browser-only, like the other new task commands. Simulated deployments answer it with the `task-draft` fixture.

## Unreleased — Articles reviewed as their readers see them

- The article review card opens with a preview of the article: the title, the description as the lede and the body rendered with its headings, lists, tables, code and images, at a reading width and size like Medium or dev.to. Preview and Changes switch per language; Preview is first when the body changed or the article is new. Show before flips to the version the change was written from.
- External https images load (no Content-Security-Policy restricts them, locally or on Studio) without sending the reviewer's address; relative images and links are read against the article's page on its site. An image that does not arrive shows its alternative text and Could not load. Markdown is rendered without raw HTML.
- Edit directly writes the body beside its live preview (side by side from 1024px, Write and Preview tabs below), and so do a document's Edit directly and a document written by hand with I'll do it myself.
- The Agent's report is summary first: at most three plain lines (the article's `summary`, else the first paragraph of its notes), with the full report behind Full notes. The page change's What changed shows three lines with Expand. Article runs are now asked for a short reviewer summary that does not repeat the before and after title and description, and build runs for a release note of at most three lines.

## Unreleased — Task page: a failure notice, a short Why and copy without positions

- A failed step shows one error notice: an icon and "The Agent could not finish this step", the reason in a sentence (with "failed N times in a row" as a short fact), what to do next, and Technical details. Its actions are Try again, Switch Agent (opens the Agent picker in Properties) and Message the Agent (focuses the activity composer). Completing an Agent's step by hand moved from the card to the ⋯ menu as "Complete this step manually", offered while the step is not running.
- Tasks keep a short reason as `evidence.why` (plain text, at most 300 characters). Hand-offs send it as `why` (GitHub Hot's repositories send one built from the star counts); an opportunity's short reason is used when none is sent. The Why card shows it first, then the opportunity's reason, the first signal, the result, and otherwise the first sentence of the objective or brief (`firstSentence`: no "Goal:" label, links, list markers or Markdown, at most about 80 characters, cut at a word).
- Copy no longer points at positions ("above", "below", "top right"): it names the place instead, such as Properties, Activity or Performance, in all ten languages.

## Unreleased — Results lists only work with an outcome; a closed task never reads Completed

- Results (the overview, All results, a result's drawer and the counts) lists only tasks that produced an outcome: their change went live, or their delivery finished (done, or its execution recorded), even if archived afterwards. Tasks cancelled before going live, work archived before it finished (including the old-workflow archive) and work still waiting for review, approval or publishing stay in Tasks. "Waiting to go live" is no longer a phase of Results; the Live card says how many more were delivered. Simulated work (the demo install) follows the same rule and stays marked as simulated.
- A cancelled task, or one archived before it finished, reads Closed everywhere: the Results subtitle, Insights, Opportunities, and what the online assistant's task tools report. One archived after it finished reads "Completed · Archived". `taskStanding` on the server (`execution/model.ts`) and in `shared/task-pending.ts` apply the same rule.

## Unreleased — Current situation's marks in one grey

- On Insights, every line of Current situation starts with its source mark in the same grey and size: brand logos (Google, Search Console, Discord, Slack, X) no longer show their brand colours beside the grey icons, which made the column look cluttered. `SourceLogo` has a `mono` option for this; Data sources and the other pages keep the brand colours.

## Unreleased — Steadier tests in CI

- Insights: a question sent, or the side panel opened, before the page has read the owner's conversations joins the day's conversation instead of starting a second one for the day; on a slow connection Send used to act as if the day had none.
- The Bilibili, Xiaohongshu and YouTube connection panels act on the first click of a button that has just appeared (Read now, Disconnect and the rest), which could be ignored while the permission that showed it had not reached the handler yet.
- `classic-import-app.test.ts` stops NocoReach's timers before counting imported rows: the analysis timer's catch-up wrote two extra snapshots when the test ran across second 10 of a minute.

## Unreleased — Agent page details

- Who does the work no longer shows a row of column headings (screen readers still read them); each row already says what it holds.
- What went wrong, or how the last task ended, is a small line under the agent in its own row ("Last task 10-22 21:54 did not finish") instead of a line of body text below the row.

## Unreleased — Task runs survive NocoReach restarts

- A task run whose Runner lost its lease while NocoReach restarted (every deploy restarts it) is recorded as interrupted by the restart instead of blamed on the computer. NocoReach keeps the times it started (`nr-app-starts`) to tell the two apart.
- The Agent step is started again once for each restart, as the system's Try again; the activity says so and the stage card says why it runs again. Review and publishing are never started again by themselves; an interrupted publish says the update interrupted it.
- When the step could not start again, the card says the server was updating and offers Try again first; these runs no longer count toward "failed N times in a row". Technical details › Runs gives the restart time and the official reason.

## Unreleased — The classic import keeps NocoReach's timers off half-imported data

- While `pnpm nocobase app import-classic` writes, NocoReach's timers (sync, analysis and the rest) skip their firings, so none acts on a project before all its rows have arrived. The analysis timer used to catch up the day's analysis on partial data and write `daily-analysis:<id>` and `signals:<id>`, which could end up beside the classic rows with the same keys. Each import call renews a five-minute hold and the last one ends it; if the command stops midway, the timers run again five minutes after its last call.
- The import first waits, up to 30 seconds, for background work already running, so `--replace` does not clear tables under a running sync or analysis; if the work is not done by then, the command stops before anything is cleared and asks to try again shortly.
- A daily analysis the Scheduler fires during the import is recorded as cancelled in Settings › Automatic runs; the analysis timer catches the day up after the import.

## Unreleased — The chat panel reads every data page

- The chat panel's assistant has a read-only `query_data` tool covering every source a data page shows: Search Console (queries, pages, striking distance, rising and falling, countries and devices, one query or page in detail), GA4 traffic tables, site pages, the site audit and indexing, GitHub and GitHub trends, downloads, saved keywords with the site's rank, rank tracking, keyword suggestions, Trends, competitor activity, saved AI search lookups, Forum, Hacker News, Reddit, X, Discord, Slack, YouTube, Bilibili, Xiaohongshu and public web sources. It takes a period (or from/to), filters for keyword, page and country, a sort, a limit and an offset, and answers bounded rows with the page they come from, the data cutoff, the period and the one before it, the total and the next offset. Each source goes through the service method its page calls, so the numbers match the page, and is read only after the asking user's own permission for that page's action; a source they may not open answers accessDenied without stopping the others. Nothing is synced, inspected or bought: Trends reads the saved check instead of the page's view, indexing waits until its page has run the first inspection, and AI search lists saved lookups only.

## Unreleased — Task page: one layout for every state

- The task page has one skeleton in every state: a two-line header (the title with its T-number in grey and the status Tag on the right; then one grey line with the playbook's steps and where the task stands now, such as "Agent Change → Review and publish (you) → Live → Watch · Now: Waiting for you to start"), the card for what to do now and the activity on the left, and ✦ Why, Properties and Performance on the right, in that order. Below 1280px they stack as Why, Properties, now, Performance, Activity.
- The long Why strip under the title is a ✦ Why card with the reason in a sentence or two and View evidence; while a change waits for review it reads Why this change, as on the website's demo card.
- Four text styles only (page title, card title, body, grey secondary text) and one card shape (same radius, padding and spacing). Cards no longer hold boxes inside boxes: the before/after table, diffs, conflicts, reply drafts, the last change request and What changed are drawn with rules, tints and labels instead.
- Start after review: the card's title and Confirm start share one row; the brief is plain text with Expand when long; the playbook is a full-width select with its description and View steps below; Notes (optional) is a full-width one-line field that grows as you type.
- Activity and the message to the Agent are one card: the timeline, then a one-line field with Send.
- The status Tag in the header is the one the task list and board show (`TaskStatusTag`).

## Unreleased — The daily report waits up to ten minutes

- The daily analysis gives its report call ten minutes instead of the provider's default four. A large project's report takes 65–140 seconds; on 2026-10-23 the model service ran about 2.6× slower and NocoBase's report was stopped at four minutes twice ("The call was stopped."), while the smaller Retool project finished. The short calls (style rewrite, judging one signal) keep the four-minute limit, and a project's run is now held for 30 minutes instead of 10 so a slow run is not started a second time.
- A report stopped at its limit now says so in the reader's language ("The AI service gave no complete answer within 10 minutes") on Insights and in Automatic runs' history, instead of the provider's English text.
- Automatic runs' history no longer repeats a failure as the Scheduler's summary ("项目 1：…") above the same failure named by project.

## Unreleased — A table's filters are a segmented control in its toolbar

- Line tabs only switch a page's sections, under its header (2026-10-22 decision D1). What a table lists is chosen in its toolbar with the square grey segmented control, on the same row as its search: Website & product › Pages (All 658 | Blog 375 | Docs 199 …), Search performance (Close to page one | Queries | Pages | Rising …), its Index and Sitemaps, Traffic's reports, GitHub's and Downloads' tables, Keywords › AI suggestions, AI search's questions and Competitors › Domain lookup. They drew a second row of line tabs inside the card, which on Search performance sat right under the page's own tabs.
- `DataTableTabs` draws that row: the segments (a `TabsList` with the new `segmented` variant, styled in styles.css like `Segmented`), its ⓘ, then `tools` (search and other filters) and `actions` at the right. A tab's description is its ⓘ (decision D5). The separate `DataTableToolbar` row under it is gone on those pages; on a narrow screen the row wraps.
- Search performance's "Queries ranking 5–20…" line under the toolbar joins the Close to page one ⓘ (decision D5).
- The same control for the other in-card choices: keyword details' Related keywords, Analysis rules' areas, and the "how to create" choice in New Skill and Add knowledge.

## Unreleased — Agents 1.0.0-beta.18 and the NocoBase framework it requires

- Upgrade Agents to `1.0.0-beta.18`, Runner to `0.1.0-beta.15` and CLI Client to `0.1.0-beta.13`, with the framework versions of Default Template `1.0.0-beta.76`: App Server `3.0.0-beta.2`, App Client `4.0.0-beta.1`, i18n `2.0.0-beta.1`, Notification `2.0.0-beta.0` and the matching plugins. The template source is not merged; its marker stays `1.0.0-beta.68`. The application CLI release moves to `1.0.0-beta.69` so installed CLIs and runners fetch the new archives.
- Deploy the application before updating runners: protocol 12 runners are refused by an older server. Drain active runs and back up the database first. Three Agents migrations only add columns (runner quota, conversation metadata and chat-list visibility); rolling them back is refused once a conversation has metadata, so restore the backup instead.
- The Runner chat panel follows the Registry `agent-chat` block at `1.0.0-beta.18`: replies render as ordered AI SDK message parts with collapsible reasoning, tool approvals and clearer sending, waiting and failure feedback. The composer is disabled while a run is open (Stop ends it), and "Use another agent here" / "Switch back" are gone with the plugin's fallback and restore operations. Conversations started before the upgrade can be read but not continued.
- The plugin's built-in online agent, listed when a default chat model exists, is kept out of the Runner panel; online chat still goes through NocoReach's own service. A new Runner conversation cannot be sent until a Runner agent is chosen, so the server never falls back to that agent, and choosing one keeps the draft and the pinned context.
- Members › Roles: Authorization `1.0.0-beta.30` adds a `revision` to permission sets and returns their fields in a different order when read than when created, so the role revision is now hashed over sorted fields. Without this, deleting a custom role or saving it again answered "changed" every time.
- Refine is gone from the client runtime: the unused Refine data table and the five `@refinedev/*` packages are removed, and the app title is no longer set through `app.refine`.
- The Scheduler patch moves unchanged to `1.0.0-beta.19`, whose patched files are identical to `1.0.0-beta.17`.

## Unreleased — Tasks and results: plain cards, skeletons, and the application's own controls

- Tasks › By Agent: a card waiting on you is a normal card with an amber "You" tag and a grey tag for what it waits for, as the board and the list say it; it was the only card painted amber, with the only solid tag on the site.
- An empty column says "No tasks" on the board and in By Agent; By Agent said "Nothing running or queued", and the Chinese board wording is plainer.
- While they load, the task list, a task page, the playbook list, a page's detail panel and a task's Performance show skeleton bars instead of "Loading…" text; `ListSkeleton` takes a `label` for screen readers ("Loading tasks").
- A task's activity shows a placeholder bar for a person's name until the members have loaded, instead of "Member" that turned into the name a moment later.
- The playbook to start a task with, the next playbook to continue with and Search Console's sync range use the application's dropdown instead of the browser's own.
- A result's source opens its evidence with the site's "show more" button instead of the browser's ▶ disclosure.
- The unused task-detail breadcrumb styles are removed.

## Unreleased — Data cards: one empty look, one tile, one chart colour, one name for each thing

- An empty table says so in one muted sentence, as an empty card does, instead of an icon over a title: Bilibili and YouTube showed both on one page.
- AI search's and Results' metric tiles are the data pages' tile: AI search's "Appears" share is the line under the number ("10% of all questions"), not brackets beside it; Results' numbers lose the "items" unit and the larger size.
- Single-series charts and sparklines use the main chart colour: Forum's new topics, X's posts, Discord / Slack messages, Trends › Watched keywords and Competitors' search traffic were teal, violet or orange.
- One name for each thing: Competitors' "Add or remove competitors" is "Manage competitors" as on Trends; the Competitors table marks our site "Our site" as keyword details do (was "Us"); Bilibili's and Downloads' Published column says "Published" like YouTube's and GitHub's; Downloads shows npm's latest and beta tags as "Latest version" and "Beta".
- Dates go through `formatDate` / `formatDateTime` everywhere they were written by hand: a task's activity and stage cards ("10/22 20:16"), the task list's update time and Knowledge's last check ("10/19"), Skills, and the connection panels' last-synced lines, which showed the browser's full date and time.
- Rank tracking's keyword column is narrower so the table fits 1,440px without scrolling sideways.
- Traffic's date range sits right under the header, as on every data page, with Today below it; a report's breakdown (by channel, source, city…) is a dropdown in its toolbar instead of a second row of buttons under the tabs.
- Forum categories show their change as ↑/↓ like every other list, not "previous period 44".
- A page's Performance check in its detail panel is an outline button; as a ghost button it read as a heading.

## Unreleased — Notes in ⓘ, one status line, one description per page

- Every note under a card or chart title is an ⓘ beside the title (2026-10-22 decision D5): a `Section`'s description, Keywords › keyword details (History, Related keywords, Our indexed pages, Top 10, Rank history), Results (Changes, Latest results), Settings › Network (Proxy, How data sources connect), a task's Performance before its first checkpoint, Bilibili / YouTube / Xiaohongshu's Publishing trend and Sources, AI search's topic setup and Competitors › Activity's first setup. Titles no longer carry notes in brackets: X's chart is "Posts mentioning the product per day" with "Reposts are not counted" in its ⓘ, Trends' chart is "Weekly interest" with how 100 is set in its ⓘ.
- The grey help lines under query forms and tabs are ⓘ too: Keywords › Find keywords (what each method searches), AI search › Ask AI (each model asked separately) and API keys (what a personal or organization key may do, now beside the page title).
- Search performance › Index and Sitemaps tiles no longer repeat their ⓘ under the number; a warning's "does not block reading, but worth fixing" moved into its ⓘ.
- Analysis rules' AI adjustment and Rules sections no longer repeat the scheme name under their titles: My schemes above marks the scheme shown.
- A status line says when its data was updated with one word, "Updated" (decision D2), instead of Last success, Searched, Read, Last searched, Last read, Last checked, Last viewed or Collected; how often it runs is in its ⓘ. Reddit's two lines are one ("Search term: NocoBase · Updated 10-14 16:08 ⓘ", the next search in the ⓘ); Rank tracking's line moved out of the table card, above it, with the weekly check in its ⓘ; Keywords › AI suggestions says "· Updated 10-12". Xiaohongshu and the connection panels say "Search term:" like the other sources.
- Search performance, Competitors and GitHub keep one description for the page and all its tabs (decision D3), saying what each tab holds; switching tabs no longer changes it.
- Competitors › Activity says once, above the cards, which competitor could not be read; the cards no longer repeat "Not read last time, see above".

## Unreleased — One look for tabs, choices, refresh buttons and table headers

- Every tab bar looks the same: a thin rule under the row, the tabs flush with the page title, the open one in black over a 2px line. Opportunities used a blue line; Members & roles, API keys, Agent, Analysis rules and Knowledge indented their tabs and had no rule.
- Tasks' Waiting for me / Current / Done / Closed stay in the toolbar as the shared `Segmented`: they filter one list, and line tabs only switch a page's sections (decision D1).
- Every "pick one of a few" control is one square, grey-ground group (`Segmented`, now in `components/reach`): the date ranges of the 13 data pages (no longer blue pills), GitHub hot topics' periods, Downloads, Site performance, and the 7-day / 28-day checkpoints in a result and in a task's Performance.
- A refresh for a whole tab sits top right in the page header, as a page's does: Keywords › AI suggestions and Rank tracking, GitHub hot topics and Competitors › Activity drew it on their status line or table toolbar. A tab puts its actions there with `HeaderActions`. A result's Refresh is the icon button too.
- Tables drawn by hand take the shared header ground: Opportunities › Watching (Handled had it), GitHub hot topics, Downloads' versions, Skills, the task board's list and Knowledge.
- GitHub hot topics' select-all boxes sit in the table header's first column, as every table's do, not before the card titles.
- The chips listing terms are one size and shape: Trends' compared products, AI search's topics and the keywords offered on Trends › Watched keywords.
- Playbook and Skill details open like every other detail panel: the title and its actions in a header row beside the close button, the content below without a card around it. The playbook panel drew its content in a bordered card under a separate close button; the Skill panel left an empty band above the title.
- A row with one action shows it as a text button: Opportunities › Handled's Restore (was an icon) and Trends › Watched keywords' Remove (was a ⋯ menu with one item). The actions column of API keys has no visible name, as Members' has none.

## Unreleased — Insights looks sharper, with the same content

- The metric cards sit on the same white surface as the messages below, with a hairline border; the number is larger and its change follows it in green or red; the sparkline has a light wash under it and a dot on the latest day.
- The agent avatar is solid agent violet with the bot in white (dark in dark mode), so the daily analysis reads as the AI speaking. The avatar is shared: Tasks › By agent shows it the same way.
- The daily analysis headline is slightly larger. In the opportunity lines, titles to decide on or handed off are in medium weight, dismissed and expired lines are dimmed as a whole, and the status or the actions sit in one right-hand column.
- Current situation is split into Needs attention and Normal, without the dots; each line's numbers are in medium weight, coloured for the lines to deal with (a drop red, the rest amber).

## Unreleased — Automatic runs look like the other Settings pages

- Settings › Automatic runs is a table like Network and Members (Work, Schedule, Last run, Next run, Status) instead of a card with the time in headline type. The daily analysis explanation is behind ⓘ beside its name, and the note on other automatic work (with its link to Data sources › Data health) is behind ⓘ beside the page title, like the page notes elsewhere; the browser-timezone note sits in an ⓘ beside Last run; Change time moves into the row's "…" menu with Run now, Pause and Technical details, and Run history stays on the row. Next run is left out on narrower screens so the table does not scroll sideways.
- Run history opens with one line on the recent runs ("No problems in the last 8 runs", "2 of the last 8 runs had problems") with the refresh button beside it. Runs that went well no longer each carry a Done badge; only failed, skipped and running ones show a status. Each run is one line with its suggestions on the right, and projects are named only when there are several, or one was skipped or failed (in red, with the reason).
- Dates other than today, yesterday and tomorrow use the shared format ("10-20 09:00" instead of "10月20日 09:00"), and a skipped run says it was already analyzed that day rather than "today".

## Unreleased — Data sources show their logos

- Every data source has its logo on a small tile: the cards and drawer title on Settings › Data sources, the rows and sync table on Data health, the results of Find data sources on your website, the source headings of Settings › Analysis rules and the source buttons when adding a rule. Brand marks come from Simple Icons (CC0), vendored as path data in `client/components/reach/brand-logos.ts` without a new dependency; black marks follow the text colour so they show in dark mode. Sources without a brand mark of their own (Website content, Website source, Blog CMS, DataForSEO, AI search visibility, Competitor activity, Rank tracking, Daily analysis) take a matching icon in the same tile.

## Unreleased — Data sources: two tabs, Retry all, Agent edits and publishing first

- Settings › Data sources has two tabs. Sources (the default) shows the cards, with one orange line at the top naming the sources that need attention and a View link to the other tab; Data health shows their count in orange on its tab and holds the sync status that used to sit above the cards.
- Data health lists the sources needing attention, each with the action that fits its failure: Retry; Change, which opens the source's settings, when a setting must change first (an expired Google authorization, a refused GitHub token, X's spending cap, a paused daily analysis, a competitor without a sitemap); or Check, then retry for an uncertain DataForSEO result that may be billed, which asks before querying again. Retry all retries the rows a plain retry can help and the person may retry, one after another, each row showing its progress and result. The full sync status table is shown directly.
- Google Search Console and GA4 rows that are only late offer Retry, which asks for a sync as Update now does. Rank tracking and Trends record an uncertain DataForSEO result, and competitor activity a refusal only a changed setting cures, so Data health can tell them apart.
- Agent edits and publishing (Website source and Blog CMS) is the first group of sources: every change the Agent makes lands in one of them. Group headings use the shared section heading at the size of the page's other headings, with the same space above every group and a small gap to its cards; the old plain heading took a page-wide rule that left it grey and touching its cards.

## Unreleased — Agent: one Settings per row, tidy tabs

- Who does the work reads as a table: column headings, Cloud models and Local agents as light group rows with their explanation in an ⓘ, and what each work does under its name.
- Every row has one Settings button for administrators, a dialog that changes what the row uses. Daily analysis › Settings chooses the model the analysis runs on (the default chat model, which no page let anyone change since the Agents plugin upgrade of 2026-10-16); Chat panel › Settings is the chat agent dialog, whose default model now names the model; Tasks › Settings chooses the project default and says beside each agent whether it is online, not signed in, out of quota or offline. While a row needs attention, the button is the fix instead.
- The tabs follow setup order: Model services, Runtimes, Local agents, Usage. Each opens with one sentence and its button instead of a second page heading, at the same size in every tab. Local agents holds the agent list only; the project default moved to Tasks › Settings.
- Shorter wording: the Model services and Runtimes descriptions are one sentence, the list's how-to is one sentence, and model counts read "2 chat models" instead of "2 chat".

## Unreleased — Playbook Skills matched by name

- Skills › Used in playbooks, the playbook steps and the step Skill picker now find a step's Skill by id, then by name, as a task does. A Skill imported under a built-in name (with its own id) shows where the built-in playbooks use it, and saving a step no longer drops those references.

## Unreleased — Page notes in ⓘ

- Move the remaining grey explanatory notes on Playbooks and the data source connection panels (GitHub, Google, DataForSEO, X, Reddit, Hacker News, Google Trends, Discord/Slack, community forum, website content, downloads, Xiaohongshu) into ⓘ tips beside the field, heading or line they explain; status lines, counts, setup steps and errors stay visible.

## Unreleased — Opportunities shows where each handed-off task stands

- On Opportunities › Handled, the Where it went column shows the state of a handed-off opportunity's task with its number, as Insights does: Handed off to agent while it waits to start, In progress, Needs confirmation, Done or Closed. O-43 read "Handed off to agent · T-34" after T-34 was done. A change handed off on its own shows the same, now with its task number, and its detail's tag says the same instead of In progress for every open task. The filter offers the same labels, and an opportunity's detail says the state beside Open task.
- The online assistant's `daily_analysis` tool reports a handed-off opportunity's task the same way (in progress, needs confirmation, done, closed) when the user may list tasks, so asking about O-43 in the Insights conversation no longer gets "handed off".
- Insights, Opportunities, the online assistant and the verdict coverage of changes read where a task stands from one function, `taskStanding` in `shared/task-pending.ts`; the coverage also counts tasks finished before task work was recorded as done.

## Unreleased — Insights says how it analyzes, not how old the data is

- The line under the Insights title no longer shows the period, the data date and the last analysis time ("Last 28 days · Data through … · Last analyzed … (daily, automatic)"): the data could end days before today's analysis, which read as analyzing old data, and each analysis rule reads its own window (7, 14, 28 or 30 days), not 28. It says how the insights are made instead, in one sentence with two links: "Analyzed every day at 09:00 using your analysis rules." The analysis rules link to AI team › Analysis rules and the time to Settings › Automatic runs; each is plain text for someone who cannot open that page.
- The time is the daily workflow's configured time, with its time zone when it differs from the browser's. A paused daily analysis says it is paused; without a daily workflow the sentence names the rules only. Data dates stay on Data sources and Data health.
- The metric cards say what they cover, in a quiet line above them: "Last 28 days vs the previous 28".
- Insights no longer loads the analysis context it used only for that period.

## Unreleased — See what a live task changed

- Once a task is live, its card names what changed in one line ("Changes (2): English · Summary, English · Title") with View changes, which opens the change that went live: an article field by field, before and after, or a page change as readers see it before and after. Nothing else is added to the card.
- In the activity, View on a delivered article version now shows the same field-by-field comparison under the Agent's notes, instead of the notes alone.

## Unreleased — One look for every refresh and update button

- Every refresh or update control is the same icon-only ↻ button with its explanation on hover, last in the page header or at the right of the toolbar it updates. The "↻ Update now" buttons with text on Trends, X, Reddit, Discord, Slack, Xiaohongshu, Bilibili, YouTube, Site audit, Rank tracking, GitHub hot topics and Competitors › Activity, Keywords › AI suggestions' Suggest again and Settings › Network's Check connectivity now look like Insights' and Results' buttons. The tooltip and accessible name say what happens and change while it runs ("Searching…").

## Unreleased — Handed-off opportunities show where their task stands

- On Insights, an opportunity handed off to the agent shows its task's state now, with the task number: Handed off to agent while it waits to start, In progress, Needs confirmation, Completed or Closed. A finished task used to keep reading "Handed off to agent".

## Unreleased — Tasks list: a notice only when no runtime is online; Executor no longer overlaps Updated

- The line of counts above the tasks (running, queued, failed runs, runtimes online) is gone: each row's status already says running and queued, and a failed run shows in red on its row. When no runtime is online, one notice above the tasks says work handed to an agent will wait, with View runtimes; it uses the page's normal spacing (the old line's zero margin sat it on the table). The same applies to List, Board and By agent.
- In the list, the Executor column truncates a long Agent name with an ellipsis (the full name on hover) instead of running into Updated, which no longer wraps.

## Unreleased — Today's decisions are today's; the conversation opens folded

- Today's message on Insights lists only opportunities raised, dismissed or handed off today. One handed off on an earlier day that today's analysis lists again stays on the day it was raised; it read as handed off today beside the ones just dismissed (Studio, 10/22: T-27 and T-30 beside the three dismissed at 17:15). A hand-off counts on the day its task was created, and the waiting tasks are read again after one.
- Today's conversation starts folded to its one line when Insights opens; a question sent since then opens it. An earlier day's conversation shows in full when that day is opened.

## Unreleased — Found by AI or by a person, on every task

- Task cards on the board and in the list say who found the task, beside its number: "Found by AI" (sparkles, violet) for a task from an opportunity of the daily analysis or a change on Insights the person only confirmed, "Found by <name>" for one a person handed off from a data page, created as a new task, started from a page to improve or created from Results. The finder is the person who created the task, who may not be its owner. Older tasks that did not record their creator show nothing.
- The task page's properties start with Source: "Found by AI · O-41" with "Daily analysis · date", or "Found by <name>" with where it came from ("Handed off from Keywords · date", "New task · date"). It replaces the From row.
- Hand-offs from data pages record the page they came from; tasks started from a page to improve record their creator; a task handed off from another keeps who found the first one and where.

## Unreleased — Failed article publishes say where and why

- When publishing an article to a target does not complete, the task card keeps its plain-words reason and now links to Technical details, which list each failed target with the step it stopped at (reading the article, checking the website repository, writing, or checking the saved changes), the error code, the time and what the target or the error said (for example `github:429`, or a network timeout with its host).
- Every failed publish also leaves a warning in the application log (`NocoReach article publish failed`, with project, task, target, step, code and detail), so `nb-studio app logs` shows it. Errors other than the target's own (a request that got no answer, a code error) keep their cause instead of becoming a bare `unavailable`.

## Unreleased — Data sources: shorter cards, a group for what the Agent writes to

- Each card on Settings › Data sources shows its name, status, one plain description and its button. The signal kinds at the bottom ("Change · Timing · Gap"), the role tags ("For analysis", "Can change", "Search and archive") and the "Once connected you can find:" prefix are gone, with their copy in every language.
- A healthy source shows no sync line; Connected already says it. A source that Data health lists as needing attention shows "Needs attention" and the same reason ("No successful sync in over two days"). Hacker News and X now match their Data health rows, which use other ids.
- A new last group, Agent edits and publishing, holds Website source (Git repository) and the article publishing target, now called Blog CMS: connect it when articles are managed in a CMS; articles kept in the repository don't need it. The drawer title follows ("Connect Blog CMS"); publishing and the drawer's form are unchanged.
- Bilibili and Xiaohongshu say they are collected manually and not updated each day. What they collect still feeds the daily analysis's content rules.

## Unreleased — Agent: tabs back, no duplicate local agents

- Runtimes, Model services and Usage are tabs of the Agent page again, after Local agents, instead of pages of Settings; Settings no longer lists them, and `/runtimes`, `/models` and `/usage` open the tabs.
- The Agent page shows Who does the work above the tabs; the local agents and the project default are in the Local agents tab only, instead of a second block below the overview. Change opens that tab.
- When the chosen local agent's coding tool is not signed in or out of quota, the page no longer offers to switch to an agent that uses the same tool (switching from Claude · Fable 5.1 to Claude · Haiku 4.5 fails the same way); it offers an agent with another tool, or Change.

## Unreleased — Insights has one refresh

- Update analysis is the page's refresh icon, as on Results, named and tooltipped "Update analysis": it spins while the analysis runs, and the numbers, Current situation and the waiting tasks are read again when it ends. Current situation no longer has a refresh of its own.
- Current situation lists every line, those needing attention first, since the column has the room; "N more" is gone.

## Unreleased — Every language checked against English in the tests

- `tests/logic/additional-locales.test.ts` compares each of the eight additional languages with English: `shared/i18n/<locale>.json` with `en.json`, and `client/locales/translations/<locale>.json` with the shell copy of `client/locales/en-US.ts`. It names every missing key, extra key and key whose `{0}` or `{{name}}` placeholders differ. The `build` check's client type check already failed on a missing key, but stopped at the first language and missed extra keys and changed placeholders.
- docs/DEVELOPMENT.md says new or changed copy needs all ten languages in the same pull request, and that a pull request updated from `main` is merged only after CI passes on that update: eight pull requests merged after the ten-language change (#183) were short 81 translations once `main` was merged into them, and were merged seconds after that push, before CI had run.

## Unreleased — Performance on the task page, page by page

- The task page shows Performance under its properties (after the current card below 1280px): each page the task is about with its own numbers. Before the change goes live it lists the latest 28 days, search clicks and average position (views when a page has no search data), and says that days 7 and 28 are compared with them; once live, the 28 days before going live and when the day 7 result is expected. From day 7 it shows each page before and after with the change, all pages together, a Day 7 / Day 28 switch and a link to the full comparison in Results. Three pages show at first, the rest on request.
- Day 7 and day 28 comparisons now keep each page's own clicks, average position and views when a task changed more than one page; earlier results show the pages together. A new read action, `nrTaskWork.numbers`, returns each page's numbers over 28 days (read permission, as `get`).
- The properties column shows labels and values in the same size, told apart by colour, with every row the same height and menus lined up with plain values.

## Unreleased — Tasks: one set of status choices, the shared drop-downs

- Tasks no longer has a status drop-down beside Waiting for me, Current, Done and Closed: the two overlapped, and the board's columns and the list's order already separate statuses. An old `?status=` link shows the scope without filtering.
- The playbook, owner and Agent filters use the application's drop-down instead of the browser's, as every other page does. Picking a playbook after opening an old `?playbook=` link no longer falls back to all playbooks when that link's option leaves the list.

## Unreleased — One product wording, the version in the account menu

- The sidebar footer shows only the slogan; the template's name ("Default Template") is gone and the version moves to the bottom of the account menu ("NocoReach v1.0.0-beta.68").
- The slogan, the sign-in panel and the README headers use one agreed wording in all ten interface languages: an AI growth operations platform; "Find the opportunities in your data. NocoReach puts them into action."; data collection, daily analysis and Agent execution in one platform. The sign-in panel's second point is Agent execution (you confirm, review the change and track the impact) instead of repository-native work, and its last line reads "Find opportunities · Put them into action · Track the impact".

## Unreleased — Playbook step names in formal Chinese

- Built-in playbook steps and step kinds read formally in Chinese and Traditional Chinese: Write plan, Review plan and Review and publish, and the step-kind notes (your review, review then approve or request changes, confirm then the system runs, changes the repository and opens a PR, no repository change). English is unchanged.
- Tasks created before keep their stored step names; they display the new wording, because a stored name is matched to its system message through the alias manifest rather than by exact text. Stored data is not rewritten.

## Unreleased — Leaving unsaved work asks in the application's dialog

- Leaving New task, a role form or Create from a result with unsaved input, following a link out of Skills, the Google or keyword connection forms with unsaved input, and leaving a task page with drafts now ask in the application's own dialog instead of the browser's confirm box. Unsaved forms ask "Discard unsaved changes?" with Discard; a task page with drafts asks "Leave this page?" with Leave anyway, since its drafts are kept.

## Unreleased — Insights scrolls inside its conversation

- On wide screens Insights fills the window: the title, the numbers and the input stay in place and only the day's analysis and conversation scroll between them; Current situation scrolls on its own.
- Earlier analyses opened above today fold again with "Hide earlier analyses", offered both above them and just above today.
- The day's conversation folds to one line ("Conversation · questions: N") so the day's analysis stays in view; a new question opens it again and scrolls to it.
- The input has one frame instead of a field inside a box.

## Unreleased — One conversation a day on Insights

- What you ask from Insights joins the day's conversation, shown right under the day's analysis with its own input at the bottom: type and press Enter, and the answer appears there (what it read folds under "Sources checked"). Each day keeps one conversation, so the AI remembers what was asked before.
- Ask AI on an opportunity line quotes the opportunity in that input instead of opening a separate conversation; the question and answer stay in the day's conversation with the quote above the question, here and in the side panel. Questions no longer appear under the opportunity lines.
- Opening the side panel on Insights moves the day's conversation into it: the page hides its conversation and input, offers "Open today's conversation in the side panel", and folds Current situation to one line under the day's date. Only one input shows at a time.
- Earlier days sit above today, folded to "Earlier analyses (N)" by default and opening a week at a time, oldest at the top, so the bottom of the page is left to the conversation. An opened day shows that day's conversation in full.
- Hand off to agent looks the same on every line; the first one is no longer filled.

## Unreleased — Search performance: web search only, gaps said plainly

- Search performance › Performance reads web search only. The search type choice (Web, Image, Video, News, Discover, Google News) is gone, with the server's handling of other types in the search views: they were read live from Search Console for this choice alone, while the scheduled sync, the daily analysis and Insights use web search only.
- The coverage line shows only when days are missing: which days, why (fetching, failed, paused, waiting for an administrator, or older than the 16 months Search Console keeps) and the one action that fixes it. A complete range shows nothing; when the data was last saved, blank days, missing comparisons, the backfill limit and scheduled sync being off are in the page's ⓘ. "Re-fetch selected totals" is removed: the scheduled sync re-reads recent days, and gaps are filled automatically when an administrator opens the range.

## Unreleased — Task properties in their own column

- The task page keeps the title across the top and moves the task's properties out of the header into a column on the right from 1280px wide, like the sidebar of an issue: Owner and Agent (both can be changed there), Collaborators, Playbook, From (the opportunity), Article with its full title linked to the published page, Related page, Related tasks and Started. Rows without a value are left out. The column stays in view while the page scrolls; the page keeps its full width.
- Below 1280px the properties sit under the title in two columns, and in one column on phones, instead of squeezing the content.
- The content column reads why the task exists, the steps (no longer repeating the playbook's name), what needs doing now and the activity. The start card's hint says "Choose an Agent for this task first." instead of pointing above, in all ten languages.

## Unreleased — Settings and the sidebar in agreed words

- The sidebar's slogan and the sign-in page's first line read as agreed in Chinese: "从数据中发现机会，NocoReach 帮你落地".
- Members & roles › Roles lists System administrator first as a built-in role for all projects, with an ⓘ saying it has every permission and cannot be edited there, so Roles agrees with Members; in Members it is a neutral badge like the other roles instead of a solid one.
- Network describes itself in one sentence; the note on YouTube, Bilibili and Xiaohongshu moves from under the sources into the page's ⓘ.
- Automatic runs says a failed day is retried in formal Chinese, and the new project's content language uses the shared drop-down.

## Unreleased — AI team pages without side panels or fold-outs

- Playbooks lists every playbook as a card by category across the full width; a card opens the playbook in a drawer to read or edit, instead of a list with a detail panel always beside it. A link to `?id=` opens that drawer, and nothing opens by default. Its category and Skill pickers use the shared drop-down.
- Analysis rules shows rules by area as tabs (Search performance, Traffic and conversions, …), each source a heading with its rules shown, instead of fold-out source groups; the area with an open editor cannot be left until it is saved or cancelled. The last-analysis line leaves out "passed to the AI" when there is no count instead of showing a dash, and percentages read "2%".
- Skills asks before discarding an edit with the app's own dialog instead of the browser's, and its drawer is as wide as the Playbooks drawer.
- Sorted table headers use the text colour instead of the primary colour, as on tables that do not mark their sort; Project knowledge's summaries drop Markdown heading and emphasis marks.

## Unreleased — Opportunities, Tasks and Results, in plain words

- Opportunities: nothing to review is a full-width empty state instead of a narrow box, and so is nothing being watched. Watching explains how watching works in an ⓘ beside the Change header instead of a grey paragraph, and a change's figure appears only in the Value column. In Handled, Restore is a row-end icon button that keeps every row the same height, and a handed-off opportunity slides in its detail here (with a link to its task) instead of leaving the page. Dates use the shared format.
- Tasks: the Current step, Owner and Executor columns are wider so names and steps are no longer cut short at 1440 px.
- Task page: the review card's title and hints read formally ("The change is ready. Review it before publishing"; "ask an engineer" rather than a colloquial "dev colleague" in Chinese), the publishing note moves into an ⓘ beside Publish, and the note composer's Send is a secondary button so the step's action is the only primary one. A closed task says Closed once: the card is headed Status and titled "When closed: …". Why no longer repeats the figure its title already states, and Start task and Choose playbook in Activity use icons that do not look like disclosure triangles.
- Results: the period no longer says "(UTC)" (the ⓘ does), a change not yet live shows a dash under Went live because its status already says so, and the comparison windows use the shared date format. Create from a result uses the shared drop-downs and text area and shows the comparison in place instead of in a disclosure.
- Chinese copy puts a space between Chinese text and "Agent" everywhere.

## Unreleased — Community pages, fixed and in plain words

- Reddit shows one line under the search terms: when the last search succeeded and when the next may run, with the last attempt and the hourly scan in its ⓘ. A search that did not complete names the term and the reason in plain words (for example, that automatic retries are paused because it is unclear whether the search was charged); the provider's codes and task id move into a Diagnostics ⓘ. The subreddit card's empty state is a full sentence.
- Metric rows fill their width: two, three or five tiles take the whole row instead of leaving empty columns (Hacker News, X with its monthly spend, Reddit with its visits).
- Hacker News says there were no mentions in the period instead of drawing an empty axis.
- X, Discord, Slack and Forum hide the date range until the source is connected. On X a post that is only a shortened link reads "(Link only)" beside its Open on X link.
- Descriptions are one formal sentence: X, Discord and Slack no longer say "your own" or "just paste the token", the forum is named by its link without the platform name, and Xiaohongshu, Bilibili and YouTube end with a full stop and no longer mention the collector browser. YouTube writes "Retrieved …" without the tool's name, Bilibili lists tracked videos only when there are some, and dates in Discord, Slack and Reddit rows use the shared format.
- One name per idea: "estimated publication date" and "selected period" replace their variants on the Xiaohongshu, Bilibili and YouTube pages.

## Unreleased — The selected tab in the header

- On a top-level page with tabs, the name that fades into the header after scrolling now includes the selected tab: GitHub › GitHub hot topics, Performance › Indexing, Keywords › Rank tracking, Agent › Execution agent, and likewise on Opportunities, Site audit, Trends, Competitors, AI search, Project knowledge, Members & roles and API keys. Clicking the page name opens its default tab at the top.

## Unreleased — Agent: who does which work, and whether it works

- The Agent page has no tabs. One table says which work cloud models do (Daily analysis and the Chat panel, with the model each uses) and which local agents do (Tasks, with the agent, the computer it runs on and whether that computer is shared with the team or owner only), each with a status and the one action that fixes it. The local agents and the project default follow below it.
- A status follows how the work last ended, not only whether it is set up. An agent whose computer is online but whose latest tasks failed because the coding tool is not signed in, out of quota, cannot use the model or could not set up shows Needs attention, with how many tasks in a row, the computer and the tool, and what to do. A daily analysis whose last run did not finish shows the same.
- Model services, Runtimes and Usage are pages of Settings at `/models`, `/runtimes` and `/usage`; the old addresses under `/agents` redirect. Runtimes opens with one sentence on what a runtime is and why it must stay on and signed in, and ends with what Shared with the team and Owner only mean, which are also the names in its list.
- The chat agent's name, model and instructions open as a dialog from the Chat panel row; the separate chat agent list, and turning a chat agent off, are gone. A chat agent that is off can be turned on from the row.
- Agents on a runtime are called local agents everywhere ("Execution agent" and "Task agent" before).

## Unreleased — Insights puts the conversation first

- The daily analysis's messages on Insights are white cards with a border, its headline one size larger and its avatar a little bigger, so the day's conversation is what the eye meets first.
- Current situation becomes a narrow, quiet column: no card, a small grey heading, Refresh as an icon, one plain line per item with where it comes from on hover. Only the lines that need attention show; the others fold under "N more" (when none needs attention, the first three show).

## Unreleased — Questions to AI stay with the day and the opportunity

- Each opportunity line on Insights gains Ask AI: the chat opens on a new conversation about that opportunity. The questions asked stay under the line, with the start of the latest answer, Show all and Continue asking, which reopens the same conversation.
- Questions asked with Ask AI at the bottom of Insights show after the day's message, as your question and the AI answer, while it is being answered too. Earlier days count their questions ("2 questions") and show them when opened, including days that raised no opportunity.
- Only your own conversations show; they are read from the chat's records, which now note the analysis day and opportunity a conversation was asked from (`subject`), through `GET /onlineAgents/threads`. Continue asking with an unsent draft in the chat asks before discarding it.

## Unreleased — Ten interface languages

- Support ten interface languages: English, Simplified Chinese, Traditional Chinese, Japanese, Spanish, Brazilian Portuguese, French, German, Vietnamese, and Indonesian.

## Unreleased — Search & market pages, fixed and in plain words

- Search performance › Sitemaps names each sitemap with its host: a domain property lists every subdomain's sitemap, all called /sitemap.xml, and the rows could not be told apart.
- Search performance › Performance shows whether the range is complete as a tag, with the record and save dates in its ⓘ and only what needs doing as text, instead of a block of sync details above the figures. The query, page and breakdown details load with the page instead of behind a button, and search appearances Search Console names `FORUMS` and `TPF_QA` are translated.
- Indexing and Sitemaps describe themselves in full sentences; the daily quota, the Search Console property and the details' scope move into the ⓘ; the reason column stays empty for indexed pages, whose status already says so.
- Keywords › Saved shows only a market in the Market column (AI suggestions is a source, not a market), its page columns are narrower so the table fits at 1440 px, and Competitors uses the same Taiwan market name as Keywords.
- Competitors › Activity says a read error shared by several competitors once, above the cards, with a way to Settings › Network when it is about reaching a site, and decodes character references such as `&#x27;` in page titles and descriptions (pages read before are decoded on display). Overview hides the AI share column until a brand check has measured one and cuts long recent activity with an ellipsis.
- Trends keeps the comparison notes in the ⓘ beside Compare and gives related searches a heading with its instruction in an ⓘ. AI search writes "24 (100%)" and keeps billing and platform notes in ⓘ.
- Keywords, Trends, Competitors and AI search describe themselves in one sentence without colloquial or billing asides.

## Unreleased — Ask AI reads the daily analysis

- The online assistant can read the daily analysis behind Insights through a new read-only `daily_analysis` tool: a day's notes and limitations, the opportunities it raised with where each stands now (awaiting decision, handed off to agent with its task, dismissed, expired), its verdict on every change (do, watch, skip) with the reason, the opportunities awaiting a decision now, and the watches still open or ended. It reads the latest analysis or any earlier day, checks on every call that the conversation owner may still see Insights, and links opportunities to Opportunities. Asked about "the daily analysis of 10/21", it used to search the tasks and find nothing.
- The metrics it reads (`project_data`, metrics) now include totals: each key metric of the last 28 days with the 28 days before and the change, as the Insights tiles show them, with the daily series. The snapshot of keywords, pages and audit issues had no previous period to compare with.
- Opportunity links in chat answers open inside the application, like task links.

## Unreleased — Tasks by Agent

- Tasks gains a By agent view next to List and Board, after Studio's Agent view: a column per Agent the project runs tasks with (the project default first), then Unassigned. Each column says whether the Agent is running, queued, waiting or idle, and when no runtime is online; inside it are Working on, Up next (numbered, oldest first) and Waiting, where each card says what a person has to do (Confirm start, the review step, Confirm publish, confirm going live, Run failed) and who: "You" on a highlighted card listed first, otherwise the owner's name. Finished and closed tasks are left out.
- Cards on the board and the Executor column of the list name the task's Agent (its own, else the project default, as the task page header shows it) with an online dot, or Unassigned, instead of a bare "Agent". A new Any agent filter narrows every view.
- A line above the tasks counts runs under way, queued and failed, and the runtimes online. What waits for you stays counted on Waiting for me.

## Unreleased — Website & product pages, fixed and in plain words

- Traffic's daily chart draws the previous period over the same days of the current one again. GA4 answers each of the two date ranges on every day of both, at zero outside it; those zero days drew the comparison line over the wrong days and dropped both lines to zero where the periods met. The server keeps each range's own days, and the page ignores the extra days in reports cached before.
- Traffic: Today shows skeletons while it loads, names the property's time zone ("China Standard Time" rather than `Asia/Shanghai`) and writes its sources the way the channel table does (Direct rather than `(direct) / (none)`). What moved the figure is plain text, and data that may be off is one line with a "Check data" tag and the explanation and GA4 steps in its ⓘ, instead of two amber blocks.
- Pages describes itself in one sentence; the site, the pages read and how the sitemap's count relates to the tabs' are in the ⓘ. Not in sitemap is a tag.
- Site audit and its performance check describe themselves in one sentence each (no cost moves into the ⓘ), and the device choice and the device filter use the same segmented control.
- GitHub labels that were English in every language (Commits, Watchers, Issues, Pull requests, Releases, Discussions) are translated, and its copy uses those names.
- Downloads describes what is connected rather than every registry it supports, says "Latest" instead of `latest`, and picks a package from a drop-down instead of buttons that ran past the card.

## Unreleased — Data sources: two ways to connect, findings in a dialog

- The top of Data sources shows two cards side by side: Find data sources on your website, with what it reads, and Use an agent on your computer, saying why: the agent researches the website and repositories, lists a plan and connects everything once you confirm, while authorizations and tokens stay in the browser.
- Discover data opens its findings in a dialog that can be closed, instead of a long list on the page. The website's own title and description are no longer shown above the findings. Authorize closes the dialog and opens that source's panel.

## Unreleased — One look for refresh buttons, drop-downs, tabs and pagination

- The data pages call the action that reads new data "Update now" everywhere, instead of seven names (Read now, Search now, Check now, Query now, the competitor and Site audit wordings). The connection drawers keep their own steps.
- A page's Refresh is the same outline icon button, last in the header: API keys moves it after Create key, Analysis rules uses it instead of a text button, and Settings › Automatic runs uses the header every other page uses, so the button lines up with the title instead of dropping below it.
- The browser's own drop-downs on Competitors (market), Keywords › AI suggestions (market), GitHub › Hot (topic, language), Skills, Opportunities › Handled, Project knowledge (category, AI content language) and the knowledge forms are replaced by the application's drop-down. Tasks, Results and Playbooks follow with their own pages.
- Members & roles, API keys and Agent use the same line tabs as the data pages instead of pill buttons, and tab counts follow the name without brackets ("All 658"), as on Opportunities.
- Table footers disappear while every row fits on one page, and Members & roles and API keys use the same footer as the data tables when they do page.

## Unreleased — One way to write dates, numbers and changes

- Dates read the same on every page: in Chinese "2026-10-21", without the year in the current year ("10-21"), and times without seconds or a time zone ("10-21 14:03"); in English "Oct 21", "Oct 21, 2025", "Oct 21, 2:03 PM". This replaces eight styles in use, among them "2026/10/21", "21/10/2026, 16:40:18" (Search performance), "2026/10/19 GMT+8 9:34:24" (Reddit) and "2027/1/16" (API keys). Date ranges use the same days.
- Changes are written one way: an arrow, a space and the size ("↑ 12%", "↓ 9.8%"), one decimal under 10% and whole numbers above, green for good news and red for bad; differences in a column keep their sign with a true minus ("+253", "−2,578"). This replaces "▲ 9.8%", "▼86.4%", "↓23%", "-24%" and "+50.0%". Competitors no longer shows "+-7/week" for a fall in stars.
- Shares keep one decimal ("7.0%") so a column lines up, durations read "2 min 37 s" or "1 h 14 min", and numbers are no longer shortened to "19K" or "65.3k" next to full ones.
- Dates, numbers and changes come from `client/lib/format.ts` and the `Delta` component; the Insights, Data sources, Opportunities and Tasks pages, which other changes are reworking, follow later.

## Unreleased — Insights: Current situation beside the day, decisions kept

- Current situation is back as a column beside the day's conversation, as before the redesign, with its explanation and Refresh. The Status link, its drawer and the All data menu are gone; each tile still opens its data page.
- Opportunities decided today stay in today's message after those still waiting, marked Handed off to agent (with the task) or Dismissed, and the message counts them (Awaiting, Handed off, Dismissed), as the earlier days do. Each opportunity shows once: today while it waits or when today's analysis raised it, otherwise on the day it was first raised.
- The metric tiles and the waiting tasks no longer show a Refresh icon on hover; they are read again on each visit, and Retry appears only after a failure.
- "(daily, automatic)" after the last analysis links to Settings › Automatic runs for those who may open it. The fold markers are chevrons instead of ▾ and ▴.

## Unreleased — Agent failures name the computer and the tool

- When a task's Agent stops because its coding tool is not signed in, the card names the computer and the tool ("Claude Code on Office-Mac isn't signed in") and asks whoever manages that computer to sign in, or to change the Agent. A second line explains that an Agent shown as online only means its computer is connected. Connection, network and quota failures name the computer or the tool the same way when the run reports them; readers who may not see the computer get the general wording.
- Try again is no longer the main button when trying again cannot help (the tool is not signed in, the run could not be set up, the model is unavailable); it stays available beside I'll do it myself. The setup failure now asks an engineer to check Technical details before trying again.
- Technical details › Runs shows what the tool itself reported when the run stopped (for example "Not logged in · Please run /login"), to those who may read the run's transcript.

## Unreleased — Insights as a conversation with the daily analysis

- Insights now reads as the daily analysis speaking, so it no longer looks like Opportunities or opens on a wall of text. The key numbers stay on top as tiles with their trend (at most five, only those with data), with Status (the standing facts, in a drawer) and All data (every data page, grouped) below them.
- Under the date, the daily analysis says how many decisions wait and which key numbers moved by 5% or more, with its notes folded. The opportunities waiting for a decision, the same ones as Opportunities › To do, follow as one line each with Hand off to agent and Ignore (five shown, the rest folded; the evidence stays on Opportunities), then the watches that ended that day, the tasks waiting for you and data that failed to sync.
- Earlier days fold into one line each, with how many opportunities were raised that day and where each went (handed off, awaiting decision, dismissed, expired), opening to the list and the watches that ended. Ask AI at the bottom opens the chat with the day's analysis named.
- The numbers, Status and the waiting tasks keep their own loading, failure and Retry. A change no analysis judged yet is still judged once in the background. Today's changes, with its standalone changes and their own hand-off, is gone: since #178 every change worth doing has an opportunity.

## Unreleased — Connect data sources with your own agent

- New `nocoreach connect` commands for a signed-in person: `guide` (the steps an agent follows), `list` (every data source of a project with its state, whether a command can connect it, and what it needs), `discover` (the sources a website links to), `preview` and `add` (website content, GitHub repository, forum, package downloads, Hacker News, competitors, and Google Trends and Reddit once DataForSEO is connected). Commands use the person's own grants; sources that need a credential, a Google authorization or a Collector answer with their panel address and are never connected from the command line.
- Data sources: the discovery box becomes one row, Find data sources on your website, no longer presented as AI, with Use an agent on your computer beside it. That opens the account menu's agent setup with instructions to connect this project through `nocoreach connect guide`, confirming the plan first.

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

## Unreleased — Notification diagnostics

- Remove reliance on the generic notification test API from mock-isolation tests and operator guidance. Keep notification mutation blocking, authentication, inbox access and log reads covered.

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
