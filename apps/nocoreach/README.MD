# NocoReach — nocobase/nocobase3

由官方 `pnpm create @nocobase/app@latest` 生成，使用独立 SQLite，迁入 NocoReach 已实现功能。本地核心流程已验证；外部服务验收边界见仓库 `docs/NOCOBASE3-VERIFICATION.md`。

```bash
pnpm install --frozen-lockfile
pnpm nocobase config init --dialect sqlite # 仅首次，没有 config.yml 时
pnpm dev
```

使用 CLI 打印的应用地址。管理员配置在未跟踪的 `config.yml` 中，不要提交配置、密钥或数据库。

```bash
pnpm typecheck
pnpm test
pnpm test:domain
pnpm build
APP_PUBLIC_ORIGIN=http://127.0.0.1:14030 APP_SERVER_PORT=14030 pnpm start
```

前端在 `client/`，后端在 `server/`，业务数据库迁移在 `database/main/migrations/`。详细迁移与验收边界见 [迁移记录](../../docs/NOCOBASE3-MIGRATION.md)。
