# backend 配置说明

backend 从工作目录的 `.env` 读取配置。开发环境建议在 `backend/` 目录执行 `pnpm dev`，或使用根目录脚本 `pnpm dev:backend`；生产环境建议先构建，再使用 `node dist/main.js`，并通过进程管理器注入环境变量。

本文档是环境变量总表。数据库操作、ClamAV 部署和文件安全状态分别以 [DATABASE_OPERATIONS.md](DATABASE_OPERATIONS.md)、[CLAMAV_CONFIGURATION.md](CLAMAV_CONFIGURATION.md) 和 [FILE_SECURITY.md](FILE_SECURITY.md) 为准；本文件不复制这些运行手册。

## 初始化

```bash
nvm use
cp backend/.env.example backend/.env
# 修改 DATABASE_URL、CAPTCHA_SERVICE_SECRET 和种子账号密码
pnpm --filter backend db:generate
pnpm --filter backend db:migrate --name init
pnpm --filter backend db:seed
```

backend 默认监听 `0.0.0.0:3000`，接口前缀为 `/api/v1`。

## 参数

| 参数 | 示例/默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`、`test` 或 `production`。 |
| `ENABLE_HTTPS` | `false` | 是否强制外部请求使用 HTTPS；生产环境必须为 `true`。 |
| `ENABLE_CSP` | `false` | 是否启用 Helmet CSP；生产环境必须为 `true`。 |
| `TRUST_PROXY` | `false` | 是否信任反向代理；生产环境必须为 `true`，用于校验代理转发的 HTTPS 协议。 |
| `PORT` | `3000` | backend HTTP 端口。 |
| `DATABASE_URL` | `mysql://...` | MySQL 连接串，必填。 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | backend 缓存、会话、限流使用的 Redis。 |
| `REDIS_ENABLED` | `true` | 是否启用 Redis；生产环境必须启用。 |
| `COOKIE_SECURE` | `false` | HTTPS 部署时设为 `true`。 |
| `COOKIE_DOMAIN` | 空 | 会话 Cookie 的有效域名。仅当前后端需要跨子域共享 Cookie 时配置，例如 `.example.com`；同域部署时建议留空。 |
| `CSRF_ALLOWED_ORIGINS` | `http://localhost:5173` | 允许发起 Cookie 认证请求的前端 Origin，多个值用逗号分隔；生产环境必填。与 `COOKIE_DOMAIN` 作用不同，不要互相替代。 |
| `PUBLIC_HTTPS_ORIGIN` | 空 | 生产环境必填的公开 HTTPS Origin，例如 `https://admin.example.com`，不包含路径。 |
| `SESSION_TTL_SECONDS` | `28800` | 会话绝对有效期，默认 8 小时，范围 300–86400 秒；同时决定正式登录 Cookie 的默认 `maxAge`。 |
| `SESSION_IDLE_TTL_SECONDS` | `1800` | 会话空闲有效期，范围 300–86400 秒。 |
| `PREAUTH_TTL_SECONDS` | `300` | MFA 完成前的 PRE_AUTH 临时会话有效期，范围 60–900 秒。 |
| `TENANCY_MODE` | `SINGLE` | 部署级租户模式，仅允许 `SINGLE` 或 `MULTI`；变更必须经过审批、备份、演练和受控发布。 |
| `DEFAULT_TENANT_CODE` / `DEFAULT_TENANT_NAME` | `default-tenant` / `默认租户` | 单租户模式的唯一租户标识和名称；不能用空值表示公共数据。 |
| `DEFAULT_ORGANIZATION_CODE` / `DEFAULT_ORGANIZATION_NAME` | `default-organization` / `默认组织` | seed 初始化的默认业务组织；必须显式配置，组织归属于默认租户。 |
| `DEFAULT_DEPARTMENT_CODE` / `DEFAULT_DEPARTMENT_NAME` | `default-department` / `默认部门` | seed 初始化的默认业务部门；必须显式配置，部门归属于默认组织和默认租户。 |
| `SESSION_MAX_CONCURRENT` | `3` | 单个用户允许同时存在的最大会话数，范围 1–100；超出时撤销最早的会话。 |
| `API_RATE_LIMIT` | `120` | 单接口/IP 的请求次数。 |
| `API_RATE_WINDOW_SECONDS` | `60` | backend 全局限流窗口。 |
| `LOGIN_FAILURE_LIMIT` | `5` | 触发账号登录锁定的失败次数。 |
| `LOGIN_LOCK_MINUTES` | `15` | 账号锁定时长。 |
| `LOGIN_RATE_LIMIT` | `10` | 登录接口限流次数。 |
| `LOGIN_RATE_WINDOW_SECONDS` | `60` | 登录限流窗口。 |
| `CAPTCHA_RATE_WINDOW_SECONDS` | `60` | 行为验证码公开接口独立限流窗口。 |
| `CAPTCHA_CHALLENGE_RATE_LIMIT` | `10` | 单 IP/账号创建挑战次数上限。 |
| `CAPTCHA_VERIFY_RATE_LIMIT` | `30` | 单 IP/挑战校验次数上限。 |
| `CAPTCHA_CHALLENGE_TTL` | `120` | backend 保存行为验证码挑战的有效期，单位为秒。 |
| `IDEMPOTENCY_LOCK_SECONDS` | `15` | 幂等请求锁定时长。 |
| `LOGIN_CAPTCHA_FAILURE_LIMIT` | `3` | 达到连续失败次数后要求验证码。 |
| `CAPTCHA_SERVICE_URL` | `http://127.0.0.1:3100` | captcha-service 内网地址。 |
| `CAPTCHA_SERVICE_ID` | `backend-admin` | 与 captcha-service 绑定的调用方 ID。 |
| `CAPTCHA_SERVICE_SECRET` | 随机密钥 | HMAC-SHA256 密钥，必须与 captcha-service 完全一致。禁止提交到 Git。 |
| `CAPTCHA_LOG_HASH_SECRET` | 随机密钥 | 验证码审计日志脱敏哈希密钥，必须与 captcha-service 使用同一组独立密钥；生产环境至少 32 位，禁止与 `CAPTCHA_SERVICE_SECRET` 复用或提交到 Git。 |
| `CAPTCHA_SERVICE_TIMEOUT_MS` | `2000` | backend 调用 captcha-service 的超时时间。 |
| `LOG_LEVEL` | `info` | 日志级别。 |
| `SEED_SECURITY_USERNAME` / `SEED_SECURITY_PASSWORD` | `security-admin` / 无默认生产密码 | 数据库 seed 创建的第一名初始安全管理员账号及密码，至少 12 位。 |
| `SEED_SECURITY_USERNAME_2` / `SEED_SECURITY_PASSWORD_2` | `security-admin-2` / 无默认生产密码 | 数据库 seed 创建的第二名初始安全管理员账号及密码，必须与第一名独立；至少 12 位。用于形成独立审批链。 |
| `SEED_SYSTEM_USERNAME` / `SEED_SYSTEM_PASSWORD` | 必填 | 数据库 seed 创建的初始系统管理员账号及密码，至少 12 位。 |
| `SEED_AUDIT_USERNAME` / `SEED_AUDIT_PASSWORD` | 必填 | 数据库 seed 创建的初始审计管理员账号及密码，至少 12 位。 |
| `MFA_ENCRYPTION_KEY` | 空 | MFA 密钥加密用的 AES-256-GCM 密钥，必须是 32 字节随机值的 Base64；生产环境必须配置并持久化。 |
| `SWAGGER_ENABLED` | `true` | 是否启用 backend Swagger 文档；设为 `false` 时 `/docs` 和 `/docs-json` 返回 404。 |
| `SWAGGER_ADMIN_USERNAME` / `SWAGGER_ADMIN_PASSWORD` | `swagger-admin` / 无默认生产密码 | Swagger 文档 Basic Auth 凭据；生产环境密码至少 12 位且不得使用默认值。 |
| `OPS_EXECUTION_SIGNING_SECRET` | 空 | 受控应急执行代理的 HMAC-SHA256 签名密钥，至少 32 个字符；仅在启用应急执行回写时配置。可使用 `openssl rand -hex 32` 生成 64 位密钥，且不得提交到 Git。 |
| `AUDIT_INTEGRITY_SECRET` | 必填 | 审计日志 HMAC-SHA256 密钥，至少 32 个字符；必须由服务端保管，禁止写入数据库或提交到 Git。更换密钥前需执行受控密钥轮换；开发环境更换密钥后清空旧审计日志。 |
| `FILE_STORAGE_ROOT` | `.data/uploads` | 本地文件存储根目录。生产环境必须指向内网专用文件盘，不能放在前端静态目录、Git 目录或 Web 可直接访问目录。使用对象存储时由对应存储适配器接管。 |
| `FILE_UPLOAD_MAX_CHUNK_BYTES` | `67108864` | 单个上传分片请求的最大字节数，当前上限为 64 MiB；前端分片大小不得超过此值。 |
| `CLAMAV_SOCKET_PATH` | `/run/clamav/clamd.ctl` | ClamAV `clamd` 的 Unix Socket 路径，生产环境首选。该值是本地文件路径，不是 HTTP URL；Socket 不可用时文件不得进入 `READY`。 |
| `CLAMAV_HOST` | `127.0.0.1` | 仅在不使用 Unix Socket 或使用受控内网扫描节点时生效。禁止配置为公网地址。 |
| `CLAMAV_PORT` | `3310` | `clamd` 原生 TCP 端口。仅允许在受控扫描网络中使用，必须配合防火墙限制来源，不能直接暴露到普通业务网络。 |
| `CLAMAV_TIMEOUT_MS` | `120000` | 单个文件调用 `clamd` 的最大扫描时间，单位为毫秒；超时进入隔离/错误状态，不得降级放行。 |

验证码审计事件会写入 backend 的 `sys_audit_log`，使用现有审计日志页面查询。事件操作码包括：

```text
captcha.challenge.created
captcha.verify.success
captcha.verify.failed
captcha.token.consumed
captcha.rate_limited
captcha.service_auth_failed
captcha.redis_unavailable
captcha.protocol_rejected
```

审计详情只保存脱敏后的 `traceId`、`requestId`、`attemptId`、账号标识和来源 IP，以及场景、结果、失败原因、耗时和依赖状态；不得记录 `ServiceSecret`、HMAC 签名、`CaptchaToken`、验证码答案、完整滑动轨迹、Redis Key 或完整 User-Agent。

会话默认策略为：绝对有效期 8 小时、闲置有效期 30 分钟、MFA 完成前的临时会话有效期 5 分钟。活动请求会更新服务端闲置时间，但不得突破绝对有效期；绝对过期前 5 分钟前端允许用户通过账号安全认证受控续签。

## 与 captcha-service 的对应关系

以下三项必须对应：

```env
# backend/.env
CAPTCHA_SERVICE_ID=backend-admin
CAPTCHA_SERVICE_SECRET=同一组随机密钥
CAPTCHA_SERVICE_URL=http://127.0.0.1:3100
CAPTCHA_LOG_HASH_SECRET=同一组独立的日志哈希密钥

# captcha-service/.env
CAPTCHA_SERVICE_ID=backend-admin
CAPTCHA_SERVICE_SECRET=同一组随机密钥
CAPTCHA_LOG_HASH_SECRET=同一组独立的日志哈希密钥
```

backend 不需要配置 `CAPTCHA_PREFIX`。Prefix 由 captcha-service 的服务端绑定配置决定，仅用于服务端状态隔离；不下发浏览器，也不需要注入前端 `CaptchaConfig`。

## 密钥配置与本地生成

所有密钥都应在部署环境本地生成，不要使用示例值、固定字符串、在线随机数网站或提交到 Git。不同用途必须使用不同密钥；只有 `CAPTCHA_SERVICE_SECRET` 和 `CAPTCHA_LOG_HASH_SECRET` 需要分别在 backend 与 captcha-service 配置为相同值。

### 生成命令

macOS、Linux 和 WSL 均可使用以下命令。`openssl rand -hex 32` 会生成 32 字节随机值并编码为 64 个十六进制字符，适用于 HMAC 和签名密钥：

```bash
# 验证码服务调用密钥：backend 与 captcha-service 配置同一值
openssl rand -hex 32

# 验证码审计日志哈希密钥：backend 与 captcha-service 配置同一值
openssl rand -hex 32

# 审计完整性密钥：仅 backend 使用
openssl rand -hex 32

# 应急执行签名密钥：仅 backend 使用
openssl rand -hex 32

# MFA 加密密钥：必须是原始 32 字节再进行 Base64 编码
openssl rand 32 | base64 | tr -d '\n'; echo

# 初始管理员、Swagger 等密码：每项单独生成，不要复用
openssl rand -base64 24
```

生成命令与配置项的对应关系见下表：

| 配置项 | 生成方式 | 写入位置 |
| --- | --- | --- |
| CAPTCHA_SERVICE_SECRET | openssl rand -hex 32 | backend 与 captcha-service 使用同一个值 |
| CAPTCHA_LOG_HASH_SECRET | openssl rand -hex 32 | backend 与 captcha-service 使用同一个值，但不能与调用密钥复用 |
| AUDIT_INTEGRITY_SECRET | openssl rand -hex 32 | 仅 backend |
| OPS_EXECUTION_SIGNING_SECRET | openssl rand -hex 32 | 仅 backend |
| MFA_ENCRYPTION_KEY | `openssl rand 32` 后执行 `base64`，再去掉换行 | 仅 backend，Base64 解码后必须为 32 字节 |
| SEED_SECURITY_PASSWORD | openssl rand -base64 24 | 仅 backend，seed 初始安全管理员 |
| SEED_SECURITY_PASSWORD_2 | 重新执行 openssl rand -base64 24 | 仅 backend，必须独立于第一名管理员 |
| SEED_SYSTEM_PASSWORD | 重新执行 openssl rand -base64 24 | 仅 backend，seed 初始系统管理员 |
| SEED_AUDIT_PASSWORD | 重新执行 openssl rand -base64 24 | 仅 backend，seed 初始审计管理员 |
| SWAGGER_ADMIN_PASSWORD | 重新执行 openssl rand -base64 24 | 仅 backend，Swagger Basic Auth |

生成的每个值必须独立；只有 CAPTCHA_SERVICE_SECRET 和 CAPTCHA_LOG_HASH_SECRET 分别同步到 captcha-service。生成命令不会自动修改 `.env`，需要将输出复制到对应配置项。

项目提供了自动填充脚本，可直接按环境更新 backend 和 captcha-service 的配置文件：

```bash
# 开发环境：backend/.env、captcha-service/.env
bash backend/scripts/generate-secrets.sh development

# 生产环境：backend/.env.production、captcha-service/.env.production
bash backend/scripts/generate-secrets.sh production
```

脚本默认只填充空值和示例占位值，已有有效密钥不会被覆盖。确认需要轮换已有密钥时，显式使用 `--force`：

```bash
bash backend/scripts/generate-secrets.sh production --force
```

`--force` 会同时轮换所有受管密钥和 seed/Swagger 初始密码；执行后必须重启 backend、captcha-service，重新执行相关密钥轮换和初始账号交接记录。脚本不会修改数据库连接、Redis、ClamAV、端口或其他非密钥配置。

### 首次安装后配置（开发环境）

首次安装完成后，按以下顺序执行。命令应在项目根目录执行；脚本会更新 `backend/.env` 和 `captcha-service/.env`，不会修改数据库、Redis 或 ClamAV 配置。

```bash
# 1. 检查 Node 环境并安装依赖
nvm use
pnpm install

# 2. 从示例配置创建本地配置文件（文件已存在时不要覆盖）
test -f backend/.env || cp backend/.env.example backend/.env
test -f captcha-service/.env || cp captcha-service/.env.example captcha-service/.env

# 3. 生成并填充开发环境密钥
bash backend/scripts/generate-secrets.sh development

# 4. 启动 MySQL 和 Redis 后，生成 Prisma Client、执行迁移和初始化数据
pnpm --filter backend db:generate
pnpm --filter backend db:migrate
pnpm --filter backend db:seed

# 5. 启动 ClamAV（如果使用本地病毒扫描）
brew services restart clamav
test -S /usr/local/var/run/clamav/clamd.sock && echo "clamd socket ready"
printf 'PING\n' | nc -U -w 2 /usr/local/var/run/clamav/clamd.sock

# 6. 启动服务
pnpm dev:captcha
pnpm dev:backend
pnpm dev:frontend
```

开发环境启动前必须确认：

- `backend/.env` 与 `captcha-service/.env` 中的 `CAPTCHA_SERVICE_SECRET` 完全相同；
- `CAPTCHA_LOG_HASH_SECRET` 两边完全相同，但不能与 `CAPTCHA_SERVICE_SECRET` 相同；
- `AUDIT_INTEGRITY_SECRET`、`OPS_EXECUTION_SIGNING_SECRET`、`MFA_ENCRYPTION_KEY` 已配置；
- `SEED_SECURITY_PASSWORD`、`SEED_SECURITY_PASSWORD_2`、`SEED_SYSTEM_PASSWORD`、`SEED_AUDIT_PASSWORD` 均已配置；
- `CLAMAV_SOCKET_PATH` 与实际 `clamd` Socket 路径一致；
- 数据库迁移和 `db:seed` 均执行成功。

首次初始化成功后，使用 seed 创建的账号登录，并立即修改初始密码、绑定 MFA。不要把开发环境 `.env` 提交到 Git。

### 生产环境配置流程

生产环境不得直接复制开发环境 `.env`，也不得使用仓库中的默认账号密码。建议由部署人员在密钥管理系统中生成密钥，然后以环境变量、受保护的 Secret 文件或容器 Secret 注入；脚本仅适合在受控部署主机上生成初始值。

```bash
# 1. 在发布主机准备生产配置文件
test -f backend/.env.production || cp backend/.env.example backend/.env.production
test -f captcha-service/.env.production || cp captcha-service/.env.example captcha-service/.env.production

# 2. 生成生产密钥
# 仅在受控主机且确认需要本地生成时执行
bash backend/scripts/generate-secrets.sh production

# 3. 检查生产关键开关和内网地址
grep -E '^(NODE_ENV|ENABLE_HTTPS|ENABLE_CSP|TRUST_PROXY|COOKIE_SECURE|CSRF_ALLOWED_ORIGINS|PUBLIC_HTTPS_ORIGIN|REDIS_ENABLED|FILE_STORAGE_ROOT|CLAMAV_)' \\
  backend/.env.production

# 4. 部署数据库结构；生产环境使用 deploy，不使用 migrate dev
pnpm --filter backend db:generate
pnpm --filter backend db:deploy
pnpm --filter backend db:seed

# 5. 在扫描节点检查 clamd 健康状态
test -S /run/clamav/clamd.ctl && echo "clamd socket ready"
printf 'PING\n' | nc -U -w 2 /run/clamav/clamd.ctl

# 6. 重启 backend、captcha-service 和网关/进程管理器
```

生产环境必须满足：

- `NODE_ENV=production`、`ENABLE_HTTPS=true`、`ENABLE_CSP=true`、`COOKIE_SECURE=true`；
- `CSRF_ALLOWED_ORIGINS` 和 `PUBLIC_HTTPS_ORIGIN` 使用正式 HTTPS 地址；
- backend 与 captcha-service 的两个验证码密钥分别保持一致；
- `AUDIT_INTEGRITY_SECRET`、`MFA_ENCRYPTION_KEY` 等独立密钥不得复用，且不得出现在日志和代码仓库；
- `FILE_STORAGE_ROOT` 指向内网专用文件存储目录，不能位于 Web 静态目录；
- `CLAMAV_SOCKET_PATH` 指向生产扫描节点实际 Socket，病毒库过期或 clamd 不可用时不得放行文件；
- 迁移、seed、密钥注入、病毒库更新和服务重启均写入发布记录；
- 初始账号密码通过独立渠道交付，首次登录后立即修改并绑定 MFA。

生产密钥轮换使用 `--force` 前必须确认已有 MFA、审计链和服务间密钥的兼容迁移方案。轮换完成后应重启所有相关服务、验证登录/验证码/审计/文件扫描流程，并保留受控回滚材料。

```bash
umask 077
openssl rand -hex 32 > /tmp/backend-secret-audit-integrity
openssl rand -hex 32 > /tmp/backend-secret-ops-signing
openssl rand 32 | base64 | tr -d '\n' > /tmp/backend-secret-mfa-encryption
chmod 600 /tmp/backend-secret-audit-integrity /tmp/backend-secret-ops-signing /tmp/backend-secret-mfa-encryption
```

不要把上述 `/tmp` 文件、生成结果、`.env` 或生产环境文件提交到 Git；完成导入密钥管理系统后应安全删除临时文件。生产环境应优先使用 KMS、HSM、Vault 或容器平台 Secret 注入，而不是把明文密钥长期保存在磁盘上。

### `.env` 配置示例

以下示例中的值必须替换为刚刚生成的随机值：

```env
# 与 captcha-service 使用相同值，但与其他密钥不同
CAPTCHA_SERVICE_SECRET=<openssl-rand-hex-32>
CAPTCHA_LOG_HASH_SECRET=<another-openssl-rand-hex-32>

# backend 独立密钥
AUDIT_INTEGRITY_SECRET=<another-openssl-rand-hex-32>
OPS_EXECUTION_SIGNING_SECRET=<another-openssl-rand-hex-32>
MFA_ENCRYPTION_KEY=<base64-encoded-32-bytes>

# 每个账号使用独立的强密码，至少 12 位
SEED_SECURITY_PASSWORD=<独立随机密码>
SEED_SECURITY_PASSWORD_2=<另一组独立随机密码>
SEED_SYSTEM_PASSWORD=<独立随机密码>
SEED_AUDIT_PASSWORD=<独立随机密码>
SWAGGER_ADMIN_PASSWORD=<独立随机密码>
```

`MFA_ENCRYPTION_KEY` 必须是 Base64 解码后恰好 32 字节的值；修改后原有 MFA 密钥可能无法解密，因此必须先执行密钥轮换方案并保留受控回滚材料。`AUDIT_INTEGRITY_SECRET` 修改后会影响审计链校验，必须按审计密钥轮换流程执行。密码首次登录后应立即修改，初始密码不得在日志、工单、截图或聊天中传播。

## 文件存储与 ClamAV 配置

ClamAV 已独立整理为生产环境和开发环境两部分，请参阅：[CLAMAV_CONFIGURATION.md](./CLAMAV_CONFIGURATION.md)。

文件模块采用“先隔离、后扫描、扫描通过后可读”的流程。`CLAMAV_SOCKET_PATH` 必须指向实际 `clamd` Socket；扫描服务不可用时，文件不得进入 `READY`。

## Cookie 与 CSRF 配置示例

前后端同域时，建议不设置 `COOKIE_DOMAIN`，只配置前端 Origin：

```env
COOKIE_DOMAIN=
CSRF_ALLOWED_ORIGINS=https://example.com
COOKIE_SECURE=true
```

前后端使用不同子域时，才配置共享 Cookie 域：

```env
# 前端：https://app.example.com
# 后端：https://api.example.com
COOKIE_DOMAIN=.example.com
CSRF_ALLOWED_ORIGINS=https://app.example.com
COOKIE_SECURE=true
```

`COOKIE_DOMAIN` 控制浏览器向哪些域名发送会话 Cookie；`CSRF_ALLOWED_ORIGINS` 控制哪些网页来源可以发起 Cookie 认证的状态变更请求。`CSRF_ALLOWED_ORIGINS` 必须填写完整 Origin，不包含路径，不使用 `*`。

## 生产注意事项

- 不要把 `.env` 提交到代码仓库或复制到前端项目。
- `DATABASE_URL`、`REDIS_URL`、`CAPTCHA_SERVICE_SECRET` 应通过密钥管理系统或受保护的环境文件注入。
- `CAPTCHA_LOG_HASH_SECRET` 必须通过密钥管理系统或受保护的环境文件注入，backend 与 captcha-service 保持一致，但不得与 `CAPTCHA_SERVICE_SECRET` 共用。
- 生产环境必须设置 `COOKIE_SECURE=true`、`CSRF_ALLOWED_ORIGINS`，并通过 HTTPS 对外提供服务。
- backend 可以监听公网或网关网络，但 captcha-service 和 Redis 不应暴露公网。
- 修改验证码凭证后必须同时重启 backend 和 captcha-service。
- 验证码和审计日志应集中留存不少于六个月，并配置防篡改、定期备份、审计只读权限、独立导出权限、统一时间同步及异常告警。

## Swagger 文档

backend Swagger 地址为 `/docs`，JSON 文档地址为 `/docs-json`。文档路由使用独立的 Basic Auth 保护：

```env
SWAGGER_ENABLED=true
SWAGGER_ADMIN_USERNAME=swagger-admin
SWAGGER_ADMIN_PASSWORD=至少 12 位的密码
```

- `SWAGGER_ENABLED=false` 时，`/docs` 和 `/docs-json` 返回 404。
- `SWAGGER_ADMIN_USERNAME` 和 `SWAGGER_ADMIN_PASSWORD` 只用于访问 Swagger 文档，不是业务登录账号。
- 生产环境必须配置非默认的至少 12 位密码。
- Swagger 中的接口调用仍使用 backend 原有的 Cookie 会话和 CSRF 认证，不会使用 Swagger 管理员密码作为业务凭据。
