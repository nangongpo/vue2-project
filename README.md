## 前后端工作区

项目已拆分为 `frontend/` 和 `backend/` 两个应用，Node 版本由根目录 `.nvmrc` 固定。

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

后端接口统一使用业务码响应。成功码为 `000000`，异常码如下：

| 业务码 | 含义 |
| --- | --- |
| `000000` | 操作成功 |
| `100001` | 请求参数错误 |
| `100002` | 未登录或登录已失效 |
| `100003` | 无权执行此操作 |
| `100004` | 资源不存在 |
| `100005` | 请求与当前资源状态冲突 |
| `100006` | 请求过于频繁 |
| `200000` | 服务器内部错误 |
| `200001` | 数据服务暂不可用 |

成功响应结构为 `{ code, message, data }`；错误响应遵循 RFC 9457 Problem Details，并通过扩展字段携带 `code` 和 `traceId`：`{ type, title, status, detail, instance, code, traceId }`。前端码表位于 `frontend/src/api/codes.js`，后端码表位于 `backend/src/common/api-code.ts`，新增码时需要同步修改两处。

原有前端说明见 [`frontend/README.md`](frontend/README.md)。

```
src/theme/base.css
@font-face {
font-family: 'element-icons';
  src: url('fonts/element-icons.woff2') format('woff2'),
    url('fonts/element-icons.woff') format('woff'),
    url('fonts/element-icons.ttf') format('truetype'); /* chrome, firefox, opera, Safari, Android, iOS 4.2+*/
  font-weight: normal;
  font-display: 'swap';
  font-style: normal;
}
```
