<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/public/assets/nocoreach-mark.svg" width="72" alt="NocoReach">
</p>

<h1 align="center">NocoReach</h1>

<p align="center"><strong>AI 找出增长机会，交给 Agent 执行</strong></p>

<p align="center">AI 增长运营平台 · 基于 NocoBase Core 构建</p>

<p align="center">
  <a href="https://solutions-cn.nocobase.com/reach/"><strong>在线体验</strong></a> · <a href="https://www.nocobase.com/solution-reach/">官网介绍</a> · <a href="README.md">English</a> · <strong>简体中文</strong> · <a href="README.ja-JP.md">日本語</a>
</p>

https://github.com/user-attachments/assets/25e0c3ba-ddd5-4dad-be9c-179bc145cd9b

NocoReach 是 AI 增长运营平台，接入网站、搜索、AI 搜索、社区、社交媒体和竞品等 20 多个数据源：每天找出值得做的事，交给 Agent 执行，改动由你审核，上线后自动对比效果。

| 步骤            | 做什么                                    |
| --------------- | ----------------------------------------- |
| 1. 数据汇在一处 | 网站、搜索、AI 搜索、社区和竞品，每天同步 |
| 2. 每日分析     | AI 逐条判断当天的变化，把值得做的写成机会 |
| 3. 交给 Agent   | 你确认后，多项任务同时推进                |
| 4. 由你审核     | 文章和页面改动，通过后才发布              |
| 5. 效果对比     | 上线后第 7、28 天自动对比                 |

![洞察：每日分析和今天要你决定的事](https://cdn.jsdelivr.net/gh/nocobase/NocoReach@main/docs/images/readme/insights-zh.webp)

## 快速开始

只想先看看：[在线体验](https://solutions-cn.nocobase.com/reach/)已用演示账号自动登录，数据都是虚构的。

在自己的电脑上运行，需要 Node.js 24 和 pnpm：

```bash
git clone https://github.com/nocobase/nocoreach.git
cd nocoreach
pnpm install
pnpm nocobase config init
pnpm dev
```

打开终端中显示的地址，用 `config.yml` 中的初始管理员登录，新建项目后在“设置 › 数据接入”中接入数据。生产部署请参考[构建与部署](docs/APP-TEMPLATE.md)。

## 许可证

NocoReach 基于 NocoBase Core 构建，以 [Apache-2.0](LICENSE) 协议开源。
