# beta.61 主题适配（2026-10-11）

用户确认聚焦主题更新，不重建业务功能。此次继续在 `upgrade/nocobase-app-beta` worktree 工作，参照官方 default 模板 beta.58 → beta.61 的实际源码差异，以及仓库同步的 `@nocobase/app-skills@0.1.0-beta.29` 主题流程。

## 版本说明

本次查验 npm 官方 registry：`@nocobase/app-template-default` 的 `beta` 为 `1.0.0-beta.61`，`latest` 为 beta.57；生成器 beta 为 `0.1.0-beta.30`，Skills beta 为 `0.1.0-beta.29`。

侧栏版本来自 NocoReach 自身 `package.json.version`，不是已安装依赖或最新模板的版本。最初主题部署仍显示 `v1.0.0-beta.56`；按用户后续要求，应用版本也更新为 `1.0.0-beta.61`。完整模板源码合并基线仍为 beta.58，本次选择性主题适配不改变该标记。

## 适配范围

- 紧凑、宽松预设同步采用新版蓝色主色，浅色为 `#002ad1`，深色为 `#8ca9ff`；同步更新焦点环、交互高亮和侧栏选中态。
- App 与 Settings 外壳统一使用轻微品牌渐变；一级及二级导航采用新版行高和间距，保留折叠、悬浮子菜单和手机导航机制。
- 表头保持中性色，增强层次和对比。官方组件使用 `data-slot`，旧业务表格使用 `.nr-page`，在共享样式里适配两者，业务页不逐页重写。
- 弹窗、抽屉和通知采用主题遮罩、阴影与提示色；路由浮层补充样式标识，不改变关闭守卫、焦点恢复或路由行为。
- 新增 `client/theme/presentation.css` 管理上述展示规则；生成的 shadcn primitives 保持原样。
- 保留 NocoReach 标志、文案、业务状态 Tag 颜色、字体、表格内容密度、现有表单尺寸、登录流程和用户外观偏好。没有引入新版默认首页或 NocoBase 品牌水印。
- 修复主题测试页缺少 app-client 3 要求的运行配置声明的问题，以 Vite 的 base 提供预览路径；只影响测试 fixture。
- 真实页面验收发现并修复两个既有显示问题：任务表格固定列总宽度随密度增加，但原最小宽度固定，导致宽松模式标题只剩一字；手机头部完整品牌、项目名称和操作按钮互相遮挡。现在标题保留足够列宽，手机使用品牌及项目图标，完整项目名称仍在菜单和辅助文本中，各操作保留。

## 验证

87 项既有主题、偏好、导航、侧栏、浮层、header、AppLayout 和双语外壳测试通过；类型检查、修改的规范格式 TS/TSX 文件 ESLint、格式检查和 `git diff --check` 通过。两处移植页面仅改响应式 class，保留原有密集格式及其历史 lint 问题。新增主题色纳入原 token 完整性和 CSS 编译检查。

改变的主要文字配色在浅色／深色均达到 4.5:1：主按钮 9.33／7.58，高亮区 8.32／8.08，成功提示 5.64／8.06，警告提示 5.72／8.05。原有业务语义颜色未改动。

构建已完成 client/server/CLI、生产依赖验证和归档，26 个服务端入口验证通过。首次构建的外层会话在完成日志后返回 143；后续重建正常退出 0。Docker 构建再次通过目标平台与 Node ABI 校验。

本地主题预览确认浅色紧凑、深色宽松及 375px 手机视图。实际应用验收及截图记录在本 worktree 的 `storage/theme-beta61/`。

最终镜像在线上完成浅色紧凑、深色宽松任务表格与 375px 手机验收：标题列可读，手机头部不再重叠，导航和项目菜单均可打开。知识添加弹窗已检查后取消，没有提交业务数据。浏览器控制台没有 error/warn；测试后恢复原来的“跟随系统＋紧凑”偏好及默认视口。最终截图为 `tasks-light-compact-final.png`、`tasks-dark-spacious-final.png` 和 `tasks-mobile-fixed.png`。

## 发布与回退

最终主题镜像：`nocoreach3:app-beta61-theme2-20261011`（含真实页面验收后的两处响应式修复）。

```text
镜像 ID：sha256:5e3966f8e303f2abb7f3e5257061f4f91000823d27a84ab91d4a72fbc902ca7f
部署包 SHA256：d001d0b03d2612f6c52057592ac8320dbe627fa8c5f10183431d845ed1f399d4
源码快照 SHA256：f39d16418603e08318840f272fa7af919558dd57a398a9401d9d370d24e8869a
```

发布目录：`252:/opt/nocoreach3/releases/app-beta61-theme2-20261011`。

最终部署时间为 2026-10-11 09:53:21 UTC；09:53:52 UTC 验证容器 healthy、公共健康检查 200、SQLite quick_check 为 ok。迁移数仍为 55，业务表行数与发布前一致，配置文件校验值未变；本机 Codex Runner beta.4（协议 8）在线。机器剩余空间约 2.9 GiB。结构化结果保存在发布目录的 `verification.json`，浏览器检查在 `browser-console.json`。首页既有的 Google 同步失败和默认模型未配置提示仍需独立处理。

首次主题发布前完整配置与存储备份：`252:/opt/nocoreach3/backups/app-beta61-theme-20261011`；补丁再次发布前备份：`252:/opt/nocoreach3/backups/app-beta61-theme2-20261011`，各归档校验值保存在 `SHA256SUMS`。没有新增依赖或数据库迁移，没有更换 Runner 和 CLI 分发包。

如仅回退此次主题，可恢复备份的 Compose 镜像 `nocoreach3:app-beta61-20261011`，保留当前配置与存储，因为此补丁没有数据库结构变更。若恢复整个存储备份，会回到主题发布前的数据时间点，不能直接覆盖运行中的数据库。更早依赖升级的回退见 [部署记录](DEPLOYMENT-beta61.md#回退路径)。

上述两次主题部署使用升级 worktree 的未提交源码快照；后续将依赖、主题适配和应用版本更新一起提交并发起 PR，主 worktree 不变。本记录在主题源码发布归档之后补写，单独保存在发布目录。
