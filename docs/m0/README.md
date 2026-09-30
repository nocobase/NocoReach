# M0 开发准备验收

日期：2026-09-30。结论：PREP-01～04 完成，可进入 M1。范围是本地基线、复用接缝和合成演示，**不代表生产 Run 服务、真实 Agent 或新版任务页面已经交付**。

## 基线与环境

- 仓库 main：`c979fe0c42664112aecbc2133fc9e076bebbe4c1`。本次 `git ls-remote origin refs/heads/main` 核对远端相同。M0 前已有 43 个未提交文件，路径和 SHA-256 见 [baseline.json](baseline.json)。本次没有提交、推送、部署或变更数据库。
- 待整理的既有改动：产品及研究文档；机会／策略导航与前后端；来源连接与时间窗口；任务协作页及服务；各自单元和真实环境验收脚本。清单用于后续按功能审查，不混入历史目录、备份、凭证或业务数据。
- Node 24.19.0；Portal 模板 3.1.1，实际 Vite 6.4.3。系统默认 Node 20 不能作为本项目验证工具链；使用桌面附带 Node 24。
- 运行宿主的 `@nocobase/server` 包为 3.0.0-alpha.7，本机 HTTP 返回 200。Docker 29.3.1；NocoReach PostgreSQL 16 容器运行约 34 小时，`pg_isready` 接受连接。只检查可用性，未读取业务表。过去 Docker 失响应的根因仍未解决；本次健康不证明长期稳定，也不代表登录／AI／业务 API 回归。

## 固定复用来源

| 来源与提交 | 检查文件／边界 | M0 决策 |
| --- | --- | --- |
| [NocoSolution](https://github.com/nocobase/NocoSolution/tree/e0357c27bb5e55ab7a8433864617f6d4d3002107) | guidelines/solution-guideline.md、frontend-standard.md | 采用人工负责人、执行与审核分离、单页滚动等规则；不作为运行时依赖 |
| [NocoProject](https://github.com/nocobase/NocoProject/tree/f7bceeaab43deb0f09136bc40bcc9f378a2fd573) | nocoproject/client/components/np-detail-layout.tsx | 移植为 ReachDetailLayout，依赖仅 React、cn、现有 Tailwind 主题；改名并增加立即测量，无新包 |
| 同上 | nocoproject/server/modules/run、trigger；nocoproject/server/providers/np.ts；nocoproject-cli/src/daemon/runner.ts、adapters/types.ts、echo.ts | Run 仍耦合 issue 和 /np；在线 provider 是直接模型调用；daemon 不直接装入 Reach。M0 自编 echo 原型验证 JSON 接缝，未移植／运行上游 daemon |
| [OpenSEO](https://github.com/every-app/open-seo/tree/0ffff93101043aad7600a3b6a499a0cd2887ef49) | MIT；关键词、SERP、候选列表及 serverFunctions | M3 采用页面结构与交互，保留 Reach 后端和付费查询边界；M0 未复制 OpenSEO 代码 |

NocoProject 使用 App 模板 1.0.0-beta.47 / app-portal-sdk / React 19.2，Reach 为 Portal 3.1.1 / portal-sdk / React 19.1。可抽取纯 React 组件，不整体搬迁路由、认证、provider 或 app-client。现有扩展示例 `nocobase-mail/components/mail-showcase-layout.tsx` 只有页头／分段组合，没有单滚动详情侧栏，因此抽取 NocoProject 布局更合适。其 shadcn 0.3 与本仓库 0.2 差异不进入本次抽取依赖。

来源声明已补入 [THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md)。NocoProject 没有已确认的统一宽松许可证，CLI 声明 private / UNLICENSED；此次按用户说明在私有产品内部复用，未作公开分发许可判断。

## 实际验证

| 验证 | 结果 |
| --- | --- |
| 原有后端回归 | 38/38 通过 |
| 添加 M0 后后端回归 | 40/40 通过；新增 2 项覆盖独立 echo 进程、TS→CommonJS、版本／项目／任务／run／步骤／协议／取消边界与幂等 |
| Portal 产品测试 | tests/*.test.ts，2 个文件、9/9 通过 |
| 类型及生产构建 | tsc、Vite build、build-html 通过；已有 >500KB bundle 提示保留，不影响本次接缝 |
| 浏览器布局 | 1440/390px × 明/暗 × 16/14px 密度共 8 组通过；宽屏 20rem 侧栏、短侧栏吸附、长侧栏末项可达、窄屏无横溢出，无 pageerror |
| 人工图像检查 | 已查看宽屏亮色和窄屏暗色截图；均为合成数据，截图仅在 /tmp |

第一次使用宽泛 `vitest run tests` 匹配到了模板 users-example 的测试，因 Node 环境无 document 失败；产品测试必须使用明确 `./tests/*.test.ts` 范围，不将模板示例的 DOM 测试当作产品验收。Playwright 当前期待 revision 1243，但本机缓存为 1228，本次显式指定已有 Chromium；CI 应安装与锁定 Playwright 匹配的浏览器。

## 重现

先将 Node 24 放到 PATH，在仓库根执行 `node --test tests/unit/*.test.cjs`。M0 测试自动编译 TypeScript 到唯一临时目录，通过 CommonJS require 后清理；不改变宿主入口。

在 apps/portal 执行：

```sh
node node_modules/typescript/bin/tsc
node node_modules/vitest/vitest.mjs run ./tests/*.test.ts
node node_modules/vite/bin/vite.js build
node scripts/build-html.mjs
node node_modules/vite/bin/vite.js --config tests/m0/vite.config.ts
```

预览为 `http://127.0.0.1:14320/tests/m0/`，独立环境目录，无 API 代理，不注册生产路由。另一终端在根目录运行 `node tests/e2e/m0-layout-review.mjs`；若浏览器未安装，设置 `NR_CHROMIUM_PATH` 为本地 Chromium 可执行文件。截图输出 /tmp，测试不要求业务 token。

## M1 接续任务

1. TASK-01：把通过验证的布局接入真实任务详情，补共用页头、负责人／执行者、运行状态和时间线；保留六阶段业务流。
2. TASK-02：按 [契约 v1](CONTRACT.md) 实施 Run、成果版本、版本绑定审核及线上 provider 适配。新增服务 TS 编译链需接入插件正式构建；M0 只证明编译加载可行。
3. TASK-03：落实旧 evidence.work 幂等迁移／兼容投影，并完成真实鉴权、并发和跨项目验收。当前任务表初始化及 owner 迁移需纳入实际 schema 管理，不能猜测现有实例字段。
4. M2：实现 lease、run token、持久化事件和停机恢复，再在指定测试目录跑真实 Codex；M0 原型没有这些能力。

进入 M1 没有遗留适配阻塞。真实宿主业务验收、Docker 稳定性、公开分发许可和 GitHub 同步分别跟踪，不因 M0 完成自动关闭。
