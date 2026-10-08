# Install and upgrade

中文：[安装与升级](../INSTALL.md)

For NocoReach 0.1 on NocoBase 3.0.0-alpha.7. These steps were run from scratch in a fresh Docker environment on 2026-10-07 (NocoBase CLI 2.4.0-alpha.7, Node.js 22, pnpm 11).

NocoReach has three parts:

| Part | Where it runs | Source |
| --- | --- | --- |
| Server plugin (data sources, sync, daily analysis, opportunities, tasks) | The NocoBase server | `plugins/connections` |
| Frontend | A NocoBase Portal at `/x/main/` | `apps/portal` |
| Local agent (changes the website repository and opens PRs for tasks) | The computer of each person who runs tasks; needs Claude Code | `apps/agent` |

## Before you start

- A computer or server that stays on. Daily analysis, data sync, and go-live checks run on the server on a schedule and stop when it's off.
- Docker.
- Node.js 20 or later, and pnpm (`corepack enable pnpm` or `npm install -g pnpm`).
- The NocoBase CLI: `npm install -g @nocobase/cli@alpha`; the command is `nb`.
- This repository: `git clone https://github.com/estheryo/NocoReach.git`. Run the commands below from its root.

## 1. Create a NocoBase environment

```bash
nb init -y -e nocoreach --setup-mode install-new -s docker -v 3.0.0-alpha.7-full --builtin-db --db-dialect postgres --app-port 13000 --root-username admin --root-email admin@example.com --root-password '<admin password>' -a basic --username admin --password '<admin password>' --locale en-US --skip-skills
```

- It creates two containers, NocoBase and its PostgreSQL database; the data folder is printed at the end.
- If pulling images from mainland China is slow, add `--docker-registry registry.cn-shanghai.aliyuncs.com/nocobase/nocobase`; if the image is already on the machine, add `--skip-download`.
- `nb init` switches the CLI's current environment to nocoreach. The commands below all pass `-e nocoreach`, so that doesn't matter.

## 2. Install the server plugin

```bash
pnpm --dir apps/portal install --frozen-lockfile
node plugins/connections/scripts/pack.cjs
nb plugin import ./nocoreach-plugin-connections-0.1.0.tgz -e nocoreach
nb app restart -e nocoreach
nb plugin enable @nocoreach/plugin-connections -e nocoreach
```

- The first line installs the frontend dependencies; packing the plugin uses their TypeScript.
- `pack.cjs` builds the plugin and writes the package to the repository root.
- Once enabled, the plugin creates its 7 data tables and the "NocoReach 每日分析" (daily analysis) workflow. The tables show up in the NocoBase data source; tables added by later versions are created on upgrade, and existing tables are never changed.
- The NocoBase plugins it relies on (AI employees, workflow, variables and secrets, data source, Portal manager) are enabled by default in the `-full` image.

## 3. Deploy the frontend

```bash
nb portal create main --template ./apps/portal --path ../nocoreach-portal --title NocoReach --force -e nocoreach
nb portal deploy main -e nocoreach
```

- The Portal must be named `main`, at `/x/main/`; Google authorization returns to this address.
- `--force` replaces the default `main` Portal that comes with the install.
- `--path` is the build folder; keep it outside the repository.
- Deploying installs dependencies and builds in that folder, then uploads to NocoBase.

## 4. First time

1. Open `http://<server>:13000/x/main/` and sign in as admin. For now only the admin and root roles can use NocoReach.
2. You'll see "Create your first project": enter the product name and website, and pick whether AI-written content is in English or Chinese (you can change it later in Project knowledge). After creating it you land in Data sources.
3. **Connect online AI**: AI team → Agents → Add → Connect online AI. Pick a provider, enter the API key, pick a model; it's tested first and saved only if it works. Daily analysis, opportunities, and the AI suggestions all depend on it.
4. **Connect data**: connect sources one by one in Data sources. All keys are entered on the page and stored encrypted in NocoBase's variables and secrets; no config files to edit.
   - Google Analytics and Search Console: first create an OAuth client (web application) in Google Cloud with the redirect URI `<your address>/api/nrGoogle:callback`. It must be https; `http://127.0.0.1` and `http://localhost` also work. Then enter the client ID and secret in the GA4 card and authorize.
   - DataForSEO: used by keywords, competitors, rank tracking, AI search, trends, and Reddit. Enter the login, password, and monthly budget.
   - GitHub, forum, downloads, Hacker News, X, Discord, Slack: follow the prompts on each card.
5. **Connect a local agent**: AI team → Agents → Add → Connect a computer. The dialog gives three commands. On the computer that will run tasks:
   - install Claude Code and sign in to GitHub (`gh auth login`);
   - clone this repository;
   - run the three commands from its root.
   The first builds the agent and installs the TypeScript it needs if the frontend dependencies aren't there. Which repository the agent changes is set under Data sources → Website source repo.
6. **Interface language**: the interface comes in English and Chinese. To let people choose Chinese, enable 简体中文 under Languages in NocoBase's system settings (new installs only have English); then everyone switches under the avatar menu → Language.
7. **Daily analysis**: runs every day at 9:00 server time. To change the time, edit "NocoReach 每日分析" under Workflow in NocoBase admin.

## Upgrade

```bash
git pull
nb backup create -e nocoreach
node plugins/connections/scripts/pack.cjs
nb plugin import ./nocoreach-plugin-connections-0.1.0.tgz -e nocoreach
nb app restart -e nocoreach
nb portal create main --template ./apps/portal --path ../nocoreach-portal --title NocoReach --force -e nocoreach
nb portal deploy main -e nocoreach
```

- Back up first.
- Importing the plugin replaces its whole folder; it takes effect after the restart.
- The frontend is recreated with `--force` and deployed again. It holds no data; business data lives in the database.
- On each local agent computer, `git pull`, run the build again (`node apps/agent/build.cjs`), then run `node apps/agent/dist/cli.js install-service` so the background program picks up the new version (if it runs with `start` instead, start it again).

## Troubleshooting

- **The page says "Online AI isn't connected yet"**: connect it under AI team → Agents.
- **Public pages like the website or GitHub can't be read**: check that the server can reach them. If a local proxy resolves domains to 198.18.x.x, NocoReach's safety check rejects those addresses; set `NOREACH_PUBLIC_DNS=1.1.1.1,8.8.8.8` for the NocoBase process to use public DNS.
- **Logs**: `nb app logs -e nocoreach`.

## Current limits

- Admins only; no team roles or permissions yet.
- Tied to NocoBase 3.0.0-alpha.7; verify before a major NocoBase upgrade.
- Server and database on the same machine; a cloud server setup isn't documented yet.
