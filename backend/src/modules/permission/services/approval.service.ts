import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { ApprovalRequest, Permission, Prisma, Role } from '@prisma/client'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { PrismaService } from '#app/database/prisma.service.js'
import { sanitizeAuditDetail } from '#app/audit/utils/audit-sanitizer.js'
import { APPROVAL_KIND_LABELS } from '#app/common/constants/enum-labels.js'
import { AuthenticatedUser } from '#app/security/types/auth.types.js'
import {
  ApiRouteChangePayload,
  ApiDeletePayload,
  ApiCreatePayload,
  ApiTogglePayload,
  ApiUpdatePayload,
  PageRouteChangePayload,
  PageStatusPayload,
  ApprovalActionDto,
  ApprovalQueryDto,
  ApprovalTargetOptionsQuery,
  CreateApprovalDto,
  ElevatedRevokePayload,
  ElevatedScopePayload,
  MfaResetPayload,
  RoleGrantPayload,
  RoleStatusPayload,
  RolePermissionsPayload,
  approvalDto,
  approvalPayload,
} from '#app/modules/permission/dto/approval.dto.js'
import { assertApi, canonicalPath, ok, RETIRED_CODES } from '#app/modules/permission/policies/policy.js'
import { isBusinessDataResource } from '#app/modules/permission/policies/data-resource-policy.js'
import {
  allowedRoleTypesForPermission,
  isManagementApiPath,
  isManagementResource,
  isCatalogManagementCode,
} from '#app/security/policies/permission-catalog/index.js'
import {
  RISK_PROOF_TTL_MS,
  resolveRiskDecision,
} from '#app/security/policies/risk-policy.js'

export const APPROVAL_MAX_TTL_MS = 24 * 60 * 60 * 1000
export const APPROVAL_TTL_MS: Record<string, number> = {
  ROLE_GRANT: 4 * 60 * 60 * 1000,
  ROLE_STATUS: 24 * 60 * 60 * 1000,
  ROLE_PERMISSIONS: 4 * 60 * 60 * 1000,
  ELEVATED_SCOPE: 4 * 60 * 60 * 1000,
  MFA_RESET: 60 * 60 * 1000,
  ROLE_REVOKE: APPROVAL_MAX_TTL_MS,
  ROLE_PERMISSION_REVOKE: APPROVAL_MAX_TTL_MS,
  ELEVATED_REVOKE: APPROVAL_MAX_TTL_MS,
  API_ROUTE_CHANGE: APPROVAL_MAX_TTL_MS,
  PAGE_ENABLE: APPROVAL_MAX_TTL_MS,
  PAGE_DISABLE: APPROVAL_MAX_TTL_MS,
}
export const APPROVAL_REAUTH_MS = RISK_PROOF_TTL_MS
export { APPROVAL_KIND_LABELS }
export type ApprovalActor = AuthenticatedUser
export type ApprovalContext = {
  traceId?: string
  ip?: string
  method?: string
  path?: string
  userAgent?: string
}
type Tx = Prisma.TransactionClient
type Step = 'approve' | 'execute' | 'review'
type ActorRoleProfile = { roleId: string; code: string; name: string; roleType: string }
type ActorProfile = {
  userId: string
  displayName: string
  roles: Array<{ role: ActorRoleProfile }>
}
const AUDIT_READ_CODES = new Set([
  'system.audit.read',
  'system.audit.detail',
  'system.audit.export',
  'system.audit.review',
])
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))
const live = (now: Date) => ({
  revokedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
})
const sameActor = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase()
// Keep this as a plain boolean predicate. Letting TypeScript infer a type
// predicate here can over-narrow ApprovalRequest.kind in later branches and
// produce false TS2367 errors for API_CREATE/API_UPDATE.
const isRevocation = (kind?: string): boolean =>
  ['ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE'].includes(kind || '')
const apiMutationPermission = (kind?: string) =>
  ((
    {
      API_CREATE: 'system.api.create',
      API_UPDATE: 'system.api.update',
      API_ENABLE: 'system.api.enable',
      API_DISABLE: 'system.api.disable',
      API_DELETE: 'system.api.delete',
      PAGE_ENABLE: 'system.page.enable',
      PAGE_DISABLE: 'system.page.disable',
      PAGE_ROUTE_CHANGE: 'system.page.update',
    } as Record<string, string>
  )[kind || ''])
const REQUEST_NO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TARGET_REF_TTL_MS = 5 * 60 * 1000
const requestNo = (now = new Date()) => {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' })
    .format(now)
    .replace(/-/g, '')
  const bytes = randomBytes(8)
  const random = [...bytes]
    .map((byte) => REQUEST_NO_ALPHABET[byte % REQUEST_NO_ALPHABET.length])
    .join('')
  return `${date}-${random}`
}
const targetToken = () => randomBytes(32).toString('base64url')
const targetTokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const TARGET_FOREIGN_KEY = {
  USER: 'targetUserId',
  DEPARTMENT: 'targetDepartmentId',
  ORGANIZATION: 'targetOrganizationId',
  TENANT: 'targetTenantId',
} as const

@Injectable()
export class ApprovalService {
  constructor(private readonly prisma: PrismaService, private readonly http?: HttpAdapterHost) {}

  private authorize(
    actor: ApprovalActor,
    action: 'create' | 'read' | 'detail' | 'cancel' | Step,
    kind?: string
  ) {
    const types = new Set(
      actor.roles
        .map((role) => (role as typeof role & { roleType?: string }).roleType)
        .filter((type) => type !== 'BUSINESS')
    )
    const reading = action === 'read' || action === 'detail'
    const requiredType = action === 'review' ? 'AUDIT' : reading ? undefined : 'SECURITY'
    const requiredCode =
      action === 'create' || action === 'execute' || action === 'cancel'
        ? kind
          ? kind === 'MFA_RESET'
            ? 'system.user.mfa-reset'
            : apiMutationPermission(kind)
            ? apiMutationPermission(kind)
            : kind === 'ROLE_STATUS'
            ? 'system.role.disable'
            : isRevocation(kind)
            ? 'system.role.revoke'
            : 'system.role.grant'
          : undefined
        : action === 'approve'
        ? 'system.role.review'
        : action === 'review'
        ? 'system.audit.review'
        : undefined
    if (
      actor.status !== 'ACTIVE' ||
      types.size !== 1 ||
      (requiredType ? !types.has(requiredType) : !types.has('SECURITY') && !types.has('AUDIT')) ||
      !actor.permissions.includes(`system.approval.${action}`) ||
      (requiredCode && !actor.permissions.includes(requiredCode))
    ) {
      throw new ForbiddenException('审批操作需要独立管理员职责和显式权限')
    }
  }

  private expiry(expiresAt: Date, createdAt = new Date(), requireFuture = true, kind?: string) {
    const ttl = expiresAt.getTime() - createdAt.getTime()
    const maxTtl = (kind && APPROVAL_TTL_MS[kind]) || APPROVAL_MAX_TTL_MS
    if (
      !Number.isFinite(ttl) ||
      ttl <= 0 ||
      ttl > maxTtl ||
      (requireFuture && expiresAt.getTime() <= Date.now())
    ) {
      throw new BadRequestException(`审批或授权已过期，有效期必须明确且不超过${maxTtl / 3600000}小时`)
    }
  }

  private async transaction<T>(fn: (tx: Tx) => Promise<T>) {
    try {
      return await this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      if (['P2034', 'P2002', 'P2025'].includes((error as { code?: string }).code || '')) {
        throw new ConflictException('审批或目标数据已变化，请重新读取后操作')
      }
      throw error
    }
  }

  private async assertIndependentSecurityApprover(tx: Tx, applicantId: string) {
    const approver = await tx.user.findFirst({
      where: {
        userId: { not: applicantId },
        status: 'ACTIVE',
        mfaEnabled: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        roles: {
          some: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            role: {
              status: 'ACTIVE',
              roleType: 'SECURITY',
              AND: [
                {
                  permissions: {
                    some: {
                      revokedAt: null,
                      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                      permission: { status: 'ACTIVE', code: 'system.approval.approve' },
                    },
                  },
                },
                {
                  permissions: {
                    some: {
                      revokedAt: null,
                      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                      permission: { status: 'ACTIVE', code: 'system.role.review' },
                    },
                  },
                },
              ],
            },
          },
        },
      },
      select: { userId: true },
    })
    if (!approver) {
      throw new ConflictException('当前没有可用的独立安全管理员，无法提交审批')
    }
  }

  async targetOptions(input: ApprovalTargetOptionsQuery, actor: ApprovalActor) {
    const dto = approvalDto(ApprovalTargetOptionsQuery, input)
    if (
      actor.status !== 'ACTIVE' ||
      actor.roles.length !== 1 ||
      actor.roles[0].roleType !== 'SECURITY' ||
      !actor.permissions.includes('system.approval.create') ||
      !actor.permissions.includes('system.approval.target-options')
    ) {
      throw new ForbiddenException('无权查询受控审批目标')
    }
    const userKinds = ['ROLE_GRANT', 'ROLE_REVOKE', 'MFA_RESET']
    const roleKinds = [
      'ROLE_GRANT',
      'ROLE_STATUS',
      'ROLE_REVOKE',
      'ROLE_PERMISSIONS',
      'ROLE_PERMISSION_REVOKE',
      'ELEVATED_SCOPE',
    ]
    const allowed = dto.targetType === 'USER' ? userKinds : roleKinds
    if (!allowed.includes(dto.kind)) throw new BadRequestException('申请类型与目标类型不匹配')
    const keyword = dto.keyword?.trim() || ''
    const expiresAt = new Date(Date.now() + TARGET_REF_TTL_MS)
    return this.transaction(async (tx) => {
      const items =
        dto.targetType === 'USER'
          ? await Promise.all(
              (
                await tx.user.findMany({
                  where: {
                    status: 'ACTIVE',
                    ...(keyword
                      ? {
                          OR: [
                            { username: { contains: keyword } },
                            { displayName: { contains: keyword } },
                          ],
                        }
                      : {}),
                  },
                  orderBy: [{ displayName: 'asc' }, { username: 'asc' }],
                  take: 20,
                  select: { userId: true, username: true, displayName: true },
                })
              ).map(async (row) => {
                const token = targetToken()
                await tx.approvalTargetRef.create({
                  data: {
                    tokenHash: targetTokenHash(token),
                    actorUserId: actor.userId,
                    kind: dto.kind,
                    targetType: dto.targetType,
                    targetId: row.userId,
                    expiresAt,
                  },
                })
                return { targetRef: token, displayName: row.displayName, username: row.username }
              })
            )
          : await Promise.all(
              (
                await tx.role.findMany({
                  where: {
                    status: 'ACTIVE',
                    ...(keyword
                      ? { OR: [{ code: { contains: keyword } }, { name: { contains: keyword } }] }
                      : {}),
                  },
                  orderBy: [{ name: 'asc' }, { code: 'asc' }],
                  take: 20,
                  select: { roleId: true, code: true, name: true, roleType: true },
                })
              ).map(async (row) => {
                const token = targetToken()
                await tx.approvalTargetRef.create({
                  data: {
                    tokenHash: targetTokenHash(token),
                    actorUserId: actor.userId,
                    kind: dto.kind,
                    targetType: dto.targetType,
                    targetId: row.roleId,
                    expiresAt,
                  },
                })
                return { targetRef: token, name: row.name, code: row.code, roleType: row.roleType }
              })
            )
      return ok({ items, expiresAt })
    })
  }

  async create(
    input: CreateApprovalDto,
    actor: ApprovalActor,
    context: ApprovalContext = {},
    external = false
  ) {
    this.authorize(actor, 'create', input.kind)
    const dto = approvalDto(CreateApprovalDto, input)
    if (!dto.reason.trim()) throw new BadRequestException('必须填写申请原因')
    const createdAt = new Date()
    const expiresAt = new Date(dto.expiresAt)
    this.expiry(expiresAt, createdAt, true, dto.kind)
    return this.transaction(async (tx) => {
      await this.assertIndependentSecurityApprover(tx, actor.userId)
      if (external) this.assertExternalTargetRefs(dto.kind, dto.payload)
      const payload = approvalPayload(
        dto.kind,
        await this.resolveTargetRefs(tx, dto.kind, dto.payload, actor.userId)
      )
      await this.validateTarget(tx, dto.kind, payload, [actor.userId])
      const item = await tx.approvalRequest.create({
        data: {
          requestNo: requestNo(createdAt),
          kind: dto.kind,
          payload: json(payload),
          reason: dto.reason.trim(),
          expiresAt,
          createdAt,
          applicantId: actor.userId,
          applicantDisplayName: actor.displayName,
        },
      })
      await this.audit(tx, actor, context, 'create', item.id, null, item)
      return ok(item)
    })
  }

  private assertExternalTargetRefs(kind: string, payload: Record<string, unknown>) {
    const required =
      kind === 'MFA_RESET'
        ? ['userRef']
        : ['ROLE_GRANT', 'ROLE_REVOKE'].includes(kind)
        ? ['userRef', 'roleRef']
        : ['ROLE_STATUS', 'ROLE_PERMISSIONS', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_SCOPE'].includes(kind)
        ? ['roleRef']
        : []
    if (required.some((field) => typeof payload[field] !== 'string' || !payload[field]))
      throw new BadRequestException('审批目标必须通过受控目标选择获取')
    if (Object.keys(payload).some((field) => ['userId', 'roleId'].includes(field)))
      throw new BadRequestException('不允许直接提交用户或角色 ID')
  }

  private async resolveTargetRefs(
    tx: Tx,
    kind: string,
    payload: Record<string, unknown>,
    actorUserId: string
  ) {
    const resolved = { ...payload }
    const refs = [
      { ref: 'userRef', id: 'userId', type: 'USER' },
      { ref: 'roleRef', id: 'roleId', type: 'ROLE' },
    ] as const
    const pending: Array<{
      entry: (typeof refs)[number]
      value: string
      target: { id: string; targetId: string }
    }> = []
    for (const entry of refs) {
      const value = resolved[entry.ref]
      if (typeof value !== 'string' || !value) continue
      const target = await tx.approvalTargetRef.findUnique({ where: { tokenHash: targetTokenHash(value) } })
      if (
        !target ||
        target.actorUserId !== actorUserId ||
        target.kind !== kind ||
        target.targetType !== entry.type ||
        target.usedAt ||
        target.expiresAt <= new Date()
      ) {
        throw new BadRequestException('审批目标引用无效、已过期或已使用')
      }
      pending.push({ entry, value, target })
    }
    for (const item of pending) {
      const claimed = await tx.approvalTargetRef.updateMany({
        where: { id: item.target.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      })
      if (claimed.count !== 1) throw new ConflictException('审批目标引用已被使用，请重新选择')
      resolved[item.entry.id] = item.target.targetId
      delete resolved[item.entry.ref]
    }
    return resolved
  }

  async list(query: ApprovalQueryDto, actor: ApprovalActor) {
    this.authorize(actor, 'read')
    const dto = approvalDto(ApprovalQueryDto, query)
    const items = await this.prisma.approvalRequest.findMany({
      where: { ...(dto.status ? { status: dto.status } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
    })
    return ok({
      items: await this.withActorProfiles(items.slice(0, 50), false),
      nextCursor: items.length > 50 ? items[49].id : null,
    })
  }

  async detail(id: string, actor: ApprovalActor) {
    this.authorize(actor, 'detail')
    const item = await this.prisma.approvalRequest.findUnique({ where: { id } })
    if (!item) throw new NotFoundException('审批单不存在')
    return ok((await this.withActorProfiles([item], true))[0])
  }

  private async withActorProfiles<T extends ApprovalRequest>(items: T[], detail: boolean) {
    const ids = [
      ...new Set(
        items.flatMap(
          (item) =>
            [item.applicantId, item.approverId, item.executorId, item.reviewerId].filter(
              Boolean
            ) as string[]
        )
      ),
    ]
    const userDelegate = (
      this.prisma as PrismaService & {
        user?: { findMany: (args: unknown) => Promise<ActorProfile[]> }
      }
    ).user
    const users =
      ids.length && typeof userDelegate?.findMany === 'function'
        ? await userDelegate.findMany({
            where: { userId: { in: ids } },
            select: {
              userId: true,
              displayName: true,
              roles: {
                where: {
                  revokedAt: null,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
                select: {
                  role: { select: { roleId: true, code: true, name: true, roleType: true } },
                },
              },
            },
          })
        : []
    const profiles = new Map(users.map((user) => [user.userId, user]))
    const actor = (id: string | null, snapshot: string | null) =>
      id
        ? {
            userId: id,
            displayName: snapshot || profiles.get(id)?.displayName || null,
            roles: (profiles.get(id)?.roles || []).map(
              ({ role }: { role: ActorRoleProfile }) => role
            ),
          }
        : null
    return items.map((item) => {
      const base = {
        id: item.id,
        requestNo: item.requestNo,
        kind: item.kind,
        kindLabel: APPROVAL_KIND_LABELS[item.kind] || item.kind,
        status: item.status,
        reason: item.reason,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        applicant: actor(item.applicantId, item.applicantDisplayName),
        approver: actor(item.approverId, item.approverDisplayName),
        executor: actor(item.executorId, item.executorDisplayName),
        reviewer: actor(item.reviewerId, item.reviewerDisplayName),
        canceller: actor(item.cancellerId, item.cancellerDisplayName),
      }
      return detail
        ? {
            ...base,
            payload: item.payload,
            approvedAt: item.approvedAt,
            executedAt: item.executedAt,
            reviewedAt: item.reviewedAt,
            approvalNote: item.approvalNote,
            executionNote: item.executionNote,
            reviewNote: item.reviewNote,
            cancelledAt: item.cancelledAt,
            cancellationNote: item.cancellationNote,
          }
        : base
    })
  }

  async transition(
    id: string,
    step: Step,
    input: ApprovalActionDto,
    actor: ApprovalActor,
    context: ApprovalContext = {}
  ) {
    this.authorize(actor, step)
    const dto = approvalDto(ApprovalActionDto, input)
    if (!dto.note.trim()) throw new BadRequestException('必须填写处理意见')
    return this.transaction(async (tx) => {
      const before = await tx.approvalRequest.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('审批单不存在')
      this.authorize(actor, step, before.kind)
      const expected = { approve: 'REQUESTED', execute: 'APPROVED', review: 'EXECUTED' } as const
      const next = { approve: 'APPROVED', execute: 'EXECUTED', review: 'REVIEWED' } as const
      if (before.status !== expected[step]) throw new ConflictException('审批状态不允许此操作')
      this.expiry(before.expiresAt, before.createdAt, step !== 'review', before.kind)
      if (step === 'approve' && sameActor(before.applicantId, actor.userId))
        throw new ForbiddenException('申请人不得审批自己的申请')
      if (
        step === 'review' &&
        [before.applicantId, before.approverId, before.executorId].some((id) =>
          sameActor(id, actor.userId)
        )
      ) {
        throw new ForbiddenException('审计复核人必须独立于申请人、审批人和执行人')
      }
      const payload = approvalPayload(before.kind, before.payload)
      const actors = [
        ...new Set(
          [before.applicantId, before.approverId, before.executorId, actor.userId].filter(
            (value): value is string => !!value
          )
        ),
      ]
      if (step === 'review')
        await this.assertNotBeneficiary(tx, before.kind, payload, [actor.userId])
      else await this.validateTarget(tx, before.kind, payload, actors)
      const now = new Date()
      const data: Prisma.ApprovalRequestUpdateManyMutationInput = {
        status: next[step],
        ...(step === 'approve'
          ? {
              approverId: actor.userId,
              approverDisplayName: actor.displayName,
              approvedAt: now,
              approvalNote: dto.note.trim(),
            }
          : {}),
        ...(step === 'execute'
          ? {
              executorId: actor.userId,
              executorDisplayName: actor.displayName,
              executedAt: now,
              executionNote: dto.note.trim(),
            }
          : {}),
        ...(step === 'review'
          ? {
              reviewerId: actor.userId,
              reviewerDisplayName: actor.displayName,
              reviewedAt: now,
              reviewNote: dto.note.trim(),
            }
          : {}),
      }
      const claimed = await tx.approvalRequest.updateMany({
        where: {
          id,
          status: expected[step],
          ...(step !== 'review' ? { expiresAt: { gt: now } } : {}),
        },
        data,
      })
      if (claimed.count !== 1) throw new ConflictException('审批已被其他操作处理或已过期')
      const mutation =
        step === 'execute' ? await this.execute(tx, before, payload, actor, now) : undefined
      const after = await tx.approvalRequest.findUniqueOrThrow({ where: { id } })
      await this.audit(
        tx,
        actor,
        context,
        step,
        id,
        { approval: before, mutation: mutation?.before ?? null },
        { approval: after, mutation: mutation?.after ?? null }
      )
      return ok(after)
    })
  }

  async cancel(
    id: string,
    input: ApprovalActionDto,
    actor: ApprovalActor,
    context: ApprovalContext = {}
  ) {
    this.authorize(actor, 'cancel')
    const dto = approvalDto(ApprovalActionDto, input)
    if (!dto.note.trim()) throw new BadRequestException('必须填写撤回原因')
    return this.transaction(async (tx) => {
      const before = await tx.approvalRequest.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('审批单不存在')
      if (!sameActor(before.applicantId, actor.userId))
        throw new ForbiddenException('只有申请人可以撤回审批申请')
      if (before.status !== 'REQUESTED') throw new ConflictException('只有待审批申请可以撤回')
      const now = new Date()
      const claimed = await tx.approvalRequest.updateMany({
        where: { id, applicantId: actor.userId, status: 'REQUESTED' },
        data: {
          status: 'CANCELLED',
          cancellerId: actor.userId,
          cancellerDisplayName: actor.displayName,
          cancelledAt: now,
          cancellationNote: dto.note.trim(),
        },
      })
      if (claimed.count !== 1) throw new ConflictException('审批已被其他操作处理')
      const after = await tx.approvalRequest.findUniqueOrThrow({ where: { id } })
      await this.audit(tx, actor, context, 'cancel', id, { approval: before }, { approval: after })
      return ok(after)
    })
  }

  private async role(tx: Tx, roleId: string) {
    const role = await tx.role.findUnique({ where: { roleId } })
    if (!role || role.status !== 'ACTIVE') throw new BadRequestException('目标角色不存在或已停用')
    return role
  }

  private permissionPolicy(role: Pick<Role, 'roleType'>, permission: Permission & { roleTypes?: readonly { roleType: string }[] }) {
    if (
      permission.status !== 'ACTIVE' ||
      permission.code === '*' ||
      permission.code === 'system.permission.manage' ||
      permission.method === 'ALL' ||
      permission.path?.includes('*')
    )
      throw new ForbiddenException('禁止授予失效、通配或已停止使用的权限')
    const code = permission.code
    if (
      role.roleType === 'BUSINESS' &&
      (isManagementResource(permission.resource) || isCatalogManagementCode(code) || isManagementApiPath(permission.path || ''))
    )
      throw new ForbiddenException('业务角色不能授予管理权限')
    const sharedApprovalRead = ['system.approval.read', 'system.approval.detail'].includes(code)
    if (role.roleType !== 'BUSINESS' && !sharedApprovalRead && isManagementApiPath(permission.path || '')) {
      const root = permission.path ? permission.path.split('/').filter(Boolean).slice(0, 3).join('/') : ''
      const auditPath = root === 'api/v1/audit' || root === 'api/v1/audit-logs'
      const securityPath = root === 'api/v1/roles' || root === 'api/v1/users' || root === 'api/v1/permission'
      if ((auditPath && role.roleType !== 'AUDIT') || (securityPath && role.roleType === 'AUDIT'))
        throw new ForbiddenException('路径管理职责冲突')
    }
    if (!allowedRoleTypesForPermission(permission).includes(role.roleType))
      throw new ForbiddenException('职责冲突：权限与角色类型不匹配')
    if (permission.resource === 'system.audit' && !AUDIT_READ_CODES.has(code))
      throw new ForbiddenException('禁止授予审计修改、删除或策略关闭权限')
    if (permission.type === 'API')
      assertApi({ code, method: permission.method || '', path: permission.path || '' })
  }

  private async assertNotBeneficiary(
    tx: Tx,
    kind: string,
    payload: ReturnType<typeof approvalPayload>,
    actors: string[]
  ) {
    // API metadata and lifecycle changes do not grant an API to the applicant.
    // They are protected by the independent SECURITY approver and target-state
    // checks; role-beneficiary logic would incorrectly treat an existing API
    // permission as a self-benefit.
    if (
      [
        'API_ROUTE_CHANGE',
        'API_CREATE',
        'API_UPDATE',
        'API_ENABLE',
        'API_DISABLE',
        'API_DELETE',
        'PAGE_ENABLE',
        'PAGE_DISABLE',
        'PAGE_ROUTE_CHANGE',
      ].includes(kind)
    )
      return
    if (kind === 'ROLE_GRANT' || kind === 'ROLE_REVOKE' || kind === 'MFA_RESET') {
      const targetUserId =
        kind === 'MFA_RESET'
          ? (payload as MfaResetPayload).userId
          : (payload as RoleGrantPayload).userId
      if (actors.some((actor) => sameActor(actor, targetUserId)))
        throw new ForbiddenException('禁止为自己申请、审批、执行或复核授权')
      return
    }
    if (isRevocation(kind)) {
      // Revocation reduces access: do not reject historic beneficiaries or unsafe grants.
      // Still forbid participants from changing a role they currently hold.
      let roleFilter: Prisma.UserRoleWhereInput
      if (kind === 'ELEVATED_REVOKE') {
        const scope = await tx.roleElevatedDataScope.findUnique({
          where: { id: (payload as ElevatedRevokePayload).scopeId },
          select: { roleId: true },
        })
        if (!scope) throw new NotFoundException('高权限数据范围不存在')
        roleFilter = { roleId: scope.roleId }
      } else roleFilter = { role: { roleId: (payload as RolePermissionsPayload).roleId } }
      if (
        await tx.userRole.findFirst({
          where: { ...roleFilter, ...live(new Date()), user: { userId: { in: actors } } },
          select: { userId: true },
        })
      ) {
        throw new ForbiddenException('禁止申请、审批、执行或复核本人角色的回收')
      }
      return
    }
    // Include expired assignments: an actor cannot review their own past grant either.
    const where: Prisma.UserRoleWhereInput = {
      user: { userId: { in: actors } },
      ...(kind === 'API_ROUTE_CHANGE'
        ? {
            role: {
              permissions: { some: { permissionId: (payload as ApiRouteChangePayload).apiId } },
            },
          }
        : { role: { roleId: (payload as RolePermissionsPayload).roleId } }),
    }
    if (await tx.userRole.findFirst({ where, select: { userId: true } }))
      throw new ForbiddenException('禁止处理可使本人受益的角色或接口变更')
  }

  private async validateTarget(
    tx: Tx,
    kind: string,
    payload: ReturnType<typeof approvalPayload>,
    actors: string[]
  ) {
    await this.assertNotBeneficiary(tx, kind, payload, actors)
    const now = new Date()
    if (kind === 'ROLE_STATUS') {
      const input = payload as RoleStatusPayload
      const role = await tx.role.findUnique({ where: { roleId: input.roleId } })
      if (!role) throw new NotFoundException('目标角色不存在')
      if (role.status === input.status) throw new ConflictException('角色已经是目标状态')
      if (input.status !== 'DISABLED') throw new BadRequestException('角色启用必须直接操作')
      if (
        await tx.userRole.findFirst({
          where: { roleId: role.id, ...live(now), user: { userId: { in: actors } } },
          select: { userId: true },
        })
      ) {
        throw new ForbiddenException('禁止申请、审批、执行或复核本人有效角色的停用')
      }
      const users = await tx.userRole.count({ where: { roleId: role.id, ...live(now) } })
      if (!users) throw new ConflictException('角色没有绑定用户，可直接停用')
      return
    }
    if (isRevocation(kind)) {
      // Disabled accounts/roles, expired grants and forbidden legacy permissions must remain revocable.
      if (kind === 'ELEVATED_REVOKE') {
        const scope = await tx.roleElevatedDataScope.findUnique({
          where: { id: (payload as ElevatedRevokePayload).scopeId },
        })
        if (!scope || scope.revokedAt) throw new ConflictException('数据范围不存在或已回收')
      } else {
        const input = payload as RoleGrantPayload | RolePermissionsPayload
        const role = await tx.role.findUnique({ where: { roleId: input.roleId } })
        if (!role) throw new NotFoundException('目标角色不存在')
        if (kind === 'ROLE_REVOKE') {
          const user = await tx.user.findUnique({
            where: { userId: (input as RoleGrantPayload).userId },
            select: { id: true },
          })
          const binding =
            user &&
            (await tx.userRole.findUnique({
              where: { userId_roleId: { userId: user.id, roleId: role.id } },
            }))
          if (!binding || binding.revokedAt)
            throw new ConflictException('用户角色授权不存在或已回收')
        } else {
          const permissionIds = (input as RolePermissionsPayload).permissionIds
          const count = await tx.rolePermission.count({
            where: { roleId: role.id, permissionId: { in: permissionIds }, revokedAt: null },
          })
          if (count !== permissionIds.length)
            throw new ConflictException('存在未授权或已回收的角色权限')
        }
      }
      return
    }
    if (kind === 'MFA_RESET') {
      const input = payload as MfaResetPayload
      const user = await tx.user.findUnique({
        where: { userId: input.userId },
        select: { id: true, status: true, expiresAt: true },
      })
      if (!user || user.status !== 'ACTIVE' || (user.expiresAt && user.expiresAt <= now))
        throw new BadRequestException('目标账户不存在、已停用或已过期')
      return
    }
    if (kind === 'API_ROUTE_CHANGE') {
      const input = payload as ApiRouteChangePayload
      const path = assertApi(input)
      if (path !== input.path) throw new BadRequestException('请使用规范化路由模板')
      const api = await tx.permission.findUnique({
        where: { id: input.apiId },
        include: { roleTypes: { select: { roleType: true } } },
      })
      if (!api || api.type !== 'API' || api.status !== 'ACTIVE')
        throw new BadRequestException('目标接口不存在或已停用')
      // Fastify registered routes are the source of truth, never arbitrary client paths.
      const server = this.http?.httpAdapter?.getInstance()
      if (!server?.hasRoute?.({ method: input.method, url: path }))
        throw new BadRequestException('目标方法和路径必须为已注册的后端路由')
      // Changing an assigned endpoint would silently repurpose existing grants.
      if (await tx.rolePermission.count({ where: { permissionId: api.id, ...live(now) } }))
        throw new ConflictException('请先撤销接口现有角色授权，再变更路由并重新申请授权')
      if (
        await tx.permission.findFirst({
          where: {
            id: { not: api.id },
            OR: [{ code: input.code }, { method: input.method, path }],
          },
        })
      )
        throw new ConflictException('权限码或路由已存在')
      const allowedRoleTypes = allowedRoleTypesForPermission(api)
      if (!allowedRoleTypes.length) throw new BadRequestException('接口未配置职责策略')
      this.permissionPolicy(
        { roleType: allowedRoleTypes[0] as Role['roleType'] },
        { ...api, ...input, path, roleTypes: api.roleTypes }
      )
      return
    }
    if (kind === 'API_UPDATE') {
      const input = payload as ApiUpdatePayload
      const api = await tx.permission.findUnique({ where: { id: input.apiId } })
      if (!api || api.type !== 'API' || RETIRED_CODES.includes(api.code))
        throw new BadRequestException('目标接口不存在')
      if (api.status !== 'ACTIVE') throw new BadRequestException('目标接口已停用')
      return
    }
    if (kind === 'API_CREATE') {
      const input = payload as ApiCreatePayload
      const path = assertApi(input)
      if (isManagementResource(input.resource) || isCatalogManagementCode(input.code) || isManagementApiPath(input.path))
        throw new BadRequestException('受保护的管理接口由服务端目录维护')
      if (
        await tx.permission.findFirst({
          where: { OR: [{ code: input.code }, { method: input.method, path }] },
        })
      )
        throw new ConflictException('权限码或路由已存在')
      return
    }
    if (kind === 'API_ENABLE' || kind === 'API_DISABLE') {
      const input = payload as ApiTogglePayload
      const api = await tx.permission.findUnique({ where: { id: input.apiId } })
      if (!api || api.type !== 'API' || RETIRED_CODES.includes(api.code))
        throw new BadRequestException('目标接口不存在')
      const targetStatus = kind === 'API_ENABLE' ? 'ACTIVE' : 'DISABLED'
      if (api.status === targetStatus) throw new ConflictException('接口已经是目标状态')
      return
    }
    if (kind === 'API_DELETE') {
      const input = payload as ApiDeletePayload
      const api = await tx.permission.findUnique({ where: { id: input.apiId } })
      if (!api || api.type !== 'API' || RETIRED_CODES.includes(api.code))
        throw new BadRequestException('目标接口不存在')
      const counts = await Promise.all([
        tx.functionApi.count({ where: { apiId: api.id } }),
        tx.buttonApi.count({ where: { apiId: api.id } }),
        tx.rolePermission.count({ where: { permissionId: api.id } }),
      ])
      if (counts.some(Boolean))
        throw new ConflictException('接口仍被页面、按钮或角色引用，请先处理引用关系')
      return
    }
    if (kind === 'PAGE_ENABLE' || kind === 'PAGE_DISABLE') {
      const input = payload as PageStatusPayload
      const page = await tx.systemFunction.findUnique({
        where: { id: input.pageId },
        select: { id: true, nodeType: true, status: true },
      })
      if (!page || page.nodeType === 'DIRECTORY') throw new BadRequestException('目标页面不存在或不能单独启停')
      const targetStatus = kind === 'PAGE_ENABLE' ? 'ACTIVE' : 'DISABLED'
      if (page.status === targetStatus) throw new ConflictException('页面已经是目标状态')
      return
    }
    if (kind === 'PAGE_ROUTE_CHANGE') {
      const input = payload as PageRouteChangePayload
      const page = await tx.systemFunction.findUnique({ where: { id: input.pageId } })
      if (!page || page.status !== 'ACTIVE') throw new BadRequestException('目标页面不存在或已停用')
      if (canonicalPath(input.route) !== input.route)
        throw new BadRequestException('页面路径格式无效')
      if (
        await tx.systemFunction.findFirst({ where: { id: { not: page.id }, route: input.route } })
      )
        throw new ConflictException('页面路径已存在')
      return
    }
    const role = await this.role(tx, (payload as RoleGrantPayload).roleId)
    const existing = await tx.rolePermission.findMany({
      where: { roleId: role.id, ...live(now) },
      include: { permission: { include: { roleTypes: { select: { roleType: true } } } } },
    })
    for (const binding of existing) this.permissionPolicy(role, binding.permission)
    if (kind === 'ROLE_GRANT') {
      const input = payload as RoleGrantPayload
      const user = await tx.user.findUnique({
        where: { userId: input.userId },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          roles: { where: live(now), include: { role: true } },
        },
      })
      if (!user || user.status !== 'ACTIVE' || (user.expiresAt && user.expiresAt <= now))
        throw new BadRequestException('目标账户不存在、已停用或已过期')
      const types = new Set(
        [
          ...user.roles
            .filter((binding) => binding.role.status === 'ACTIVE')
            .map((binding) => binding.role.roleType),
          role.roleType,
        ].filter((type) => type !== 'BUSINESS')
      )
      if (types.size > 1) throw new ForbiddenException('同一账户不得拥有互斥管理员角色')
    } else if (kind === 'ROLE_PERMISSIONS') {
      const input = payload as RolePermissionsPayload
      const permissions = await tx.permission.findMany({
        where: { id: { in: input.permissionIds } },
        include: { roleTypes: { select: { roleType: true } } },
      })
      if (permissions.length !== input.permissionIds.length)
        throw new BadRequestException('存在无效权限 UUID')
      for (const permission of permissions) this.permissionPolicy(role, permission)
    } else if (kind === 'ELEVATED_SCOPE') {
      const input = payload as ElevatedScopePayload
      if (
        !isBusinessDataResource(input.resource) ||
        !(await tx.dataResource.findFirst({
          where: { code: input.resource, status: 'ACTIVE' },
          select: { id: true },
        }))
      )
        throw new BadRequestException('数据资源不存在或未启用')
      for (const target of input.targets) {
        const exists =
          target.targetType === 'USER'
            ? await tx.user.findFirst({
                where: {
                  userId: target.targetId,
                  status: 'ACTIVE',
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
                select: { id: true },
              })
            : target.targetType === 'TENANT'
            ? await tx.tenant.findFirst({
                where: { id: target.targetId, status: 'ACTIVE' },
                select: { id: true },
              })
            : target.targetType === 'ORGANIZATION'
            ? await tx.organization.findFirst({
                where: { id: target.targetId, status: 'ACTIVE', tenant: { status: 'ACTIVE' } },
                select: { id: true },
              })
            : await tx.department.findFirst({
                where: {
                  id: target.targetId,
                  status: 'ACTIVE',
                  tenant: { status: 'ACTIVE' },
                  organization: { status: 'ACTIVE' },
                },
                select: { id: true },
              })
        if (!exists) throw new BadRequestException('数据范围目标不存在或目标及所属主数据已停用')
      }
    }
  }

  private async execute(
    tx: Tx,
    request: ApprovalRequest,
    payload: ReturnType<typeof approvalPayload>,
    actor: ApprovalActor,
    now: Date
  ) {
    if (isRevocation(request.kind)) return this.revoke(tx, request, payload, actor, now)
    if (request.kind === 'ROLE_STATUS') {
      const input = payload as RoleStatusPayload
      const role = await tx.role.findUniqueOrThrow({ where: { roleId: input.roleId } })
      if (role.status === input.status) throw new ConflictException('角色状态已变化，请重新读取')
      const after = await tx.role.update({
        where: { id: role.id },
        data: { status: input.status },
      })
      return { before: role, after }
    }
    if (request.kind === 'MFA_RESET') {
      const input = payload as MfaResetPayload
      const user = await tx.user.findUniqueOrThrow({
        where: { userId: input.userId },
        select: {
          id: true,
          userId: true,
          status: true,
          mfaEnabled: true,
          mfaSecret: true,
          mfaLastStep: true,
        },
      })
      const before = {
        userId: user.userId,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        hadMfaSecret: !!user.mfaSecret,
        hadMfaLastStep: user.mfaLastStep !== null,
      }
      const changed = await tx.user.updateMany({
        where: {
          id: user.id,
          status: 'ACTIVE',
          mfaEnabled: user.mfaEnabled,
          mfaSecret: user.mfaSecret,
          mfaLastStep: user.mfaLastStep,
        },
        data: { mfaEnabled: false, mfaSecret: null, mfaLastStep: null, updatedAt: now },
      })
      if (changed.count !== 1)
        throw new ConflictException('目标账户 MFA 状态已变化，请重新读取后操作')
      const revoked = await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      })
      const after = {
        userId: user.userId,
        status: user.status,
        mfaEnabled: false,
        hadMfaSecret: false,
        hadMfaLastStep: false,
        revokedSessions: revoked.count,
        resetBy: actor.userId,
        approvalRef: request.id,
      }
      return { before, after }
    }
    const grant = {
      assignedAt: now,
      expiresAt: request.expiresAt,
      revokedAt: null,
      grantedBy: actor.userId,
      revokedBy: null,
      grantReason: request.reason,
      revokeReason: null,
      approvalRef: request.id,
    }
    if (request.kind === 'ROLE_GRANT') {
      const input = payload as RoleGrantPayload
      const role = await this.role(tx, input.roleId)
      const user = await tx.user.findUniqueOrThrow({
        where: { userId: input.userId },
        select: { id: true },
      })
      const key = { userId: user.id, roleId: role.id }
      const before = await tx.userRole.findUnique({ where: { userId_roleId: key } })
      const after = await tx.userRole.upsert({
        where: { userId_roleId: key },
        create: { ...key, ...grant },
        update: grant,
      })
      return { before, after }
    }
    if (request.kind === 'ROLE_PERMISSIONS') {
      const input = payload as RolePermissionsPayload
      const role = await this.role(tx, input.roleId)
      const before = await tx.rolePermission.findMany({
        where: { roleId: role.id, permissionId: { in: input.permissionIds } },
      })
      const after = []
      for (const permissionId of input.permissionIds) {
        const key = { roleId: role.id, permissionId }
        after.push(
          await tx.rolePermission.upsert({
            where: { roleId_permissionId: key },
            create: { ...key, ...grant },
            update: grant,
          })
        )
      }
      return { before, after }
    }
    if (request.kind === 'API_ROUTE_CHANGE') {
      const input = payload as ApiRouteChangePayload
      const before = await tx.permission.findUniqueOrThrow({ where: { id: input.apiId } })
      const after = await tx.permission.update({
        where: { id: input.apiId },
        data: { code: input.code, method: input.method, path: input.path },
      })
      return { before, after }
    }
    if (request.kind === 'API_UPDATE') {
      const input = payload as ApiUpdatePayload
      const before = await tx.permission.findUniqueOrThrow({ where: { id: input.apiId } })
      const after = await tx.permission.update({
        where: { id: input.apiId },
        data: { name: input.name },
      })
      return { before, after }
    }
    if (request.kind === 'API_CREATE') {
      const input = payload as ApiCreatePayload
      const path = assertApi(input)
      const after = await tx.permission.create({
        data: {
          ...input,
          path,
          type: 'API',
          roleTypes: { create: { roleType: 'BUSINESS' } },
        },
      })
      return { before: null, after }
    }
    if (request.kind === 'API_ENABLE' || request.kind === 'API_DISABLE') {
      const input = payload as ApiTogglePayload
      const before = await tx.permission.findUniqueOrThrow({ where: { id: input.apiId } })
      const targetStatus = request.kind === 'API_ENABLE' ? 'ACTIVE' : 'DISABLED'
      const after = await tx.permission.update({
        where: { id: input.apiId },
        data: { status: targetStatus },
      })
      if (targetStatus === 'DISABLED')
        await this.revokePermissionGrants(tx, input.apiId, actor.userId, request.reason, now)
      return { before, after }
    }
    if (request.kind === 'API_DELETE') {
      const input = payload as ApiDeletePayload
      const before = await tx.permission.findUniqueOrThrow({ where: { id: input.apiId } })
      await tx.permission.delete({ where: { id: input.apiId } })
      return { before, after: null }
    }
    if (request.kind === 'PAGE_ENABLE' || request.kind === 'PAGE_DISABLE') {
      const input = payload as PageStatusPayload
      const before = await tx.systemFunction.findUniqueOrThrow({
        where: { id: input.pageId },
      })
      const targetStatus = request.kind === 'PAGE_ENABLE' ? 'ACTIVE' : 'DISABLED'
      const after = await tx.systemFunction.update({
        where: { id: input.pageId },
        data: { status: targetStatus },
      })
      if (targetStatus === 'DISABLED' && before.permissionId)
        await this.revokePermissionGrants(tx, before.permissionId, actor.userId, request.reason, now)
      return { before, after }
    }
    if (request.kind === 'PAGE_ROUTE_CHANGE') {
      const input = payload as PageRouteChangePayload
      const before = await tx.systemFunction.findUniqueOrThrow({ where: { id: input.pageId } })
      const after = await tx.systemFunction.update({
        where: { id: input.pageId },
        data: {
          route: input.route,
          ...(input.component !== undefined ? { component: input.component } : {}),
        },
      })
      return { before, after }
    }
    const input = payload as ElevatedScopePayload
    const role = await this.role(tx, input.roleId)
    const after = await tx.roleElevatedDataScope.create({
      data: {
        roleId: role.id,
        resource: input.resource,
        scopeType: input.scopeType,
        reason: request.reason,
        approvalRef: request.id,
        validFrom: now,
        expiresAt: request.expiresAt,
        targets: {
          create: input.targets.map((target) => ({
            targetType: target.targetType,
            targetId: target.targetId,
            [TARGET_FOREIGN_KEY[target.targetType]]: target.targetId,
          })),
        },
      },
      include: { targets: true },
    })
    return { before: null, after }
  }

  private async revoke(
    tx: Tx,
    request: ApprovalRequest,
    payload: ReturnType<typeof approvalPayload>,
    actor: ApprovalActor,
    now: Date
  ) {
    const revocation = { revokedAt: now, revokedBy: actor.userId, revokeReason: request.reason }
    if (request.kind === 'ELEVATED_REVOKE') {
      const id = (payload as ElevatedRevokePayload).scopeId
      const before = await tx.roleElevatedDataScope.findUniqueOrThrow({
        where: { id },
        include: { targets: true },
      })
      const changed = await tx.roleElevatedDataScope.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: now },
      })
      if (changed.count !== 1) throw new ConflictException('数据范围已被其他操作回收')
      const after = await tx.roleElevatedDataScope.findUniqueOrThrow({
        where: { id },
        include: { targets: true },
      })
      // The scope schema has no revoke actor/reason columns. Persist explicit provenance in the same atomic audit.
      return { before, after: { ...after, revocation: { ...revocation, approvalRef: request.id } } }
    }
    const input = payload as RoleGrantPayload | RolePermissionsPayload
    const role = await tx.role.findUniqueOrThrow({ where: { roleId: input.roleId } })
    if (request.kind === 'ROLE_REVOKE') {
      const user = await tx.user.findUniqueOrThrow({
        where: { userId: (input as RoleGrantPayload).userId },
        select: { id: true },
      })
      const key = { roleId: role.id, userId: user.id }
      const before = await tx.userRole.findUniqueOrThrow({ where: { userId_roleId: key } })
      const changed = await tx.userRole.updateMany({
        where: { ...key, revokedAt: null },
        data: revocation,
      })
      if (changed.count !== 1) throw new ConflictException('角色授权已被其他操作回收')
      const after = await tx.userRole.findUniqueOrThrow({ where: { userId_roleId: key } })
      return { before, after }
    }
    const permissionIds = (input as RolePermissionsPayload).permissionIds
    const where = { roleId: role.id, permissionId: { in: permissionIds } }
    const before = await tx.rolePermission.findMany({ where })
    const changed = await tx.rolePermission.updateMany({
      where: { ...where, revokedAt: null },
      data: revocation,
    })
    if (changed.count !== permissionIds.length)
      throw new ConflictException('角色权限已被其他操作回收')
    const after = await tx.rolePermission.findMany({ where })
    return { before, after }
  }

  private async revokePermissionGrants(tx: Tx, permissionId: string, actorId: string, reason: string, now: Date) {
    await tx.rolePermission.updateMany({
      where: { permissionId, revokedAt: null },
      data: {
        revokedAt: now,
        revokedBy: actorId,
        revokeReason: `权限停用，自动撤销：${reason}`,
      },
    })
  }

  private async audit(
    tx: Tx,
    actor: ApprovalActor,
    context: ApprovalContext,
    action: string,
    id: string,
    before: unknown,
    after: unknown
  ) {
    await tx.auditLog.create({
      data: {
        traceId: context.traceId || randomUUID(),
        actorId: actor.internalId,
        action: `system.approval.${action}`,
        riskLevel: resolveRiskDecision(`system.approval.${action}`).riskLevel,
        resource: 'approval',
        method: context.method || 'POST',
        path: context.path || '/api/v1/permission/approvals',
        result: 'SUCCESS',
        statusCode: action === 'create' ? 201 : 200,
        ip: context.ip,
        userAgent: context.userAgent,
        detail: sanitizeAuditDetail(json({
          targetId: id,
          actorId: actor.internalId,
          actorUserId: actor.userId,
          roleTypes: actor.roles.map(
            (role) => (role as typeof role & { roleType?: string }).roleType
          ),
          before,
          after,
        })) as Prisma.InputJsonValue,
      },
    })
  }
}
