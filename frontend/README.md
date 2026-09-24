# frontend

后台管理前端，基于 Vue 2.7、Vite 8.3、Element UI 和 Vue Router。前端只访问 backend 的公开 API，不直接访问数据库、Redis 或 `captcha-service`。

## 环境要求

- Node.js：使用仓库根目录 `.nvmrc` 指定的版本（当前为 `v22.14.0`）。
- pnpm：项目使用 pnpm workspace。
- backend 和 captcha-service 需要先启动，登录验证码才能正常工作。

```bash
nvm use
pnpm install
```

## 开发运行

```bash
pnpm dev:captcha
pnpm dev:backend
pnpm dev:frontend
```

默认地址：

- 前端：`http://localhost:5173`
- backend：`http://127.0.0.1:3000`
- API：`/api/v1`

开发服务器通过 Vite proxy 将 `/api` 转发到 backend，浏览器不会直接请求 captcha-service。

## 开发环境配置

配置文件为 `frontend/.env.development`：

```env
VITE_APP_BASE_API=/api/v1
VITE_APP_PROXY_URL=http://127.0.0.1:3000
VITE_MOCK=false
VITE_ENABLE_HTTPS=false
VITE_ENABLE_CSP=false
```

默认关闭 HTTPS 和 CSP，便于日常开发。需要模拟生产环境时开启：

```env
VITE_ENABLE_HTTPS=true
VITE_ENABLE_CSP=true
VITE_HTTPS_KEY_FILE=certs/localhost-key.pem
VITE_HTTPS_CERT_FILE=certs/localhost.pem
```

生成本地证书：

```bash
brew install mkcert
mkcert -install
mkdir -p frontend/certs
mkcert -key-file frontend/certs/localhost-key.pem \
  -cert-file frontend/certs/localhost.pem \
  localhost 127.0.0.1 ::1
```

开启后使用 `https://localhost:5173` 访问。证书文件不应提交到 Git。

## CSP 和 HTTPS

- Vite 配置入口为 `frontend/vite.config.js`，具体实现拆分在 `frontend/build/`：环境解析、插件、安全响应头和 Rollup 输出分别维护。
- `VITE_ENABLE_HTTPS` 只控制 Vite 开发服务器；生产环境 HTTPS 应由反向代理提供。
- `VITE_ENABLE_CSP` 会在 HTML 构建结果中注入 CSP，并为 Vite legacy 内联脚本生成 hash。
- `frame-ancestors` 由开发服务器/生产网关通过 HTTP 响应头发送，不能放在 HTML `meta` CSP 中。
- 生产构建默认开启 CSP：`frontend/.env.production` 中设置 `VITE_ENABLE_CSP=true`。
- 生产静态站点还应在 Nginx、CDN 或网关设置 CSP、HSTS 和 HTTP 到 HTTPS 的 308 跳转。

## 构建与预览

生产构建通过 `@vitejs/plugin-legacy` 生成兼容 Chrome 49 及以上版本的 legacy
JavaScript 包，并补充构建过程中检测到的必要 polyfill。CSS 构建目标也设置为
Chrome 49；不支持现代浏览器特性的第三方库仍可能需要单独替换或补充 polyfill。

```bash
pnpm --filter frontend build
pnpm --filter frontend preview
```

也可以从仓库根目录执行：

```bash
pnpm build:frontend
```

构建产物默认输出到 `frontend/dist`。生产环境建议由 HTTPS 网关托管静态文件，并将 `/api` 转发到 backend。

## 常用命令

```bash
pnpm --filter frontend dev
pnpm --filter frontend build
pnpm --filter frontend preview
pnpm --filter frontend theme
pnpm --filter frontend svgo
pnpm lint:frontend
```

## 安全边界

- 会话使用 backend 设置的 HttpOnly Cookie，前端不读取长期 Token。
- 登录、MFA 绑定、MFA 确认和重新认证均由 backend 校验。
- 前后端接口使用标准 JSON 和 HttpOnly Cookie；生产环境必须使用 HTTPS，不能依赖前端加密伪装传输安全。
- 不要在前端环境文件中放置数据库密码、Redis 密钥、验证码服务密钥或 MFA 加密密钥。
