# NocoReach 变更记录

记录影响使用、升级或后续维护的重要变更，详细过程链接到专题文档；不要求每个任务追加一条。版本号指 NocoReach 应用版本，除非明确标注为模板或依赖版本。当前开发约束见 [开发文档](docs/DEVELOPMENT.md)，历史记录不替代现行规则。

## 未发布

- 精简根目录 `AGENTS.md`，保留核心规则、按任务查阅入口和验证要求；项目专项约束移至 `docs/DEVELOPMENT.md`，历史变更独立记录于本文件。
- `CLAUDE.md` 统一引用 `AGENTS.md`，不再重复维护规则。通用框架教程使用依赖提供的 Skills，不再复制到根目录指导中。

## 近期修复

- 成果 `report.asOf` 接受最多 1000 字符的多来源时间说明，任务指令和校验共用上限，超限错误明确字段及限制。[PR #18](https://github.com/nocobase/nocoreach/pull/18)
- 明确 `allowedPaths: []` 表示整个仓库，Runner 指令与设置界面、服务端校验保持一致。[PR #17](https://github.com/nocobase/nocoreach/pull/17)

## beta.62–beta.64：Runner 协议与 CLI 分发

- beta.62：升级 Agents beta.7、Runner beta.6、CLI Client beta.4，统一使用 agent-protocol beta.5，支持协议 3–9。仅升级依赖，完整模板源码标记仍为 beta.58。[升级与验证记录](docs/DEPENDENCY-UPGRADE-agents-protocol9.md)
- beta.63：应用构建自动将 NocoReach CLI 和 Runner universal 安装包及 manifest 放入 `dist/runners`，修复 Studio 部署遗漏 CLI 后退回 preinstalled 的问题。
- beta.64：按配置模块位置解析分发目录，修复 Studio rootDir 与 standalone 不同导致目录定位错误的问题；保留显式 `agents.dist.dir` 覆盖。[分发与宿主路径记录](docs/CLI-DISTRIBUTION-beta63.md)

## beta.61：依赖与主题适配

- 以 default beta.61 为依赖参照，适配 app-client 3；移除 Hub CLI 和官方 Workflow。管理页面源码由应用维护，保留原授权资源与官方服务 token。完整模板源码标记仍为 beta.58。[依赖升级](docs/DEPENDENCY-UPGRADE-beta61.md)、[部署记录](docs/DEPLOYMENT-beta61.md)
- 选择性合入蓝色主色、导航、表头和浮层样式，统一官方组件与旧业务页面的展示；保留品牌、业务语义色、密度和浏览器偏好，修复宽松任务表格与手机头部布局。[主题适配](docs/THEME-UPGRADE-beta61.md)
- 身份与请求缓存移入认证子树，持久化报表按用户、会话及授权 revision 隔离，拒绝旧请求写回。[提交 2f9d87f](https://github.com/nocobase/nocoreach/commit/2f9d87f)

## beta.58 及后续业务适配

- 升级模板 beta.58，接入官方 Agents/Runner，移除旧本机 Agent 协议；项目和任务可指定共享 Agent，研究/草稿支持 Online 或 Runner，仓库改动保留 Runner 要求。[升级记录](docs/UPGRADE-beta.58.md)、[部署记录](docs/DEPLOYMENT-beta.58.md)
- 任务资料与知识/Skills 通过不可变输入快照交付，社区回复准备论坛来源，任务详情使用官方执行记录组件；保留业务审核、取消及重试边界。[业务适配记录](docs/PORT-PLAN.md#业务-agent-适配与执行可见性2026-10-11)
- 出站网络增加按项目/连接选择的代理 Profile，支持 HTTP、HTTPS、SOCKS5、SOCKS5H，公开抓取保留公网 IP 校验和固定 IP 隧道。[代理记录](docs/PORT-PLAN.md#代理-profile2026-10-10)
- Google 同步改为短事务领取和提交，事务外采集；隔离快照缓存与事务，解决单连接数据库阻塞。[PR #8](https://github.com/nocobase/nocoreach/pull/8)

## 初始移植（2026-10-09）

从经典 NocoBase 插件和门户迁移到可在 Studio 运行的 NocoBase 3 应用，保留业务服务与页面，经兼容层接入数据库、用户、通知及 Scheduler。提供一次性旧数据导入命令；最初部署选择从头配置业务数据。分步实施及当时验收结果见 [移植计划](docs/PORT-PLAN.md)。
