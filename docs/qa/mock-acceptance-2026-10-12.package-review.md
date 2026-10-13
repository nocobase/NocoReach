# Packages malformed 错误增量独立验收

结论：**no-mustfix**。静态审查目标 source `285447651790df3f1452b7ce03e2b02ca8f99881`，真实 Chromium 使用隔离实例 `http://127.0.0.1:13174/main/`。本报告由新独立 reviewer 实施，未修改仓库、source 或 guard，未合并或部署。

## 范围与静态结论

审查该提交自身的三个文件：`client/i18n/index.tsx`、`client/pages/packages-connect.tsx`、`tests/components/nocoreach-source-error-locale.test.tsx`。注意 `db40caa..2854476` 整体还包括中间提交的 CHANGELOG/QA 文档与截图，不是只有三个文件；本次代码增量审查限定上述三个文件。

- 服务端 `packages-source.ts` 的同步错误明确按 `${p.title||p.name}：${e.message}` 生成；JSON 解析错误是固定 `返回的不是有效数据`。新增语法与此生成点一致。
- 匹配保留整个非换行标题前缀（包括中文、句号、内部全角冒号、@scope/name），只替换固定末尾错误文案，不对标题执行词典替换。未知错误保留原值。
- Slack/Discord/X 上游拒绝详情的分支先于新增匹配执行，不会被新分支重新解释。既有来源状态、权限详情和 transport 错误组件回归通过。
- PackagesConnect 仅替换历史错误展示 helper，不改变请求、保存格式、数据权限或同步逻辑。没有发现需要修复的行为回归。
- 现有新增组件测试使用真实字典、从中文切英文再切中文，并检查中文标题及未知错误原样保留，覆盖此次核心回归。

## 独立执行的验证

- `pnpm exec vitest run tests/components/nocoreach-source-error-locale.test.tsx`：11/11 通过。
- `pnpm exec vitest run tests/logic/nocoreach-locale-coverage.test.ts`：7/7 通过。
- 真实 Chromium UI 点击 `Sync now`，mock malformed 后产生 npm/PyPI/Docker 三个失败。失败 at `2026-10-12T15:57:50.794Z`，三包可见数据与失败前完全相同。
- 新文档导航重新进入 Packages，服务端持久错误仍存在；英文三条均为 `<原始包名>: Returned data isn't valid`，无旧中文错误残留。
- 通过真实账户菜单切换中文，三条原始中文错误均恢复；英文、中文各在 1440 和 375 宽度检查，页面无水平溢出。
- 改回 normal 并在真实 UI 点击 `立即同步`，成功 at `2026-10-12T15:58:14.010Z`，errors=[]；重新导航后错误仍消失。
- 主验收页面 `pageerror` 0，观察到的非 localhost/127.0.0.1 浏览器请求 0。未调用模型、Runner 或 Mail，未修改外部来源配置或解除 guard。

## 证据

同目录：`independent-package-review.mjs`（独立断言脚本）、`independent-package-review.json`（前/失败/恢复状态与结果）、`independent-packages-{en,zh}-{1440,375}.png` 和对应 `.txt`。另有 `independent-package-focus.mjs` 与移动端滚动聚焦截图用于完整查看错误区域。

未重复全量 build/typecheck，按委派范围由主 agent 正在运行。测试输出仅已有依赖 sourcemap 缺失源文件提示，不影响通过。未发现本增量阻塞项。
