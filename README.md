# NocoReach

基于 NocoBase 3 的 AI 内容优化工作台，面向内容放在 Git 仓库里的团队（重点是开源产品）。根据网站数据给出优化建议，由用户本机的 AI Agent 修改内容仓库并提交 PR，在 NocoReach 中确认发布，再观察修改前后的表现。该主线尚未全部实现，进度见路线图。

本仓库维护产品设计及当前应用源码：前端 Portal、自定义连接插件、部分数据模型和测试。现有系统仍为本地单项目管理员试运行，不能视为可对外发布的多租户产品；干净环境完整初始化尚未完成。

源码入口：[`apps/portal`](apps/portal)、[`plugins/connections`](plugins/connections)。安装与构建见 [开发说明](docs/DEVELOPMENT.md)，复用代码归属见 [第三方说明](THIRD_PARTY_NOTICES.md)。

## 文档入口

- [产品设计 SPEC](SPEC.md)：当前有效的定位、对象、流程、页面、工作规则与约束。
- [路线图](docs/ROADMAP.md)：开发阶段、当前进度、阻碍与沿用欠项。
- [验收记录](docs/ACCEPTANCE.md)：实现与验证分开记录。
- [设计决策](docs/DECISIONS.md)：为什么这样设计。
- [市场调研](docs/research/2026-09-30-ai-agent-content-tools.md)：Multica、OpenSEO 与同类产品。
- [技术结构](docs/architecture.md)与[开发说明](docs/DEVELOPMENT.md)：连接器、存储、构建和部署边界。
- [交付变更](CHANGELOG.md)：实际交付，不把计划写成成果。
- [协作规则](CONTRIBUTING.md)：代码、设计、测试同步更新方式。
- [历史设计归档](docs/archive/README.md)：被替代的设计与计划，保留追溯。

整理基准日：2026-09-28。参考 [NocoCRM SPEC](https://github.com/nocobase/nococrm/blob/main/SPEC.md) 的规格组织方式，产品需求与交互独立设计。

原有本地设计文档和迭代记录保留为历史资料。后续新增需求、源码和验收以本仓库为维护入口；运行环境是发布目标，不是另一份开发源。

2026-09-30 设计梳理后 SPEC 重写为当前设计的单一版本；继续在现有源码和可用能力上增量开发，不从零重建。
