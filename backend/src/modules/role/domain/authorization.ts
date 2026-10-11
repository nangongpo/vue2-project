import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { isUUID } from 'class-validator'
import { resolveRiskDecision } from '#app/security/policies/risk-policy.js'
import { isCatalogManagementCode, isManagementApiPath, isManagementResource } from '#app/security/policies/permission-catalog/index.js'
import { sanitizeAuditDetail } from '#app/audit/utils/audit-sanitizer.js'
import { parseAuthorizationExpiry } from '#app/common/constants/authorization.js'

export type Actor = {
  internalId: bigint
  /** 授权操作不得脱离当前会话租户执行。 */
  tenantId: string
  organizationId?: string | null
  departmentId?: string | null
  traceId?: string
  ip?: string
  userAgent?: string
  method?: string
  path?: string
}
export type ActorRequest = {
  user: { internalId: bigint; userId?: string; tenantId: string; organizationId?: string | null; departmentId?: string | null }
  traceId?: string
  ip?: string
  method?: string
  url?: string
  headers: { 'user-agent'?: string }
}
export const actorFrom = (request: ActorRequest): Actor => ({
  internalId: request.user.internalId,
  tenantId: request.user.tenantId,
  organizationId: request.user.organizationId,
  departmentId: request.user.departmentId,
  traceId: request.traceId,
  ip: request.ip,
  userAgent: request.headers['user-agent'],
  method: request.method,
  path: request.url?.split('?')[0],
})
export const activeGrant = (now = new Date()) => ({
  revokedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
})
export const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }

export function rejectFields(input: object, fields: string[]) {
  if (fields.some((field) => Object.prototype.hasOwnProperty.call(input, field)))
    throw new BadRequestException('授权、类型和状态必须通过专用接口维护')
}

const SYSTEM_BUILTIN_ROLE_CODES = new Set([
  'builtin_business',
  'builtin_security',
  'builtin_system',
  'builtin_audit',
])

/** 系统预置角色由初始化策略维护，不允许按普通业务角色删除。 */
export function isSystemBuiltinRole(role: { code: string }) {
  return SYSTEM_BUILTIN_ROLE_CODES.has(role.code)
}

export function grantInput(ids: string[], reason: string, expiresAt?: string) {
  if (
    !Array.isArray(ids) ||
    ids.length > 500 ||
    ids.some((id) => typeof id !== 'string' || !isUUID(id)) ||
    new Set(ids).size !== ids.length
  )
    throw new BadRequestException('授权标识必须为不重复的 UUID，最多 500 项')
  requireReason(reason)
  return parseAuthorizationExpiry(expiresAt)
}

export function requireReason(reason: string) {
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 255)
    throw new BadRequestException('必须填写操作原因，最多 255 个字符')
}

type PermissionPolicy = {
  code: string
  resource: string
  type: string
  method: string | null
  path: string | null
  status: string
  roleTypes?: readonly { roleType: string }[]
}
export function ordinaryPermission(permission: PermissionPolicy) {
  return (
    permission.status === 'ACTIVE' &&
    permission.roleTypes?.some((item) => item.roleType === 'BUSINESS') &&
    permission.code !== '*' &&
    permission.resource !== '*' &&
    (!isManagementResource(permission.resource) || ['system.approval.read', 'system.approval.detail'].includes(permission.code)) &&
    (!isCatalogManagementCode(permission.code) || ['system.approval.read', 'system.approval.detail'].includes(permission.code)) &&
    (!isManagementApiPath(permission.path || '') || ['system.approval.read', 'system.approval.detail'].includes(permission.code)) &&
    permission.code !== 'system.permission.manage' &&
    !permission.path?.includes('*') &&
    ['PAGE', 'BUTTON', 'API'].includes(permission.type) &&
    (permission.type !== 'API' ||
      (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(permission.method || '') && !!permission.path))
  )
}

/** 高危角色只能通过受控审批流程变更。 */
export function requiresControlledRoleApproval(role: {
  roleType: string
  permissions: Array<{ permission: PermissionPolicy }>
  elevatedDataScopes: Array<unknown>
}) {
  return (
    role.roleType !== 'BUSINESS' ||
    role.permissions.some((grant) => !ordinaryPermission(grant.permission)) ||
    role.elevatedDataScopes.length > 0
  )
}

export async function requireActor(tx: Prisma.TransactionClient, actor: Actor) {
  if (!actor || typeof actor.internalId !== 'bigint') throw new UnauthorizedException('缺少操作者身份')
  if (!actor.tenantId) throw new ForbiddenException('未确定有效租户')
  const user = await tx.user.findUnique({
    where: { id: actor.internalId },
    select: { userId: true, status: true, expiresAt: true },
  })
  if (!user || user.status !== 'ACTIVE' || (user.expiresAt && user.expiresAt <= new Date())) throw new ForbiddenException('操作者账户无效')
  return user.userId
}

export async function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  targetId: string,
  before: unknown,
  after: unknown,
  reason?: string,
  resource = action.startsWith('system.user.') ? 'user' : 'role'
) {
  const detail = JSON.parse(
    JSON.stringify({ targetId, before, after, reason }, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
  ) as Prisma.InputJsonValue
  await tx.auditLog.create({
    data: {
      tenantId: actor.tenantId,
      actorId: actor.internalId,
      traceId: actor.traceId || randomUUID(),
      action,
      riskLevel: resolveRiskDecision(action).riskLevel,
      resource,
      method:
        actor.method ||
        (action.endsWith('.create') || action.endsWith('.reset-password') || action.endsWith('.unlock')
          ? 'POST'
          : action.endsWith('.delete')
          ? 'DELETE'
          : 'PATCH'),
      path: actor.path || `/api/v1/${resource === 'user' ? 'users' : 'roles'}/${targetId}`,
      result: 'SUCCESS',
      statusCode: action.endsWith('.create') ? 201 : 200,
      ip: actor.ip,
      userAgent: actor.userAgent,
      detail: sanitizeAuditDetail(detail) as Prisma.InputJsonValue,
    },
  })
}

export async function ordinaryRole(tx: Prisma.TransactionClient, id: bigint, tenantId: string) {
  const role = await tx.role.findUniqueOrThrow({
    where: { id },
    include: {
      permissions: {
        where: { revokedAt: null },
        include: { permission: { include: { roleTypes: { select: { roleType: true } } } } },
      },
      elevatedDataScopes: { where: { revokedAt: null } },
    },
  })
  if (role.tenantId !== tenantId) throw new ForbiddenException('角色不属于当前租户')
  if (requiresControlledRoleApproval(role))
    throw new ForbiddenException('高危角色需要受控审批流程')
  return role
}

export async function preventOwnRoleChange(tx: Prisma.TransactionClient, roleId: bigint, actor: Actor) {
  if (await tx.userRole.findFirst({ where: { userId: actor.internalId, roleId, ...activeGrant() } }))
    throw new ForbiddenException('不能修改自身有效角色或权限')
}
