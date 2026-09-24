import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PermissionStatus, RoleType } from '@prisma/client'
import { PrismaService } from '../../../database/prisma.service.js'
import { API_CODE } from '../../../common/constants/api-code.js'
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

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        roleId: true,
        code: true,
        name: true,
        description: true,
        roleType: true,
        status: true,
        createdAt: true,
        permissions: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            permission: { status: PermissionStatus.ACTIVE },
          },
          select: {
            permission: {
              select: {
                id: true,
                code: true,
                name: true,
                resource: true,
                action: true,
                type: true,
                method: true,
                path: true,
                status: true,
              },
            },
          },
        },
        _count: { select: { users: true } },
      },
    })
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: roles.map((role) => ({
        roleId: role.roleId,
        code: role.code,
        name: role.name,
        description: role.description,
        roleType: role.roleType,
        status: role.status,
        createdAt: role.createdAt,
        userCount: role._count.users,
        permissionIds: role.permissions.filter((item) => item.permission.code !== '*').map((item) => item.permission.id),
        permissions: role.permissions.map((item) => ({
          permission: {
            code: item.permission.code,
            name: item.permission.name,
            resource: item.permission.resource,
            action: item.permission.action,
            type: item.permission.type,
            method: item.permission.method,
            path: item.permission.path,
          },
        })),
      })),
    }
  }

  async permissionOptions() {
    const items = await this.prisma.permission.findMany({
      where: { status: PermissionStatus.ACTIVE, requiredRoleType: RoleType.BUSINESS },
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        resource: true,
        requiredRoleType: true,
        type: true,
        status: true,
        method: true,
        path: true,
      },
    })
    return { code: API_CODE.SUCCESS, message: 'success', data: items.filter(ordinaryPermission) }
  }

  async create(input: { code: string; name: string; description?: string }, actor: Actor) {
    rejectFields(input, ['roleType', 'permissionIds', 'status'])
    try {
      const role = await this.prisma.$transaction(async (tx) => {
        await requireActor(tx, actor)
        const created = await tx.role.create({
          data: {
            code: input.code,
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
      return { code: API_CODE.SUCCESS, message: 'success', data: role }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('角色编码已存在')
      throw error
    }
  }

  async update(id: string, input: { code: string; name: string; description?: string }, actor: Actor) {
    rejectFields(input, ['roleType', 'permissionIds', 'status'])
    const role = await this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const exists = await tx.role.findUnique({ where: { roleId: id } })
      if (!exists) throw new NotFoundException('角色不存在')
      await ordinaryRole(tx, exists.id)
      await preventOwnRoleChange(tx, exists.id, actor)
      const updated = await tx.role.update({
        where: { id: exists.id },
        data: { code: input.code, name: input.name, description: input.description },
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
    return { code: API_CODE.SUCCESS, message: 'success', data: role }
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
      await ordinaryRole(tx, before.id)
      await preventOwnRoleChange(tx, before.id, actor)
      const after = await tx.role.update({
        where: { id: before.id },
        data: { status: input.status },
      })
      await audit(tx, actor, 'system.role.disable', id, before, after, input.reason)
    }, serializable)
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
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
