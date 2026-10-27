# Deploy NocoReach with PostgreSQL or MySQL

English | [中文](DATABASE-DEPLOYMENT.zh-CN.md)

NocoReach uses SQLite by default and also supports PostgreSQL and MySQL. Database regression tests run on PostgreSQL 16 and MySQL 8.4; validate other versions in your own environment.

This guide assumes an empty database and a single NocoReach application process. Changing the connection does not move existing data, and copying a SQLite file to another server does not import it into PostgreSQL or MySQL. Plan a separate data migration when switching an existing installation, and back up the original database, `storage/` and encryption keys.

## 1. Prepare the driver and database

Installing from source requires Node.js 24 or later and the pnpm version declared by the project. First run `pnpm install --frozen-lockfile`.

As in NocoCRM, the PostgreSQL and MySQL drivers are development dependencies for development and testing. The default production package includes only SQLite. **Move the selected driver into production dependencies before building**, or a connection that works in development will fail in the deployment package because its driver is missing.

For PostgreSQL:

```bash
pnpm add --save-prod @nocobase/db-postgres@0.1.0-beta.5
```

For MySQL:

```bash
pnpm add --save-prod @nocobase/db-mysql@0.1.0-beta.5
```

These versions match the project's database layer; review them together when upgrading the framework. Keep the SQLite driver installed. If you maintain a release branch, commit the dependency and lockfile changes to it.

Have your database administrator create an empty database and a dedicated account. The account must be able to create and alter tables, indexes and constraints, as well as read and write data, because installation and upgrades run migrations.

| Database   | Configuration dialect | Usual port | Database requirements                                          |
| ---------- | --------------------- | ---------- | -------------------------------------------------------------- |
| PostgreSQL | `postgres`            | `5432`     | The application account can access the database and schema     |
| MySQL      | `mysql`               | `3306`     | Use `utf8mb4`, for example with `utf8mb4_unicode_ci` collation |

## 2. Configure the connection

For a **new environment without a `config.yml`**, choose one initialization command:

```bash
pnpm nocobase config init --dialect postgres
```

```bash
pnpm nocobase config init --dialect mysql
```

Initialization generates `config.yml` and application encryption keys. For an existing environment, back up the configuration and edit its database connection, preserving `secrets.keys` and other settings. Do not overwrite the whole configuration or regenerate keys just to change the database.

For example, configure PostgreSQL with:

```bash
pnpm nocobase config set database.connections.main.host=127.0.0.1 database.connections.main.port=5432 database.connections.main.database=nocoreach database.connections.main.username=nocoreach
pnpm nocobase config set --from-env database.connections.main.password=NOCOREACH_DB_PASSWORD
pnpm nocobase config check
```

First set the `NOCOREACH_DB_PASSWORD` environment variable through your deployment platform or secure input in the current terminal. The value after `--from-env` is the variable's name, not the password. Use the same commands for MySQL, changing the port to `3306` and supplying its connection details.

The main configuration structure for PostgreSQL is:

```yaml
database:
  default: main
  connections:
    main:
      dialect: postgres
      host: 127.0.0.1
      port: 5432
      database: nocoreach
      username: nocoreach
      schemaManagement: managed
      migrations:
        autoRun: true
      seeds:
        autoRun: true
```

The preceding command writes the password. For MySQL, change `dialect` to `mysql` and the port to `3306`. When adapting a SQLite configuration, remove `filename` from the connection and replace `database: database.sqlite` with the database name on the server.

`DB_DIALECT`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` and `DB_SSL` override the configuration file. Check the deployment environment for old values after changing the configuration. Inside a container, `localhost` means that container; use the database service name on the container network when the database runs in another container.

`config check` validates the driver, configuration and connection. It does not establish that business migrations have completed successfully.

## 3. Build and deploy

After moving the driver into production dependencies, build for the target platform. For example, for Linux x64 and Node.js 24:

```bash
pnpm build --target linux-x64 --node-version 24 --tar
```

The deployment archive is `storage/exports/dist.tar.gz`. It contains `dist/` and `config.example.yml`, but no database, runtime configuration or uploaded files.

Extract the archive into the application directory on the server and prepare that environment's `config.yml`. In a new environment, you can generate the configuration after extraction, then fill in the connection details from the previous section. For MySQL, replace `postgres` with `mysql`:

```bash
node dist/cli/index.js config init --dialect postgres
node dist/cli/index.js config check
node dist/cli/index.js db apply
node dist/server/standalone.js
```

Run these commands from the application directory. Keep `config.yml` and persistent `storage/` alongside `dist/`, or explicitly set `APP_CONFIG_FILE` and `APP_STORAGE_DIR`. For production, use a process manager and configure `APP_PUBLIC_ORIGIN`, `APP_BASE_PATH` and the initial administrator credentials. The first `db apply` creates tables and seeds initial data; subsequent starts run only pending migrations and seeds.

For Docker, also move the driver into production dependencies before building with the project's `Dockerfile`. Mount the configuration read-only at `/app/config.yml` and writable persistent storage at `/app/storage`; see [Build and deploy](APP-TEMPLATE.md) for image and reverse proxy instructions. For Studio, upload a new deployment package containing the selected driver and set the connection in the target application's deployment configuration.

NocoReach's business locks currently depend on a single process. Switching to PostgreSQL or MySQL does not make the application ready for concurrent replicas; keep one application process.

## 4. Verify the deployment

After deployment, check at least the following:

1. `<APP_BASE_PATH>/api/healthz` returns `ok: true`, and the page and static assets load.
2. The administrator can sign in, and ordinary users can access only authorized projects.
3. Creating projects and manual tasks, uploading task attachments and reading them work.
4. Projects, tasks, attachments and schedule configuration remain after restarting the application.
5. Writes reach the selected database, and rerunning migrations does not reinitialize existing data.

Coordinate backups of the database service and application files. Verify production data collection, OAuth, model services and Runner execution separately with your own configuration.

## Timestamp migration note for existing installations

To allow a fresh MySQL installation to complete, `202610140002_absolute_business_timestamps` now has a MySQL branch. It reads raw timestamps as text, normalizes them according to the existing UTC/source-timezone rules, and writes UTC `DATETIME` values to MySQL. SQLite and PostgreSQL migration behavior is unchanged.

SQLite or PostgreSQL installations that already ran this migration will not run it again, but may report a source checksum change. Confirm that the warning concerns only this reviewed compatibility change, back up the database, and preview the repair:

```bash
node dist/cli/index.js db repair --dry-run --json
```

After reviewing the preview, run `node dist/cli/index.js db repair` in an interactive terminal and confirm. This updates the migration history checksum; it does not rerun the migration or convert business data. Do not use it to bypass unexplained differences or to fix failed migrations.

See the [development guide](DEVELOPMENT.md#database-compatibility) for database test commands, coverage and production package verification.
