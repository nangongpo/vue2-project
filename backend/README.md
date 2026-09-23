## 后端

后端使用 Node.js 22、NestJS、Fastify、Prisma 和 MySQL 8.0.23。

首次使用：

```bash
nvm use
cp backend/.env.example backend/.env
# 编辑 backend/.env，填写 DATABASE_URL；数据库名使用 vue2_project_db
# 同时配置 SEED_ADMIN_USERNAME 和 SEED_ADMIN_PASSWORD
pnpm --filter backend db:generate
pnpm --filter backend db:deploy
pnpm --filter backend db:seed
pnpm dev:captcha
pnpm dev:backend
```

验证码由独立的 `captcha-service` 提供。业务后端通过 `CAPTCHA_SERVICE_URL`、`CAPTCHA_SERVICE_ID` 和 `CAPTCHA_SERVICE_SECRET` 使用 HMAC-SHA256 调用它，浏览器不直接访问验证码内部接口。

开发环境需要清空并重新初始化数据库时，执行：

```bash
pnpm --filter backend db:reset
pnpm --filter backend db:seed
```

`db:reset` 会删除当前数据库中的表和数据，仅允许用于开发环境；生产环境只能使用 `db:deploy`，不得执行重置。

用户和角色使用双标识：数据库内部主键为 `BIGINT UNSIGNED AUTO_INCREMENT` 的 `id`，接口对外只使用 UUID v4 的 `userId`、`roleId`。初始化脚本使用环境变量中的管理员账号和密码，并通过 scrypt 生成密码哈希，不保存明文密码。

配置参数说明见 [`CONFIGURATION.md`](CONFIGURATION.md)。

认证使用服务端会话 Cookie，不把长期 Token 返回给前端。数据库中的会话只保存 Token 摘要，密码使用 Node.js 内置 scrypt 派生哈希。

当前接口：

- `GET /api/v1/health`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
