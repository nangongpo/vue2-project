# captcha-service 安全需求

## 1. 目标与范围

提供可被多个项目复用的验证码能力，当前只支持登录场景的 `SLIDER`。验证码只能作为风控条件，不能替代账号、密码、会话或权限校验。

本文档是架构、实现、测试和验收的唯一基线。安全要求与便利性冲突时，以安全要求为准。

## 运行环境

项目使用根目录 `.nvmrc` 固定 Node.js 版本。执行开发、构建或测试命令前，请先切换到项目要求的运行环境：

```bash
nvm use
```

## 2. 设计原理

### 2.1 信任边界

```text
Browser ── HTTPS ──> Project Backend ── HTTPS + mTLS ──> captcha-service ──> Redis
```

- 浏览器只能访问项目 backend，不得访问 captcha-service。
- backend 是业务入口和唯一前端代理，负责固定场景、规范化用户名、生成 `AttemptId`、绑定登录流程。
- captcha-service 只负责验证码挑战、校验、一次性 Token 和观测事件，不负责登录、用户、角色或权限。
- Redis 是 Challenge、Token、nonce 和限流状态的权威存储；禁止依赖本地内存完成安全状态管理。

### 2.2 最小权限与最小暴露

- 浏览器不得获得 `ServiceSecret`、Prefix、Redis Key、内部 URL、内部 `RequestId` 或目标答案。
- backend 对外只返回稳定的 camelCase DTO；不得透传 captcha-service 内部字段。
- 验证码图片、轨迹和事件均为不可信输入；事件只能用于观测，不能参与认证放行。
- 所有失败默认拒绝，不得因 Redis、网络、验证码引擎或配置异常自动放行。

### 2.3 一次性和上下文绑定

- 每次登录验证码流程由 backend 生成不可预测的 `AttemptId`。
- `AttemptId` 必须绑定规范化用户名、固定 `SceneId=login`、Challenge、客户端上下文和 Token。
- Challenge 最多校验一次；CaptchaToken 最多消费一次；重复、过期、跨账号或跨流程使用必须失败。
- `AttemptId` 只是短期流程句柄，不是登录凭证。

### 2.4 追踪标识

- 对外 `traceId` 始终由接收请求的服务端生成，不信任客户端传入的同名请求头。
- `traceId` 可在响应头和错误 DTO 中返回，用于排障；不得作为鉴权、幂等、限流或 Redis Key。
- backend 每次调用 captcha-service 生成独立的内部 `RequestId`；不得返回浏览器。

## 3. 交互流程

### 3.1 创建 Challenge

1. 浏览器向 backend 提交用户名。
2. backend 校验参数并按统一规则规范化用户名，固定 `SceneId=login`。
3. backend 生成 `AttemptId`，在 Redis 保存短期流程状态。
4. backend 通过 HTTPS/mTLS 和服务认证调用 captcha-service。
5. captcha-service 校验身份、版本、场景和限流，生成 Challenge，将答案哈希及上下文写入 Redis。
6. backend 只返回渲染所需资源、`AttemptId`、`ChallengeId` 和过期时间。

前端不得提交 `SceneId`、Prefix、ServiceId、ClientIp、UserAgent 或内部配置。

### 3.2 校验 Challenge

1. 浏览器提交 `AttemptId`、`ChallengeId`、轨迹点、最终位置和轨道宽度。
2. backend 从服务端状态读取用户名和流程上下文，不信任前端重复提交的用户名。
3. captcha-service 校验签名、AttemptId、Challenge、上下文、轨迹和限流。
4. Challenge 无论成功或失败都必须原子消费。
5. 成功后生成短期、不可预测、一次性的 `CaptchaToken`。
6. backend 返回 Token 给浏览器；Token 只能通过 HTTPS 传输，不得写日志、埋点、URL 或业务数据库。

### 3.3 登录消费 Token

1. 浏览器将 `AttemptId` 和 `CaptchaToken` 提交给 backend 登录接口。
2. backend 先校验并消费 Token，再决定是否执行受保护业务。
3. Token 消费必须绑定规范化用户名、AttemptId 和业务场景。
4. 消费失败、过期、重复或依赖不可用时，登录必须失败。
5. 登录成功后只通过 HttpOnly Cookie 建立会话；浏览器不得保存可直接认证的 Token。

### 3.4 事件上报

1. 浏览器可上报初始化、资源失败、校验成功或失败等观测事件。
2. backend 校验事件长度、枚举、AttemptId 和限流后转发。
3. 事件不参与 Challenge 校验、Token 签发、Token 消费、登录或授权。
4. 对外成功响应不返回业务数据，使用 `204 No Content`。

### 3.5 获取登录信息与异步路由

1. 登录成功由 `HTTP 200` 和业务码 `000000` 表示。
2. backend 设置 `HttpOnly; Secure; SameSite=Lax` 会话 Cookie。
3. 前端加载异步路由前调用 `/api/v1/auth/me`。
4. 只有 `/auth/me` 通过服务端会话校验后，前端才能安装异步路由。
5. localStorage 或前端 `authenticated` 标记只能作为 UI 状态，不能作为认证依据。

## 4. 对外接口规范

backend 对浏览器提供 camelCase API；captcha-service 内部使用 PascalCase 协议，禁止直接透传。

### 4.1 接口和成功状态码

| 接口 | 成功状态码 | 说明 |
| --- | ---: | --- |
| `POST /api/v1/captcha/challenges` | `201 Created` | 创建 Challenge 流程 |
| `POST /api/v1/captcha/verify` | `200 OK` | 执行校验并签发 Token |
| `POST /api/v1/captcha/events` | `204 No Content` | 接收观测事件，不返回 body |
| `POST /api/v1/auth/login` | `200 OK` | 完成认证并建立会话 |
| captcha-service 内部 Create/Verify/Consume/Event | `200 OK` | 内部调用，不向浏览器暴露 |

不得因为请求方法都是 POST 就统一返回 `201`。

### 4.2 统一成功响应

除 `204` 接口外，成功响应使用：

```json
{
  "code": "000000",
  "message": "success",
  "data": {}
}
```

登录成功必须使用最小响应：

```http
HTTP/1.1 200 OK
Set-Cookie: app_session=<opaque>; HttpOnly; Secure; SameSite=Lax
```

```json
{
  "code": "000000",
  "message": "success",
  "data": null
}
```

登录响应不得返回 Session Token、权限、失败次数、登录 IP、内部 `RequestId` 或密码相关信息。用户信息通过 `/api/v1/auth/me` 获取。

### 4.3 错误状态码

| 状态码 | 用途 |
| ---: | --- |
| `400` | 参数、Challenge、AttemptId、Token 或轨迹无效 |
| `401` | 会话不存在、失效或未认证 |
| `403` | 已认证但无权，或业务要求先完成验证码 |
| `404` | 路由或资源不存在，且不得造成账号枚举 |
| `409` | 幂等或资源状态冲突 |
| `429` | 触发限流 |
| `500` | 未预期的 backend 内部错误 |
| `503` | captcha-service、Redis 或必要依赖不可用 |

错误响应使用 Problem Details 风格，包含稳定业务码和服务端生成的 `traceId`，不得包含堆栈、密钥、Token、Redis Key 或内部 `RequestId`。不得用 HTTP `200` 伪装错误。

## 5. 服务间交互协议

### 5.1 调用关系

只有 backend 可以调用 captcha-service，调用方向固定为：

```text
Browser
  │ 对外 camelCase 请求
  ▼
Project Backend
  │ 内部 PascalCase 请求 + mTLS + 签名
  ▼
captcha-service
  │ Challenge、Token、nonce、限流状态
  ▼
Redis
```

captcha-service 不调用 backend，不访问业务数据库，不访问用户表；Redis 只由 captcha-service 保存验证码安全状态，backend 只保存自己的 `AttemptId` 映射状态。

### 5.2 每次调用的共同处理

backend 每次实际调用必须：

1. 生成新的 UUID `RequestId` 和 `SignatureNonce`；
2. 使用配置中的 `ServiceId`、`ServiceSecret` 和固定 `SceneId=login`；
3. 携带 `AttemptId`、时间戳、版本、动作和业务参数；
4. 对完整请求签名，通过 HTTPS/mTLS 发送；
5. 校验 HTTP 状态码、响应 `RequestId`、业务错误码和响应结构；
6. 只将允许的字段映射为对外 DTO，不透传内部响应。

captcha-service 每次收到请求必须：

1. 校验证书、ServiceId、签名、时间窗口和 nonce；
2. 校验 URL 与 `Action` 一致、场景固定、AttemptId 合法；
3. 校验项目绑定配置和 Redis 可用性；
4. 执行对应动作并原子更新 Redis 状态；
5. 返回内部响应，不返回浏览器可用的内部凭证。

### 5.3 内部接口契约

共同请求字段：

```json
{
  "ApiVersion": "1",
  "ProtocolVersion": "1.0",
  "RequestId": "uuid",
  "ServiceId": "backend-admin",
  "Action": "CreateChallenge",
  "Timestamp": "1790057399",
  "SignatureMethod": "HMAC-SHA256",
  "SignatureVersion": "1.0",
  "SignatureNonce": "uuid",
  "SceneId": "login",
  "AttemptId": "uuid",
  "Signature": "base64"
}
```

| 内部接口 | backend 必传业务字段 | 成功结果 | Redis 状态变化 |
| --- | --- | --- | --- |
| `POST /internal/v1/challenges` | `Subject`、可信 `ClientIp`、`UserAgent` | `ChallengeId`、类型/版本、渲染 `Payload`、`ExpiresIn` | 创建 Challenge，保存答案哈希和上下文 |
| `POST /internal/v1/verify` | `ChallengeId`、`Subject`、客户端上下文、`Points`、`FinalX`、`TrackWidth` | `Verified`、短期 `CaptchaToken`、`ExpiresIn` | 原子消费 Challenge，成功时创建 Token |
| `POST /internal/v1/tokens/consume` | `CaptchaToken`、`Subject`、可信 `ClientIp` | `Valid` | 原子消费 Token；只能成功一次 |
| `POST /internal/v1/events` | `EventId`、事件枚举、可选耗时/原因 | `Accepted` | 只写观测数据，不改变认证状态 |

内部成功统一返回 `HTTP 200`，并包含匹配的 `RequestId`：

```json
{
  "ApiVersion": "1",
  "ProtocolVersion": "1.0",
  "RequestId": "uuid",
  "Verified": true,
  "CaptchaToken": "opaque-token",
  "ExpiresIn": 120
}
```

### 5.4 内部错误和 backend 映射

captcha-service 内部错误至少分为：`SERVICE_AUTH_FAILED`、`VERSION_UNSUPPORTED`、`SCENE_NOT_FOUND`、`CHALLENGE_NOT_FOUND`、`CHALLENGE_REPLAYED`、`TOKEN_INVALID`、`TOKEN_REPLAYED`、`TRACK_INVALID`、`RATE_LIMITED`、`SERVICE_UNAVAILABLE`。

backend 必须按以下原则映射：

- 参数、绑定、轨迹、Challenge 或 Token 无效：对外 `400`；
- 限流：对外 `429`；
- Redis、网络、服务未就绪或未知内部故障：对外 `503`；
- 不向浏览器暴露内部错误名称、签名细节、RequestId 或堆栈；
- 所有失败都拒绝登录或受保护业务，不得自动降级。

### 5.5 安全协议要求

- 生产环境必须使用 HTTPS + mTLS、私网访问控制和服务身份校验。
- 每个项目使用独立 `ServiceId` 和强随机 `ServiceSecret`；密钥不得写入前端、代码仓库或日志。
- URL 与 `Action` 必须一致；签名覆盖全部业务参数；请求时间窗口默认不超过 300 秒。
- nonce 必须使用 Redis `SET NX EX` 防重放。
- 服务间签名固定使用 HMAC-SHA256；不实现、不接受 HMAC-SHA1 或其他兼容算法。
- 内部接口拒绝浏览器来源、未知 ServiceId、Prefix 入参和未知自定义认证头。
- 每次真实内部调用生成独立 `RequestId`；重试不得复用，除非协议明确实现幂等键。

## 6. 输入、输出和请求头

### 6.1 输入校验

- 使用 DTO 白名单和 `forbidNonWhitelisted`；拒绝未知 body 字段。
- 所有字符串限制长度和字符集；数组限制数量；数字限制范围和精度。
- 轨迹必须满足点数、时间递增、位移范围、耗时和异常停顿规则。
- `username`、角色编码和其他账号标识必须统一规范化；创建、登录、验证码绑定和 Token 消费使用同一结果。
- 不接受前端提交的 `SceneId`、Prefix、ServiceId、ClientIp、UserAgent 或权限字段。

### 6.2 自定义请求头

- backend 对 `X-*` 请求头执行白名单校验，未知头默认拒绝，不得透传。
- 前端不发送 `X-Request-Trace-Id`；服务端忽略客户端同名值并生成自己的 `traceId`。
- `X-Forwarded-*` 仅在可信代理链配置下解析；直连客户端的转发头不得改变真实 IP。
- `Idempotency-Key` 仅用于明确支持幂等的接口，并校验长度、字符集和作用域。
- CORS 只允许配置的可信来源、方法和请求头；生产环境禁止宽泛 `*` 与不必要的 credentials。

## 7. 数据、状态和隔离

### 7.1 Redis 状态

Redis Key 至少包含环境、项目 Prefix 和业务类型，例如：

```text
captcha:{Environment}:{Prefix}:challenge:{ChallengeId}
captcha:{Environment}:{Prefix}:token:{TokenHash}
captcha:{Environment}:{Prefix}:nonce:{Nonce}
captcha:{Environment}:{Prefix}:rate:{Dimension}:{Value}
```

Prefix 只存在于服务端配置和 Redis 命名空间，不能出现在浏览器配置、对外响应或请求体中。

### 7.2 生命周期

- Challenge、AttemptId 和 Token 必须设置短 TTL，默认 Challenge 不超过 120 秒。
- Challenge 校验和 Token 消费必须原子化，防止并发重放。
- Token 只保存哈希或等价不可逆值；原始 Token 不落盘、不记录日志。
- Redis 不可用时所有安全操作失败关闭。

### 7.3 多项目复用

多个项目可以共享 Redis 和 captcha-service，但必须使用独立 `ServiceId`、Secret、Prefix、场景配置和限流维度。不同项目的 Challenge、Token、nonce、AttemptId 和限流数据不得交叉读取。隔离要求更高时使用独立 Redis DB、集群或实例。

## 8. 认证、会话与账号安全

- 密码使用 Argon2id 或等价强哈希，禁止明文、可逆加密和弱哈希。
- 登录失败、账号锁定、验证码要求和限流必须同时按账号、IP、设备或会话维度控制。
- 不存在账号、密码错误、账号锁定和验证码失败使用不可枚举的统一对外语义。
- Session Cookie 必须 HttpOnly、Secure、SameSite，并设置合理过期时间；服务端保存 Token 哈希。
- 密码修改、重置密码和管理员高风险操作后必须撤销相关会话。
- 角色、权限、用户状态变更必须记录审计日志；高权限角色不可被普通管理员自授予。
- 禁止把 captchaToken、密码、Session Token、Secret 和完整轨迹写入日志或审计详情。

## 9. 限流、代理和故障

- Create、Verify、Consume、Event、Login 使用独立限流配置。
- 限流至少支持 IP、账号、AttemptId、ServiceId 和接口维度，不能只依赖单一 IP。
- 仅从可信代理链解析客户端 IP；未配置可信代理时忽略转发头。
- captcha-service、Redis、数据库或网络异常时返回 `503` 或安全错误，不得降级放行。
- 超时、重试和熔断必须有上限；重试不得造成 Token 重复消费或 Challenge 重复校验。

## 10. 日志、审计和监控

- 日志使用结构化 JSON，包含服务名、动作、状态、服务端 `traceId`、内部 `RequestId`、耗时和错误业务码。
- 日志禁止包含密码、Secret、签名、CaptchaToken、完整 IP、完整 User-Agent、答案、轨迹和验证码资源。
- 用户创建、角色变更、权限变更、密码操作、登录失败、锁定、Token 重放和配置变更必须审计。
- 监控成功率、失败率、限流率、重放率、Redis 状态、延迟和异常来源；事件数据不能反向改变认证结果。

## 11. 部署与多项目接入

### 11.1 单机开发/测试部署

```text
Browser ──> backend ──> captcha-service ──> Redis
                         └──────────────> MySQL/业务库由 backend 使用
```

- backend、captcha-service 和 Redis 可部署在同一台开发机或测试主机。
- captcha-service 只监听内网地址；不得绑定公网入口。
- backend 使用本地 ServiceId、Secret 和 Prefix，禁止使用生产密钥。
- 开发环境可使用 HTTP，但必须保留服务身份校验、签名、nonce、限流和 Redis 状态校验。
- 开发配置不得提交真实密码、Secret、证书或生产地址。

### 11.2 单机生产部署

```text
Internet ── HTTPS ──> Reverse Proxy ──> backend ── mTLS ──> captcha-service ──> Redis
```

- 对外只暴露 reverse proxy 和 backend；captcha-service、Redis 不暴露公网。
- backend 与 captcha-service 之间必须使用 HTTPS、mTLS、网络 ACL 和服务身份校验。
- Redis 必须启用认证和 TLS（如环境支持），并限制来源地址和权限。
- 生产环境强制强随机 Secret、证书校验、Secure Cookie、可信代理配置和启动配置校验。
- captcha-service、Redis 和 backend 必须配置健康检查、超时、日志采集、资源限制和自动重启策略。
- 生产环境禁止使用默认 Secret、默认 Prefix、宽泛 CORS 和调试日志。

### 11.3 多项目共用一个 captcha-service

多个项目通过各自的 backend 接入同一个 captcha-service：

```text
backend-admin ── ServiceId/Secret/Prefix ──┐
backend-shop  ── ServiceId/Secret/Prefix ──┼──> captcha-service ──> Redis
backend-api   ── ServiceId/Secret/Prefix ──┘
```

每个项目必须独立配置：

```text
ServiceId     唯一服务身份
ServiceSecret 独立强密钥
Prefix        服务端 Redis 命名空间
Scene 配置    允许的验证码类型、模式和 TTL
限流配置      按项目隔离
```

要求：

- 一个项目的 Secret 失效或泄露，不得影响其他项目。
- captcha-service 根据 ServiceId 加载独立绑定配置，不接受前端传入项目身份。
- backend 负责把项目自身的业务场景映射为固定 `SceneId`，前端不能选择其他项目或场景。
- 所有 Redis Key 必须包含环境和 Prefix；不同项目不得读取、消费或覆盖彼此的 Challenge、Token、nonce 和限流数据。
- 多项目必须使用同一套协议版本和兼容的资源版本；升级时支持灰度和版本回滚。

### 11.4 多实例高可用部署

```text
backend ── Load Balancer ──> captcha-service-1
                         └─> captcha-service-2 ──> Shared Redis
```

- captcha-service 实例必须无状态，不得把 Challenge、Token、nonce 或限流状态保存在本地内存。
- 所有实例共享同一 Redis、绑定配置、密钥版本和协议版本。
- Redis 必须使用高可用部署；Redis 故障时所有认证相关操作失败关闭。
- 负载均衡必须执行健康检查、连接超时和故障摘除，不得把未就绪实例分配流量。
- 密钥轮换支持旧密钥短期验证、新密钥签发，并有明确失效时间。

### 11.5 部署验收

- 从公网无法直接连接 captcha-service 和 Redis。
- backend 不配置生产环境以外的 ServiceSecret，浏览器无法读取该 Secret。
- 使用错误 ServiceId、Secret、Prefix 或证书不能调用服务。
- 多项目共享 Redis 时，跨项目读取和消费状态全部失败。
- 单实例重启不丢失有效 Challenge；多实例切换不影响流程。
- 任一必要依赖不可用时不会自动放行登录。

## 12. 测试与验收

### 11.1 单元测试

必须覆盖：签名和 nonce、防重放、输入白名单、用户名规范化、限流、Challenge 一次性、Token 一次性、AttemptId 绑定、账号枚举防护、traceId 生成、状态码和错误映射。

### 11.2 集成测试

必须验证：浏览器不能访问 captcha-service；无效服务身份不能调用；完整 Create → Verify → Login Consume 链路可用；并发重复消费只有一次成功；Redis 不可用时安全失败；共享 Redis 时项目隔离；未知请求头被拒绝；前端篡改场景、用户名、AttemptId、Prefix 或 Token 不能绕过校验。

### 11.3 验收标准

- 浏览器没有 ServiceSecret、Prefix 和可直接认证的 Token。
- Login 返回 `200`，Challenge 返回 `201`，Verify 返回 `200`，Event 返回 `204`。
- Login 成功 body 为 `code=000000、data=null`，会话只通过 HttpOnly Cookie 建立。
- 异步路由必须通过 `/auth/me` 服务端会话校验后加载。
- 任意依赖故障、重放、越权、篡改或状态不一致都不会自动放行。
- 安全、协议、故障、并发、兼容性和回归测试全部通过。

## 13. 非目标

- captcha-service 不实现登录、用户、角色、权限或业务数据库。
- 不允许浏览器直连 captcha-service。
- 不把事件、轨迹或前端状态标记作为认证依据。
- 不因兼容旧前端而恢复暴露 Prefix、内部字段、Session Token 或目标答案。
