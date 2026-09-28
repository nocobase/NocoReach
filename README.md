# NocoReach

基于 NocoBase 3 的 AI 优先市场分析与行动工作区，帮助市场人员从数据走向推广决策，而不是先学习复杂分析工具。

本仓库维护产品设计及当前应用源码：前端 Portal、自定义连接插件、部分数据模型和测试。现有系统仍为本地单项目管理员试运行，不能视为可对外发布的多租户产品；干净环境完整初始化尚未完成。

源码入口：[`apps/portal`](apps/portal)、[`plugins/connections`](plugins/connections)。安装与构建见 [开发说明](docs/DEVELOPMENT.md)，复用代码归属见 [第三方说明](THIRD_PARTY_NOTICES.md)。

## 文档入口

- [产品设计 SPEC](SPEC.md)：当前有效的产品目标、导航、页面职责和约束。
- [路线图](docs/ROADMAP.md)：轮次范围及剩余工作。
- [验收记录](docs/ACCEPTANCE.md)：实现与验证分开记录。
- [设计决策](docs/DECISIONS.md)：为什么这样设计。
- [技术结构](docs/architecture.md)：连接器、存储、运行和部署边界。
- [交付变更](CHANGELOG.md)：实际交付，不把计划写成成果。
- [协作规则](CONTRIBUTING.md)：代码、设计、测试同步更新方式。

整理基准日：2026-09-28。参考 [NocoCRM SPEC](https://github.com/nocobase/nococrm/blob/main/SPEC.md) 的规格组织方式，产品需求与交互独立设计。

原有本地设计文档和迭代记录保留为历史资料。后续新增需求、源码和验收以本仓库为维护入口；运行环境是发布目标，不是另一份开发源。
