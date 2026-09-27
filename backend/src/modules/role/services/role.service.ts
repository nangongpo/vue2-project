import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PermissionStatus, RoleType } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { PrismaService } from '../../../database/prisma.service.js'
import { API_CODE } from '../../../common/constants/api-code.js'
import { ENABLEMENT_STATUS_LABELS, ROLE_TYPE_LABELS } from '../../../common/constants/enum-labels.js'
import {
  audit,
  grantInput,
  ordinaryPermission,
  ordinaryRole,
  preventOwnRoleChange,
  rejectFields,
  requireActor,
  requireReason,
  serializable,
} from '../domain/authorization.js'
import type { Actor } from '../domain/authorization.js'

function roleView(role: { status: 'ACTIVE' | 'DISABLED'; [key: string]: unknown }) {
  const { status, ...rest } = role
  return {
    ...rest,
    statusLabel: ENABLEMENT_STATUS_LABELS[status],
    isActive: status === 'ACTIVE',
  }
}

function generatedRoleCode() {
  return `role_${randomBytes(16).toString('hex')}`
}

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        roleId: true,
        name: true,
        description: true,
        roleType: true,
        status: true,
        _count: { select: { users: true } },
      },
    })
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: roles.map((role) => ({
        roleId: role.roleId,
        name: role.name,
        description: role.description,
        roleTypeLabel: ROLE_TYPE_LABELS[role.roleType],
        statusLabel: ENABLEMENT_STATUS_LABELS[role.status],
        isActive: role.status === 'ACTIVE',
        userCount: role._count.users,
        capabilities: {
          canEdit: role.roleType === RoleType.BUSINESS,
          canGrant: role.roleType === RoleType.BUSINESS && role.status === 'ACTIVE',
          canManageDataScope: role.roleType === RoleType.BUSINESS && role.status === 'ACTIVE',
          canDelete: role.roleType === RoleType.BUSINESS,
        },
      })),
    }
  }

  async listGrants(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { roleId: id },
      select: {
        permissions: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            permission: { status: PermissionStatus.ACTIVE },
          },
          select: { permission: { select: { id: true, code: true } } },
        },
      },
    })
    if (!role) throw new NotFoundException('角色不存在')
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: { permissionIds: role.permissions.filter((item) => item.permission.code !== '*').map((item) => item.permission.id) },
    }
  }

  async permissionOptions() {
    const items = await this.prisma.permission.findMany({
      where: {
        status: PermissionStatus.ACTIVE,
        roleTypes: { some: { roleType: RoleType.BUSINESS } },
      },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        resource: true,
        type: true,
        status: true,
        method: true,
        path: true,
        roleTypes: { select: { roleType: true } },
      },
    })
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: items.filter(ordinaryPermission).map(({ roleTypes: _roleTypes, status, ...item }) => ({
        ...item,
        statusLabel: ENABLEMENT_STATUS_LABELS[status],
        isActive: status === PermissionStatus.ACTIVE,
      })),
    }
  }

  async assignmentOptions() {
    const roles = await this.prisma.role.findMany({
      where: { status: 'ACTIVE', roleType: RoleType.BUSINESS },
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
      select: { roleId: true, code: true, name: true, status: true },
    })
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: roles.map(({ status, ...role }) => ({
        id: role.roleId,
        code: role.code,
        name: role.name,
        type: 'ROLE',
        statusLabel: ENABLEMENT_STATUS_LABELS[status],
        isActive: status === PermissionStatus.ACTIVE,
      })),
    }
  }

  async create(input: { name: string; description?: string }, actor: Actor) {
    rejectFields(input, ['code', 'roleType', 'permissionIds', 'status'])
    try {
      const role = await this.prisma.$transaction(async (tx) => {
        await requireActor(tx, actor)
        const created = await tx.role.create({
          data: {
            code: generatedRoleCode(),
            name: input.name,
            description: input.description,
            roleType: RoleType.BUSINESS,
          },
          select: {
            roleId: true,
            code: true,
            name: true,
            description: true,
            roleType: true,
            status: true,
          },
        })
        await audit(tx, actor, 'system.role.create', created.roleId, null, created)
        return created
      }, serializable)
      return { code: API_CODE.SUCCESS, message: 'success', data: roleView(role) }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('角色标识生成冲突，请重试')
      throw error
    }
  }

  async update(id: string, input: { name: string; description?: string }, actor: Actor) {
    rejectFields(input, ['code', 'roleType', 'permissionIds', 'status'])
    const role = await this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const exists = await tx.role.findUnique({ where: { roleId: id } })
      if (!exists) throw new NotFoundException('角色不存在')
      await ordinaryRole(tx, exists.id)
      await preventOwnRoleChange(tx, exists.id, actor)
      const updated = await tx.role.update({
        where: { id: exists.id },
        data: { name: input.name, description: input.description },
        select: {
          roleId: true,
          code: true,
          name: true,
          description: true,
          roleType: true,
          status: true,
        },
      })
      await audit(tx, actor, 'system.role.update', id, exists, updated)
      return updated
    }, serializable)
    return { code: API_CODE.SUCCESS, message: 'success', data: roleView(role) }
  }

  async grants(id: string, input: { permissionIds: string[]; reason: string; expiresAt?: string }, actor: Actor) {
    const expiresAt = grantInput(input.permissionIds, input.reason, input.expiresAt)
    await this.prisma.$transaction(async (tx) => {
      const actorId = await requireActor(tx, actor)
      const role = await tx.role.findUnique({ where: { roleId: id } })
      if (!role) throw new NotFoundException('角色不存在')
      if (role.status !== 'ACTIVE') throw new BadRequestException('只能为启用角色授权')
      await ordinaryRole(tx, role.id)
      await preventOwnRoleChange(tx, role.id, actor)
      const permissions = await tx.permission.findMany({
        where: { id: { in: input.permissionIds } },
        include: { roleTypes: { select: { roleType: true } } },
      })
      if (permissions.length !== input.permissionIds.length || permissions.some((permission) => !ordinaryPermission(permission)))
        throw new BadRequestException('权限无效、已禁用或需要高危审批')
      const before = await tx.rolePermission.findMany({ where: { roleId: role.id } })
      await tx.rolePermission.updateMany({
        where: { roleId: role.id, revokedAt: null, permissionId: { notIn: input.permissionIds } },
        data: { revokedAt: new Date(), revokedBy: actorId, revokeReason: input.reason },
      })
      for (const permissionId of input.permissionIds) {
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
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId } },
          create: { roleId: role.id, permissionId, ...data },
          update: data,
        })
      }
      const after = await tx.rolePermission.findMany({ where: { roleId: role.id } })
      await audit(tx, actor, 'system.role.grant', id, before, after, input.reason)
    }, serializable)
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  async status(id: string, input: { status: 'ACTIVE' | 'DISABLED'; reason: string }, actor: Actor) {
    requireReason(input.reason)
    if (!['ACTIVE', 'DISABLED'].includes(input.status)) throw new BadRequestException('角色状态无效')
    await this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const before = await tx.role.findUnique({ where: { roleId: id } })
      if (!before) throw new NotFoundException('角色不存在')
      const boundUserCount = await tx.userRole.count({
        where: {
          roleId: before.id,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      })
      // A role with no active users can be disabled directly. Roles that are
      // still in use and contain administrative permissions must go through
      // the controlled ROLE_STATUS approval flow.
      if (boundUserCount > 0) await ordinaryRole(tx, before.id)
      await preventOwnRoleChange(tx, before.id, actor)
      const after = await tx.role.update({
        where: { id: before.id },
        data: { status: input.status },
      })
      await audit(
        tx,
        actor,
        input.status === 'ACTIVE' ? 'system.role.enable' : 'system.role.disable',
        id,
        before,
        after,
        input.reason
      )
    }, serializable)
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  async enable(id: string, reason: string, actor: Actor) {
    return this.status(id, { status: 'ACTIVE', reason }, actor)
  }

  async disable(id: string, reason: string, actor: Actor) {
    return this.status(id, { status: 'DISABLED', reason }, actor)
  }

  async remove(id: string, actor: Actor) {
    await this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const role = await tx.role.findUnique({
        where: { roleId: id },
        include: {
          _count: {
            select: { users: true, permissions: true, dataScopes: true, elevatedDataScopes: true },
          },
        },
      })
      if (!role) throw new NotFoundException('角色不存在')
      await ordinaryRole(tx, role.id)
      await preventOwnRoleChange(tx, role.id, actor)
      if (Object.values(role._count).some((count) => count > 0)) throw new ConflictException('角色存在引用，请禁用而非删除')
      await tx.role.delete({ where: { id: role.id } })
      await audit(tx, actor, 'system.role.delete', id, role, null)
    }, serializable)
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }
}
