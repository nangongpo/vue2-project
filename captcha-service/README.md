# captcha-service

独立的一次性验证码服务。当前生产类型只有 `SLIDER`，服务端生成资源、保存答案、校验轨迹并签发一次性 `CaptchaToken`；浏览器不访问内部接口。

配置参数说明见 [`CONFIGURATION.md`](CONFIGURATION.md)。

## 运行

项目使用 `.nvmrc` 中的 Node 版本：

```bash
nvm use
cp .env.example .env
pnpm install
pnpm dev:captcha
```

服务默认监听 `127.0.0.1:3100`。`/health` 只表示进程存活，`/ready` 同时检查 Redis。

## 内部协议

接口使用扁平 PascalCase JSON：

- `POST /internal/v1/challenges` / `CreateChallenge`
- `POST /internal/v1/verify` / `VerifyChallenge`
- `POST /internal/v1/tokens/consume` / `ConsumeToken`
- `POST /internal/v1/events` / `ReportEvent`

请求必须包含 `ApiVersion=1`、`ProtocolVersion=1.0`、`ServiceId`、`Timestamp`、`SignatureMethod=HMAC-SHA1`、`SignatureVersion=1.0`、`SignatureNonce` 和 `Signature`。签名按 RFC3986 规范化除 `Signature` 外的所有参数，并使用 `HMAC-SHA1(ServiceSecret + "&")`。服务端使用 Redis `SET NX EX` 防止 nonce 重放；不使用自定义请求头。

`Prefix` 只存在于 captcha-service 服务端绑定、Redis key、日志和监控中，不注入前端配置、不返回浏览器、不进入内部请求体，也不参与签名。`ServiceId` 到 `Prefix`、`ServiceSecret` 和 `SceneId` 的绑定通过环境变量或受保护配置注入。

## 状态和安全边界

Challenge、Token、Nonce 和限流计数均使用带环境及 Prefix 的 Redis key。挑战验证成功或失败都会被原子消费；Token 最多成功消费一次；Redis 或验证码引擎无法确认结果时默认拒绝。日志只输出结构化技术事件，不记录密钥、签名、答案、目标坐标、完整 IP、完整 User-Agent 或验证码资源内容。

`ROTATE`、`CONCAT`、`WORD_IMAGE_CLICK` 尚未实现，不会被场景配置误允许。
