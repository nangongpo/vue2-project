import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PermissionStatus, type RiskLevel } from '#app/common/types/prisma-enums.js'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '#app/database/prisma.service.js'
import { ok } from '#app/modules/permission/policies/policy.js'
import { isBusinessDataResource } from '#app/modules/permission/policies/data-resource-policy.js'
import { ENABLEMENT_STATUS_LABELS } from '#app/common/constants/enum-labels.js'

type ResourceMutationContext = {
  user: { internalId: bigint; userId: string }
  traceId?: string
  method: string
  url: string
  ip?: string
  riskLevel?: RiskLevel
}

function validateCode(code: string) {
  const value = code?.trim()
  if (!value || !isBusinessDataResource(value)) throw new BadRequestException('数据范围资源必须是业务资源编码')
  return value
}

function validateName(name: string) {
  const value = name?.trim()
  if (!value || value.length > 128) throw new BadRequestException('资源名称无效')
  return value
}

function resourceView<T extends { status: PermissionStatus }>(resource: T) {
  const { status, ...view } = resource
  return {
    ...view,
    statusLabel: ENABLEMENT_STATUS_LABELS[status],
    isActive: status === PermissionStatus.ACTIVE,
  }
}

@Injectable()
export class DataResourceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(resource?: string, status?: PermissionStatus) {
    const resources = await this.prisma.dataResource.findMany({
      where: {
        ...(resource ? { code: resource } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ status: 'asc' }, { code: 'asc' }],
    })
    return ok(resources.filter((resource) => isBusinessDataResource(resource.code)).map(resourceView))
  }

  async create(input: { code: string; name: string; description?: string }, req: ResourceMutationContext) {
    const code = validateCode(input.code)
    const name = validateName(input.name)
    try {
      return await this.prisma.$transaction(async (tx) => {
        const resource = await tx.dataResource.create({
          data: { code, name, description: input.description?.trim() || null },
        })
        await this.audit(tx, req, 'create', code, null, resource)
        return ok(resourceView(resource))
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('资源编码已存在')
      throw error
    }
  }

  async update(id: string, input: { name: string; description?: string }, req: ResourceMutationContext) {
    const name = validateName(input.name)
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.dataResource.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('资源不存在')
      const resource = await tx.dataResource.update({
        where: { id },
        data: { name, description: input.description?.trim() || null },
      })
      await this.audit(tx, req, 'update', before.code, before, resource)
      return ok(resourceView(resource))
    })
  }

  async enable(id: string, req: ResourceMutationContext) {
    return this.changeStatus(id, PermissionStatus.ACTIVE, 'enable', req)
  }

  async disable(id: string, req: ResourceMutationContext) {
    return this.changeStatus(id, PermissionStatus.DISABLED, 'disable', req)
  }

  private async changeStatus(
    id: string,
    status: PermissionStatus,
    action: 'enable' | 'disable',
    req: ResourceMutationContext
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.dataResource.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('资源不存在')
      const resource = await tx.dataResource.update({ where: { id }, data: { status } })
      await this.audit(tx, req, action, before.code, before, resource)
      return ok(resourceView(resource))
    })
  }

  private async audit(
    tx: Prisma.TransactionClient,
    req: ResourceMutationContext,
    action: string,
    resource: string,
    before: unknown,
    after: unknown,
  ) {
    await tx.auditLog.create({
      data: {
        traceId: req.traceId || randomUUID(),
        actorId: req.user.internalId,
        action: `permission.data-resource.${action}`,
        riskLevel: req.riskLevel || 'L3',
        resource,
        method: req.method,
        path: req.url.split('?')[0],
        ip: req.ip,
        result: 'SUCCESS',
        statusCode: 200,
        detail: JSON.parse(JSON.stringify({ actorId: req.user.userId, before, after })),
      },
    })
  }
}
