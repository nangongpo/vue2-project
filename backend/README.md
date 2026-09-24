# backend

后台管理 API 服务，基于 Node.js、NestJS、Fastify、Prisma、MySQL 和 Redis。

backend 负责登录、会话、权限、MFA、审计、验证码代理和业务管理接口。浏览器只访问 backend，不直接访问数据库、Redis 或 captcha-service。

## 环境要求与初始化

- Node.js：使用仓库根目录 `.nvmrc` 指定的版本（当前为 `v22.14.0`）。
- MySQL 8.0.23 或兼容版本。
- Redis；生产环境必须启用。
- captcha-service；登录验证码启用时必须可用。

```bash
nvm use
pnpm install
cp backend/.env.example backend/.env
# 修改 DATABASE_URL、MFA_ENCRYPTION_KEY、验证码密钥和种子管理员密码
pnpm --filter backend db:generate
pnpm --filter backend db:migrate
pnpm --filter backend db:seed
```

启动服务：

```bash
pnpm dev:captcha
pnpm dev:backend
```

backend 默认监听 `0.0.0.0:3000`，API 前缀为 `/api/v1`。

## 数据库命令

```bash
pnpm --filter backend db:generate
pnpm --filter backend db:migrate
pnpm --filter backend db:deploy
pnpm --filter backend db:seed
```

开发环境重置数据库：

```bash
pnpm --filter backend db:reset
pnpm --filter backend db:seed
```

`db:reset` 会删除当前数据库中的表和数据，只允许开发环境使用。生产环境只能执行 `db:deploy`，禁止执行重置。

## 认证和授权

- 登录使用服务端会话 Cookie，不向前端返回长期 Token。
- Cookie 使用 `HttpOnly`、`SameSite=Lax`；生产环境必须启用 `Secure`。
- 管理员首次登录后必须完成 MFA 绑定，未完成 MFA 不能访问管理接口。
- TOTP 使用 SHA-1、6 位验证码、30 秒周期，并防止同一时间步重放。
- MFA 密钥在数据库中使用 AES-256-GCM 加密保存。
- 用户和角色对外使用 UUID，数据库内部主键使用 BIGINT。
- 权限接口必须声明 `RequirePermissions`；未声明授权策略的接口默认拒绝。

MFA 相关接口：

```text
POST /api/v1/auth/login
GET  /api/v1/auth/mfa/status
POST /api/v1/auth/mfa/enroll
POST /api/v1/auth/mfa/confirm
POST /api/v1/auth/reauth
GET  /api/v1/auth/me
POST /api/v1/auth/logout
```

`/auth/mfa/status` 只返回当前会话的 MFA 状态，不返回密钥、OTP 或权限列表。

## 配置

配置文件为 `backend/.env`。主要参数：

| 参数 | 开发默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | `development`、`test` 或 `production`。 |
| `ENABLE_HTTPS` | `false` | 是否强制外部请求使用 HTTPS；验证码接口也受此开关控制。生产环境必须为 `true`。 |
| `ENABLE_CSP` | `false` | 是否启用 Helmet CSP。生产环境必须为 `true`。 |
| `PORT` | `3000` | backend 监听端口。 |
| `DATABASE_URL` | 无 | MySQL 连接串，必填。 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | 会话、限流和业务缓存。 |
| `CAPTCHA_SERVICE_URL` | `http://127.0.0.1:3100` | captcha-service 内网地址。 |
| `CAPTCHA_SERVICE_ID` | `backend-admin` | captcha-service 调用方 ID。 |
| `CAPTCHA_SERVICE_SECRET` | 无 | 与 captcha-service 一致的 HMAC-SHA256 密钥。 |
| `COOKIE_SECURE` | `false` | HTTPS 部署必须为 `true`。 |
| `COOKIE_DOMAIN` | 空 | 默认留空，避免扩大 Cookie 作用域。 |
| `CSRF_ALLOWED_ORIGINS` | `http://localhost:5173` | Cookie 请求允许的完整 Origin。 |
| `PUBLIC_HTTPS_ORIGIN` | 空 | 生产环境必填，例如 `https://admin.example.com`。 |
| `TRUST_PROXY` | `false` | 生产反向代理部署必须为 `true`。 |
| `SESSION_TTL_SECONDS` | `1800` | 会话绝对有效期。 |
| `SESSION_IDLE_TTL_SECONDS` | `1800` | 会话空闲有效期。 |
| `MFA_ENCRYPTION_KEY` | 无 | AES-256-GCM 密钥，生产环境必须通过密钥管理系统注入。 |

完整配置见 [`CONFIGURATION.md`](CONFIGURATION.md)。

## 生产安全配置

生产环境启动时会拒绝以下不安全配置：

- `COOKIE_SECURE` 不是 `true`。
- `PUBLIC_HTTPS_ORIGIN` 不是 HTTPS。
- `CSRF_ALLOWED_ORIGINS` 为空、使用 HTTP 或 localhost。
- `COOKIE_DOMAIN` 非空。
- `TRUST_PROXY` 未开启。
- 非本机 `CAPTCHA_SERVICE_URL` 使用 HTTP。

推荐配置：

```env
NODE_ENV=production
ENABLE_HTTPS=true
ENABLE_CSP=true
COOKIE_SECURE=true
COOKIE_DOMAIN=
CSRF_ALLOWED_ORIGINS=https://admin.example.com
PUBLIC_HTTPS_ORIGIN=https://admin.example.com
TRUST_PROXY=true
CAPTCHA_SERVICE_URL=https://captcha.internal.example.com
```

生产环境使用 Helmet 启用严格 CSP、HSTS，并将非 HTTPS 请求重定向到 `PUBLIC_HTTPS_ORIGIN`。反向代理必须覆盖客户端传入的 `X-Forwarded-Proto`，并且 backend 端口不得直接暴露公网。

本地 HTTP 联调时可将 `ENABLE_HTTPS=false`、`ENABLE_CSP=false`；此时验证码接口允许 HTTP。打开 `ENABLE_HTTPS=true` 后，backend 必须从 HTTPS 反向代理访问，直接 HTTP 请求会被拒绝。

## 构建、启动和测试

```bash
pnpm --filter backend build
node backend/dist/main.js
pnpm --filter backend test
pnpm lint:backend
```

生产环境不要使用 `tsx watch`，不要提交 `.env`、数据库密码、MFA 密钥或验证码 ServiceSecret。
