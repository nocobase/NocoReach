# NocoReach

中文：[README.md](README.md)

NocoReach is an AI content optimization workspace for teams whose content lives in a Git repository (open-source products especially), built on NocoBase 3.

Every day it reads your website and product data (Google Analytics, Search Console, GitHub, communities, DataForSEO, and more), and the online AI finds what's most worth doing. You click "Hand off to agent", and Claude Code on your own computer changes the website repository by your team's playbook and opens a PR. You review the result in NocoReach before publishing, and on days 7 and 28 NocoReach compares the data before and after the change.

```
Connect data → daily analysis → opportunities → hand off to agent → change the repo, open a PR → you publish → go-live check → impact
```

## Features

- **Insights**: daily key metrics, latest changes (each with an AI verdict), what's worth doing today, and what needs you.
- **Opportunities and tasks**: every opportunity comes with evidence; handed off to the agent, it runs by playbook and stops where you review. Tasks have list and board views.
- **AI team**: the local agent (Claude Code) and online AI; editable playbooks, Skills, and project knowledge (memory and knowledge base).
- **Data pages**: traffic, pages, site audit, GitHub, downloads, search performance, keywords, competitors, AI search, trends, forum, Hacker News, Reddit, X, Discord, Slack. Anything on them can be handed off to the agent.
- **English and Chinese**: switch the interface between English and Chinese; AI-written content follows the language set for each project.
- **Safety**: keys are encrypted on the server; the agent only changes the registered repository, and publishing always needs a person's confirmation; paid lookups have a monthly budget and aren't retried when the result is uncertain.

## Getting started

- [Install and upgrade](docs/en/INSTALL.md): set up NocoReach on a new machine with the NocoBase CLI.
- [User guide](docs/en/GUIDE.md): first steps, day-to-day use, and what costs money.

Only admins can use it for now; team roles and permissions come later. See the [roadmap](docs/ROADMAP.md) (Chinese) for what's missing.

## Source

| Folder | Contents |
| --- | --- |
| [`apps/portal`](apps/portal) | Frontend |
| [`plugins/connections`](plugins/connections) | Server plugin |
| [`apps/agent`](apps/agent) | Local agent |

The product spec, roadmap, decisions, and development notes are in Chinese under [docs](docs/). Third-party code is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
