# 生产环境自动部署

生产地址为 <https://nocoreach.nocobase.ai/main/>，服务器为 `agents@47.236.77.169`，部署目录为 `/home/agents/apps/nocoreach`。

Release 工作流发布镜像后，将版本号和不可变镜像摘要发送至 `https://nocoreach.nocobase.ai/_deploy/nocoreach`。仓库变量 `NOCOREACH_DEPLOY_URL` 保存该地址；仓库 Secret `NOCOREACH_DEPLOY_SECRET` 与服务器 `/etc/nocoreach-deploy/config.json` 中的签名密钥一致。密钥不进入代码仓库。

## 服务器配置

- `scripts/deployment/service.py` 安装到 `/opt/nocoreach-deploy/service.py`。
- `scripts/deployment/nocoreach-deploy.service` 安装为同名 systemd 服务。
- 使用 `config.example.json` 的目标设置，并填入签名密钥，配置文件权限为 `600`。
- 服务通过 `/run/user/1000/docker.sock` 操作 agents 用户的 Rootless Docker，使用 `/home/agents/.docker` 的镜像仓库认证。agents 用户应启用 linger，用户 Docker 服务应开机启动。
- Caddy 将 `/_deploy/nocoreach` 及其子路径代理至 `127.0.0.1:13042`，其他请求代理至应用 `127.0.0.1:13000`。
- 应用容器名为 `nocoreach-app-1`，数据库容器名为 `nocoreach-postgres-1`；Compose 项目名为 `nocoreach`，文件名为 `docker-compose.yaml`。

## 更新与恢复

接收端校验签名、时间戳及 nonce，拒绝请求重放、版本降级和同版本不同镜像。每次更新核对镜像版本、来源和平台，停止应用后备份数据库、`config.yml`、`.env`、`storage` 和 Compose 文件，再预览数据库变更并更新应用。数据库容器不会被部署流程重建。

部署状态、日志和备份在 `/var/lib/nocoreach-deploy`，保留最近三次成功部署的备份。未修改数据库的失败可恢复原镜像；数据库可能已变更时标记为 `manual_recovery`，需要人工检查，不能直接重试或回退代码。配置与加密密钥必须和数据库备份一起保留。

```bash
sudo systemctl status nocoreach-deploy
sudo journalctl -u nocoreach-deploy --since '30 minutes ago'
cd ~/apps/nocoreach
./compose ps
./compose logs --tail 100 app
```

新端点验证成功后再修改仓库变量，并停用旧香港服务器的 `nocoreach-deploy` 服务，避免旧端点重新启动迁移前的应用。Solutions 的独立部署流程不受此切换影响。
