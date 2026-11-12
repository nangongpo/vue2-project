# 测试规范

测试按职责和环境分层。单元测试不连接正式依赖；本地集成测试显式连接 MySQL、Redis、ClamAV；前端测试验证客户端安全策略和状态机；正式构建单独作为发布门禁。

## 1. 测试分组

| 职责 | 后端命令 | 验证内容 |
| --- | --- | --- |
| 认证与会话 | `pnpm --dir backend test:auth` | 登录、会话、MFA、密码、CSRF、限流、幂等 |
| 授权与角色 | `pnpm --dir backend test:authorization` | 页面、按钮、API、角色、权限目录和授权绑定 |
| 数据边界 | `pnpm --dir backend test:data-boundary` | 租户、组织、部门、数据范围、字段投影和文件权限边界 |
| 审批工作流 | `pnpm --dir backend test:workflow` | 申请、审批、执行、复核、职责分离和并发冲突 |
| 审计与公共协议 | `pnpm --dir backend test:audit` | 审计完整性、脱敏、错误码、响应格式和 traceId |
| 异步事件 | `pnpm --dir backend test:events` | Outbox/SSE 事件的租户、主体和事件类型隔离 |
| 本地真实依赖 | `pnpm --dir backend test:integration` | 本地 MySQL、Redis、ClamAV 和初始化数据 |
| 空库初始化 | `pnpm --dir backend test:integration:init` | 独立临时库的迁移、约束、两次 seed、权限和页面/按钮绑定 |
| 全量单元测试 | `pnpm --dir backend test` | 所有不依赖外部服务的测试 |

测试文件按被测职责放在对应模块下；命令分组是执行入口，不改变生产模块职责。

## 2. 本地真实依赖测试

`test:integration` 从 `backend/.env` 读取连接配置，执行以下检查：

- MySQL：连接、字段权限结构、默认租户、默认组织和默认部门；不修改业务数据；
- Redis：`PING`、临时随机键、`NX` 防重复和清理；
- ClamAV：使用仓库中的 EICAR 测试样本，必须返回病毒命中；
- 文件扫描和风险分级：使用独立标识的测试记录验证任务、租约、并发、审批目标和事务回滚，结束后清理自身记录；
- 空库初始化：只允许本机 MySQL，创建随机命名临时库，验证完整迁移、schema 零差异、CHECK 启用/禁用检测与实际约束、两次 seed 幂等、API/字段策略、页面/按钮绑定和四个独立管理员，最终删除自身临时库，不重置业务库；需要临时库 CREATE/DROP 权限；
- 所有检查失败都必须失败退出，不能降级为 Mock 或跳过。

测试入口：

```bash
pnpm --dir backend test:integration
pnpm --dir backend test:integration:init
```

该命令只允许在本地专用环境执行。禁止指向生产数据库、生产 Redis 或生产 ClamAV。

初始化测试文件为 `integration-tests/prisma-initialization.test.ts`，复用同一个集成测试入口；不通过默认数据库预检执行建库、迁移或 seed。默认 `scripts/verify-permission-migration.js` 和 `prisma/permission-preflight.sql` 均只读；其 `--source` 模式只检查仓库源文件且不连接数据库，`--single-baseline` 仅用于当前单一基线的显式验收。

## 3. 前端测试

前端测试配置位于 `frontend/vitest.config.js`，测试文件位于 `frontend/test/unit/`。Vite 8 前端代码和前端测试不得使用 `process.env`；浏览器构建配置统一使用 `import.meta.env`。只有 Node 侧的本地依赖测试脚本可以使用 `process.env` 读取后端 `.env`：

```bash
pnpm --dir frontend test
pnpm --dir frontend test:unit
pnpm --dir frontend build
```

必须覆盖：

- 上传状态机：扫描中、完成、拒绝和终态；
- `FileUploader` 组件：业务参数构造、文件匹配后续传、分片失败恢复、终态关闭 SSE/轮询和错误事件；
- 后端动作权限映射：字符串和对象格式、缺失数据默认拒绝；
- 幂等路由策略：完整幂等、短时锁、分片和查询不附加通用 Key；
- 登录失败 loading、认证弹窗、SSE 浏览器断线重连和页面生命周期仍需要独立浏览器 E2E；不能用纯函数测试替代。

## 4. 不可由当前测试直接证明的内容

以下场景需要独立环境或工具，普通单元测试不得标记为已覆盖：

- 多实例并发、真实数据库锁和事务隔离；
- 浏览器 EventSource、SSE 断线重连和页面生命周期；
- 登录 loading 恢复、全局认证弹窗、真实浏览器 EventSource 和上传页面刷新；
- 真实对象存储、分片恢复、下载流和文件删除恢复；
- 生产级 Redis 故障转移、ClamAV 超时和扫描进程重启；
- 网络攻击、渗透、并发压测和灾备恢复。

这些内容必须建立浏览器 E2E、数据库集成、多实例测试、故障注入或安全测试环境后再验收，不能通过增加 Mock 断言替代。

## 5. 开发验收顺序

```text
前端单元测试
→ 后端职责单元测试
→ 后端构建和类型检查
→ 本地 MySQL/Redis/ClamAV 集成测试
→ 前端正式构建
→ 迁移和初始化验证
```

任何一层失败都必须保留失败结果。外部依赖不可用时标记为阻塞，不得自动改用 Mock、跳过或放宽断言。

