# Install and upgrade

中文：[安装与升级](../INSTALL.md)

Use the nocobase/nocobase3 application in `apps/nocoreach`, Node.js 24 or later and pnpm 11. The old alpha host, Portal and business plugin are no longer used.

```bash
pnpm --dir apps/nocoreach install --frozen-lockfile
cd apps/nocoreach
pnpm nocobase config init --dialect sqlite
pnpm dev
```

Run config init only on first installation when config.yml does not exist. Configure the initial administrator, secrets and database locally. Never commit configuration, databases or logs.

For production, run `pnpm build`, set `APP_PUBLIC_ORIGIN` to the external origin without /main, then run `pnpm start`. Build for the target platform. Back up and retain config.yml and persistent storage during upgrades; native migrations update the database on startup. Old alpha databases are not migrated.

Build the local Agent with `node apps/agent/build.cjs` from the repository root and follow the Agent page. Its server URL must include the mount path, for example `https://example.com/main`. The Google callback is `https://example.com/main/api/reach/nrGoogle/callback`.

See the [migration record](../NOCOBASE3-MIGRATION.md) and [verification limits](../NOCOBASE3-VERIFICATION.md). External integrations still require their own credentials and verification.
