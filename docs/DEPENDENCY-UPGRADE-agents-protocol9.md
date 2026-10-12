# Agents / Runner 协议 9 升级（2026-10-12）

运行环境中的 `@nocobase/agent-runner@0.1.0-beta.6` 使用协议 9，原应用只接受协议 3–8，因此可以保持连接但不能领取任务。本次按 npm 官方 registry 的已发布版本升级依赖，使应用与 Runner 使用同一协议包。

| 组件                                   | 升级前         | 升级后         |
| -------------------------------------- | -------------- | -------------- |
| `@nocobase/app-plugin-agents`          | `0.1.0-beta.5` | `0.1.0-beta.7` |
| `@nocobase/agent-runner`               | `0.1.0-beta.4` | `0.1.0-beta.6` |
| `@nocobase/app-cli-client`             | `0.1.0-beta.2` | `0.1.0-beta.4` |
| `@nocobase/agent-protocol`（间接依赖） | `0.1.0-beta.3` | `0.1.0-beta.5` |
| 应用支持的协议                         | 3–8            | 3–9            |

同步更新新版 Agents 所需的应用核心、认证、授权、文件、数据库、队列等依赖，具体范围和解析版本以 `package.json`、`pnpm-lock.yaml` 为准。`pnpm-workspace.yaml` 保留安装工具添加的精确版本发布时间例外，使刚发布的配套包可重现安装，不放开所有包的发布时间限制。

这是依赖升级，`nocobase.defaultTemplateVersion` 仍为 `1.0.0-beta.58`，不代表整体合入新版模板源码。业务迁移及业务权限保持原有实现。

应用自身版本升为 `1.0.0-beta.62`，使随应用分发的 `nocoreach` CLI 获得新版本号，避免客户端继续命中 `beta.61` 的旧安装缓存。这个版本号属于 NocoReach，不表示升级到了同名模板版本。

新版 Agents 自带两项新增迁移：`202610100002_ag_add_run_git_credentials` 为执行记录增加 Git 凭据 URL 和仓库推送失败字段；`202610110001_ag_add_fresh_sessions` 为运行与运行请求增加默认值为 false 的 `freshSession` 字段。生产发布须先备份，再按应用正常部署流程执行插件迁移；本次集成测试只对临时数据库应用迁移。

## 部署时的安装包

**beta.63 修正：** 下述独立发布步骤在 beta.62 的 Studio 发布中遗漏了 CLI 产物，导致任务回退到 `preinstalled` 后报 `nocoreach is not installed`。从 beta.63 起，`pnpm build` 自动将 CLI 和 Runner 打包到 `dist/runners`，并由应用默认分发；正常的应用部署包已包含两个产品，无需再人工复制。下述命令仅用于单独构建或显式自定义分发目录。

本应用沿用独立发布 CLI / Runner 安装包的方式，服务端依赖升级不会自动替换持久化目录中的旧安装包。部署时须同时构建并发布两个产品，例如：

```sh
pnpm build
pnpm nocobase cli build --universal --skip-build --out storage/runners/protocol9
pnpm nocobase cli build --runner --universal --out storage/runners/protocol9
```

将生成的 `stable/nocoreach` 和 `stable/nocobase-runner` 产品目录及各自 manifest 一同发布到目标应用实际使用的 `agents.dist.dir`（默认 `storage/runners/dist`）。若该配置钉住旧版本，也要随发布调整。这里的 universal 包要求 Runner 主机已有 Node.js 24 或更新版本；需要内置 Node 的平台包可沿用已有部署流程的 `--targets` 和 `--node-version`。

同一版本存在平台包和 universal 包时，平台包优先；发布时不要遗漏 manifest 指向的文件。不能只更新源码中的 Runner 依赖，仍让服务器分发旧包。

已经使用协议 9 的 Runner 在应用部署后可以通过兼容检查。若页面仍提示“没有说明安装方式”，那是 Runner 未上报安装产品信息，与协议兼容是两件事；在 Runner 主机使用目标应用“添加运行环境”提供的命令重装，以恢复安装来源与更新信息。

本次 PR 不执行生产部署或生产数据库迁移。

## 验证

- 最终依赖组合下 `pnpm test`：138 个测试文件、834 个测试全部通过。真实 Agents / 数据库集成测试使用 Runner beta.6 与协议 9，覆盖领取、资料下载、成果回传、取消和业务重试边界。
- `pnpm typecheck` 通过。旧授权规则插件与新版授权核心的类型不兼容已通过升级三个规则插件解决，没有加入类型断言或放宽权限。
- `pnpm build` 通过，26 个服务端导入包均可在部署目录解析；生成的应用版本为 `1.0.0-beta.62`，Agents 为 `0.1.0-beta.7`。
- `pnpm install --frozen-lockfile --offline` 通过，并同步官方 Skills。
- Runner universal 包构建、解包及 `--version` 检查通过，实际为 `0.1.0-beta.6`，包内协议为 9。安装包保存在忽略目录，不提交到 Git。
- NocoReach CLI universal 包构建、manifest 校验和、解包及 `--version` 检查通过，实际为 `1.0.0-beta.62`，包内协议同为 9。
- 修改的测试文件通过 ESLint；依赖清单、工作区设置、测试文件和升级文档通过 Prettier；`git diff --check` 通过。
- `pnpm peers check` 没有 NocoBase 包自身的不兼容项。仍有升级前已存在的第三方约束差异：Claude Agent SDK / Anthropic SDK、Tiptap 菜单扩展 / core / pm、Agents / react-day-picker。本次未用 overrides 强行覆盖这些依赖。

测试使用临时数据库和模拟的编码工具回执，不调用真实付费模型，也不连接生产 Runner。
