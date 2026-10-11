# Bilibili 公开内容调研采集器

此接入通过管理员部署的 OpenCLI 浏览器采集器，手动读取关键词搜索第一页（最多20条）与指定公开视频元数据。与小红书共享一个 HTTP 服务和一条应用部署配置，两个平台各自独立启用。

## 能力与限制

- 第一版只有搜索摘要和 BV 详情，不读取字幕、视频流、评论正文、用户身份，也不执行点赞/评论/关注等写操作。
- OpenCLI 使用网页 API，不是 Bilibili 官方开放平台授权。浏览器需要能正常打开平台；登录/验证由操作者自行完成。
- 搜索空数组可能来自上游限制或空结果，界面会提示“未取得可确认的结果”，不会据此确认无相关视频。OpenCLI 搜索输出中的0计数无法区分缺失值，本接入显示“未知”。详情明确返回的0有效。
- 发布时刻只具有上游给出的UTC分钟精度。缺失标题/时间/指标不会伪造，BV/来源链接/采集时间保留。
- 平台拒绝、验证码、412等停止；没有换端点、换出口、自动重试。上游CLI未暴露HTTP状态时，只能报告数据无法确认，不能精确判断平台原因。
- 工具检查只运行版本查询，不验证浏览器登录或真实平台可用性。只有实际取得可确认数据后才显示读取成功。

## 安装与信任边界

本仓库不自动安装 OpenCLI、Chrome 扩展、插件或浏览器账号。不让用户向 NocoReach 表单提交 Cookie、access token 或任意命令。安装扩展、授予浏览器权限、登录和建立持续凭据需要操作者明确授权并自行完成。

审计基线：OpenCLI v1.8.8（GitHub release 2026-08-30），源文件按 commit `77af6bc433c1818a4abb1c8928e2a7fd0bbae376` 核对：

- [search.js](https://github.com/jackwener/OpenCLI/blob/77af6bc433c1818a4abb1c8928e2a7fd0bbae376/clis/bilibili/search.js)
- [video.js](https://github.com/jackwener/OpenCLI/blob/77af6bc433c1818a4abb1c8928e2a7fd0bbae376/clis/bilibili/video.js)
- [utils.js](https://github.com/jackwener/OpenCLI/blob/77af6bc433c1818a4abb1c8928e2a7fd0bbae376/clis/bilibili/utils.js)
- [上游 Apache-2.0 许可](https://github.com/jackwener/OpenCLI/blob/77af6bc433c1818a4abb1c8928e2a7fd0bbae376/LICENSE)

使用管理员信任的 OpenCLI 安装及其原生 bilibili search/video 命令。OpenCLI允许本地clis/plugins覆盖同名命令；版本相同不能证明未知覆盖代码安全。此接入没有复制上游签名实现或安装第三方插件；执行固定命令时不启用shell。

## 共用服务配置

先按小红书接入部署说明准备共享host文件。Bilibili PR必须在该基础PR之后合并，不再复制共享host。组合入口是 `collectors/browser-research.mjs`，它静态注册已启用的平台handler。

操作者在已有受控部署环境中配置：

- `NOCOREACH_COLLECTOR_TOKEN`：与应用端相同的私有服务令牌，不放在命令行参数、日志或仓库。
- `NOCOREACH_COLLECTOR_PLATFORMS`：显式 `bilibili` 或 `xiaohongshu,bilibili`。
- `NOCOREACH_COLLECTOR_PORT`：可选，默认18061。
- `NOCOREACH_XHS_OPENCLI_PROFILE`：组合运行小红书时保留原入口的可选 profile 选择；Bilibili 使用原生命令的默认浏览器连接。

启动命令为 `node collectors/browser-research.mjs`。默认只监听127.0.0.1。应用与采集器不在同机时，由管理员已有HTTPS入口安全转发；不要将未保护的浏览器桥或回环HTTP直接暴露公网。

应用的 `nocoreach.browserCollectors` 使用共享schema，例如：

```yaml
nocoreach:
  browserCollectors:
    - id: research-browser
      name: 研究浏览器
      url: http://127.0.0.1:18061
      token: REPLACE_WITH_PRIVATE_DEPLOYMENT_TOKEN
      platforms: [xiaohongshu, bilibili]
      projectIds: ['1']
```

这是占位示例，不是可用凭据。platforms必须显式列出Bilibili；不能因为已配置小红书而自动启用Bilibili。projectIds省略表示所有项目，列出则只允许这些项目。浏览器只能收到id/name，不会收到URL/token。

应用→collector走固定部署端点、拒绝跳转。浏览器→Bilibili流量由collector主机管理，不受应用ConnectionNetwork代理选择控制；本接入因此不展示该代理选择器。普通公网内容抓取的SSRF规则保持不变。

## 手动验证

完成操作者授权的安装/登录后，在数据接入选择采集器、保存条件。先检查工具，再读取一个关键词或公开BV，核对原站链接、标题、采集时间和字段完整性。不要用版本号、mock测试或登录检查代替真实内容验证。

出现拒绝/验证码就停止，不改变出口或工具来绕过。断开保留记录；更改条件保留并标识先前配置的数据。没有背景定时采集。

自动测试使用注入的mock runner和回环HTTP，仅验证协议、数据处理、权限和取消等应用行为；它们不能证明真实浏览器扩展、账号状态或平台采集可用。
