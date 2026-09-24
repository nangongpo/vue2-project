## 前后端工作区

项目已拆分为 `backend/`、`captcha-service/` 和`frontend/` 三个应用
其中captcha-service服务由backend代理，不对外暴漏
Node 版本由根目录 `.nvmrc` 固定

后端说明见 [`backend/README.md`](backend/README.md)
验证码说明见 [`captcha-service/README.md`](captcha-service/README.md)
前端说明见 [`frontend/README.md`](frontend/README.md)

```bash
nvm use
pnpm install
pnpm dev:frontend
pnpm dev:backend
```

前端构建：

```bash
pnpm build:frontend
```

backend 接口统一使用业务码响应。成功码为 `000000`，异常码如下：

| 业务码 | 含义 |
| --- | --- |
| `000000` | 操作成功 |
| `100001` | 请求参数错误 |
| `100002` | 未登录或登录已失效 |
| `100003` | 无权执行此操作 |
| `100004` | 资源不存在 |
| `100005` | 请求与当前资源状态冲突 |
| `100006` | 请求过于频繁 |
| `100007` | 需要先完成滑块验证码 |
| `100008` | 滑块验证码校验失败 |
| `100009` | 请求处理中，请勿重复提交 |
| `100010` | 需要继续验证（MFA） |
| `100011` | 动态验证码无效或已使用 |
| `100012` | 需要继续验证（首次绑定 MFA） |
| `200000` | 服务器内部错误 |
| `200001` | 数据服务暂不可用 |
| `200002` | 服务暂时不可用 |

成功和错误响应统一使用 `{ code, message, data }`。成功响应示例：`{ code: "000000", message: "success", data: {} }`；错误响应的 `data` 携带 `traceId` 和 HTTP `status`，不返回堆栈、内部路径或依赖详情。前端码表位于 `frontend/src/api/codes.js`，后端码表位于 `backend/src/common/constants/api-code.ts`，新增业务码时需要同步修改两处。

### 请求结构

所有 backend 接口使用 `/api/v1` 前缀。请求参数按照接口类型分别放在路径参数、查询参数或 JSON 请求体中；Cookie 会话接口使用 `HttpOnly` Cookie，不在 JSON 中传递会话 Token。

分页请求统一使用 `page` 和 `pageSize`：

```http
GET /api/v1/users?page=1&pageSize=20&keyword=admin
Accept: application/json
```

```text
page: 正整数，默认 1
pageSize: 1–100，默认 20
```

JSON 请求体示例：

```http
POST /api/v1/auth/mfa/confirm
Content-Type: application/json

{ "otp": "123456" }
```

### 响应结构

所有成功响应固定使用以下外层结构：

```json
{
  "code": "000000",
  "message": "success",
  "data": {}
}
```

普通对象响应：

```json
{
  "code": "000000",
  "message": "success",
  "data": {
    "userId": "8c7d...",
    "username": "admin"
  }
}
```

无业务数据的成功响应：

```json
{
  "code": "000000",
  "message": "success",
  "data": null
}
```

分页响应统一使用 `items`、`total`、`page`、`pageSize` 和 `totalPages`：

```json
{
  "code": "000000",
  "message": "success",
  "data": {
    "items": [],
    "total": 0,
    "page": 1,
    "pageSize": 20,
    "totalPages": 0
  }
}
```

错误响应也使用相同外层结构，并通过 HTTP 状态码表达失败类别：

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
X-Request-Trace-Id: be68c936-ae28-4b59-b2ea-99d29ddd4b74
```

```json
{
  "code": "200002",
  "message": "服务暂时不可用",
  "data": {
    "traceId": "be68c936-ae28-4b59-b2ea-99d29ddd4b74",
    "status": 503
  }
}
```
