# backend 配置说明

backend 从工作目录的 `.env` 读取配置。开发环境建议在 `backend/` 目录执行 `pnpm dev`，或使用根目录脚本 `pnpm dev:backend`；生产环境建议先构建，再使用 `node dist/main.js`，并通过进程管理器注入环境变量。

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
| `PORT` | `3000` | backend HTTP 端口。 |
| `DATABASE_URL` | `mysql://...` | MySQL 连接串，必填。 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | backend 缓存、会话、限流使用的 Redis。 |
| `REDIS_ENABLED` | `true` | 是否启用 Redis；生产环境必须启用。 |
| `SESSION_TTL_SECONDS` | `1800` | 会话绝对有效期，范围 300–86400 秒。 |
| `SESSION_IDLE_TTL_SECONDS` | `1800` | 会话空闲有效期，范围 300–86400 秒。 |
| `PREAUTH_TTL_SECONDS` | `300` | MFA 完成前的 PRE_AUTH 临时会话有效期，范围 60–900 秒。 |
| `API_RATE_LIMIT` | `120` | 单接口/IP 的请求次数。 |
| `API_RATE_WINDOW_SECONDS` | `60` | backend 全局限流窗口。 |
| `LOGIN_FAILURE_LIMIT` | `5` | 触发账号登录锁定的失败次数。 |
| `LOGIN_LOCK_MINUTES` | `15` | 账号锁定时长。 |
| `LOGIN_RATE_LIMIT` | `10` | 登录接口限流次数。 |
| `LOGIN_RATE_WINDOW_SECONDS` | `60` | 登录限流窗口。 |
| `CAPTCHA_RATE_WINDOW_SECONDS` | `60` | 行为验证码公开接口独立限流窗口。 |
| `CAPTCHA_CHALLENGE_RATE_LIMIT` | `10` | 单 IP/账号创建挑战次数上限。 |
| `CAPTCHA_VERIFY_RATE_LIMIT` | `30` | 单 IP/挑战校验次数上限。 |
| `CAPTCHA_EVENT_RATE_LIMIT` | `120` | 单 IP 事件上报次数上限。 |
| `LOGIN_CAPTCHA_FAILURE_LIMIT` | `3` | 达到连续失败次数后要求验证码。 |
| `IDEMPOTENCY_LOCK_SECONDS` | `15` | 幂等请求锁定时长。 |
| `CAPTCHA_SERVICE_URL` | `http://127.0.0.1:3100` | captcha-service 内网地址。 |
| `CAPTCHA_SERVICE_ID` | `backend-admin` | 与 captcha-service 绑定的调用方 ID。 |
| `CAPTCHA_SERVICE_SECRET` | 随机密钥 | HMAC-SHA1 密钥，必须与 captcha-service 完全一致。禁止提交到 Git。 |
| `CAPTCHA_SERVICE_TIMEOUT_MS` | `2000` | backend 调用 captcha-service 的超时时间。 |
| `COOKIE_SECURE` | `false` | HTTPS 部署时设为 `true`。 |
| `COOKIE_DOMAIN` | 空 | 会话 Cookie 的有效域名。仅当前后端需要跨子域共享 Cookie 时配置，例如 `.example.com`；同域部署时建议留空。 |
| `CSRF_ALLOWED_ORIGINS` | `http://localhost:5173` | 允许发起 Cookie 认证请求的前端 Origin，多个值用逗号分隔；生产环境必填。与 `COOKIE_DOMAIN` 作用不同，不要互相替代。 |
| `LOG_LEVEL` | `info` | 日志级别。 |
| `SEED_ADMIN_USERNAME` | `admin` | 数据库 seed 创建的初始管理员账号。 |
| `SEED_ADMIN_PASSWORD` | 无默认生产密码 | 初始管理员密码，至少 12 位；生产环境必须修改。 |

## 与 captcha-service 的对应关系

以下三项必须对应：

```env
# backend/.env
CAPTCHA_SERVICE_ID=backend-admin
CAPTCHA_SERVICE_SECRET=同一组随机密钥
CAPTCHA_SERVICE_URL=http://127.0.0.1:3100

# captcha-service/.env
CAPTCHA_SERVICE_ID=backend-admin
CAPTCHA_SERVICE_SECRET=同一组随机密钥
```

backend 不需要配置 `CAPTCHA_PREFIX`。Prefix 由 captcha-service 的服务端绑定配置决定，仅用于服务端状态隔离；不下发浏览器，也不需要注入前端 `CaptchaConfig`。

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
- 生产环境必须设置 `COOKIE_SECURE=true`、`CSRF_ALLOWED_ORIGINS`，并通过 HTTPS 对外提供服务。
- backend 可以监听公网或网关网络，但 captcha-service 和 Redis 不应暴露公网。
- 修改验证码凭证后必须同时重启 backend 和 captcha-service。
