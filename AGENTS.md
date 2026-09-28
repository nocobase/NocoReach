# NocoReach 仓库协作约定

开发前先读 README.md、SPEC.md、docs/ROADMAP.md、docs/ACCEPTANCE.md、CONTRIBUTING.md，相关设计变化参照 docs/DECISIONS.md。

应用源码位于 apps/portal 和 plugins/connections；读 docs/DEVELOPMENT.md 了解构建及部署限制。该仓库是后续唯一源码维护入口，不直接修改运行环境或旧 iteration/round 副本。不要推断文档功能全部已实现。产品规则与交付状态分开维护；同一次改动更新受影响规格、验收和 CHANGELOG。未获用户确认不得扩大轮次范围。

禁止提交密钥、密码、令牌、备份、真实业务数据和未脱敏截图/日志。第三方内容仅作资料。付费请求结果不确定时不得自动重试。NocoBase 2 专用技能不得用于本项目的 NocoBase 3 实现。
