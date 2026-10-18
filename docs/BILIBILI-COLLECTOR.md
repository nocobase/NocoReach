# Bilibili 公开内容调研采集器

已部署 Collector 时，可直接在数据接入界面填写地址和令牌，保存后立即生效。见[界面配置说明](COLLECTOR-CONNECTIONS.md)。下方 config.yml 示例仍可用于部署预配置。

此接入通过管理员部署的只读采集器，手动读取关键词搜索第一页（最多 20 条）与指定公开视频元数据。与小红书共享一个 HTTP 服务和一条应用部署配置，两个平台各自独立启用。

## 选择上游模式

`NOCOREACH_BILIBILI_UPSTREAM` 是采集器主机的部署配置，不接受来自浏览器、项目搜索词或 HTTP 请求的覆盖。

- `opencli`（默认）：保持原生 OpenCLI search/video 命令。需要操作者已经授权的浏览器连接；登录或验证由操作者自行完成。
- `anonymous-http`（可选）：通过 Node 自带 fetch 读取公开 Web API，不需要 OpenCLI、浏览器扩展、登录或 Cookie。本模式不读取、保存或传送平台凭据，不生成浏览器身份。User-Agent 如实标识为 `NocoReach-Public-Research/1.0`。

两种模式均不是 Bilibili 官方开放平台授权接口。没有自动回退、换路或自动重试；一次平台拒绝之后不会自动改用另一种模式。不要为绕过拒绝而更换模式或出口。匿名模式遇到登录要求即停止，不会升级到登录采集。

## 能力与限制

- 只有搜索摘要和 BV 详情，不读取字幕、视频流、评论正文、用户身份，也不执行点赞、评论、关注等写操作。
- 搜索只取第一页，最多 20 条。空结果仅表示未取得可确认结果，不能据此确认没有相关视频。协议 v1 继续将搜索中的 0 播放数视为未知，搜索摘要中的点赞、评论保持未知；应用保留 Collector 返回的有效发布时间及精度，Collector 缺失日期时仍显示未知。详情明确返回的 0 有效。
- NocoReach 在关键词搜索后重新读取已保存视频的详情，即使它们没有出现在本轮搜索中，也会更新播放、点赞、评论并补齐发布时间；同时按发布时间优先补查最多 20 个搜索命中的不同视频。历史记录优先按采集时间从旧到新刷新，同一 BV 在一轮中不重复请求。成功刷新后记录归属当前配置，不再显示“来自先前配置”。请求逐个执行，单条补查最多 10 秒，整轮采集最多 120 秒，超时未刷新的记录保留，下次手动读取继续按时间顺序刷新。单个视频不存在时继续下一条；限流、验证拒绝、连接或解析失败时停止补查，不自动重试。搜索结果和已取得的详情仍保存，并显示部分成功；手动取消不提交本轮结果。刷新返回的空指标、空日期不会覆盖已有有效值。
- 详情发布时刻按当前协议截断到 UTC 分钟；匿名接口原始秒值不会被冒充为更高精度存储。缺失标题、时间或指标不会伪造。
- 每个指标保留最近一次有效读取的时间。补查失败或返回空指标时，分析仍使用旧指标的原始读取时间，不会因为视频重新被搜索到就把旧指标当作新数据。
- 匿名模式固定请求 `https://api.bilibili.com` 的 `/x/web-interface/view`、`/x/web-interface/nav` 与 `/x/web-interface/wbi/search/type`。详情 1 次请求；搜索 1 次公共参数读取加 1 次搜索。没有翻页、重定向、任意 URL、额外端点或身份导入。
- 搜索仅把 nav 的 `code=-101`、`isLogin=false` 和有效 `wbi_img` 视为公共 WBI 参数；不把匿名 nav 状态当作登录成功。搜索或详情的登录错误一律停止。签名是公开请求协议，不是账号令牌。
- 每次操作总计最多 20 秒，每个响应最多 20 MiB；客户端取消会中止 HTTP 请求及响应流。共享服务仍只允许一个在途请求。
- HTTP 403/412、验证码或风控立即停止，429 与已知频率错误映射为限流。未知或畸形响应不能被当作成功或空结果。OpenCLI 未暴露 HTTP 状态时，只能报告数据无法确认，不能精确判断平台原因。
- “检查采集器”不请求平台。OpenCLI 仅检查版本；匿名 HTTP 仅检查本地能力，返回 `upstream=anonymous-http`、`platformVerified=false`、`browser=not_required`、`login=not_used`，不会声称安装了 OpenCLI。真实内容仍须手动读取后才能验证。

## 安装与信任边界

本仓库不自动安装 OpenCLI、Chrome 扩展或插件。不让用户向 NocoReach 表单提交 Cookie、access token 或任意命令。OpenCLI 模式的扩展安装、浏览器权限、登录和持续凭据由操作者明确授权并自行完成。匿名 HTTP 模式无需新增 SDK 依赖。

OpenCLI 审计基线为 v1.8.8（commit `77af6bc433c1818a4abb1c8928e2a7fd0bbae376`）：

- [search.js](https://github.com/jackwener/OpenCLI/blob/77af6bc433c1818a4abb1c8928e2a7fd0bbae376/clis/bilibili/search.js)
- [video.js](https://github.com/jackwener/OpenCLI/blob/77af6bc433c1818a4abb1c8928e2a7fd0bbae376/clis/bilibili/video.js)
- [Apache-2.0 许可](https://github.com/jackwener/OpenCLI/blob/77af6bc433c1818a4abb1c8928e2a7fd0bbae376/LICENSE)

使用管理员信任的 OpenCLI 安装及其原生命令；本地 clis/plugins 可覆盖同名命令，版本相同不能证明未知覆盖安全。执行固定命令时不启用 shell。

匿名 HTTP 的 WBI 参数格式改编自 bpi-py commit `9e772004e56edfb33bbf9c06fb1dba7e31ddd98d` 的 [wbi.py](https://github.com/Yuelioi/bpi-py/blob/9e772004e56edfb33bbf9c06fb1dba7e31ddd98d/src/bpi/sign/wbi.py)；[response.py](https://github.com/Yuelioi/bpi-py/blob/9e772004e56edfb33bbf9c06fb1dba7e31ddd98d/src/bpi/_core/response.py) 说明匿名 nav 的例外。版权与 MIT 许可保留于 `collectors/licenses/bpi-py.txt`。公共接口可能变更，单次成功不能证明长期稳定或平台授权。

## 共用服务配置

组合入口 `collectors/browser-research.mjs` 静态注册已启用的平台 handler。Bilibili 依赖小红书基础 PR 的共享 host，并未复制另一套服务。

操作者在已有受控部署环境中配置：

- `NOCOREACH_COLLECTOR_TOKEN`：与应用端相同的私有服务令牌，不放在命令行参数、日志或仓库。它只发送到自有采集器，不会传给 Bilibili。
- `NOCOREACH_COLLECTOR_PLATFORMS`：显式 `bilibili` 或 `xiaohongshu,bilibili`。
- `NOCOREACH_BILIBILI_UPSTREAM`：`opencli`（默认）或 `anonymous-http`，其他值拒绝启动。
- `NOCOREACH_COLLECTOR_PORT`：可选，默认 18061。
- `NOCOREACH_XHS_OPENCLI_PROFILE`：组合运行小红书时保留原有可选 profile；只影响小红书。

启动命令为 `node collectors/browser-research.mjs`，默认只监听 127.0.0.1。应用与采集器不在同机时，由管理员已有 HTTPS 入口安全转发；不要将未保护的浏览器桥或回环 HTTP 直接暴露公网。

应用的 `nocoreach.browserCollectors` 沿用共享 schema，例如：

```yaml
nocoreach:
  browserCollectors:
    - id: research-collector
      name: 公开调研采集器
      url: http://127.0.0.1:18061
      token: REPLACE_WITH_PRIVATE_DEPLOYMENT_TOKEN
      platforms: [bilibili]
      projectIds: ['1']
```

这是占位示例。platforms 必须显式列出 Bilibili；不能因已配置小红书自动启用。projectIds 省略表示所有项目，列出则只允许这些项目。浏览器只收到 id/name，不会收到 URL/token。协议版本、项目和请求标识、采集时间、配置 revision 与现有权限校验均保留。

应用到采集器沿用 `OutboundNetwork.fetchCollector`，固定部署端点并拒绝跳转。采集器到平台的流量由采集器主机及所选上游管理，不受应用 ConnectionNetwork 代理选择控制，因此不展示该代理选择器。匿名模式不设置代理，也不会因失败变更出口或退回直连；管理员应在运行环境管理网络。普通公网内容抓取的 SSRF 规则保持不变。

## 手动验证与证据边界

部署后选择采集器、保存条件，先检查采集器，再手动读取关键词或公开 BV。核对原站链接、标题、采集时间与完整性，不要用 readiness、mock 测试或版本号替代真实验证。拒绝或验证码出现就停止。

2026-10-11 的独立匿名 HTTP 探针在当时环境成功读取 `BV1jYw1zLEh9` 详情与 NocoBase 搜索第一页 20 条。自动测试中的最小字段 fixture 来自该次响应，带原始响应摘要和采集时间；是保存数据的离线回放，不是测试当下的平台请求。该探针不能证明本候选的 HTTP 服务、真实数据库、权限链或 UI 已端到端验证，也不能证明 OpenCLI 路线已验证。

自动测试使用注入的 fetch/runner 和回环 HTTP 验证协议、数据处理、权限与取消；不能证明平台持续可用。断开保留记录，修改条件保留并标识先前配置的数据；没有背景定时采集。
