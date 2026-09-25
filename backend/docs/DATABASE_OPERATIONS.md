# 数据库操作规范

所有数据库命令都会使用当前环境的 `DATABASE_URL`。执行前必须确认目标数据库，不能仅凭命令名称判断环境。

## 脚本安全等级

| 脚本 | 作用 | 使用范围 |
| --- | --- | --- |
| `db:generate` | 生成 Prisma Client，不修改数据库。 | 开发、构建和 CI。 |
| `db:migrate` | 执行 `prisma migrate dev`，检查迁移漂移；检测到 Prisma Schema 变化时生成迁移，并应用待执行迁移。发生漂移时可能要求重置数据库。 | 仅开发环境。 |
| `db:deploy` | 只应用仓库中已有的未执行迁移。 | 预发布和生产迁移入口。 |
| `db:reset` | 删除并重建当前数据库中的表和数据。 | 仅本地专用开发库，禁止生产。 |
| `db:seed` | 幂等初始化权限目录、内置角色和管理员账号。 | 初始化或经审批的维护窗口；不是只读操作。 |

当前脚本没有自动识别生产库或阻止误操作的护栏，安全性依赖人工确认 `DATABASE_URL`。`NODE_ENV=production` 不是 Prisma CLI 的安全开关。

## 开发环境

首次初始化或修改 schema：

```bash
nvm use
node -v
pnpm --filter backend db:generate
pnpm --filter backend db:migrate --name describe_the_change
pnpm --filter backend db:seed
```

清空本地专用开发库前，确认 `DATABASE_URL` 不指向共享、预发布或生产数据库：

```bash
pnpm --filter backend db:reset
pnpm --filter backend db:seed
```

`db:reset` 使用 `--force`，会不可恢复地删除目标数据库数据。不要手动删除 `_prisma_migrations`，否则会造成迁移历史与实际表结构不一致。

## 生产环境

生产环境没有自动清库步骤，禁止执行：

```bash
pnpm --filter backend db:reset
pnpm --filter backend db:migrate
```

生产变更只能通过已审核并提交的迁移文件发布：

1. 在本地或临时数据库使用 `db:migrate` 生成迁移，并审查生成的 SQL。
2. 在结构一致的预发布库执行 `db:deploy` 和回归测试。
3. 生产维护窗口前完成数据库备份，并验证备份可恢复。
4. 执行只读权限预检，结果应为空：

   ```bash
   mysql --defaults-extra-file=/secure/mysql.cnf production_db \
     < backend/prisma/permission-preflight.sql
   ```

5. 审查迁移中的 `DROP`、数据删除、回填、索引重建、触发器变更和锁表风险，然后执行：

   ```bash
   pnpm --filter backend db:deploy
   ```

6. 仅在本次发布明确需要同步权限目录或初始化管理员时执行 `db:seed`，并确认三个独立高风险角色账号已配置。
7. 检查 `/api/v1/health`、`/api/v1/ready`、登录/MFA、权限和审计日志。

`db:deploy` 没有业务级自动回滚，MySQL DDL 也不应假设具备完整事务回滚能力。迁移失败时保留现场并检查 `_prisma_migrations`，不要编辑已应用的迁移或执行 `db:reset`；回滚应使用经验证的备份恢复，或提交新的前向修复迁移。

当前仓库的初始迁移为 `prisma/migrations/20260923010000_init/migration.sql`。已有 `_prisma_migrations` 记录的数据库不得直接删除迁移历史后重新部署；如需基线调整，必须先备份并制定单独的迁移方案。
