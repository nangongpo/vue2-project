# captcha-service

独立的一次性验证码服务。目前提供 `SLIDER` 类型验证码：服务端生成挑战资源、保存答案上下文、校验滑动轨迹并签发一次性 `CaptchaToken`。

浏览器只能访问 backend 的 `/api/v1/captcha/*` 接口，不能直接访问本服务的 `/internal/*` 接口。backend 使用服务身份和 HMAC-SHA256 签名调用本服务。

## 环境要求与运行

- Node.js：使用仓库根目录 `.nvmrc` 指定的版本。
- Redis：必需，保存 Challenge、Token、Nonce 和限流状态。
- backend 和 captcha-service 必须使用一致的 `CAPTCHA_SERVICE_ID`、`CAPTCHA_SERVICE_SECRET`。

```bash
nvm use
pnpm install
cp captcha-service/.env.example captcha-service/.env
pnpm dev:captcha
```

默认监听 `127.0.0.1:3100`：

- `GET /health`：进程存活检查。
- `GET /ready`：检查 Redis、资源和协议是否就绪。

Swagger 接口文档：

```text
GET /docs       # Swagger UI
GET /docs-json  # OpenAPI JSON
```

文档仅描述内部接口；调用仍需按内部协议提供服务身份、时间戳、Nonce 和 HMAC-SHA256 签名。

Swagger 文档默认使用 Basic Auth 保护。先用 `SWAGGER_ADMIN_USERNAME` 和 `SWAGGER_ADMIN_PASSWORD` 登录文档，再点击 `Authorize`：用户名填写 `ServiceId`，密码填写 `CAPTCHA_SERVICE_SECRET`。Swagger UI 会自动生成时间戳、Nonce 和 HMAC 签名，用于测试内部接口。设置 `SWAGGER_ENABLED=false` 可关闭文档；生产环境必须使用至少 16 位的非默认管理员密码。

生产构建和启动：

```bash
pnpm --filter captcha-service build
node captcha-service/dist/main.js
```

## 配置

主要配置位于 `captcha-service/.env`：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 环境名称，也用于 Redis key 隔离。 |
| `CAPTCHA_HOST` | `127.0.0.1` | 监听地址；生产环境禁止绑定 `0.0.0.0` 或 `::`。 |
| `CAPTCHA_PORT` | `3100` | 服务端口。 |
| `CAPTCHA_SERVICE_ID` | `backend-admin` | backend 调用方 ID。 |
| `CAPTCHA_SERVICE_SECRET` | 无安全默认值 | HMAC 密钥；生产环境至少 32 位。 |
| `CAPTCHA_PREFIX` | `yaxbgo` | 服务端实例和 Redis 状态隔离标识。 |
| `CAPTCHA_SERVICE_BINDINGS` | 空 | 多 backend 的 JSON 绑定配置。 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis 连接串，必填。 |
| `REDIS_ENABLED` | `true` | 生产环境必须为 `true`。 |
| `CAPTCHA_CHALLENGE_TTL` | `120` | Challenge 有效期，秒。 |
| `CAPTCHA_VERIFY_ATTEMPT_LIMIT` | `3` | 单个 Challenge 的错误校验次数，达到上限后必须重新获取。 |
| `CAPTCHA_FAILURE_COOLDOWN_SECONDS` | `30` | Challenge 失败次数用尽后的 IP/账号冷却时间，秒。 |
| `CAPTCHA_TOKEN_TTL` | `120` | 一次性 Token 有效期，秒。 |
| `CAPTCHA_MAX_TRACK_POINTS` | `300` | 单次轨迹最大点数。 |

完整参数见 [`CONFIGURATION.md`](CONFIGURATION.md)。

## 内部协议

接口使用 PascalCase JSON：

- `POST /internal/v1/challenges`：`CreateChallenge`
- `POST /internal/v1/verify`：`VerifyChallenge`
- `POST /internal/v1/tokens/consume`：`ConsumeToken`

请求包含 `ApiVersion`、`ProtocolVersion`、`ServiceId`、`Timestamp`、`SignatureMethod=HMAC-SHA256`、`SignatureVersion=1.0`、`SignatureNonce` 和 `Signature`。签名使用 RFC3986 规范化参数，并计算：

```text
HMAC-SHA256(secret + "&", METHOD + "&%2F&" + encodedCanonicalQuery)
```

Nonce 使用 Redis 原子写入防止重放；Challenge 和 Token 只能按协议消费一次。无效签名、过期请求、Redis 故障或验证码校验不确定时默认拒绝。

## 安全边界

- captcha-service 不实现登录、用户、角色、权限或业务数据库。
- 浏览器不得直接访问 captcha-service。
- 生产环境应通过网络 ACL 只允许 backend 访问本服务；本服务不应暴露公网。
- 非本机的生产 `CAPTCHA_SERVICE_URL` 必须使用 HTTPS；同机回环通信可使用 `127.0.0.1`。
- 不记录 ServiceSecret、签名、验证码答案、完整轨迹、CaptchaToken 或完整用户代理。
- `CAPTCHA_PREFIX` 只存在于服务端绑定、Redis key、日志和监控中，不下发浏览器。

## 测试

```bash
pnpm --filter captcha-service test
pnpm --filter captcha-service build
```
