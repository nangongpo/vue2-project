# 审批模块安全契约

本文档是审批 API、权限目录、风险控制、租户边界和审计实现之间的统一契约。实现以 `ApprovalController`、`ApprovalService`、`approval.dto.ts`、权限目录和 Prisma `ApprovalRequest` 模型为准。

审批不是普通 CRUD。所有状态变更必须经过服务端身份、职责、目标、有效期、风险证明和状态机校验，并在可串行化事务中完成。

## 1. 基本安全原则

1. 审批申请人、审批人、执行人和审计复核人必须使用服务端认证身份，客户端不能提交或覆盖操作者身份。
2. 审批目标必须通过服务端校验；浏览器端申请高风险用户或角色变更时，必须使用短期、绑定申请人的 `targetRef`，不能直接提交目标用户或角色 ID。
3. 单租户和多租户均必须使用当前 Session 的租户上下文。申请、目标、角色、用户、组织、部门、文件和数据范围不得跨租户引用；租户上下文不明确时拒绝。
4. `SECURITY`、`AUDIT`、`SYSTEM` 和 `BUSINESS` 是职责类型，不得使用超级管理员绕过职责隔离。
5. 审批有效期只控制审批流程，不自动延长角色授权、撤销时间或其他业务对象有效期；业务授权期限必须放在对应 payload 中。
6. 数据库写入、目标变更和审批审计必须全部成功或全部回滚。
7. 任何状态竞争、目标已变化、审计失败或租户边界无法确认，都必须保持拒绝状态。

## 2. API 基础约定

基础路径：`/api/v1/permission/approvals`。

所有 ID 均使用公开 UUID；不得返回或接受数据库自增整数 ID。审批沟通使用 `requestNo`，API 定位使用 `id`。

| 方法 | 路径 | 权限 | 服务端职责 |
| --- | --- | --- | --- |
| POST | `/` | `system.approval.create` | 创建审批申请 |
| GET | `/target-options` | `system.approval.target-options` | 查询短期目标引用 |
| GET | `/` | `system.approval.read` | 分页查询审批 |
| GET | `/:id` | `system.approval.detail` | 查询审批详情 |
| POST | `/:id/approve` | `system.approval.approve` | 安全管理员审批 |
| POST | `/:id/execute` | `system.approval.execute` | 安全管理员执行 |
| POST | `/:id/review` | `system.approval.review` | 审计管理员复核 |
| POST | `/:id/cancel` | `system.approval.cancel` | 申请人撤回 |

路由顺序必须保证 `/target-options` 在 `/:id` 之前注册。所有路由都要求认证；权限守卫还要校验权限代码、方法和规范化路径是否匹配。

## 3. 职责和权限

审批服务要求操作者账户为 ACTIVE，且只能拥有一个非 BUSINESS 的职责类型：

| 操作 | 允许职责 | 额外要求 |
| --- | --- | --- |
| 创建申请 | SECURITY | `system.approval.create` 加目标类型所需的业务权限 |
| 查询目标 | SECURITY | `system.approval.create`、`system.approval.target-options` |
| 列表/详情 | SECURITY 或 AUDIT | 对应 read/detail 权限 |
| 审批 | SECURITY | `system.approval.approve`、`system.role.review` |
| 执行 | SECURITY | `system.approval.execute` 加目标类型所需的执行权限 |
| 复核 | AUDIT | `system.approval.review` |
| 撤回 | SECURITY | 只能撤回本人仍处于 REQUESTED 的申请 |

不能把 AUDIT 与 SECURITY 同时绑定到一个审批操作者，也不能把 BUSINESS 角色用于审批控制链。创建时还必须存在另一名 ACTIVE、启用 MFA 且拥有审批权限的独立 SECURITY 管理员。

权限目录中的审批代码为：

```text
system.approval.create
system.approval.target-options
system.approval.read
system.approval.detail
system.approval.approve
system.approval.execute
system.approval.review
system.approval.cancel
```

L3 审批接口由权限目录风险基线触发最近五分钟的安全证明：启用 MFA 的账号必须同时具备最近 MFA 验证和重新认证；未启用 MFA 的账号至少需要最近重新认证。缺少证明时返回统一的安全升级错误，不接受客户端提交时间戳代替证明。

## 4. 审批类型

当前支持的 `kind`：

```text
ROLE_GRANT              角色授予
ROLE_STATUS             角色停用
ROLE_PERMISSIONS        角色权限授予
ROLE_REVOKE             角色回收
ROLE_PERMISSION_REVOKE  角色权限回收
ELEVATED_SCOPE          受控数据范围授权
ELEVATED_REVOKE         受控数据范围回收
MFA_RESET               重置用户多因素认证
API_ROUTE_CHANGE        已登记 API 路由变更
API_CREATE              创建业务 API 权限
API_UPDATE              修改 API 名称
API_ENABLE              启用 API
API_DISABLE             停用 API
API_DELETE              删除 API
PAGE_ENABLE             启用页面
PAGE_DISABLE            停用页面
PAGE_ROUTE_CHANGE       修改页面路由/组件
FILE_DELETE             删除文件
FILE_REJECT             拒绝文件
FILE_RESTORE            恢复文件
FILE_RESCAN             重新扫描文件
```

未知类型、类型与 payload 不匹配、包含未允许字段的 payload 都必须拒绝。审批类型必须与实际目标和执行器注册关系一致，不能通过伪造 `kind` 改变执行路径。

## 5. 创建申请

请求体：

```ts
type CreateApproval = {
  kind: ApprovalKind
  reason: string          // 非空，最多 255 个字符
  expiresAt: string       // 严格 ISO-8601，必须为未来时间
  payload: Record<string, unknown>
}
```

通用约束：

- `reason` 去除首尾空白后不能为空；
- `expiresAt` 必须在创建时刻之后，并符合类型对应的最大有效期；
- `payload` 必须是对象，禁止数组和未知字段；
- 数组参数必须去重并受 DTO 限制；权限 ID 和目标最多 200 个；
- 目标、权限、角色、页面、API、文件和数据资源必须在当前租户及有效状态范围内；
- API 路径必须规范化、非通配，并符合后端已注册路由或业务 API 规则；
- 客户端不能传 `actorId`、`internalId`、MFA 时间、MFA 秘密、会话标识或任意审批人字段。

### 5.1 Payload 契约

```ts
ROLE_GRANT / ROLE_REVOKE:
{ userId: string, roleId: string, grantExpiresAt?: string | null }

ROLE_STATUS:
{ roleId: string, status: 'ACTIVE' | 'DISABLED' }

ROLE_PERMISSIONS / ROLE_PERMISSION_REVOKE:
{ roleId: string, permissionIds: string[] } // 1–200 个 UUID

MFA_RESET:
{ userId: string }

ELEVATED_SCOPE:
{
  roleId: string,
  scopeType: 'CUSTOM' | 'ALL',
  resource: string,
  targets: { targetType: 'USER'|'DEPARTMENT'|'ORGANIZATION'|'TENANT', targetId: string }[]
}

ELEVATED_REVOKE:
{ scopeId: string }

API_ROUTE_CHANGE:
{ apiId: string, code: string, method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE', path: string }

API_CREATE:
{ code: string, name: string, method: string, path: string, resource: string, action: string }

API_UPDATE:
{ apiId: string, name: string }

API_ENABLE / API_DISABLE / API_DELETE:
{ apiId: string }

PAGE_ENABLE / PAGE_DISABLE:
{ pageId: string }

PAGE_ROUTE_CHANGE:
{ pageId: string, route: string, component?: string }

FILE_DELETE / FILE_REJECT / FILE_RESTORE / FILE_RESCAN:
{ fileId: string }
```

### 5.2 浏览器目标引用

浏览器申请涉及用户或角色时，先调用：

```http
GET /api/v1/permission/approvals/target-options?kind=ROLE_GRANT&targetType=USER&keyword=...
```

支持的 `targetType` 只有 `USER` 和 `ROLE`。响应中的 `targetRef`：

- 只绑定当前申请人、审批类型和目标类型；
- 仅五分钟有效；
- 只能使用一次；
- 服务端保存哈希，不保存明文引用；
- 不得由前端自行生成、修改或重复提交。

外部创建时，`ROLE_GRANT`、`ROLE_REVOKE` 使用 `userRef` 和 `roleRef`，`MFA_RESET` 使用 `userRef`，其他涉及角色的类型使用 `roleRef`。服务端在同一事务中消费引用并解析为目标 UUID。内部受控调用 `createInternal` 可以使用已由业务服务授权的正式 payload，但仍必须经过同一套 payload 和目标校验。

## 6. 有效期

| 类型 | 最大审批有效期 |
| --- | ---: |
| `ROLE_GRANT` | 4 小时 |
| `ROLE_PERMISSIONS` | 4 小时 |
| `ELEVATED_SCOPE` | 4 小时 |
| `MFA_RESET` | 1 小时 |
| `ROLE_STATUS` | 24 小时 |
| 回收、API、页面和文件相关类型 | 24 小时 |

审批有效期到期后：

- 申请、审批和执行不能继续；
- 复核仍可进行，用于记录已执行结果；
- 列表和详情保留原始 `status`，另以 `deadlineStatus=EXPIRED` 表示过期；
- 过期不自动撤销已经执行的业务变更；
- 撤回仅允许申请人撤回 REQUESTED 申请，成功后状态为 `CANCELLED`。

## 7. 状态机和职责隔离

```text
REQUESTED ── approve ──> APPROVED ── execute ──> EXECUTED ── review ──> REVIEWED
    │
    └──────────── cancel ────────────> CANCELLED
```

状态迁移必须使用“原状态 + 条件更新”抢占：

| 操作 | 原状态 | 新状态 | 执行人 |
| --- | --- | --- | --- |
| `approve` | REQUESTED | APPROVED | 独立 SECURITY |
| `execute` | APPROVED | EXECUTED | SECURITY |
| `review` | EXECUTED | REVIEWED | 独立 AUDIT |
| `cancel` | REQUESTED | CANCELLED | 原申请人 |

安全约束：

- 申请人不得审批自己的申请；
- 申请人、审批人、执行人、复核人不能成为授权受益人；
- MFA_RESET 的目标用户不能参与任何阶段；
- 复核人必须不同于申请人、审批人和执行人；
- 审批人和执行人可以是同一 SECURITY 账号，但仍需满足阶段权限和安全证明；
- 回收类操作允许处理已停用角色、已过期授权和历史授权，但参与人不能正在持有被回收角色；
- API、页面和文件生命周期类操作不按角色受益人判断，但仍必须执行目标状态和职责校验。

## 8. 目标校验和执行规则

### 8.1 角色与权限

- 角色必须存在；
- 角色授予必须确认目标用户 ACTIVE、未过期，且不能形成互斥管理员职责；
- 权限必须 ACTIVE、有明确角色类型策略，禁止通配权限、`*`、`ALL`、通配路径和 `system.permission.manage`；
- BUSINESS 角色不能获得管理接口、目录管理或审计管理权限；
- 角色回收、角色权限回收只允许回收当前存在且未回收的授权。

### 8.2 API 与页面

- 管理目录由服务端代码维护，不能通过普通审批创建或改写受保护管理接口；
- 已授权 API 不能直接变更路由，必须先撤销既有角色授权；
- API 删除前必须没有页面、按钮或角色引用；
- 页面目录不能单独启停目录节点；
- 页面和 API 停用时，相关角色授权按执行事务自动撤销并记录原因。

### 8.3 数据范围

- `resource` 必须是业务数据资源目录中的 ACTIVE 资源；
- `CUSTOM` 必须至少包含一个目标，`ALL` 必须为空目标集合；
- 用户、部门、组织和租户目标必须存在且 ACTIVE，并属于当前租户；
- 执行后保存 `approvalRef`、有效期、目标集合和完整审计证据；
- 回收只改变有效状态，不删除历史授权记录。

### 8.4 文件生命周期

文件删除、拒绝、恢复和重新扫描统一由文件模块注册执行处理器。审批执行事务只处理状态、元数据和持久化任务，不等待合并、ClamAV 或其他长时间 IO。

- 删除：只能处理未删除文件；
- 拒绝：已删除文件不能拒绝；
- 恢复：只能处理已删除文件，恢复后必须重新进入隔离和扫描；
- 重新扫描：已删除文件不能重新扫描；
- 执行后文件不得绕过 `READY + CLEAN` 安全条件；
- 文件审批、任务和审计必须带当前租户边界。

### 8.5 MFA 重置

MFA_RESET 只能针对 ACTIVE 且未过期用户。执行时清除 MFA 秘密和计数器，并撤销该用户的有效会话；不得在申请或审批阶段修改账户状态。

## 9. 请求和响应

审批动作请求体统一为：

```json
{ "note": "非空处理意见，最多 255 个字符" }
```

创建成功返回 HTTP 201，其余成功操作返回 HTTP 200。统一响应：

```json
{ "code": "000000", "message": "success", "data": {} }
```

列表查询参数：

```text
status = REQUESTED | APPROVED | EXECUTED | REVIEWED | CANCELLED
cursor = 审批 id UUID
```

固定每页最多 50 条，按 `createdAt DESC, id DESC` 排序，返回 `items` 和 `nextCursor`。列表只返回展示和动作判断所需字段；payload、阶段时间、阶段意见和取消信息只在详情返回。

详情中的主要字段：

```text
id, requestNo, kind, kindLabel, status, statusLabel
deadlineStatus, expired, availableActions
reason, payload, expiresAt, createdAt, updatedAt
applicant, approver, executor, reviewer, canceller
approvedAt, executedAt, reviewedAt
approvalNote, executionNote, reviewNote
cancelledAt, cancellationNote
```

内部整数 ID、密码、OTP、Cookie、Session Token、MFA 秘密、目标引用明文、扫描协议和数据库堆栈不得出现在响应或审计详情中。

## 10. 错误与并发

| HTTP | 场景 |
| --- | --- |
| 400 | payload、类型、目标引用、原因或有效期格式无效 |
| 401 | 登录态缺失或失效 |
| 403 | 职责、权限、租户、受益人或安全证明不满足 |
| 404 | 审批单或目标不存在 |
| 409 | 状态竞争、目标已变化、重复授权、目标引用已使用或引用冲突 |

数据库 `P2034`、`P2002`、`P2025` 等并发/约束错误统一转换为 409。收到 409 后客户端必须重新读取审批详情，不能假设执行成功。

创建、状态抢占、业务目标变更和审批审计使用 Serializable 事务。文件执行器、任务状态和审计失败时必须整体回滚或进入明确的补偿状态，不能返回成功后静默重试。

## 11. 审计要求

每个创建、审批、执行、复核和撤回动作至少记录：

```text
traceId, actorId, actorUserId, tenantId
approvalId, requestNo, kind, action, riskLevel
before, after, result, statusCode, sourceIp, userAgent
```

审计详情必须脱敏，禁止记录密码、OTP、Cookie、Token、MFA 秘密、文件原文、完整下载 URL、ClamAV 协议原文和内部堆栈。业务目标的 before/after 快照与审批状态变更必须在同一事务中写入。

## 12. 验收清单

- [ ] 所有 21 种审批类型的 payload 严格校验；
- [ ] 未知字段、未知 kind、直接伪造操作者和目标 ID 均被拒绝；
- [ ] targetRef 绑定申请人、类型、租户，五分钟过期且只能使用一次；
- [ ] 单租户和多租户均拒绝空租户、跨租户目标和停用租户目标；
- [ ] 申请人不能审批、执行或复核本人受益的授权；
- [ ] 审批人和执行人满足 SECURITY 职责，复核人满足 AUDIT 职责；
- [ ] MFA 和重新认证证明超时后拒绝 L3 操作；
- [ ] 过期申请不能审批/执行，但可复核；
- [ ] 取消只允许申请人撤回 REQUESTED 申请；
- [ ] 角色、权限、页面、API、数据范围和文件目标状态校验正确；
- [ ] 状态竞争返回 409，事务回滚且不产生半完成授权；
- [ ] 文件恢复后重新扫描，扫描不确定时不得放行；
- [ ] 所有阶段写入完整审计，敏感信息不泄露；
- [ ] 备份恢复、租户切换和任务重试不会造成跨租户审批或重复执行。
