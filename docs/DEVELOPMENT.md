# 开发说明

当前唯一应用为 `apps/nocoreach`，本机 Agent 为 `apps/agent`。旧 Portal、alpha 插件及旧宿主浏览器脚本已移除，迁移基线保存在 Git 历史（`ac9addb430a0b3c70f09f526a8bcb67658f2d1c4`）。

## 目录与命令

- `apps/nocoreach/client`：业务页面、组件、路由与翻译。
- `apps/nocoreach/server`：原生路由、服务与调度；业务领域在 `providers/reach/domain`。
- `apps/nocoreach/database/main/migrations`：版本化表结构；使用原生 Repository。
- `apps/nocoreach/tests`：前端、框架与原生集成测试。
- `tests/unit`：复用的业务规则回归，直接加载新应用源码。
- `apps/agent`：本机命令行。

Node.js 24 以上、pnpm 11。首次安装执行 `pnpm --dir apps/nocoreach install --frozen-lockfile`。从根目录执行 `pnpm dev`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm start`；本机 Agent 使用 `node apps/agent/build.cjs`。配置与生产来源要求见 [安装说明](INSTALL.md) 和 [迁移记录](NOCOBASE3-MIGRATION.md)。

`pnpm test:business` 单独运行保留的业务规则测试。框架认证、角色、通知、配置与数据库以新应用原生测试为准，不再运行 alpha 插件装载测试。浏览器验证的实际覆盖与缺口见 [验收](NOCOBASE3-VERIFICATION.md)；空 E2E 测试集不能视为验收通过。

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

- 共用类（`.nr-panel`、`.nr-field`、`.nr-error` 等）只在 `client/components/reach/reach.css` 定义一次。
- 样式只用令牌（间距、字号、圆角、主题颜色、`--chart-1…5`），不写像素字号、固定颜色和 `.dark` 覆盖。
- 从 OpenSEO 移植的部件在 `client/components/seo/`；新页面不要加旧的 `nr-page` 类，它会盖住这些部件的样式。

**布局与文案**

- 主内容占满宽度，表单放在弹窗里，详情点了才从右侧滑出，不放常驻的侧栏小框。
- 文案只陈述事实，不解释界面怎么用。

**验收**：界面改动至少看“紧凑 · 浅色”和“宽松 · 深色”两种，夹具支持 `?density=default&dark=1`。

## 界面文字与多语言（2026-10-07）

- 界面文字一律写成 `$t("中文")`（`@/i18n`），中文原文就是键，英文在 `client/i18n/en.json`。带变量的写占位符：`$t("{0} 个主题", { 0: n })`；JSX 里变量可能是元素时用 `$tj`。同一个中文在不同地方要不同英文时（如菜单要复数），加用途：`$t("机会", undefined, "title")` 读 `"机会#title"`。
- 加了新文字后运行 `pnpm --dir apps/nocoreach typecheck`，把列出来的补进 en.json（发给 AI 的提示词不用 $t，不进翻译表）。
- 数据值不能翻译：存进数据库、发给服务端或拿来比较的中文（如分类、分组、旧任务状态）保持原样，只在显示时 `$t(value)`。
- 服务端照旧返回中文，前端显示时再翻译：服务端的句子以 `{0}` 句式放在 en.json 里，`$t(服务端文字)` 先查整句，再按句式匹配并把数字填回去，长句按“；。，”分段翻译；请求失败的报错在 `@/i18n` 里统一翻译。所以服务端改了文字或新加了文字，en.json 也要补上对应句式。
- 语言在加载页面代码之前确定（新应用入口及 locale 配置），切换语言会整页重新加载，所以 `$t` 是同步的；测试需显式设置语言环境。
- 内置做法从服务端以中文返回，前端读取列表时把没改过的翻成当前语言（`playbook-model.ts`）。
- AI 写的内容跟项目语言（`server/language.js`）：调用模型前用 `forLanguage(prompt, languageOf(project))`，英文项目会在提示词末尾加英文写作说明；提示词本身保持中文。新加 AI 调用也要这样做。每日分析的写法检查 `styleIssues(item, language)` 有中英两套规则。
- 本机 Agent：终端提示用 `apps/agent/src/text.ts` 的 `local(中文, 英文)`（跟电脑系统语言）；写到 GitHub 的文字用 `forProject(run.input.language, 中文, 英文)`；回报给服务器的过程保持中文，并把句式补进 `apps/nocoreach/client/i18n/en.json`。

## 服务端与增量开发

业务入口为 `server/routes/reach.ts`；身份、角色、Repository、Secrets、AI、通知及 Jobs/Scheduler 通过新框架服务集成。接口校验身份、业务权限和项目边界；密钥不得进入日志、提示词或前端响应。付费结果不确定时不自动重试。

复用现有应用与业务模块，开发前说明复用、调整、新增及依赖。同一次改动更新规格、验收和 CHANGELOG。数据库变更使用迁移，不重置已有业务数据。旧 alpha 数据库兼容不属于本项目要求。
