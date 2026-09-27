# 权限码生成规范

本文档定义项目中页面、按钮、API、数据字段和配置字段权限码的生成规则。权限码是服务端稳定的安全标识，用于角色授权、页面/API 绑定、审计和风险控制；它不是页面显示名称，也不是前端路由别名。

本文档是权限码命名的唯一规范。权限体系的表结构和判定流程见 [PERMISSION_DESIGN.md](PERMISSION_DESIGN.md)，业务需求和验收标准见 [REQUIREMENTS.md](REQUIREMENTS.md)。

## 1. 总体规则

### 1.1 字符和长度

- 使用小写 ASCII 字符、数字、点号 `.` 和短横线 `-`。
- 层级之间使用点号；同一层的多词名称使用 kebab-case。
- 不使用下划线 `_`、空格、斜杠和 camelCase 资源名。
- 权限码最大长度为 128 个字符。
- 权限码全局唯一，不允许重复使用历史权限码。
- API 权限除权限码唯一外，还必须保证 HTTP 方法和路由模板唯一。

示例：

```text
system.operation-policy.create
system.user.reset-password
system.ops-ticket.execution.create
```

### 1.2 资源名称

资源名称使用稳定的业务资源单数形式，不直接使用数据库表名、Controller 名或 URL 复数形式：

```text
user
role
page
button
api
ops-ticket
operation-policy
data-scope
```

### 1.3 动作名称

动作必须表达一个明确的业务行为。新权限码只能使用以下动作：

| 类别 | 动作 | 说明 |
| --- | --- | --- |
| 查询 | `read` | 列表或普通读取 |
| 查询 | `detail` | 单条详情 |
| 查询 | `options` | 下拉选项或选择器数据 |
| 写入 | `create` | 创建 |
| 写入 | `update` | 修改 |
| 状态 | `status` | 启用或停用 |
| 删除 | `delete` | 删除，必须经过引用保护 |
| 绑定 | `bind` | 建立明确绑定关系 |
| 授权 | `grant` | 授予权限或范围 |
| 授权 | `revoke` | 撤销权限或范围 |
| 流程 | `submit` | 提交 |
| 流程 | `approve` | 审批 |
| 流程 | `execute` | 执行 |
| 流程 | `review` | 复核 |
| 流程 | `cancel` | 取消 |
| 输出 | `export` | 导出 |
| 校验 | `verify` | 完整性或安全校验 |

禁止新建以下泛化或含义不准确的动作：

```text
manage
disable
apis
executions
```

说明：支持启用和停用的接口必须使用 `status`，不能使用 `disable`；资源集合必须使用明确的 `read` 或 `detail`；新增执行记录使用 `execution.create`，不能使用复数名词 `executions`。

## 2. 权限码分类

### 2.1 页面权限

格式：

```text
page.<domain>.<resource>
```

示例：

```text
page.system.user
page.system.role
page.system.permission
page.system.ops-ticket
```

页面权限只表示页面、菜单和路由访问，不包含按钮、API 或数据字段权限。

页面权限不能自动生成：

- 按钮权限；
- API 权限；
- 数据范围权限；
- 字段读写权限。

### 2.2 API 权限

普通 API 格式：

```text
system.<resource>.<action>
```

具有明确子资源的 API 格式：

```text
system.<resource>.<sub-resource>.<action>
```

示例：

```text
system.user.read
system.user.create
system.user.update
system.user.enable
system.user.disable
system.user.reset-password

system.page.api.read
system.page.api.options
system.page.api.bind
system.button.api.bind

system.operation-policy.read
system.operation-policy.create
system.operation-policy.activate
system.operation-policy.status
```

API 权限必须与服务端目录中的真实 HTTP 方法和 Fastify 路由模板绑定。前端不能根据 URL、方法或权限码前缀临时推导 API 权限。

### 2.3 按钮权限

格式：

```text
button.<domain>.<resource>.<action>
```

当前系统由 API 权限生成按钮权限时，使用：

```text
button.system.page.create
button.system.page.update
button.system.user.reset-password
```

按钮权限和 API 权限是两个独立授权对象：

```text
角色显式授予按钮权限
AND
角色显式授予 API 权限
AND
按钮明确绑定 API
```

任何一项不满足，操作都必须拒绝。按钮权限不能单独产生 API 权限。

### 2.4 数据字段权限

格式：

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

- `field` 是固定分隔段。
- 字段名保留模型原字段名的大小写，例如 `displayName`、`createdAt`。
- 字段定义声明 `writable: true` 时才生成 `write` 权限。
- 只读字段只能生成 `read` 权限。
- 字段风险等级存储在字段定义中，不拼接到权限码里。
- 字段权限只控制字段读取和写入，不代表接口访问权限。
- `_count` 等查询层临时别名不得直接作为字段权限名；必须使用稳定的业务字段名或单独的统计权限。

特别注意：

```text
system.permission.field.id.read
```

表示 `Permission` 数据模型的 `id` 字段读取权限；它不是“字段管理接口读取权限”。

### 2.5 配置对象字段权限

按钮定义自身的字段权限使用：

```text
system.button.field.<field>.<read|write>
```

示例：

```text
system.button.field.label.read
system.button.field.label.write
system.button.field.apis.write
```

这类权限用于控制按钮配置对象的字段，不属于业务数据字段权限。

### 2.6 字段管理 API 权限

字段定义管理接口使用独立资源：

```text
system.field.read
system.field.update
system.field.status
```

禁止使用以下形式表示字段管理接口：

```text
system.permission.field.read
system.permission.field.update
system.permission.field.disable
```

这样可以避免它们与 `system.permission.field.<field>.<read|write>` 数据字段权限混淆。

### 2.7 数据范围权限

数据范围权限使用独立资源：

```text
system.data-scope.read
system.data-scope.update
system.data-scope.revoke
```

数据范围权限表示角色的数据访问范围，不等于数据字段权限，也不等于 API 权限。

## 3. 生成规则

### 3.1 页面和 API

| 分类 | 生成来源 | 客户端是否可创建 |
| --- | --- | --- |
| PAGE | seed 页面目录 | 否 |
| API | `permission-catalog.ts` 或受控 API 注册流程 | 仅允许受保护管理流程 |
| BUTTON | 页面按钮管理流程 | 仅允许受保护管理流程 |
| DATA FIELD | Prisma 字段生成器和受控覆盖项 | 否 |
| BUTTON FIELD | `button-field-policy.ts` | 否 |

内置管理 API 必须由服务端目录维护，不能由普通前端请求动态注册权限码、方法或路径。

### 3.2 数据字段

数据字段权限由以下信息生成：

```text
resource + ".field." + field + ".read"
resource + ".field." + field + ".write   // writable=true 时生成
```

字段名称、数据类型、关联模型和风险等级来自 Prisma 模型及受控覆盖项。客户端不能提交任意字段定义来扩大响应或写入权限。

### 3.3 生成前校验

每次新增或修改权限目录必须校验：

1. 权限码格式合法。
2. 权限码没有重复。
3. API 的 `(method, path)` 没有重复。
4. API 动作与 HTTP 方法匹配。
5. 字段权限满足资源、字段和 `read/write` 结构。
6. 页面基础 API 不包含写入、导出、审批和执行接口。
7. 历史废弃权限码不重新启用。
8. 权限码必须在 `sys_permission_role_type` 中登记明确的允许角色类型。

## 4. 权限绑定关系

API 的有效访问必须同时满足：

```text
用户有效
AND 角色有效
AND 角色显式授予 API
AND API 有效
AND 页面或按钮绑定有效
AND 请求方法和路由模板精确匹配
```

页面基础 API 仅用于页面加载、查询、详情、初始化和选择器数据。创建、修改、删除、导出、审批、执行等 API 必须绑定到具体按钮。

解除页面或按钮绑定后，即使角色仍保留 API 显式授权，该 API 也不得继续生效。

## 5. 旧权限码迁移

权限码改名不是普通文本替换，必须执行完整迁移：

| 旧权限码 | 目标权限码 |
| --- | --- |
| `system.permission.field.read` | `system.field.read` |
| `system.permission.field.update` | `system.field.update` |
| `system.permission.field.disable` | `system.field.status` |
| `system.data.read` | `system.data-scope.read` |
| `system.data.update` | `system.data-scope.update` |
| `system.data.revoke` | `system.data-scope.revoke` |
| `system.page.bind-api` | `system.page.api.bind` |
| `system.button.bind-api` | `system.button.api.bind` |
| `system.page.apis` | `system.page.api.read` |
| `system.page.api-options` | `system.page.api.options` |
| `system.operation-policy.manage` | `system.operation-policy.create` |
| `system.ops-ticket.executions` | `system.ops-ticket.execution.create` |

迁移顺序：

1. 更新服务端目录和生成器。
2. 更新 Controller、服务、前端指令和测试。
3. 在事务中迁移角色授权、页面绑定和按钮绑定。
4. 记录迁移前后权限快照。
5. 将旧权限码标记为 retired/disabled。
6. 重新登录并验证有效权限集合。
7. 通过权限预检脚本确认没有旧码、重复码和失效绑定。

旧码不能与新码长期并行，也不能通过前缀兼容、通配符或超级管理员旁路恢复访问。

## 6. 反例

以下写法不符合规范：

```text
system.permission.manage       # 历史全量管理权限
system.user.status             # 启停动作未拆分为明确意图
system.permission.field.read   # 与数据字段权限结构混淆
system.data.read               # 无法区分数据范围和数据字段
system.page.bind-api            # 动作顺序不统一
system.api.field._count.read    # 查询层临时别名
system.operationPolicy.create   # 资源使用 camelCase
system.user_*_read              # 使用下划线和非层级分隔
```
