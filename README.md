<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/public/assets/nocoreach-mark.svg" width="72" alt="NocoReach">
</p>

<h1 align="center">NocoReach</h1>

<p align="center"><strong>AI finds growth opportunities. Agents put them into action.</strong></p>

<p align="center">AI growth operations platform · Built on NocoBase Core</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0"></a>
  <a href="https://github.com/nocobase/NocoReach/tags"><img src="https://img.shields.io/github/v/tag/nocobase/NocoReach?label=version&sort=semver" alt="version"></a>
  <a href="https://www.nocobase.com"><img src="https://img.shields.io/badge/built%20on-NocoBase%20Core-1f6feb" alt="Built on NocoBase Core"></a>
</p>

<p align="center">
  <a href="https://solutions.nocobase.com/reach/"><strong>Try it online</strong></a> · <a href="https://www.nocobase.com/solution-reach/">Website</a> · <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja-JP.md">日本語</a>
</p>

https://github.com/user-attachments/assets/7fa9af94-3ce1-4918-841e-07cb9e6869e1

NocoReach is an AI growth operations platform. It connects 20+ data sources, from search and AI search to community and competitors, analyzes every change in the data each day, finds the opportunities in it, and hands the marketing actions worth taking to agents. You review the work before it goes live, and the impact is compared after launch.

## Features

- **All in one place**: Research keywords, read the data, hand the writing to an agent, review and publish, and compare the impact, all in one system. Recommendations and marketing suggestions draw on every connected source, which makes them more precise.
- **22 data sources, one store**: GA4, Search Console, keywords and rankings, Google Trends, competitors, AI search (ChatGPT, Google AI Overviews), GitHub, npm / PyPI / Docker Hub, Discourse, Discord, Slack, Reddit, Hacker News, X and YouTube. Missing one? Have a coding agent build it.
- **Daily analysis**: 44 built-in rules find the changes; AI gives each one a verdict (act on it, watch it, or no action needed) and writes up the marketing actions worth taking as opportunities with evidence. AI helps you tune the rules: it looks at what each rule found recently and proposes changes that apply once you confirm, so the rules fit what you actually need.
- **Agent execution**: Coding agents such as Claude Code and Codex run through a Runner on your computer or servers, many tasks at once. 12 built-in playbooks cover research, content creation, content optimization and technical fixes; change them, or have AI draft new ones.
- **Human review**: Articles are previewed as readers will see them and page changes show before and after; nothing goes live until you approve.
- **Impact**: On days 7 and 28 after launch, each changed page's search clicks and views are compared automatically.
- **Customizable**: Skills (the common SKILL.md format), project knowledge, analysis rules and playbooks all follow your team; the source is open, so a coding agent can customize the rest.
- **Self-hosted**: Your data stays on your servers, with the models and agents of your choice. Apache-2.0.

## Screenshots

<table>
  <tr>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/insights-en.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/insights-en-thumb.webp" width="240" alt="Insights"></a><br><b>Insights</b><br><sub>The daily analysis weighs each of the day's changes</sub></td>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/opportunities-en.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/opportunities-en-thumb.webp" width="240" alt="Opportunities"></a><br><b>Opportunities</b><br><sub>Evidence for each, one click to an agent</sub></td>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/tasks-en.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/tasks-en-thumb.webp" width="240" alt="Tasks"></a><br><b>Tasks</b><br><sub>Many tasks moving at once</sub></td>
  </tr>
  <tr>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/traffic-en.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/traffic-en-thumb.webp" width="240" alt="Traffic"></a><br><b>Traffic</b><br><sub>GA4 visits, sources and key events</sub></td>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/keywords-en.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/keywords-en-thumb.webp" width="240" alt="Keywords"></a><br><b>Keywords</b><br><sub>Tick keywords and hand them to an agent</sub></td>
    <td width="33%" valign="top"><a href="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/aisearch-en.webp"><img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/aisearch-en-thumb.webp" width="240" alt="AI search"></a><br><b>AI search</b><br><sub>Questions where others appear and you don't, to an agent</sub></td>
  </tr>
</table>

More pages:

- **Data**: Pages, Site audit, Performance, Trends, Competitors, GitHub, Downloads, Forum, Hacker News, Reddit, X, Discord, Slack, YouTube
- **Operations**: Results, Playbooks, Skills, Knowledge, Analysis rules, Agent, Members & roles, Data sources

## Getting started

Just want a look? [Try it online](https://solutions.nocobase.com/reach/): you're signed in to a demo account, and all the data is made up.

To run it on your own computer, you need Node.js 24 and pnpm:

```bash
git clone https://github.com/nocobase/nocoreach.git
cd nocoreach
pnpm install
pnpm nocobase config init
pnpm dev
```

Open the address printed in the terminal, sign in with the initial administrator from `config.yml`, create a project and connect data under Settings › Data sources. For production deployment, see [Build and deploy](docs/APP-TEMPLATE.md). SQLite is the default; see [Multi-database deployment](docs/DATABASE-DEPLOYMENT.md) for PostgreSQL and MySQL preparation, configuration and verification.

## License

NocoReach is built on NocoBase Core and released under the [Apache-2.0](LICENSE) license.
