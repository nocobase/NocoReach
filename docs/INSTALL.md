# 安装与升级

English: [Install and upgrade](en/INSTALL.md)

使用官方 nocobase/nocobase3 应用，Node.js 24 以上、pnpm 11；不再安装 alpha.7 宿主、Portal 或独立业务插件。

```bash
pnpm --dir apps/nocoreach install --frozen-lockfile
cd apps/nocoreach
pnpm nocobase config init --dialect sqlite
pnpm dev
```

仅在首次且配置不存在时运行 config init。按提示编辑未跟踪的 config.yml，设置管理员、密钥和数据库；不要提交配置、数据库和日志。访问终端给出的应用地址及挂载路径。

生产部署：在应用目录执行 `pnpm build`，设置 `APP_PUBLIC_ORIGIN` 为真实对外来源（不含 /main），然后执行 `pnpm start`。保留配置与持久化 storage，升级前备份；按当前平台构建，启动时执行原生数据库迁移，不覆盖现有数据库。不迁移旧 alpha 数据。

本机 Agent：在仓库根目录执行 `node apps/agent/build.cjs`；服务地址应包含挂载路径，例如 `https://example.com/main`。按 Agent 页的接入步骤配置本机电脑。

Google OAuth 回调为 `https://example.com/main/api/reach/nrGoogle/callback`。其余数据源和在线模型在应用中重新配置。来源检查不得通过关闭安全校验绕过。

框架版本、实现映射和验证限制见 [迁移记录](NOCOBASE3-MIGRATION.md) 与 [验证记录](NOCOBASE3-VERIFICATION.md)。
