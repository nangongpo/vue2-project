# ClamAV 内网病毒扫描配置

backend 通过 Unix Socket（优先）或受控内网 TCP 调用 `clamd` 扫描文件。两个程序的职责不同：

- `freshclam`：下载和更新病毒库，不负责扫描。
- `clamd`：加载病毒库并提供扫描服务，不负责下载更新。

**首次部署：先下载病毒库，再启动 `clamd`。后续更新：更新病毒库，再让运行中的 `clamd` 重新加载。** 启动 backend 或重启 `clamd` 都不会下载病毒库。

文件状态和下载控制见 [FILE_SECURITY.md](FILE_SECURITY.md)，环境变量见 [CONFIGURATION.md](CONFIGURATION.md)。扫描失败必须保持隔离；病毒库新鲜度需要部署侧监控，当前 backend 扫描器不会自行检查病毒库年龄。

## 一、生产环境配置

### 1.1 生产部署结构

```text
backend
  └── Unix Socket / 受控内网 TCP
        └── clamd
              └── 病毒特征库
```

生产环境优先将 `clamd` 部署在独立扫描节点或与 backend 隔离的安全服务区。禁止把 `clamd` 的 3310 端口暴露到公网或普通业务网络；跨主机调用时必须通过防火墙、专用网段和来源地址白名单限制访问。

### 1.2 Linux 生产配置

建议使用专用系统用户、专用运行目录和 Unix Socket：

```env
# backend/.env.production
FILE_STORAGE_ROOT=/srv/internal-file-storage
FILE_UPLOAD_MAX_CHUNK_BYTES=67108864
CLAMAV_SOCKET_PATH=/run/clamav/clamd.ctl
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_MS=120000
```

`CLAMAV_SOCKET_PATH` 是 Socket 文件路径，不是 HTTP URL。只有扫描服务与 backend 不在同一台主机时，才配置受控扫描节点的 `CLAMAV_HOST` 和 `CLAMAV_PORT`，并清空 Socket 路径：

```env
CLAMAV_SOCKET_PATH=
CLAMAV_HOST=10.10.20.15
CLAMAV_PORT=3310
```

ClamAV 原生 TCP 协议不提供应用层认证和加密，因此跨主机 TCP 只允许在隔离网络中使用；高安全场景优先使用 Unix Socket 或在前面增加受控的 TLS/mTLS 扫描代理。

### 1.3 clamd.conf 关键配置

生产配置至少应确认以下内容，实际路径按发行版和部署目录调整：

```conf
DatabaseDirectory /var/lib/clamav
LocalSocket /run/clamav/clamd.ctl
LocalSocketMode 660
LocalSocketGroup clamav

# 生产环境不启用 TCP 时保持注释
#TCPSocket 3310
#TCPAddr 127.0.0.1

StreamMaxLength 64M
MaxScanSize 1000M
MaxFileSize 400M
MaxThreads 20
ReadTimeout 300
```

`LocalSocket` 只能保留一行。Socket 所属组必须允许 backend 进程读取，但不能设置为普通用户可写的目录或过宽权限。`StreamMaxLength` 必须覆盖 backend 允许的单文件扫描大小，同时结合并发、超时和磁盘配额限制资源消耗。

### 1.4 生产病毒库更新

生产扫描节点不直接访问公网，由专用更新节点下载，再通过内网镜像或受控介质发布。

| 阶段 | 操作顺序 |
| --- | --- |
| 首次部署 | 更新节点用 `freshclam` 下载完整病毒库 → 校验并同步到扫描节点的 `DatabaseDirectory` → 确认 `clamd` 可读 → 启动 `clamd` → 检查版本和连通性 |
| 后续更新 | 更新节点定时运行 `freshclam` 检查更新（通常增量下载，必要时下载完整库） → 校验并发布 → 通知扫描节点的 `clamd` 重新加载 → 确认加载的新版本 |

发布前校验完整性、签名并完成回归测试；记录版本、来源、更新时间和发布人，保留上一版用于回滚。同步时先写入暂存目录，完成校验后再切换，避免 `clamd` 加载尚未复制完整的数据库。

扫描节点更新完成后，通过本机 Socket 请求重新加载：

```bash
printf 'RELOAD\n' | nc -U -w 2 /run/clamav/clamd.ctl
printf 'VERSION\n' | nc -U -w 2 /run/clamav/clamd.ctl
```

`RELOAD` 只表示请求重新加载；等待加载完成后，用 `VERSION` 和服务日志核对已加载版本。`PONG` 只能证明服务可连接，不能证明病毒库最新。

运维需明确更新频率、新鲜度阈值和告警规则。更新失败应告警；超过新鲜度阈值时必须阻止新文件放行，不能依赖 `clamd` 自动拒绝旧病毒库。

### 1.5 生产健康检查

```bash
test -S /run/clamav/clamd.ctl && echo "clamd socket ready"
printf 'PING\n' | nc -U -w 2 /run/clamav/clamd.ctl
```

正常返回：

```text
PONG
```

健康检查还应确认：

- `clamd` 进程和扫描队列正常；
- 病毒库未过期；
- Socket 属主、属组和权限符合部署基线；
- backend 能够读取 Socket；
- 失败时不会将文件标记为 `READY`。

## 二、开发环境配置

### 2.1 Intel macOS + Homebrew

安装：

```bash
brew install clamav
```

复制配置模板：

```bash
mkdir -p /usr/local/var/run/clamav
mkdir -p /usr/local/var/lib/clamav
mkdir -p /usr/local/var/log/clamav

cp /usr/local/etc/clamav/clamd.conf.sample \
  /usr/local/etc/clamav/clamd.conf
cp /usr/local/etc/clamav/freshclam.conf.sample \
  /usr/local/etc/clamav/freshclam.conf

sed -i '' 's/^Example/#Example/' \
  /usr/local/etc/clamav/clamd.conf \
  /usr/local/etc/clamav/freshclam.conf
```

修改 `clamd.conf`，必须只保留一行 `LocalSocket`：

```conf
DatabaseDirectory /usr/local/var/lib/clamav
LocalSocket /usr/local/var/run/clamav/clamd.sock
LocalSocketGroup admin
LocalSocketMode 660
```

不要同时保留 `/run/clamav/clamd.sock`、`/tmp/clamd.sock` 等其他 `LocalSocket` 配置。Socket 目录需允许 `clamd` 运行账号写入，backend 账号需属于 `LocalSocketGroup` 指定的组。

#### 首次下载（安装后执行一次）

先编辑 `/usr/local/etc/clamav/freshclam.conf`，确保以下配置各保留一行，且 `Example` 已注释：

```conf
DatabaseDirectory /usr/local/var/lib/clamav
DatabaseMirror database.clamav.net
```

两个配置文件的 `DatabaseDirectory` 必须一致。确认 `freshclam` 运行账号可写、`clamd` 运行账号可读；遇到权限错误时检查目录属主及 `freshclam.conf` 的 `DatabaseOwner`。

下载病毒库（需要访问更新源，首次下载可能耗时较长）：

```bash
/usr/local/opt/clamav/bin/freshclam \
  --config-file=/usr/local/etc/clamav/freshclam.conf
```

确认命令成功退出，目录中已有 `main`、`daily`、`bytecode` 等数据库文件（扩展名可能为 `.cvd` 或 `.cld`），再启动并验证：

```bash
sudo brew services restart clamav
test -S /usr/local/var/run/clamav/clamd.sock \
  && echo "clamd socket ready" \
  || echo "clamd socket not ready"
printf 'PING\n' | nc -U -w 2 /usr/local/var/run/clamav/clamd.sock
```

正常返回 `PONG`。上述示例用 root 启动扫描服务；不要使用 `sudo brew install`。如果按此方式启动，应使用同样的 `sudo brew services` 命令管理服务。

#### 后续更新（重复执行）

手动更新使用同一条 `freshclam` 命令；已有病毒库时会检查版本，无更新则无需下载。下载成功后请求 `clamd` 重新加载：

```bash
/usr/local/opt/clamav/bin/freshclam \
  --config-file=/usr/local/etc/clamav/freshclam.conf \
  && printf 'RELOAD\n' | nc -U -w 2 /usr/local/var/run/clamav/clamd.sock
```

等待加载完成后核对版本和病毒库日期：

```bash
printf 'VERSION\n' | nc -U -w 2 /usr/local/var/run/clamav/clamd.sock
```

需要自动更新时，在 `freshclam.conf` 中增加：

```conf
Checks 12
NotifyClamd /usr/local/etc/clamav/clamd.conf
```

再启动更新进程：

```bash
/usr/local/opt/clamav/bin/freshclam \
  --daemon --foreground \
  --config-file=/usr/local/etc/clamav/freshclam.conf
```

此命令持续运行，每天检查 12 次；下载新库后通过 `NotifyClamd` 通知扫描服务加载。更新账号需有 Socket 访问权限。关闭终端会停止该前台进程；需要持续运行时用 launchd 托管。仅写入 `Checks` 不会启动定时更新，也不要同时运行多个 `freshclam` 进程。

遇到 HTTP 429/403 时检查日志并遵守更新源的冷却时间，避免反复重试。

#### backend 配置

```env
# backend/.env
CLAMAV_SOCKET_PATH=/usr/local/var/run/clamav/clamd.sock
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_MS=120000
```

### 2.2 Apple Silicon macOS + Homebrew

Apple Silicon 的 Homebrew 前缀通常为 `/opt/homebrew`。不要直接复制 Intel 路径，应使用：

```bash
brew --prefix
brew --prefix clamav
```

然后将上文所有 `/usr/local` 替换为实际前缀，并以 `clamd.conf` 中的 `LocalSocket` 为准。例如：

```env
CLAMAV_SOCKET_PATH=/opt/homebrew/var/run/clamav/clamd.sock
```

### 2.3 开发环境故障排查

查看服务状态：

```bash
brew services info clamav
```

`Running: ✔` 只表示服务进程被 launchd 注册或存活，不代表 Socket 已可用。必须同时通过 `test -S` 和 `PING/PONG` 检查。

如果服务运行但没有 Socket，按顺序检查：

```bash
grep -nE '^(Example|DatabaseDirectory|LocalSocket|LocalSocketGroup|LocalSocketMode|TCPSocket|TCPAddr)' \
  /usr/local/etc/clamav/clamd.conf
ls -ld /usr/local/var/run/clamav
ls -la /usr/local/var/lib/clamav
sudo brew services restart clamav
```

重点确认：

- `clamd.conf` 中不存在重复的 `LocalSocket`；
- `Example` 已注释；
- 病毒库目录中存在 `main`、`daily` 等数据库文件（`.cvd` 或 `.cld`）；
- Socket 父目录存在且 clamd 运行账号有写权限；
- backend 的 `CLAMAV_SOCKET_PATH` 与配置文件完全一致。

如果需要前台查看启动错误：

```bash
sudo brew services stop clamav
sudo /usr/local/opt/clamav/sbin/clamd \
  --foreground \
  --config-file=/usr/local/etc/clamav/clamd.conf
```

前台调试完成后使用 `Ctrl-C` 退出，再执行：

```bash
sudo brew services start clamav
```

## 三、backend 扫描结果约定

| clamd 结果 | 文件状态 | 业务处理 |
| --- | --- | --- |
| `stream: OK` | `READY / CLEAN` | 允许按权限读取或下载 |
| `stream: ... FOUND` | `REJECTED / INFECTED` | 禁止业务读取并记录病毒名 |
| 超时、连接失败、协议异常、病毒库不可用 | `QUARANTINED / ERROR` | 禁止放行并告警 |

backend 使用 `INSTREAM` 流式传输，不把完整文件一次性加载到应用内存。任何扫描失败都不能当作扫描通过。

参考：

- [ClamAV 官方文档](https://docs.clamav.net/)
- [freshclam 配置与更新](https://docs.clamav.net/manual/Usage/Configuration.html)
- [freshclam.conf 配置项](https://github.com/Cisco-Talos/clamav/blob/main/docs/man/freshclam.conf.5.in)
- [Clamd Protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
- [Homebrew Installation](https://docs.brew.sh/Installation)




### 文件详情中的版本字段

扫描前通过相同的 clamd 地址或 Unix Socket 执行 `zVERSION\0`，从响应中提取实际引擎版本，写入 `scanEngineVersion`（例如 `ClamAV 1.4.3`）。每次扫描重新获取，不缓存旧版本；该字段不是病毒库版本。需在 clamd 中启用 VERSION 命令（支持该开关的版本使用 `EnableVersionCommand yes`）。版本查询失败、被禁用或返回不合法时，扫描按异常处理并保留隔离状态，不写入假的版本号。

`policyVersion` 来自代码中的 `FILE_SCAN_POLICY.version`，当前为 `clamav-instream-v1`。该版本对应 INSTREAM 流式传输、最大 1 MiB 分块、仅明确的 `stream: OK` 判为通过、`stream: <签名> FOUND` 判为感染、其他结果保持隔离的规则。修改传输或判定规则时必须递增版本，不以引擎或病毒库版本替代。

重新扫描入队时清空旧的引擎及策略版本。本次扫描结果写回时保存实际使用的版本，扫描异常也保存已获取的版本。已有文件的历史版本不会自动补写；须重新扫描后才能得到真实值。
