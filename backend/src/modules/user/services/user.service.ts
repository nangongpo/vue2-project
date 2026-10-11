import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { UserStatus } from '#app/common/types/prisma-enums.js'
import { PrismaService } from '#app/database/prisma.service.js'
import { PasswordService } from '#app/security/services/password.service.js'
import { PasswordPolicyService } from '#app/security/services/password-policy.service.js'
import { API_CODE } from '#app/common/constants/api-code.js'
import { ENABLEMENT_STATUS_LABELS, USER_STATUS_LABELS } from '#app/common/constants/enum-labels.js'
import { availableAction } from '#app/common/constants/api-name-labels.js'
import { normalizePagination, paginationData } from '#app/common/pagination.js'
import {
  activeGrant,
  audit,
  grantInput,
  ordinaryRole,
  requiresControlledRoleApproval,
  rejectFields,
  requireActor,
  requireReason,
  serializable,
} from '#app/modules/role/domain/authorization.js'
import type { Actor } from '#app/modules/role/domain/authorization.js'
import type { ApprovalActor } from '#app/modules/permission/services/approval.service.js'
import { ApprovalService } from '#app/modules/permission/services/approval.service.js'

const userSelect = {
  userId: true,
  username: true,
  displayName: true,
  status: true,
  failedLogins: true,
  lockedUntil: true,
} as const

function userView(user: { status: UserStatus; [key: string]: unknown }) {
  const { userId, username, displayName, status } = user
  return {
    userId,
    username,
    displayName,
    statusLabel: USER_STATUS_LABELS[status],
    isActive: status === UserStatus.ACTIVE,
    isLocked: status === UserStatus.LOCKED,
  }
}

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly approvals?: ApprovalService
  ) {}

  async page(query: { keyword?: string; status?: UserStatus; page?: number; pageSize?: number }, permissions: string[] = [], actor?: Actor) {
    const pagination = normalizePagination(query)
    const { page, pageSize } = pagination
    const where: Prisma.UserWhereInput = {
      ...(actor?.tenantId ? { tenantId: actor.tenantId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [{ username: { contains: query.keyword } }, { displayName: { contains: query.keyword } }],
          }
        : {}),
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          userId: true,
          username: true,
          displayName: true,
          status: true,
          failedLogins: true,
          lockedUntil: true,
          lastLoginAt: true,
          createdAt: true,
          roles: {
            where: { ...activeGrant(), role: { status: 'ACTIVE', ...(actor?.tenantId ? { tenantId: actor.tenantId } : {}) } },
            select: { role: { select: { roleId: true, code: true, name: true, roleType: true, status: true } } },
          },
        },
      }),
    ])
    const now = new Date()
    const pageItems = items.map((item) => {
      // Login lockouts are represented by lockedUntil while the persisted
      // account status remains ACTIVE. Expose the effective status here so
      // the admin UI can render the dedicated unlock action.
      const isLocked =
        item.status === 'LOCKED' || (item.status === 'ACTIVE' && !!item.lockedUntil && item.lockedUntil > now)
      const effectiveStatus = isLocked ? 'LOCKED' : item.status
      return {
        userId: item.userId,
        username: item.username,
        displayName: item.displayName,
        statusLabel: USER_STATUS_LABELS[effectiveStatus],
        isActive: effectiveStatus === 'ACTIVE',
        isLocked,
        availableActions: [
          permissions.includes('system.user.update') ? availableAction('edit', 'system.user.update') : null,
          permissions.includes('system.user.reset-password') ? availableAction('reset-password', 'system.user.reset-password') : null,
          effectiveStatus === 'ACTIVE' && permissions.includes('system.user.grant') ? availableAction('grant', 'system.user.grant') : null,
          effectiveStatus === 'ACTIVE' && permissions.includes('system.user.disable') ? availableAction('disable', 'system.user.disable') : null,
          effectiveStatus === 'DISABLED' && permissions.includes('system.user.enable') ? availableAction('enable', 'system.user.enable') : null,
          isLocked && permissions.includes('system.user.unlock') ? availableAction('unlock', 'system.user.unlock') : null,
        ].filter(Boolean),
        failedLogins: item.failedLogins,
        lastLoginAt: item.lastLoginAt,
        createdAt: item.createdAt,
        needsRoleApproval: item.roles.some(({ role }) => role.roleType !== 'BUSINESS'),
        roles: item.roles.map(({ role }) => ({
          role: {
            roleId: role.roleId,
            code: role.code,
            name: role.name,
            statusLabel: ENABLEMENT_STATUS_LABELS[role.status],
            isActive: role.status === 'ACTIVE',
          },
        })),
      }
    })
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: paginationData(pageItems, total, pagination),
    }
  }

  async create(input: { username: string; password: string; displayName: string }, actor: Actor) {
    rejectFields(input, ['roleIds', 'status', 'roleType', 'permissionIds', 'tenantId', 'organizationId', 'departmentId'])
    try {
      const password = await this.passwords.hash(input.password)
      const user = await this.prisma.$transaction(async (tx) => {
        await requireActor(tx, actor)
        if (!actor.tenantId) throw new ForbiddenException('当前会话未确定有效租户')
        const tenant = await tx.tenant.findUnique({ where: { id: actor.tenantId }, select: { id: true, status: true } })
        if (!tenant || tenant.status !== 'ACTIVE') throw new ForbiddenException('默认租户未初始化或未启用')
        const defaultOrganizationCode = process.env.DEFAULT_ORGANIZATION_CODE?.trim()
        const defaultDepartmentCode = process.env.DEFAULT_DEPARTMENT_CODE?.trim()
        if (!defaultOrganizationCode || !defaultDepartmentCode) throw new ForbiddenException('默认组织和部门配置缺失')
        const defaultOrganization = await tx.organization.findFirst({
          where: { tenantId: tenant.id, code: defaultOrganizationCode, status: 'ACTIVE' },
          select: { id: true },
        })
        const defaultDepartment = defaultOrganization
          ? await tx.department.findFirst({
              where: { tenantId: tenant.id, organizationId: defaultOrganization.id, code: defaultDepartmentCode, status: 'ACTIVE' },
              select: { id: true },
            })
          : null
        if (!defaultOrganization || !defaultDepartment) throw new ForbiddenException('默认组织和部门未初始化')
        const created = await tx.user.create({
          data: {
            username: input.username,
            password,
            displayName: input.displayName,
            tenantId: tenant.id,
            organizationId: defaultOrganization.id,
            departmentId: defaultDepartment.id,
          },
          select: { id: true, ...userSelect },
        })
        await tx.userTenantMembership.create({
          data: {
            userId: created.id,
            tenantId: tenant.id,
            scopeType: 'DEPARTMENT',
            organizationId: defaultOrganization.id,
            departmentId: defaultDepartment.id,
            status: 'ACTIVE',
            isDefault: true,
          },
        })
        await audit(tx, actor, 'system.user.create', created.userId, null, created)
        return created
      }, serializable)
      return { code: API_CODE.SUCCESS, message: 'success', data: userView(user) }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('账号已存在')
      throw error
    }
  }

  async update(id: string, input: { displayName?: string }, actor: Actor) {
    rejectFields(input, ['roleIds', 'status', 'roleType', 'permissionIds'])
    const user = await this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const before = await tx.user.findFirst({ where: { userId: id, tenantMemberships: { some: { tenantId: actor.tenantId, status: 'ACTIVE' } } }, select: userSelect })
      if (!before) throw new NotFoundException('用户不存在')
      const after = await tx.user.update({
        where: { userId: id },
        data: { displayName: input.displayName },
        select: userSelect,
      })
      await audit(tx, actor, 'system.user.update', id, before, after)
      return after
    }, serializable)
    return { code: API_CODE.SUCCESS, message: 'success', data: userView(user) }
  }

  async resetPassword(id: string, password: string, actor: Actor) {
    await this.prisma.$transaction(
      async (tx) => {
        await requireActor(tx, actor)
        const user = await tx.user.findFirst({
          where: { userId: id, tenantMemberships: { some: { tenantId: actor.tenantId, status: 'ACTIVE' } } },
          select: { id: true, password: true, passwordChangedAt: true, ...userSelect },
        })
        if (!user) throw new NotFoundException('用户不存在')
        if (user.id === actor.internalId) throw new ForbiddenException('请通过本人密码修改接口操作')
        await this.protectAdministrator(tx, user.id, actor.tenantId)
        await new PasswordPolicyService(this.passwords).replace(tx, user, password, false)
        await tx.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        })
        await audit(
          tx,
          actor,
          'system.user.reset-password',
          id,
          { passwordChanged: false },
          { passwordChanged: true, sessionsRevoked: true }
        )
      },
      { ...serializable, timeout: 20_000 }
    )
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  async roles(
    id: string,
    input: { roleIds: string[]; reason: string; expiresAt?: string },
    actor: Actor,
    approvalActor?: ApprovalActor
  ) {
    const expiresAt = grantInput(input.roleIds, input.reason, input.expiresAt)
    if (this.approvals && approvalActor && input.roleIds.length === 1) {
      const roles = await this.prisma.role.findMany({
        where: { roleId: { in: input.roleIds }, tenantId: actor.tenantId, status: 'ACTIVE' },
        include: {
          permissions: {
            where: { revokedAt: null },
            include: { permission: { include: { roleTypes: { select: { roleType: true } } } } },
          },
          elevatedDataScopes: { where: { revokedAt: null } },
        },
      })
      const highRisk = roles.some(requiresControlledRoleApproval)
      if (highRisk) {
        return this.approvals.createInternal(
          'ROLE_GRANT',
          {
            userId: id,
            roleId: input.roleIds[0],
            grantExpiresAt: input.expiresAt || null,
          },
          input.reason,
          approvalActor,
          {
            traceId: actor.traceId,
            ip: actor.ip,
            method: actor.method,
            path: actor.path,
            userAgent: actor.userAgent,
          }
        )
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const actorId = await requireActor(tx, actor)
      const user = await tx.user.findFirst({
        where: { userId: id, tenantMemberships: { some: { tenantId: actor.tenantId, status: 'ACTIVE' } } },
        select: { id: true, status: true, expiresAt: true },
      })
      if (!user) throw new NotFoundException('用户不存在')
      if (user.id === actor.internalId) throw new ForbiddenException('不能修改自身有效角色或权限')
      if (user.status !== 'ACTIVE' || (user.expiresAt && user.expiresAt <= new Date()))
        throw new BadRequestException('只能向有效账户分配角色')
      const roles = await tx.role.findMany({
        where: { roleId: { in: input.roleIds }, tenantId: actor.tenantId, status: 'ACTIVE' },
      })
      if (roles.length !== input.roleIds.length) throw new BadRequestException('角色无效或已禁用')
      const adminTypes = new Set(roles.filter((role) => role.roleType !== 'BUSINESS').map((role) => role.roleType))
      if (adminTypes.size > 1) throw new ForbiddenException('系统、安全、审计管理员职责互斥')
      const before = await tx.userRole.findMany({ where: { userId: user.id } })
      // Existing administrative bindings also require approval to revoke or renew.
      for (const binding of before.filter((binding) => binding.revokedAt === null))
        await ordinaryRole(tx, binding.roleId, actor.tenantId)
      for (const role of roles) await ordinaryRole(tx, role.id, actor.tenantId)
      await tx.userRole.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          roleId: { notIn: roles.map((role) => role.id) },
        },
        data: { revokedAt: new Date(), revokedBy: actorId, revokeReason: input.reason },
      })
      for (const role of roles) {
        const data = {
          assignedAt: new Date(),
          expiresAt,
          revokedAt: null,
          grantedBy: actorId,
          grantReason: input.reason,
          revokedBy: null,
          revokeReason: null,
          approvalRef: null,
        }
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: role.id } },
          create: { userId: user.id, roleId: role.id, ...data },
          update: data,
        })
      }
      const after = await tx.userRole.findMany({ where: { userId: user.id } })
      await audit(tx, actor, 'system.user.grant', id, before, after, input.reason, 'user')
    }, serializable)
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  async enable(id: string, reason: string, actor: Actor) {
    return this.changeStatus(id, { status: 'ACTIVE', reason }, actor, false)
  }

  async disable(id: string, reason: string, actor: Actor) {
    return this.changeStatus(id, { status: 'DISABLED', reason }, actor, false)
  }

  async unlock(id: string, reason: string, actor: Actor) {
    return this.changeStatus(id, { status: 'ACTIVE', reason }, actor, true)
  }

  private async changeStatus(
    id: string,
    input: { status: 'ACTIVE' | 'DISABLED'; reason: string },
    actor: Actor,
    unlock: boolean
  ) {
    requireReason(input.reason)
    await this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const before = await tx.user.findFirst({
        where: { userId: id, tenantMemberships: { some: { tenantId: actor.tenantId, status: 'ACTIVE' } } },
        select: { id: true, ...userSelect },
      })
      if (!before) throw new NotFoundException('用户不存在')
      if (before.id === actor.internalId) throw new ForbiddenException('不能修改自身账户状态')
      await this.protectAdministrator(tx, before.id, actor.tenantId)
      if (unlock && before.status !== 'LOCKED') throw new BadRequestException('只能解锁已锁定账户')
      if (!unlock && input.status === 'ACTIVE' && before.status === 'LOCKED')
        throw new BadRequestException('锁定账户必须使用解锁接口')
      const after = await tx.user.update({
        where: { id: before.id },
        data: { status: input.status, ...(unlock ? { failedLogins: 0, lockedUntil: null } : {}) },
        select: userSelect,
      })
      await tx.session.updateMany({
        where: { userId: before.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      await audit(
        tx,
        actor,
        unlock ? 'system.user.unlock' : input.status === 'ACTIVE' ? 'system.user.enable' : 'system.user.disable',
        id,
        before,
        after,
        input.reason
      )
    }, serializable)
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  private async protectAdministrator(tx: Prisma.TransactionClient, userId: bigint, tenantId: string) {
    const bindings = await tx.userRole.findMany({ where: { userId, revokedAt: null } })
    for (const binding of bindings) await ordinaryRole(tx, binding.roleId, tenantId)
  }
}
