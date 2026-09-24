import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { isUUID } from 'class-validator'
import { riskLevelForOperation } from '../../../security/policies/risk-policy.js'

export type Actor = {
  internalId: bigint
  traceId?: string
  ip?: string
  userAgent?: string
  method?: string
  path?: string
  mfaVerifiedAt?: Date | null
  reauthenticatedAt?: Date | null
}
export type ActorRequest = {
  user: { internalId: bigint; mfaVerifiedAt?: Date | null; reauthenticatedAt?: Date | null }
  traceId?: string
  ip?: string
  method?: string
  url?: string
  headers: { 'user-agent'?: string }
}
export const actorFrom = (request: ActorRequest): Actor => ({
  internalId: request.user.internalId,
  mfaVerifiedAt: request.user.mfaVerifiedAt,
  reauthenticatedAt: request.user.reauthenticatedAt,
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

export function grantInput(ids: string[], reason: string, expiresAt?: string) {
  if (
    !Array.isArray(ids) ||
    ids.length > 500 ||
    ids.some((id) => typeof id !== 'string' || !isUUID(id)) ||
    new Set(ids).size !== ids.length
  )
    throw new BadRequestException('授权标识必须为不重复的 UUID，最多 500 项')
  requireReason(reason)
  const expiry = expiresAt === undefined ? null : new Date(expiresAt)
  if (expiry && (!Number.isFinite(expiry.getTime()) || expiry <= new Date())) throw new BadRequestException('授权到期时间必须在未来')
  return expiry
}

export function requireReason(reason: string) {
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 255)
    throw new BadRequestException('必须填写操作原因，最多 255 个字符')
}

type PermissionPolicy = {
  code: string
  resource: string
  requiredRoleType: string
  type: string
  method: string | null
  path: string | null
  status: string
}
const administrative =
  /^(?:system[.:])?(?:users?|roles?|permissions?|pages?|buttons?|apis?|audits?|sessions?|security|auth|data-scopes?|dataScope)(?:[.:/]|$)/i
export function ordinaryPermission(permission: PermissionPolicy) {
  return (
    permission.status === 'ACTIVE' &&
    permission.requiredRoleType === 'BUSINESS' &&
    !permission.code.includes('*') &&
    !permission.resource.includes('*') &&
    permission.code !== 'system.permission.manage' &&
    !administrative.test(permission.code) &&
    !administrative.test(permission.resource) &&
    !/(?:^|[.:])(?:superadmin|super-admin|impersonate|all|custom)(?:[.:]|$)/i.test(permission.code) &&
    (!permission.path ||
      (!permission.path.includes('*') &&
        !/^\/(?:api\/v\d+\/)?(?:users|roles|permission|audit|sessions|auth|security)(?:\/|$)/i.test(permission.path))) &&
    ['PAGE', 'BUTTON', 'API'].includes(permission.type) &&
    (permission.type !== 'API' ||
      (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(permission.method || '') && !!permission.path))
  )
}

export async function requireActor(tx: Prisma.TransactionClient, actor: Actor) {
  if (!actor || typeof actor.internalId !== 'bigint') throw new UnauthorizedException('缺少操作者身份')
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
      actorId: actor.internalId,
      traceId: actor.traceId || randomUUID(),
      action,
      riskLevel: riskLevelForOperation(action),
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
      detail,
    },
  })
}

export async function ordinaryRole(tx: Prisma.TransactionClient, id: bigint) {
  const role = await tx.role.findUniqueOrThrow({
    where: { id },
    include: {
      permissions: { where: { revokedAt: null }, include: { permission: true } },
      elevatedDataScopes: { where: { revokedAt: null } },
    },
  })
  if (
    role.roleType !== 'BUSINESS' ||
    role.permissions.some((grant) => !ordinaryPermission(grant.permission)) ||
    role.elevatedDataScopes.length
  )
    throw new ForbiddenException('高危角色需要受控审批流程')
  return role
}

export async function preventOwnRoleChange(tx: Prisma.TransactionClient, roleId: bigint, actor: Actor) {
  if (await tx.userRole.findFirst({ where: { userId: actor.internalId, roleId, ...activeGrant() } }))
    throw new ForbiddenException('不能修改自身有效角色或权限')
}
