# ClamAV 内网病毒扫描配置

本文档只负责 `clamd` 的部署、权限、连通性、超时和故障排查。文件状态机、下载控制和业务接口以 [FILE_SECURITY.md](FILE_SECURITY.md) 为准，环境变量总表以 [CONFIGURATION.md](CONFIGURATION.md) 为准。

本文档是 backend 文件模块的 ClamAV 独立配置文档。系统使用常驻扫描服务 `clamd`，backend 通过 Unix Socket 优先、受控内网 TCP 备用的方式调用 `INSTREAM` 协议。

安全原则：文件完成分片合并后先进入隔离区，只有 ClamAV 返回 `OK` 才能进入 `READY/CLEAN`。扫描超时、Socket 不可用、病毒库过期或服务异常都必须进入 `QUARANTINED/ERROR`，不能降级放行。

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

生产区不能依赖运行时访问公网更新病毒库。建议采用以下流程：

1. 由专用更新节点取得病毒库；
2. 校验下载完整性和病毒库签名；
3. 在隔离环境完成恶意样本回归测试；
4. 经审批后通过内网镜像或受控介质同步到扫描节点；
5. 记录病毒库版本、更新时间、来源、校验结果和发布人；
6. 更新失败或病毒库超过新鲜度阈值时停止放行新文件并告警。

病毒库更新、ClamAV 引擎升级和规则变更必须纳入变更管理，并保留上一个可回滚版本。

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

不要同时保留 `/run/clamav/clamd.sock`、`/tmp/clamd.sock` 等其他 `LocalSocket` 配置。Homebrew 的 ClamAV 服务需要 root 方式启动时，使用：

```bash
sudo brew services restart clamav
```

如果运行目录由 root 创建，确认当前用户或 backend 服务账号属于 `LocalSocketGroup` 指定的组。不要使用 `sudo brew install`；root 只用于启动需要 root 的系统服务。Homebrew 服务启动后可能提示路径被改为 `root:admin`，这表示后续升级或卸载可能需要 sudo。

首次更新病毒库：

```bash
sed -i '' \
  -e 's|^#DatabaseDirectory .*|DatabaseDirectory /usr/local/var/lib/clamav|' \
  /usr/local/etc/clamav/freshclam.conf

/usr/local/opt/clamav/bin/freshclam \
  --config-file=/usr/local/etc/clamav/freshclam.conf
```

启动并验证：

```bash
sudo brew services restart clamav
test -S /usr/local/var/run/clamav/clamd.sock \
  && echo "clamd socket ready" \
  || echo "clamd socket not ready"
printf 'PING\n' | nc -U -w 2 /usr/local/var/run/clamav/clamd.sock
```

backend 开发环境配置：

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
- 病毒库目录中存在 `main.cvd`、`daily.cvd` 等数据库文件；
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
- [Clamd Protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)
- [Homebrew Installation](https://docs.brew.sh/Installation)


