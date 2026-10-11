# SSE 通用事件流设计

> 版本：2.0  
> 状态：设计基线  
> 适用：文件上传、异步扫描、审批、导入导出、报表和运维工单

## 1. 文档边界

本文档只定义 SSE、事件发布、连接治理和降级策略，不重新定义租户、组织、部门、数据范围或字段权限规则。

所有 SSE 接口必须遵循：

- [TENANCY_SECURITY.md](TENANCY_SECURITY.md)：单租户、多租户、租户、组织、部门和 `NULL` 语义；
- [PERMISSION_DESIGN.md](PERMISSION_DESIGN.md)：数据资源、显式 `SELF`、数据范围和字段权限顺序；
- [API_DESIGN.md](API_DESIGN.md)：公共 HTTP、认证、错误、审计和响应规范。

全局规则只有上述文档中的定义有效。SSE 文档不得重新解释或弱化这些规则。

## 2. 设计结论

采用：

```text
数据库事务 + Outbox
        ↓
Redis 跨实例事件传输
        ↓
实例本地 SSE 连接管理
        ↓
浏览器 EventSource
        ↓
状态接口轮询兜底
```

SSE 只负责通知状态变化，不负责保存业务状态，也不替代认证、授权、数据范围、字段裁剪或业务状态机。数据库状态是唯一事实来源。

## 3. 通用事件模型

事件由服务端生成，客户端不能提交事件范围：

```ts
type DomainEvent<T = unknown> = {
  eventId: string
  eventType: string
  aggregateType: string
  aggregateId: string
  tenantId: string
  subjectType: 'USER' | 'TENANT' | 'SYSTEM'
  subjectId: string
  aggregateVersion: number
  occurredAt: string
  payload: T
}
```

事件必须绑定租户、主体和资源，payload 只能包含字段权限裁剪后的最小字段。不得包含文件内容、存储路径、访问令牌、内部任务 ID、扫描原始错误、堆栈或其他租户数据。

## 4. Outbox 可靠发布

业务状态和事件必须在同一数据库事务提交：

```text
BEGIN
  更新业务状态
  更新任务状态
  写入 event_outbox
COMMIT
```

Outbox 至少包含：

```text
eventId, tenantId, subjectType, subjectId
eventType, aggregateType, aggregateId, aggregateVersion
payload, status, attempts, nextRetryAt, lastError
createdAt, publishedAt
```

`aggregateVersion` 是聚合状态的有限递增业务版本，必须使用 `1` 开始的整数序列，不能使用毫秒时间戳、随机数或数据库自增主键。生产者必须在同一业务事务中根据状态流转确定版本；客户端只使用它判断同一聚合事件的新旧，不得据此推断时间或权限。

状态至少为 `PENDING`、`PUBLISHING`、`PUBLISHED`、`DEAD_LETTER`。

Redis 发布失败时保留 Outbox，按退避策略重试，达到上限后告警并进入 Dead Letter。不能因为通知发布失败而回滚已经提交的业务状态，也不能因此重复执行扫描、审批或文件处理任务。

## 5. 单实例和多实例

### 5.1 单实例

开发环境可以使用进程内事件总线，但只允许作为单实例实现。进程重启会丢失通知，Worker 与 API 分离时也无法通信。

### 5.2 多实例

生产环境必须使用 Outbox 加 Redis。每个实例只维护自己的 SSE 连接，并使用一个或少量 Redis 订阅连接进行本地分发，不得为每个浏览器建立 Redis 订阅连接。

Redis 必须使用独立的：

- 普通命令连接；
- 发布连接；
- 订阅连接。

推荐主题：

```text
event-stream:{tenantId}:{subjectType}:{subjectId}
```

主题由服务端生成，客户端不能提交主题、租户、用户或广播范围。

Redis Pub/Sub 只适合状态通知。需要完整事件重放时，使用 Redis Streams 或直接查询 Outbox，不能把 Pub/Sub 当作可靠消息队列。

### 5.3 Redis 故障

Redis 故障时：

- 业务状态不能回滚；
- Outbox 保留并继续重试；
- SSE 可以发送快照和心跳，但不能声称实时事件完整；
- 客户端切换状态接口轮询；
- Redis 恢复后客户端重新获取快照并恢复 SSE。

## 6. SSE 接口规范

推荐使用资源级接口：

```http
GET /api/v1/files/uploads/:uploadId/events
```

其他模块复用相同基础设施，但必须提供各自的资源快照和授权策略。禁止暴露客户端可以任意订阅主题的全局接口。

### 6.1 建立连接

建立连接必须调用全局安全策略，顺序为：

```text
认证
  → 当前租户和成员关系校验
  → 组织、部门和数据范围校验
  → 资源权限校验
  → 字段权限计算
  → 注册本地监听器
  → 查询当前快照
  → 发送 snapshot
  → 发送注册期间缓存的后续事件
```

SSE 不得自行实现另一套租户或数据范围判断。单租户下仍必须使用默认租户条件；组织或部门为 `NULL` 时遵循全局文档定义，不得扩大为全量范围。

### 6.2 事件格式

```text
event: snapshot
id: 01JXYZ...
data: {"uploadStatus":"SCANNING","scanStatus":"PENDING"}

event: status
id: 01JXYZ...
data: {"uploadStatus":"COMPLETED","fileStatus":"READY","scanStatus":"CLEAN"}
```

响应头：

```http
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

每 15～30 秒发送心跳。达到业务终态后发送最终事件并关闭连接。

### 6.3 连接期间的授权变化

组织、部门、成员关系、角色、数据范围、字段权限或租户状态变化后，连接不能永久沿用旧授权。

连接上下文至少记录服务端计算的：

```text
tenantId
userId
organizationId
departmentId
authorizationVersion
resourceType
resourceId
```

推荐使用授权版本失效机制：权限、成员关系、组织部门或数据范围变更时递增版本并发布失效事件；SSE 心跳或推送前检查版本；版本不一致时重新授权；授权失效时发送 `authorization.revoked` 或关闭连接。高敏感资源必须在每次发送事件前重新执行完整授权和数据范围校验。

## 7. 断线和轮询兜底

`Last-Event-ID` 只能用于重连优化，不能用于授权，也不能作为唯一恢复依据。每次重连必须重新鉴权、校验租户成员关系、组织部门归属、数据范围和字段权限，再查询并发送当前快照。

前端策略：

```text
任务提交成功 → 建立 SSE → 接收 snapshot/status → 终态后关闭 SSE
SSE 失败 → 1/2/4/8/16 秒退避重连 → 连续失败后启动轮询
```

SSE 恢复后停止轮询。页面销毁、任务中止和退出页面时关闭 SSE 与定时器。状态接口不能删除，轮询在业务终态停止。

## 8. 连接治理和资源保护

必须限制：

- 单用户连接数；
- 单租户连接数；
- 单 IP 新建连接速率；
- 单连接生命周期；
- 单连接事件速率；
- 单事件 payload 大小；
- 待发送队列大小。

慢客户端队列超过上限时关闭连接，由客户端重新获取快照，不得阻塞 Worker、Redis 订阅器或其他 SSE 连接。连接关闭时释放监听器、定时器、队列、连接计数和本地订阅关系。

## 9. 通用后端模块

当前实现的 `EventStreamModule` 已提供以下基础能力：

```text
EventOutboxService
EventPublisher
RedisEventTransport
LocalEventRegistry
SseConnectionManager
EventAuthorizationService
FieldProjectionService
EventStreamMetrics（监控指标由部署层接入）
```

业务模块负责事务状态、Outbox 事件、资源快照、调用统一数据范围服务和字段裁剪服务；当前文件模块已接入 `file.upload.status.changed`，基础设施负责 Outbox 发布重试、Redis 跨实例广播、连接生命周期、事件过滤和最小字段投影。连接限额、授权版本失效、指标告警由统一网关和部署监控继续执行，未完成前不得宣称已具备对应能力。

可复用事件：

```text
file.upload.status.changed
approval.status.changed
ops-ticket.status.changed
import.task.status.changed
export.task.status.changed
report.generate.status.changed
```

## 10. 审计和监控

至少记录：

- 连接建立、关闭和鉴权失败；
- 租户、组织、部门和数据范围越权尝试；
- 事件发布延迟；
- Outbox 待发布、重试和 Dead Letter；
- Redis 发布和订阅故障；
- 客户端轮询降级；
- 慢客户端和队列溢出。

正常心跳不写审计日志，事件 payload 不写普通访问日志。

## 11. 文件上传接入

文件上传状态默认是上传用户本人可见，必须由文件模块提供资源快照和统一授权：

```text
uploadSession.tenantId = session.activeTenantId
AND uploadSession.userId = authenticatedUser.userId
```

组织或部门管理员未来若要查看其他用户文件，必须通过 `file` 数据范围资源和字段权限校验，不能仅凭角色类型订阅。

SSE 只通知上传、最终化和扫描状态，不能授予下载权限。未扫描、拒绝、删除或过期文件的下载仍由独立下载接口重新校验。

## 12. 验收要求

- 单租户默认租户始终进入事件查询条件；
- 单租户启用组织部门后，SSE 遵循组织、部门和数据范围；
- 组织、部门为 `NULL` 时不会扩大访问范围；
- 多租户不能互收事件；
- 用户移动部门、成员关系撤销或数据范围变更后旧连接失效；
- 未授权字段不会出现在 snapshot 或增量事件；
- API 与 Worker 分离时事件可送达；
- Redis 重启后 Outbox 可以继续发布；
- 数据库提交成功但 Redis 失败时状态接口仍可恢复；
- 重连不能绕过租户、组织、部门、资源或字段权限；
- SSE 失败后自动退回轮询；
- 终态后 SSE 和轮询都停止。
