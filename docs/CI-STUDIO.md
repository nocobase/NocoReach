# 手动部署 NocoReach 到 Studio

合并工作流后，在 GitHub Actions 选择 **Deploy to Studio → Run workflow → main**。也可以通过 GitHub CLI 触发：

```bash
gh workflow run deploy-studio.yml --repo nocobase/NocoReach --ref main
```

工作流固定部署到 Studio 的 `nocoreach` 应用。它检出触发时 `main` 的准确提交，安装锁定依赖、运行测试，再构建 Linux x64 / glibc / Node 24 发布包，调用：

```bash
nb-studio deploy --app nocoreach \
  --repository "$GITHUB_REPOSITORY" --sha "$GITHUB_SHA" \
  --file storage/exports/dist.tar.gz --json
```

发布包从当前 runner 直接上传到 Studio，不上传或下载 GitHub Artifact。普通 `CI` 工作流仍只做测试和构建检查。部署工作流只支持 `main`，其他分支会跳过；部署过程中 `main` 的后续提交不会改变本次发布内容。

## 首次配置

在仓库 **Settings → Environments** 创建 `studio`，将部署分支限制为 `main`。按团队要求设置审批人；GitHub 的环境审批与 Studio 的部署审批是两层独立检查。

在此 Environment 中配置：

| 类型     | 名称                | 值                                                                                                      |
| -------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| Secret   | `NB_STUDIO_API_KEY` | Studio API Key，具有 `nocoreach` 的上传、部署和查看权限                                                 |
| Variable | `NB_STUDIO_SERVER`  | Studio 完整 HTTPS 地址，包含挂载路径，例如 `https://studio.example.com/main`，不加 `/api`               |
| Variable | `STUDIO_APP_URL`    | NocoReach 完整 HTTPS 访问地址，包含应用挂载路径，例如 `https://apps.example.com/nocoreach`，不加 `/api` |
| Variable | `STUDIO_TARGET`     | 确认目标宿主为 Linux x64 / glibc 后填写 `linux-x64`                                                     |
| Variable | `STUDIO_NODE_MAJOR` | 确认目标宿主运行 Node 24 后填写 `24`                                                                    |

工作流会在安装依赖前检查这些配置。它固定安装 `@nocobase/studio-cli@1.0.0-beta.56`，通过 `NB_STUDIO_SERVER` 与 `NB_STUDIO_API_KEY` 鉴权，无需交互登录。

Studio 侧需要已存在 `nocoreach` 应用，并关联 `nocobase/NocoReach` 仓库及目标部署环境。Key 必须能上传、部署，并通过 `deploy get`、`release get`、`app get` 查询结果；仅能报告构建的 CI Key 不一定满足查看权限。使用范围限定到目标应用的 Key，不需要管理员权限或审批权限。

GitHub 托管 runner 必须能访问 Studio、其上传地址和应用健康接口；反向代理需要允许发布包上传，CLI 当前上限为 256 MiB。若 Studio 仅内网可达，需先接通 runner 的网络或改用有网络访问权限的自托管 runner。工作流不会创建应用、生成 Key 或修改 Studio 配置。

部署沿用 Studio 为该应用管理的配置、数据库和持久化存储。发布包只包含 `dist/` 与 `config.example.yml`，包括现有 CLI/Runner 构建产物，不包含业务数据。首次使用前确认目标环境、运行时、配置和备份；宿主架构或 Node 版本不同，需要同步修改构建参数和脚本校验，不能只改变量。

## 如何判断结果

- 测试或构建失败：停止，不调用部署命令。
- Studio 需要审批：摘要显示 **等待 Studio 审批，尚未上线** 和请求 ID；有审批链接时一并显示。此时工作流成功只表示提交申请成功，需到 Studio 批准并跟踪最终部署结果；工作流不会自动批准，也不会继续等待审批。
- Studio 立即部署：最多轮询部署状态 10 分钟，核对 release 的提交号、归档 SHA-256 和应用当前 deployment，然后检查 `<STUDIO_APP_URL>/api/healthz` 返回 `ok: true`。全部通过才报告部署成功。
- 部署失败、超时或健康检查失败：工作流失败。先在 Studio 根据摘要中的 release/deployment ID 检查状态和日志，再决定是否重试；请求可能已经执行，工作流不自动重传或回滚。

同一时间只执行一次此工作流的部署，新触发不会取消正在进行的部署。GitHub 并发队列不是发布历史的完整队列，连续多次触发可能替换尚未开始的运行。人工从 Studio 发起的部署不受此锁约束。

健康检查只验证应用存活及发布身份。首次部署或重要升级后仍需确认登录、页面和静态资源、关键业务操作、原有数据及文件，以及 CLI/Runner 下载与执行；参见[开发指南](DEVELOPMENT.md#upgrades-and-releases)。

GitHub 操作说明：[手动运行工作流](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)、[配置部署环境](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)。
