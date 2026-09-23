import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, UserStatus } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service.js'
import { PasswordService } from '../../security/password.service.js'
import { API_CODE } from '../../common/api-code.js'

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService) {}

  async page(query: { keyword?: string; status?: UserStatus; page?: number; pageSize?: number }) {
    const page = query.page || 1
    const pageSize = query.pageSize || 20
    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword ? { OR: [{ username: { contains: query.keyword } }, { displayName: { contains: query.keyword } }] } : {}),
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: { userId: true, username: true, displayName: true, status: true, failedLogins: true, lastLoginAt: true, createdAt: true, roles: { select: { role: { select: { roleId: true, code: true, name: true } } } } },
      }),
    ])
    return { code: API_CODE.SUCCESS, message: 'success', data: { items: items.map(item => ({ ...item, roles: item.roles.map(({ role }) => ({ role: { roleId: role.roleId, code: role.code, name: role.name } })) })), total, page, pageSize } }
  }

  async create(input: { username: string; password: string; displayName: string; roleIds?: string[] }) {
    try {
      const roleIds = await this.resolveRoleIds(input.roleIds || [])
      const user = await this.prisma.user.create({
        data: { username: input.username, passwordHash: await this.passwords.hash(input.password), displayName: input.displayName, roles: { create: roleIds.map(roleId => ({ role: { connect: { id: roleId } } })) } },
        select: { userId: true, username: true, displayName: true, status: true },
      })
      return { code: API_CODE.SUCCESS, message: 'success', data: user }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('用户名已存在')
      throw error
    }
  }

  async update(id: string, input: { displayName?: string; status?: UserStatus; roleIds?: string[] }) {
    const exists = await this.prisma.user.findUnique({ where: { userId: id }, select: { id: true } })
    if (!exists) throw new NotFoundException('用户不存在')
    const roleIds = input.roleIds ? await this.resolveRoleIds(input.roleIds) : undefined
    const user = await this.prisma.$transaction(async tx => {
      if (input.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: exists.id } })
        if (roleIds?.length) await tx.userRole.createMany({ data: roleIds.map(roleId => ({ userId: exists.id, roleId })) })
      }
      return tx.user.update({ where: { id: exists.id }, data: { ...(input.displayName ? { displayName: input.displayName } : {}), ...(input.status ? { status: input.status } : {}) }, select: { userId: true, username: true, displayName: true, status: true } })
    })
    return { code: API_CODE.SUCCESS, message: 'success', data: user }
  }

  async resetPassword(id: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { userId: id }, select: { id: true } })
    if (!user) throw new NotFoundException('用户不存在')
    const result = await this.prisma.user.updateMany({ where: { id: user.id }, data: { passwordHash: await this.passwords.hash(password), failedLogins: 0, lockedUntil: null } })
    if (!result.count) throw new NotFoundException('用户不存在')
    await this.prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  private async resolveRoleIds(publicIds: string[]) {
    const uniqueIds = [...new Set(publicIds)]
    if (!uniqueIds.length) return []
    const roles = await this.prisma.role.findMany({ where: { roleId: { in: uniqueIds }, status: 'ACTIVE' }, select: { id: true } })
    if (roles.length !== uniqueIds.length) throw new BadRequestException('角色标识无效')
    return roles.map(role => role.id)
  }
}
