# backend

后台管理 API 服务，基于 Node.js、NestJS、Fastify、Prisma、MySQL 和 Redis。

backend 负责登录、会话、权限、MFA、审计、验证码代理和业务管理接口。浏览器只访问 backend，不直接访问数据库、Redis 或 captcha-service。

## 环境要求

- Node.js：使用仓库根目录 `.nvmrc` 指定的版本。
- MySQL：8.0.23 或兼容版本。
- Redis：生产环境必须启用。
- captcha-service：登录验证码启用时必须可用。

## 开发环境启动

```bash
nvm use
pnpm install
cp backend/.env.example backend/.env
```

修改 `backend/.env` 中的数据库、MFA、验证码和种子管理员配置，然后初始化数据库：

```bash
pnpm --filter backend db:generate
pnpm --filter backend db:migrate --name init
pnpm --filter backend db:seed
```

数据库清理、迁移和生产发布规范见 [`docs/DATABASE_OPERATIONS.md`](docs/DATABASE_OPERATIONS.md)。

启动服务：

```bash
pnpm dev:captcha
pnpm dev:backend
```

backend 默认监听 `0.0.0.0:3000`，API 前缀为 `/api/v1`。

## 常用地址

```text
GET /api/v1/health  # 进程存活检查
GET /api/v1/ready   # Redis 等依赖就绪检查
GET /docs           # Swagger UI
GET /docs-json      # OpenAPI JSON
```

## 文档

详细配置、权限设计和验证记录统一放在 [`docs/`](docs/)：

- [`CONFIGURATION.md`](docs/CONFIGURATION.md)：环境变量和生产配置。
- [`DATABASE_OPERATIONS.md`](docs/DATABASE_OPERATIONS.md)：数据库脚本安全规范、开发迁移和生产发布流程。
- [`PERMISSION_DESIGN.md`](docs/PERMISSION_DESIGN.md)：权限体系、ER 图和安全边界。
- [`REQUIREMENTS.md`](docs/REQUIREMENTS.md)：权限需求与接口约束。
- [`APPROVAL_CONTRACT.md`](docs/APPROVAL_CONTRACT.md)：审批接口和数据契约。
- [`VERIFICATION.md`](docs/VERIFICATION.md)：验证结果和可复现命令。

## 构建、测试和检查

```bash
pnpm --filter backend build
pnpm --filter backend test
pnpm lint:backend
```

生产环境使用构建产物启动：

```bash
node backend/dist/main.js
```

不要在生产环境使用 `tsx watch`，也不要提交 `.env`、数据库密码、MFA 密钥或验证码服务密钥。
