# 文章发布

写博客、改已有文章这类任务，可以把审核通过的文章直接发布到“发布目标”（CMS、文章接口或仓库里的文章文件），不再通过网站仓库的 PR 交付。选题、大纲、写作、修改、审核这些步骤都不变。改代码、改页面布局的任务仍然走 PR。

开发说明见 [ARTICLE-PUBLISHING.md](ARTICLE-PUBLISHING.md)，文章接口协议见 [ARTICLE-API.md](ARTICLE-API.md)。

## 发布目标的三种类型

| 类型         | 适用场景                                                   | 能否保证不覆盖他人修改                                             |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| NocoBase API | NocoBase 搭建的 CMS，或以后自建的 NocoBase 文章模块        | 写前复核：发布前重新读取并比对，极小概率会覆盖他人在同一瞬间的修改 |
| 文章接口     | 按 [ARTICLE-API.md](ARTICLE-API.md) 实现了接口的网站或 CMS | 可以保证                                                           |
| Git 文件     | 没有 CMS，文章就是仓库里的 Markdown 文件                   | 可以保证                                                           |

## 连接 nocobase.com 的 CMS

1. 在 CMS 中新建一个专用角色，只授予 `articles` 集合的查看、新建、编辑权限，再为这个角色创建 API key。不要使用管理员账号的密钥。
2. 在 NocoReach 中打开“数据接入 › 文章发布目标”，点“新建发布目标”：
   - 名称：例如“NocoBase CMS”；类型：NocoBase API；地址：`https://cms.aliyun.nocobase.com`；访问密钥：第 1 步的 API key。
   - 高级设置里已有默认的字段映射（`title`/`title_cn`/`title_ja` 等），按下面补上页面地址和导出设置：

```json
{
  "collection": "articles",
  "locales": ["en", "zh", "ja"],
  "fields": {
    "id": "id",
    "slug": "slug",
    "version": "updatedAt",
    "status": {
      "field": "status",
      "published": "published",
      "draft": "drafted"
    },
    "locales": {
      "en": {
        "title": "title",
        "description": "description",
        "body": "content"
      },
      "zh": {
        "title": "title_cn",
        "description": "description_cn",
        "body": "content_cn"
      },
      "ja": {
        "title": "title_ja",
        "description": "description_ja",
        "body": "content_ja"
      }
    }
  },
  "pages": {
    "en": "https://www.nocobase.com/en/blog/{slug}",
    "zh": "https://www.nocobase.com/cn/blog/{slug}",
    "ja": "https://www.nocobase.com/ja/blog/{slug}"
  },
  "downstream": {
    "repo": "nocobase/website",
    "branch": "main",
    "files": {
      "en": "content/articles/{slug}/index.md",
      "zh": "content/articles/{slug}/index.cn.md",
      "ja": "content/articles/{slug}/index.ja.md"
    },
    "metadata": {
      "path": "content/articles/{slug}/metadata.json",
      "keys": {
        "en": { "title": "title", "description": "description" },
        "zh": { "title": "title_cn", "description": "description_cn" },
        "ja": { "title": "title_ja", "description": "description_ja" }
      }
    },
    "exporter": { "name": "NocoBase-CMS" }
  }
}
```

3. 保存后点“测试连接”，能读到一篇文章即可。网站仓库是公开仓库，“导出仓库令牌”可以留空；如果 GitHub 匿名请求被限流，再填一个只读令牌。
4. 发布后页面要等 CMS 每小时一次的同步导出到网站仓库、网站重新部署后才会更新。任务会显示“等待导出”，导出完成后自动检查页面。

文章通过 CMS 的接口写入，和编辑在 CMS 页面上点“保存”走的是同一套接口：权限、字段校验和“数据表事件”工作流都照常生效。只绑定在页面按钮上的“操作后事件”工作流（例如“刷新文章缓存”）默认不会触发；需要时，在高级设置里加上 `"triggerWorkflows": ["<工作流 key>"]`。上线前请先实测一次。

## 在任务中使用

- **开始任务时**：只要做法里有改动步骤，并且项目配置了发布目标，就会出现“发布到”和“文章”两项。“发布到”默认选中默认发布目标（管理员可以在发布目标卡片的“⋯”菜单里“设为默认”；没有设置时用列表里的第一个），开始前可以改选其他目标。一个任务只发布到一个目标，开始后不能更换。写博客默认是“新文章”；改已有文章要先搜索并选中文章。选“网站源码仓库（PR）”则保持原来的 PR 流程。
- **审核时**：按语言分页签查看每个改动字段的前后对比。可以直接编辑，保存后会生成新版本。目标支持状态时（例如 NocoBase CMS），可以选择“草稿”或“发布”：新文章默认是草稿，只有选了“发布”，审核通过后才会在网站上公开。只有审核通过的版本会被发布；未审核的稿件不会写入 CMS，所以也不会被每小时的导出带出去。
- **发布时**：
  - 发布前会再次读取文章。如果别人在审核期间改了**同一字段**，会提示冲突，两个版本都会保留。点“重新审核”后，会基于最新版本重新确认。别人改的是**其他字段**时，会保留他的修改，只写入本稿改动的字段。
  - 如果网站仓库里这篇文章有**只在仓库里改过**、还没回到 CMS 的内容，也会阻止发布：CMS 导出会把这些内容覆盖掉。请先把仓库里的修改并入稿件。
  - 网络超时这类情况会显示“发布没有完成”。点“重试”时会先核对文章，不会重复写入。
- **发布后**：14 天内如果 CMS 里这篇文章又被改动（例如编辑用打开很久的旧表单保存），任务上会提示，并可以查看对比。这种情况只能事后发现，不能事先阻止。

## 代码任务与 CMS 管理的文件

配置了导出到 Git 的目标后，代码任务的 PR 如果改了这些文章文件（如 `content/articles/*/index.md`、`metadata.json`），将无法审核通过：这些文件会被 CMS 的导出覆盖，应改用文章发布。已经打开的同类 PR（例如 nocobase/website#185）不要直接合并，请改为文章任务重新发布这些改动。

## 尚存的风险

- NocoBase API 类型是写前复核：从核对到写入之间约一秒的空档里，如果有人保存，他的修改可能被覆盖。概率很低。
- 编辑在发布之前打开、发布之后才保存的旧表单，会覆盖已发布的内容。任务上会提示，但无法阻止。
- 绕过 NocoReach 直接在网站仓库里改的文章，仍可能被 CMS 导出覆盖，这和以前一样。

要完全消除前两条，需要 CMS 在写入时检查版本，例如在数据库层加版本校验。这不在本次改动范围内。
