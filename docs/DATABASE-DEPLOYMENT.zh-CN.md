# 使用 PostgreSQL 或 MySQL 部署 NocoReach

NocoReach 默认使用 SQLite，也支持 PostgreSQL 和 MySQL。数据库回归测试使用 PostgreSQL 16、MySQL 8.4；其他版本需要在实际环境中另行验证。

下面以新建数据库、单个 NocoReach 应用进程为例。更换数据库不会搬运已有数据；把 SQLite 文件复制到新服务器也不会导入 PostgreSQL 或 MySQL。已有系统切换数据库，需要单独安排数据迁移，并保留原数据库、`storage/` 和加密密钥的备份。

## 1. 准备驱动和数据库

源码安装需要 Node.js 24 或更高版本，以及项目声明的 pnpm 版本。先运行 `pnpm install --frozen-lockfile`。

与 NocoCRM 一样，PostgreSQL 和 MySQL 驱动默认放在开发依赖中，用于开发和测试，默认生产包仍只携带 SQLite。**构建之前必须把所选驱动移入生产依赖**，否则开发环境可以连接，部署包却会缺少驱动。

PostgreSQL：

```bash
pnpm add --save-prod @nocobase/db-postgres@0.1.0-beta.5
```

MySQL：

```bash
pnpm add --save-prod @nocobase/db-mysql@0.1.0-beta.5
```

这些版本与本项目的数据库层匹配；升级框架时再一起核对版本。保留 SQLite 驱动即可，不必移除它。自建发行分支应保存上述依赖和锁文件变更。

请数据库管理员创建一个空数据库及专用账号。该账号需要在此数据库内创建和修改表、索引及约束，并读写数据，因为首次安装和后续升级会执行迁移。

| 数据库     | 配置中的 dialect | 常用端口 | 建库要求                                                  |
| ---------- | ---------------- | -------- | --------------------------------------------------------- |
| PostgreSQL | `postgres`       | `5432`   | 数据库和使用的 schema 对应用账号可用                      |
| MySQL      | `mysql`          | `3306`   | 使用 `utf8mb4` 字符集，例如 `utf8mb4_unicode_ci` 排序规则 |

## 2. 配置连接

以下初始化命令适用于**尚无 `config.yml` 的新环境**，选择其中一种：

```bash
pnpm nocobase config init --dialect postgres
```

```bash
pnpm nocobase config init --dialect mysql
```

初始化会生成 `config.yml` 和应用加密密钥。已有环境请备份后修改数据库连接部分，保留原来的 `secrets.keys` 及其他设置；不要为了切换数据库而覆盖整份配置或重新生成密钥。

例如 PostgreSQL：

```bash
pnpm nocobase config set database.connections.main.host=127.0.0.1 database.connections.main.port=5432 database.connections.main.database=nocoreach database.connections.main.username=nocoreach
pnpm nocobase config set --from-env database.connections.main.password=NOCOREACH_DB_PASSWORD
pnpm nocobase config check
```

先通过部署平台或当前终端的安全输入设置 `NOCOREACH_DB_PASSWORD` 环境变量。`--from-env` 后写的是变量名，不是密码。MySQL 使用相同命令，把端口改成 `3306`，并填写对应的连接信息。

配置文件中的主要结构如下，以 PostgreSQL 为例：

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

密码由前面的命令写入。MySQL 将 `dialect` 改为 `mysql`、端口改为 `3306`。从 SQLite 配置切换时，删除连接中的 `filename`，把原来的 `database: database.sqlite` 替换成服务器上的数据库名。

`DB_DIALECT`、`DB_HOST`、`DB_PORT`、`DB_DATABASE`、`DB_USERNAME`、`DB_PASSWORD`、`DB_SSL` 会覆盖配置文件。更改配置后也要核对部署环境里是否留有旧值。容器中的 `localhost` 指容器本身；数据库在另一个容器时，应使用容器网络中的数据库服务名。

`config check` 会检查驱动、配置和连接，但不代表业务迁移已经执行成功。

## 3. 构建和部署

驱动移入生产依赖后，按目标平台构建。例如 Linux x64、Node.js 24：

```bash
pnpm build --target linux-x64 --node-version 24 --tar
```

部署文件是 `storage/exports/dist.tar.gz`，内含 `dist/` 和 `config.example.yml`，不含数据库、运行配置和上传文件。

把压缩包解压到服务器上的应用目录，准备该环境的 `config.yml`。新环境也可在解压后执行以下命令生成配置，再按上一节填写连接参数；MySQL 把 `postgres` 换成 `mysql`：

```bash
node dist/cli/index.js config init --dialect postgres
node dist/cli/index.js config check
node dist/cli/index.js db apply
node dist/server/standalone.js
```

在应用目录执行这些命令。`config.yml` 和持久化的 `storage/` 与 `dist/` 同级；也可显式设置 `APP_CONFIG_FILE` 和 `APP_STORAGE_DIR`。正式运行请使用进程管理器，设置 `APP_PUBLIC_ORIGIN`、`APP_BASE_PATH` 和初始管理员凭据。首次 `db apply` 创建表并执行初始化数据，后续启动只执行待运行的迁移和种子。

使用 Docker 时，同样要先把驱动移入生产依赖，再用项目的 `Dockerfile` 构建镜像。将配置只读挂载到 `/app/config.yml`，将可写的持久化目录挂载到 `/app/storage`；具体镜像和反向代理步骤见[构建与部署](APP-TEMPLATE.md)。使用 Studio 时，上传包含所选驱动的新部署包，并在目标应用的部署配置中填写数据库连接。

NocoReach 当前的业务互斥锁依赖单进程。切换到 PostgreSQL 或 MySQL 不会自动使应用具备多副本并发运行能力，应保持一个应用进程。

## 4. 验证部署

部署后至少确认：

1. `<APP_BASE_PATH>/api/healthz` 返回 `ok: true`，页面及静态资源可以加载。
2. 管理员能够登录，普通用户只能访问获准的项目。
3. 新建项目、手动创建任务、上传和读取任务附件正常。
4. 重启应用后，项目、任务、附件和定时任务配置仍存在。
5. 数据确实写入所选数据库，重复执行迁移不会重新初始化已有数据。

数据库服务与应用文件应协调备份。生产环境的外部数据采集、OAuth、模型服务和 Runner 仍需使用自己的配置单独验证。

## 已有部署升级时的时间字段迁移提示

为让 MySQL 的全新安装能够完成，本次对 `202610140002_absolute_business_timestamps` 增加了 MySQL 分支：读取原始时间时保留文本，按既定 UTC／来源时区规则归一化，写入 MySQL 的 UTC `DATETIME` 值。SQLite 和 PostgreSQL 的迁移行为保持不变。

已经执行过该迁移的 SQLite 或 PostgreSQL 部署不会再次运行它，但可能报告源文件校验和变化。先确认警告只涉及这项已审核的兼容性修改，并备份数据库，再预览：

```bash
node dist/cli/index.js db repair --dry-run --json
```

确认预览后，在交互终端执行 `node dist/cli/index.js db repair` 并确认。此命令只更新迁移历史的校验和，不会重跑迁移或转换业务数据。不要用它跳过不明原因的差异或修复执行失败的迁移。

数据库测试的运行方式、覆盖范围和生产包验证入口见[开发说明](DEVELOPMENT.md#database-compatibility)。
