# 数据字段权限规范

本文档是数据字段权限的唯一实现规范。它定义字段目录、数据库模型、权限码、初始化、接口、运行时校验、前端接入、迁移和验收要求。

接口公共规则见 [API_DESIGN.md](API_DESIGN.md)，授权架构和数据范围见 [PERMISSION_DESIGN.md](PERMISSION_DESIGN.md)，权限码命名见 [PERMISSION_CODE_STANDARD.md](PERMISSION_CODE_STANDARD.md)，租户边界见 [TENANCY_SECURITY.md](TENANCY_SECURITY.md)。这些文档只引用本规范，不重复定义字段读写语义。

## 1. 安全目标

字段权限必须同时解决四个问题：

1. 未授权字段不能出现在响应中；
2. 未授权字段不能写入数据库；
3. 创建和修改必须使用不同的写入能力；
4. 字段权限不能扩大 API 权限、租户边界或行级数据范围。

拒绝优先。字段未登记、权限不存在、字段定义停用、写入操作未声明、权限未授予或数据范围无效时，写入必须拒绝；读取只能由统一字段投影移除未授权字段，不得改用其他权限或旧逻辑放行。

职责边界固定为：API 权限决定能否调用接口，数据范围决定能访问哪些记录，字段权限决定记录中的哪些字段可读写，风险策略决定是否需要 MFA、重新认证或审批。任何一层都不能替代另一层。

## 2. 权威来源和职责

| 内容 | 权威位置 | 职责 |
| --- | --- | --- |
| Prisma 字段模型 | `backend/prisma/schema.prisma` | 定义 `PermissionField` 存储结构和数据库约束 |
| 静态字段目录 | `backend/src/security/policies/static-field-definitions.ts` | 定义系统管理对象的字段、风险和读写操作 |
| 动态字段覆盖 | `backend/src/security/policies/data-field-overrides.ts` | 只允许受控覆盖字段显示名、风险和写入操作 |
| 自动生成 | `backend/src/security/policies/data-field-generator.ts` | 从 Prisma 模型生成业务字段权限并清理过期绑定 |
| 初始化/同步 | `backend/src/database/seed.ts` | 写入静态字段、权限码和内置角色绑定 |
| 管理接口 | `backend/src/modules/permission/` | 创建、修改、查询和停用字段定义 |
| 运行时执行 | `backend/src/common/interceptors/data-field-security.interceptor.ts` | 写入白名单和响应字段投影 |
| 前端配置 | `frontend/src/views/system/permission/` | 展示字段属性并提交明确的读写配置 |
| 迁移 | `backend/prisma/migrations/` | 增加或变更字段权限数据库结构 |

修改字段权限时必须同时检查上述所有位置。只修改前端、DTO、seed 或单个拦截器都不算完成。

## 3. 数据模型

`sys_permission_field` 必须使用显式列，不使用 JSON 保存写入操作：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `resource` | `String` | 稳定业务资源编码 |
| `field` | `String` | API 使用的稳定字段名，保留 camelCase |
| `name` | `String` | 展示名称 |
| `dataType` | `String` | `string/number/boolean/enum/datetime/array/object/secret` |
| `relationResource` | `String?` | 关联字段的目标权限资源 |
| `relationModel` | `String?` | 关联 Prisma 模型 |
| `relationField` | `String?` | 关联包装对象中的字段 |
| `riskLevel` | `FieldRiskLevel` | 字段风险等级 |
| `status` | `PermissionStatus` | 字段定义是否启用 |
| `readable` | `Boolean` | 是否允许进入响应 |
| `allowCreate` | `Boolean` | 是否允许在 POST 中写入 |
| `allowUpdate` | `Boolean` | 是否允许在 PATCH 中写入 |
| `readPermissionId` | `String` | 必须存在的读取权限 |
| `writePermissionId` | `String?` | 有 CREATE 或 UPDATE 时存在 |

数据库约束：

- `@@unique([resource, field])`，同一资源内字段不能重复；
- `readPermissionId` 不得为空；
- `writePermissionId` 为空时 `allowCreate=false` 且 `allowUpdate=false`；
- `dataType=secret` 时 `readable=false`；
- `status` 与 `readable` 是两个独立维度：停用字段不等于不可读字段；
- 外键和索引名称必须使用短的显式名称，避免 MySQL 标识符超过 64 字符；
- 不得通过 `NULL` 表示“全部可读”“全部可写”或“全部数据范围”。

## 4. 权限码和配置模型

字段权限码固定为：

```text
<resource>.field.<field>.read
<resource>.field.<field>.write
```

`read` 权限表示字段读取能力，`write` 权限表示字段写入能力。字段管理接口使用独立的 `system.field.*` 权限，不能与业务字段权限混用。

代码配置使用扁平结构：

```ts
{
  resource: 'system.user',
  field: 'displayName',
  readable: true,
  writeOperations: ['CREATE', 'UPDATE'],
}
```

规则：

- `writeOperations` 只允许 `CREATE`、`UPDATE`，不能重复；
- 空数组或未声明表示禁止写入；
- `CREATE` 只对应 POST，`UPDATE` 只对应 PATCH；
- `readable: false` 仍可允许 CREATE，例如密码；
- 密码、MFA 秘密、令牌、密钥等必须显式配置为不可读，不得因普通角色权限变为可读；
- 字段风险等级不编码进权限码；
- 字段定义不得从前端任意扩展资源或字段白名单。

## 5. 初始化和权限同步

### 5.1 静态字段

静态字段必须在代码目录中显式声明。加载目录时必须校验：

1. `resource + field` 唯一；
2. 字段名和资源名格式合法；
3. `writeOperations` 只包含 CREATE/UPDATE 且无重复值；
4. `secret` 字段不可读；
5. 每个字段都有读取权限码；
6. 需要写入时才生成写权限码；
7. 权限码全局唯一且角色类型声明完整。

### 5.2 自动生成字段

Prisma 模型字段通过显式 `MODEL_RESOURCE_MAP` 映射到业务资源。未登记的模型禁止生成字段权限。敏感字段由服务端规则识别为不可读，不得依赖前端隐藏。

同步流程必须是幂等的：

1. upsert 读取权限和写入权限；
2. upsert `PermissionField` 的元数据和三个布尔策略；
3. 为允许的内置角色类型建立角色权限；
4. 删除已不可读字段的读取绑定；
5. 删除已取消写入操作的写权限、角色绑定和字段引用；
6. 删除不再允许的角色类型绑定；
7. 在同一事务内完成。

同步不能把不可读字段标记为 DISABLED 来代替 `readable=false`，也不能保留旧 JSON 写入字段或旧权限绑定。同步失败必须整体回滚，不得部分成功。

### 5.3 内置角色

安全管理员和系统管理员是否获得字段权限，必须由权限目录的角色类型策略决定。审计管理员和业务管理员不得因为字段自动生成而获得超出职责的字段权限。不可读字段不得授予任何角色读取权限。

## 6. 管理接口契约

字段管理接口至少包括：

```text
GET   /api/v1/permission/fields?resource=system.user
POST  /api/v1/permission/fields
PATCH /api/v1/permission/fields/:id
PATCH /api/v1/permission/fields/:id/enable
PATCH /api/v1/permission/fields/:id/disable
```

创建和修改请求必须明确提交：

```json
{
  "name": "显示名称",
  "dataType": "string",
  "riskLevel": "L1",
  "readable": true,
  "writeOperations": ["CREATE", "UPDATE"]
}
```

接口要求：

- `readable` 为必填布尔值，不允许通过省略字段保持旧值或意外放开读取；
- `writeOperations` 必须是去重后的 CREATE/UPDATE 数组；
- secret 字段提交 `readable=true` 必须拒绝；
- 资源和字段编码不可借此接口改名；
- 新增字段必须检查 `resource + field` 和权限码冲突；
- 清空写入操作时必须删除写权限、角色绑定并将 `writePermissionId` 置空；
- 改为不可读时必须删除所有读取角色绑定；
- 恢复可读或新增写入操作时，只能按当前角色类型策略重新绑定；
- 修改、停用、启用必须审计前后快照、主体、租户、traceId、原因和结果；
- 返回字段只使用 camelCase，并返回 `readable`、`allowCreate`、`allowUpdate`，不得返回数据库 JSON 或内部异常。

## 7. 运行时执行顺序

字段权限不能独立放行请求，唯一执行顺序如下：

```text
会话/用户有效
→ API 方法和路由权限
→ 当前租户上下文
→ 角色、权限状态和授权期限
→ 行级数据范围过滤
→ DTO 白名单校验
→ 字段读写权限校验
→ 字段风险/MFA/重新认证/审批
→ 数据库操作
→ 响应字段投影
```

### 7.1 写入

POST 请求的每个 body 字段必须同时满足：

```text
字段已登记且 ACTIVE
AND allowCreate = true
AND 主体拥有 <resource>.field.<field>.write
AND 字段属于 DTO 白名单
AND 字段风险控制通过
```

PATCH 请求将 `allowCreate` 视为无效，只检查 `allowUpdate=true`。未知字段、snake_case 别名、不可写字段和不匹配的写入操作必须拒绝，不能静默丢弃。

### 7.2 读取

响应字段必须同时满足：

```text
字段已登记且 ACTIVE
AND readable = true
AND 主体拥有 <resource>.field.<field>.read
```

关联对象必须递归应用同一规则，并限制最大深度。字段投影不得因为列表、详情、SSE、导出或文件状态接口而绕过。

## 8. 租户、组织、部门和数据范围

字段权限是第四层控制，不能代替前三层：

```text
租户边界
→ 组织边界
→ 部门/数据范围行过滤
→ 字段权限
```

- 单租户也必须使用明确租户上下文；
- `organizationId` 或 `departmentId` 为 `NULL` 不代表全量范围；
- 没有有效数据范围时拒绝访问，不能由字段权限兜底；
- `SELF`、部门树、组织树、租户级和 `CUSTOM` 只决定行，不能扩大字段可见性；
- 字段权限只在已经过滤后的行上执行；
- 导出、下载、SSE 和后台任务必须复用同一数据范围和字段投影服务；
- 客户端不得提交 tenantId、organizationId、departmentId 来扩大范围。

## 9. 数据库迁移

新增或修改字段权限模型时必须同时更新：

1. `prisma/schema.prisma`；
2. 正式 Prisma migration；
3. `permission-preflight.sql`（如果涉及权限约束或校验）；
4. `scripts/verify-permission-migration.js`（如果涉及迁移验证）；
5. `seed.ts` 和自动生成器；
6. 类型、接口、运行时和前端配置；
7. 正反向测试和本文档。

迁移要求：

- 生产迁移不得依赖数据库中可为 NULL 的安全边界字段；
- 不使用安全边界的隐式默认值；先允许迁移临时为空，按字段类型和已批准策略显式回填，再收紧为 NOT NULL；
- 禁止通过 `db push` 替代正式迁移；
- 禁止修改已执行迁移，必须追加新迁移；
- 本地无重要数据时可使用 `db:reset` 验证完整初始化；
- 迁移完成后必须检查字段、外键、唯一约束、索引和权限绑定。

## 10. 开发验收清单

新增或修改任何字段时，提交前逐项确认：

- [ ] Prisma 模型和迁移已更新；
- [ ] 资源映射、静态目录或受控覆盖已更新；
- [ ] 字段名在资源内唯一；
- [ ] 读取权限码和必要的写权限码已生成；
- [ ] `readable`、`allowCreate`、`allowUpdate` 语义明确；
- [ ] secret/密码/令牌等字段不可读；
- [ ] POST 和 PATCH 的写入行为分别验证；
- [ ] 未知字段、别名字段和越权字段会被拒绝；
- [ ] 响应、关联对象、导出和 SSE 均执行字段投影；
- [ ] 行级数据范围先于字段投影；
- [ ] 角色类型和租户绑定符合职责边界；
- [ ] 权限变更会清理旧绑定并记录审计；
- [ ] 前端表单和返回字段已更新；
- [ ] 正向、反向、敏感字段和迁移测试已通过；
- [ ] `pnpm --dir backend db:generate`、`pnpm --dir backend build`、测试和 `git diff --check` 已通过。

禁止以下实现：

- 用前端隐藏字段代替后端投影；
- 用 `NULL`、空数组或缺省值表示“全部权限”；
- 用 JSON 保存未约束的写入操作；
- 用权限码前缀、正则或字段名猜测授权；
- 只校验接口权限而不校验字段权限；
- 只校验字段权限而不校验数据范围；
- 保留旧字段权限兼容分支或双写逻辑；
- 通过停用字段代替不可读；
- 迁移后保留无效权限码或角色绑定。

