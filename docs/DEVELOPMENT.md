# 开发说明

更新：2026-10-07。安装到一台新的 NocoBase 见 [安装与升级](INSTALL.md)；结构见 [技术结构](architecture.md)。2026-10-07 前的各切片实现笔记在 [归档](archive/DEVELOPMENT-2026-10-07.md)。

## 目录

```text
apps/portal/          前端（NocoBase Portal 模板），页面在 src/pages，共用部件在 src/components/reach 与 src/components/seo
apps/agent/           本机 Agent 命令行
plugins/connections/  服务端插件：server/*.js 直接运行，server/execution/*.ts 编译到 dist/execution
tests/unit/           服务端单元测试（node:test）
tests/e2e/            Playwright 回归：夹具页面与真实宿主两类
apps/portal/tests/    前端单元测试（vitest）与夹具页面（tests/s1/*.html）
```

## 环境与构建

Node.js 24（20 以上可用）、pnpm 11。本机没有 pnpm 时，可以直接用 Node 运行各工具。

| 做什么 | 命令 |
| --- | --- |
| 装前端依赖 | `pnpm --dir apps/portal install --frozen-lockfile` |
| 构建前端 | 在 apps/portal：`pnpm build && pnpm build:html`（或 `node node_modules/typescript/bin/tsc && node node_modules/vite/bin/vite.js build && node scripts/build-html.mjs`） |
| 编译插件 | `node plugins/connections/scripts/build-client.cjs && node plugins/connections/scripts/build-server.cjs` |
| 打包插件 | `node plugins/connections/scripts/pack.cjs [输出目录]`，生成 `nocoreach-plugin-connections-<版本>.tgz` |
| 编译本机 Agent | `node apps/agent/build.cjs` |

- `build:html` 不能省：它按 `.env` 把 `NOCOBASE_PORTAL_BASE`（`/x/main/`）写进 `dist/index.html`，漏了按需加载的样式会失效。
- 版本号在 `apps/portal/package.json` 的 `nocoreach.version`。`nb portal deploy` 只复制 apps/portal 去构建，所以前端构建不能读仓库里 apps/portal 以外的文件。

## 测试

| 测试 | 命令 |
| --- | --- |
| 服务端单元测试 | 仓库根目录 `node --test tests/unit/*.test.cjs` |
| 前端单元测试 | apps/portal 里 `node node_modules/vitest/vitest.mjs run --dir tests`（要加 `--dir tests`，否则会跑到模板示例） |
| 类型检查 | apps/portal 里 `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` |
| 夹具回归 | 在 apps/portal 起 `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 14320`，再运行 `node tests/e2e/<名字>-review.mjs` |

- **夹具回归**：页面在 `tests/s1/*.html?page=…`，接口是夹具里模拟的，不连真实服务。用 `NR_CHROMIUM_PATH` 指定 Chromium。常用的有 task-detail、opportunity-page、playbooks、knowledge、skills、sources-catalog、new-sources、data-pages、search-performance、keywords、domain-overview、site-audit、ai-search、seo-handoff。
- **真实宿主回归**：opportunities、strategy、sources、refresh、opportunity-period、discovery、task-work、task-execution 这几个要连真实宿主，需要 `NR_PORTAL_URL`、`NR_API_TOKEN` 这类测试身份。
- **菜单**：改菜单后先构建前端，再跑 nav-badges-review。
- 不要提交环境变量值和测试截图。

## 界面规范

所有页面遵守 NocoSolution《前端规范》（nocobase/NocoSolution `guidelines/frontend-standard.md`），界面参照 NocoProject。在本仓库落实为：

**页面结构**

- `@/components/reach/page` 的 `PageContainer`：`p-6 md:p-8`，不限宽，大屏铺满。
- `PageHeader`：唯一的 h1、一句说明、最多一个实心主按钮放最右；整页的说明用 `info`。
- 区块用 `Section`、`SectionHeading`。
- 加载、空、出错用 `@/components/reach/states`（含 `InlineError`）。

**部件**

- 状态标签只用 `@/components/reach/tag` 的 `Tag`，颜色按共享色表：需要你琥珀、进行中蓝、未开始灰、取消石板、完成绿、失败红。
- 人、Agent、系统的头像只用 `@/components/reach/actor` 的 `ActorAvatar`；AI 生成的内容旁放 `AiMark`。
- 有后果的操作用 `@/components/reach/confirm` 的 `confirmAction`，不用浏览器 confirm。
- 收起内容用 `@/components/reach/reveal` 的 `Reveal`，不用 `<details>`。
- 解释数据或概念用 `@/components/reach/info-tip` 的 `InfoTip`。词表在 `pages/glossary.ts`，表头和指标卡按名字自动带上。不在数据下面写黄色或灰色说明文字。

**样式**

- 共用类（`.nr-panel`、`.nr-field`、`.nr-error` 等）只在 `src/components/reach/reach.css` 定义一次。
- 样式只用令牌（间距、字号、圆角、主题颜色、`--chart-1…5`），不写像素字号、固定颜色和 `.dark` 覆盖。
- 从 OpenSEO 移植的部件在 `src/components/seo/`；新页面不要加旧的 `nr-page` 类，它会盖住这些部件的样式。

**布局与文案**

- 主内容占满宽度，表单放在弹窗里，详情点了才从右侧滑出，不放常驻的侧栏小框。
- 文案只陈述事实，不解释界面怎么用。

**验收**：界面改动至少看“紧凑 · 浅色”和“宽松 · 深色”两种，夹具支持 `?density=default&dark=1`。

## 界面文字与多语言（2026-10-07）

- 界面文字一律写成 `$t("中文")`（`@/i18n`），中文原文就是键，英文在 `src/i18n/en.json`。带变量的写占位符：`$t("{0} 个主题", { 0: n })`；JSX 里变量可能是元素时用 `$tj`。同一个中文在不同地方要不同英文时（如菜单要复数），加用途：`$t("机会", undefined, "title")` 读 `"机会#title"`。
- 加了新文字后运行 `node apps/portal/scripts/i18n-check.mjs`，把列出来的补进 en.json（发给 AI 的提示词不用 $t，不进翻译表）。
- 数据值不能翻译：存进数据库、发给服务端或拿来比较的中文（如分类、分组、旧任务状态）保持原样，只在显示时 `$t(value)`。
- 服务端照旧返回中文，前端显示时再翻译：服务端的句子以 `{0}` 句式放在 en.json 里，`$t(服务端文字)` 先查整句，再按句式匹配并把数字填回去，长句按“；。，”分段翻译；请求失败的报错在 `@/i18n` 里统一翻译。所以服务端改了文字或新加了文字，en.json 也要补上对应句式。
- 语言在加载页面代码之前确定（`src/index.tsx` 的 `settleLocale`），切换语言会整页重新加载，所以 `$t` 是同步的；测试和夹具不调用时就是中文。夹具页面加 `?lang=en` 显示英文。
- 内置做法从服务端以中文返回，前端读取列表时把没改过的翻成当前语言（`playbook-model.ts`）。

## 服务端约定

**插件结构**

- 插件入口是 `plugins/connections/server/index.js`，每个功能一个文件，在 `load()` 里注册。
- 数据表定义在 `server/tables.js`，启动时自动补建缺的表，已有的不动。加字段要先确认已部署的宿主上怎么补。

**接口**

- 自定义接口返回的对象顶层不要用 `rows` 字段：NocoBase 会把它改写成分页列表，其他字段丢掉，夹具测试测不出来。
- 动作名不要叫 `update`、`destroy`，NocoBase 会拦下来，改用 `edit` 等名字。
- 每个接口都要先检查管理员身份（`policy.js` 的 `requireAdmin`）和项目编号（`projectId`）。项目编号来自请求，不要写死 '1'；定时任务用 `plugin.projectIds()` 逐个项目运行。

**付费请求与 AI**

- 付费请求都走 `dataforseo.js`：先预留预算，再在复用期内复用结果；结果不确定的不自动重试，只有用户点了才重查。
- 在线 AI 调用走 `taskExecution.provider`。失败用 `policy.js` 的 `aiFail` 报错，还没接入在线 AI 时会直接说明去哪接入。

**密钥**

- 密钥用 `plugin.variable(name, value, true)` 存进“变量和密钥”，名字以 `NOREACH_` 开头、带项目编号。
- 密钥不进日志、提示词和返回给前端的数据。

## 部署到开发宿主

开发时用的宿主是源码方式运行的 NocoBase（`~/noreach-v3-alpha7`，端口 13004，pm2 进程 `index`，前端在 `/x/main/`）。部署步骤：

1. 按上面的命令编译插件、Agent 和前端。
2. 备份 `storage/portals/main/main/{src,dist}`、`storage/plugins/@nocoreach/plugin-connections/{server,dist/execution}` 到 `~/noreach-v3-alpha7-backups/<时间>-before-<改动>/`。
3. 用 `rsync -a --delete` 同步：`apps/portal/src/`、`apps/portal/dist/` 到 `storage/portals/main/main/` 的对应目录；`plugins/connections/dist/execution/` 到插件的 `dist/execution/`。`plugins/connections/server/` 同步到插件的 `server/`，这一项不加 `--delete`。
4. 在 `source/` 目录用 pm2 原来的 PATH 重启：从 `pm2 jlist` 读出原 PATH，再执行 `env -i HOME="$HOME" PATH="<原 PATH>:<Node 24>" PM2_HOME=~/noreach-v3-alpha7/storage/.pm2 node_modules/.bin/pm2 restart index`。
5. 核对：新接口未登录时返回 401；`curl -s http://127.0.0.1:13004/x/main/ | grep NOCOBASE_PORTAL_BASE` 应为 `/x/main/`。

用 `nb` 管理的环境（Docker）按 [安装与升级](INSTALL.md) 的“升级”一节做。

宿主数据库里是真实数据，只做只读核对。宿主 `.env` 里的初始管理员密码已经改过，不要用它登录。

## 增量开发

- 在现有 NocoBase 3、Portal、插件、数据表和测试上改，不另起应用、不换技术栈、不删已有业务数据。
- 每次改动先说清楚复用什么、调整什么、新增什么。
- 同一个提交里更新受影响的 SPEC、验收记录和 CHANGELOG。
- 用户的每个决定记进 DECISIONS。
- 数据结构优先兼容扩展；需要迁移时写明旧数据怎么保留。不能用重置数据库代替迁移。
