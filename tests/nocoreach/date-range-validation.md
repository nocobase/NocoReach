# 自定义日期验证记录（PM-404）

## 环境与复现

- 独立本地 NocoReach 开发应用，SQLite 新库，启用模拟数据；没有使用真实供应商数据或个人账户。
- Linux，Chromium 152.0.7977.82，headless，浏览器语言 `en-US`；英文界面，桌面视口 1440 × 1000。
- 在旧代码的真实 GitHub 页面，将 `2026-09-01` 的“日”分段删除后按 Tab：开始和结束输入都变空，URL 同时失去 `from` / `to`。这次操作确认了原生分段编辑引发的破坏性回写。

## 修复验证

`tests/playwright/nocoreach-date-range.test.ts` 在运行中的 GitHub 和下载量页面逐键操作原生 date 输入，覆盖：

- 删除“日”后的空 DOM 值及本地错误提示，再输入“18”能得到 `2026-09-18`，原有年月和另一端日期保留。
- 两端分别删除、重输年、月、日；完整但未应用的范围不改变 URL，也不新增报表请求。
- 应用后请求携带准确的起止日期，摘要更新；刷新保留已提交范围。
- 无效日、日期倒置和截图中的年份 `0001` 超长范围显示本地提示。
- 快捷范围移除日期参数并保留其他参数；打开自定义不提交默认值；前进、后退恢复 URL 中的范围。
- 点击原生日历图标，使用弹层键盘选择日期，选择结果仍需应用。
- 中文界面删除结束日期的“日”后显示中文提示，开始日期保留；375 × 812 窄屏下浅色、深色日期控件和错误提示可见，输入框没有超出视口。

组件测试覆盖未完成深链、中英文提示、错误后焦点、草稿与 URL 隔离，以及闰年、倒置、未来日期和包含首尾的 490 / 491 天边界。

## 可复现检查

```sh
pnpm exec vitest run tests/nocoreach/range-picker.test.tsx tests/components/nocoreach-locale.test.tsx tests/logic/nocoreach-locale-coverage.test.ts tests/logic/app-locale-coverage.test.ts
pnpm exec vitest run tests/nocoreach/range-picker.test.tsx tests/nocoreach/data-views.test.ts tests/nocoreach/github-view.test.ts tests/nocoreach/downloads-view.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec tsc -p tsconfig.node.json --noEmit
pnpm exec eslint --max-warnings 0 client/pages/range-picker.tsx tests/nocoreach/range-picker.test.tsx tests/playwright/nocoreach-date-range.test.ts
```

两组 Vitest 分别通过 31 项和 37 项断言（共享组件用例有重叠）；客户端和工具配置类型检查、变更文件 ESLint / Prettier 通过。后端没有改动，已有报表回归测试通过。

最终浏览器运行通过全部 3 项测试：GitHub、下载量、中文窄屏。报表请求计数在登录初始化与页面初始加载结束后开始，避免把会话初始化请求混入编辑期间的计数。

浏览器测试从环境读取 `APP_URL`（包含 `/main`）、`E2E_USERNAME` 和 `E2E_PASSWORD`，只应指向专用测试应用；可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已安装的 Chromium。运行 `pnpm exec playwright test tests/playwright/nocoreach-date-range.test.ts`，截图写入 Playwright 的输出目录。不要提交登录状态或运行时配置。

## 验证范围

- 英文截图：`github-draft-en.png`、`github-validation-en.png`、`downloads-draft-en.png`、`downloads-validation-en.png`，分别展示未提交草稿和本地超限提示；`*-calendar-en.png` 展示真实原生日历弹层。
- 未验证：Firefox、WebKit、其他操作系统及浏览器语言下的原生分段顺序；其原生输入行为需要对应环境复核。
- CI 状态以草稿 PR 上的实际结果为准；独立评审由项目经理安排。
