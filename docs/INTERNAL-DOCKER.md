# 内部 Docker 镜像发布与更新

NocoReach 的 **Release** 工作流在测试、构建和创建 GitHub Release 后，自动调用 **Publish internal Docker image**，将同一次发布已经验证的部署包制作成镜像并推送。Solutions 部署和镜像发布是独立作业；请分别检查结果。

镜像地址：`registry.cn-beijing.aliyuncs.com/nocobase/nocoreach:<版本号>`，例如 `1.0.0-beta.75`。镜像标签不包含 Git 标签的 `v` 前缀。平台为 `linux/amd64`，内置 SQLite 和 PostgreSQL 驱动、应用 CLI 和 Runner 分发包。

## 一次性配置

1. 在阿里云容器镜像服务中准备 `nocobase/nocoreach` 私有仓库。
2. 为 NocoReach GitHub 仓库配置 Actions Secrets：`ACR_USERNAME` 和 `ACR_PASSWORD`。也可以使用已授权该仓库访问的组织级 Secrets。
3. 确认账号具有该仓库的推送权限，GitHub Actions 托管运行器能够访问仓库。只有拉取权限的账号不能用于发布。
4. 合并工作流和依赖变更后，在 GitHub Actions 中从 `main` 运行 **Release**。版本号可按既有流程填写或自动递增。

账号密码不写入仓库文件或镜像；CI 使用 `docker login --password-stdin` 登录，结束后清理登录状态。缺少配置会使镜像作业失败，不会被当成发布成功。

## 发布结果

发布作业会核对 Git 标签、提交、主分支历史、应用版本及部署包版本，使用项目 Dockerfile 构建镜像，并检查生产数据库驱动可加载。推送后重新拉取镜像，在 Actions 作业摘要中输出完整镜像地址和 digest。

发布使用明确的版本标签，不更新 `latest`。镜像发布完成后，各服务器自行更新镜像版本；该工作流不会自动重启其他服务器，也不会搬运数据库、配置或附件。

## 其他服务器更新

先备份数据库与文件，检查版本的迁移说明，并暂停正在执行的任务。使用具有拉取权限的账号登录仓库，将现有 Compose 的应用镜像改成已发布版本，例如：

```yaml
services:
  app:
    image: registry.cn-beijing.aliyuncs.com/nocobase/nocoreach:1.0.0-beta.75
    platform: linux/amd64
    init: true
    environment:
      NOCOBASE_DEMO_MODE: 'false'
      APP_SAMPLE_DATA: 'false'
    volumes:
      - ./config.yml:/app/config.yml:ro
      - ./storage:/app/storage
    ports:
      - '127.0.0.1:13041:13000'
```

这是现有 Compose 的相关字段示例，不是完整的新建部署配置。保留数据库网络、连接、公开 origin、`APP_BASE_PATH`、原密钥和持久卷；不要重新生成已有环境的密钥。数据库用户名变量为 `DB_USERNAME`，容器应用端口为 `13000`。

```sh
docker compose pull app
docker compose up -d --no-deps app
docker compose ps
```

检查公开入口的 `/main/api/healthz`、账号登录、业务数据与附件。如果应用使用其他挂载路径，相应修改健康接口路径。需要固定部署字节时，将镜像设为摘要中的 `registry.cn-beijing.aliyuncs.com/nocobase/nocoreach@sha256:...`。

数据库初始化与配置见 [PostgreSQL / MySQL 部署说明](DATABASE-DEPLOYMENT.zh-CN.md)。代码回退不会自动撤销数据库迁移，恢复时应配合兼容的数据库、配置和文件备份。

## 失败重试

GitHub Release 创建成功不代表镜像已经推送成功。若镜像作业失败，先查看日志和远端仓库状态，然后在原 Release 运行中重跑失败作业；发布归档保留七天。

归档过期后，可从 `main` 手动运行 **Publish internal Docker image**，填写已经发布的完整 Git 标签。恢复流程会重新安装锁定依赖、测试并构建该版本，仅适用于已包含本发布流程的版本。重新构建可能产生不同 digest，并更新同一版本标签；重试前核对使用该标签的部署，固定 digest 的部署需要显式选择新 digest。

如果推送权限不足或仓库不存在，先修复仓库配置。不要为了重试同一个镜像而重新运行 **Release** 创建另一个版本。
