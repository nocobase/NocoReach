# CI 与 Studio 手动发布操作手册

本轮只交付工作流，不执行部署、不创建或轮换密钥、不修改仓库保护。线上发布仍需管理员完成下列配置，并单独授权验收。

## 自动检查和发布包

PR、`main` push 和手动 CI 都运行独立的 `tests`、`build`。使用 Ubuntu 24.04、Node 24 和 `package.json` 的 pnpm 版本，冻结安装并保留 postinstall；缓存仅为按锁文件匹配的 pnpm store。Vitest 全集（不含依赖在线应用的 Playwright）使用两个 worker，无测试时失败。JUnit 报告无论测试成功与否都上传；不包含 lint、格式检查、自动部署、PR 预览或 Docker 发布。

管理员可将 `tests`、`build` 配置为合并必需检查。本 PR 不改分支保护。默认分支已通过 GitHub API 和远端 HEAD 核实为 `main`；以后改名必须同时审查两个工作流与来源校验脚本。

完整构建命令：

```bash
pnpm install --frozen-lockfile
pnpm build --target linux-x64 --node-version 24 --tar
```

保留现有 `afterServerBuild` 钩子，归档包含运行依赖、客户端、服务端、配置模板，以及 `dist/runners` 下应用 CLI 和 Runner universal 安装包。脚本检查包结构并拒绝应用配置、`.env`、数据库和业务 storage。上传的 GitHub Artifact 名为 `release-<完整 SHA>-<run ID>-<attempt>`，包含 `dist.tar.gz`、`SHA256SUMS`、`metadata.json`，保留 14 天。重跑只接受同一成功 attempt 的包；仅重跑失败 job 而未重新构建时可能缺包，此时重跑全部 jobs。

只有同仓库 `.github/workflows/ci.yml` 的成功 `main` push 且两个 jobs 成功，才可部署。PR、手动 CI、其他 workflow、未完成和失败运行均拒绝。GitHub Artifact 来源与元数据一起校验，单独 SHA-256 不是可信来源证明。

## 管理员一次性配置

2026-10-13 的只读查询确认：Studio 已有 `nocoreach`，属于 `preview` 环境（host/in-process，当前未保护），访问挂载路径为 `/nocoreach/`。这不是部署授权。现有接口没有证明宿主 CPU/libc/Node 版本；管理员必须核实实际宿主支持 **Linux x64/glibc、Node 24**，不能凭历史发布记录设置确认变量。工作流在确认变量缺失时拒绝上传。

在 GitHub 创建 Environment `studio`，只允许 `main` 部署；是否加 GitHub 人工审批由维护者决定。GitHub 环境审批与 Studio 的环境保护是两层独立控制。管理员须保持分支限制，防止非默认分支修改工作流来请求同一环境的密钥。

| 类型     | 名称                | 配置说明                                                                                                          |
| -------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Variable | `NB_STUDIO_SERVER`  | Studio HTTPS 基址，包含挂载路径，例如 `https://studio.example.com/main`；不是 NocoReach 地址                      |
| Variable | `STUDIO_APP_ID`     | 必须为 `nocoreach`，脚本拒绝其他目标                                                                              |
| Variable | `STUDIO_APP_URL`    | NocoReach HTTPS 访问基址，包含真实挂载路径                                                                        |
| Variable | `STUDIO_TARGET`     | 核实宿主后设为 `linux-x64`                                                                                        |
| Variable | `STUDIO_NODE_MAJOR` | 核实宿主后设为 `24`                                                                                               |
| Secret   | `NB_STUDIO_API_KEY` | 限定仓库 `nocobase/nocoreach` 和目标应用的 CI deploy 密钥；须能上传/部署并读取部署、release、app 信息用于版本核验 |

管理员还需确认应用 Git 仓库关联、Actions runner 网络可达性、256 MiB 上传上限及代理超时。数据库、模型服务 Key、加密主密钥和业务数据留在 Studio；不要复制到 GitHub 或构建包。

`nb-studio build ci setup nocobase/nocoreach` 会创建或轮换仓库 CI 密钥，属于另行授权的一次性操作，**不是每次部署的步骤**。先用 `nb-studio build ci setup --help` 核对当前流程。采用 Environment Secret 时由管理员安全录入，指定轮换责任人；不要遗留仓库与 Environment 的同名旧值导致覆盖。若仓库 CI key 的读取范围不能满足 `release get`/`app get`，应先由管理员验证最小权限方案，不能在工作流中擅自扩大授权。

## 手动发布

1. 在 Actions → CI 找到 `main` 的成功 **push** 运行，打开详情，从 URL 的 `/actions/runs/<数字>` 复制 run ID。确认两个 jobs 成功、release Artifact 仍存在。
2. 在 Actions → Deploy Studio → Run workflow 选择 `main`，仅填写 `run_id`。工作流不会自动重建，也不接收任意目标 URL 或应用输入。此工作流需合并到默认分支后才可正常从菜单触发。
3. GitHub Environment 若要求审批，job 先等待 GitHub 审批。上传前验证 workflow ID、来源分支/事件、完整 SHA、run/attempt 元数据及归档校验和。部署显式使用产物 SHA，而非 Deploy Studio 自己的 `GITHUB_SHA`。
4. Summary 显示提交、CI run、SHA-256、目标、release/deployment 标识。如果 Studio 返回待审批请求，显示“等待 Studio 审批，尚未上线”及请求链接；绿色 job 只代表成功提交审批，**不代表已上线**。若 Studio 未配置公开地址，Summary 提示在部署请求列表查看。不会自动批准请求。
5. 立即部署时最多轮询 10 分钟，检查 deployment succeeded、release 的 `sourceCommit` 和 checksum、当前 deployment ID，再请求包含挂载路径的 `/api/healthz` 并要求 `ok=true`。旧版本 HTTP 200 不会当成成功。

同一目标串行运行，`cancel-in-progress: false`；GitHub concurrency 最多保留一个等待中的运行，多个连续手动触发可能替换较早的 pending run，并不是持久 FIFO 队列。不要连续点击发布。

## 失败、过期与人工恢复

- **缺变量/密钥或目标未确认**：上传前失败。管理员按上表配置，不把密钥贴到 issue 或日志。
- **无包/过期/attempt 不匹配**：重新运行该 main push CI 的全部 jobs，使用成功结果；不要用 workflow_dispatch CI 替代。工作流不会静默选其他提交或现场重建。
- **来源、SHA、checksum 不匹配**：停止发布，核对 CI run 和包。不要绕过脚本。
- **网络、鉴权、CLI 错误**：job 失败，输出安全错误码/退出状态；不输出原始上传 JSON、票据或 stderr。先确认是否已生成 release/deployment，再决定是否重试，避免不确定上传后自动重复发布。
- **部署失败/超时/健康检查失败**：保留 Summary 中标识，用 `nb-studio deploy get nocoreach <deployment> --json`、`nb-studio deploy logs nocoreach <deployment>` 在授权会话排查。超时不等于远端部署已取消；先查询状态。
- **人工恢复**：检查备份和迁移兼容性，另行授权后可用 `nb-studio deploy --app nocoreach --release <旧 release> --json`。切回代码不会撤销数据库迁移或业务写入；受保护环境仍需审批。本工作流不自动回滚。

首次真实验收须另行授权：核对 Studio release/commit、真实健康接口、页面及 CLI/Runner 分发，在空缓存中下载、校验、解包并运行。参见 [分发验证记录](CLI-DISTRIBUTION-beta63.md)。本轮没有部署、审批、迁移、业务数据操作或线上分发验证。

## 维护与契约依据

Actions 使用完整提交 pin，旁注对应 tag。更新时用官方仓库 `git ls-remote <repo> refs/tags/<version>` 核实 SHA，审查 release notes，并重新运行 actionlint 与脚本测试；不直接换成浮动 tag。pnpm 由 `packageManager` 统一控制，升级时同步校验元数据策略。

Studio CLI 使用实际安装并只读验证的 npm 包 `@nocobase/studio-cli@1.0.0-beta.56`，不是本机历史独立分发包的版本号。使用 npm registry integrity 校验安装，禁用安装脚本。升级须重新核实目标 Studio 的 `nb-studio docs deploy --json`、`docs deploy get`、`docs release get`、`docs app get` 和 `/api/swagger`；命令清单由服务端提供，客户端 pin 不会冻结服务端契约。已核实 `--file` 的 uploadArtifact 响应通过 `result.data.deployed` 返回部署结果（不能把它当作直接部署 release 的返回体）、`StudioDeployOutcome.releaseId`、`ReleasesDeployment.status`（queued/deploying/succeeded/failed）以及受保护环境的 pending request，未知响应会明确失败。

GitHub 来源查询使用官方 [workflow run API](https://docs.github.com/en/rest/actions/workflow-runs)、[指定 attempt 的 jobs API](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt) 和 [artifact API](https://docs.github.com/en/rest/actions/artifacts)。包下载使用固定版本的 [download-artifact](https://github.com/actions/download-artifact/tree/v4.3.0)。
