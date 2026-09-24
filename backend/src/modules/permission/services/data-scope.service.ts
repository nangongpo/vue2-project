import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, StandardDataScopeType } from '@prisma/client'
import { createHash, randomUUID } from 'node:crypto'
import { PrismaService } from '../../../database/prisma.service.js'
import { effectiveGrant, type ScopeActor } from '../../../security/services/data-scope.service.js'
import { ok } from '../policies/policy.js'
import { riskLevelForOperation } from '../../../security/policies/risk-policy.js'

export type ScopeManagementContext = {
  actor: ScopeActor
  sessionToken?: string
  traceId?: string
  ip?: string
  userAgent?: string
}
export type StandardScopeInput = {
  resource: string
  scopeType: StandardDataScopeType
  expiresAt?: string
  reason: string
}

@Injectable()
export class DataScopeManagementService {
  constructor(private readonly prisma: PrismaService) {}

  private async authorize(
    db: Prisma.TransactionClient,
    context: ScopeManagementContext,
    permission: 'system.data.read' | 'system.data.update' | 'system.data.revoke',
    now: Date
  ) {
    if (!context.actor?.internalId || !context.sessionToken) throw new ForbiddenException('需要安全管理员和最近的 MFA 验证')
    const session = await db.session.findFirst({
      where: {
        id: createHash('sha256').update(context.sessionToken).digest('hex'),
        userId: context.actor.internalId,
        kind: 'AUTHENTICATED',
        revokedAt: null,
        expiresAt: { gt: now },
        mfaVerifiedAt: { gte: new Date(now.getTime() - 5 * 60_000), lte: now },
        reauthenticatedAt: { gte: new Date(now.getTime() - 5 * 60_000), lte: now },
        user: {
          status: 'ACTIVE',
          mfaEnabled: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          roles: {
            some: {
              ...effectiveGrant(now),
              role: {
                status: 'ACTIVE',
                roleType: 'SECURITY',
                permissions: {
                  some: {
                    ...effectiveGrant(now),
                    permission: {
                      code: permission,
                      status: 'ACTIVE',
                      type: 'API',
                      requiredRoleType: 'SECURITY',
                    },
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    })
    if (!session) throw new ForbiddenException('需要安全管理员权限和五分钟内的 MFA 验证')
  }

  async list(context: ScopeManagementContext, roleId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.authorize(tx, context, 'system.data.read', new Date())
        const role = await tx.role.findUnique({
          where: { roleId },
          select: {
            roleId: true,
            dataScopes: {
              select: {
                id: true,
                resource: true,
                scopeType: true,
                expiresAt: true,
                revokedAt: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        })
        if (!role) throw new NotFoundException('角色不存在')
        return ok(role)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  }

  async grant(context: ScopeManagementContext, roleId: string, input: StandardScopeInput) {
    if (!Object.values(StandardDataScopeType).includes(input.scopeType)) throw new BadRequestException('CUSTOM/ALL 必须经过独立审批流程')
    if (!/^[a-z][a-z0-9_.:-]{0,127}$/.test(input.resource) || !input.reason?.trim() || input.reason.length > 255)
      throw new BadRequestException('资源和授权原因无效')
    const now = new Date()
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now)) throw new BadRequestException('过期时间必须在未来')
    return this.prisma.$transaction(
      async (tx) => {
        await this.authorize(tx, context, 'system.data.update', now)
        const role = await this.editableRole(tx, context, roleId)
        const scope = await tx.roleDataScope.create({
          data: {
            roleId: role.id,
            resource: input.resource,
            scopeType: input.scopeType,
            expiresAt,
          },
        })
        await this.audit(tx, context, roleId, 'grant', input.reason, null, {
          id: scope.id,
          resource: scope.resource,
          scopeType: scope.scopeType,
          expiresAt: scope.expiresAt?.toISOString() ?? null,
        })
        return ok({
          id: scope.id,
          roleId,
          resource: scope.resource,
          scopeType: scope.scopeType,
          expiresAt: scope.expiresAt,
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  }

  async revoke(context: ScopeManagementContext, roleId: string, scopeId: string, reason: string) {
    if (!reason?.trim() || reason.length > 255) throw new BadRequestException('必须提供撤销原因')
    const now = new Date()
    return this.prisma.$transaction(
      async (tx) => {
        await this.authorize(tx, context, 'system.data.revoke', now)
        const role = await this.editableRole(tx, context, roleId)
        const scope = await tx.roleDataScope.findFirst({
          where: { id: scopeId, roleId: role.id, revokedAt: null },
        })
        if (!scope) throw new NotFoundException('有效数据范围不存在')
        await tx.roleDataScope.update({ where: { id: scope.id }, data: { revokedAt: now } })
        await this.audit(
          tx,
          context,
          roleId,
          'revoke',
          reason,
          { id: scope.id, resource: scope.resource, scopeType: scope.scopeType, revokedAt: null },
          { id: scope.id, revokedAt: now.toISOString() }
        )
        return ok({ id: scope.id, revokedAt: now })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  }

  private async editableRole(db: Prisma.TransactionClient, context: ScopeManagementContext, roleId: string) {
    const role = await db.role.findUnique({ where: { roleId } })
    if (!role || role.status !== 'ACTIVE') throw new NotFoundException('启用角色不存在')
    // Expired assignments may be renewed: deny any unrevoked own assignment.
    if (
      await db.userRole.findFirst({
        where: { userId: context.actor.internalId, roleId: role.id, revokedAt: null },
      })
    )
      throw new ForbiddenException('不能修改自己所绑定角色的数据权限')
    return role
  }

  private async audit(
    db: Prisma.TransactionClient,
    context: ScopeManagementContext,
    roleId: string,
    action: string,
    reason: string,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue
  ) {
    await db.auditLog.create({
      data: {
        traceId: context.traceId || randomUUID(),
        actorId: context.actor.internalId,
        action: `data-scope.${action}`,
        riskLevel: riskLevelForOperation(`data-scope.${action}`),
        resource: 'data-scope',
        method: action === 'grant' ? 'POST' : 'PATCH',
        path: `/api/v1/permission/roles/${roleId}/data-scopes`,
        result: 'SUCCESS',
        statusCode: action === 'grant' ? 201 : 200,
        ip: context.ip,
        userAgent: context.userAgent,
        detail: { roleId, actorRoleType: 'SECURITY', reason, before, after },
      },
    })
  }
}
