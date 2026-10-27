<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/public/assets/nocoreach-mark.svg" width="72" alt="NocoReach">
</p>

<h1 align="center">NocoReach</h1>

<p align="center"><strong>AI finds growth opportunities. Agents put them into action.</strong></p>

<p align="center">AI growth operations platform · Built on NocoBase Core</p>

<p align="center">
  <a href="https://solutions.nocobase.com/reach/"><strong>Try it online</strong></a> · <a href="https://www.nocobase.com/solution-reach/">Website</a> · <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja-JP.md">日本語</a>
</p>

https://github.com/user-attachments/assets/7fa9af94-3ce1-4918-841e-07cb9e6869e1

NocoReach is an AI growth operations platform. It connects 20+ data sources, from search and AI search to community and competitors, finds what's worth doing every day, and hands it to agents. You review every change.

| Step                     | What happens                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| 1. All data in one place | Site, search, AI search, community and competitors, synced daily    |
| 2. Daily analysis        | AI weighs each of the day's changes and writes up those worth doing |
| 3. Handed to agents      | Once you confirm, many tasks move at once                           |
| 4. Your review           | Articles and page changes go live only once you approve             |
| 5. Impact                | Compared automatically on days 7 and 28                             |

![Insights: the daily analysis and what needs your decision today](https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/insights-en.webp)

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

Open the address printed in the terminal, sign in with the initial administrator from `config.yml`, create a project and connect data under Settings › Data sources. For production deployment, see [Build and deploy](docs/APP-TEMPLATE.md).

## License

NocoReach is built on NocoBase Core and released under the [Apache-2.0](LICENSE) license.
