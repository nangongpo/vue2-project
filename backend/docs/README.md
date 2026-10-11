# backend 安全与设计文档

本目录是 backend 的安全设计、业务契约、运行手册和验证证据入口。文档以“一个主题只有一个权威来源”为原则，避免把同一条安全要求复制到多个文件后逐渐不一致。

## 1. 阅读顺序

1. [REQUIREMENTS.md](REQUIREMENTS.md)：系统必须满足的安全与功能基线。
2. [API_DESIGN.md](API_DESIGN.md)：所有 HTTP API 的公共接口规范。
3. [ERROR_CODES.md](ERROR_CODES.md)：错误码、HTTP 映射和脱敏规则。
4. [TENANCY_SECURITY.md](TENANCY_SECURITY.md)：单租户、多租户、组织和部门的数据边界。
5. [PERMISSION_DESIGN.md](PERMISSION_DESIGN.md)：认证后的授权模型、职责分离和数据范围判定。
6. [PERMISSION_CODE_STANDARD.md](PERMISSION_CODE_STANDARD.md)：权限码、动作和迁移命名规范。
7. [APPROVAL_CONTRACT.md](APPROVAL_CONTRACT.md)：高危操作审批接口、状态机和执行契约。
8. [FILE_SECURITY.md](FILE_SECURITY.md)：文件上传、隔离、扫描、下载和删除安全模型。
9. [SSE_DESIGN.md](SSE_DESIGN.md)：SSE 事件流、多实例投递、连接治理和轮询兜底。
10. [CONFIGURATION.md](CONFIGURATION.md)：应用环境变量和安全配置总表。
11. [CLAMAV_CONFIGURATION.md](CLAMAV_CONFIGURATION.md)：ClamAV 部署、连通性和扫描故障处理。
12. [DATABASE_OPERATIONS.md](DATABASE_OPERATIONS.md)：数据库迁移、备份、恢复和生产操作约束。

## 2. 文档职责矩阵

| 文档 | 唯一职责 | 不应重复维护的内容 |
| --- | --- | --- |
| `REQUIREMENTS.md` | “系统必须做到什么”以及验收基线 | 具体 SQL、完整 API 字段、部署步骤 |
| `API_DESIGN.md` | HTTP 路径、请求、响应、鉴权、分页、幂等和版本规范 | 具体业务资源字段、权限码目录 |
| `ERROR_CODES.md` | 公共错误码、HTTP 映射、客户端处理和脱敏规则 | 业务流程和数据库异常细节 |
| `TENANCY_SECURITY.md` | 租户模式、租户上下文、组织/部门和切换控制 | 通用 RBAC、文件扫描实现 |
| `PERMISSION_DESIGN.md` | 授权对象、判定顺序、职责分离和数据范围 | 权限码命名细则、审批接口字段 |
| `PERMISSION_CODE_STANDARD.md` | 权限码和动作的命名、目录、迁移规则 | 授权运行时流程 |
| `APPROVAL_CONTRACT.md` | 审批 API、请求体、状态机、执行和审计回写 | 通用权限架构 |
| `FILE_SECURITY.md` | 文件上传、生命周期、存储隔离、病毒扫描和下载安全 | ClamAV 安装命令、通用配置表 |
| `SSE_DESIGN.md` | SSE 事件流、连接认证、多实例投递和轮询兜底 | 租户与数据范围权威规则 |
| `CONFIGURATION.md` | 环境变量、密钥和部署配置原则 | 数据库/ClamAV 的完整运维手册 |
| `CLAMAV_CONFIGURATION.md` | ClamAV 运维和故障排查 | 文件模块业务状态机 |
| `DATABASE_OPERATIONS.md` | 数据库生产操作和恢复 | 应用权限和业务契约 |

## 3. 权威性与冲突处理

出现冲突时按以下顺序处理：

1. 当前代码、Prisma schema、迁移和测试是实现事实；
2. 安全契约文档（租户、审批、文件、权限）是接口和安全边界的设计事实；
3. `REQUIREMENTS.md` 是验收要求，不可用来替代实现契约；
4. 配置和运维文档只描述如何部署，不得降低安全契约要求。

发现不一致时，先修正对应的唯一权威文档，再在其他文档添加链接，不要复制整段内容。若代码与安全契约不一致，应建立实现任务并在发布风险和整改记录中记录差距；不得通过修改文档掩盖未完成的控制点。

## 4. 等保与最高安全基线

设计以以下控制目标为最低基线：身份鉴别、访问控制、最小权限、职责分离、安全审计、数据完整性、通信和存储保护、恶意代码防范、备份恢复、集中运维和安全管理。对应设计参考 GB/T 22239-2019、GB/T 25070-2019、GB/T 28448-2019 及组织适用的密码、数据安全和个人信息保护要求。

文档中的“符合”“通过”仅表示工程设计或仓库验证达到对应控制目标，不能替代定级备案、密码合规、渗透测试、测评机构测评或上线环境证据。生产上线必须同时具备配置、权限、日志、备份、恢复演练、告警和定期复核证据。

## 5. 变更规则

- 新增安全边界时，优先修改一个权威契约，不在多个文档复制。
- 新增配置时，同时更新 `backend/.env.example`、实际环境配置说明和 `CONFIGURATION.md`；密钥不得写入 Git。
- 修改权限、租户或审批规则时，必须同步更新迁移、测试、审计字段和发布验收记录。
- 删除或合并文档前，先更新本索引及仓库内链接。
- 每次发布前执行 `nvm use`，并在 CI、发布单和部署证据库中留存构建、测试、迁移和安全验证证据。
