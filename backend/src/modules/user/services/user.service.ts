import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, UserStatus } from '@prisma/client'
import { PrismaService } from '../../../database/prisma.service.js'
import { PasswordService } from '../../../security/services/password.service.js'
import { PasswordPolicyService } from '../../../security/services/password-policy.service.js'
import { API_CODE } from '../../../common/constants/api-code.js'
import { normalizePagination, paginationData } from '../../../common/pagination.js'
import {
  activeGrant,
  audit,
  grantInput,
  ordinaryRole,
  rejectFields,
  requireActor,
  requireReason,
  serializable,
} from '../../role/domain/authorization.js'
import type { Actor } from '../../role/domain/authorization.js'

const userSelect = {
  userId: true,
  username: true,
  displayName: true,
  status: true,
  failedLogins: true,
  lockedUntil: true,
} as const

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService) {}

  async page(query: { keyword?: string; status?: UserStatus; page?: number; pageSize?: number }) {
    const pagination = normalizePagination(query)
    const { page, pageSize } = pagination
    const where: Prisma.UserWhereInput = {
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
          lastLoginAt: true,
          createdAt: true,
          roles: {
            where: { ...activeGrant(), role: { status: 'ACTIVE' } },
            select: { role: { select: { roleId: true, code: true, name: true } } },
          },
        },
      }),
    ])
    const pageItems = items.map((item) => ({
      ...item,
      roles: item.roles.map(({ role }) => ({
        role: { roleId: role.roleId, code: role.code, name: role.name },
      })),
    }))
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: paginationData(pageItems, total, pagination),
    }
  }

  async create(input: { username: string; password: string; displayName: string }, actor: Actor) {
    rejectFields(input, ['roleIds', 'status', 'roleType', 'permissionIds'])
    try {
      const passwordHash = await this.passwords.hash(input.password)
      const user = await this.prisma.$transaction(async (tx) => {
        await requireActor(tx, actor)
        const created = await tx.user.create({
          data: { username: input.username, passwordHash, displayName: input.displayName },
          select: userSelect,
        })
        await audit(tx, actor, 'system.user.create', created.userId, null, created)
        return created
      }, serializable)
      return { code: API_CODE.SUCCESS, message: 'success', data: user }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('用户名已存在')
      throw error
    }
  }

  async update(id: string, input: { displayName?: string }, actor: Actor) {
    rejectFields(input, ['roleIds', 'status', 'roleType', 'permissionIds'])
    const user = await this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const before = await tx.user.findUnique({ where: { userId: id }, select: userSelect })
      if (!before) throw new NotFoundException('用户不存在')
      const after = await tx.user.update({
        where: { userId: id },
        data: { displayName: input.displayName },
        select: userSelect,
      })
      await audit(tx, actor, 'system.user.update', id, before, after)
      return after
    }, serializable)
    return { code: API_CODE.SUCCESS, message: 'success', data: user }
  }

  async resetPassword(id: string, password: string, actor: Actor) {
    await this.prisma.$transaction(
      async (tx) => {
        await requireActor(tx, actor)
        const user = await tx.user.findUnique({
          where: { userId: id },
          select: { id: true, passwordHash: true, passwordChangedAt: true, ...userSelect },
        })
        if (!user) throw new NotFoundException('用户不存在')
        if (user.id === actor.internalId) throw new ForbiddenException('请通过本人密码修改接口操作')
        await this.protectAdministrator(tx, user.id)
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

  async roles(id: string, input: { roleIds: string[]; reason: string; expiresAt?: string }, actor: Actor) {
    const expiresAt = grantInput(input.roleIds, input.reason, input.expiresAt)
    await this.prisma.$transaction(async (tx) => {
      const actorId = await requireActor(tx, actor)
      const user = await tx.user.findUnique({
        where: { userId: id },
        select: { id: true, status: true, expiresAt: true },
      })
      if (!user) throw new NotFoundException('用户不存在')
      if (user.id === actor.internalId) throw new ForbiddenException('不能修改自身有效角色或权限')
      if (user.status !== 'ACTIVE' || (user.expiresAt && user.expiresAt <= new Date()))
        throw new BadRequestException('只能向有效账户分配角色')
      const roles = await tx.role.findMany({
        where: { roleId: { in: input.roleIds }, status: 'ACTIVE' },
      })
      if (roles.length !== input.roleIds.length) throw new BadRequestException('角色无效或已禁用')
      const adminTypes = new Set(roles.filter((role) => role.roleType !== 'BUSINESS').map((role) => role.roleType))
      if (adminTypes.size > 1) throw new ForbiddenException('系统、安全、审计管理员职责互斥')
      const before = await tx.userRole.findMany({ where: { userId: user.id } })
      // Existing administrative bindings also require approval to revoke or renew.
      for (const binding of before.filter((binding) => binding.revokedAt === null)) await ordinaryRole(tx, binding.roleId)
      for (const role of roles) await ordinaryRole(tx, role.id)
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

  async status(id: string, input: { status: 'ACTIVE' | 'DISABLED'; reason: string }, actor: Actor) {
    if (!['ACTIVE', 'DISABLED'].includes(input.status)) throw new BadRequestException('用户状态无效')
    return this.changeStatus(id, input, actor, false)
  }

  async unlock(id: string, reason: string, actor: Actor) {
    return this.changeStatus(id, { status: 'ACTIVE', reason }, actor, true)
  }

  private async changeStatus(id: string, input: { status: 'ACTIVE' | 'DISABLED'; reason: string }, actor: Actor, unlock: boolean) {
    requireReason(input.reason)
    await this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const before = await tx.user.findUnique({
        where: { userId: id },
        select: { id: true, ...userSelect },
      })
      if (!before) throw new NotFoundException('用户不存在')
      if (before.id === actor.internalId) throw new ForbiddenException('不能修改自身账户状态')
      await this.protectAdministrator(tx, before.id)
      if (unlock && before.status !== 'LOCKED') throw new BadRequestException('只能解锁已锁定账户')
      if (!unlock && input.status === 'ACTIVE' && before.status === 'LOCKED') throw new BadRequestException('锁定账户必须使用解锁接口')
      const after = await tx.user.update({
        where: { id: before.id },
        data: { status: input.status, ...(unlock ? { failedLogins: 0, lockedUntil: null } : {}) },
        select: userSelect,
      })
      await tx.session.updateMany({
        where: { userId: before.id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      await audit(tx, actor, unlock ? 'system.user.unlock' : 'system.user.disable', id, before, after, input.reason)
    }, serializable)
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  private async protectAdministrator(tx: Prisma.TransactionClient, userId: bigint) {
    const bindings = await tx.userRole.findMany({ where: { userId, revokedAt: null } })
    for (const binding of bindings) await ordinaryRole(tx, binding.roleId)
  }
}
