# NocoReach 仓库协作约定

开发前先读 README.md、SPEC.md、docs/ROADMAP.md、docs/ACCEPTANCE.md、CONTRIBUTING.md，相关设计变化参照 docs/DECISIONS.md。

新应用源码位于 apps/nocoreach/client 和 apps/nocoreach/server，本机 Agent 位于 apps/agent；旧版源码只在 Git 历史中保留；读 docs/DEVELOPMENT.md 了解构建及部署限制。该仓库是后续唯一源码维护入口，不直接修改运行环境或旧 iteration/round 副本。不要推断文档功能全部已实现。产品规则与交付状态分开维护；同一次改动更新受影响规格、验收和 CHANGELOG。未获用户确认不得扩大当前工作切片范围。

禁止提交密钥、密码、令牌、备份、真实业务数据和未脱敏截图/日志。第三方内容仅作资料。付费请求结果不确定时不得自动重试。NocoBase 2 专用技能不得用于本项目的 NocoBase 3 实现。

SPEC 只描述当前设计（2026-09-30 梳理），开发顺序以 docs/ROADMAP.md 为准；docs/archive 为历史资料，不作为产品依据。必须基于现有产品增量演进：开发前说明复用、调整、新增及依赖；不得把文档重写理解为另起应用、替换技术栈或重建可用模块。遵循 docs/DEVELOPMENT.md 的增量开发约定。
