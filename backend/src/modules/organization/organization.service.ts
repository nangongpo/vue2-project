import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { successResponse } from '#app/common/http/api-response.js'
import { PrismaService } from '#app/database/prisma.service.js'
import { audit, requireActor, requireReason, serializable, type Actor } from '#app/modules/role/domain/authorization.js'

type Status = 'ACTIVE' | 'DISABLED'

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async organizations(actor: Actor) {
    await this.assertTenant(actor)
    return successResponse(await this.prisma.organization.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: [{ code: 'asc' }],
    }))
  }

  async departments(actor: Actor) {
    await this.assertTenant(actor)
    return successResponse(await this.prisma.department.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: [{ organizationId: 'asc' }, { code: 'asc' }],
    }))
  }

  async createOrganization(input: { code: string; name: string; parentId?: string }, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      if (input.parentId) await this.organization(tx, input.parentId, actor.tenantId, true)
      const tenant = await tx.tenant.findUnique({ where: { id: actor.tenantId }, select: { status: true } })
      if (!tenant || tenant.status !== 'ACTIVE') throw new ForbiddenException('当前租户不可用')
      try {
        const created = await tx.organization.create({ data: { tenantId: actor.tenantId, code: input.code, name: input.name, parentId: input.parentId || null } })
        await audit(tx, actor, 'system.organization.create', created.id, null, created)
        return successResponse(created)
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') throw new ConflictException('组织编码已存在')
        throw error
      }
    }, serializable)
  }

  async updateOrganization(id: string, input: { name: string; parentId?: string | null }, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const before = await this.organization(tx, id, actor.tenantId, false)
      if (input.parentId) {
        const parent = await this.organization(tx, input.parentId, actor.tenantId, true)
        if (parent.id === id || await this.hasOrganizationDescendant(tx, id, parent.id, actor.tenantId)) throw new BadRequestException('组织层级不能形成环')
      }
      const after = await tx.organization.update({ where: { id }, data: { name: input.name, parentId: input.parentId ?? before.parentId } })
      await audit(tx, actor, 'system.organization.update', id, before, after)
      return successResponse(after)
    }, serializable)
  }

  async setOrganizationStatus(id: string, status: Status, reason: string, actor: Actor) {
    requireReason(reason)
    return this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const before = await this.organization(tx, id, actor.tenantId, false)
      if (before.status === status) throw new ConflictException('组织已经是目标状态')
      if (status === 'DISABLED') {
        const [children, departments, users, targets] = await Promise.all([
          tx.organization.count({ where: { tenantId: actor.tenantId, parentId: id, status: 'ACTIVE' } }),
          tx.department.count({ where: { tenantId: actor.tenantId, organizationId: id, status: 'ACTIVE' } }),
          tx.user.count({ where: { tenantId: actor.tenantId, organizationId: id, status: 'ACTIVE' } }),
          tx.roleElevatedDataScopeTarget.count({
            where: { targetOrganizationId: id, elevatedScope: { role: { tenantId: actor.tenantId } } },
          }),
        ])
        if (children || departments || users || targets) throw new ConflictException('组织仍存在有效子节点、用户或数据范围引用')
      }
      const after = await tx.organization.update({ where: { id }, data: { status } })
      await audit(tx, actor, 'system.organization.status', id, before, after, reason)
      return successResponse(null)
    }, serializable)
  }

  async createDepartment(input: { code: string; name: string; organizationId: string; parentId?: string }, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const organization = await this.organization(tx, input.organizationId, actor.tenantId, true)
      if (input.parentId) {
        const parent = await tx.department.findFirst({ where: { id: input.parentId, tenantId: actor.tenantId, organizationId: organization.id, status: 'ACTIVE' } })
        if (!parent) throw new BadRequestException('父部门不存在或不属于目标组织')
      }
      try {
        const created = await tx.department.create({ data: { tenantId: actor.tenantId, organizationId: organization.id, code: input.code, name: input.name, parentId: input.parentId || null } })
        await audit(tx, actor, 'system.department.create', created.id, null, created)
        return successResponse(created)
      } catch (error) {
        if ((error as { code?: string }).code === 'P2002') throw new ConflictException('部门编码已存在')
        throw error
      }
    }, serializable)
  }

  async updateDepartment(id: string, input: { name: string; parentId?: string | null; organizationId?: string }, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const before = await this.department(tx, id, actor.tenantId, false)
      const organizationId = input.organizationId || before.organizationId
      await this.organization(tx, organizationId, actor.tenantId, true)
      if (organizationId !== before.organizationId) {
        const [children, users] = await Promise.all([
          tx.department.count({ where: { tenantId: actor.tenantId, organizationId: before.organizationId, parentId: id } }),
          tx.user.count({ where: { tenantId: actor.tenantId, departmentId: id, status: 'ACTIVE' } }),
        ])
        if (children || users) throw new ConflictException('存在子部门或有效用户时不能跨组织移动部门')
      }
      if (input.parentId) {
        const parent = await tx.department.findFirst({ where: { id: input.parentId, tenantId: actor.tenantId, organizationId, status: 'ACTIVE' } })
        if (!parent || parent.id === id || await this.hasDepartmentDescendant(tx, id, parent.id, actor.tenantId, organizationId)) throw new BadRequestException('部门层级不能形成环')
      }
      const after = await tx.department.update({ where: { id }, data: { name: input.name, organizationId, parentId: input.parentId ?? before.parentId } })
      await audit(tx, actor, 'system.department.update', id, before, after)
      return successResponse(after)
    }, serializable)
  }

  async setDepartmentStatus(id: string, status: Status, reason: string, actor: Actor) {
    requireReason(reason)
    return this.prisma.$transaction(async (tx) => {
      await requireActor(tx, actor)
      const before = await this.department(tx, id, actor.tenantId, false)
      if (before.status === status) throw new ConflictException('部门已经是目标状态')
      if (status === 'DISABLED') {
        const [children, users, targets] = await Promise.all([
          tx.department.count({ where: { tenantId: actor.tenantId, organizationId: before.organizationId, parentId: id, status: 'ACTIVE' } }),
          tx.user.count({ where: { tenantId: actor.tenantId, departmentId: id, status: 'ACTIVE' } }),
          tx.roleElevatedDataScopeTarget.count({
            where: { targetDepartmentId: id, elevatedScope: { role: { tenantId: actor.tenantId } } },
          }),
        ])
        if (children || users || targets) throw new ConflictException('部门仍存在有效子节点、用户或数据范围引用')
      }
      const after = await tx.department.update({ where: { id }, data: { status } })
      await audit(tx, actor, 'system.department.status', id, before, after, reason)
      return successResponse(null)
    }, serializable)
  }

  private async assertTenant(actor: Actor) {
    if (!actor?.tenantId) throw new ForbiddenException('未确定有效租户')
    const tenant = await this.prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { status: true } })
    if (!tenant || tenant.status !== 'ACTIVE') throw new ForbiddenException('当前租户不可用')
  }

  private async organization(db: Prisma.TransactionClient, id: string, tenantId: string, active: boolean) {
    const item = await db.organization.findFirst({ where: { id, tenantId, ...(active ? { status: 'ACTIVE' as const } : {}) } })
    if (!item) throw new NotFoundException('组织不存在或不属于当前租户')
    return item
  }

  private async department(db: Prisma.TransactionClient, id: string, tenantId: string, active: boolean) {
    const item = await db.department.findFirst({ where: { id, tenantId, ...(active ? { status: 'ACTIVE' as const } : {}) } })
    if (!item) throw new NotFoundException('部门不存在或不属于当前租户')
    return item
  }

  private async hasOrganizationDescendant(db: Prisma.TransactionClient, rootId: string, candidateId: string, tenantId: string) {
    const visited = new Set([rootId])
    let frontier = [rootId]
    while (frontier.length) {
      const children = await db.organization.findMany({ where: { tenantId, parentId: { in: frontier } }, select: { id: true } })
      frontier = children.map((child) => child.id)
      for (const child of frontier) {
        if (child === candidateId || visited.has(child)) return true
        visited.add(child)
      }
      if (visited.size > 10_000) throw new BadRequestException('组织树规模超过安全限制')
    }
    return false
  }

  private async hasDepartmentDescendant(db: Prisma.TransactionClient, rootId: string, candidateId: string, tenantId: string, organizationId: string) {
    const visited = new Set([rootId])
    let frontier = [rootId]
    while (frontier.length) {
      const children = await db.department.findMany({ where: { tenantId, organizationId, parentId: { in: frontier } }, select: { id: true } })
      frontier = children.map((child) => child.id)
      for (const child of frontier) {
        if (child === candidateId || visited.has(child)) return true
        visited.add(child)
      }
      if (visited.size > 10_000) throw new BadRequestException('部门树规模超过安全限制')
    }
    return false
  }
}
