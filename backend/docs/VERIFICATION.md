# 权限改造验证记录

日期：2026-09-23。环境：Node.js v22.14.0（每次命令先执行 nvm use），pnpm 11.9.0，Prisma 6.19.3，MySQL 8.0.23。

## 文档位置

权限相关文档统一位于 `backend/` 根目录：

- [REQUIREMENTS.md](REQUIREMENTS.md)：权限需求与接口约束。
- [PERMISSION_DESIGN.md](PERMISSION_DESIGN.md)：权限体系设计、ER 图和部署边界。
- [APPROVAL_CONTRACT.md](APPROVAL_CONTRACT.md)：审批接口与数据契约。
- 本文：验证结果与可复现命令。

ER 图已直接维护在 `PERMISSION_DESIGN.md` 中，不再单独维护 `SCHEMA.mmd`，避免设计内容重复。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| Prisma schema 校验与 Client 生成 | 通过 | `prisma validate`、`db:generate` |
| 后端 TypeScript 编译 | 通过 | `pnpm --filter backend build` |
| 自动化测试 | 329 / 329 通过，23 个文件 | `pnpm --filter backend test` |
| 权限相关前端 ESLint | 通过 | 页面、组件、API、权限工具函数 |
| 前端生产构建 | 通过 | `pnpm --filter frontend build`，含 Vue 2/legacy 产物 |
| MySQL 全量迁移 | 通过 | 初始迁移 + 权限安全增量迁移，在随机独立测试库执行 |
| MySQL 约束验证 | 通过 | 页面循环、接口引用删除保护、受控范围期限、审计更新/删除触发器 |
| 实际 HTTP 鉴权 | 通过 | 401 未认证、403 职责隔离/MFA/CSRF、400 DTO/必填/分页校验、201 创建、409 审批重复执行 |
| 初始化幂等 | 通过 | 重复 seed 不重置已有密码；管理员职责分离 |
| 权限变更即时失效 | 通过 | 真实 DB 中页面禁用和授权过期后，既有会话立即失去 API 权限 |
| 数据范围 | 通过 | 当前租户边界、SELF、部门/组织树、交集、CUSTOM 越租户拒绝、ALL 仍限租户 |
| 审批/高危回收 | 通过 | 单元测试覆盖自审/自授权拒绝、过期、三类回收；真实 HTTP 验证四阶段角色授予/回收及审计导出 |
| 密码/MFA | 通过 | 当前及历史口令拒绝、最短修改间隔、scrypt 有界成本、TOTP 防重放、近期重新认证 |

## 可复现命令

```bash
nvm use
pnpm --filter backend db:generate
pnpm --filter backend build
pnpm --filter backend test
pnpm --filter frontend build
pnpm --filter backend exec node scripts/verify-permission-migration.js
```

数据库验证脚本拒绝非本机地址；创建名称为 `codex_permission_test_<随机UUID>` 的专用库，在 finally 中清理该库。真实项目库没有执行迁移、重置、授权吊销或种子写入。

测试发现并修正了 MySQL 8 的 CHECK/级联外键限制、前后端细粒度权限与方法/路由不一致、审计详情未显示变更前后值，以及管理员首次登录时的 MFA 页面访问路径。

## 未声称完成的部署验证

- 未对已有业务库执行切换。应用迁移前需做备份、运行 preflight SQL、明确新旧管理员账户并安排维护窗口；旧会话和旧授权会失效。
- HTTP 验证使用真实 MySQL 和应用守卫，但通过测试库预置已验证的 MFA 会话；TOTP/enrollment 的密码学和重放行为由单元测试覆盖，没有使用真人认证器完成浏览器端验收。
- 前端完成编译、静态检查、选择器及请求序列化测试，没有声称覆盖所有浏览器交互流程。
- 仓库目前没有业务后端数据表，数据范围服务需在未来业务仓储中强制调用；不得把已实现的策略构造器等同于所有未来业务都已接入。
- 集中审计存储、外部签名/完整性保护、六个月保留策略、容量告警、时钟同步和备份恢复演练需要部署环境提供实施证据。
- 前端构建仍有原有验证码 SDK 的 CommonJS/ESM 提示以及登录页静态引用会话安全页的分包提示，不影响构建通过。

上述结果是工程验证记录，不是等保测评结论。
