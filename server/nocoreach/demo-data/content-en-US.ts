import type { DemoContent } from './content.js';

/**
 * The English demo: the same fictional NocoBase editorial team as the Chinese one, with English names. Nothing here
 * describes real NocoBase customers, traffic or results.
 */
export const EN_US: DemoContent = {
  notice:
    '> Hand-written fictional demo material; the people, discussions, metrics and past results are not real customers, Agent runs or live releases.\n\n',
  taskNote:
    'A hand-written demo scenario. No Agent, model, Runner or publication was involved.',
  flows: {
    content: {
      name: 'Draft and human review',
      draft: 'Prepare the draft',
      review: 'Check facts and scope',
      checklist: 'Check sources, permissions and open questions',
    },
    research: {
      name: 'Research and human review',
      draft: 'Collect the research',
      review: 'Check facts and scope',
      checklist: 'Check sources, permissions and open questions',
    },
  },
  sourcePage: 'Demo project page',
  uncertainty:
    'All material is a hand-written synthetic sample; the product and traffic were not verified.',
  observationNote:
    'A hand-written past observation for teaching; not a real release, and no causal claim is made.',
  projects: {
    main: {
      name: 'NocoBase',
      domain: 'nocobase.example',
      description:
        'A fictional open-source low-code platform for internal business applications. Every metric, task and discussion is demo data.',
      audience:
        'Implementation consultants, operations leads and in-house developers',
      market: 'Global',
    },
    second: {
      name: 'NocoCRM',
      domain: 'nococrm.example',
      description:
        'A fictional CRM built on NocoBase, newly added to the team’s portfolio. Only the website and Google are connected so far.',
      audience: 'Sales managers and small B2B teams',
      market: 'North America',
    },
  },
  people: {
    growth: { username: 'grace', name: 'Grace Lawson', title: 'Growth lead' },
    editor: {
      username: 'ethan',
      name: 'Ethan Morgan',
      title: 'Managing editor',
    },
    content: {
      username: 'sophie',
      name: 'Sophie Bennett',
      title: 'Content editor',
    },
    devrel: {
      username: 'henry',
      name: 'Henry Cole',
      title: 'Developer relations',
    },
    consultant: {
      username: 'chloe',
      name: 'Chloe Park',
      title: 'Implementation consultant',
    },
    admin: { username: 'admin', name: 'Alex Reed', title: 'Administrator' },
  },
  roles: {
    growth: 'Growth lead',
    editor: 'Managing editor',
    community: 'Community and developer relations',
    viewer: 'Read-only observer',
    admin: 'Demo administrator',
  },
  stories: [
    {
      key: 'permission-entry',
      title:
        'Put “sales see only their own customers” on the first screen of the permissions guide',
      kind: 'content',
      state: 'review',
      path: '/docs/getting-started',
      brief:
        'In trial interviews, three implementation consultants asked about record scope before asking how to create roles. The current guide explains role inheritance first; readers reach their own customers only in section three. Open with the sales rep, sales manager and operations views and add a permission table readers can check. Review must sign in as all three roles, not rely on administrator screenshots.',
      comments: [
        'Sophie Bennett · Content: I renamed the roles after job titles. The field condition stays next to “own records”, so nobody thinks hiding a menu is enough.',
        'Chloe Park · Implementation: Sales managers also need customers handed over by colleagues who left. Don’t call it “records created by reports”; explain it by the team that owns the customer.',
        'Ethan Morgan · Review: The structure works. Please add an example of opening a detail link without permission, and confirm the list and the detail page follow the same rule before I approve.',
      ],
      draft:
        '# Customer data permissions from three roles\n\nSam in sales maintains their own customers, the manager reviews the team’s customers, and operations only needs source totals. Write these three needs down before configuring any role.\n\n| Role | Records visible | Actions |\n| --- | --- | --- |\n| Sales rep | Owned by them | Create, follow up, edit contact details |\n| Sales manager | Owned by their team | View, assign owner, export team data |\n| Operations | Confirmed totals | View reports, no direct export of customer phone numbers |\n\nA visible menu does not mean readable data. During review, copy the detail link of another team’s customer, open it as a sales rep and record the refusal.\n\nStill to add: ownership rules after a handover, and a screenshot of the refused detail link.',
    },
    {
      key: 'docker-first-run',
      title: 'Add the three checks after the first Docker start',
      kind: 'content',
      state: 'doing',
      path: '/docs/getting-started',
      brief:
        'Several community questions of the “container is up but the page won’t open” kind are mixed together: unmapped ports, a mismatched public address and an unfinished initialization. This piece only covers the order of checks after the first start, not a full operations manual. Each step says what you should see before moving on.',
      comments: [
        'Henry Cole · Developer relations: First confirm the process is ready, then check the address in the browser. Don’t send people who haven’t finished initializing off to change proxies.',
        'Sophie Bennett · Content: Split into service, address and persistence. Backup and restore get their own link so the first-install page stays short.',
      ],
    },
    {
      key: 'spreadsheet-migration',
      title: 'Write a field checklist for moving a customer spreadsheet',
      kind: 'content',
      state: 'todo',
      path: '/docs/workflows',
      brief:
        'Set it in the fictional “Harbor Devices” sales team: one sheet mixes customers, contacts and follow-ups. Explain first why they become three kinds of data, then give a field mapping table. Say explicitly that a phone number is not a permanent key and duplicate customers need a person to confirm them. The deliverable is a one-page migration checklist, not an import script.',
      comments: [
        'Chloe Park · Implementation: Use “one customer, several contacts” as the main example, not a staff list; that relationship is too simple.',
        'Sophie Bennett · Content: The samples are ready: two companies with the same name, an empty phone number, two contacts sharing a switchboard, and old follow-ups with no owner. All fictional.',
      ],
    },
    {
      key: 'workflow-rejection',
      title:
        'Rewrite returning and resubmitting in the purchase approval example',
      kind: 'content',
      state: 'doing',
      path: '/docs/workflows',
      rejected: true,
      brief:
        'The first draft shows one approval going through and cannot explain who edits after a return, whether the earlier comments stay, or whether resubmitting notifies people again. Walk through a fictional $2,600 equipment purchase end to end, and make clear the approver never edits the requested amount.',
      comments: [
        'Ethan Morgan · Review: “Incomplete information” is too vague as a return reason. Make it “the supplier quote leaves out installation”; the requester attaches it and resubmits.',
        'Sophie Bennett · Content: Got it. The next version keeps the original amount and the revision note. The final amount still needs finance, so it isn’t written as approved.',
      ],
      draft:
        '# Purchase approval example · first draft\n\nThe requester submits an equipment purchase; after the manager approves it, finance reviews it.\n\nWhen the approval is returned, the requester adds the missing information and submits again.\n\n## What this draft does not answer yet\nWhere is the return comment kept? Does editing the amount void the earlier approval? Who is notified on resubmission?\n\nReview: changes needed. The next version adds the $2,600 quote that leaves out installation, the revision history and who gets notified.',
    },
    {
      key: 'crm-search',
      title: 'Find out what people searching “open source CRM” actually want',
      kind: 'research',
      state: 'review',
      path: '/blog/template-onboarding',
      brief:
        'Don’t turn the home page into a CRM product page. First separate three needs — a ready-made CRM, an extensible foundation, a self-hosted replacement — then decide between a tutorial and a solution page. Record search intent separately from whether the product can meet it today.',
      comments: [
        'Grace Lawson · Growth: More impressions don’t mean people want to build a system. What’s missing is a clear line for how far they get out of the box.',
        'Henry Cole · Developer relations: The tutorial should say they build their own tables and permissions; don’t dress the sample screenshots up as a ready CRM.',
      ],
      draft:
        '# Open source CRM search intent: interview summary\n\nThis round is demo research, not a real market sample.\n\n1. **Replacing a ready system**: cares about the sales funnel, email and migrating history; wants to try it the same day. These readers need to know the sample is not a finished product.\n2. **Building an internal tool**: already has a process, will configure a data model, cares about permissions and extension. A customer–contact–follow-up tutorial fits them.\n3. **Evaluating self-hosting**: checks operations, backups and who is responsible before looking at features.\n\nPublish the tutorial for the second group first, with a section on where it stops. Make no “free CRM” promise for now.\n\nTo verify: in later interviews, whether trials stop over modeling effort or deployment.',
    },
    {
      key: 'forum-multiple-roles',
      title:
        'Reply to the forum question “do two roles’ permissions override each other?”',
      kind: 'research',
      state: 'review',
      path: '/docs/getting-started',
      brief:
        'Restate the poster’s sales-plus-audit setup first, then ask for the smallest configuration and the actual results. Don’t call it a bug from a screenshot. Keep the uncertainty in the reply and never ask for customer data or credentials.',
      comments: [
        'Henry Cole · Developer relations: The draft splits it into menus and record scope, which is right. Remove “send us a database backup”; ask for an anonymized configuration only.',
        'Chloe Park · Implementation: Plugins and versions differ; ask for the version first, then agree to reproduce it with two fictional customer records.',
      ],
      draft:
        '# Forum reply draft\n\nHi, let me check the goal first: the sales role sees only its own customers and the audit role reads every customer; an account holding both sees more records than you expected, right?\n\nCould you add the version, the record scope of each role and the steps to reproduce it with two fictional records? Please don’t share sign-in details, real customer content or a database backup.\n\nTry three test accounts — sales only, audit only, both — against the same list and the same detail link. That separates how roles combine from how the page is configured. With that, we can tell whether to file a bug.\n\nStatus: waiting for human review; not sent.',
    },
    {
      key: 'pricing-boundary',
      title: 'Add “when it applies” to the commercial plugin descriptions',
      kind: 'content',
      state: 'todo',
      path: '/pricing',
      brief:
        'Sales conversations easily mix up platform features, commercial plugins and implementation services. Start with an editorial outline: for each capability, the version it applies to, its dependencies and the purchasing details to confirm. Invent no prices and promise no delivery dates.',
      comments: [
        'Ethan Morgan · Review: Prices and license scope must come from the official material. For now the demo copy only lists the fields to confirm, with no sample quote.',
      ],
    },
    {
      key: 'docs-video',
      title: 'Split the 14-minute getting started video into three chapters',
      kind: 'content',
      state: 'doing',
      path: '/docs/getting-started',
      brief:
        'An interviewee only wanted the relation fields but had to scrub through the whole video. Redo the chapter notes as “create the customer table”, “link contacts” and “limit who sees what”, each with its starting state and a check at the end.',
      comments: [
        'Sophie Bennett · Content: Cut the product introduction from the first three minutes and show the page we’ll end up with instead.',
        'Henry Cole · Developer relations: Keep the permissions chapter separate and remind viewers to check with a non-admin account. Recording isn’t finished, so this stays in progress.',
      ],
    },
    {
      key: 'comparison-research',
      title:
        'Collect the questions for choosing between NocoBase and spreadsheets',
      kind: 'research',
      state: 'done',
      path: '/blog/workflow-checklist',
      brief:
        'Organize the comparison around questions a business owner can answer: data relationships, permissions, changing processes, deployment and maintenance. Don’t label competitors, and use no unverified feature checklists.',
      comments: [
        'Grace Lawson · Growth: “More powerful” is now concrete trade-offs; this works as a sales interview guide.',
        'Ethan Morgan · Review: Research accepted. Next, interview two kinds of team; this is not yet a publishable competitor review.',
      ],
      draft:
        '# Answer the questions, then pick the tool\n\nWith one contact list kept by two people, a spreadsheet may be enough. What deserves a closer look:\n\n- Does one customer link to several contacts, contracts and service tickets?\n- Do roles need different records, not just different views?\n- When the process changes every month, who adjusts and checks it?\n- Who handles upgrades, monitoring and backups of a self-hosted system?\n\nIn interviews, ask people to walk one piece of work from start to finish instead of listing features.\n\nConclusion: later content follows complex relationships and permissions; simple collaboration should not be described as needing a migration.',
    },
    {
      key: 'onboarding-result',
      title: 'Seven days of reading after the getting started rewrite',
      kind: 'content',
      state: 'done',
      path: '/docs/getting-started',
      outcome: 'up',
      brief:
        'A past demo case: give a small customer project readers can finish before explaining the modules. The observation only describes change across equal windows and does not credit one rewrite with the growth.',
      comments: [
        'Grace Lawson · Growth: Search clicks went up, but a community share happened the same week; not all of it belongs to the copy.',
        'Ethan Morgan · Review: Keep that limitation. Next round, look at where readers leave in step two rather than growing the first screen.',
      ],
      draft:
        '# Getting started review\n\nChanges: the opening shows the customer, contact and owner objects; installation moved to prerequisites; each section ends with a result to check.\n\nIn the demo window, search clicks rose from 126 to 181. Both windows are seven days.\n\nThis is a synthetic past observation, not a live release or proof of growth. A community share in the same period may have contributed.\n\nDecision: keep the structure, and study what slows readers down in the relation fields chapter.',
    },
    {
      key: 'reporting-result',
      title: 'Reporting guide impressions up, clicks down',
      kind: 'content',
      state: 'done',
      path: '/docs/reporting',
      outcome: 'down',
      brief:
        'A past demo case: the reporting page title went from a concrete task to a broad “data insights”. Check whether the search intent was diluted before rolling back the whole article.',
      comments: [
        'Grace Lawson · Growth: Clicks went from 164 to 119. Check which queries the new impressions came from before calling the content worse.',
        'Sophie Bennett · Content: The next title brings back “weekly sales report”; the body stays as it is so we don’t change too much at once.',
      ],
      draft:
        '# Reporting guide review\n\nDemo data: seven-day search clicks 164 → 119, impressions 4,200 → 4,850.\n\nPossible explanation: the title reaches broader terms that don’t match the reader’s task. Ranking, demand and the results page may also have changed.\n\nNext: split queries into “weekly sales report”, “rollup fields” and “dashboards”; change only the title and summary, keeping the body as a control.\n\nThis is a hand-written past sample; nothing went live.',
    },
    {
      key: 'workflow-result',
      title: 'No clear change yet after the approval checklist update',
      kind: 'content',
      state: 'done',
      path: '/docs/workflows',
      outcome: 'flat',
      brief:
        'A past demo case: adding approval prerequisites and a checklist changed search little in the short term. Keep the changes that help readers finish, and don’t keep retitling to make the chart go up.',
      comments: [
        'Chloe Park · Implementation: Traffic barely moved, but the checklist cut back-and-forth; that value isn’t measured in clicks.',
        'Grace Lawson · Growth: Seven-day clicks 98 to 102, which the current threshold calls no clear change. Keep watching; no follow-up task.',
      ],
      draft:
        '# Approval checklist review\n\nAcross equal demo windows, search clicks went 98 → 102 — too small to call growth or decline.\n\nKept: separate checks for requester, approver, amount, attachments and return reason.\n\nNot concluded: no change in a week doesn’t mean the checklist didn’t help, and four more clicks don’t prove it did.\n\nNext: design a check around how many support rounds readers need to finish.',
    },
    {
      key: 'permissions-small-sample',
      title: 'Not enough data yet for the team permissions FAQ',
      kind: 'content',
      state: 'done',
      path: '/docs/getting-started',
      outcome: 'insufficient',
      brief:
        'A past demo case: the page has just entered observation, with few clicks and no complete later window. Say plainly the data is insufficient instead of reading the gap as zero.',
      comments: [
        'Grace Lawson · Growth: Only three comparable days so far; don’t report a percentage yet.',
        'Ethan Morgan · Review: The conclusion now says insufficient data; we’ll review after a complete window.',
      ],
      draft:
        '# Permissions FAQ observation\n\nThe demo sample holds only three days of the later window, which can’t be compared with the full seven days before.\n\nDecision: no percentage; keep the known days and the gap note; conclude once coverage is complete.\n\nNo record is not zero clicks, and it doesn’t mean collection succeeded.',
    },
    {
      key: 'template-waiting',
      title: 'Customer template guide waiting for its first observation window',
      kind: 'content',
      state: 'done',
      path: '/blog/template-onboarding',
      outcome: 'waiting',
      brief:
        'A hand-written past sample: the deliverable is filed and the seven-day mark isn’t reached yet. It shows the waiting state; nothing is published and no effect tracking starts.',
      comments: [
        'Sophie Bennett · Content: The guide is complete; the diagram matches the field names.',
        'Grace Lawson · Growth: The window isn’t over; no conclusion yet.',
      ],
      draft:
        '# Customer management template guide\n\nThe sample has customers, contacts and follow-ups. Before starting, check the customer owner field and whether a customer may have several contacts.\n\nCheck in this order: create a fictional customer → link a contact → log a follow-up → switch to a sales account and check what it sees.\n\nThe demo observation hasn’t ended; this is not a deployment or publication record.',
    },
    {
      key: 'backup-guide',
      title: 'Backup drill guide done, waiting for technical review',
      kind: 'content',
      state: 'review',
      path: '/docs/getting-started',
      brief:
        'A backup article must include restore verification. Use a separate test directory and explain that the database, attachments and configuration are saved together. A backup command returning success is not a working restore.',
      comments: [
        'Henry Cole · Developer relations: Added three restore checks: signing in, a known record, and downloading an attachment.',
        'Chloe Park · Implementation: Please add that the drill environment must not send customer notifications, so restored jobs don’t fire.',
      ],
      draft:
        '# After the backup, rehearse a restore\n\nRecord when the backup was taken, the version and the data it covers. Restore the database, files and matching configuration in an isolated environment, then check:\n\n1. The administrator can sign in, and members have the expected permissions.\n2. A customer record chosen in advance still has its follow-up history.\n3. A known attachment downloads with the right content.\n4. Old outbound notifications and scheduled jobs don’t run in the drill environment.\n\nRecord how long the restore took and which steps failed, and name who runs the next drill. Verify the exact commands for your deployment.',
    },
    {
      key: 'api-pagination',
      title: 'Collect the three most misunderstood API pagination questions',
      kind: 'research',
      state: 'todo',
      path: '/docs/reporting',
      brief:
        'For a later developer article: page numbers versus cursors, starting over when filters change, and whether an empty page means no permission. Prepare inputs and expected outputs first; don’t write parameter names that weren’t verified.',
      comments: [
        'Henry Cole · Developer relations: Use 23 fictional orders, ten per page, so the last page and the empty page are both easy to explain.',
      ],
    },
    {
      key: 'customer-interview',
      title:
        'Review where an implementation consultant got stuck building service tickets',
      kind: 'research',
      state: 'doing',
      path: '/blog/workflow-checklist',
      brief:
        'The fictional interviewee builds an after-sales system for an equipment maker. Known issues: how devices, customers and repair records relate, and engineers seeing only tickets assigned to them. Focus on the modeling order, not a wish list.',
      comments: [
        'Chloe Park · Implementation: Round one mapped the entities; reassigning tickets and back-filling offline work are still missing.',
        'Grace Lawson · Growth: In the conclusion, separate “don’t know how to set it up” from “not supported yet”; they lead to different actions.',
      ],
    },
    {
      key: 'release-summary',
      title: 'Review this month’s developer content topics',
      kind: 'research',
      state: 'done',
      path: '/blog/workflow-checklist',
      brief:
        'Sum up the editorial calls on getting started, permissions, approvals and reporting. For the team’s own use; no single metric stands in for editorial quality.',
      comments: [
        'Sophie Bennett · Content: “Why we didn’t do it” is recorded too, so whoever picks this up understands the trade-offs.',
        'Ethan Morgan · Review: Approved. Next month, permissions and migration come first; no more generic product introductions.',
      ],
      draft:
        '# This month’s content review\n\n## Keep going\nPermission scenarios and field migration both answer concrete reader questions; finish the hands-on examples first.\n\n## Paused\nA generic “low-code trends” article has no material of its own; a product overview repeats the home page.\n\n## Rewrite\nThe reporting title goes back to the reader’s task; the approval example must include a return.\n\n## Not sure yet\nWhether splitting the video helps people find things — watch whether they finish the steps on their own.\n\nThese are a fictional team’s editorial notes, not real customer feedback or business data.',
    },
    {
      key: 'cancel-generic-ai',
      title: 'Pause the “AI will replace every internal tool” topic',
      kind: 'research',
      state: 'done',
      path: '/blog/workflow-checklist',
      cancelled: true,
      brief:
        'The topic overpromises and can’t answer the target reader’s questions. Cancelled; the discussion is kept for later topic planning.',
      comments: [
        'Ethan Morgan · Review: The title has no evidence behind it and nothing to do with this month’s modeling and permissions theme.',
        'Grace Lawson · Growth: Agreed. The related questions move into the API and automation interviews; no separate trends piece.',
      ],
    },
    {
      key: 'archive-old-homepage',
      title: 'Archive the old home page positioning discussion',
      kind: 'research',
      state: 'done',
      path: '/',
      archived: true,
      brief:
        'The old discussion was about “anyone builds a system with zero learning curve”, since replaced by concrete business scenarios. Kept for history, no longer a basis for writing.',
      comments: [
        'Sophie Bennett · Content: The old wording ignored modeling and maintenance; we stopped using it.',
        'Ethan Morgan · Review: Archived. From now on, cite the positioning note in the knowledge base.',
      ],
      draft:
        '# Old positioning discussion, archived\n\nWe no longer say “zero learning curve” or “for any team”.\n\nCurrent direction: help teams with a clear process, willing to invest in modeling and maintenance, build internal applications that can evolve.\n\nThis record explains a past decision; it is not current public copy.',
    },
  ],
  documents: [
    {
      key: 'positioning',
      title: 'Positioning: say first who it is for',
      category: 'product',
      text: '# Positioning\n\nFor teams that manage several kinds of related data, different permissions per role and processes that keep changing. The first example is customer management, which doesn’t make the product a ready-made CRM.\n\nTypical readers are implementation consultants, technically minded operations leads and in-house developers, willing to invest in modeling, permissions and maintenance.\n\nAvoid promising: zero learning curve, no maintenance, replacing every system. Concrete tasks, prerequisites and how to check the result help more than slogans.',
    },
    {
      key: 'personas',
      title: 'Three readers and the questions they decide on',
      category: 'customer',
      text: '# Reader personas\n\n## Implementation consultant · Chloe Park\nTurns a client’s spoken process into a maintainable system. Cares about the relationship model, permission boundaries, changing requirements and handover. Needs complete cases, especially the exceptions.\n\n## Operations lead · Grace Lawson\nNeeds reliable reports and cross-team work. Happy to configure pages, but doesn’t want to wait for developers on every field change. Asks whether it can be maintained before asking whether it is quick to build.\n\n## Developer relations · Henry Cole\nExplains technical questions clearly. Cares about reproducible steps, version differences, API boundaries and who owns the deployment.\n\nAll fictional demo people; each is also a sign-in of this demo.',
    },
    {
      key: 'tone',
      title: 'Writing rules: concrete, restrained, checkable',
      category: 'product',
      text: '# Writing rules\n\nStart with the task the reader wants to finish. Every hands-on example has a starting state, the steps and the expected result.\n\nExplain data permissions with “sales see only customers they own”, not “empowering fine-grained collaboration”.\n\nSeparate observation from attribution. Write a gap as missing, never as zero. Never pass off customer names, feedback or metrics as real cases.\n\nPrices, licensing, performance and version compatibility come from the official material; when they can’t be checked, leave them marked as to confirm.',
    },
    {
      key: 'editorial',
      title: 'Six-week content plan and what is paused',
      category: 'other',
      text: '# Six-week plan\n\nWeek 1: permissions guide and Docker first-start checks. Week 2: spreadsheet migration fields and the customer relationship example. Week 3: approval return case. Week 4: reporting titles and summaries. Week 5: video chapters. Week 6: review and gaps.\n\nPriority goes to whether readers can finish a concrete task, not search volume alone.\n\nPaused: generic AI trends, unverified competitor feature lists, and “live in ten minutes” promises without maintenance notes. Keep time each week for community questions.',
    },
    {
      key: 'community',
      title:
        'Community replies: confirm the scenario, then ask for a minimal repro',
      category: 'other',
      text: '# Community reply rules\n\nRestate the goal, confirm the version and deployment, then separate the expected from the actual result. Ask only for the smallest anonymized configuration and fictional samples.\n\nNever ask for passwords, tokens, full databases or customer records, and don’t call a configuration question a product bug.\n\nWhen it reproduces, list the input, steps, expected and actual result; when it doesn’t, say what is missing. For permissions, test with at least two roles; an administrator screenshot proves nothing about isolation.\n\nA draft goes out only after human review.',
    },
    {
      key: 'review',
      title: 'Before publishing: facts, permissions, readability',
      category: 'other',
      text: '# Review checklist\n\nFacts: versions, capabilities, prices and sources can be traced; uncertain points are marked.\n\nPermissions: the non-admin path is checked; list, detail and export agree.\n\nReadability: the first paragraph says who it is for; sample fields stay consistent; every step has a check.\n\nPublishing: confirm the approver, target page and scope. Demo drafts keep their fictional marking and are never a publication receipt.\n\nReview: equal windows, comparable dates, complete coverage. Change is not causation.',
    },
  ],
  opportunities: {
    notice:
      'A hand-written fictional demo scenario; the metrics, customer feedback and judgments are not real.',
    limitation:
      'One channel and a small sample cannot show causation; check the actual product version before acting.',
    priorityHigh:
      'It directly blocks users from finishing a first implementation or a data restore.',
    priorityOther:
      'Check the need first, then schedule editing and a technical review.',
    audience:
      'Business owners and developers evaluating and implementing NocoBase',
    observations: [
      'First implementations, permission checks and restore drills come first; short-term traffic swings stay on watch.',
    ],
    doReason:
      'A to-do drawn from hand-written demo material; verify before acting.',
    skipReason: 'Normal variation; routine monitoring continues.',
    briefs: [
      [
        'permissions',
        'Add a “sales see only their own customers” permissions example',
        'In the last 28 days the sample query “CRM data permissions” had 2,140 impressions and 43 clicks; three community threads stall on what sales and managers can see.',
        'Readers are already implementing; role concepts alone won’t get them through the setup.',
        'Show the same customer record as a sales rep, a manager and an administrator, with the steps to check both allowed and refused access.',
        'Let readers verify record permissions themselves, not just create roles.',
        '/docs/permissions',
        'gsc',
        'high',
      ],
      [
        'docker',
        'Add a troubleshooting map for the first Docker start',
        'Demo discussions show three problems — the container runs but the page won’t open, port conflicts, database connection failures; the install page had 860 visits and only 114 went on.',
        'These are different failures; reinstalling with one long command makes the first experience worse.',
        'Organize the checks as container state, port, logs, database, saying what success looks like at each step.',
        'Cut the trial and error new users go through on first start.',
        '/docs/installation/docker',
        'discourse',
        'high',
      ],
      [
        'migration',
        'Explain deduplication and rollback before importing a customer spreadsheet',
        'In sample import interviews, contact phones contain spaces, company names use abbreviations, and old orders point to retired customer numbers.',
        'A successful import is not usable data; unique keys and relationships are the real obstacles.',
        'Prepare 30 messy rows and show normalizing, previewing conflicts, importing in batches and recovering from a failure.',
        'Let the migration owner plan a small trial import that can be rolled back.',
        '/guides/customer-import',
        'discourse',
        'high',
      ],
      [
        'approval',
        'Add a complete example of resubmitting a returned purchase approval',
        'Sample feedback on the approval tutorial asks who can edit after a return and whether resubmitting is approved again; the example only covers approval.',
        'Showing only the happy path leaves real rollouts without guidance on exceptions.',
        'Show request, return, edit, resubmit and withdraw, marking who acts at each step and what the server checks.',
        'Help implementers pin down approval states and what stays editable.',
        '/solutions/purchase-approval',
        'site',
        'medium',
      ],
      [
        'pricing',
        'Add a pre-purchase checklist to the commercial plugin page',
        'Sample pre-sales threads keep asking how development and production are billed and which features are commercial plugins.',
        'Buyers need the scope and where to confirm it; a list of feature names doesn’t support a purchase decision.',
        'List the questions sales must confirm; mark unverified terms as to confirm and invent no prices.',
        'Help purchasers prepare all their questions at once.',
        '/commercial-plugins',
        'discourse',
        'medium',
      ],
      [
        'api',
        'Add pagination and permission examples to the API list endpoints',
        'Demo queries include “API returns only the first 20” and “can a token read other departments”; the page shows a single request.',
        'Pagination combined with permissions is the real path of an integration.',
        'Show paging, filtering and error handling, and check with a restricted account that it can’t read across departments.',
        'Let integration developers read the full authorized data set safely.',
        '/docs/api/pagination',
        'gsc',
        'medium',
      ],
      [
        'backup',
        'Complete the backup tutorial with a restore drill',
        'The sample team scheduled backups but never checked whether attachments were included or how long a restore takes.',
        'A backup file existing doesn’t prove the service can be restored.',
        'Restore the database and attachments in a separate test environment, spot-check three records, record the time and failures; leave production alone.',
        'Produce a restore checklist that can be repeated.',
        '/guides/backup-restore',
        'site',
        'high',
      ],
      [
        'video',
        'Split the long tutorial into three short exercises',
        'Retention holds for the first two minutes of the demo video and drops once complex approval setup starts; comments want the customer table and form first.',
        'First-time viewers need a shorter path to success.',
        'Split into customer table, entry form, role permissions; each with starting data and the expected result.',
        'Let new users finish one checkable result in ten minutes.',
        '/tutorials/first-app',
        'youtube',
        'low',
      ],
      [
        'crm',
        'Turn the CRM landing page into a checkable starting point',
        'Clicks on the sample query “build your own CRM” grew, but the page is only a feature overview with no data model or trial steps.',
        'The intent is closer to an implementation evaluation; show the smallest working setup.',
        'Draw the customer, contact and follow-up relationships first, then make a 15-minute demo.',
        'Let readers judge whether it fits their sales process.',
        '/solutions/crm',
        'gsc',
        'medium',
      ],
      [
        'discourse',
        'Collect the follow-ups and answers about multi-role approvals',
        'One demo thread has four rounds of questions on department heads, delegated approval and handover after someone leaves.',
        'Answering “approvals are supported” hides the boundaries; split the scenarios.',
        'Write up the verified setups and the capabilities still to confirm, with reproducible steps.',
        'Let later readers find the whole context in one answer.',
        '/community/approval-roles',
        'discourse',
        'medium',
      ],
      [
        'hype',
        'Don’t chase the AI buzzword chart without a use case',
        'An AI term is rising in the sample trends, but the intent doesn’t match what current data management users need.',
        'Picking topics on heat alone produces content unrelated to the product.',
        'Keep the search record and reassess once a real business case appears.',
        'Save limited editing time for users with a clear problem.',
        '/blog/ai-workflows',
        'trends',
        'low',
      ],
      [
        'duplicate',
        'Stop adding a second generic low-code introduction',
        'The demo library already has two similar concept articles; the new topic overlaps heavily with existing pages’ queries.',
        'More concept articles scatter internal links and maintenance effort.',
        'Archive the duplicate topic and fold the useful paragraphs into the existing introduction.',
        'Keep the content structure clear and avoid building the same thing twice.',
        '/blog/low-code',
        'site',
        'low',
      ],
    ],
    watches: [
      [
        'conversion',
        'Trial conversions dipped after the docs redesign',
        'The sample has 96 docs visits and 4 trials in the last three days; the window is short and includes a weekend.',
        'Wait for a full seven days and check that key events are recorded, then compare the same weekdays.',
      ],
      [
        'github',
        'Do new GitHub followers turn into actual use?',
        'The demo repository gained 78 stars this week, but download and first-start data aren’t complete yet.',
        'Decide once downloads and first starts cover the same week; stars are not active users.',
      ],
      [
        'localization',
        'Is the English purchasing case worth translating first?',
        'Only two sample English requests, from teams of very different sizes with different purchasing processes.',
        'Run at least three more interviews and confirm a shared problem before scoping the content.',
      ],
    ],
    normal: [
      'Branded clicks are steady; no new action',
      'This week the demo had 318 branded clicks against 311 last week, not enough to justify a task.',
    ],
    goal: {
      intent:
        'Help teams evaluating NocoBase finish their first small business application they can verify.',
      audience:
        'Implementation leads, business analysts and developers doing integrations.',
      focus:
        'Permissions, data migration, approvals, first deployment and restore drills.',
      progress:
        'Progress is finished exercises and concrete implementation questions; this project is a fictional demo.',
    },
  },
  secondTasks: [
    {
      key: 'nococrm-landing',
      title: 'Write the NocoCRM landing page for small sales teams',
      kind: 'content',
      state: 'todo',
      path: '/',
      brief:
        'NocoCRM was just added. Start from what a five-person sales team checks in the first week: importing contacts, the pipeline view and who sees which deals.',
      comments: [
        'Grace Lawson · Growth: Only the website and Google are connected; plan from search data before writing.',
      ],
    },
    {
      key: 'nococrm-google',
      title: 'Reconnect Google Search Console for NocoCRM',
      kind: 'research',
      state: 'doing',
      path: '/',
      brief:
        'The Google authorization of this project has expired, so search data stopped updating. Sign in again on the Data connections page before the next weekly review.',
      comments: [
        'Sophie Bennett · Content: The connection shows “authorization expired”; this is the demo’s problem record.',
      ],
    },
  ],
  chat: {
    metricsIntro:
      'From the demo project’s search data (through {0}), the queries with the most clicks:',
    metricsLine: '- “{0}”: {1} clicks, {2} impressions, average position {3}',
    metricsOutro:
      'The getting started and permissions pages carry most of these clicks. A real model would read the same numbers and suggest where to look next; this answer is simulated.',
    tasksIntro: 'Your tasks in the demo projects:',
    states: {
      todo: 'To do',
      doing: 'In progress',
      review: 'Needs review',
      done: 'Done',
    },
    tasksOutro:
      'Open a task to see its discussion and drafts. (Simulated answer.)',
    opportunitiesIntro: 'The open opportunities of the demo project:',
    opportunitiesOutro:
      'The permissions and Docker first-start items are high priority because they block a first implementation. Turn one into a task on the Opportunities page. (Simulated answer.)',
    none: 'I found nothing to show for that in the demo project. (Simulated answer.)',
  },
};
