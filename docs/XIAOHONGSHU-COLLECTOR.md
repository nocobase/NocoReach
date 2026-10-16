# 小红书只读浏览器采集

当前能力：在已获授权、已登录的小红书浏览器中搜索一个词组，手动读取最多 20 条公开笔记，并保存到当前项目。不是官方 API，不自动登录、不读取或上传 Cookie、不发布或评论、不自动安装 OpenCLI。此版本不含创作者后台、粉丝增长、评论数或收藏统计。保存结果进入通用内容规则：新发现内容与准确点赞数门槛，可作为每日分析的信号证据；尚未接入全局数据健康。

## 先明确运行位置

浏览器和采集器运行在同一台电脑，使用该电脑上已安装的 OpenCLI 和用户自行登录的 Chrome。NocoReach 服务端通过经过认证的薄采集器调用固定只读命令。采集器不是 Runner：没有任务队列、心跳、代码执行入口或任意 MCP 工具。

采集器 URL 必须能从 NocoReach 服务端访问。配置中的 `127.0.0.1` 指 NocoReach 服务器自身，不是正在访问网站的用户电脑。若应用在 Studio/远端而浏览器在笔记本，需要部署管理员先提供已授权的安全连接。不要直接暴露 OpenCLI 的 19825 端口或原始小红书 MCP 服务。

## 一次部署配置

1. 用户在浏览器所在电脑自行安装、授权 OpenCLI 和它的浏览器扩展，并自行登录小红书。确认将要使用的 Chrome profile。安装扩展会扩大浏览器访问权限，必须由用户决定；应用不会代为操作。
2. 把本仓库 `collectors/` 目录放在该电脑。使用 Node 24 或更高版本，在进程的私有环境中配置至少 32 字符的 `NOCOREACH_XHS_COLLECTOR_TOKEN`，可选 `NOCOREACH_XHS_OPENCLI_PROFILE`（已配置的 OpenCLI profile 名称）和 `NOCOREACH_XHS_COLLECTOR_PORT`（默认 18061）。不要把真实令牌写进代码、终端历史、公开命令或日志。
3. 运行 `node collectors/xiaohongshu.mjs`。默认仅监听 `127.0.0.1`。远程访问用部署管理员提供的 HTTPS 反向代理/已授权隧道，只转发薄采集器，保留 Authorization。不要公开原始 OpenCLI daemon。
4. 在应用的私有 `config.yml` 登记一次，重启应用：

```yaml
nocoreach:
  browserCollectors:
    - id: team-browser
      name: 团队已授权浏览器
      url: https://collector.example.com/nocoreach-xhs
      token: replace-with-a-private-token-at-least-32-characters
      platforms: [xiaohongshu]
      projectIds: ['1']
```

同机服务端允许 `http://127.0.0.1:18061`；远程必须 HTTPS。反向代理应把示例路径下的 `/health`、`/search` 转发到对应薄采集器路径。URL 不接受用户信息、查询串或 fragment；不跟随重定向。不要使用浏览器的 localhost 或无认证原始 MCP 地址。

`platforms` 必须明确列出，新增平台不会自动获得此连接。`projectIds` 可省略以允许所有 NocoReach 项目选用，列出时其他项目不能枚举或使用该采集器。浏览器账号必须适合配置允许的项目；共用采集器即共用同一浏览器身份，不是多租户账号隔离。前端只接收名称和 ID，不接收 URL、令牌或本地 profile。

未来 Bilibili 适配器可以通过同一薄 host 静态注册，并在 `platforms` 显式添加；此版本启动入口只注册小红书，其他平台请求会拒绝。

## 项目中的操作

在“数据接入 → 小红书（浏览器采集）”选择已配置的采集器，填写 2–60 字的一个词组，确认有权使用该浏览器会话后保存。点击“检查采集器”只验证服务和 OpenCLI 安装，不会显示已经登录。点击“立即搜索”才实际验证本次平台读取并保存结果。

配置、测试、搜索、取消和断开属于管理员设置操作。已加入 NocoReach 的成员通过“查看”入口读取已保存笔记，不能操作浏览器。无定时搜索；一次全局只运行一个采集请求，其他项目收到 busy。

关闭面板不取消采集；重新打开可看状态并取消。取消会中止本次应用请求、放弃结果并请求终止 CLI 子进程。采集器先发 SIGTERM，1 秒后仍未关闭则升级 SIGKILL；只有真实进程 close 后才释放共享采集器占用，取消回调本身不代表进程已退出。浏览器已经发出的请求未必能够撤销，不能保证页面瞬间停止变化。结果进入数据库提交阶段后，取消返回“正在保存，已无法取消”，不会误报已接受取消；等待保存锁期间接受的取消不会写入结果。应用关闭也中止活动请求。断开保留数据；修改连接或断开后，旧在途结果不能写进新配置。

浏览器本身使用采集器电脑的网络，项目出站代理不控制它。应用到部署采集器的连接也不经过公网抓取代理，避免将本地桥接和服务令牌交给无关代理；其他数据源的代理规则不变。

## 数据口径

- 每次最多 20 条、项目累计最多 1,000 条笔记。达到容量保留最近采集的记录，旧记录淘汰。不等于平台总量，也不能用于全网曝光或每日增长统计。
- 保存标题、笔记链接、页面显示点赞、首次发现和最近采集时间、对应搜索词。不保存作者、头像、评论正文或凭据。
- 保留站点原有笔记链接中的 `xsec_token`/`xsec_source`，供打开笔记使用；不生成签名，不保留其他查询参数。
- OpenCLI 的 `published_at` 是从笔记 ID 推算的日期。本应用只记录为 `estimatedPublishedAt`，真实 `publishedAt` 始终为空，界面明确标“推算发布日”。
- `1.2万` 等缩写保留原文，数字值为空。缺失指标为空。核查版本的 OpenCLI 在找不到点赞 DOM 时填 `0`，因此无法区别真实 0 与未读到；此适配器将 0 一律显示未知，不用它计算增长。
- 空数组或 OpenCLI exit 66 不能证明已登录或全网零结果，作为 `no_results` 处理，不覆盖旧数据。错误、超时、登录失效和安全限制同样保留旧成功快照。

## 错误与界限

- collector_unreachable / collector_unauthorized：检查部署地址、HTTPS 和令牌
- tool_missing / browser_unavailable：工具未安装，或浏览器/扩展未连接
- login_required：用户在对应 Chrome profile 自行登录
- security_block：停止采集，用户处理平台限制；不会自动更换账号、签名或后端绕过
- timeout：约 80 秒未完成，本次不更新
- invalid_response：输出模式、请求身份或数据格式不匹配，不更新
- busy / cancelled / no_results：正在处理、已取消或未取得可确认笔记，不能当平台新增量为零

## 协议与替换边界

`server/nocoreach/xiaohongshu-adapter.ts` 的 `XiaohongshuAdapter` 是唯一平台传输边界。以后可以接正式 Runner，无需引入旧 daemon。HTTP 请求/响应必须匹配 `protocolVersion: 1`、`platform: xiaohongshu`、`projectId` 和随机 `requestId`。固定 POST `/health`、`/search`，携带部署 Bearer 令牌，不接受 Origin，不允许动态命令、URL、模块或浏览器 eval。请求体最多 4 KiB；响应最多 1 MiB；只支持固定子进程 argv，`shell: false`。

`collectors/read-only-browser.mjs` 仅支持静态注册的 xiaohongshu/bilibili，后者预留固定 video 读操作；未注册功能直接拒绝。没有生产 mock 开关。测试通过在本地创建 collector 时注入模拟函数，不改变生产 HTTP 权限。

参考核查：Agent-Reach `94f06c1969dfc1834001269d79d3ad0972d9dee6`（MIT）；OpenCLI `77af6bc433c1818a4abb1c8928e2a7fd0bbae376`（Apache-2.0）。本实现独立编写，只调用 OpenCLI CLI；没有复制上游浏览器提取代码。源码与固定链接：

- [Agent-Reach 小红书路由](https://github.com/Panniantong/Agent-Reach/blob/94f06c1969dfc1834001269d79d3ad0972d9dee6/agent_reach/channels/xiaohongshu.py)
- [OpenCLI 搜索实现](https://github.com/jackwener/OpenCLI/blob/77af6bc433c1818a4abb1c8928e2a7fd0bbae376/clis/xiaohongshu/search.js)
- [OpenCLI 网络暴露风险说明](https://github.com/jackwener/OpenCLI/blob/77af6bc433c1818a4abb1c8928e2a7fd0bbae376/docs/guide/remote-orchestration.md)

自动测试验证模拟 CLI、真实本机 HTTP、应用路由和数据库。真实小红书访问需要部署管理员完成上述配置、用户授权并登录后再验收，本 PR 的 mock 测试不代表真实账号已验证。
