# Prisma 数据库初始化

当前仅保留一个全新数据库基线：

`migrations/20261010000000_initial_security_schema/migration.sql`

基线覆盖当前 schema 的全部模型、字段、索引、枚举、外键及成员范围 CHECK，包含审计上下文、字段读写控制、扫描历史、封禁来源、删除前状态、保留锁定和管理命令幂等表。

`schema.prisma` 是 Prisma 可表达结构的来源；Prisma 无法表达的成员范围 CHECK 只在 `migration.sql` 中维护创建定义。`permission-preflight.sql` 只读检查约束是否存在且启用，不执行建表或修改约束。旧增量迁移中的历史数据回填不适用于空库，已从初始化流程移除。

从项目根目录执行：

```bash
nvm use
pnpm --filter backend db:generate
pnpm --filter backend db:verify-init
pnpm --filter backend db:deploy
pnpm --filter backend db:seed
pnpm --filter backend permission:verify
```

执行前确认 DATABASE_URL 指向预期的新库，并配置默认租户/组织/部门和四个独立初始化账号（两名安全管理员、一名系统管理员、一名审计管理员）。seed 从当前代码目录初始化 API、字段、页面、角色与数据范围；业务数据、文件记录和历史审批不会作为默认数据写入。

`db:verify-init` 调用 `scripts/verify-permission-migration.js --source`，不连接数据库。它检查 MySQL provider、迁移文件、CHECK 保留和标识符长度；只有一个迁移时还比较 SQL 与当前 schema，并检查基线没有历史 DML。CHECK 定义继续保留在迁移末尾。未来允许按正常流程新增增量迁移，累计结构通过初始化集成测试验证；不得改写已发布历史。

当前需要显式验收“仅一个基线”时，可执行 `node backend/scripts/verify-permission-migration.js --source --single-baseline`。默认运行该脚本则只读取 `permission-preflight.sql` 并执行数据库元数据检查，不创建临时库、不迁移、不运行 seed。

`pnpm --filter backend test:integration:init` 复用集成测试入口，运行 `integration-tests/prisma-initialization.test.ts`。测试在本机 MySQL 创建独立临时库，验证空库迁移、结构零差异、CHECK 启用/禁用检测及实际约束、两次 seed、全部 API/字段策略和页面/按钮绑定，最后清理临时库。它需要临时库 CREATE/DROP 权限，不重置 DATABASE_URL 指向的业务数据库。

已有数据库不能通过清空迁移记录来套用本基线。此次合并没有重置现有库或更改其 `_prisma_migrations`。旧库需先备份并比较实际结构，保留历史数据回填及安全证据，再按 [数据库操作规范](../docs/DATABASE_OPERATIONS.md) 的受控基线切换流程处理。
