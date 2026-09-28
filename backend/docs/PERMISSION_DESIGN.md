# 权限体系设计

本文档描述当前权限模块的职责边界、数据关系、请求流程和前后端接口。数据库字段以 [`prisma/schema.prisma`](../prisma/schema.prisma) 为准，权限目录以 [`src/security/policies/permission-catalog/`](../src/security/policies/permission-catalog/) 为准，初始化数据以 [`src/database/seed.ts`](../src/database/seed.ts) 和 [`src/database/page-permission-bindings.ts`](../src/database/page-permission-bindings.ts) 为准。

## 一、设计目标

权限系统把“能否进入页面”“页面能显示哪些操作”“操作能调用哪些接口”“能看到哪些字段”和“能访问哪些数据”拆成独立层次：

```text
用户 → 角色 → 权限
             ├─ 页面权限 PAGE
             ├─ 按钮权限 BUTTON
             ├─ 接口权限 API
             ├─ 字段权限 FIELD
             └─ 管理权限 MANAGEMENT

角色 → 数据范围资源 → 数据范围授权
```

每一层都必须显式授权，任何一层都不能仅凭权限码前缀、页面路由、按钮存在或数据库名称自动推导出另一层权限。

## 二、核心对象和关系

| 对象         | 表                                                    | 作用                                                   |
| ------------ | ----------------------------------------------------- | ------------------------------------------------------ |
| 页面/目录    | `sys_function`                                        | 页面树节点；目录用于组织菜单，页面用于承载页面权限     |
| 权限         | `sys_permission`                                      | 统一保存 PAGE、BUTTON、API、FIELD、MANAGEMENT 权限     |
| 按钮         | `sys_function_button`                                 | 页面下的操作入口，保存显示文本、操作标识和按钮权限关联 |
| 页面基础接口 | `sys_function_api`                                    | 页面初始化所需的 GET API 与页面的显式绑定              |
| 按钮操作接口 | `sys_button_api`                                      | 按钮可调用 API 与按钮的显式绑定                        |
| 角色         | `sys_role`                                            | 用户的授权载体                                         |
| 角色权限     | `sys_role_permission`                                 | 角色与权限的显式授权关系                               |
| 字段定义     | `sys_permission_field`                                | 字段读写权限、风险等级和字段元数据                     |
| 数据范围资源 | `sys_data_resource`                                   | 可配置数据范围的业务资源字典                           |
| 数据范围授权 | `sys_role_data_scope`、`sys_role_elevated_data_scope` | 普通范围和审批后的受控范围                             |

页面树、按钮和接口的关系如下：

```text
页面树 sys_function
├── 页面基础接口 sys_function_api ──> API 权限
└── 按钮 sys_function_button
    └── 按钮操作接口 sys_button_api ──> API 权限
```

页面权限只表示页面访问资格；按钮权限只表示操作入口资格；API 权限仍需独立授权。绑定关系只表示页面或按钮与 API 的使用关系，不会自动授予 API 权限。

## 三、权限码和操作标识

### 3.1 权限码分类

权限码是服务端稳定标识，全局唯一，使用小写 ASCII、点号和 kebab-case：

```text
page.system.user
button.system.user.create
system.user.read
system.user.field.username.read
system.data-scope.update
```

详细命名规则见 [PERMISSION_CODE_STANDARD.md](PERMISSION_CODE_STANDARD.md)。权限码不是显示名称，也不是前端路由别名；运行时必须按完整权限码或服务端目录中的结构化字段精确匹配。

### 3.2 按钮操作标识

按钮有三个不同字段：

| 字段    | 含义                                         | 是否可编辑             |
| ------- | -------------------------------------------- | ---------------------- |
| `name`  | 操作标识，例如 `create`、`reset-password`    | 新增时填写，编辑时只读 |
| `label` | 页面显示文本，例如“新增用户”                 | 可编辑                 |
| `code`  | 按钮权限码，例如 `button.system.user.create` | 系统生成，只读         |

操作标识不是从已有按钮权限码反向推导的字段。初始化数据在 `page-permission-bindings.ts` 中显式声明 `actionKey`；新增按钮接口接收经过英文单词校验的 `actionKey`，服务端据此生成按钮权限码并检查全局唯一性。初始化数据库只使用显式操作标识，不执行权限码拆分或后缀推导。

操作标识校验规则：

```text
^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$
```

### 3.3 页面权限码和按钮权限码

页面权限码由服务端页面创建流程维护；按钮权限码由页面权限码和显式操作标识组成稳定的按钮权限码。该生成规则只用于创建时形成新权限码，不用于运行时授权判断，也不用于从按钮权限码生成操作标识。

## 四、页面树和四类配置的关系

页面树是管理入口，不是四类权限的父权限。节点类型决定可配置内容：

| 页面树节点       | 页面详情 | 页面基础接口 | 按钮与操作接口 | 字段权限   | 数据范围资源                       |
| ---------------- | -------- | ------------ | -------------- | ---------- | ---------------------------------- |
| 目录 `DIRECTORY` | 可编辑   | 不配置       | 不配置         | 不配置     | 不配置                             |
| 页面 `PAGE`      | 可编辑   | 可配置       | 可配置         | 按资源加载 | 业务页面按资源加载，内置页面不显示 |

首次请求页面树时，`GET /api/v1/permission/pages/tree` 返回页面详情和页面权限摘要，避免再请求单独的页面详情接口。目录节点被选中时不请求其他四类配置接口。

页面与四类内容的查询边界：

- 页面基础接口：可以根据 `pageId` 查询，因为它是页面初始化绑定。
- 按钮与操作接口：可以根据 `pageId` 查询，因为按钮属于页面。
- 字段权限：不能根据 `pageId` 直接查询，应根据当前资源编码查询字段定义；页面只提供资源上下文。
- 数据范围资源：不能根据 `pageId` 查询，应按资源名称查询资源字典；页面只决定是否展示该功能。

数据库可以被修改不改变这个边界。用页面 ID 查询字段权限或数据范围资源会把页面布局和业务数据模型耦合，容易造成越权、误加载和资源混用。

## 五、权限管理接口

所有接口都挂在 `/api/v1` 下，并由认证守卫、权限守卫、字段投影和风险控制共同保护。

### 5.1 页面树和页面基础接口

| 方法   | 路径                                  | 返回内容                         |
| ------ | ------------------------------------- | -------------------------------- |
| GET    | `/permission/pages/tree`              | 页面树、页面详情、状态、权限摘要 |
| GET    | `/permission/pages/base-apis/options` | 可作为页面基础接口的启用 GET API |
| GET    | `/permission/pages/:pageId/base-apis` | 当前页面已绑定基础接口           |
| PATCH  | `/permission/pages/:pageId/base-apis` | 替换页面基础接口绑定             |
| POST   | `/permission/pages`                   | 新增页面                         |
| POST   | `/permission/directories`             | 新增目录                         |
| PATCH  | `/permission/pages/:id`               | 修改页面元数据                   |
| PATCH  | `/permission/directories/:id`         | 修改目录元数据                   |
| PATCH  | `/permission/pages/:id/enable`        | 启用页面                         |
| PATCH  | `/permission/pages/:id/disable`       | 停用页面                         |
| DELETE | `/permission/pages/:id`               | 删除页面                         |
| DELETE | `/permission/directories/:id`         | 删除目录                         |

页面基础接口只能绑定 GET API。写入、删除、导出、审批和完整性操作必须作为按钮操作接口显式绑定。

### 5.2 按钮和操作接口

| 方法  | 路径                                | 返回/作用                                               |
| ----- | ----------------------------------- | ------------------------------------------------------- |
| GET   | `/permission/pages/:pageId/buttons` | 当前页面按钮及各自绑定接口摘要                          |
| GET   | `/permission/api-options`           | 可绑定到按钮的启用 API                                  |
| GET   | `/permission/buttons/action-options` | 后端维护的标准按钮操作标识选项                          |
| POST  | `/permission/buttons`               | 新增按钮，接收 `functionId/actionKey/label/sort/apiIds` |
| PATCH | `/permission/buttons/:id`           | 修改显示文本和排序                                      |
| PATCH | `/permission/buttons/:id/enable`    | 启用按钮                                                |
| PATCH | `/permission/buttons/:id/disable`   | 停用按钮                                                |
| PATCH | `/permission/buttons/:id/apis`      | 替换按钮操作接口绑定                                    |

新增按钮时：

1. 校验页面存在且不是目录；
2. 校验 `actionKey` 为合法小写英文标识；
3. 生成按钮权限码并检查唯一性；
4. 创建按钮权限和页面按钮；
5. 按 `apiIds` 建立显式按钮/API 绑定。

标准操作标识由服务端目录维护，并通过 `GET /permission/buttons/action-options` 返回。
该目录不是业务数据，不新增操作标识表；数据库只保存已创建按钮的实际 `name`。如需增加
标准动作，应修改服务端目录并随代码发布，同时补充接口目录和测试。

编辑按钮只能修改 `label` 和 `sort`。`name`、`code`、所属页面和权限类型不可通过编辑接口修改。

### 5.3 API 权限管理

| 方法   | 路径                              | 作用                          |
| ------ | --------------------------------- | ----------------------------- |
| GET    | `/permission/apis`                | 分页查询 API 权限             |
| GET    | `/permission/api-options`         | 查询可用于操作绑定的 API 选项 |
| POST   | `/permission/apis`                | 受控新增 API                  |
| PATCH  | `/permission/apis/:id`            | 受控修改 API                  |
| PATCH  | `/permission/apis/:id/enable`     | 受控启用 API                  |
| PATCH  | `/permission/apis/:id/disable`    | 受控停用 API                  |
| GET    | `/permission/apis/:id/references` | 查询 API 引用关系             |
| DELETE | `/permission/apis/:id`            | 受控删除未被引用的 API        |

API 的权限码、HTTP 方法和路由模板由服务端权限目录维护，不能由普通前端动态注册或通过前缀推导。

## 六、字段权限和数据范围

### 6.1 字段权限

字段权限控制返回字段和可修改字段，不等价于接口权限，也不等价于数据范围：

```text
<resource>.field.<field>.<read|write>
```

字段权限由字段定义和服务端策略生成。响应经过字段投影后，只返回当前主体有权读取的字段；写入接口还必须校验字段白名单、字段写权限和风险等级。

管理对象自身的配置字段权限使用独立命名空间，例如：

```text
system.button.field.label.read
system.button.field.label.write
system.button.field.sort.write
```

### 6.2 数据范围资源

`sys_data_resource` 只登记可配置角色数据范围的业务对象，例如 `order`、`customer`。它不承载页面、按钮、API 或字段权限。

资源编码稳定且不可修改；资源名称和描述可修改；启用、停用使用明确路由：

```text
GET   /permission/data-resources?resource=order
POST  /permission/data-resources
PATCH /permission/data-resources/:id
PATCH /permission/data-resources/:id/enable
PATCH /permission/data-resources/:id/disable
```

页面中的数据范围资源初始化请求必须携带资源名称，禁止默认查询全部资源。系统内置页面不展示数据范围资源配置。

运行时业务查询必须调用 `DataScopeService`，将租户边界、有效数据范围和业务筛选条件组合为服务端查询条件。仅登记资源不会自动产生数据过滤；资源停用会立即使普通范围失效，但保留历史授权和审计记录。

## 七、运行时判定顺序

请求进入后按以下顺序处理：

1. `AuthGuard` 校验会话、用户状态、会话期限和 MFA 状态；
2. `PermissionGuard` 按完整方法和路由模板匹配接口权限；
3. 校验角色、角色权限、权限状态、授权期限和撤销状态；
4. 校验权限允许的角色类型和职责互斥；
5. 页面请求校验页面权限及有效祖先节点；
6. 按钮请求同时校验按钮所属页面、按钮权限和按钮状态；
7. API 请求必须有独立 API 授权，页面/API 或按钮/API 绑定只作为调用边界检查；
8. 字段拦截器执行读字段投影或写字段白名单检查；
9. 业务查询通过数据范围服务生成最终过滤条件；
10. L2/L3 高风险操作执行 MFA、重新认证或审批控制，并写入不可变审计日志。

禁止使用 `*`、权限码前缀匹配、页面名称匹配、路由猜测和“超级管理员旁路”。

## 八、角色、职责和审批

角色类型包括 `BUSINESS`、`SYSTEM`、`SECURITY`、`AUDIT`。权限可通过 `sys_permission_role_type` 显式声明允许的角色类型；缺少声明时拒绝授权。

高风险权限和系统内置页面的启停、页面路由变更、API 变更、数据范围受控授权走审批链：

```text
申请 → 独立安全管理员审批 → 执行 → 独立审计管理员复核
```

申请人不能审批自己的申请；审批人、执行人、复核人按风险要求隔离。审批记录、授权前后快照和安全操作必须保留，不能通过普通更新或删除接口清理。

## 九、初始化、迁移和验证

初始化顺序：

1. `pnpm --filter backend db:generate`
2. `pnpm --filter backend db:deploy`
3. 配置安全管理员、审计管理员和 MFA 加密密钥；
4. `pnpm --filter backend db:seed` 写入权限目录、页面树、显式按钮操作标识和页面/按钮 API 绑定；
5. 通过测试和权限迁移校验脚本验证数据库约束。

按钮初始化时，操作标识来自代码中的显式 `actionKey`，不会从 `button.*` 权限码拆分生成。修改权限码、路由或按钮标识必须走受控迁移，旧权限不得直接复用。

数据库基线位于 [`prisma/migrations/20260928050000_baseline/migration.sql`](../prisma/migrations/20260928050000_baseline/migration.sql)，由当前 Prisma schema 重新生成。验证脚本只用于独立测试库，不在本文档中修改其逻辑。

## 十、前端接入原则

权限管理前端按页面树和当前 Tab 分块加载：

- 页面树初始化只请求 `/permission/pages/tree`；
- 目录节点不请求页面基础接口、按钮、字段或数据范围；
- 页面基础接口 Tab 只请求页面绑定和页面基础接口选项；
- 按钮 Tab 只请求页面按钮和操作接口选项；
- 字段 Tab 按当前资源请求字段权限；
- 数据范围 Tab 按当前资源名称请求资源数据；
- 各 Tab 的刷新按钮只刷新自己的初始化接口；
- 页面树已返回页面详情，不再单独请求页面详情接口。

前端按钮和字段的可编辑状态只能作为交互提示，最终权限、字段和风险校验必须由后端执行。
