# YouTube 公开内容研究

在“数据接入 → YouTube”填写搜索词或具体视频链接，不需要 API Key。

## 当前支持

- 最多 2 个关键词，每个 2–80 字符、每行一个；每词只读前 5 条结果。
- 最多 5 个指定视频；支持 youtube.com/watch、youtu.be、Shorts、Live 链接和视频 ID。分享参数会移除，只读取规范化后的视频。
- 一次最多 15 个不重复视频：标题、简介、频道名、发布时间、公开播放/点赞/评论计数。缺失的计数显示“—”，不是 0。
- 读取实际可用字幕文本：优先人工字幕，再自动字幕；各类字幕按中文、英文、其他语言选择第一个可用轨道。显示语言、字幕来源和截断状态，最多保留 30,000 字符。
- 字幕轨道不存在与读取失败分开显示。元数据成功不代表字幕成功。所有结果注明 YouTube、yt-dlp 和读取时间；搜索结果不是完整统计。
- 默认手动读取。管理员可以明确开启每日读取；普通网络失败依次等待 15 分钟、1 小时、3 小时、6 小时。登录/验证/限流、缺少或不兼容工具、不可用视频及未识别错误会暂停自动读取，需要手动处理。
- “停止并暂停自动读取”只接受当前 runId，停止该轮并关闭每日读取。重新保存可再启用。
- 同步失败保留此前数据并提示失败；改变搜索条件清除旧缓存。断开删除配置及缓存。超过 29 天未刷新的内容缓存会删除。

不包含频道所有者 Analytics、观看时长、受众、收入、评论全文、下载音频视频或付费转写。不会读取浏览器 Cookie、登录账号、解决验证或自动切换采集服务。

## 部署依赖

容器镜像会安装官方 PyPI 的固定版 yt-dlp 及其默认依赖。非 Docker 部署需要管理员在服务器安装 Python 3.10+ 和 yt-dlp；已有 Node.js 24 用于其 JavaScript runtime。

建议使用隔离环境：

```sh
python3 -m venv /opt/nocoreach-youtube
/opt/nocoreach-youtube/bin/pip install -r requirements-youtube.txt
# 启动应用时将 /opt/nocoreach-youtube/bin 加入 PATH。
```

应用不会在运行时安装或更新二进制。没有工具时明确显示安装提示。版本可以按官方发行说明由维护者升级并重新验证，不通过任意 GitHub 安装脚本或第三方包获取。

## 网络与边界

- 固定 yt-dlp 命令和参数，禁止用户传入可执行文件、shell、文件路径或任意目标 URL。
- 不加载系统/用户 yt-dlp 配置、插件、远端组件、Cookie 或全局代理变量，不执行媒体后处理。
- 使用当前项目 YouTube 连接选择的 HTTP/HTTPS/SOCKS5/SOCKS5H Profile；代理凭据只经子进程标准输入传递，不写命令行、数据库结果或日志。代理失败不会改成直连。
- yt-dlp 自己访问固定的 YouTube extractor 来源。字幕仅接受 YouTube HTTPS timedtext URL，另经应用既有公网 DNS/IP 固定下载器和项目代理读取。
- 单进程最多 45 秒、4 MiB 标准输出；整轮最多 180 秒。每份字幕下载最多 2 MiB/15 秒，时限覆盖 DNS 等待、重定向和正文；取消信号会终止 HTTP 请求，不保存取消后的数据。系统 DNS 查询可能在后台完成，但取消后不会发起 HTTP 请求。Linux 取消/超时杀整个进程组，避免留下 JavaScript 子进程。
- 不返回原始 stderr、代理地址、凭据、字幕签名 URL 或完整 provider JSON。

YouTube 的公开网页可因网络、区域、登录要求或平台限制无法读取。环境体检、进程退出和模拟测试不证明具体视频可用，必须以实际结果为准。

## 实现和许可

本实现参考 Agent-Reach 的公开内容研究方向，独立实现 NocoReach 的项目权限、状态、传输与同步逻辑，没有复制其安装器或转写代码。

- [Agent-Reach 视频能力说明](https://github.com/Panniantong/Agent-Reach/blob/94f06c1969dfc1834001269d79d3ad0972d9dee6/agent_reach/skill/references/video.md)
- [yt-dlp 官方项目、依赖和许可](https://github.com/yt-dlp/yt-dlp)
- [yt-dlp YouTube 限制说明](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#youtube)
- [YouTube Analytics 授权要求](https://developers.google.com/youtube/analytics/reference)

## 验证

服务/进程契约以受控本地 mock 验证，不使用真实账号、密钥或付费服务。维护者还需在目标部署网络用少量可公开读取的视频验证；遇拒绝或验证要求停止，不绕过限制。
