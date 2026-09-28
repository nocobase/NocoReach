# NocoReach

基于 NocoBase 3 的 Agent 驱动市场洞察与内容行动工作区。目标体验是：先看到基于自身与市场数据的洞察和建议，再通过自然语言讨论机会、明确不同的行动目标并形成内容方案，经多轮人工审核与调整后发布，并观察反馈。该主线尚未全部实现。

本仓库维护产品设计及当前应用源码：前端 Portal、自定义连接插件、部分数据模型和测试。现有系统仍为本地单项目管理员试运行，不能视为可对外发布的多租户产品；干净环境完整初始化尚未完成。

源码入口：[`apps/portal`](apps/portal)、[`plugins/connections`](plugins/connections)。安装与构建见 [开发说明](docs/DEVELOPMENT.md)，复用代码归属见 [第三方说明](THIRD_PARTY_NOTICES.md)。

## 文档入口

- [数据接入与首次使用](docs/DATA-ONBOARDING.md)：来源目录、AI 协助接入和首批范围（设计阶段）。

- [产品设计 SPEC](SPEC.md)：当前有效的产品目标、导航、页面职责和约束。
- [路线图](docs/ROADMAP.md)：现有能力基线、端到端工作切片及剩余工作。
- [验收记录](docs/ACCEPTANCE.md)：实现与验证分开记录。
- [设计决策](docs/DECISIONS.md)：为什么这样设计。
- [技术结构](docs/architecture.md)：连接器、存储、运行和部署边界。
- [交付变更](CHANGELOG.md)：实际交付，不把计划写成成果。
- [协作规则](CONTRIBUTING.md)：代码、设计、测试同步更新方式。

整理基准日：2026-09-28。参考 [NocoCRM SPEC](https://github.com/nocobase/nococrm/blob/main/SPEC.md) 的规格组织方式，产品需求与交互独立设计。

原有本地设计文档和迭代记录保留为历史资料。后续新增需求、源码和验收以本仓库为维护入口；运行环境是发布目标，不是另一份开发源。

2026-09-28 产品方向重写后，继续在现有源码和可用能力上增量开发；不从零重建。旧三轮开发历史保留，新工作按 SPEC 与 ROADMAP 的流程切片推进。
