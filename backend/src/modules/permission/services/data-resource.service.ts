import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PermissionStatus, Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../../database/prisma.service.js'
import { ok } from '../policies/policy.js'
import { isBusinessDataResource } from '../policies/data-resource-policy.js'

type ResourceMutationContext = {
  user: { internalId: bigint; userId: string }
  traceId?: string
  method: string
  url: string
  ip?: string
  riskLevel?: 'L0' | 'L1' | 'L2' | 'L3'
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

@Injectable()
export class DataResourceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: PermissionStatus) {
    const resources = await this.prisma.dataResource.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { code: 'asc' }],
    })
    return ok(resources.filter((resource) => isBusinessDataResource(resource.code)))
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
        return ok(resource)
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
      return ok(resource)
    })
  }

  async status(id: string, status: PermissionStatus, req: ResourceMutationContext) {
    if (!Object.values(PermissionStatus).includes(status)) throw new BadRequestException('资源状态无效')
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.dataResource.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('资源不存在')
      const resource = await tx.dataResource.update({ where: { id }, data: { status } })
      await this.audit(tx, req, 'status', before.code, before, resource)
      return ok(resource)
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
