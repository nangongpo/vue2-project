# 权限体系设计与表结构关系图

本设计对应 [REQUIREMENTS.md](REQUIREMENTS.md)，采用显式 RBAC、资源状态检查、职责互斥、受控审批和服务端数据范围。[`prisma/schema.prisma`](../prisma/schema.prisma) 为字段定义来源，迁移中的 CHECK、审计保护触发器补充 Prisma 不表达的约束。要求 MySQL 8.0.16 及以上；开发执行命令前必须 `nvm use`。

## 表结构关系图

```mermaid
erDiagram
    TENANT ||--o{ ORGANIZATION : contains
    TENANT ||--o{ DEPARTMENT : isolates
    ORGANIZATION o|--o{ ORGANIZATION : parent
    ORGANIZATION ||--o{ DEPARTMENT : contains
    DEPARTMENT o|--o{ DEPARTMENT : parent
    TENANT o|--o{ USER : belongs
    ORGANIZATION o|--o{ USER : belongs
    DEPARTMENT o|--o{ USER : belongs
    USER ||--o{ SESSION : authenticates
    USER ||--o{ PASSWORD_HISTORY : remembers
    USER ||--o{ USER_ROLE : assigned
    ROLE ||--o{ USER_ROLE : grants
    ROLE ||--o{ ROLE_PERMISSION : assigned
    PERMISSION ||--o{ ROLE_PERMISSION : grants
    DATA_RESOURCE ||--o{ ROLE_DATA_SCOPE : defines
    DATA_RESOURCE ||--o{ ELEVATED_SCOPE : defines
    PERMISSION ||--o| PAGE : page_subtype
    PERMISSION ||--o| BUTTON : button_subtype
    PAGE o|--o{ PAGE : parent
    PAGE ||--o{ BUTTON : owns
    PAGE ||--o{ PAGE_API : explicitly_binds
    PERMISSION ||--o{ PAGE_API : read_api
    BUTTON ||--o{ BUTTON_API : explicitly_binds
    PERMISSION ||--o{ BUTTON_API : operation_api
    ROLE ||--o{ ROLE_DATA_SCOPE : standard
    ROLE ||--o{ ELEVATED_SCOPE : approved
    ELEVATED_SCOPE ||--o{ SCOPE_TARGET : targets
    USER o|--o{ SCOPE_TARGET : user_target
    DEPARTMENT o|--o{ SCOPE_TARGET : department_target
    ORGANIZATION o|--o{ SCOPE_TARGET : organization_target
    TENANT o|--o{ SCOPE_TARGET : tenant_target
    USER o|--o{ AUDIT_LOG : actor
    USER ||..o{ APPROVAL : actors_by_public_uuid
    APPROVAL ||..o{ ELEVATED_SCOPE : approvalRef
    APPROVAL o|..o{ USER_ROLE : approvalRef
    APPROVAL o|..o{ ROLE_PERMISSION : approvalRef

    USER {
      bigint id PK "内部，不对外返回"
      uuid userId UK
      string username UK
      string passwordHash
      string status
      datetime expiresAt
      boolean mfaEnabled
      string mfaSecret "AES-GCM 密文"
      bigint mfaLastStep "防重放"
    }
    ROLE {
      bigint id PK
      uuid roleId UK
      string code UK
      enum roleType "BUSINESS SYSTEM SECURITY AUDIT"
      enum status
    }
    PERMISSION {
      uuid id PK
      string code UK
      enum type "PAGE BUTTON API MANAGEMENT"
      relation sys_permission_role_type(permissionId, roleType)
      string method "API 真实方法"
      string path "与 method 组成唯一键"
      string resource
      string action
      enum status
    }
    USER_ROLE {
      bigint userId PK,FK
      bigint roleId PK,FK
      datetime assignedAt
      datetime expiresAt
      datetime revokedAt
      uuid grantedBy
      uuid revokedBy
      string grantReason
      string revokeReason
      uuid approvalRef
    }
    ROLE_PERMISSION {
      bigint roleId PK,FK
      uuid permissionId PK,FK
      datetime assignedAt
      datetime expiresAt
      datetime revokedAt
      uuid grantedBy
      uuid revokedBy
      string grantReason
      string revokeReason
      uuid approvalRef
    }
    ROLE_DATA_SCOPE {
      uuid id PK
      bigint roleId FK
      string resource FK "DataResource.code"
      enum scopeType "标准范围"
      datetime expiresAt
      datetime revokedAt
    }
    DATA_RESOURCE {
      uuid id PK
      string code UK "稳定业务资源编码"
      string name "中文名称，可修改"
      string description
      enum status "ACTIVE DISABLED"
    }
    APPROVAL {
      uuid id PK
      enum kind
      enum status "REQUESTED APPROVED EXECUTED REVIEWED CANCELLED"
      json payload "按 kind 严格校验的不可变申请"
      string reason
      datetime expiresAt
      uuid applicantId
      uuid approverId
      uuid executorId
      uuid reviewerId
    }
    ELEVATED_SCOPE {
      uuid id PK
      bigint roleId FK
      string resource FK "DataResource.code"
      enum scopeType "CUSTOM ALL"
      uuid approvalRef
      string reason
      datetime validFrom
      datetime expiresAt "必须大于 validFrom"
      datetime revokedAt
    }
    SCOPE_TARGET {
      uuid id PK
      uuid elevatedScopeId FK
      enum targetType
      uuid targetId "与类型、授权组成唯一键"
      uuid targetUserId FK
      uuid targetDepartmentId FK
      uuid targetOrganizationId FK
      uuid targetTenantId FK
    }
```

实线表示数据库外键；虚线为保留历史身份的公开 UUID 引用，由事务内服务验证。图中 PAGE、BUTTON、PAGE_API 分别对应 `sys_function`、`sys_function_button`、`sys_function_api`。DATA_RESOURCE 对应 `sys_data_resource`，ROLE_DATA_SCOPE、ELEVATED_SCOPE 的 `resource` 均以数据库外键引用 `DATA_RESOURCE.code`。字段权限资源不引用 DATA_RESOURCE，避免管理资源和数据范围资源混用。SCOPE_TARGET 对应 `sys_role_elevated_data_scope_target`。同一个授权对象可以被撤销、续期，但每次变更前后完整快照必须保存在不可更新的审计记录中。

## 权限码分类与生成规则

完整、可执行的权限码命名规则见 [PERMISSION_CODE_STANDARD.md](PERMISSION_CODE_STANDARD.md)。本节作为权限体系设计中的摘要；新增权限码和迁移权限码时，以独立规范文档为准。

权限码是服务端稳定的安全标识，不是页面显示名称，也不是前端路由别名。所有内置权限码由服务端目录或字段生成器产生；客户端只能引用已登记的权限码，不能自行拼接、模糊匹配或根据前缀推导权限。

### 1. 通用语法

```text
权限码 = 分类前缀 + "." + 资源段 + "." + 动作段
```

统一约束：

- 使用小写 ASCII 字符、数字、点号和短横线；不使用下划线和 camelCase 资源名。
- 点号表示权限层级；同一层内的多词资源或动作使用 kebab-case，例如 `operation-policy`、`reset-password`。
- 资源名使用稳定的业务资源单数形式，例如 `user`、`role`、`ops-ticket`；不要直接使用数据库表名、Controller 名或 URL 复数形式。
- 字段名保留模型原字段名的大小写，以便与响应字段一一对应，例如 `displayName`、`createdAt`；字段名不得使用 `_count` 等查询层临时别名。
- 权限码长度不超过 128 个字符；每个权限码全局唯一。API 权限还必须保证 `(method, path)` 全局唯一。
- 权限码一经写入生产库不得复用。改名必须走迁移：旧码撤销/停用、新码建立、角色授权和页面/按钮绑定在同一受控流程中迁移，并记录前后快照。

### 2. 页面权限

```text
page.<domain>.<resource>
```

示例：

```text
page.system.user
page.system.permission
page.system.ops-ticket
```

页面权限只表示页面和路由访问，不表示按钮、API 或数据字段授权。页面权限不能自动产生按钮权限或 API 权限。

### 3. API 权限

```text
system.<resource>.<action>
system.<resource>.<sub-resource>.<action>
```

API 权限的最后一段必须是明确动作，并且与真实 HTTP 方法和路由模板绑定：

| 动作类别 | 标准动作 | 典型方法 | 语义 |
| --- | --- | --- | --- |
| 查询 | `read`、`detail`、`options` | GET | 列表、详情、选择器数据 |
| 创建 | `create` | POST | 创建资源 |
| 修改 | `update` | PATCH/PUT | 修改资源内容 |
| 启用 | `enable` | PATCH | 页面启用；业务页面为 L2，系统内置页面提交 L3 受控审批 |
| 停用 | `disable` | PATCH | 页面停用；业务页面为 L2，系统内置页面提交 L3 受控审批，并撤销页面角色授权 |
| 删除 | `delete` | DELETE | 受引用保护的物理删除 |
| 绑定 | `bind` | PATCH | 建立页面/API 或按钮/API 绑定 |
| 授权 | `grant`、`revoke` | PATCH/POST | 授权和撤销授权 |
| 流程 | `submit`、`approve`、`execute`、`review`、`cancel` | POST | 受控流程状态迁移 |
| 输出/校验 | `export`、`verify` | GET/POST | 导出或完整性校验 |

推荐示例：

```text
system.user.read
system.user.reset-password
system.page.api.read
system.page.api.options
system.page.api.bind
system.button.api.bind
system.field.read
system.field.update
system.field.status
system.data-scope.read
system.data-scope.update
system.data-scope.revoke
system.operation-policy.create
```

以下动作不得作为新的通用权限动作：`manage`、`disable`、`apis`、`executions`。它们应分别替换为具体动作或子资源动作，例如 `status`、`api.read`、`execution.create`。

### 4. 按钮权限

按钮权限是页面内可见操作的独立授权对象，推荐格式为：

```text
button.<domain>.<resource>.<action>
```

当前 seed 中由 API 权限生成的按钮权限保留 `button.system.<resource>.<action>` 形式，例如：

```text
button.system.page.create
button.system.user.reset-password
```

按钮权限只决定操作入口是否可用；真正的写入、导出、审批等 API 必须同时满足角色显式 API 授权和按钮/API 明确绑定。不能因为按钮存在或按钮权限有效而自动获得 API 权限。

### 5. 数据字段权限

业务数据字段使用资源、字段和读写动作组成权限码：

```text
<resource>.field.<field>.<read|write>
```

示例：

```text
system.user.field.username.read
system.user.field.username.write
system.role.field.roleType.read
system.api.field.path.read
```

规则：

- `field` 是固定分隔段，不得替换成 `data-field` 或其他别名。
- 只有字段定义声明 `writable: true` 时才生成 `write` 权限。
- `read` 和 `write` 是字段权限的唯一动作；字段风险等级存储在字段定义上，不编码进权限码。
- `system.permission.field.id.read` 表示 `Permission` 数据模型的 `id` 字段读取权限，不表示字段管理接口。
- 字段管理 API 使用独立资源 `system.field.*`，不得继续使用 `system.permission.field.*`，以免和数据字段权限混淆。
- 按钮定义自身的字段仍使用 `system.button.field.<field>.<read|write>`，它属于配置对象字段权限，不是业务数据字段权限。

### 6. 数据范围资源字典

`sys_data_resource` 只登记可以配置角色数据范围的业务数据对象，例如 `order`、`customer`、`invoice`。它不是通用资源表，也不承载接口权限、页面权限、字段权限或审计资源。

严格分层：

- `system.ops-ticket` 只用于应急工单接口权限、字段权限和审计，不能写入数据范围资源字典。
- `system.user`、`system.role`、`system.api` 等管理对象只属于管理权限/字段权限域，不能因为存在字段定义就自动成为数据范围资源。
- 业务模块登记资源时必须提供稳定编码和中文名称；角色数据范围只能选择字典中状态为 `ACTIVE` 的资源。
- 数据范围资源编码必须是业务命名空间，禁止使用 `system.*`、`page.*` 等管理命名空间；管理资源即使存在于权限或字段目录，也不能用于普通或受控数据范围。
- 资源编码是内部稳定标识，中文名称只用于展示。编码一经使用不得复用或改名；停用资源禁止新增授权，但保留历史授权和审计记录。
- 资源字典 API 只允许修改中文名称、描述和状态，不提供资源编码修改接口；数据范围表通过数据库外键引用 `DataResource.code`，禁止孤立编码。
- 业务查询必须使用同一资源编码调用数据范围服务，由服务端把当前用户的有效范围加入查询条件；仅在字典中登记资源不会自动产生数据过滤。

### 7. 生成来源与禁止事项

| 分类 | 生成来源 | 是否允许客户端创建 |
| --- | --- | --- |
| PAGE | seed 页面目录 | 否，服务端目录维护 |
| API | `permission-catalog.ts` 或受控业务 API 注册 | 仅允许受保护的管理流程 |
| BUTTON | 页面按钮创建流程，绑定独立按钮权限 | 只能通过按钮管理接口 |
| DATA FIELD | Prisma 字段生成器和受控覆盖项 | 不能由客户端任意声明 |
| BUTTON FIELD | `button-field-policy.ts` | 否，代码目录维护 |
| DATA SCOPE RESOURCE | 业务模块资源登记接口 | 只能由受保护的资源管理流程登记 |

禁止使用以下方式扩大权限：

- 使用 `*`、前缀匹配、资源名匹配或“超级管理员”旁路。
- 用页面权限推导按钮/API 权限。
- 用字段名称、路由或 HTTP 方法临时拼出权限码。
- 将写入、导出、审批接口加入页面基础 API。
- 将历史 `system.permission.manage` 或其他旧码重新启用。

### 7. 现有权限码迁移计划

以下是目标命名，不在本节更新时直接修改生产授权数据：

| 现有权限码 | 目标权限码 | 原因 |
| --- | --- | --- |
| `system.permission.field.read` | `system.field.read` | 区分字段管理 API 与 `system.permission.field.<field>.*` |
| `system.permission.field.update` | `system.field.update` | 同上 |
| `system.permission.field.disable` | `system.field.status` | 当前接口实际支持启用和停用 |
| `system.data.read` | `system.data-scope.read` | 明确是数据范围而非数据字段 |
| `system.data.update` | `system.data-scope.update` | 同上 |
| `system.data.revoke` | `system.data-scope.revoke` | 同上 |
| `system.page.bind-api` | `system.page.api.bind` | 统一资源与动作顺序 |
| `system.button.bind-api` | `system.button.api.bind` | 统一资源与动作顺序 |
| `system.page.apis` | `system.page.api.read` | `apis` 不是明确动作 |
| `system.page.api-options` | `system.page.api.options` | 与页面 API 子资源保持一致 |
| `system.operation-policy.manage` | `system.operation-policy.create` | 当前接口实际创建策略 |
| `system.ops-ticket.executions` | `system.ops-ticket.execution.create` | 当前接口实际新增执行记录 |

迁移必须先做代码目录、seed、后端装饰器、前端指令和测试的全量替换，再在数据库中迁移角色授权、页面/按钮绑定和审计引用。旧码不得与新码同时长期有效，也不得通过兼容前缀自动放行。

## 权限角色策略模型

权限的“默认职责类型”和“实际允许角色类型”分开维护，避免用权限码特判共享权限。

### 1. 服务端权限目录声明

权限目录中的每个权限必须声明一种角色策略：

- `SINGLE_ROLE`：只能由一个角色类型使用，例如应急工单执行权限只能由 SECURITY 使用；
- `ROLE_ALLOWLIST`：允许多个明确角色类型使用，例如应急工单查询和详情允许 SECURITY、SYSTEM、AUDIT 使用。

目录声明是服务端唯一的初始来源，不接受前端提交的角色类型或角色白名单。权限表不再保存旧的单角色职责字段；`sys_permission_role_type` 是运行时唯一的职责允许列表。

### 2. 数据库归一化关联

`sys_permission_role_type` 保存权限与允许角色类型的多对多关系：

```text
sys_permission
       │
       └── sys_permission_role_type(permissionId, roleType)
```

权限目录初始化和动态新增页面、按钮、接口、字段权限时，必须同步写入该关联。权限目录变更需要通过迁移、初始化或受控管理流程更新关联，并记录审计。

### 3. 运行时判定

运行时按以下顺序拒绝优先判断：

1. 权限、角色和授权关系必须处于有效状态；
2. 如果存在 `sys_permission_role_type` 关联，以数据库关联中的允许角色类型为准；
3. 缺少关联时拒绝授权，必须先由迁移、初始化或受控管理流程补齐；
4. 不允许根据权限码前缀、页面名称、路由或前端传参推断角色范围；
5. 页面、按钮、API、字段和数据范围仍分别授权，角色类型允许不等于自动获得其他资源权限。

共享只读权限和操作权限必须拆开声明。以应急工单为例：查询、详情是 `ROLE_ALLOWLIST`，创建、提交、审批、执行是 SECURITY/SYSTEM 操作权限，审计复核是 AUDIT 单角色权限。

## 权限判定

每个业务/管理路由必须声明 `RequirePermissions`；缺少声明时拒绝。健康、登录、验证码及本人账户操作使用守卫中的封闭例外目录，本人操作仍由 AuthGuard 和服务内所有权校验保护。

1. 从服务端会话加载用户状态、账户期限、会话吊销、绝对/闲置期限。
2. 加载启用角色和未撤销、未过期的角色/权限授权。每次请求重新计算，权限数据库不可用则拒绝；不依赖可过期的允许缓存。
3. 校验角色职责是否命中 `sys_permission_role_type`，拒绝互斥管理员职责。共享审批查询和其他多职责权限只能通过服务端显式职责关联开放。
4. 校验页面祖先均有效且已明确授权；按钮还需要所属页面有效且已授权。
5. API 需要独立显式授权。若存在页面或按钮绑定，至少有一条有效且已授权的访问路径。绑定本身不生成 API 或按钮授权。
6. 将请求方法和 Fastify 已匹配的路由模板与授权 API 精确比较，忽略原始 URL 中查询参数；不使用客户端提交的路径作为判定依据。
7. 管理员要求 MFA；高危操作同时要求五分钟内的 MFA 和重新认证。
8. 业务仓储通过 `DataScopeService.execute` 在同一事务中生成并执行 `AND(租户边界, 各有效范围, 请求筛选)`。所有范围取交集；SELF 使用当前公开 userId，组织树来自主数据。ALL 也不能突破当前租户。

## 职责与审批

| 职责 | 允许领域 | 与其互斥的管理职责 |
| --- | --- | --- |
| BUSINESS | 明确配置的业务资源 | 不得通过普通授权获得管理资源 |
| SYSTEM | 受控运行维护 | SECURITY、AUDIT |
| SECURITY | 账户、权限、审批执行 | SYSTEM、AUDIT |
| AUDIT | 审计查询、审批复核 | SYSTEM、SECURITY |

通配 `*`、`ALL` HTTP 方法及历史 `system.permission.manage` 不参与授权。角色类型不能通过普通角色创建/编辑请求修改。内置职责通过离线初始化维护，日常高危角色绑定和权限授予/回收走审批；不提供无期限超级管理员能力。

新密码采用 scrypt `N=131072, r=8, p=1` 与独立随机盐；旧 `N=16384` 哈希仅为存量验证保留，密码修改后使用新成本。口令长度 12–128 字符，支持复杂密码或长口令短语，阻止当前及最近五次历史重复，本人修改最短间隔 24 小时。MFA 使用带防重放计数的 TOTP，密钥以 AES-256-GCM 加密并绑定账户；并发会话默认最多三个。算法参数参考 [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)。

审批链：申请 → 独立安全管理员审批 → 安全管理员执行 → 独立审计管理员复核。申请人不能审批；复核人与前三阶段参与者不同；所有阶段不得为自己授予、回收、重置 MFA 或复核权限。MFA_RESET 用于管理员认证器丢失等恢复场景，要求显式 `system.user.mfa-reset` 能力，执行时清空目标用户 MFA 密钥/计数并吊销其现有会话，目标用户需重新登录并绑定认证器。申请有效期最长 24 小时。到期后禁止执行，允许事后复核。状态认领、实际变更与审计处于 Serializable 事务，重复执行返回冲突。

### L2/L3 安全认证响应契约

需要 MFA 和重新认证时，后端统一返回 HTTP `403`、业务码 `100013`，并在 `data` 中返回 `riskLevel`、`operationCode` 和 `requiredFactors`。L2 与 L3 使用同一固定业务码；L2 认证通过后继续原操作，L3 认证通过后进入或继续受控审批流程。前端只依据业务码 `100013` 弹出安全认证窗口，不得根据中文错误文案或其他响应字段判断。

### 审批申请撤回

申请人在审批状态为 `REQUESTED` 时，可以通过 `POST /api/v1/permission/approvals/:id/cancel` 撤回自己的申请，必须填写撤回原因。撤回不会删除审批记录，而是将状态变更为 `CANCELLED`，并保存撤回人、撤回时间和撤回原因。已审批、待执行、已执行或已复核的申请不可撤回；已生效授权只能通过新的反向审批申请撤销。

## 前后端接入

| 页面 | 对应接口 | 控制 |
| --- | --- | --- |
| `/system/permission` | `/permission/functions`、`/permission/buttons` | 页面树、根/子页面、编辑、启停、只读 API、按钮操作 API |
| `/system/api` | `/permission/apis`、`/permission/api-options` | 分页筛选、创建、编辑、启停、引用关系、无引用删除 |
| `/system/role` | `/roles`、`/roles/:id/grants`（GET 查询授权，PATCH 变更授权） | 列表只返回展示标签和服务端操作能力；授权明细仅通过受保护的 GET 接口按需读取 |
| 数据范围资源字典 | `/permission/data-resources` | 受保护登记、改名、启停；只服务角色数据范围 |
| 角色的数据范围弹窗 | `/permission/data-resources`、`/permission/roles/:roleId/data-scopes` | 选择启用资源；普通范围新增/撤销，CUSTOM/ALL 进入审批 |
| `/system/approval` | `/permission/approvals` | 四阶段审批、受控授予/回收、MFA 重置、详情与操作者 |
| `/system/session` | `/auth/mfa/*`、`/auth/reauth` | 认证器绑定、重新认证、本人会话管理 |
| `/system/audit` | `/audit-logs` | 审计检索及变更前后值，不提供普通更新/删除 |

完整的 API 方法、路由和职责目录位于 [`src/security/policies/permission-catalog.ts`](../src/security/policies/permission-catalog.ts)。审批请求结构见 [APPROVAL_CONTRACT.md](APPROVAL_CONTRACT.md)。GET 200、POST 创建 201、PATCH 200；接口资源删除返回 204。错误通过 Problem Details 返回，不暴露 Prisma/SQL 内部错误。

## 安全迁移与部署

1. 备份原库并在隔离库验证恢复；检查路由及 `(method,path)` 重复记录。DDL 不承诺事务回滚，失败时按已执行语句恢复。
2. 执行 `backend/prisma/permission-preflight.sql`，确认脚本返回结果为空；它会检查路由及 API 唯一性、权限绑定完整性、失效授权、高危角色约束、管理员 MFA 和权限编码格式。发现结果后先修复数据，再执行迁移。
3. 执行 `nvm use`，再执行 `pnpm --filter backend db:generate`、`pnpm --filter backend db:deploy`。迁移会吊销旧会话、撤销旧授权并禁用通配权限，必须安排维护窗口。
4. 通过秘密管理配置 MFA_ENCRYPTION_KEY（32 字节随机密钥的 Base64）、Redis、HTTPS/Cookie 和独立管理员账户。可用 `openssl rand -base64 32` 生成该密钥。密钥必须长期保存并在所有后端实例保持一致，不能在每次发布或容器重启时重新生成；更换或丢失后，已绑定的管理员 MFA 密文无法解密，需要通过 MFA_RESET 审批或受控离线流程重置。未配置或格式错误时，应用可能仍可启动，普通非管理员能力也可能可用，但管理员首次绑定、登录验证码校验、重新认证和审批等后台能力会失败，因此生产部署视为不可用配置。`.env.example` 列出了安全审批人、审计管理员和运维管理员的初始化变量。
5. `pnpm --filter backend db:seed` 维护服务器权限目录及独立角色，不覆盖已有密码、不自动重新启用已禁用资源。首次登录只允许 MFA 绑定及必要本人操作；如果 MFA_ENCRYPTION_KEY 或 Redis 不可用，管理员无法完成首次绑定，后续权限、角色、审批和审计管理接口会被守卫拒绝。旧普通角色的权限需重新审核后显式授权。
6. 应用数据库账户只授予必要 SELECT/INSERT/UPDATE 权限，不授予 DDL、TRIGGER 或对审计表 UPDATE/DELETE；迁移账户单独管理。审计表触发器阻止正常路径的修改/删除，审计保留至少六个月的归档、签名/完整性校验与备份恢复由专用审计存储落实。

迁移删除旧页面与写接口的错误绑定前会写入审计快照；页面本身、用户、角色和业务记录不被删除。开发验证脚本只创建并删除它自己的随机本地 MySQL 测试库，不迁移现有库。

## 验收与部署边界

代码验证包括职责分离、精确路由、页面/按钮状态传播、MFA 重放、审批并发状态、租户隔离、范围交集、事务回滚、引用保护、前端序列化与选择器。实际数据库验证运行 `pnpm --filter backend exec node scripts/verify-permission-migration.js`（先构建）。测试报告见 [VERIFICATION.md](VERIFICATION.md)。

目前仓库没有业务数据的后端仓储，数据范围服务已实现；后续业务模块必须调用受控数据访问入口，不能直接使用不带范围的 Prisma 查询。组织主数据通过受保护的部署/主数据流程导入，不接受普通客户端随意构造组织归属。

等保定级、外部集中审计、可信时间同步、告警接收方、备份恢复演练、员工身份唯一性、定期权限复核制度和密钥托管需要部署环境及管理制度提供证据。代码完成不等于通过等保测评，也不声称存在“绝对安全”。授权原则参考 [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)。
