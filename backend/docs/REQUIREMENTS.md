# 权限管理模块需求（等保与职责分离）

## 0. 开发环境

开发、测试、生成 Prisma Client、执行后端构建和运行服务前，必须先切换到项目指定的 Node.js 环境：

```bash
nvm use
```

`nvm use` 会读取仓库根目录的 `.nvmrc`。当前项目要求 Node.js `>=22.14.0`；如 `.nvmrc` 与 `package.json` 的 `engines` 不一致，应以更高要求为准并先修正配置。切换后可验证：

```bash
node --version
pnpm --version
```

未执行 `nvm use` 不得直接运行 `pnpm`、Prisma、NestJS 或测试命令，避免 Node.js 版本不一致导致依赖安装、Prisma Client、构建和运行时行为不一致。

## 1. 适用范围与合规边界

本文档用于指导本项目账户、角色、页面、按钮、接口、数据权限和审计权限的设计与实现，重点落实 GB/T 22239-2019《信息安全技术 网络安全等级保护基本要求》中的：

- 身份鉴别
- 账户管理
- 访问控制
- 最小权限
- 管理员权限分离
- 安全审计
- 安全管理中心

GB/T 22239-2019 要求对登录用户分配账户和权限，及时停用多余或过期账户，授予管理用户完成职责所需的最小权限，并实现管理用户的权限分离；同时要求对重要用户行为和安全事件进行审计。[国家标准全文公开系统](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=BAFB47E8874764186BDB7865E8344DAF)

本文档是系统建设要求，不等同于等保定级、测评结论或合规认证。最终要求应结合系统定级结果、适用等级、测评要求和测评机构意见确认。

## 2. 核心设计原则

### 2.1 默认拒绝

用户、角色、页面、按钮和接口默认无权访问，只有明确授权且资源处于启用状态时才允许访问。

### 2.2 最小权限

权限必须同时限制：

```text
谁       用户/角色
访问什么 页面/API/数据
执行什么 查看/新增/修改/删除/审批
访问范围 什么组织、租户或数据归属
```

不得因为授予页面权限而自动获得全部按钮权限，也不得因为绑定角色而默认获得全部 API 权限。

### 2.3 职责分离

等保要求的是管理职责和操作权限实质分离，不是简单创建几个角色名称。系统必须防止同一账号同时拥有相互制约的全部高危权限。

### 2.4 后端强制鉴权

前端菜单、动态路由和 `v-permission` 仅用于界面控制，不能作为安全边界。所有业务接口和所有权限管理接口必须由后端独立完成鉴权。

### 2.5 显式授权

页面、按钮、API 和数据范围之间必须通过明确的绑定关系授权，禁止根据名称、路由、权限码前缀或前端传参自动推断权限。

### 2.6 可追溯和可复核

账户、角色、权限、授权关系和安全策略的变更必须记录审计日志，并支持定期权限复核、过期权限回收和高危权限复核。

### 2.7 权限判定与拒绝优先

运行时权限判定必须由后端统一执行，采用拒绝优先策略：

```text
允许访问 =
  用户有效
  AND 会话有效
  AND 角色有效
  AND 授权关系未撤销
  AND 授权关系未过期
  AND 权限资源为 ACTIVE
  AND 请求方法与路径匹配
  AND 数据范围校验通过
```

以下任一条件不满足，必须拒绝请求：

- 用户、角色、页面、按钮或接口处于禁用状态。
- 授权已撤销或已过期。
- 权限服务、缓存或策略存储不可用。
- 请求方法、路径、租户或数据范围不匹配。

权限检查异常时必须 fail closed，禁止以“缓存不存在”“服务暂时不可用”或“前端已隐藏按钮”为理由放行请求。

### 2.8 权限变更的双人复核

以下操作必须支持申请、审批、执行、复核四个阶段：

- 授予或回收高危角色。
- 授予或回收高危权限。
- 授予 `CUSTOM` 或 `ALL` 数据范围。
- 回收受控高权限数据范围。
- 修改接口路径、方法或高危权限码。
- 管理员 MFA 丢失后的受控重置。
- 关闭、禁用或变更审计策略。
- 创建或启用超级管理员能力。

申请人、审批人、执行人和审计复核人必须可追溯；申请人不得审批自己的申请，审批人不得代替审计复核人。

受控审批应覆盖以下类型：

| 类型 | 场景 | 执行结果 |
|---|---|---|
| `ROLE_GRANT` | 高危角色授予 | 写入或续期用户角色授权 |
| `ROLE_REVOKE` | 高危角色回收 | 撤销用户角色授权 |
| `ROLE_PERMISSIONS` | 高危权限授予 | 写入或续期角色权限授权 |
| `ROLE_PERMISSION_REVOKE` | 高危权限回收 | 撤销角色权限授权 |
| `API_ROUTE_CHANGE` | 接口权限码、方法或路径变更 | 修改目标接口权限定义 |
| `ELEVATED_SCOPE` | `CUSTOM` 或 `ALL` 数据范围授权 | 创建受控高权限数据范围 |
| `ELEVATED_REVOKE` | 受控高权限数据范围撤销 | 撤销受控数据范围 |
| `MFA_RESET` | 管理员认证器丢失或 MFA 无法使用 | 清空目标用户 MFA 并吊销其会话 |

四阶段状态必须为：

```text
REQUESTED  待审批
APPROVED   待执行
EXECUTED   待审计复核
REVIEWED   已复核
```

受控审批必须满足：

- 申请、审批、执行、复核均要求服务端认证身份和显式权限。
- 所有写操作阶段必须要求最近五分钟内完成 MFA 和重新认证。
- 申请有效期最长 24 小时；到期后禁止审批和执行，允许已执行事项继续审计复核。
- 申请人不得审批自己的申请。
- 审计复核人必须独立于申请人、审批人和执行人。
- 目标受益人不得参与为自己授予、回收、重置 MFA 或复核的任何阶段。
- `MFA_RESET` 的目标用户不能作为申请、审批、执行或复核参与者。
- 审批人和执行人可以为同一名安全管理员，但必须留下各自阶段记录。
- 状态认领、目标数据变更和审计写入必须位于同一事务；并发重复执行必须返回冲突。

### 2.9 运维应急工单与受控离线操作

受控审批是默认高危变更路径。当管理员 MFA 丢失、人员不足、在线审批链无法启动或存在必须立即处理的生产故障时，系统必须提供“运维应急工单 / 受控离线操作登记”能力，用于登记、证明和复核离线应急操作。

该模块不得成为普通权限绕过入口，必须满足：

- 正常情况下优先走受控审批，运维应急工单只用于在线审批不可用或不适用的场景。
- 工单本身由系统生成唯一工单号，作为主要追溯依据。
- 不强制要求外部审批编号；没有外部审批系统时，必须填写线下依据说明、身份核验方式、批准人和复核人。
- 外部依据编号、截图、邮件、聊天记录或附件链接可以作为补充证据。
- 应急脚本或手工操作必须绑定工单号。
- 未确认或未批准的工单，应急脚本必须拒绝执行。
- 脚本执行结果必须回写执行人、机器、数据库账号、命令摘要、前后快照和结果。
- 工单执行后必须由审计管理员复核并归档。
- 工单、执行记录和审计日志不得保存密码、MFA 密钥、验证码、会话令牌或其他敏感明文。

## 3. 角色分类模型

等保要求角色职责、权限和责任分离，但不强制所有系统使用固定的角色名称或固定数量的角色。本项目采用以下角色分类，实际部署时可根据组织职责映射和细化。

### 3.1 业务角色

业务角色面向日常业务操作，不得管理系统安全策略：

```text
BUSINESS
```

示例：

```text
普通用户
业务操作员
部门管理员
业务审核员
业务主管
```

业务角色只能获得必要的页面、按钮、API 和数据范围权限，不能获得用户管理、权限配置、审计策略和审计日志删除权限。

### 3.2 系统管理员

```text
SYSTEM
```

负责系统运行和基础配置：

- 服务运行配置
- 会话管理
- 系统参数
- 运行状态和基础资源
- 非安全策略类运维操作

系统管理员不得默认拥有：

- 角色授权和权限策略修改
- 审计日志删除或修改
- 审计策略关闭
- 以其他管理员身份执行操作

### 3.3 安全管理员

```text
SECURITY
```

负责身份、访问控制和安全策略：

- 用户账户策略
- 角色和权限策略
- 页面、按钮和接口权限
- 数据权限
- 密码、锁定和会话安全策略
- 高危授权审批

安全管理员不得修改、删除或关闭审计记录和审计进程。

### 3.4 审计管理员

```text
AUDIT
```

负责审计记录的查看和分析：

- 审计日志查询
- 审计日志详情
- 审计日志检索和统计
- 审计日志导出
- 权限变更追踪
- 安全事件分析

审计管理员不得授予角色权限，不得修改权限策略，不得删除或篡改审计记录。

### 3.5 角色字段要求

角色至少包含：

| 字段 | 要求 |
|---|---|
| `roleId` | UUID，对外使用，不暴露数据库自增 ID |
| `code` | 全局唯一 |
| `name` | 角色名称 |
| `roleType` | `BUSINESS`、`SYSTEM`、`SECURITY`、`AUDIT` |
| `status` | `ACTIVE` 或 `DISABLED` |
| `description` | 职责说明 |
| `createdAt`、`updatedAt` | 生命周期时间 |

角色是否属于高权限角色不得由单一布尔字段决定，而应由以下因素综合计算：

```text
角色类型
角色实际拥有的权限集合
是否包含受保护的高危权限
角色状态
授权范围和有效期
```

`roleType` 只能由后端根据受保护的安全管理权限维护，不能由普通前端请求任意修改。高危权限集合必须由服务端策略定义，不能由客户端提交或覆盖。

## 4. 职责分离与互斥控制

以下权限原则上必须互斥：

```text
系统运行管理  ≠  安全策略管理
安全策略管理  ≠  审计管理
权限授予      ≠  审计日志删除
业务管理      ≠  超级管理员
```

系统必须支持角色互斥策略：

- 同一用户不得同时绑定互斥角色。
- 必须维护服务端角色互斥矩阵，不能只依赖角色名称约定。
- 安全管理员、审计管理员和系统管理员的职责必须由不同人员承担；确需兼任时必须经过风险评估、审批和补偿控制。
- 高危角色绑定需要二次确认和审计。
- 角色变更应支持审批或双人复核机制。
- 用户不得为自己授予、审批或复核权限。
- 角色类型、互斥关系和高危权限集合只能由受保护的安全策略维护接口修改。
- 超级管理员只能作为受控应急能力，不作为日常角色使用。
- 应急权限必须设置有效期、使用原因和事后审计。

推荐的职责权限边界：

| 角色 | 允许范围 | 禁止范围 |
|---|---|---|
| 业务角色 | 业务页面、按钮、API、数据范围 | 安全管理、审计管理 |
| 系统管理员 | 系统运行和基础配置 | 权限策略、审计数据 |
| 安全管理员 | 用户、角色、权限和安全策略 | 审计数据修改删除 |
| 审计管理员 | 审计查询、分析和导出 | 权限授予、策略修改、日志删除 |

## 4.1 身份鉴别与账户生命周期控制

权限系统必须建立在可靠的身份和账户生命周期之上：

- 每个自然人使用唯一账户，禁止共享管理员账户。
- 默认账户必须重命名、禁用或删除，并修改默认口令。
- 密码必须使用抗离线破解的单向密码算法和独立随机盐存储，禁止明文或可逆加密。
- 密码策略必须设置最小长度、复杂度、历史重复限制、失败次数、锁定时长和修改周期下限。
- 系统管理员、安全管理员和审计管理员必须强制使用多因素认证。
- 高危权限授予、角色类型变更、审计策略变更和全量数据访问必须重新认证。
- 登录失败、账户锁定、密码重置、解锁、启用、禁用和注销必须审计。
- 离职、转岗、长期未使用和过期账户必须及时停用或回收权限。
- 会话必须支持绝对超时、闲置超时、主动注销、服务端吊销和并发会话控制。
- 账户、会话、角色和权限状态校验必须在后端完成，不能依赖前端缓存。

## 5. 权限资源模型

```text
角色
 ├── 页面权限
 │    ├── 页面基础 API
 │    └── 按钮权限
 │         └── 按钮操作 API
 ├── 数据权限
 └── 管理权限
```

### 5.1 页面权限

页面权限用于控制菜单、路由和页面访问，例如：

```text
system.order.manage
```

页面支持多级树形结构：

```text
系统管理
└── 订单管理
    ├── 订单详情
    └── 订单配置
```

页面字段至少包括：

| 字段 | 要求 |
|---|---|
| `id` | UUID |
| `code` | 全局唯一，如 `system.order.manage` |
| `name` | 页面名称 |
| `route` | 唯一路由 |
| `component` | 组件标识，目录节点可为空 |
| `parentId` | 父页面 UUID，根节点为空 |
| `sort` | 同级排序 |
| `status` | `ACTIVE` 或 `DISABLED` |

### 5.2 按钮权限

按钮权限表示具体操作：

```text
system.order.create
system.order.update
system.order.delete
```

要求：

- 必须归属于一个页面。
- 权限码全局唯一。
- 支持启用和禁用。
- 可以绑定一个或多个操作 API。
- 页面权限不自动包含按钮权限。

### 5.3 接口权限

接口权限表示后端实际可授权的资源：

```text
system.order.read
system.order.create
system.order.update
system.order.delete
```

接口字段至少包括：

| 字段 | 要求 |
|---|---|
| `id` | UUID |
| `code` | 全局唯一 |
| `name` | 接口名称 |
| `method` | `GET`、`POST`、`PUT`、`PATCH`、`DELETE` |
| `path` | 实际后端路由模板 |
| `resource` | 资源标识 |
| `action` | `read`、`create`、`update`、`delete` 等 |
| `status` | `ACTIVE` 或 `DISABLED` |

接口管理必须作为独立页面和独立管理域。禁止使用 `ALL` 替代真实 HTTP 方法。

接口权限匹配必须同时比较规范化后的 HTTP 方法和路由模板。参数、查询字符串、尾部斜杠和编码差异不得导致越权匹配；未匹配到明确权限时必须拒绝。普通角色不得使用路径通配符或全方法通配权限。

### 5.4 数据权限

功能权限解决“能否执行”，数据权限解决“能访问哪些数据”。数据范围分为普通范围和受控高权限范围两类。

普通角色只允许使用以下范围：

```text
SELF                本人创建或归属的数据
DEPARTMENT_SELF     当前部门的数据
DEPARTMENT_TREE     当前部门及下属部门的数据
ORGANIZATION_SELF   当前组织节点的数据
ORGANIZATION_TREE   当前组织及下属组织的数据
TENANT              当前租户的数据
```

`DEPARTMENT_SELF`、`DEPARTMENT_TREE`、`ORGANIZATION_SELF` 和 `ORGANIZATION_TREE` 必须由后端根据当前用户的组织关系计算，不能由前端直接提交组织 ID 替代。

`CUSTOM` 和 `ALL` 不属于普通数据范围：

```text
CUSTOM  指定用户、部门、组织或租户集合
ALL     全部数据
```

两者必须存储在独立的受控授权表中，只允许安全管理员或经过审批的高危授权流程使用，并且必须具备：

- 授权原因。
- 审批或授权单号。
- 明确的生效时间和过期时间。
- 可撤销状态。
- 目标集合明细。
- 独立审计记录。

`ALL` 不得出现在普通角色授权选择器中，默认禁止永久授权。`CUSTOM` 必须通过目标关联表保存具体目标，不能只依赖不可校验的 JSON 字段。

无论使用哪种范围，数据过滤条件都必须由后端生成，禁止信任前端提交的用户 ID、部门 ID、组织 ID 或租户 ID。多租户系统必须始终强制执行租户隔离。

数据权限还必须明确：

- 部门和组织来自受保护的组织主数据，不允许客户端自行构造组织树。
- `DEPARTMENT_SELF` 只匹配当前部门，`DEPARTMENT_TREE` 才包含下属部门。
- `ORGANIZATION_SELF` 只匹配当前组织节点，`ORGANIZATION_TREE` 才包含下属组织。
- `TENANT` 只能匹配当前认证上下文中的租户，不能通过请求参数切换租户。
- 导出、批量修改、批量删除和异步任务必须使用与查询一致的数据范围。
- 数据范围冲突时采用更严格范围，禁止自动扩大为更宽范围。
- `CUSTOM` 的目标必须使用独立目标表和唯一约束保存，禁止只保存不可校验的 JSON 字符串。
- `ALL` 不得设置为永久有效；未明确设置有效期时必须拒绝保存。
- 数据范围过滤必须在服务端查询层或数据访问层强制执行，不能只在控制器或前端过滤。

## 6. 管理权限划分

### 6.1 用户管理

```text
system.user.read
system.user.create
system.user.update
system.user.disable
system.user.reset-password
system.user.unlock
system.user.mfa-reset
```

### 6.2 角色和授权管理

```text
system.role.read
system.role.create
system.role.update
system.role.disable
system.role.grant
system.role.revoke
system.role.review
```

### 6.3 页面权限管理

```text
system.page.read
system.page.create
system.page.update
system.page.disable
```

### 6.4 按钮权限管理

```text
system.button.read
system.button.create
system.button.update
system.button.disable
system.button.bind-api
```

### 6.5 接口管理

```text
system.api.read
system.api.create
system.api.update
system.api.disable
system.api.delete
system.api.review
```

### 6.6 审计管理

```text
system.audit.read
system.audit.detail
system.audit.export
system.audit.review
```

### 6.7 受控审批管理

```text
system.approval.create
system.approval.read
system.approval.detail
system.approval.approve
system.approval.execute
system.approval.review
```

权限要求：

- `system.approval.create` 只代表可创建审批单，还必须叠加具体业务能力。
- 授予类申请和执行必须具备 `system.role.grant`。
- 回收类申请和执行必须具备 `system.role.revoke`。
- `MFA_RESET` 申请和执行必须具备 `system.user.mfa-reset`。
- 审批阶段必须具备 `system.role.review`。
- 复核阶段必须具备 `system.audit.review`。
- 审批列表和详情可以授权给安全管理员和审计管理员，但业务角色和系统管理员不得访问。

### 6.8 运维应急工单管理

```text
system.ops-ticket.create
system.ops-ticket.read
system.ops-ticket.detail
system.ops-ticket.approve
system.ops-ticket.execute
system.ops-ticket.review
system.ops-ticket.cancel
```

权限要求：

- 安全管理员可以创建、确认和执行安全类应急工单。
- 系统管理员可以创建和执行系统运行类应急工单，但不得复核。
- 审计管理员可以查询、详情和复核工单，不得执行应急操作。
- 业务角色不得访问运维应急工单。
- MFA 应急重置类工单的执行必须额外要求 `system.user.mfa-reset`。

禁止新增和继续授予全量管理权限 `system.permission.manage`。历史兼容权限必须标记为迁移权限，禁止出现在普通角色授权列表，并在迁移完成后删除。用户、角色、页面、按钮、接口、数据和审计管理必须使用各自的细粒度权限。

角色授权关系至少应记录：

```text
assignedAt
expiresAt
revokedAt
grantedBy
revokedBy
grantReason
revokeReason
approvalRef
```

授权关系必须支持有效期、撤销和复核，不能通过直接覆盖整批权限的方式绕过授权审计。

## 7. 前端页面需求

### 7.1 页面权限页面

建议路由：

```text
/system/permission
```

页面布局：

```text
左侧：页面层级树
右侧：页面基本信息、页面基础接口、按钮与操作接口
```

必须支持：

- 新增根页面或子页面。
- 页面名称、权限码和路由搜索。
- 展示页面状态和父子关系。
- 配置页面基础接口。
- 新增、修改和禁用按钮。
- 绑定和解绑按钮操作接口。
- 显示影响范围和引用关系。

页面基础接口仅允许配置页面加载、查询、详情和初始化接口。新增、修改、删除、导出和审批等操作必须绑定到具体按钮。

### 7.2 接口管理页面

建议路由：

```text
/system/permission/api
```

必须独立于页面权限页面，支持：

- 接口分页查询。
- 按名称、权限码、方法、路径和状态筛选。
- 新增接口。
- 修改接口。
- 启用和禁用接口。
- 查看页面、按钮和角色引用关系。
- 仅删除未被引用的接口。
- 高危操作二次确认。

接口列表至少展示：

```text
接口名称
权限码
HTTP 方法
请求路径
资源
动作
状态
页面引用数
按钮引用数
角色授权数
```

页面权限和按钮配置只能通过选择器引用状态为 `ACTIVE` 的接口，不得复制接口数据。

### 7.3 角色授权页面

角色授权页面必须按以下顺序展示：

```text
选择角色
  ↓
查看角色类型和状态
  ↓
选择页面权限
  ↓
按需选择按钮权限
  ↓
按需选择接口权限
  ↓
配置数据范围
  ↓
确认授权影响
```

系统不得因为选择页面而自动授予全部按钮和写接口权限。

### 7.4 审计页面

审计管理员只能通过独立审计页面访问审计数据。页面必须支持按操作者、角色、资源、操作、结果、时间和 traceId 查询。

审计页面不得提供修改或删除审计记录的普通操作入口。

### 7.5 受控审批页面

建议路由：

```text
/system/permission/approval
```

页面必须支持：

- 审批列表按状态筛选和分页。
- 展示申请编号、申请类型、原因、状态、到期时间和可执行操作。
- 查看申请详情、payload、申请人、审批人、执行人、复核人和各阶段意见。
- 新建受控审批申请。
- 执行审批、执行和审计复核动作。
- 提示所有写操作需要最近五分钟内 MFA 和重新认证。

新建申请必须根据类型显示最小字段：

| 类型 | 必填字段 |
|---|---|
| `ROLE_GRANT`、`ROLE_REVOKE` | 用户 UUID、角色 UUID、原因、到期时间 |
| `ROLE_PERMISSIONS`、`ROLE_PERMISSION_REVOKE` | 角色 UUID、权限 UUID 列表、原因、到期时间 |
| `API_ROUTE_CHANGE` | 接口 UUID、新权限码、新方法、新路径、原因、到期时间 |
| `ELEVATED_SCOPE` | 角色 UUID、资源、范围类型、目标集合、原因、到期时间 |
| `ELEVATED_REVOKE` | 受控数据范围 UUID、原因、到期时间 |
| `MFA_RESET` | 目标用户 UUID、原因、到期时间 |

`MFA_RESET` 页面必须明确提示：

- 仅用于认证器丢失或 MFA 无法使用的恢复场景。
- 执行后将清空目标用户 MFA 状态并吊销其现有会话。
- 目标用户需要重新登录并重新绑定认证器。
- 目标用户本人不得参与申请、审批、执行或复核。

### 7.6 运维应急工单页面

建议路由：

```text
/system/ops-tickets
/system/ops-tickets/create
/system/ops-tickets/:id
```

页面必须支持：

- 工单列表按状态、类型、风险等级、目标对象和时间筛选。
- 新建工单，填写标题、类型、目标对象、申请原因、线下依据说明、身份核验方式、线下批准人和线下复核人。
- 外部依据编号为选填字段；没有外部审批系统时允许为空。
- 支持上传或填写证据附件、截图、链接或摘要。
- 查看工单详情、状态流转、证据、执行记录和审计复核意见。
- 安全管理员或系统管理员按职责确认工单。
- 执行人录入执行说明；自动回写的脚本执行记录只读展示。
- 审计管理员复核并归档。

工单类型至少包括：

```text
MFA_RESET_EMERGENCY
DB_MANUAL_FIX
PERMISSION_RECOVERY
ACCOUNT_RECOVERY
OTHER
```

工单状态至少包括：

```text
DRAFT
SUBMITTED
APPROVED
EXECUTED
REVIEWED
REJECTED
CANCELLED
```

页面不得提供“绕过审批直接执行”的普通按钮。真正的应急操作应由受控脚本或受控运维流程完成，并将执行结果回写工单。

## 8. 后端接口需求

基础路径：

```text
/api/v1/permission
```

所有权限管理接口必须依次执行：

```text
身份认证
账户状态校验
会话校验
角色状态校验
管理权限校验
DTO 白名单校验
资源状态校验
业务处理
审计记录
```

### 8.1 页面接口

```http
GET   /api/v1/permission/functions
POST  /api/v1/permission/functions
PATCH /api/v1/permission/functions/:id
PATCH /api/v1/permission/functions/:id/status
GET   /api/v1/permission/functions/:id/apis
PATCH /api/v1/permission/functions/:id/apis
```

### 8.2 按钮接口

```http
GET   /api/v1/permission/functions/:functionId/buttons
POST  /api/v1/permission/buttons
PATCH /api/v1/permission/buttons/:id
PATCH /api/v1/permission/buttons/:id/status
PATCH /api/v1/permission/buttons/:id/apis
```

### 8.3 接口管理接口

```http
GET    /api/v1/permission/apis
POST   /api/v1/permission/apis
PATCH  /api/v1/permission/apis/:id
PATCH  /api/v1/permission/apis/:id/status
DELETE /api/v1/permission/apis/:id
GET    /api/v1/permission/apis/:id/references
```

接口管理要求：

- `method` 只允许白名单方法。
- `path` 必须符合实际后端路由模板。
- 客户端不得覆盖服务端推导的 `type`、`resource`、`action`。
- 修改权限码、方法或路径必须记录变更前后值。
- 被页面、按钮或角色引用的接口禁止物理删除。
- 被引用接口只能禁用。
- 禁用接口后运行时鉴权立即拒绝相关请求。

### 8.4 角色授权接口

```http
GET   /api/v1/roles/:roleId/permissions
PATCH /api/v1/roles/:roleId/permissions
POST  /api/v1/roles/:roleId/permissions/review
```

要求：

- 只能为启用角色分配启用权限。
- 角色类型和互斥规则由后端校验。
- 高危角色和高危权限需要二次确认或复核。
- 授权、回收和复核必须记录审计日志。

### 8.5 受控审批接口

基础路径：

```text
/api/v1/permission/approvals
```

接口：

```http
POST /api/v1/permission/approvals
GET  /api/v1/permission/approvals
GET  /api/v1/permission/approvals/:id
POST /api/v1/permission/approvals/:id/approve
POST /api/v1/permission/approvals/:id/execute
POST /api/v1/permission/approvals/:id/review
```

审批单字段至少包括：

| 字段 | 要求 |
|---|---|
| `id` | UUID |
| `kind` | 审批类型 |
| `payload` | 与类型严格匹配的结构化 JSON |
| `reason` | 申请原因 |
| `status` | `REQUESTED`、`APPROVED`、`EXECUTED`、`REVIEWED` |
| `applicantId` | 申请人公开 UUID |
| `approverId` | 审批人公开 UUID，可为空 |
| `executorId` | 执行人公开 UUID，可为空 |
| `reviewerId` | 复核人公开 UUID，可为空 |
| `createdAt` | 创建时间 |
| `expiresAt` | 审批和执行截止时间 |
| `approvedAt`、`executedAt`、`reviewedAt` | 各阶段时间 |
| `approvalNote`、`executionNote`、`reviewNote` | 各阶段意见 |

接口要求：

- `payload` 必须按 `kind` 白名单校验，未知字段必须拒绝。
- 客户端不得提交申请人、审批人、执行人、复核人、MFA 时间戳或任意操作类型。
- `MFA_RESET` payload 只能包含目标用户公开 UUID，不接受 MFA 密钥、验证码或会话信息。
- 执行 `MFA_RESET` 时必须清空目标用户 MFA 状态并吊销其全部未撤销会话。
- 审批状态变更必须使用乐观认领或等效并发控制，重复执行返回冲突。
- 执行阶段的目标数据变更和审批状态变更必须与审计写入同事务提交。

### 8.6 运维应急工单接口

基础路径：

```text
/api/v1/ops-tickets
```

接口：

```http
POST /api/v1/ops-tickets
GET  /api/v1/ops-tickets
GET  /api/v1/ops-tickets/:id
PATCH /api/v1/ops-tickets/:id
POST /api/v1/ops-tickets/:id/submit
POST /api/v1/ops-tickets/:id/approve
POST /api/v1/ops-tickets/:id/execute
POST /api/v1/ops-tickets/:id/review
POST /api/v1/ops-tickets/:id/cancel
POST /api/v1/ops-tickets/:id/evidence
POST /api/v1/ops-tickets/:id/executions
```

工单主表至少包括：

| 字段 | 要求 |
|---|---|
| `id` | UUID |
| `ticketNo` | 系统生成工单号，如 `OPS-20260923-0001` |
| `type` | 工单类型 |
| `status` | 工单状态 |
| `riskLevel` | `LOW`、`MEDIUM`、`HIGH`、`CRITICAL` |
| `title` | 标题 |
| `reason` | 申请原因 |
| `targetType` | `USER`、`ROLE`、`PERMISSION`、`DATABASE`、`SYSTEM`、`OTHER` |
| `targetId` | 目标公开 UUID 或目标标识，可为空 |
| `offlineBasis` | 线下依据说明，必填 |
| `identityVerification` | 身份核验方式，必填 |
| `offlineApprover` | 线下批准人，必填 |
| `offlineReviewer` | 线下复核人，必填 |
| `externalRef` | 外部依据编号，选填 |
| `requestedBy`、`approvedBy`、`executedBy`、`reviewedBy` | 系统内操作者公开 UUID |
| `createdAt`、`approvedAt`、`executedAt`、`reviewedAt`、`closedAt` | 生命周期时间 |

执行记录表至少包括：

| 字段 | 要求 |
|---|---|
| `id` | UUID |
| `ticketId` | 工单 UUID |
| `executorUserId` | 系统内执行确认人，可为空 |
| `operatorOsUser` | 脚本采集的 OS 用户 |
| `operatorHost` | 主机名 |
| `operatorIp` | 来源 IP |
| `dbCurrentUser` | 数据库 `CURRENT_USER()` |
| `gitCommit` | 脚本所在代码版本 |
| `scriptName`、`scriptVersion` | 脚本标识 |
| `commandHash` | 命令摘要，不保存敏感参数 |
| `dryRun` | 是否仅预演 |
| `result` | `SUCCESS` 或 `FAILED` |
| `beforeSnapshot`、`afterSnapshot` | 脱敏前后快照 |
| `traceId` | 追踪编号 |
| `executedAt` | 执行时间 |

证据表至少包括：

| 字段 | 要求 |
|---|---|
| `id` | UUID |
| `ticketId` | 工单 UUID |
| `type` | `APPROVAL_SCREENSHOT`、`EMAIL`、`CHAT`、`SQL_REVIEW`、`OTHER` |
| `name` | 证据名称 |
| `uri` | 文件地址、对象存储地址或外部链接 |
| `sha256` | 文件摘要 |
| `uploadedBy` | 上传人公开 UUID |
| `createdAt` | 上传时间 |

接口要求：

- `externalRef` 只能作为辅助追溯字段，不能作为权限判断依据。
- 没有外部审批系统时，`offlineBasis`、`identityVerification`、`offlineApprover` 和 `offlineReviewer` 必须完整填写。
- 应急脚本回写执行记录时必须校验工单存在、状态允许执行、类型匹配和工单号匹配。
- 执行记录必须追加写入，禁止普通更新和删除。
- 工单关闭后不得修改核心字段，只允许追加审计备注或复核结论。
- 执行回写必须来自受控执行代理：请求体字段使用 `OPS_EXECUTION_SIGNING_SECRET` 通过 HMAC-SHA256 签名，签名内容为 `ticketId` 与去除 `signature` 后的完整请求体按 key 递归排序后的 JSON；`signedAt` 只接受前后五分钟，`traceId` 在同一工单内不得重复。
- `executorUserId` 和 `operatorIp` 不由请求体提供，分别由当前认证身份和服务端请求上下文写入。

## 9. 资源状态、缓存和删除策略

所有用户、角色、页面、按钮和接口至少支持：

```text
ACTIVE
DISABLED
```

状态传播：

```text
禁用用户       → 用户会话和权限立即失效
禁用角色       → 角色授予的权限立即失效
禁用页面       → 页面路由和页面权限失效
禁用按钮       → 按钮不可见且操作权限失效
禁用接口       → 相关 API 授权全部失效
```

权限变更后必须刷新权限缓存或立即使缓存失效，并对已有会话重新检查关键权限。

删除规则：

- 被角色引用的权限不得删除。
- 被页面或按钮引用的接口不得删除。
- 删除前必须检查并展示引用关系。
- 优先使用禁用替代删除。
- 删除权限必须与修改、禁用权限分离。

## 10. 安全审计要求

必须审计：

- 登录成功、失败、锁定和解锁。
- 用户创建、修改、禁用、删除和重置密码。
- 角色创建、修改、禁用、授权和回收。
- 页面新增、修改、禁用和层级调整。
- 按钮新增、修改、禁用和接口绑定。
- 接口新增、修改、启用、禁用和删除。
- 数据权限变更。
- 受控审批申请、审批、执行和复核。
- 运维应急工单创建、提交、确认、执行回写、复核、取消和归档。
- 应急脚本执行结果、执行环境和影响范围。
- 管理员 MFA 重置及目标用户会话吊销。
- 权限校验失败和高危操作。

审计记录至少包括：

```text
traceId
actorId
角色类型
目标资源 ID
资源类型
操作类型
请求方法
请求路径
操作时间
来源 IP
结果
状态码
变更前值
变更后值
```

审计管理员可以查询和分析审计记录，但不能修改、删除或关闭审计功能。审计记录必须受到访问控制保护，并进行备份和完整性保护。

审计控制还必须满足：

- 审计时间来自统一可信时间源，关键服务启用时间同步。
- 审计记录集中存储，业务服务不能直接修改历史记录。
- 审计记录至少保存满足适用等级和组织制度要求的期限，未明确期限时不得少于六个月。
- 审计记录应具备完整性校验、访问控制、备份和恢复能力。
- 存储空间不足、写入失败、完整性校验失败和审计服务异常必须告警。
- 审计日志查询、导出、备份、恢复和策略变更本身必须被审计。
- 审计管理员只能通过专用审计界面或受控接口操作，不得直接访问数据库表。
- 审计记录删除必须受到保留策略和双人复核保护，不提供普通删除接口。
- `MFA_RESET` 和应急脚本审计不得保存 MFA 密钥、验证码、密码、会话令牌或数据库连接串。
- 应急脚本必须自动采集并上报 OS 用户、主机名、来源 IP、数据库当前用户、脚本版本、代码版本、执行时间和命令摘要。
- 前后快照必须脱敏；对 MFA 仅允许记录是否曾绑定、是否曾存在密钥和吊销会话数量。

## 11. 统一响应和状态码

```text
GET    读取成功       200 OK
POST   创建成功       201 Created
PATCH  修改成功       200 OK
DELETE 删除成功       204 No Content
```

错误响应统一使用 Problem Details，不得返回 SQL、堆栈、内部表名、密码哈希、会话信息或其他敏感字段。

## 12. 测试与验收标准

### 12.1 角色与职责分离

- 角色支持 `BUSINESS`、`SYSTEM`、`SECURITY`、`AUDIT` 分类，角色的高危状态由服务端根据角色类型和有效权限集合计算。
- 禁止同一用户绑定互斥高危角色。
- 系统管理员不能修改审计记录。
- 审计管理员不能授予或回收权限。
- 业务角色不能访问权限和审计管理接口。
- 安全管理员不能删除或篡改审计记录。

### 12.2 最小权限

- 页面权限不能自动获得按钮权限。
- 页面基础接口不能自动获得写接口权限。
- 按钮权限只能调用明确绑定的 API。
- 禁用用户、角色、页面、按钮或接口后权限立即失效。
- 数据权限不能通过客户端参数绕过。

### 12.3 生命周期

- 可以创建根页面和多级子页面。
- 页面树正确展示层级、排序和状态。
- 接口管理是独立页面。
- 接口支持新增、查询、修改、启用、禁用和删除保护。
- 被引用接口无法物理删除。
- 过期和禁用账户不能继续访问系统。

### 12.4 审计

- 所有权限和授权变更均生成审计记录。
- 审计记录包含操作者、角色类型、目标、时间、结果、来源 IP 和 traceId。
- 普通用户不能查询敏感审计记录。
- 审计管理员不能修改或删除审计记录。
- 权限变更前后值可以被授权审计人员查看。
- 受控审批四阶段均生成审计记录。
- `MFA_RESET` 执行后目标用户 MFA 被清空、现有会话被吊销，审计不包含 MFA 密文。
- 运维应急工单支持完整状态流转、证据追加、执行记录回写和审计复核。
- 应急脚本执行记录能追溯执行人环境、数据库账号、脚本版本和影响范围。

### 12.5 自动化测试

- 用户、角色和资源状态传播测试。
- 角色类型和互斥角色校验测试。
- 页面层级、唯一性和循环校验测试。
- 页面 API、按钮 API 事务绑定测试。
- 接口方法、路径、权限码和状态校验测试。
- 接口引用关系和删除保护测试。
- 最小权限和职责分离授权测试。
- 数据范围过滤测试。
- 权限缓存刷新和会话失效测试。
- 前端页面权限、接口管理、角色授权和审计页面流程测试。
- 受控审批申请、审批、执行、复核状态机测试。
- 受控审批职责隔离、MFA 最近验证、超时、并发冲突和目标受益人限制测试。
- `MFA_RESET` 清空 MFA、吊销会话、拒绝本人参与和审计脱敏测试。
- 运维应急工单状态流转、必填线下依据、外部依据编号选填、脚本回写和只追加执行记录测试。

## 13. 等保实施证据

权限功能除代码实现外，必须能够提供可验证的实施证据：

- 用户、角色、权限和数据范围设计说明。
- 角色职责、互斥矩阵和授权审批流程。
- 用户和管理员账户清单及定期复核记录。
- 权限变更、角色授权和高危操作审计记录。
- 禁用、撤销、过期和应急权限回收记录。
- 受控审批申请、审批、执行和审计复核记录。
- 管理员 MFA 重置审批记录、执行记录和会话吊销记录。
- 运维应急工单、线下依据说明、身份核验记录、批准人和复核人记录。
- 应急脚本执行记录，包括 OS 用户、主机名、数据库账号、脚本版本、代码版本、前后快照和执行结果。
- 权限判定失败、缓存异常和审计异常的告警记录。
- 接口权限清单、页面/按钮/API 引用关系和删除保护记录。
- 数据权限过滤规则及跨租户隔离测试报告。
- 审计日志保存、备份、恢复和完整性保护记录。
- 单元测试、集成测试、安全测试和验收报告。

没有上述流程、记录和测试证据时，不能仅凭数据库存在角色和权限字段认定满足等保访问控制要求。
