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

健康检查：

```text
GET /api/v1/health  # 进程存活检查，不依赖 Redis
GET /api/v1/ready   # backend 就绪检查，检查自身 Redis
```

`/ready` 在依赖不可用时返回 HTTP 503 和泛化消息“服务暂时不可用”，不向外暴露具体依赖名称；真实依赖原因只记录在服务端日志中。backend 和 captcha-service 可以在开发环境共用 Redis，生产环境建议分别配置各自的 `REDIS_URL`。

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

审计日志支持按风险等级查询和导出：

```text
GET /api/v1/audit-logs?riskLevel=L3
GET /api/v1/audit-logs/export?from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.999Z&riskLevel=L3
```

审计记录中的风险等级是服务端在操作发生时计算并保存的快照，不接受前端传入，也不会因后续策略变化而重新计算。

## 操作风险分级

系统对风险等级采用“显式策略优先、权限码兜底”的方式。业务操作必须通过操作目录或 `OperationPolicy` 登记；权限码规则只用于未绑定业务操作时的保守基础分级，具体对象、批量范围和审批状态仍由业务服务继续校验：

| 等级 | 典型操作 | 服务端要求 |
| --- | --- | --- |
| L0 | 查询、详情、选项和状态读取 | 登录态、权限校验和审计 |
| L1 | 一般业务写操作 | 登录态、权限校验和审计 |
| L2 | 密码、安全设置、会话和一般管理写操作 | MFA、5 分钟内重新认证和审计 |
| L3 | 角色/权限变更、数据范围、审批、运维工单和 MFA 重置 | MFA、5 分钟内重新认证、审批或双人制约和完整审计 |

风险分级不是前端可提交的参数，服务端根据显式操作策略、接口权限和业务上下文确定。批量操作、管理员目标、权限扩大、应急操作或异常登录环境可以由业务服务提升风险等级。L3 的审批和双人制约仍由审批/工单服务执行，不能由前端或请求体绕过。

业务接口可使用 `@SecurityOperation('业务操作编码')` 绑定业务操作策略。业务操作编码与接口/权限编码、请求 `traceId` 不同：接口/权限编码标识技术访问点，业务操作编码标识可跨多个接口复用的业务动作，`traceId` 只标识单次请求。普通接口不需要重复填写业务操作编码。

统一策略分为两层：`src/security/policies/operation-catalog.ts` 保存非业务模块的代码基线，`sys_operation_policy` 保存业务操作登记及经批准的运行策略。数据库策略只能提高风险等级或增加控制，不能低于代码基线；L3 的双人制约和审计要求也不能关闭。内置操作没有数据库记录时仍按代码基线执行，未登记的业务操作则拒绝执行，避免新增业务接口漏接风险策略。

业务功能接入时，应先登记 `operationCode`、资源、动作、影响范围、可逆性和数据敏感度，再由安全管理员发布 `OperationPolicy`，最后在控制器使用 `@SecurityOperation('order.refund')` 绑定。全局权限守卫负责 L2/L3 的 MFA 与重新认证门禁；审批服务和运维工单服务负责 L3 的独立角色、审批链和操作对象约束。策略管理接口为 `GET /api/v1/security/operation-policies`、`GET /api/v1/security/operation-policies/catalog`、`POST /api/v1/security/operation-policies`，发布和停用分别使用 `POST /:id/activate`、`PATCH /:id/disable`。`catalog` 会同时展示代码基线和数据库策略，代码基线不可直接修改。

当 L2/L3 接口缺少五分钟内的安全凭证时，接口返回业务码 `100013`，并在 `data` 中返回 `riskLevel`、可选的 `operationCode` 和 `requiredFactors`。前端全局安全验证弹窗完成 `/auth/reauth` 后，只自动重试原请求一次；取消或验证失败不会执行原操作。`operationCode` 仅在接口显式声明业务操作策略时返回，普通接口不重复使用权限编码。

## 响应契约

所有成功响应使用固定外层结构：

```json
{
  "code": "000000",
  "message": "success",
  "data": {}
}
```

无返回内容的成功操作使用 `data: null`。分页接口统一使用以下查询参数：

```text
page: 正整数，默认 1
pageSize: 1–100，默认 20
```

分页响应的 `data` 统一为：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 0
}
```

当前统一适用于用户、审计日志、权限 API 和运维工单列表。错误响应也使用相同外层结构：

```json
{
  "code": "100001",
  "message": "请求参数错误",
  "data": {
    "traceId": "...",
    "status": 400
  }
}
```

错误详情只返回安全可控的信息，不返回 `type`、请求内部路径或数据库堆栈；完整异常仍记录在服务端日志和审计记录中。

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
| `PREAUTH_TTL_SECONDS` | `300` | MFA 完成前的临时会话有效期，范围 60–900 秒；完成或取消后应立即失效。 |
| `CAPTCHA_RATE_WINDOW_SECONDS` | `60` | 行为验证码公开接口的独立限流窗口。 |
| `CAPTCHA_CHALLENGE_RATE_LIMIT` | `10` | 单 IP/账号在窗口内最多创建行为验证码挑战次数。 |
| `CAPTCHA_VERIFY_RATE_LIMIT` | `30` | 单 IP/挑战在窗口内最多校验行为验证码次数。 |
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
