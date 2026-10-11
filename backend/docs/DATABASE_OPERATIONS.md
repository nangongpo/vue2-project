# 数据库操作规范

本文档只负责 Prisma 迁移、备份、恢复、生产变更和数据库权限。业务授权、租户边界和审批契约分别以 [PERMISSION_DESIGN.md](PERMISSION_DESIGN.md)、[TENANCY_SECURITY.md](TENANCY_SECURITY.md) 和 [APPROVAL_CONTRACT.md](APPROVAL_CONTRACT.md) 为准。

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

## 迁移标识符命名规范

MySQL 表名、索引名、外键名、检查约束名和其他数据库标识符最长为 64 个字符。迁移 SQL 中不得直接使用由“表名 + 全部字段名 + 后缀”拼接出的超长名称；否则会在部署时触发 MySQL `1059`，并使 Prisma 迁移进入失败状态。

约束命名必须使用短、稳定、可读的结构：

```text
<领域>_<对象>_<用途>_<类型>
```

例如：

```text
sys_membership_department_scope_fkey
sys_membership_scope_boundary_chk
```

要求：

1. 所有自定义标识符必须小于等于 64 个字符，建议控制在 48 个字符以内；
2. 外键使用 `_fkey`，检查约束使用 `_chk`，唯一约束使用 `_uq`，索引使用 `_idx`；
3. 名称必须表达业务对象和约束用途，不得依赖字段全名堆叠；
4. 生成迁移后必须检查 SQL 中的约束、索引和触发器名称长度；
5. 迁移必须在空库和结构一致的预发布库分别执行一次；
6. 迁移失败后先修复失败原因并按 Prisma 流程恢复，不得删除 `_prisma_migrations` 记录伪造成功。

发布前检查示例：

```bash
awk 'match($0,/CONSTRAINT `[^`]+`/) { name=substr($0,RSTART+12,RLENGTH-13); if (length(name)>64) print length(name), name }' \
  backend/prisma/migrations/*/migration.sql
```

## 开发环境

首次初始化或修改 schema：

```bash
nvm use
node -v
pnpm --filter backend db:generate
pnpm --filter backend db:migrate --name describe_the_change
```

清空本地专用开发库前，确认 `DATABASE_URL` 不指向共享、预发布或生产数据库：

```bash
pnpm --filter backend db:reset
```

`db:reset` 只负责重建迁移和数据库结构，不执行 seed。需要初始化默认租户、默认组织、默认部门、管理员、角色和权限目录时，必须单独执行 `db:seed`。业务管理员及普通新增用户默认绑定默认组织/默认部门；安全、系统、审计管理员属于租户管理域，组织和部门保持 `NULL`。

迁移只负责创建表、索引和约束；默认租户、默认组织、默认部门由独立的 `db:seed` 根据 `DEFAULT_TENANT_*`、`DEFAULT_ORGANIZATION_*` 和 `DEFAULT_DEPARTMENT_*` 配置在同一事务中创建。完整本地初始化必须按顺序执行：

```bash
pnpm --filter backend db:reset
pnpm --filter backend db:seed
```

只有同时看到迁移成功、seed 成功以及“权限目录和独立管理员初始化完成”日志，才表示初始化完整。迁移失败、数据库不可达或 seed 事务回滚时，不得认为默认组织和部门已经存在。

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

6. 仅在本次发布明确需要同步权限目录或初始化管理员时执行 `db:seed`，并确认两名独立安全管理员、系统管理员和审计管理员账号均已配置；两名安全管理员首次登录后都必须绑定 MFA。
7. 检查 `/api/v1/health`、`/api/v1/ready`、登录/MFA、权限和审计日志。

`db:deploy` 没有业务级自动回滚，MySQL DDL 也不应假设具备完整事务回滚能力。迁移失败时保留现场并检查 `_prisma_migrations`，不要编辑已应用的迁移或执行 `db:reset`；回滚应使用经验证的备份恢复，或提交新的前向修复迁移。

当前仓库只保留一个可从空库执行的初始化迁移：`prisma/migrations/20261010000000_initial_security_schema/migration.sql`。本地开发环境可直接执行 `db:reset`；新环境或已清空的数据库可执行 `db:deploy`。已有旧 `_prisma_migrations` 记录的数据库不得直接删除迁移历史后重新部署；生产环境切换到新基线前必须先备份、执行 preflight，并由 DBA 按实际表结构和迁移记录制定一次性基线切换方案。

任何生产数据库变更都必须关联变更单、备份记录、执行人和验证结果；无法证明目标环境、回滚材料或权限边界时，停止操作并升级审批。
