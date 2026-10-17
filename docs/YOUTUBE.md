# YouTube 公开内容研究

已部署 Collector 时，可直接在数据接入界面填写地址和令牌，保存后立即生效。见[界面配置说明](COLLECTOR-CONNECTIONS.md)。下方 config.yml 示例仍可用于部署预配置。

管理员先部署并配置 YouTube Collector，再在“数据接入 → YouTube”填写搜索词或具体视频链接。不需要 YouTube API Key；应用与 Collector 使用部署令牌认证。

## 当前支持

- 最多 2 个关键词，每个 2–80 字符、每行一个；每词只读前 5 条结果。
- 最多 5 个指定视频；支持 youtube.com/watch、youtu.be、Shorts、Live 链接和视频 ID。分享参数会移除，只读取规范化后的视频。
- 一次最多 15 个不重复视频：标题、简介、频道名、发布时间、公开播放/点赞/评论计数。首次读取缺失的计数显示“—”；后续缺失值保留上次有效计数，0 是有效值。每个指标单独显示读取时间。
- 读取实际可用字幕文本：优先人工字幕，再自动字幕；各类字幕按中文、英文、其他语言选择第一个可用轨道。显示语言、字幕来源和截断状态，最多保留 30,000 字符。
- 字幕轨道不存在与读取失败分开显示。元数据成功不代表字幕成功。所有结果注明 YouTube、yt-dlp 和读取时间；搜索结果不是完整统计，也不保证最新。
- 默认手动读取。管理员可以明确开启每日读取；普通网络失败依次等待 15 分钟、1 小时、3 小时、6 小时。登录/验证/限流、缺少或不兼容工具、不可用视频及未识别错误会暂停自动读取，需要手动处理。
- “停止并暂停自动读取”只接受当前 runId，停止该轮并关闭每日读取。重新保存可再启用。
- 视频按项目与视频 ID 长期保存在数据库；新发现追加，重复视频更新最新可读信息。本轮没有搜到、改变搜索条件、关闭自动读取、断开接入或时间经过均不会自动删除已有视频。
- 同步失败、超时、取消或数据库写入失败保留此前完整数据；字幕读取失败时保留旧字幕并注明旧读取时间。只保存各指标最近一次有效值，没有播放量等完整历史曲线。
- 已保存列表按首次保存时间倒序，每页 20 条。这里的分页是本地记录分页，不是 YouTube 搜索分页；仍未实现完整关键词结果遍历或可靠的最新视频发现。
- 断开仅移除研究条件并停止自动读取。管理员的“删除已保存视频”在确认后删除本项目保存的视频信息和字幕，并暂停自动读取；不会删除 YouTube 平台内容或其他项目记录。进行中的读取须先停止。手动再读或重新开启每日读取仍可能重新发现相同视频。
- 升级会把数据库内仍存在的旧 YouTube 快照复制到独立视频表，不因快照超过 29 天而跳过；此前被旧版本清空的记录无法恢复。该数据迁移不支持自动回滚删除新表；降级需恢复升级前备份，不能直接回退旧程序并保留新数据库。

不包含频道所有者 Analytics、观看时长、受众、收入、评论全文、下载音频视频或付费转写。不会读取浏览器 Cookie、登录账号、解决验证或自动切换采集服务。

## 数据保留和第三方使用条件

“长期保存”是本应用的存储行为，不授予任何平台访问或无限期保存权利。只在有权获取、使用和保存相关数据的部署中启用采集；管理员负责确定适用授权、刷新和删除要求，以及备份副本的保留期。应用不会以统一的 29 天期限静默删除本地记录。

[YouTube 服务条款](https://www.youtube.com/static?template=terms) 对未经授权的自动化访问有限制；当前 yt-dlp 读取方式本身不构成 YouTube 的许可。若使用官方 API，则还需遵守 [YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies)：不同数据类别有刷新、删除及授权复核要求，部分数据超过 30 天需删除或刷新，非授权统计数据还有保存期限。不能把这些 API 专用条款直接当成所有采集来源统一的自动清空规则。

可选择具有明确采集和保留授权的来源，或另行接入官方 API 并实现其对应的定期刷新、授权复核与删除机制；后者未包含在本次持久化功能中。对于必须删除的本地数据，管理员使用明确的删除操作处理，并同时按部署规则清理备份。

## 部署与升级

YouTube 的 yt-dlp 进程、元数据和字幕请求统一在独立 NocoReach Collector 服务中执行。NocoReach 不再安装 Python、yt-dlp，也不会在 Collector 失败时切换到本地进程或直接读取字幕。应先部署支持 YouTube 协议 v1 的 Collector，再升级应用。

1. 按 [Collector 部署说明](https://github.com/gchust/nocoreach-collector/blob/0c758ca5f826b40979a4458bb3559793a83f7742/README.md)安装固定版本的 yt-dlp 与依赖，配置服务认证令牌并启用 YouTube 平台。配套实现见 [Collector PR #1](https://github.com/gchust/nocoreach-collector/pull/1)，本次核对的兼容提交为 `0c758ca5f826b40979a4458bb3559793a83f7742`；部署时使用包含该实现的已审核发行版本。
2. 在 NocoReach 的部署配置 config.yml 中配置一个适用于该项目的 Collector：

```yaml
nocoreach:
  browserCollectors:
    - id: youtube-team
      name: 团队 YouTube Collector
      platforms: [youtube]
      url: https://collector.example.com
      token: replace-with-a-private-token-at-least-32-characters
      projectIds: ['1']
```

沿用 browserCollectors 配置键以兼容其他平台；YouTube 不需要浏览器。地址必须能从 NocoReach 服务端访问；远程必须 HTTPS，同机可用 http://127.0.0.1:端口。令牌需为 32–256 个可见 ASCII 字符，和 Collector 保持一致，不要提交到代码仓库。projectIds 是 NocoReach 应用侧的项目路由范围；省略表示应用侧不限制项目。Collector 验证 Bearer 令牌和 projectId 格式，当前不另设项目授权名单。令牌应只交给获授权的应用服务，不应直接分发给终端用户。

同一项目必须恰好匹配一个 platforms 包含 youtube 的配置。未配置、项目不匹配、多个匹配、令牌不正确或 Collector 版本不兼容都会明确报错并暂停自动读取。旧研究条件、已保存视频、指标和字幕不需要数据迁移，仍保留原有项目权限、去重、时间和删除规则。

3. 处理网络出口迁移：如果 YouTube 连接仍选择应用代理（含部署默认代理），本次采集会以迁移提示停止，不会静默改成直连。先让 Collector 所在网络具备经过授权的 YouTube 访问能力，再关闭 YouTube 连接的“使用代理”开关。应用不会向 Collector 传递代理地址或凭据。需要代理时，由管理员在 Collector 部署环境显式设置 `NOCOREACH_YOUTUBE_PROXY`，元数据与字幕共用该出口。该配置仅接受无用户名和密码的 HTTP(S) 代理地址，不支持 SOCKS、非根路径、查询参数或片段；不继承通用环境代理，`NO_PROXY` 不能绕过此配置，失败时不会回退直连。应用端 YouTube 连接选择直连不会改变 Collector 的专用代理，也不要求关闭其他连接使用的默认代理。出口验证完成前保持每日读取暂停。
4. 重启应用后，手动读取少量可公开访问的视频，确认元数据和字幕结果。Collector 健康检查只表示工具就绪，不证明 YouTube 平台访问成功。失败时原有数据保持不变；真实结果验证后再开启每日读取。

应用不会在运行时安装或更新二进制。缺少 yt-dlp 时，提示管理员在 Collector 主机处理，不能通过在 NocoReach 主机安装旧工具恢复采集。

## 网络与边界

- 应用只向管理员配置的 Collector 地址发送搜索词或规范视频 ID，不向用户提供任意 URL、可执行路径、shell、Cookie 或代理参数。
- 请求使用协议版本、平台、projectId、独立 requestId 和 Bearer 令牌；响应必须匹配原请求的项目、请求编号、操作类型和读取时间。拒绝跨项目、陈旧、过大或不符合字段约束的数据。
- Collector 负责固定 yt-dlp 参数、平台来源限制、字幕下载安全和取消时清理子进程。应用接收有上限的规范化视频与字幕，不接收原始 provider JSON、原始 stderr、Cookie、代理凭据或字幕签名 URL。
- 应用到 Collector 不跟随重定向，不使用应用代理，也不回退到其他 Collector。每次请求最多 70 秒、响应最多 1 MiB；整轮仍最多 180 秒。取消会中止 HTTP 请求并阻止迟到结果写入数据库，已有数据保持不变。
- 模拟部署继续使用明确注入的合成数据，不启动本地 yt-dlp，不连接真实 Collector，也不回退到真实平台。

YouTube 的公开网页可因网络、区域、登录要求或平台限制无法读取。环境体检、进程退出和模拟测试不证明具体视频可用，必须以实际结果为准。

## 实现和许可

本实现参考 Agent-Reach 的公开内容研究方向，独立实现 NocoReach 的项目权限、状态、传输与同步逻辑，没有复制其安装器或转写代码。

- [Agent-Reach 视频能力说明](https://github.com/Panniantong/Agent-Reach/blob/94f06c1969dfc1834001269d79d3ad0972d9dee6/agent_reach/skill/references/video.md)
- [yt-dlp 官方项目、依赖和许可](https://github.com/yt-dlp/yt-dlp)
- [yt-dlp YouTube 限制说明](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#youtube)
- [YouTube Analytics 授权要求](https://developers.google.com/youtube/analytics/reference)

## 验证

应用的 Collector 协议、存储及取消契约以受控本地 mock 验证，不使用真实账号、密钥或付费服务。维护者还需在目标部署网络用少量可公开读取的视频验证；遇拒绝或验证要求停止，不绕过限制。
