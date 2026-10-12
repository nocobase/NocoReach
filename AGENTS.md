# NocoReach 开发指引

- 用中文回复和编写面向用户的文档。
- 这是 NocoBase 3 应用，使用本仓库的 Skills，不使用全局 NocoBase 2 Skills。
- 业务功能直接写在应用源码中；只有用户明确要求可复用、独立发布的包时才创建插件。优先复用已注册插件和现有机制。

## 开始工作

安装依赖用 `pnpm install`，开发启动用 `pnpm dev`。安装会自动同步 `.agents/skills/`；缺失或过期时运行 `pnpm nocobase skills sync`。同步的 Skills、`.claude/skills/` 和数据库 Collection 缓存是生成内容，不手工编辑。

开发功能或修复前，先读 [应用开发 Skill](.agents/skills/nocobase-app-development/SKILL.md)，再按任务读取其中的相关参考和插件 Skill。以下文档说明 NocoReach 对通用模板的适配；仅阅读本次改动涉及的章节。

| 本次任务                                   | 项目专属指引                                 |
| ------------------------------------------ | -------------------------------------------- |
| 页面、路由、文案、主题、身份缓存、界面标注 | [前端](docs/DEVELOPMENT.md#前端)             |
| 业务接口、权限、数据库、同步、后台服务     | [后端与数据](docs/DEVELOPMENT.md#后端与数据) |
| 数据采集、OAuth、代理、公开抓取            | [出站网络](docs/DEVELOPMENT.md#出站网络)     |
| Agent、Runner、任务执行、成果与审核        | [任务执行](docs/DEVELOPMENT.md#任务执行)     |
| 依赖升级、构建、部署、CLI 分发             | [升级与发布](docs/DEVELOPMENT.md#升级与发布) |

## 修改与验证

- 保持现有业务权限、会话隔离和数据边界；前端可见性不能替代服务端鉴权。
- 沿用附近代码的组织和风格，避免与任务无关的重构、格式化或依赖升级。
- 验证范围覆盖改动及受影响的调用方。按文件运行格式、lint 和测试，类型检查使用对应项目配置；仅在影响范围需要时扩大检查，不例行运行全仓库 `pnpm check`。
- 文档改动只检查格式和链接。代码测试放在 `tests/`，业务测试在 `tests/nocoreach/`；按需使用 `pnpm exec vitest run <测试文件>`。交付时说明改动、已执行检查及未验证事项。

## 维护这些指引

本文件只保留跨任务的核心规则和查阅入口。只有这些规则变化时才修改，并优先修订已有条目。模块约束更新到对应专题；操作教程引用 Skills；重要变更记录写入 [CHANGELOG.md](CHANGELOG.md)，不在这里追加版本、修复过程或测试流水账。`CLAUDE.md` 只引用本文件。
