<p align="center">
  <img src="public/assets/nocoreach-mark.svg" width="72" alt="NocoReach">
</p>

<h1 align="center">NocoReach</h1>

<p align="center"><strong>Understand your data, turn it into market opportunities, and get them done.</strong></p>

<p align="center">
An AI growth operations platform.<br>
Data collection, daily analysis and agent execution, all in one place.
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja-JP.md">日本語</a>
</p>

> **Project status:** NocoReach is at an early stage, and its features and interface are still changing. Issues and pull requests are welcome.

![Insights: key metrics, today's changes and the AI's verdicts](docs/images/readme/insights-en.png)

## Plenty of data, hard to act on

**Data is scattered.** Search data sits in Search Console and SEO tools, traffic in GA4, and user conversations across forums, social media and community chats. If the product is open source, there are GitHub stars and package downloads as well. Seeing the whole picture means switching between a dozen tabs.

**Data alone does not tell you what to do next.** SEO platforms such as Ahrefs and Semrush have comprehensive data and present it as reports and metrics. What to do next, and what to do first, is still your call, and the work itself has to be arranged separately.

**Data and execution are disconnected.** Open-source tools such as OpenSEO fetch the same data on demand at low cost, and can hand it to agents like Claude Code through MCP. They cover only SEO and AI search data, though, and the work happens in each person's local environment. The agent sees only what it is given that time, and there is no shared record of what was done or how it turned out.

## NocoReach: from data to execution on one platform

NocoReach brings the whole growth operations loop onto a single platform:

```
Data sources → Daily analysis → Opportunities → Tasks → Agent execution → Review and publish → Results
```

- **All data in one place.** More than 20 sources are supported, with more on the way. Search, website, GitHub, package downloads, community and AI search data are stored in the same database and analyzed together. NocoReach is open source, so if a source you need is missing, your agent can build it.
- **Analysis that reaches a conclusion.** Every day, rules pick out what changed and the AI decides whether each change is worth acting on, with the evidence attached.
- **Agents with the full context.** When working on a task, the agent reads the relevant metrics, keywords, pages, audit results, community posts and project knowledge directly. Nobody has to compile them by hand.
- **Execution that lands in your repository.** The agent edits files in your website and docs repository and opens a pull request for you to review and merge.
- **Results you can follow.** On day 7 and day 28 after going live, the data is compared automatically. Every task keeps a full record from evidence to execution to results.

|                    | SEO platforms such as Ahrefs | Open-source tools such as OpenSEO | **NocoReach**                                                                                              |
| ------------------ | ---------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Data coverage      | SEO and AI search            | SEO and AI search                 | 20+ sources: SEO, AI search, website, GitHub, community and more<br>Connect any other market data yourself |
| What to do next    | You judge from reports       | You judge, or ask a local agent   | Daily analysis proposes opportunities with evidence                                                        |
| Execution          | Outside the platform         | In each person's local agent      | An agent in the platform edits the repository and opens a PR                                               |
| Review and results | Up to you                    | Up to you                         | Human review before publishing; automatic comparison on days 7 and 28                                      |
| Deployment         | SaaS                         | Self-hosted                       | Self-hosted, full source code                                                                              |

## Features

### Data sources

| Website and product                                                                                                                               | Search and market                                                                                                                                            | Community                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| GA4 traffic and conversions<br>Website pages and site audit<br>GitHub stars, forks, traffic and Discussions<br>npm, PyPI and Docker Hub downloads | Google Search Console<br>Keyword research and rank tracking<br>Google Trends<br>Competitor activity and overview<br>AI search (ChatGPT, Google AI Overviews) | Discourse forums<br>Hacker News, Reddit, X<br>Discord, Slack<br>YouTube, Bilibili, Xiaohongshu |

- **Discovery.** Enter your website address and the AI finds the docs site, GitHub repository and community forum you can connect. Nothing is connected until you confirm.
- **Guided setup.** Each source explains what you need to prepare, answers common questions, and lists the signals it can reveal.
- **Data health.** Sources that failed to sync or hold stale data are shown in one place.

![Data sources](docs/images/readme/connections-en.png)

### Daily analysis and opportunities

- 34 built-in analysis rules turn the data into five kinds of signals: change, gap, timing, page performance and conversion.
- The analysis runs on a schedule every day. Each change gets an AI verdict (worth doing, watch first, or no action needed) with the reason and evidence.
- A change marked "watch first" must state the metric to watch, the condition for deciding and a deadline, and it is decided when the deadline arrives.
- When there is nothing new, no suggestions are generated.
- Rules can be switched on or off and their thresholds adjusted, and you can add your team's priorities.

![Opportunities: evidence, AI suggestion and playbook](docs/images/readme/opportunities-en.png)

### Tasks and agent execution

Every opportunity comes with its evidence: the data, the time window and the pages involved. If it is worth doing, turn it into a task; otherwise, ignore it.

Tasks follow playbooks. NocoReach ships with 12:

| Type      | Playbooks                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Improve   | Improve existing page, Sync language versions                                                           |
| Create    | New docs page, Write blog post, Write release notes, Content topic and outline, Draft community replies |
| Research  | Keyword research, Change investigation, Competitor comparison, Community question summary               |
| Technical | Technical fix (broken links, redirects, sitemaps, structured data)                                      |

- **Online AI** handles research, plans and drafts.
- **Changes to a repository are made by an agent.** Through a Runner on your computer or server, it uses coding tools such as Claude Code to read the repository, edit files, run checks and open a pull request. Each task has one branch and one pull request.
- The agent can only change the directories you allow. The model used, the tools called and any denied actions are recorded on the task page.

![Task board](docs/images/readme/tasks-en.png)

### Review, publishing and results

- People confirm the key steps: read the task brief before execution starts, review the plan when it is ready, and check the changes before publishing.
- You review and merge pull requests. Community replies are drafted by the agent and posted by you; NocoReach never posts on its own.
- After going live, NocoReach compares search clicks and page views of the changed pages before and after, and reports on day 7 and day 28: up, down, no clear change, or not enough data. It describes how the data moved and does not claim cause and effect.
- Built for teams: administrators and members, an owner for every task, and in-app notifications for anything that needs your attention.

### AI search visibility

See whether ChatGPT and Google AI Overviews mention your product when answering related questions, which pages they cite, and how your share of voice compares with competitors. Questions where competitors are mentioned and you are not are the first content gaps to close.

![AI search: brand mentions and share of voice](docs/images/readme/ai-search-en.png)

### Playbooks, skills and project knowledge

- **Playbooks** define the steps for each kind of task and which steps need human review. Edit them or create your own.
- **Skills** use the standard SKILL.md format, so Claude Code and similar tools can use them too. Import them from a GitHub link.
- **Project knowledge** covers your brand, positioning, voice, terminology and writing rules, and goes to the agent with every task.

## Who it is for

- Anyone who wants AI to take a deeper part in marketing work;
- Teams whose website, docs or blog live in a Git repository (Markdown, MDX), so the agent can edit them and open pull requests;
- Open-source projects and developer products, whose GitHub, package download and technical community data can be analyzed together.

## Security and control

- **Self-hosted.** Run it on your own server. Data travels only between the services you connect.
- **Encrypted secrets.** Credentials are stored encrypted on the server.
- **Your choice of model.** NocoReach uses the models and API keys you configure.
- **Cost limits.** Pay-per-query sources such as DataForSEO have a monthly budget.
- **Server-side permissions.** Every action is checked against administrator and member permissions on the server.
- **Network proxies.** Data collection can go through HTTP, HTTPS or SOCKS5 proxies.
- Chinese and English interface, with multiple projects per instance.

## Getting started

You need Node.js 24 and pnpm.

```bash
git clone https://github.com/nocobase/nocoreach.git
cd nocoreach
pnpm install
pnpm nocobase config init
pnpm dev
```

Open the address printed in the terminal and sign in with the initial administrator from `config.yml` (change the password before real use). Then:

1. Create a project and enter your website address;
2. Connect data sources under Settings → Data sources;
3. In AI team, configure models, connect a Runner and choose the default agent;
4. Open Insights to see the daily analysis.

To try the product without any real accounts, start a demo environment with [simulated data](docs/MOCK-DATA.md). For production deployment, see [Build and deploy](docs/APP-TEMPLATE.md).

## Built on NocoBase 3

NocoReach is a [NocoBase 3](https://www.nocobase.com) application. Accounts, permissions, notifications, scheduled jobs, models and agent management come from NocoBase, so NocoReach can focus on growth operations. The complete source code is in this repository: change it yourself, or have an agent change it.

## Documentation

| Document                                 | Contents                                             |
| ---------------------------------------- | ---------------------------------------------------- |
| [Development guide](docs/DEVELOPMENT.md) | Code structure and conventions                       |
| [Simulated data](docs/MOCK-DATA.md)      | Run a demo or test environment without real accounts |
| [Build and deploy](docs/APP-TEMPLATE.md) | Configuration, builds and Docker deployment          |
| [Changelog](CHANGELOG.md)                | What changed in each release                         |
