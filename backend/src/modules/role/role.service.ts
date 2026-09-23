import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service.js'
import { API_CODE } from '../../common/api-code.js'

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const roles = await this.prisma.role.findMany({ orderBy: { createdAt: 'desc' }, select: { roleId: true, code: true, name: true, description: true, status: true, createdAt: true, permissions: { select: { permission: { select: { code: true, name: true, resource: true, action: true, type: true, method: true, path: true } } } }, _count: { select: { users: true } } } })
    return { code: API_CODE.SUCCESS, message: 'success', data: roles.map(role => ({
      roleId: role.roleId,
      code: role.code,
      name: role.name,
      description: role.description,
      status: role.status,
      createdAt: role.createdAt,
      userCount: role._count.users,
      permissions: role.permissions.map(item => ({
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
    })) }
  }

  async create(input: { code: string; name: string; description?: string; status?: 'ACTIVE' | 'DISABLED'; permissionIds?: string[] }) {
    try {
      const role = await this.prisma.role.create({ data: { code: input.code, name: input.name, description: input.description, status: input.status || 'ACTIVE', permissions: { create: (input.permissionIds || []).map(permissionId => ({ permission: { connect: { id: permissionId } } })) } }, select: { roleId: true, code: true, name: true, description: true, status: true } })
      return { code: API_CODE.SUCCESS, message: 'success', data: role }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('角色编码已存在')
      throw error
    }
  }

  async update(id: string, input: { code: string; name: string; description?: string; status?: 'ACTIVE' | 'DISABLED'; permissionIds?: string[] }) {
    const exists = await this.prisma.role.findUnique({ where: { roleId: id }, select: { id: true } })
    if (!exists) throw new NotFoundException('角色不存在')
    const role = await this.prisma.$transaction(async tx => {
      if (input.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: exists.id } })
        if (input.permissionIds.length) await tx.rolePermission.createMany({ data: input.permissionIds.map(permissionId => ({ roleId: exists.id, permissionId })) })
      }
      return tx.role.update({ where: { id: exists.id }, data: { code: input.code, name: input.name, description: input.description, ...(input.status ? { status: input.status } : {}) }, select: { roleId: true, code: true, name: true, description: true, status: true } })
    })
    return { code: API_CODE.SUCCESS, message: 'success', data: role }
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({ where: { roleId: id }, select: { id: true, code: true } })
    if (!role) throw new NotFoundException('角色不存在')
    if (role.code === 'system_admin') throw new ConflictException('系统管理员角色不可删除')
    await this.prisma.role.delete({ where: { id: role.id } })
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }
}
