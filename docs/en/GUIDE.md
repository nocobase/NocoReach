# NocoReach user guide

中文：[使用手册](../GUIDE.md)

Updated 2026-10-08. For installation see [Install and upgrade](INSTALL.md); the detailed rules for each page are in the [product spec](../../SPEC.md) (Chinese).

## What NocoReach is

NocoReach helps teams whose content lives in a Git repository (open-source products especially) answer two questions: which pages are most worth changing right now, and how did the changes work out?

Every day it reads your website and product data, and the online AI finds what's worth doing. You click "Hand off to agent", and the AI coding tool on your own computer (Claude Code) changes the website repository by your team's playbook and opens a PR. You review the result in NocoReach before publishing, and NocoReach then compares the data before and after the change.

## Concepts

| Concept | What it is |
| --- | --- |
| Project | One product and its website. You can have several and switch in the header |
| Data source | One kind of data connected: Google Analytics, Search Console, website content, GitHub, forum, downloads, DataForSEO, and more |
| Change | A change, gap, or problem found in the data by rules, each with numbers and a time range |
| Insights | The home page, updated daily: key metrics, latest changes, what's worth doing today, and what needs you |
| Opportunity | Something the online AI considers worth doing, with evidence. It becomes a task when handed off to the agent |
| Task | One piece of work: which playbook, who runs it, and which step it's at |
| Playbook | How a kind of work is done, as steps such as agent analysis, agent change, and your review. 11 come built in; you can edit them or have AI draft new ones |
| Agent | The AI doing the work. Online AI analyzes daily and proposes opportunities; the local agent runs tasks on your computer |
| Skills | Instructions for how to do something (like docs writing rules), given to the agent with tasks |
| Project knowledge | What the AI knows about the project: memory (conclusions about the brand, product, audience, terminology, no-go areas) and the knowledge base (reference material) |

## Language

The interface is available in English and Simplified Chinese: avatar menu (top right) → Language. The choice is saved to your own account and doesn't affect anyone else. If you don't see Language, ask an admin to enable both languages in NocoBase's system settings.

AI-written content (daily analysis, opportunities, task documents, project memory) is written in the project's language: picked when the project is created, and changeable at the top of Project knowledge under "Language for AI-written content". After a change, new content uses the new language; what was already written stays as it is.

## First steps

1. **Create a project**: on first use, enter the product name and website, and pick whether AI-written content is in English or Chinese. Add more projects later from the project name in the header.
2. **Connect online AI**: AI team → Agents → Add → Connect online AI.
3. **Connect data**: Settings → Data sources. Start with "Discover data": enter your website address, and AI finds the sources you can connect; connect the ones you select. Connect at least Search Console, Google Analytics, and website content; add GitHub if your source is there.
4. **Review project knowledge**: after the project is created, AI reads the website and writes a first draft of memory. Look it over in Project knowledge and fix it, then add competitor material, customer feedback, and so on to the knowledge base.
5. **Connect a computer**: AI team → Agents → Add → Connect a computer, and run the given commands on a computer with Claude Code. Then set the website source repository in Data sources; the agent changes that repository.
6. After 9:00 the next morning, open Insights to see the first daily analysis. You can also click "Update analysis" on Insights to run one right away.

## Day to day

1. **Check Insights**: the top shows tasks that need you; below are metrics, latest changes (each with an AI verdict: worth doing, watch, or skip), and what's worth doing today.
2. **Handle opportunities**: on Insights or Opportunities, look at the evidence and suggested approach, then click "Hand off to agent" or "Ignore". Handing off creates the task and opens it; it starts only when you click "Start" there after reading the brief and checking the playbook.
3. **Review in the task**: when the agent writes a plan or document, approve it after reading, or write feedback to have it redone. For website changes the agent opens a PR; click "Review and publish", look at the diff and preview, and merge once you're happy.
4. **Track impact**: after going live, NocoReach verifies the page was updated, then compares clicks, impressions, position, and traffic before and after on days 7 and 28; the verdict shows on the task and on Insights. If it didn't work, open a revert PR in one click.

Anything on a data page, such as a keyword gap, an audit issue, or AI search questions that don't mention you, can also be selected and handed off with "Hand off to agent" at the top right.

## Pages

Data pages appear in the menu once their data source is connected.

| Group | Pages | What you see |
| --- | --- | --- |
| Main | Insights, Opportunities, Tasks | Daily verdicts, what's worth doing, all tasks |
| Website and product | Traffic, Pages, Site audit, GitHub, Downloads | Traffic sources and pages, the full page list, website issues, stars and issues, npm/PyPI/Docker downloads |
| Search and market | Search performance, Keywords, Competitors, AI search, Trends | Google clicks and positions, saved keywords and rank tracking, comparison with competitors, whether AI answers mention you, search interest |
| Community | Forum, Hacker News, Reddit, X, Discord, Slack | What the community discusses and which questions go unanswered |
| AI team | Agents, Playbooks, Skills, Project knowledge, Analysis rules | Who does the work, how, and by which rules; Analysis rules shows and adjusts how the AI finds and judges changes |
| Settings | Data sources | Connect data, see each source's sync status, and see what you've spent |

## What costs money

- **Online AI**: daily analysis and the AI suggestions are billed by your model provider for the model you pick.
- **Local agent**: uses the Claude Code allowance on your computer.
- **DataForSEO**: set a monthly budget in Data sources; it stops when the budget runs out, and the spend is shown there. A query with an uncertain result isn't retried automatically, to avoid paying twice. Typical costs:
  - keyword suggestions: about $0.01 each;
  - competitor comparison: about $0.04 per competitor per month;
  - trends: about $0.022 per week;
  - Reddit: about $0.002 per week;
  - AI search questions: about $0.2 per topic per platform per month;
  - brand mentions: about $0.3–0.4 per check;
  - Lighthouse: about $0.005 each.

  Rank tracking, trends, competitors, and AI search questions run on a schedule once you turn them on; everything else runs only when you click.
- **X**: uses your own API token at X's prices; you can set a monthly cap ($5 by default).

## Data and security

- All keys are stored encrypted in NocoBase and never appear on pages, in logs, or in AI prompts.
- The local agent only changes the repository you registered, as branches and PRs; publishing always needs your confirmation, and it merges exactly the version you reviewed.
- Web pages, forum posts, and uploaded material are treated as reference, never as instructions.
- Missing data shows as empty, not zero; estimates are labeled as estimates.

## FAQ

- **Insights is empty**: the daily analysis hasn't run yet, or no data is connected. Connect data, then click "Update analysis".
- **"Online AI isn't connected yet"**: connect it under AI team → Agents.
- **A task stays at "Waiting for local agent to pick it up", or the Agents page shows the computer offline**: the agent program stopped on that computer (its terminal window closed, or the computer restarted). Click "Reconnect" on that computer in the Agents page and run `node apps/agent/dist/cli.js install-service` in the repository folder as shown: it installs the agent as a background program that keeps running after you close the terminal or restart the computer (Mac only for now; on other computers run `node apps/agent/dist/cli.js start` and keep the window open). While the computer sleeps the agent is offline too; it reconnects when the computer wakes.
- **Check whether the local agent runs in the background**: the computer's row on the Agents page says "Runs in background" or "Runs in a terminal"; for the latter, click "Run in background" and follow it. You can also run `node apps/agent/dist/cli.js status` in the repository folder; the log is in `~/.nocoreach-agent/logs/agent.log`. To stop running it in the background: `node apps/agent/dist/cli.js uninstall-service`.
- **The page looks outdated**: after a new version is published, open pages show "A new version of NocoReach is available"; click "Refresh".
