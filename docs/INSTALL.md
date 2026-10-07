# 安装与升级

适用版本：NocoReach 0.1，运行在 NocoBase 3.0.0-alpha.7 上。下面的步骤 2026-10-07 在一套全新的 Docker 环境里从头走过一遍（NocoBase 命令行 2.4.0-alpha.7、Node.js 22、pnpm 11）。

NocoReach 由三部分组成：

| 部分 | 在哪里运行 | 源码 |
| --- | --- | --- |
| 服务端插件（数据接入、同步、每日分析、机会、任务） | NocoBase 服务器 | `plugins/connections` |
| 前端页面 | NocoBase 的 Portal，地址 `/x/main/` | `apps/portal` |
| 本机 Agent（按任务修改网站仓库、开 PR） | 每个执行任务的人自己的电脑，需要 Claude Code | `apps/agent` |

## 准备

- 一台能长期开着的电脑或服务器。每日分析、数据同步、上线核实都在服务端定时运行，机器关了就停。
- Docker。
- Node.js 20 或更高，pnpm（`corepack enable pnpm` 或 `npm install -g pnpm`）。
- NocoBase 命令行：`npm install -g @nocobase/cli@alpha`，装好后命令是 `nb`。
- 本仓库源码：`git clone https://github.com/estheryo/NocoReach.git`，下面的命令都在仓库根目录运行。

## 一、建一个 NocoBase 环境

```bash
nb init -y -e nocoreach --setup-mode install-new -s docker -v 3.0.0-alpha.7-full --builtin-db --db-dialect postgres --app-port 13000 --root-username admin --root-email admin@example.com --root-password '<管理员密码>' -a basic --username admin --password '<管理员密码>' --locale zh-CN --skip-skills
```

- 会建两个容器：NocoBase 和它的 PostgreSQL 数据库，数据放在命令行给的目录里（结尾会打印出来）。
- 在中国大陆拉镜像慢时加 `--docker-registry registry.cn-shanghai.aliyuncs.com/nocobase/nocobase`；镜像已经在本机时加 `--skip-download`。
- `nb init` 会把命令行的“当前环境”切到 nocoreach。下面的命令都带 `-e nocoreach`，不受影响。

## 二、装服务端插件

```bash
pnpm --dir apps/portal install --frozen-lockfile
node plugins/connections/scripts/pack.cjs
nb plugin import ./nocoreach-plugin-connections-0.1.0.tgz -e nocoreach
nb app restart -e nocoreach
nb plugin enable @nocoreach/plugin-connections -e nocoreach
```

- 第一行装前端依赖，打包插件时要用到其中的 TypeScript。
- `pack.cjs` 编译插件，在仓库根目录生成安装包。
- 启用后插件会自动建好自己的 7 张数据表和“NocoReach 每日分析”工作流。数据表在 NocoBase 的数据源里能看到；以后升级如果多了新表，也会自动补上。已经有的表一律不动。
- 用到的 NocoBase 插件（AI 员工、工作流、变量和密钥、数据源、Portal 管理）在 `-full` 镜像里默认就是启用的。

## 三、部署前端

```bash
nb portal create main --template ./apps/portal --path ../nocoreach-portal --title NocoReach --force -e nocoreach
nb portal deploy main -e nocoreach
```

- 前端的名字必须是 `main`，地址是 `/x/main/`。Google 授权回来时会跳到这个地址。
- `--force` 会替换安装时自带的默认 `main` 页面。
- `--path` 是构建用的工作目录，放在仓库外面。
- 部署会在这个目录里装依赖、构建，再上传到 NocoBase。

## 四、第一次打开

1. 打开 `http://<服务器>:13000/x/main/`，用管理员登录。现在只有 admin 和 root 角色能用 NocoReach。
2. 页面上出现“创建第一个项目”：填产品名称和官网，建好后会进入“数据接入”。
3. **接入在线 AI**：AI 团队 → Agent → 添加 → 接入在线 AI，选服务商、填 API Key、选模型，先测试，能用才保存。每日分析、机会、各处的 AI 建议都靠它。
4. **接数据**：在“数据接入”里一个个接。所有密钥都在页面里填，加密存在 NocoBase 的“变量和密钥”里，不用改配置文件。
   - Google Analytics 与 Search Console：先在 Google Cloud 建一个 OAuth 客户端（Web 应用），回调地址填 `<你的地址>/api/nrGoogle:callback`。地址必须是 https，本机的 `http://127.0.0.1` 和 `http://localhost` 也可以。然后在 GA4 卡片里填客户端 ID 和密钥，再授权。
   - DataForSEO：关键词、竞品、排名跟踪、AI 搜索、趋势、Reddit 都用它，要填账号、密码和每月预算。
   - GitHub、论坛、下载量、Hacker News、X、Discord、Slack：按卡片上的提示填。
5. **连接本机 Agent**：AI 团队 → Agent → 添加 → 连接一台电脑，弹窗会给出三条命令。在要执行任务的电脑上：
   - 装好 Claude Code 并登录 GitHub（`gh auth login`）；
   - clone 本仓库；
   - 在仓库根目录运行这三条命令。
   第一条编译 Agent，没装前端依赖时会自动装好需要的 TypeScript。Agent 改哪个仓库，在“数据接入”的“网站源码”里设置。
6. **界面语言**：界面有中文和英文。要让大家能选中文，在 NocoBase 后台“系统设置”的语言里勾上简体中文（新装的环境默认只有英文）；之后每个人在头像菜单的“语言”里切换。
7. **每日分析**：每天 9:00（服务器时区）自动运行。要改时间，在 NocoBase 后台“工作流”里改“NocoReach 每日分析”。

## 升级

```bash
git pull
nb backup create -e nocoreach
node plugins/connections/scripts/pack.cjs
nb plugin import ./nocoreach-plugin-connections-0.1.0.tgz -e nocoreach
nb app restart -e nocoreach
nb portal create main --template ./apps/portal --path ../nocoreach-portal --title NocoReach --force -e nocoreach
nb portal deploy main -e nocoreach
```

- 先备份。
- 插件导入会整个替换旧的插件目录，重启后生效。
- 前端用 `--force` 重新建再部署。前端不存数据，业务数据都在数据库里。
- 本机 Agent 那边 `git pull` 后，重新运行编译命令（`node apps/agent/build.cjs`）。

## 常见问题

- **页面写“还没有接入在线 AI”**：在 AI 团队 → Agent 里接入。
- **读不到官网、GitHub 等公开网页**：先看服务器能不能访问这些网址。本机开了代理、把域名解析成 198.18.x.x 的，NocoReach 的安全检查会拒绝这类地址。这时给 NocoBase 进程设环境变量 `NOREACH_PUBLIC_DNS=1.1.1.1,8.8.8.8`，用公共 DNS 解析。
- **看日志**：`nb app logs -e nocoreach`。

## 现在的限制

- 只有管理员能用；还没有多人分工和权限。
- 绑定 NocoBase 3.0.0-alpha.7；NocoBase 升级大版本前要先验证。
- 服务端和数据库在同一台机器上；放到云服务器的做法还没有写。
