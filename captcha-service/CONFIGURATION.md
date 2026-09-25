# captcha-service 配置说明

captcha-service 从工作目录的 `.env` 读取配置。它只接受 backend 的内网签名请求，不直接向浏览器开放内部接口。

## 初始化

```bash
nvm use
cp captcha-service/.env.example captcha-service/.env
# 修改 CAPTCHA_SERVICE_SECRET，并确认 Redis 可连接
pnpm dev:captcha
```

生产环境建议先执行 `pnpm --filter captcha-service build`，再使用 `node captcha-service/dist/main.js` 或进程管理器启动。

默认监听 `127.0.0.1:3100`：

- `GET /health`：进程存活检查；
- `GET /ready`：Redis、资源和协议版本就绪检查。

## 参数

| 参数 | 示例/默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | Redis key 的环境隔离前缀。 |
| `CAPTCHA_PORT` | `3100` | 服务端口。 |
| `CAPTCHA_HOST` | `127.0.0.1` | 监听地址；生产环境不要直接使用公网地址。 |
| `CAPTCHA_SERVICE_ID` | `backend-admin` | 允许调用的 backend 服务 ID。 |
| `CAPTCHA_SERVICE_SECRET` | 随机密钥 | HMAC-SHA256 密钥，必须与 backend 完全一致；生产环境至少 32 位。 |
| `CAPTCHA_PREFIX` | `yaxbgo` | 公开验证码实例标识，不是密码，不参与内部请求签名。 |
| `CAPTCHA_SERVICE_BINDINGS` | 空 | 可选的多 backend JSON 配置；填写后优先于单组 `CAPTCHA_SERVICE_*` 配置。 |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Challenge、Token、Nonce 和限流状态存储，必填。 |
| `REDIS_ENABLED` | `true` | 是否启用 Redis；生产环境必须为 `true`。 |
| `CAPTCHA_CHALLENGE_RATE_LIMIT` | `10` | 同一 IP 每分钟创建挑战次数。 |
| `CAPTCHA_VERIFY_RATE_LIMIT` | `30` | 同一 IP 每分钟校验挑战次数。 |
| `CAPTCHA_CONSUME_RATE_LIMIT` | `30` | 同一主体每分钟消费 Token 次数。 |
| `CAPTCHA_EVENT_RATE_LIMIT` | `120` | 每个事件维度每分钟上报次数。 |
| `CAPTCHA_CHALLENGE_TTL` | `120` | Challenge 有效期，单位秒。 |
| `CAPTCHA_TOKEN_TTL` | `120` | CaptchaToken 有效期，单位秒。 |
| `CAPTCHA_MAX_TRACK_POINTS` | `300` | 单次轨迹最大点数。 |
| `CAPTCHA_CANVAS_WIDTH` | `360` | SVG 背景宽度。 |
| `CAPTCHA_CANVAS_HEIGHT` | `120` | SVG 背景高度。 |
| `CAPTCHA_TRACK_WIDTH` | `360` | 滑动轨道宽度。 |
| `CAPTCHA_BUTTON_WIDTH` | `42` | 滑块按钮宽度。 |
| `CAPTCHA_PIECE_SIZE` | `44` | 拼图块尺寸。 |
| `SWAGGER_ENABLED` | `true` | 是否启用 Swagger 文档；设为 `false` 时 `/docs` 和 `/docs-json` 返回 404。 |
| `SWAGGER_ADMIN_USERNAME` | `admin` | 访问 Swagger 文档的管理员用户名。 |
| `SWAGGER_ADMIN_PASSWORD` | 无默认生产密码 | 访问 Swagger 文档的管理员密码；生产环境至少 16 位且不能使用默认值。 |

## 凭证匹配

captcha-service 与 backend 必须使用相同的 `CAPTCHA_SERVICE_ID` 和 `CAPTCHA_SERVICE_SECRET`：

```env
# captcha-service/.env
CAPTCHA_SERVICE_ID=backend-admin
CAPTCHA_SERVICE_SECRET=同一组随机密钥

# backend/.env
CAPTCHA_SERVICE_ID=backend-admin
CAPTCHA_SERVICE_SECRET=同一组随机密钥
CAPTCHA_SERVICE_URL=http://127.0.0.1:3100
```

`CAPTCHA_PREFIX` 只由 captcha-service 管理。backend 的内部请求体不能包含 Prefix，浏览器也不能获得 `CAPTCHA_SERVICE_SECRET`。

## Swagger 文档与接口调试

captcha-service Swagger 地址为 `/docs`，JSON 文档地址为 `/docs-json`。访问文档页面时使用：

```env
SWAGGER_ENABLED=true
SWAGGER_ADMIN_USERNAME=admin
SWAGGER_ADMIN_PASSWORD=至少 16 位的文档管理员密码
```

文档访问凭据与服务调用凭据是两套配置，不要混用：

- Swagger 页面访问使用 `SWAGGER_ADMIN_USERNAME` / `SWAGGER_ADMIN_PASSWORD`。
- Swagger 的 `service-auth` 授权使用 `CAPTCHA_SERVICE_ID` / `CAPTCHA_SERVICE_SECRET`。
- 点击 Execute 调用 `/internal/v1/*` 时，Swagger 会根据 ServiceId、Secret 自动生成 HMAC-SHA256 请求签名。
- `SignatureNonce`、`Timestamp` 和 `Signature` 不需要手工填写静态示例值；必须通过 Swagger 的 Execute 或真实客户端生成。
- `CAPTCHA_SERVICE_SECRET` 不应暴露给浏览器用户或提交到代码仓库。

## 多实例绑定

需要多个 backend 或多个 Prefix 时使用 `CAPTCHA_SERVICE_BINDINGS`。值是 JSON 数组，例如：

```env
CAPTCHA_SERVICE_BINDINGS=[{"serviceId":"backend-admin","secret":"replace-with-secret","prefix":"yaxbgo","status":"ACTIVE","scenes":{"login":{"allowedCaptchaTypes":["SLIDER"],"defaultCaptchaType":"SLIDER","allowedModes":["EMBED","POPUP"],"defaultMode":"POPUP","ttl":120,"status":"ACTIVE"}}}]
```

JSON 中的 `secret` 应通过密钥管理系统注入，不建议直接写入普通配置文件。使用该配置后，`CAPTCHA_SERVICE_ID`、`CAPTCHA_SERVICE_SECRET` 和 `CAPTCHA_PREFIX` 仅作为单绑定回退配置。

## 生产注意事项

- Redis 是权威状态存储，Redis 不可用时服务默认拒绝，不自动放行。
- 不要把 `.env`、ServiceSecret 或绑定 JSON 提交到代码仓库。
- captcha-service 不保存本地会话，不依赖 sticky session，可由多个实例共享 Redis。
- 更新密钥后必须同步更新 backend，并重启所有相关实例。
