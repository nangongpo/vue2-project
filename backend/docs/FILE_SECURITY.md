# 文件安全设计

## 1. 文档定位

本文档是 backend 文件模块的唯一权威文档，覆盖业务页面上传、系统页面文件管理、分片续传、异步最终化、病毒扫描、权限、数据字段权限、数据范围、审批、审计和内网 ClamAV 部署。

设计以等保三级要求为基线，并按高安全场景增强。最终定级、密码应用、数据分类分级、留存期限和测评结论以组织定级备案、适用法律法规及测评机构意见为准。

本文档是目标设计。当前同步扫描、任务不可恢复和状态粒度不足的实现必须按本文档改造，不能通过无限延长 HTTP 超时替代异步任务。

## 开发者速查

核心接口：

- `POST /api/v1/files/uploads/initiate`：创建上传会话；
- `GET /api/v1/files/uploads/:uploadId/status`：查询已接收分片和安全状态；
- `PUT /api/v1/files/uploads/:uploadId/parts/:partNumber`：以 `application/octet-stream` 上传分片；
- `POST /api/v1/files/uploads/:uploadId/complete`：校验分片连续性和 SHA-256，提交最终化任务。

开发约束：

- 使用 `fileName`、`fileSize`、`chunkSize`、`partNumber`、`clientSha256` 等驼峰字段；
- 分片大小由服务端最终确定，客户端参数不能绕过上限、数量、哈希和租户校验；
- 上传完成后文件仍不可用，必须通过安全扫描和内容策略检查；
- 下载、删除、恢复和重新扫描必须重新执行权限、租户和数据范围校验。

配置见 [CONFIGURATION.md](CONFIGURATION.md)，ClamAV 运维见 [CLAMAV_CONFIGURATION.md](CLAMAV_CONFIGURATION.md)。

## 2. 安全目标

1. 文件完成可信扫描前，任何业务都不得使用。
2. 上传会话、文件对象、扫描任务和业务绑定相互隔离，不能互相绕过授权。
3. 业务用户只能查看和操作自己有权访问的文件；系统管理员不因拥有系统管理权限自动获得业务下载权。
4. 删除、拒绝、恢复、重新扫描等高风险生命周期操作统一进入四阶段受控审批。
5. 上传、最终化、扫描和管理操作必须幂等、可恢复、可审计。
6. 文件名、MIME、扩展名和客户端哈希均是不可信输入。
7. 文件存储私有化，前端不接触物理路径、对象 Key、扫描协议或内部异常。
8. 扫描服务不可用、结果不确定或审计失败时默认拒绝放行。

## 3. 总体架构

```text
浏览器/内网客户端
        |
        | HTTPS、SameSite Cookie、CSRF、限流
        v
API 网关 / backend
        |
        +--> 上传会话、分片、文件查询、生命周期 API
        |
        +--> 数据库任务表
                |- 文件最终化任务
                |- 病毒扫描任务
                v
        后台 Worker
          |- 分片合并和 SHA-256
          |- 魔数/MIME 检测
          |- ClamAV clamd
          |- 重试、恢复、审计、告警

隔离存储区  <---- Worker 读取
正式私有对象存储 <---- 仅 CLEAN 文件转入
数据库 <---- 元数据、状态、任务、审批、审计
```

隔离区、正式对象区、备份区和扫描区使用不同目录或存储桶、不同系统账号和最小权限。应用 API 不直接暴露对象存储。

## 4. 模块边界

### 4.1 文件平台模块

负责上传会话、分片校验、最终化、扫描任务、文件状态、隔离/转正、绑定前置校验、审计和告警。

### 4.2 业务模块

负责业务用途、允许的文件字段、业务对象存在性、租户/组织关系、业务授权和文件绑定。业务模块不得直接修改文件状态、扫描结果或物理存储位置。

### 4.3 系统文件管理模块

负责按系统权限和数据范围查询安全元数据、查看任务、发起受控审批、查看安全告警和必要的审计证据。系统文件权限不能隐式授予业务下载权。

## 5. 状态机

### 5.1 上传会话

```text
UPLOADING
    | complete
    v
FINALIZING
    | 合并、哈希和类型检测成功
    v
SCANNING
    | 扫描通过
    v
COMPLETED

UPLOADING  -> ABORTED / EXPIRED / FAILED
FINALIZING -> FAILED / EXPIRED
SCANNING   -> FAILED / EXPIRED
```

`COMPLETED` 只代表扫描流程完成，文件是否可用必须同时满足 `READY + CLEAN`。

### 5.2 文件对象

| 文件状态 | 扫描状态 | 是否可业务使用 |
| --- | --- | --- |
| `QUARANTINED` | `PENDING` | 否 |
| `QUARANTINED` | `CLEAN` | 否，等待转正事务完成 |
| `QUARANTINED` | `ERROR` | 否 |
| `REJECTED` | `INFECTED` | 否 |
| `READY` | `CLEAN` | 是 |
| `DELETED` | 任意 | 否 |

### 5.3 任务

```text
PENDING -> RUNNING -> SUCCEEDED
                   -> INFECTED
                   -> FAILED -> PENDING（可重试）
                   -> DEAD_LETTER（超过重试上限）
PENDING/RUNNING -> CANCELLED
```

`RUNNING` 任务必须有租约和超时恢复机制，进程重启后不能丢失任务。

## 6. 数据模型

### 6.1 文件对象

至少包含：

```text
id, tenant_id, owner_user_id
storage_key（仅服务端）
original_name, safe_name, declared_mime, detected_mime, extension
size, sha256, classification
status, scan_status, scan_detail
scan_engine_version, policy_version
created_at, updated_at, deleted_at
```

`storage_key`、物理路径和内部存储信息不得出现在前端响应。

### 6.2 上传会话

至少包含：

```text
id, tenant_id, user_id, file_id
object_key（仅服务端）
file_name, declared_mime, purpose
resource_type, resource_id, field_name
file_size, chunk_size, total_parts, client_sha256
status, expires_at, created_at, updated_at
```

会话必须绑定租户、用户、业务用途和资源。会话 UUID 不能代替登录态和权限校验。

### 6.3 分片和任务

分片以 `(upload_session_id, part_number)` 唯一，保存大小、校验和、状态和时间。

建议增加：

```text
sys_file_finalize_job
sys_file_scan_job
```

任务至少保存：

```text
id, file_id, upload_id, status
attempts, max_attempts, next_retry_at
locked_at, locked_by, started_at, finished_at
last_error, created_at, updated_at
```

任务表必须支持按状态、租户、下一次执行时间和锁定超时恢复。

## 7. 业务上传流程

### 7.1 创建会话

```http
POST /api/v1/files/uploads/initiate
```

职责：校验用户、租户、用途、业务对象、文件大小、允许类型和分片策略，创建 `UPLOADING` 会话并返回 `uploadId/chunkSize/totalParts/expiresAt`。

该接口基线为 `L2`，要求重新认证、MFA、审计、限流和幂等键。

服务端不得信任客户端提供的 MIME、扩展名、哈希、物理路径或任意业务字段。

### 7.2 查询会话

```http
GET /api/v1/files/uploads/:uploadId/status
```

仅允许会话所属用户查询。返回已收到分片、上传状态、文件状态、扫描状态、是否可继续和是否可重试。不返回对象 Key、任务锁、扫描协议和内部异常。

### 7.3 上传分片

```http
PUT /api/v1/files/uploads/:uploadId/parts/:partNumber
```

职责：校验登录态、接口权限、会话归属、租户、状态、编号、大小和请求体上限，流式写入隔离区并幂等更新分片记录。

分片是已经建立上传会话后的续传操作，不应每片重复触发 `L2`；但必须保留所有权、权限、限流、大小校验和审计。

### 7.4 提交完成

```http
POST /api/v1/files/uploads/:uploadId/complete
```

该接口只负责：

1. 校验分片完整且连续；
2. 原子地将会话从 `UPLOADING` 改为 `FINALIZING`；
3. 创建文件对象和最终化任务；
4. 立即返回任务状态。

不得等待文件合并、ClamAV 或其他不可预测的长任务。建议返回 `202 Accepted`：

```json
{
  "code": "000000",
  "message": "上传已提交，文件正在处理中",
  "data": {
    "uploadId": "uuid",
    "fileId": "uuid",
    "uploadStatus": "FINALIZING",
    "fileStatus": "QUARANTINED",
    "scanStatus": "PENDING"
  }
}
```

重复调用必须返回当前任务状态；只有参数不一致或完整性校验失败时才拒绝。

### 7.5 中止

```http
POST /api/v1/files/uploads/:uploadId/abort
```

只允许所属用户中止未最终化会话。隔离分片删除失败时进入清理补偿任务，不能忽略异常。

### 7.6 前端状态查询

`complete` 成功后，业务页面显示“已提交，正在安全扫描”，使用状态接口轮询。建议间隔 2～5 秒并逐步退避，在 `COMPLETED/FAILED/REJECTED/EXPIRED/ABORTED` 等终态停止。页面销毁时取消轮询，刷新后可依据非敏感 `uploadId` 恢复查询。

Chrome 49 使用 Axios、XHR 和定时器，不依赖 Fetch Stream、WebSocket 或现代 File System API。

## 8. 最终化与扫描任务

### 8.1 最终化 Worker

最终化 worker 获取并锁定 `FINALIZING` 任务，按顺序合并隔离分片，重新计算服务端 SHA-256，检测魔数和实际 MIME，校验客户端哈希，创建扫描任务并将会话置为 `SCANNING`。

合并必须流式处理，不能将完整文件加载到内存。临时对象完成后使用原子重命名或等价提交操作。

### 8.2 扫描 Worker

扫描 worker 获取并锁定 `PENDING` 任务，从隔离对象流式读取，通过本地 Unix Socket 或受控内网 TCP 调用 `clamd`，保存结论、引擎版本和策略版本，再更新文件、会话、任务、审计和告警。

扫描不能在 HTTP 请求或审批数据库事务中执行。禁止用 `void scan()` 代替持久化任务，因为进程重启会丢失任务。

### 8.3 失败处理

```text
网络/服务异常 -> FAILED -> 退避重试
超过重试上限  -> DEAD_LETTER + QUARANTINED/ERROR
病毒命中      -> INFECTED + REJECTED
扫描通过      -> CLEAN + READY
```

任何非 `CLEAN` 结果都不能放行。

## 9. 系统文件管理

### 9.1 列表和详情

```http
GET /api/v1/files
GET /api/v1/files/:fileId
```

必须按系统权限、租户、组织和数据范围过滤，并返回 `meta.statusOptions`、`meta.scanStatusOptions` 和服务端计算的 `availableActions`。

详情使用独立字段策略。原始名称、上传人、业务绑定、SHA-256、扫描详情和引擎版本不能因列表接口可见而默认全部返回。不得返回物理路径、对象 Key 和内部堆栈。

### 9.2 重新扫描

```http
POST /api/v1/files/:fileId/rescan
```

接口只发起受控审批或创建扫描任务，不等待 ClamAV。审批执行阶段只校验文件状态、记录审批引用、置为隔离/待扫描并创建持久化任务。

### 9.3 拒绝、删除、恢复

```http
POST /api/v1/files/:fileId/reject
POST /api/v1/files/:fileId/delete
POST /api/v1/files/:fileId/restore
```

统一进入：

```text
申请 → 审批 → 执行 → 复核
```

执行阶段不能执行长时间文件 IO。恢复成功后必须重新进入隔离和扫描，不能直接恢复为 `READY`。

## 10. 权限设计

### 10.1 业务权限

| 权限 | 类型 | 基线 |
| --- | --- | --- |
| `file.upload.read` | 页面基础接口 | L0 |
| `file.upload.status` | 页面基础接口 | L0 |
| `file.upload.initiate` | 按钮接口 | L2 |
| `file.upload.part` | 按钮/技术续传接口 | L0，会话绑定 |
| `file.upload.complete` | 按钮接口 | L2 |
| `file.upload.abort` | 按钮接口 | L2 |
| `file.download` | 独立接口权限 | L0，仍需业务范围 |

页面基础接口只能绑定查询接口，写入、导出、审批和生命周期动作必须绑定按钮。

### 10.2 系统权限

```text
system.file.admin.read
system.file.admin.detail
system.file.admin.task.read
system.file.admin.scan
system.file.admin.reject
system.file.admin.delete
system.file.admin.restore
system.file.admin.download
```

前端不保存权限规则、状态中文映射或动作判断，只使用服务端返回的 `availableActions` 和按钮文案。

### 10.3 高风险操作

文件删除、拒绝、恢复和重新扫描使用统一 `ApprovalService`。申请人不得审批自己的申请，复核人不得与申请、审批、执行阶段人员重复。L3 操作必须有 MFA、重新认证、审批、双人控制和完整审计。

## 11. 数据字段权限与数据范围

至少初始化以下资源：

```text
file
file.upload
file.upload.part
system.file
system.file.upload
system.file.scan-result
system.file.binding
```

接口新增字段必须同步更新字段定义、初始化数据、角色授权、裁剪测试和前端契约测试。

数据范围至少支持：

```text
TENANT / ORGANIZATION / DEPARTMENT / CUSTOM / SELF
```

空租户、资源不匹配或数据范围未确定时默认拒绝，不能回退为全量查询。业务页面的文件列表固定为当前用户范围，不能通过查询参数覆盖 `ownerUserId/tenantId`。

## 12. 存储与内容安全

1. 物理路径由服务端使用随机标识生成，禁止把用户文件名拼入路径。
2. 隔离目录和正式对象目录分离，上传目录禁止执行权限。
3. MIME 和扩展名必须与魔数、实际 MIME 和组织策略联合判断。
4. 限制单文件大小、分片数、用户配额、并发数、压缩包递归层数和解压大小。
5. 文件只有 `READY + CLEAN` 才允许下载和业务绑定。
6. 失败、过期和中止会话由补偿任务清理，清理动作必须可重试并审计。

内网 ClamAV 使用常驻 `clamd`，默认通过 Unix Socket 调用：

```dotenv
CLAMAV_SOCKET_PATH=/usr/local/var/run/clamav/clamd.sock
CLAMAV_HOST=127.0.0.1
CLAMAV_PORT=3310
CLAMAV_TIMEOUT_MS=120000
```

Socket 不存在、权限不足、服务无响应、病毒库过期或扫描队列异常时，文件保持隔离，不得转为 `READY`。TCP 3310 只能在受控内网使用，不得暴露到业务网以外。

## 13. 审计与告警

至少记录上传会话创建、分片异常、完成提交、最终化、扫描、状态变化、绑定解绑、下载拒绝、审批申请/审批/执行/复核和管理员敏感查询。

审计至少包含事件 ID、时间、租户、操作者、会话、源 IP、请求 ID、文件 ID、业务资源、动作、结果、风险等级、策略版本和拒绝原因。

不得记录密码、OTP、Cookie、上传凭证、文件原文、完整下载地址、扫描协议原文、数据库错误和堆栈。

监控扫描积压、扫描失败、病毒命中、任务反复失败、跨租户访问、异常上传、存储不足、审计失败和对象/元数据不一致，并触发告警。

## 14. 统一接口和错误规范

成功响应：

```json
{
  "code": "000000",
  "message": "操作成功",
  "data": {}
}
```

错误响应使用系统统一错误信封，禁止暴露 NestJS、Prisma、Fastify、Node.js、文件系统或 ClamAV 内部对象。异步接口必须返回任务状态、文件安全状态和是否可重试。

## 15. 幂等、并发和补偿

1. `initiate` 使用客户端幂等键，避免重复创建会话。
2. `complete` 使用数据库条件更新抢占状态，只有一个请求创建最终化任务。
3. 重复 `complete` 返回已有任务状态，不重复合并或扫描。
4. 分片按会话和编号幂等。
5. Worker 使用锁和租约，超时任务可恢复。
6. 生命周期操作使用条件状态更新。
7. 扫描结果绑定文件 ID、哈希和任务 ID，旧任务不能覆盖新任务。
8. 数据库成功而文件操作失败时进入补偿；文件成功而数据库失败时进入孤儿对象清理。
9. 状态迁移只能由服务端状态机完成，前端不能提交 `status/scanStatus/fileStatus`。

## 16. 部署、备份和恢复

部署至少划分用户访问区、应用区、数据区、存储区、安全服务区和审计区。ClamAV 使用独立账号，仅授予读取隔离区和写扫描日志所需的权限。

病毒库由受控更新节点下载，经过完整性校验、审批和回归测试后同步到内网。必须记录版本、更新时间、来源、校验结果和发布人。

备份覆盖文件元数据、对象、上传会话、分片、任务、绑定、审批和审计。恢复演练必须验证文件哈希、状态、绑定、权限、数据范围和审计链。

## 17. 测试与验收

### 17.1 功能

- 乱序、并发、重复分片和单片重试；
- 网络断开、页面刷新和断点续传；
- `complete` 重复调用和客户端超时后的恢复；
- 最终化失败、任务重试和进程重启恢复；
- 扫描通过、病毒命中、超时和服务不可用；
- 删除、拒绝、恢复、重新扫描审批；
- 状态轮询和终态停止。

### 17.2 安全

- 越权查询其他用户、租户和组织文件；
- 篡改 `fileId/uploadId/partNumber`；
- 路径穿越、控制字符、伪造 MIME、压缩炸弹；
- 重放幂等键、过期会话和旧扫描任务；
- 未扫描文件下载；
- 申请人审批自己；
- 系统文件权限绕过业务下载权限；
- 内部路径、扫描协议和异常堆栈泄露。

### 17.3 字段和权限

每个接口必须验证统一响应、字段权限初始化、数据范围初始化、服务端裁剪、服务端 `availableActions`、业务/系统边界和前端无状态映射。

## 18. 实施顺序

1. 新增最终化任务、扫描任务和必要索引。
2. 将 `complete` 改为校验并投递任务，不等待合并和扫描。
3. 实现 Worker、锁、重试、超时恢复和告警。
4. 扩展状态接口，返回上传、文件和扫描任务状态。
5. 将系统重新扫描从审批事务中移出。
6. 补充租户、组织和业务数据范围过滤。
7. 拆分文件列表、详情和安全字段策略。
8. 改造业务上传页面为轮询状态。
9. 改造系统文件页面为任务和状态展示。
10. 清理前端状态映射、固定权限判断和敏感字段兜底。
11. 完成功能、安全、恢复和审计验收。

## 19. 设计结论

上传完成不等于文件安全可用。生产流程必须是：

```text
上传会话
→ 分片接收
→ 异步最终化
→ 异步安全扫描
→ CLEAN/READY
→ 业务使用
```

系统文件管理只负责受控查询、审批和任务管理；业务页面只负责当前用户范围内的上传和状态查看。扫描未完成、结果不确定、任务失败或数据范围不明确的文件，必须保持拒绝使用状态。
