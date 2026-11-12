# 文件扫描历史开发方案

状态：已实现；本机增量迁移与限定范围权限同步已执行。本文保留设计约束，并在第 9 节记录实现和验证范围。
日期：2026-11-12。

本文是扫描历史功能的开发契约，补充 [FILE_SECURITY.md](FILE_SECURITY.md) 的扫描及文件管理规则。公共响应和分页遵循 [API_DESIGN.md](API_DESIGN.md)，权限遵循 [DATA_FIELD_SECURITY.md](DATA_FIELD_SECURITY.md)，审批遵循 [APPROVAL_CONTRACT.md](APPROVAL_CONTRACT.md)。

## 1. 目标与现状

目标：从文件详情或一次重新扫描审批，明确查到对应任务、每次执行的结果，以及实际使用的引擎和策略版本。

已实现的基础：

- `FileObject` 保存最新扫描状态、说明、引擎版本和策略版本。
- `FileScanJob` 保存任务状态、累计尝试次数、租约、最后错误和部分时间字段。
- 扫描通过受控的 clamd Socket/TCP 执行；实际引擎版本通过 VERSION 获取，应用策略版本来自 `FILE_SCAN_POLICY`。
- 重新扫描与恢复按 [文件操作风险分级](FILE_OPERATION_RISK_DESIGN.md) 判定：L2 直接入队，L3 审批执行后入队；扫描始终异步执行。

本次开发前的缺口（已由下述实现补齐）：

- 重试更新同一任务，覆盖最后错误，无法查到各次执行过程。
- 首次上传在 `finalizeOne` 中直接创建扫描任务；重新扫描和恢复通过 `enqueue` 创建或复用任务，入口不统一。
- 任务缺少完整来源、审批关联及内容快照。
- 文件详情没有历史查询入口；审批执行成功不等于扫描完成。
- Worker 结果回写缺少完整租约校验；旧 Worker 和历史任务可能覆盖新的状态。
- 成功状态提交后再写审计，审计异常会进入扫描失败分支，存在结果不一致风险。

本次开发保留文件上的最新结果字段；增加历史数据及只读查询，所有入口遵循统一风险、授权及审批策略。

## 2. 数据结构

### 2.1 现有 FileObject：最新结果投影

保留 `scanStatus`、`scanDetail`、`scanEngineVersion`、`policyVersion`，新增内部关联 `currentScanJobId`、`latestScanAttemptId`。

`currentScanJobId` 标识当前生效任务；`latestScanAttemptId` 标识该任务最近一次已结算执行。新任务入队时清空上一任务的最新结果及版本。历史页面单独分页查询，不在文件列表或详情接口中嵌入完整历史。

上述关联属于内部一致性控制字段，默认不增加到文件详情响应。

### 2.2 现有 FileScanJob：一次扫描任务

继续使用任务表，增加以下内容：

| 字段 | 用途 |
| --- | --- |
| `sha256`、`size` | 任务创建时的服务端文件内容快照；不可通过文件最新值事后推算 |
| `leaseToken`、`leaseExpiresAt` | 每次领取生成新的租约令牌，隔离过期 Worker |
| `latestAttemptId` | 最近一次已结算执行，用于任务摘要 |
| `historyAvailable` | 区分新任务完整历史和存量任务历史缺失，默认迁移为 false，新任务写 true |

保留 `tenantId`、`fileId`、重试次数、最大次数、调度和起止时间。新增索引 `(tenantId, fileId, createdAt, id)`。

扫描任务状态使用独立枚举，避免修改共用 `FileJobStatus` 影响最终化任务：`PENDING`、`RUNNING`、`SUCCEEDED`、`INFECTED`、`DEAD_LETTER`、`CANCELLED`。

### 2.3 新增 FileScanAttempt：每次执行

每次 Worker 成功领取任务后创建一条执行记录，包括尚未实际调用引擎就失败的执行。重试新增记录，不能覆盖此前记录。

| 字段 | 约束与用途 |
| --- | --- |
| `id`、`tenantId`、`fileId`、`jobId` | UUID 及归属；服务端校验关联租户和文件一致 |
| `attemptNo` | 当前任务内递增序号，唯一约束 `(jobId, attemptNo)` |
| `leaseToken` | 创建执行时的租约；不对外返回 |
| `status` | `RUNNING`、`SUCCEEDED`、`FAILED`、`INTERRUPTED` |
| `stage` | `PREPARE`、`VERSION`、`SCAN`、`PROMOTE`、`COMMIT`，定位失败阶段 |
| `verdict` | `CLEAN`、`INFECTED`、`ERROR`；尚未获得扫描结论时为 null |
| `scanDetail` | 扫描说明或命中签名，限制长度并脱敏 |
| `scanEngineVersion`、`policyVersion` | 本次实际获取/应用的版本；未知时为 null，不填引擎名称冒充版本 |
| `startedAt`、`finishedAt`、`durationMs` | 执行起止和耗时，未结束时后两项为 null |
| `errorCode`、`errorMessage` | 稳定的业务诊断码及脱敏说明，不保存原始堆栈和内部地址 |
| `traceId` | 服务端审计关联；不作为访问凭证，默认不返回前端 |

`SUCCEEDED` 表示执行流程已成功结算，扫描结论仍须查看 `verdict`：感染结果可以是 `SUCCEEDED + INFECTED`；扫描结论为 CLEAN 但存储提升失败是 `FAILED + CLEAN`，文件不得可用。

增加索引 `(tenantId, fileId, startedAt, id)`、`(jobId, attemptNo)`、`(status, startedAt)`。文件内容快照保存在任务上，执行记录通过任务引用；文件内容一旦变化必须创建新任务。

终态记录不可通过普通业务接口修改或删除。RUNNING 记录只允许持有租约的 Worker 结算一次；中断恢复可将其标记为 INTERRUPTED。晚到结果不得改写终态记录。

### 2.4 新增 FileScanTrigger：触发来源

现有 `enqueue` 会复用同一文件的活动任务，因此单一 `approvalId` 字段无法承载多次触发。增加来源关联表，允许一个任务关联多个合法触发来源。

| 字段 | 用途 |
| --- | --- |
| `id`、`tenantId`、`fileId`、`jobId` | 来源与任务关联 |
| `source` | `UPLOAD`、`RESCAN`、`RESTORE` |
| `sourceKey` | 服务端生成的稳定来源键，例如审批 ID 或上传最终化任务 ID |
| `approvalId` | RESCAN/RESTORE 必填，UPLOAD 为 null |
| `requestedBy`、`executedBy` | 申请人与审批执行人；系统触发可为空 |
| `reason`、`createdAt` | 已验证的操作原因和触发时间 |

唯一约束 `(tenantId, source, sourceKey)`，保证审批重复执行及最终化重试不会重复创建来源或任务。任务详情展示脱敏后的触发来源，不返回内部用户主键。

## 3. 入队、执行和恢复

### 3.1 统一入队

首次上传、L2 直接重扫/恢复、L3 获批重扫/恢复全部通过同一事务内的入队服务。直接操作使用服务端来源键和持久化命令保证幂等；L3 审批处理器须传递审批 ID、申请人与执行人上下文，不能仅传 fileId。只有明确解除安全封禁时，任务才保存专用安全解除审批 ID；普通扫描通过不解除封禁。

1. 在租户和 `system.file` 数据范围内校验文件；首次上传沿用合法上传的内部上下文。
2. 对文件行加锁，串行判断同一文件的活动任务；不能仅靠先查询再创建实现去重。
3. 来源已存在时返回原任务；同一文件、相同内容已有 PENDING/RUNNING 任务时追加来源关联并复用任务。
4. 只有创建新任务时才重置最新结果和版本；复用任务不得清空执行中的版本或状态。
5. 文件变为 DELETED 或快照不一致时，不得复用或执行任务。无法证明内容一致时保持隔离并报错。
6. 任务、来源关联、文件指针及审批执行结果在同一数据库事务内提交；扫描 IO 必须在事务外执行。

同一审批只指向一个确定任务，复用任务时页面明确展示“复用已有扫描任务”，不宣称产生了额外一次物理扫描。

### 3.2 领取与执行

- 通过条件更新领取任务、递增尝试次数、生成租约和创建 RUNNING 执行记录，必须在同一事务完成。
- 同一次执行包括准备文件、获取版本、扫描、存储提升和结果提交；引擎未调用也应留下失败阶段。
- 引擎版本每次查询；应用策略版本在执行开始时捕获，执行期间不得从当前配置反复读取并拼接出不一致版本。
- 长执行续租；引擎超时、存储 IO 和整体执行时间均须有上限。达到最大尝试次数不得再领取。
- SHA-256 和文件大小必须能与任务快照对应；不得把变更内容的结果写回原任务。

### 3.3 结算与一致性

结果提交事务必须同时校验：任务仍 RUNNING、租约令牌属于本次执行、文件租户一致、`currentScanJobId` 仍是当前任务且文件未删除。

- CLEAN 且存储提升成功：结算执行、任务和文件为可用，并更新版本及最新执行指针。
- INFECTED：保存命中结果，任务进入 INFECTED，文件拒绝使用，不进行自动重试。
- 可重试故障：本次执行 FAILED，任务重新 PENDING，保留本次版本及错误；不得覆盖历史失败记录。
- 达到重试上限：本次执行 FAILED，任务 DEAD_LETTER，文件保持隔离。
- 文件已删除或任务已被替代：终止任务并记录原因，旧结果不得恢复文件或覆盖新任务结果。

执行、任务、文件状态、上传会话状态和 Outbox 事件必须在同一事务结算。审计使用可事务写入的记录或审计 Outbox，禁止“文件提交成功 → 审计报错 → 当作扫描失败再次回写”。

扫描流从不可变内容打开独立只读文件描述符，不为每次执行复制整份文件；摘要和大小在扫描读取时一并校验。首次通过后以独占硬链接发布原 inode（隔离区和对象区必须位于同一文件系统），不覆盖已有对象、不增加整份文件空间；后续重扫直接只读访问已发布对象。文件内容写入完成后禁止原位改写，内容变更须创建新对象。存储操作不能随数据库回滚：发布必须可重入，隔离区清理由受控生命周期任务负责；数据库可用状态未提交前下载鉴权始终拒绝访问。审计失败或事务失败不得使文件可用。

### 3.4 Worker 崩溃与租约过期

恢复方在事务内将旧 RUNNING 执行标记为 INTERRUPTED，记录结束时间和中断原因，再决定重试或 DEAD_LETTER。下一次领取必须创建新执行和新租约。旧 Worker 即使返回 CLEAN 也无法通过结算条件，不得继续更新文件、任务或终态历史。

## 4. 查询接口与最小响应

以下为已新增接口，均为只读 GET，返回统一 HTTP 200 成功封装；不改现有四个文件管理操作的 `data: null` 契约。

| 接口 | 用途 |
| --- | --- |
| `/api/v1/files/:fileId/scan-jobs?page=1&pageSize=10` | 文件扫描任务分页列表，可用 `approvalId` 精确过滤 |
| `/api/v1/files/:fileId/scan-jobs/:jobId` | 任务摘要及可展示的触发来源 |
| `/api/v1/files/:fileId/scan-jobs/:jobId/attempts?page=1&pageSize=10` | 本任务每次执行的分页记录 |

任务列表每项仅返回：`id`、`createdAt`、`startedAt`、`finishedAt`、`statusLabel`、`statusTone`、`isTerminal`、`attemptCount`、`historyAvailable`。列表不携带完整执行记录和触发上下文。

任务详情在上述字段基础上增加文件内容快照 `sha256`、`size` 以及来源摘要 `sourceLabel`、`approvalId`、`requestedByName`、`executedByName`、`reason`、`createdAt`；实际响应只保留页面使用项，并逐项登记字段权限。

执行列表每项仅返回：`id`、`attemptNo`、`statusLabel`、`stageLabel`、`verdictLabel`、`scanDetail`、`scanEngineVersion`、`policyVersion`、`startedAt`、`finishedAt`、`durationMs`、`errorCode`、`errorMessage`。未取得的结论或版本返回 null，页面显示“未获取”。

中文名称由后端提供，状态编码不在无业务需要时返回；`isTerminal` 用于停止轮询。分页采用项目统一结构并按 `(createdAt, id)` 或 `(attemptNo, id)` 稳定排序，`pageSize <= 100`。

响应不得返回 tenantId、内部用户主键、storageKey、文件路径、连接地址、lockedBy、leaseToken、原始异常堆栈。服务端和数据库仍必须保存安全边界所需字段，响应裁剪不能削弱租户过滤。

审批记录只提供跳转线索，不扩大审批公共响应。前端用已持有的审批 ID 和 fileId 查询对应任务；无历史读取权限时不展示入口。

## 5. 权限及页面

新增 API 权限 `system.file.admin.scan-history.read`、`system.file.admin.scan-history.detail`、`system.file.admin.scan-history.attempts`（分别对应三个查询端点，遵循每个路由独立登记规则），只授予按既有受控流程获得授权的安全/系统管理角色；拥有重新扫描执行权限不自动获得全部历史读取权限。

新增响应资源 `system.file.scan-job`、`system.file.scan-trigger`、`system.file.scan-attempt`，关联字段须配置 relationResource 递归裁剪。页面绑定、API 目录、角色受众、字段权限定义、初始化及迁移必须一起更新。

查询先检查 API 权限，再按父文件 `system.file` 数据范围确定可见性，随后对 job/attempt/trigger 同时限定 tenantId、fileId 和父关联。禁止根据传入的 jobId、attemptId 或 approvalId 直接查询跨文件数据。越界按照项目规则返回不可见，不能泄露目标是否存在。

审计管理员当前使用独立 `system.file.audit` 资源；本阶段不复用管理员历史接口授予其访问能力，若需开放须另行定义只读接口和最小字段。

文件列表增加独立“扫描历史”操作，在侧边抽屉中默认分页加载任务，文件详情只展示基础信息；选择任务后按需加载来源及执行记录；展示每次失败、重试、真实版本和时间。来源关联入口支持从审批定位任务。

仅在存在非终态任务且界面可见时轮询；关闭历史抽屉或审批详情、切换文件、销毁页面和进入终态后停止。请求乱序不得把其他文件结果写入当前弹窗。复用任务和历史缺失须明确提示，不把任务受理状态显示为扫描成功。

## 6. 迁移与保存

- 使用增量迁移新增执行表、来源表、指针、租约、快照及索引；不删除原任务或文件数据。
- 历史任务标为 `historyAvailable=false`。不能根据累计 attempts、当前引擎版本或 FileObject 最新结果伪造逐次历史，也不能把今天的版本补写为历史版本。
- 缺少真实内容快照的旧任务显示“历史内容快照缺失”，不以当前文件内容代填。存量活动任务在升级前排空或按受控方案中断后重建，禁止新旧 Worker 混跑并写入同一任务。
- 权限更新提供限定资源的预览、应用和后置校验；保留已有授权边界，不使用全量账号初始化代替本功能迁移。
- 扫描历史在文件逻辑删除后保留；按当前租户和可见文件范围控制查询。物理清理不能级联删除历史，须明确归档或保留脱敏快照方案。
- 留存期限和归档策略复用组织审计保留要求，不在本方案随意设定天数。普通业务接口不提供删除历史能力；到期清理由受控任务执行并留审计记录。

## 7. 开发顺序与交付清单

1. 数据库：任务扩展、执行记录、来源关联、约束及增量迁移；确认物理清理与外键兼容。
2. 入队：统一首次上传、重新扫描和恢复入口，补齐审批上下文、来源幂等及任务复用。
3. Worker：事务领取及记录创建、分阶段版本捕获、租约续期与隔离、幂等结算、审计及 Outbox 一致性、崩溃恢复。
4. 查询：DTO、显式 select 和响应投影、稳定分页、中文名称、父文件数据范围和递归字段权限。
5. 权限：API/字段/页面目录、角色受众、限定范围同步脚本及数据库验证。
6. 前端：任务和执行分页、审批定位、复用及存量提示、终态轮询停止。
7. 发布：完成以下验收，先迁移和权限同步、再切换 Worker 与接口，记录回滚限制。回滚应用时保留历史表和记录，不降级删除数据。

## 8. 验收要求

| 场景 | 必须满足 |
| --- | --- |
| 首次上传、获批重扫、获批恢复 | 均生成可追溯来源，并能定位任务 |
| 同一审批重复执行 | 来源唯一，不重复创建任务或虚增执行次数 |
| 多审批并发作用于同一文件 | 串行入队；合法复用时所有来源可追溯 |
| 故障后自动重试成功 | 两次执行分别保留，前一次错误和版本不被覆盖 |
| 感染 | 保存命中签名，不自动重试，不放行业务使用 |
| VERSION 不可用、连接超时、未知响应 | 执行失败，未知版本为 null，文件保持隔离 |
| 引擎或应用策略升级 | 新执行记录新版本，历史版本不变 |
| CLEAN 后存储提升失败 | 保留 CLEAN 结论和失败阶段，文件仍不可用 |
| Worker 在领取后或扫描后崩溃 | 旧执行 INTERRUPTED，新执行有独立编号与租约 |
| 超过重试上限 | 进入 DEAD_LETTER，不被继续领取 |
| 过期 Worker 晚到、文件被删除/替代 | 不覆盖新任务或恢复文件，不发布旧成功通知 |
| 数据库提交或审计失败 | 文件、任务、历史及事件一致，不能先 READY 后回滚为扫描失败 |
| 跨租户、跨文件或字段未授权 | API、行级、递归字段限制全部生效 |
| 列表与详情响应 | 仅返回页面所需字段，不夹带内部连接、存储和锁信息 |
| 存量数据与迁移重复执行 | 不伪造历史，迁移/权限同步幂等，既有最新结果可查 |
| 页面关闭、切换文件、任务终态 | 停止轮询且不显示其他文件的旧响应 |

单元测试验证解析、状态转换、投影和权限目录；真实数据库集成测试验证事务、来源唯一性、并发入队、租约竞争及失败回滚；真实 ClamAV 测试验证 VERSION、通过、感染和连接异常。前端测试验证分页、权限入口、审批定位和轮询清理。仅 mock Worker 或 Prisma 不能替代并发与事务验收。


## 9. 实现与验证记录（2026-11-12）

- 数据模型：`FileScanJob` 扩展、`FileScanAttempt`、`FileScanTrigger` 和文件内部指针，已合并到单一初始化迁移 `20261010000000_initial_security_schema`。
- 执行：`FileScanService` 统一事务入队，`FileScanExecutorService` 负责领取、逐次记录、续租、结算和过期恢复；`FileWorkerService` 保留调度及最终化。
- 所有大小的文件扫描均只读打开原 inode，不创建内容副本。摘要与大小在同一读取流中校验；首次发布使用独占硬链接并检查与扫描描述符对应的 inode/device 一致，不复制或覆盖内容；隔离区与对象区必须同文件系统。不支持硬链接时按存储失败隔离，不降级为复制。
- 扫描和摘要计算在事务外；发布时只在文件行锁下执行短暂的文件系统元数据操作，重新检查文件、快照和租约。结算事务包含执行、任务、文件、上传会话、Outbox 和完整性审计。
- 查询：三个独立 GET 端点及 API 权限、三个字段资源、父文件范围约束、显式查询和返回字段白名单。
- 页面：文件列表独立历史抽屉及文件审批详情使用 `FileScanHistory`，支持任务及执行分页、审批筛选、来源说明、版本、错误阶段及停止轮询。历史权限作为可选页面绑定，不使无历史权限的用户失去原页面访问能力。
- 部署：先确认无 PENDING/RUNNING 扫描任务再执行增量迁移。使用 `src/scripts/sync-scan-history-permissions.ts` 默认预览；`--apply --grant-existing-readers` 仅给同时已有文件详情和扫描说明读取权限的安全/系统角色继承历史读取权限，采用两项来源授权的最短有效期，不恢复已撤销授权、不修改用户或数据范围。生产仍须按受控发布流程执行。
- 已验证：单元测试覆盖响应裁剪、父文件及审批范围、真实文件描述符和 inode、防路径替换、版本、失败结果及页面轮询/乱序；真实 MySQL 与 ClamAV 集成测试覆盖来源并发与幂等、结果落库、逐次重试、租约恢复和旧结果阻断、审计失败回滚、并发领取、删除中止、重试上限及发布失败。
- 集成测试仅使用随机标识的测试元数据及固定测试文本，任务未来调度隔离业务 Worker，执行后清理自身数据。不会重新扫描用户文件。
- 存量历史不会补造；留存期限及归档仍由组织审计策略决定。本次没有新增普通用户删除历史接口，外键禁止文件物理删除级联抹除历史。

开发验证命令：

```sh
pnpm --filter backend test
pnpm --filter frontend test
pnpm --filter backend build
pnpm --filter frontend build
# 在 backend 目录运行，使用本地测试依赖及独立随机测试数据：
node --env-file=.env node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts integration-tests/file-scan-history.test.ts
```
